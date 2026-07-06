from typing import List, Dict, Any
from database import db
from embedder import embedder
from config import settings
import logging

logger = logging.getLogger(__name__)


class HybridRetriever:
    """Searches across ALL platform resources: vector_embeddings + catalog_embeddings"""

    def __init__(self):
        self.vector_limit = settings.vector_search_limit
        self.fts_limit = settings.fts_search_limit
        self.top_k = settings.top_k_results

    def retrieve(
        self, query: str, user_role: str, language: str = "en"
    ) -> List[Dict[str, Any]]:
        access_tiers = self._get_access_tiers(user_role)
        query_embedding = embedder.embed_text(query)

        results = []
        # Vector search (media_items: research/projects/archives)
        results.extend(self._vector_search(query_embedding, access_tiers))
        # Catalog search (library books)
        results.extend(self._search_catalog(query, language))
        # Full-text search on media_items
        results.extend(self._search_media_fulltext(query, access_tiers, language))

        seen_titles = set()
        unique = []
        for r in results:
            key = r.get("title", "").lower().strip()
            if key and key not in seen_titles:
                seen_titles.add(key)
                unique.append(r)

        logger.info(f"Retriever: {len(results)} raw -> {len(unique)} unique results")
        for u in unique:
            logger.info(f"  [{u.get('source', '?')}] {u.get('title', '?')}")

        return unique[: self.top_k]

    def _get_access_tiers(self, role: str) -> List[str]:
        role_mapping = {
            "public": ["public"],
            "student": ["public", "student"],
            "researcher": ["public", "student", "researcher"],
            "librarian": ["public", "student", "researcher", "librarian"],
            "administrator": [
                "public",
                "student",
                "researcher",
                "librarian",
                "restricted",
            ],
        }
        return role_mapping.get(role, ["public"])

    def _vector_search(self, query_embedding, access_tiers) -> List[Dict]:
        query = """
            SELECT
                ve.embedding_id,
                ve.item_id::text,
                ve.chunk_index,
                ve.chunk_text,
                mi.title,
                mi.item_type,
                mi.access_tier,
                'vector' as source,
                1 - (ve.embedding <=> %s::vector) AS score
            FROM vector_embeddings ve
            JOIN media_items mi ON ve.item_id = mi.item_id
            WHERE mi.access_tier = ANY(%s)
              AND mi.status = 'published'
            ORDER BY ve.embedding <=> %s::vector
            LIMIT %s
        """
        try:
            return (
                db.execute_query(
                    query,
                    (query_embedding, access_tiers, query_embedding, self.vector_limit),
                )
                or []
            )
        except Exception as e:
            logger.error(f"Vector search error: {e}")
            return []

    def _search_catalog(self, query: str, language: str) -> List[Dict]:
        """Search library catalog books"""
        fts = "english" if language == "en" else "simple"
        q = f"""
            SELECT
                lc.catalog_id::text as item_id,
                lc.title,
                'book' as item_type,
                'public' as access_tier,
                'catalog' as source,
                coalesce(lc.author, '') || ' | Location: ' || coalesce(lc.location, 'Main Library') || ' | ISBN: ' || coalesce(lc.isbn, 'N/A') || ' | Available: ' || lc.available_copies::text || '/' || lc.total_copies::text as chunk_text,
                ts_rank_cd(
                    to_tsvector('{fts}', coalesce(lc.title, '') || ' ' || coalesce(lc.author, '')),
                    plainto_tsquery('{fts}', %s)
                ) as score
            FROM library_catalog lc
            WHERE to_tsvector('{fts}', coalesce(lc.title, '') || ' ' || coalesce(lc.author, '')) @@ plainto_tsquery('{fts}', %s)
            ORDER BY score DESC
            LIMIT %s
        """
        try:
            results = db.execute_query(q, (query, query, self.fts_limit)) or []
            # Only fall back to "all books" when the user is actually asking about the
            # library catalog — otherwise unrelated questions get flooded with every book.
            catalog_intent = any(
                kw in query.lower()
                for kw in ["book", "catalog", "library", "borrow", "textbook", "বই", "লাইব্রেরি"]
            )
            if not results and catalog_intent:
                fallback = """
                    SELECT
                        lc.catalog_id::text as item_id,
                        lc.title,
                        'book' as item_type,
                        'public' as access_tier,
                        'catalog' as source,
                        coalesce(lc.author, '') || ' | Location: ' || coalesce(lc.location, 'Main Library') || ' | ISBN: ' || coalesce(lc.isbn, 'N/A') || ' | Available: ' || lc.available_copies::text || '/' || lc.total_copies::text as chunk_text,
                        0.0 as score
                    FROM library_catalog lc
                    ORDER BY lc.title
                    LIMIT %s
                """
                results = db.execute_query(fallback, (self.fts_limit,)) or []
            return results
        except Exception as e:
            logger.error(f"Catalog search error: {e}")
            return []

    def _search_media_fulltext(
        self, query: str, access_tiers: List[str], language: str
    ) -> List[Dict]:
        """Full-text search across all media items"""
        fts = "english" if language == "en" else "simple"
        q = f"""
            SELECT DISTINCT
                mi.item_id::text,
                mi.title,
                mi.item_type,
                mi.access_tier,
                'fulltext' as source,
                coalesce(mm.abstract, '') || ' | Tags: ' || coalesce(array_to_string(mm.tags, ', '), 'N/A') as chunk_text,
                ts_rank_cd(
                    to_tsvector('{fts}', coalesce(mi.title, '') || ' ' || coalesce(mm.abstract, '')),
                    plainto_tsquery('{fts}', %s)
                ) as score
            FROM media_items mi
            LEFT JOIN media_metadata mm ON mi.item_id = mm.item_id
            WHERE mi.status = 'published'
              AND mi.access_tier = ANY(%s)
              AND to_tsvector('{fts}', coalesce(mi.title, '') || ' ' || coalesce(mm.abstract, '')) @@ plainto_tsquery('{fts}', %s)
            ORDER BY score DESC
            LIMIT %s
        """
        try:
            return db.execute_query(q, (query, access_tiers, query, self.fts_limit)) or []
        except Exception as e:
            logger.error(f"Media fulltext search error: {e}")
            return []


retriever = HybridRetriever()
