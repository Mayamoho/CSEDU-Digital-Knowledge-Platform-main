from typing import List, Dict, Any, Optional
from database import db
from embedder import embedder
from config import settings
import logging

logger = logging.getLogger(__name__)


class HybridRetriever:
    """Implements hybrid retrieval: vector similarity + full-text search"""

    def __init__(self):
        self.vector_limit = settings.vector_search_limit
        self.fts_limit = settings.fts_search_limit
        self.top_k = settings.top_k_results

    def retrieve(
        self,
        query: str,
        user_role: str,
        language: str = "en"
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid retrieval with access control
        
        Args:
            query: User's search query
            user_role: User's role tier for access control
            language: Query language (en/bn)
            
        Returns:
            List of relevant document chunks with metadata
        """
        # Map role to accessible tiers
        access_tiers = self._get_access_tiers(user_role)
        
        # Generate query embedding
        query_embedding = embedder.embed_text(query)
        
        # Perform vector search
        vector_results = self._vector_search(query_embedding, access_tiers)
        
        # Perform full-text search
        fts_results = self._fulltext_search(query, access_tiers, language)
        
        # Merge and rank results using Reciprocal Rank Fusion
        merged_results = self._reciprocal_rank_fusion(vector_results, fts_results)
        
        return merged_results[:self.top_k]

    def _get_access_tiers(self, role: str) -> List[str]:
        """Map user role to accessible content tiers"""
        role_mapping = {
            "public": ["public"],
            "student": ["public", "student"],
            "researcher": ["public", "student", "researcher"],
            "librarian": ["public", "student", "researcher", "librarian"],
            "administrator": ["public", "student", "researcher", "librarian", "restricted"],
        }
        return role_mapping.get(role, ["public"])

    def _vector_search(
        self,
        query_embedding: List[float],
        access_tiers: List[str]
    ) -> List[Dict[str, Any]]:
        """Perform vector similarity search using pgvector"""
        query = """
            SELECT 
                ve.embedding_id,
                ve.item_id,
                ve.chunk_index,
                ve.chunk_text,
                mi.title,
                mi.item_type,
                mi.access_tier,
                1 - (ve.embedding <=> %s::vector) AS similarity_score
            FROM vector_embeddings ve
            JOIN media_items mi ON ve.item_id = mi.item_id
            WHERE mi.access_tier = ANY(%s)
              AND mi.status = 'published'
            ORDER BY ve.embedding <=> %s::vector
            LIMIT %s
        """
        
        try:
            results = db.execute_query(
                query,
                (query_embedding, access_tiers, query_embedding, self.vector_limit)
            )
            return results or []
        except Exception as e:
            logger.error(f"Vector search error: {e}")
            return []

    def _fulltext_search(
        self,
        query: str,
        access_tiers: List[str],
        language: str
    ) -> List[Dict[str, Any]]:
        """Perform PostgreSQL full-text search"""
        # Choose FTS configuration based on language
        fts_config = "english" if language == "en" else "simple"
        
        query_sql = f"""
            SELECT 
                ve.embedding_id,
                ve.item_id,
                ve.chunk_index,
                ve.chunk_text,
                mi.title,
                mi.item_type,
                mi.access_tier,
                ts_rank_cd(
                    to_tsvector('{fts_config}', ve.chunk_text),
                    plainto_tsquery('{fts_config}', %s)
                ) AS fts_score
            FROM vector_embeddings ve
            JOIN media_items mi ON ve.item_id = mi.item_id
            WHERE mi.access_tier = ANY(%s)
              AND mi.status = 'published'
              AND to_tsvector('{fts_config}', ve.chunk_text) @@ plainto_tsquery('{fts_config}', %s)
            ORDER BY fts_score DESC
            LIMIT %s
        """
        
        try:
            results = db.execute_query(
                query_sql,
                (query, access_tiers, query, self.fts_limit)
            )
            return results or []
        except Exception as e:
            logger.error(f"Full-text search error: {e}")
            return []

    def _reciprocal_rank_fusion(
        self,
        vector_results: List[Dict],
        fts_results: List[Dict]
    ) -> List[Dict[str, Any]]:
        """
        Merge results using Reciprocal Rank Fusion (RRF)
        
        RRF formula: score = sum(1 / (k + rank_i))
        where k=60 is a constant, rank_i is the rank in each list
        """
        k = 60
        scores = {}
        
        # Score vector results
        for rank, result in enumerate(vector_results, start=1):
            chunk_id = result['embedding_id']
            scores[chunk_id] = scores.get(chunk_id, 0) + (1 / (k + rank))
            if chunk_id not in scores:
                scores[chunk_id] = {'result': result, 'score': 0}
        
        # Score FTS results
        for rank, result in enumerate(fts_results, start=1):
            chunk_id = result['embedding_id']
            if chunk_id not in scores:
                scores[chunk_id] = {'result': result, 'score': 0}
            scores[chunk_id] = scores.get(chunk_id, 0) + (1 / (k + rank))
        
        # Combine and sort by RRF score
        merged = []
        seen_chunks = set()
        
        # Add vector results first (preserve some ordering)
        for result in vector_results:
            chunk_id = result['embedding_id']
            if chunk_id not in seen_chunks:
                result['rrf_score'] = scores.get(chunk_id, 0)
                merged.append(result)
                seen_chunks.add(chunk_id)
        
        # Add FTS results that weren't in vector results
        for result in fts_results:
            chunk_id = result['embedding_id']
            if chunk_id not in seen_chunks:
                result['rrf_score'] = scores.get(chunk_id, 0)
                merged.append(result)
                seen_chunks.add(chunk_id)
        
        # Sort by RRF score
        merged.sort(key=lambda x: x.get('rrf_score', 0), reverse=True)
        
        return merged


# Global retriever instance
retriever = HybridRetriever()
