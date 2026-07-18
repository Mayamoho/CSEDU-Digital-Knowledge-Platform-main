from typing import List, Dict, Any, Optional
from database import db
from embedder import embedder
from config import settings
from fts_config import fts_config_for_language
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
        language: str = "en",
        intent: str = "question"
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid retrieval with access control
        
        Args:
            query: User's search query
            user_role: User's role tier for access control
            language: Query language (en/bn)
            intent: Query intent for weighted retrieval
            
        Returns:
            List of relevant document chunks with metadata
        """
        # Map role to accessible tiers
        access_tiers = self._get_access_tiers(user_role)
        
        # Generate query embedding
        query_embedding = embedder.embed_text(query)
        
        # Adjust retrieval strategy based on intent
        if intent == "search" or intent == "availability":
            # For search intents, prioritize FTS over vector
            vector_weight = 0.4
            fts_weight = 0.6
        else:
            # For question intents, balance both
            vector_weight = 0.5
            fts_weight = 0.5
        
        # Perform vector search
        vector_results = self._vector_search(query_embedding, access_tiers)
        
        # Perform full-text search
        fts_results = self._fulltext_search(query, access_tiers, language)
        
        # Merge and rank results using weighted RRF
        merged_results = self._reciprocal_rank_fusion(
            vector_results, 
            fts_results,
            vector_weight,
            fts_weight
        )
        
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
        """
        Perform vector similarity search using pgvector
        Searches:
        1. media_items via vector_embeddings (research/projects/archives)
        2. library_catalog via catalog_embeddings (books)
        """
        # Search media items
        media_query = """
            SELECT 
                ve.embedding_id::text,
                ve.item_id::text,
                ve.chunk_index,
                ve.chunk_text,
                mi.title,
                mi.item_type,
                mi.access_tier::text,
                1 - (ve.embedding <=> %s::vector) AS similarity_score,
                'media' as source_type
            FROM vector_embeddings ve
            JOIN media_items mi ON ve.item_id = mi.item_id
            WHERE mi.access_tier = ANY(%s)
              AND mi.status = 'published'
        """
        
        # Search catalog books (always public access)
        catalog_query = """
            SELECT 
                ce.embedding_id::text,
                ce.catalog_id::text as item_id,
                0 as chunk_index,
                ce.chunk_text,
                lc.title,
                'book' as item_type,
                'public' as access_tier,
                1 - (ce.embedding <=> %s::vector) AS similarity_score,
                'catalog' as source_type
            FROM catalog_embeddings ce
            JOIN library_catalog lc ON ce.catalog_id = lc.catalog_id
        """
        
        # Combine both searches
        combined_query = f"""
            ({media_query})
            UNION ALL
            ({catalog_query})
            ORDER BY similarity_score DESC
            LIMIT %s
        """
        
        try:
            results = db.execute_query(
                combined_query,
                (query_embedding, access_tiers,  # media params
                 query_embedding,                 # catalog params
                 self.vector_limit)
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
        """
        Perform PostgreSQL full-text search
        Searches BOTH media_items (research/projects/archives) AND library_catalog (books)
        """
        # Choose FTS configuration based on language.
        # Bangla uses the dedicated `bangla` config (registered in
        # migration 012_bangla_fts.sql) which wraps the `simple`
        # dictionary; English uses the built-in `english` stemmer.
        fts_config = fts_config_for_language(language)
        
        # Search in media items (research papers, projects, archives with embeddings)
        media_query = f"""
            SELECT 
                ve.embedding_id,
                ve.item_id,
                ve.chunk_index,
                ve.chunk_text,
                mi.title,
                mi.item_type,
                mi.access_tier,
                ts_rank_cd(
                    to_tsvector('{fts_config}', ve.chunk_text || ' ' || mi.title),
                    plainto_tsquery('{fts_config}', %s)
                ) AS fts_score,
                'media' as source_type
            FROM vector_embeddings ve
            JOIN media_items mi ON ve.item_id = mi.item_id
            WHERE mi.access_tier = ANY(%s)
              AND mi.status = 'published'
              AND (
                  to_tsvector('{fts_config}', ve.chunk_text) @@ plainto_tsquery('{fts_config}', %s)
                  OR to_tsvector('{fts_config}', mi.title) @@ plainto_tsquery('{fts_config}', %s)
              )
        """
        
        # Search in library catalog (books)
        catalog_query = f"""
            SELECT 
                lc.catalog_id::text as embedding_id,
                lc.catalog_id::text as item_id,
                0 as chunk_index,
                CONCAT(
                    'Title: ', lc.title, E'\n',
                    'Author: ', lc.author, E'\n',
                    CASE WHEN lc.isbn IS NOT NULL THEN CONCAT('ISBN: ', lc.isbn, E'\n') ELSE '' END,
                    'Format: ', lc.format, E'\n',
                    'Year: ', COALESCE(lc.year::text, 'N/A'), E'\n',
                    'Location: ', COALESCE(lc.location, 'Main Library'), E'\n',
                    'Available: ', lc.available_copies, ' of ', lc.total_copies, ' copies'
                ) as chunk_text,
                lc.title,
                'book' as item_type,
                'public' as access_tier,
                ts_rank_cd(
                    to_tsvector('{fts_config}', lc.title || ' ' || lc.author || ' ' || COALESCE(lc.isbn, '')),
                    plainto_tsquery('{fts_config}', %s)
                ) AS fts_score,
                'catalog' as source_type
            FROM library_catalog lc
            WHERE (
                to_tsvector('{fts_config}', lc.title) @@ plainto_tsquery('{fts_config}', %s)
                OR to_tsvector('{fts_config}', lc.author) @@ plainto_tsquery('{fts_config}', %s)
                OR (lc.isbn IS NOT NULL AND lc.isbn ILIKE %s)
            )
        """
        
        # Combine both queries with UNION ALL
        combined_query = f"""
            ({media_query})
            UNION ALL
            ({catalog_query})
            ORDER BY fts_score DESC
            LIMIT %s
        """
        
        try:
            # Parameters: media (q, tiers, q, q) + catalog (q, q, q, isbn_pattern) + limit
            isbn_pattern = f"%{query}%"
            results = db.execute_query(
                combined_query,
                (query, access_tiers, query, query,  # media search params
                 query, query, query, isbn_pattern,  # catalog search params
                 self.fts_limit)
            )
            return results or []
        except Exception as e:
            logger.error(f"Full-text search error: {e}")
            return []

    def _reciprocal_rank_fusion(
        self,
        vector_results: List[Dict],
        fts_results: List[Dict],
        vector_weight: float = 0.5,
        fts_weight: float = 0.5
    ) -> List[Dict[str, Any]]:
        """
        Merge results using weighted Reciprocal Rank Fusion (RRF)
        
        RRF formula: score = vector_weight * (1 / (k + rank_vector)) + fts_weight * (1 / (k + rank_fts))
        where k=60 is a constant
        """
        k = 60
        scores = {}
        result_map = {}
        
        # Score vector results
        for rank, result in enumerate(vector_results, start=1):
            chunk_id = result['embedding_id']
            scores[chunk_id] = scores.get(chunk_id, 0) + vector_weight * (1 / (k + rank))
            if chunk_id not in result_map:
                result_map[chunk_id] = result
        
        # Score FTS results
        for rank, result in enumerate(fts_results, start=1):
            chunk_id = result['embedding_id']
            scores[chunk_id] = scores.get(chunk_id, 0) + fts_weight * (1 / (k + rank))
            if chunk_id not in result_map:
                result_map[chunk_id] = result
        
        # Combine and sort by RRF score
        merged = []
        for chunk_id, score in scores.items():
            result = result_map[chunk_id]
            result['rrf_score'] = score
            merged.append(result)
        
        # Sort by RRF score
        merged.sort(key=lambda x: x.get('rrf_score', 0), reverse=True)
        
        return merged


# Global retriever instance
retriever = HybridRetriever()
