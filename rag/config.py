from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    db_host: str = "postgres"
    db_port: int = 5432
    db_user: str = "csedu_user"
    db_password: str = "changeme_in_dev"
    db_name: str = "csedu_platform"

    # Redis
    redis_url: str = "redis://redis:6379"

    # Groq API
    groq_api_key: Optional[str] = None
    groq_model_simple: str = "llama-3.1-8b-instant"
    groq_model_long: str = "meta-llama/llama-4-scout-17b-16e-instruct"
    groq_model_complex: str = "openai/gpt-oss-120b"
    groq_timeout: int = 30

    # Gemini API (Fallback)
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.0-flash-exp"

    # Embedding Model
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_dimension: int = 768

    # RAG Configuration
    chunk_size: int = 512
    chunk_overlap: int = 50
    top_k_results: int = 10
    vector_search_limit: int = 8
    fts_search_limit: int = 8

    # Query Configuration
    max_query_length: int = 5000
    min_query_length: int = 3
    max_context_window: int = 10  # messages per session

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
