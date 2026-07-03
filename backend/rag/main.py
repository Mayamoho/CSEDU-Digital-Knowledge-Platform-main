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
    conversation_history: Optional[List[Dict[str, str]]] = None  # For context-aware responses
    intent: Optional[str] = None  # search, question, compare, summarize


class QueryResponse(BaseModel):
    response: str
    citations: List[Dict[str, str]]
    source_doc_ids: List[str]
    model_used: str
    detected_language: Optional[str] = None
    query_rewritten: bool = False
    suggested_questions: List[str] = []  # Follow-up questions
    intent_detected: Optional[str] = None
    confidence_score: Optional[float] = None


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
    Main RAG query endpoint with enhanced interactivity
    
    Features:
    1. Intent detection (search, question, compare, summarize)
    2. Context-aware multi-turn conversations
    3. Suggested follow-up questions
    4. Confidence scoring
    5. Optional query rewriting
    6. Language detection and bilingual support
    7. Hybrid retrieval (vector + FTS)
    8. Access control by role
    """
    try:
        logger.info(f"Received query: '{request.query}' (role: {request.user_role})")
        
        # Detect intent
        detected_intent = _detect_intent(request.query)
        
        # Detect language if auto
        detected_lang = request.language
        query_rewritten = False
        original_query = request.query
        
        if request.language == "auto":
            try:
                detected_lang = detect(request.query)
                if detected_lang not in ["en", "bn"]:
                    detected_lang = "en"
                logger.info(f"Detected language: {detected_lang}")
            except LangDetectException:
                detected_lang = "en"
        
        # Build conversation context if history provided
        conversation_context = ""
        if request.conversation_history:
            conversation_context = _build_conversation_context(request.conversation_history)
        
        # Optional query rewriting
        query_to_use = request.query
        if request.rewrite_query:
            query_to_use = await llm_client.rewrite_query(request.query, detected_lang)
            query_rewritten = (query_to_use != request.query)
        
        # Retrieve relevant chunks
        context_chunks = retriever.retrieve(
            query=query_to_use,
            user_role=request.user_role,
            language=detected_lang,
            intent=detected_intent
        )
        
        if not context_chunks:
            # No relevant documents found
            no_results_msg = {
                "en": "I couldn't find relevant information in the platform's documents. Please try rephrasing your question or contact the library staff for assistance.",
                "bn": "আমি প্ল্যাটফর্মের নথিতে প্রাসঙ্গিক তথ্য খুঁজে পাইনি। অনুগ্রহ করে আপনার প্রশ্নটি পুনরায় লিখুন বা সহায়তার জন্য লাইব্রেরি কর্মীদের সাথে যোগাযোগ করুন।"
            }
            
            suggestions = _generate_example_questions(detected_lang)
            
            return QueryResponse(
                response=no_results_msg.get(detected_lang, no_results_msg["en"]),
                citations=[],
                source_doc_ids=[],
                model_used="none",
                detected_language=detected_lang,
                query_rewritten=query_rewritten,
                suggested_questions=suggestions,
                intent_detected=detected_intent,
                confidence_score=0.0
            )
        
        logger.info(f"Retrieved {len(context_chunks)} relevant chunks")
        
        # Calculate confidence score based on retrieval quality
        confidence = _calculate_confidence(context_chunks)
        
        # Determine model tier based on query complexity
        model_tier = _determine_model_tier(request.query, context_chunks)
        
        # Generate response with conversation context
        result = await llm_client.generate_response(
            query=original_query,
            context_chunks=context_chunks,
            language=detected_lang,
            model_tier=model_tier,
            conversation_context=conversation_context,
            intent=detected_intent
        )
        
        # Generate suggested follow-up questions
        suggestions = _generate_follow_up_questions(
            query=original_query,
            response=result["response"],
            context_chunks=context_chunks,
            language=detected_lang
        )
        
        return QueryResponse(
            response=result["response"],
            citations=result["citations"],
            source_doc_ids=result["source_doc_ids"],
            model_used=result["model_used"],
            detected_language=detected_lang,
            query_rewritten=query_rewritten,
            suggested_questions=suggestions,
            intent_detected=detected_intent,
            confidence_score=confidence
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

def _detect_intent(query: str) -> str:
    """
    Detect user intent from query
    
    Intents:
    - search: Looking for specific documents/resources
    - question: Asking for explanation
    - compare: Comparing multiple items
    - summarize: Requesting summary
    - availability: Checking book/resource availability
    """
    query_lower = query.lower()
    
    # Keywords for each intent
    search_keywords = ["find", "search", "show me", "list", "where is", "খুঁজুন", "দেখান"]
    question_keywords = ["what", "why", "how", "explain", "কি", "কেন", "কিভাবে"]
    compare_keywords = ["compare", "difference", "versus", "vs", "better", "তুলনা"]
    summarize_keywords = ["summarize", "summary", "overview", "brief", "সংক্ষেপ"]
    availability_keywords = ["available", "borrow", "checkout", "in stock", "উপলব্ধ"]
    
    if any(kw in query_lower for kw in availability_keywords):
        return "availability"
    if any(kw in query_lower for kw in compare_keywords):
        return "compare"
    if any(kw in query_lower for kw in summarize_keywords):
        return "summarize"
    if any(kw in query_lower for kw in search_keywords):
        return "search"
    if any(kw in query_lower for kw in question_keywords):
        return "question"
    
    return "question"  # Default


def _build_conversation_context(history: List[Dict[str, str]]) -> str:
    """Build conversation context from history"""
    if not history:
        return ""
    
    # Take last 3 exchanges to avoid context overflow
    recent = history[-6:]  # 3 Q&A pairs
    context_lines = []
    
    for msg in recent:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            context_lines.append(f"Previous Question: {content}")
        else:
            context_lines.append(f"Previous Answer: {content}")
    
    return "\n".join(context_lines)


def _calculate_confidence(context_chunks: List[Dict]) -> float:
    """
    Calculate confidence score based on retrieval quality
    
    Factors:
    - RRF scores of top results
    - Number of sources
    - Similarity scores
    """
    if not context_chunks:
        return 0.0
    
    # Average RRF score of top 3 results
    top_scores = [chunk.get('rrf_score', 0) for chunk in context_chunks[:3]]
    avg_score = sum(top_scores) / len(top_scores) if top_scores else 0
    
    # Normalize to 0-1 range (RRF scores typically 0-0.5)
    confidence = min(avg_score * 2, 1.0)
    
    return round(confidence, 2)


def _generate_follow_up_questions(
    query: str,
    response: str,
    context_chunks: List[Dict],
    language: str
) -> List[str]:
    """Generate relevant follow-up questions"""
    suggestions = []
    
    # Extract topics from context
    titles = [chunk["title"] for chunk in context_chunks[:3]]
    item_types = set(chunk["item_type"] for chunk in context_chunks)
    
    if language == "bn":
        templates = [
            f"{titles[0] if titles else 'এই নথি'} সম্পর্কে আরও বিস্তারিত বলুন",
            "এই বিষয়ে আরও কী কী গবেষণা পত্র আছে?",
            "এই লেখকের অন্যান্য কাজ দেখান"
        ]
    else:
        templates = [
            f"Tell me more about {titles[0] if titles else 'this document'}",
            "What other research papers are available on this topic?",
            "Show me related student projects"
        ]
    
    # Add type-specific suggestions
    if "research" in item_types:
        if language == "bn":
            suggestions.append("এই গবেষণার মূল অবদান কী?")
        else:
            suggestions.append("What are the key contributions of this research?")
    
    if "project" in item_types:
        if language == "bn":
            suggestions.append("এই প্রজেক্টে কোন প্রযুক্তি ব্যবহার করা হয়েছে?")
        else:
            suggestions.append("What technologies were used in this project?")
    
    suggestions.extend(templates[:3])
    return suggestions[:4]  # Return max 4 suggestions


def _generate_example_questions(language: str) -> List[str]:
    """Generate example questions when no results found"""
    if language == "bn":
        return [
            "মেশিন লার্নিং সম্পর্কে গবেষণা পত্র খুঁজুন",
            "ডাটাবেস ম্যানেজমেন্ট সিস্টেম কি?",
            "শিক্ষার্থী প্রজেক্ট দেখান",
            "কম্পিউটার নেটওয়ার্ক বই উপলব্ধ আছে?"
        ]
    else:
        return [
            "Find research papers on machine learning",
            "What is a database management system?",
            "Show me student projects",
            "Are there books available on computer networks?"
        ]


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
