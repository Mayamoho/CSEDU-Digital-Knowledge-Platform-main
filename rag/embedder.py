from fastembed import TextEmbedding
from typing import List
import numpy as np
import logging
from config import settings

logger = logging.getLogger(__name__)


class Embedder:
    """Handles text embedding using fastembed (ONNX, no torch needed)"""

    def __init__(self):
        logger.info(f"Loading embedding model: {settings.embedding_model}")
        self.model = TextEmbedding(model_name=settings.embedding_model)
        self.dimension = settings.embedding_dimension
        logger.info(f"Embedding model loaded. Dimension: {self.dimension}")

    def embed_text(self, text: str) -> List[float]:
        try:
            embedding = list(self.model.embed([text]))[0]
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        try:
            embeddings = list(self.model.embed(texts))
            return [e.tolist() for e in embeddings]
        except Exception as e:
            logger.error(f"Error generating batch embeddings: {e}")
            raise

    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        v1 = np.array(vec1)
        v2 = np.array(vec2)
        return float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))


embedder = Embedder()
