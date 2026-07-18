import json
import time

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
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

class HistoryTurn(BaseModel):
    query: str
    response: str


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=5000)
    user_role: str = Field(default="public")
    language: str = Field(default="auto", pattern="^(en|bn|auto)$")
    session_id: Optional[str] = None
    rewrite_query: bool = Field(default=False)
    # FR-AI-008: up to 10 previous exchanges for multi-turn context
    history: List[HistoryTurn] = Field(default_factory=list, max_length=10)


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

# Prometheus metrics (SDD §6.5) — scraped at /metrics
RAG_QUERIES = Counter(
    "rag_queries_total", "RAG queries by detected language and model used",
    ["language", "model"])
RAG_LATENCY = Histogram(
    "rag_query_duration_seconds", "End-to-end RAG query latency",
    buckets=[0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30])


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


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
    _t0 = time.monotonic()
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
            model_tier=model_tier,
            history=[t.model_dump() for t in request.history],
        )
        
        RAG_QUERIES.labels(language=detected_lang, model=result["model_used"]).inc()
        RAG_LATENCY.observe(time.monotonic() - _t0)

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


@app.post("/query/stream")
async def query_rag_stream(request: QueryRequest):
    """Server-Sent Events variant of /query.

    Emits: `meta` (citations + source ids + language + model) once, then a run
    of `token` events (answer text deltas), then a terminal `done` event."""
    detected_lang = request.language
    query_rewritten = False
    original_query = request.query

    if request.language == "auto":
        try:
            detected_lang = detect(request.query)
            if detected_lang not in ["en", "bn"]:
                detected_lang = "en"
        except LangDetectException:
            detected_lang = "en"

    query_to_use = request.query
    if request.rewrite_query:
        query_to_use = await llm_client.rewrite_query(request.query, detected_lang)
        query_rewritten = query_to_use != request.query

    context_chunks = retriever.retrieve(
        query=query_to_use, user_role=request.user_role, language=detected_lang
    )

    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def gen():
        if not context_chunks:
            no_results = {
                "en": "I couldn't find relevant information in the platform's documents. Please try rephrasing your question or contact the library staff for assistance.",
                "bn": "আমি প্ল্যাটফর্মের নথিতে প্রাসঙ্গিক তথ্য খুঁজে পাইনি। অনুগ্রহ করে আপনার প্রশ্নটি পুনরায় লিখুন বা সহায়তার জন্য লাইব্রেরি কর্মীদের সাথে যোগাযোগ করুন।",
            }
            yield sse("meta", {
                "citations": [],
                "source_doc_ids": [],
                "detected_language": detected_lang,
                "model_used": "none",
                "query_rewritten": query_rewritten,
            })
            yield sse("token", {"text": no_results.get(detected_lang, no_results["en"])})
            yield sse("done", {})
            return

        model_tier = _determine_model_tier(request.query, context_chunks)
        citations = llm_client._extract_citations(context_chunks)
        source_doc_ids = [str(c["item_id"]) for c in context_chunks]
        yield sse("meta", {
            "citations": citations,
            "source_doc_ids": source_doc_ids,
            "detected_language": detected_lang,
            "model_used": f"groq/{llm_client._select_model(model_tier)}",
            "query_rewritten": query_rewritten,
        })
        try:
            async for delta in llm_client.stream_response(
                query=original_query,
                context_chunks=context_chunks,
                language=detected_lang,
                model_tier=model_tier,
                history=[t.model_dump() for t in request.history],
            ):
                yield sse("token", {"text": delta})
        except Exception as e:  # noqa: BLE001
            logger.error(f"Streaming generation error: {e}", exc_info=True)
            yield sse("token", {"text": " [stream interrupted]"})
        RAG_QUERIES.labels(language=detected_lang, model="stream").inc()
        yield sse("done", {})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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


@app.post("/ingest/{item_id}")
async def ingest_item(item_id: str):
    """Force-(re)index a single media item now, instead of waiting for the sweep."""
    import psycopg
    from index_all import CONN_STR, get_minio_client
    from ingest_worker import index_by_ids

    try:
        conn = psycopg.connect(CONN_STR)
        try:
            indexed = index_by_ids(conn, get_minio_client(), [item_id])
        finally:
            conn.close()
        if not indexed:
            raise HTTPException(status_code=404, detail="item not found or produced no text")
        return {"item_id": item_id, "indexed": indexed}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ingest error for {item_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Ingest failed: {str(e)}")


@app.get("/index-status")
async def index_status():
    """How much of the published corpus the assistant can actually see."""
    from database import db

    try:
        row = db.execute_one(
            """
            SELECT
              (SELECT COUNT(*) FROM media_items WHERE status = 'published')  AS published_items,
              (SELECT COUNT(DISTINCT ve.item_id)
                 FROM vector_embeddings ve
                 JOIN media_items mi ON mi.item_id = ve.item_id
                WHERE mi.status = 'published')                               AS indexed_published_items,
              (SELECT COUNT(*) FROM vector_embeddings)                       AS total_chunks,
              (SELECT MAX(indexed_at) FROM rag_index_state)                  AS last_indexed_at
            """
        )
        return {k: (str(v) if k == "last_indexed_at" and v else v) for k, v in row.items()}
    except Exception as e:
        logger.error(f"Index status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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

    # Ingestion runs in-process because it needs the embedder that is already
    # loaded here. It drains the Redis upload queue and reconciles the index on a
    # timer, so newly uploaded resources become answerable without a manual reindex.
    try:
        from ingest_worker import start_background_worker

        start_background_worker()
    except Exception as e:  # noqa: BLE001
        logger.error(f"Could not start ingest worker: {e}")

    logger.info("RAG Service ready!")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, workers=2)
