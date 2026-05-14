from sentence_transformers import SentenceTransformer
from typing import List, Union
import numpy as np
import logging
from config import settings

logger = logging.getLogger(__name__)


class Embedder:
    """Handles text embedding using sentence-transformers"""

    def __init__(self):
        logger.info(f"Loading embedding model: {settings.embedding_model}")
        self.model = SentenceTransformer(settings.embedding_model)
        self.dimension = settings.embedding_dimension
        logger.info(f"Embedding model loaded. Dimension: {self.dimension}")

    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text string
        
        Args:
            text: Input text to embed
            
        Returns:
            List of floats representing the embedding vector
        """
        try:
            embedding = self.model.encode(text, convert_to_numpy=True)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts
        
        Args:
            texts: List of input texts
            
        Returns:
            List of embedding vectors
        """
        try:
            embeddings = self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
            return embeddings.tolist()
        except Exception as e:
            logger.error(f"Error generating batch embeddings: {e}")
            raise

    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        v1 = np.array(vec1)
        v2 = np.array(vec2)
        return float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))


# Global embedder instance
embedder = Embedder()
