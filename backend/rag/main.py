from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import logging
from langdetect import detect, LangDetectException

from config import settings
from retriever import retriever
from llm_client import llm_client
from embedder import embedder

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="CSEDU RAG Service",
    description="Retrieval-Augmented Generation service for CSEDU Digital Knowledge Platform",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Request/Response Models
# ============================================================================

class QueryRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=5000)
    user_role: str = Field(default="public")
    language: str = Field(default="auto", pattern="^(en|bn|auto)$")
    session_id: Optional[str] = None
    rewrite_query: bool = Field(default=False)


class QueryResponse(BaseModel):
    response: str
    citations: List[Dict[str, str]]
    source_doc_ids: List[str]
    model_used: str
    detected_language: Optional[str] = None
    query_rewritten: bool = False


class EmbedRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)


class EmbedResponse(BaseModel):
    embedding: List[float]
    dimension: int


class HealthResponse(BaseModel):
    status: str
    embedding_model: str
    embedding_dimension: int


# ============================================================================
# Endpoints
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "embedding_model": settings.embedding_model,
        "embedding_dimension": settings.embedding_dimension
    }


@app.post("/query", response_model=QueryResponse)
async def query_rag(request: QueryRequest):
    """
    Main RAG query endpoint
    
    Performs:
    1. Optional query rewriting
    2. Language detection
    3. Hybrid retrieval (vector + FTS)
    4. LLM response generation with citations
    """
    try:
        logger.info(f"Received query: '{request.query}' (role: {request.user_role})")
        
        # Detect language if auto
        detected_lang = request.language
        query_rewritten = False
        original_query = request.query
        
        if request.language == "auto":
            try:
                detected_lang = detect(request.query)
                if detected_lang not in ["en", "bn"]:
                    detected_lang = "en"  # Default to English
                logger.info(f"Detected language: {detected_lang}")
            except LangDetectException:
                detected_lang = "en"
        
        # Optional query rewriting
        query_to_use = request.query
        if request.rewrite_query:
            query_to_use = await llm_client.rewrite_query(request.query, detected_lang)
            query_rewritten = (query_to_use != request.query)
        
        # Retrieve relevant chunks
        context_chunks = retriever.retrieve(
            query=query_to_use,
            user_role=request.user_role,
            language=detected_lang
        )
        
        if not context_chunks:
            # No relevant documents found
            no_results_msg = {
                "en": "I couldn't find relevant information in the platform's documents. Please try rephrasing your question or contact the library staff for assistance.",
                "bn": "আমি প্ল্যাটফর্মের নথিতে প্রাসঙ্গিক তথ্য খুঁজে পাইনি। অনুগ্রহ করে আপনার প্রশ্নটি পুনরায় লিখুন বা সহায়তার জন্য লাইব্রেরি কর্মীদের সাথে যোগাযোগ করুন।"
            }
            return QueryResponse(
                response=no_results_msg.get(detected_lang, no_results_msg["en"]),
                citations=[],
                source_doc_ids=[],
                model_used="none",
                detected_language=detected_lang,
                query_rewritten=query_rewritten
            )
        
        logger.info(f"Retrieved {len(context_chunks)} relevant chunks")
        
        # Determine model tier based on query complexity
        model_tier = _determine_model_tier(request.query, context_chunks)
        
        # Generate response
        result = await llm_client.generate_response(
            query=original_query,  # Use original query for response
            context_chunks=context_chunks,
            language=detected_lang,
            model_tier=model_tier
        )
        
        return QueryResponse(
            response=result["response"],
            citations=result["citations"],
            source_doc_ids=result["source_doc_ids"],
            model_used=result["model_used"],
            detected_language=detected_lang,
            query_rewritten=query_rewritten
        )
        
    except Exception as e:
        logger.error(f"Query processing error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query processing failed: {str(e)}")


@app.post("/embed", response_model=EmbedResponse)
async def embed_text(request: EmbedRequest):
    """
    Generate embedding for text
    Used by ingestion worker
    """
    try:
        embedding = embedder.embed_text(request.text)
        return EmbedResponse(
            embedding=embedding,
            dimension=len(embedding)
        )
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")


@app.post("/embed-batch")
async def embed_batch(texts: List[str]):
    """
    Generate embeddings for multiple texts
    Used by ingestion worker for batch processing
    """
    try:
        if len(texts) > 100:
            raise HTTPException(status_code=400, detail="Maximum 100 texts per batch")
        
        embeddings = embedder.embed_batch(texts)
        return {
            "embeddings": embeddings,
            "count": len(embeddings),
            "dimension": settings.embedding_dimension
        }
    except Exception as e:
        logger.error(f"Batch embedding error: {e}")
        raise HTTPException(status_code=500, detail=f"Batch embedding failed: {str(e)}")


# ============================================================================
# Helper Functions
# ============================================================================

def _determine_model_tier(query: str, context_chunks: List[Dict]) -> str:
    """
    Determine which Groq model tier to use based on query complexity
    
    - simple (8B): Short queries, catalog lookups, availability checks
    - long (17B): Multi-document synthesis, longer context
    - complex (120B): Research questions, complex reasoning
    """
    query_length = len(query.split())
    context_length = sum(len(chunk["chunk_text"].split()) for chunk in context_chunks)
    
    # Simple queries
    if query_length < 10 and context_length < 500:
        return "simple"
    
    # Long context
    if context_length > 1000:
        return "long"
    
    # Complex reasoning indicators
    complex_keywords = ["why", "how", "explain", "compare", "analyze", "evaluate", "কেন", "কিভাবে"]
    if any(keyword in query.lower() for keyword in complex_keywords):
        return "complex"
    
    return "simple"


# ============================================================================
# Startup Event
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("RAG Service starting up...")
    logger.info(f"Embedding model: {settings.embedding_model}")
    logger.info(f"Embedding dimension: {settings.embedding_dimension}")
    logger.info(f"Groq API configured: {bool(settings.groq_api_key)}")
    logger.info(f"Gemini API configured: {bool(settings.gemini_api_key)}")
    logger.info("RAG Service ready!")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, workers=2)
