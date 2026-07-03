from typing import List, Dict, Any
from database import db
from embedder import embedder
from config import settings
import logging

logger = logging.getLogger(__name__)


class HybridRetriever:
    """Searches across ALL platform resources: catalog, media, research, projects"""

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
        results.extend(self._vector_search(query_embedding, access_tiers))
        results.extend(self._search_catalog(query, language))
        results.extend(self._search_research(query, access_tiers, language))
        results.extend(self._search_projects(query, language))
        results.extend(self._search_media(query, access_tiers, language))

        seen_titles = set()
        unique = []
        for r in results:
            key = r.get("title", "").lower().strip()
            if key and key not in seen_titles:
                seen_titles.add(key)
                unique.append(r)

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
        fts = "english" if language == "en" else "simple"
        q = f"""
            SELECT
                catalog_id::text as item_id,
                title,
                'library_catalog' as item_type,
                'public' as access_tier,
                'catalog' as source,
                coalesce(author, '') || ' | Location: ' || coalesce(location, '') || ' | ISBN: ' || coalesce(isbn, 'N/A') as chunk_text,
                ts_rank_cd(
                    to_tsvector('{fts}', coalesce(title, '') || ' ' || coalesce(author, '')),
                    plainto_tsquery('{fts}', %s)
                ) as score
            FROM library_catalog
            WHERE to_tsvector('{fts}', coalesce(title, '') || ' ' || coalesce(author, '')) @@ plainto_tsquery('{fts}', %s)
            ORDER BY score DESC
            LIMIT %s
        """
        try:
            results = db.execute_query(q, (query, query, self.fts_limit)) or []
            if not results:
                fallback = """
                    SELECT
                        sp.item_id::text,
                        mi.title,
                        mi.item_type,
                        mi.access_tier,
                        'project' as source,
                        coalesce(array_to_string(sp.team_members, ', '), '') || ' | Course: ' || coalesce(sp.course_code, 'N/A') || ' | Year: ' || sp.academic_year::text as chunk_text,
                        0.0 as score
                    FROM student_projects sp
                    JOIN media_items mi ON sp.item_id = mi.item_id
                    WHERE mi.status = 'published'
                    ORDER BY mi.title LIMIT %s
                """
                results = db.execute_query(fallback, (self.fts_limit,)) or []
            return results
        except Exception as e:
            logger.error(f"Projects search error: {e}")
            return []

    def _search_research(
        self, query: str, access_tiers: List[str], language: str
    ) -> List[Dict]:
        fts = "english" if language == "en" else "simple"
        q = f"""
            SELECT
                rp.item_id::text,
                mi.title,
                mi.item_type,
                mi.access_tier,
                'research' as source,
                coalesce(array_to_string(rp.authors, ', '), 'Unknown authors') || ' | ' || coalesce(mm.abstract, '') || ' | Keywords: ' || coalesce(array_to_string(mm.tags, ', '), 'N/A') as chunk_text,
                ts_rank_cd(
                    to_tsvector('{fts}', coalesce(mi.title, '') || ' ' || coalesce(mm.abstract, '') || ' ' || coalesce(array_to_string(mm.tags, ' '), '')),
                    plainto_tsquery('{fts}', %s)
                ) as score
            FROM research_papers rp
            JOIN media_items mi ON rp.item_id = mi.item_id
            LEFT JOIN media_metadata mm ON mi.item_id = mm.item_id
            WHERE mi.status = 'published'
              AND mi.access_tier = ANY(%s)
              AND to_tsvector('{fts}', coalesce(mi.title, '') || ' ' || coalesce(mm.abstract, '') || ' ' || coalesce(array_to_string(mm.tags, ' '), '')) @@ plainto_tsquery('{fts}', %s)
            ORDER BY score DESC
            LIMIT %s
        """
        try:
            return (
                db.execute_query(q, (query, access_tiers, query, self.fts_limit)) or []
            )
        except Exception as e:
            logger.error(f"Research search error: {e}")
            return []

    def _search_projects(self, query: str, language: str) -> List[Dict]:
        fts = "english" if language == "en" else "simple"
        q = f"""
            SELECT
                sp.item_id::text,
                mi.title,
                mi.item_type,
                mi.access_tier,
                'project' as source,
                coalesce(array_to_string(sp.team_members, ', '), '') || ' | Course: ' || coalesce(sp.course_code, 'N/A') || ' | Year: ' || sp.academic_year::text || ' | ' || coalesce(mm.abstract, '') as chunk_text,
                ts_rank_cd(
                    to_tsvector('{fts}', coalesce(mi.title, '') || ' ' || coalesce(mm.abstract, '') || ' ' || coalesce(array_to_string(mm.tags, ' '), '')),
                    plainto_tsquery('{fts}', %s)
                ) as score
            FROM student_projects sp
            JOIN media_items mi ON sp.item_id = mi.item_id
            LEFT JOIN media_metadata mm ON mi.item_id = mm.item_id
            WHERE mi.status = 'published'
              AND to_tsvector('{fts}', coalesce(mi.title, '') || ' ' || coalesce(mm.abstract, '') || ' ' || coalesce(array_to_string(mm.tags, ' '), '')) @@ plainto_tsquery('{fts}', %s)
            ORDER BY score DESC
            LIMIT %s
        """
        try:
            results = (
                db.execute_query(q, (query, access_tiers, query, self.fts_limit)) or []
            )
            if not results:
                fallback = """
                    SELECT
                        rp.item_id::text,
                        mi.title,
                        mi.item_type,
                        mi.access_tier,
                        'research' as source,
                        coalesce(array_to_string(rp.authors, ', '), 'Unknown authors') || ' | ' || coalesce(mm.abstract, '') as chunk_text,
                        0.0 as score
                    FROM research_papers rp
                    JOIN media_items mi ON rp.item_id = mi.item_id
                    LEFT JOIN media_metadata mm ON mi.item_id = mm.item_id
                    WHERE mi.status = 'published' AND mi.access_tier = ANY(%s)
                    ORDER BY mi.title LIMIT %s
                """
                results = (
                    db.execute_query(fallback, (access_tiers, self.fts_limit)) or []
                )
            return results
        except Exception as e:
            logger.error(f"Research search error: {e}")
            return []

    def _search_media(
        self, query: str, access_tiers: List[str], language: str
    ) -> List[Dict]:
        fts = "english" if language == "en" else "simple"
        q = f"""
            SELECT
                mi.item_id::text,
                mi.title,
                mi.item_type,
                mi.access_tier,
                'media' as source,
                coalesce(mm.abstract, '') || ' | Tags: ' || coalesce(array_to_string(mm.tags, ' '), 'N/A') as chunk_text,
                ts_rank_cd(
                    to_tsvector('{fts}', coalesce(mi.title, '') || ' ' || coalesce(mm.abstract, '') || ' ' || coalesce(array_to_string(mm.tags, ' '), '')),
                    plainto_tsquery('{fts}', %s)
                ) as score
            FROM media_items mi
            LEFT JOIN media_metadata mm ON mi.item_id = mm.item_id
            WHERE mi.status = 'published'
              AND mi.access_tier = ANY(%s)
              AND to_tsvector('{fts}', coalesce(mi.title, '') || ' ' || coalesce(mm.abstract, '') || ' ' || coalesce(array_to_string(mm.tags, ' '), '')) @@ plainto_tsquery('{fts}', %s)
            ORDER BY score DESC
            LIMIT %s
        """
        try:
            results = (
                db.execute_query(q, (query, access_tiers, query, self.fts_limit)) or []
            )
            if not results:
                fallback = """
                    SELECT
                        mi.item_id::text,
                        mi.title,
                        mi.item_type,
                        mi.access_tier,
                        'media' as source,
                        coalesce(mm.abstract, '') || ' | Tags: ' || coalesce(array_to_string(mm.tags, ' '), 'N/A') as chunk_text,
                        0.0 as score
                    FROM media_items mi
                    LEFT JOIN media_metadata mm ON mi.item_id = mm.item_id
                    WHERE mi.status = 'published' AND mi.access_tier = ANY(%s)
                    ORDER BY mi.title LIMIT %s
                """
                results = (
                    db.execute_query(fallback, (access_tiers, self.fts_limit)) or []
                )
            return results
        except Exception as e:
            logger.error(f"Media search error: {e}")
            return []


retriever = HybridRetriever()
