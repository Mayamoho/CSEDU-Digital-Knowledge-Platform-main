from typing import List, Dict, Any
from database import db
from embedder import embedder
from config import settings
import logging
import json

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

        # 1. Vector search (chunked documents)
        results.extend(self._vector_search(query_embedding, access_tiers))

        # 2. Library catalog FTS
        results.extend(self._search_catalog(query, language))

        # 3. Research papers FTS
        results.extend(self._search_research(query, access_tiers, language))

        # 4. Student projects FTS
        results.extend(self._search_projects(query, language))

        # 5. Media items FTS
        results.extend(self._search_media(query, access_tiers, language))

        # Deduplicate by title and return top results
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
                coalesce(author, '') || ' | ' || coalesce(location, '') || ' | ISBN: ' || coalesce(isbn, 'N/A') as chunk_text,
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
            return db.execute_query(q, (query, query, self.fts_limit)) or []
        except Exception as e:
            logger.error(f"Catalog search error: {e}")
            return []

    def _search_research(
        self, query: str, access_tiers: List[str], language: str
    ) -> List[Dict]:
        fts = "english" if language == "en" else "simple"
        q = f"""
            SELECT
                paper_id::text as item_id,
                title,
                'research' as item_type,
                access_tier,
                'research' as source,
                coalesce(authors::text, '') || ' | ' || coalesce(abstract, '') as chunk_text,
                ts_rank_cd(
                    to_tsvector('{fts}', coalesce(title, '') || ' ' || coalesce(abstract, '') || ' ' || coalesce(array_to_string(keywords, ' '), '')),
                    plainto_tsquery('{fts}', %s)
                ) as score
            FROM research_papers
            WHERE status = 'published'
              AND to_tsvector('{fts}', coalesce(title, '') || ' ' || coalesce(abstract, '') || ' ' || coalesce(array_to_string(keywords, ' '), '')) @@ plainto_tsquery('{fts}', %s)
            ORDER BY score DESC
            LIMIT %s
        """
        try:
            return db.execute_query(q, (query, query, self.fts_limit)) or []
        except Exception as e:
            logger.error(f"Research search error: {e}")
            return []

    def _search_projects(self, query: str, language: str) -> List[Dict]:
        fts = "english" if language == "en" else "simple"
        q = f"""
            SELECT
                project_id::text as item_id,
                title,
                'project' as item_type,
                'student' as access_tier,
                'project' as source,
                coalesce(description, '') || ' | ' || coalesce(array_to_string(tech_stack, ' '), '') as chunk_text,
                ts_rank_cd(
                    to_tsvector('{fts}', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(array_to_string(tech_stack, ' '), '')),
                    plainto_tsquery('{fts}', %s)
                ) as score
            FROM student_projects
            WHERE status = 'approved'
              AND to_tsvector('{fts}', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(array_to_string(tech_stack, ' '), '')) @@ plainto_tsquery('{fts}', %s)
            ORDER BY score DESC
            LIMIT %s
        """
        try:
            return db.execute_query(q, (query, query, self.fts_limit)) or []
        except Exception as e:
            logger.error(f"Projects search error: {e}")
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
                coalesce(mm.abstract, '') || ' | ' || coalesce(array_to_string(mm.tags, ' '), '') as chunk_text,
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
            return (
                db.execute_query(q, (query, access_tiers, query, self.fts_limit)) or []
            )
        except Exception as e:
            logger.error(f"Media search error: {e}")
            return []


retriever = HybridRetriever()
