#!/usr/bin/env python3
"""
Unified RAG indexer for the CSEDU Digital Knowledge Platform.

Indexes ALL platform content into pgvector so the CSEDU Assistant can retrieve it:
  - Library catalog books        -> catalog_embeddings   (via index_catalog_books)
  - Digital archives             -> vector_embeddings     (media_items.item_type = 'archive')
  - Student projects             -> vector_embeddings     (media_items.item_type = 'project')
  - Research papers              -> vector_embeddings     (media_items.item_type = 'research')

For every published media item it builds a rich text document from:
  - core fields + media_metadata (abstract, keywords, tags)
  - type-specific metadata (research_papers / student_projects)
  - full text extracted from the source PDF stored in MinIO (when available)

Embeddings use the shared `embedder` module (same model as the running RAG service,
so dimensions always match what the retriever expects).

Usage (inside the csedu_rag container):
    python index_all.py            # index only items that have no embeddings yet
    python index_all.py --all      # re-index every published item (metadata refresh)
    python index_all.py --skip-catalog
"""

import hashlib
import os
import sys
import logging

import psycopg
from psycopg.rows import dict_row

from embedder import embedder

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    from minio import Minio
except ImportError:
    Minio = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("index_all")

# --- Database ---------------------------------------------------------------
DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "csedu_platform")
DB_USER = os.getenv("DB_USER", "csedu_user")
DB_PASS = os.getenv("DB_PASSWORD", "changeme_in_dev")
CONN_STR = f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} user={DB_USER} password={DB_PASS}"

# --- MinIO ------------------------------------------------------------------
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_USER = os.getenv("MINIO_USER", "minioadmin")
MINIO_PASSWORD = os.getenv("MINIO_PASSWORD", "changeme_in_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "csedu-files")
MINIO_SECURE = os.getenv("MINIO_USE_SSL", "false").lower() == "true"

CHUNK_SIZE = 1200      # characters
CHUNK_OVERLAP = 150
MAX_CHUNKS_PER_ITEM = 60


def get_minio_client():
    if Minio is None:
        logger.warning("minio SDK not installed - PDF full-text extraction disabled")
        return None
    try:
        return Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_USER,
            secret_key=MINIO_PASSWORD,
            secure=MINIO_SECURE,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not init MinIO client: %s", e)
        return None


def extract_pdf_text(client, file_path: str) -> str:
    """Download a PDF object from MinIO and extract its text."""
    if not client or fitz is None or not file_path:
        return ""
    key = file_path.lstrip("/")
    try:
        resp = client.get_object(MINIO_BUCKET, key)
        data = resp.read()
        resp.close()
        resp.release_conn()
    except Exception as e:  # noqa: BLE001
        logger.warning("  MinIO fetch failed for %s: %s", key, e)
        return ""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return " ".join(text.split())
    except Exception as e:  # noqa: BLE001
        logger.warning("  PDF parse failed for %s: %s", key, e)
        return ""


def _join(values) -> str:
    if not values:
        return ""
    return ", ".join(str(v) for v in values if v)


IMAGE_FORMATS = {"jpg", "jpeg", "png", "gif"}


def format_note(item: dict) -> str:
    """One line telling the LLM what kind of resource this is and whether its
    contents could actually be read. Images and external links carry no
    machine-readable text, so the assistant must describe them from metadata
    rather than pretend to have read them."""
    fmt = (item.get("format") or "").lower()
    if fmt in IMAGE_FORMATS:
        return (
            f"Resource kind: {fmt.upper()} image file. The image carries no machine-readable text, so "
            "only the description below is known. Say what the item is and point the user to the archive "
            "page to view it; do not invent details about the picture."
        )
    if fmt == "url" or (not item.get("file_path") and item.get("external_url")):
        return (
            "Resource kind: external link. The linked page is not stored on the platform, so only the "
            "description below is known. Summarise what the link is about and share the URL; do not "
            "invent its contents."
        )
    if fmt == "pdf":
        return "Resource kind: PDF document (full text indexed below)."
    return f"Resource kind: {fmt.upper() if fmt else 'file'} attachment (no text extracted; description only)."


def build_metadata_header(item: dict) -> str:
    """Build a structured, human-readable header from all metadata tables."""
    lines = [
        f"Title: {item['title']}",
        f"Type: {item['item_type'].capitalize()}",
        format_note(item),
    ]
    if item.get("abstract"):
        lines.append(f"Abstract: {item['abstract']}")
    if item.get("keywords"):
        lines.append(f"Keywords: {_join(item['keywords'])}")
    if item.get("tags"):
        lines.append(f"Tags: {_join(item['tags'])}")

    if item["item_type"] == "research":
        if item.get("rp_authors"):
            lines.append(f"Authors: {_join(item['rp_authors'])}")
        if item.get("co_authors"):
            lines.append(f"Co-authors: {_join(item['co_authors'])}")
        if item.get("journal"):
            lines.append(f"Journal: {item['journal']}")
        if item.get("conference"):
            lines.append(f"Conference: {item['conference']}")
        if item.get("doi"):
            lines.append(f"DOI: {item['doi']}")
        if item.get("publication_date"):
            lines.append(f"Published: {item['publication_date']}")

    if item["item_type"] == "project":
        if item.get("team_members"):
            lines.append(f"Team: {_join(item['team_members'])}")
        if item.get("academic_year"):
            lines.append(f"Academic year: {item['academic_year']}")
        if item.get("course_code"):
            lines.append(f"Course: {item['course_code']}")
        if item.get("web_url"):
            lines.append(f"Website: {item['web_url']}")
        if item.get("github_repo"):
            lines.append(f"GitHub: {item['github_repo']}")
        if item.get("app_download"):
            lines.append(f"App download: {item['app_download']}")

    if item.get("external_url"):
        lines.append(f"External URL: {item['external_url']}")

    return "\n".join(lines)


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP):
    chunks = []
    start = 0
    n = len(text)
    while start < n and len(chunks) < MAX_CHUNKS_PER_ITEM:
        chunk = text[start:start + size].strip()
        if chunk:
            chunks.append(chunk)
        start += size - overlap
    return chunks


def fetch_items(conn, index_all: bool, item_ids: list | None = None):
    """Published items, joined with every metadata table that feeds the document.

    item_ids bypasses the status filter: an explicit ingestion job may arrive
    while the item is still 'draft' (published later by a reviewer), and the
    retriever filters on status at query time anyway."""
    params: list = []
    if item_ids:
        where = "mi.item_id = ANY(%s::uuid[])"
        params.append([str(i) for i in item_ids])
    else:
        where = "mi.status = 'published'"
        if not index_all:
            where += " AND mi.item_id NOT IN (SELECT DISTINCT item_id FROM vector_embeddings)"
    q = f"""
        SELECT mi.item_id, mi.title, mi.item_type, mi.format, mi.status,
               mi.file_path, mi.external_url,
               mm.abstract, mm.tags, mm.keywords,
               rp.authors AS rp_authors, rp.co_authors, rp.journal, rp.conference,
               rp.doi, rp.publication_date,
               sp.team_members, sp.academic_year, sp.course_code,
               sp.web_url, sp.github_repo, sp.app_download
        FROM media_items mi
        LEFT JOIN media_metadata  mm ON mi.item_id = mm.item_id
        LEFT JOIN research_papers rp ON mi.item_id = rp.item_id
        LEFT JOIN student_projects sp ON mi.item_id = sp.item_id
        WHERE {where}
        ORDER BY mi.item_type, mi.title
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(q, tuple(params))
        return cur.fetchall()


def content_hash(item: dict) -> str:
    """Fingerprint of everything that affects the indexed document. When it
    changes (edited abstract, replaced file, new link), the item is re-embedded."""
    parts = [
        str(item.get(k) or "")
        for k in (
            "title", "item_type", "format", "file_path", "external_url", "status",
            "abstract", "keywords", "tags", "rp_authors", "co_authors", "journal",
            "conference", "doi", "team_members", "academic_year", "course_code",
            "web_url", "github_repo", "app_download",
        )
    ]
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def index_item(conn, minio_client, item: dict) -> int:
    header = build_metadata_header(item)

    body = ""
    if (item.get("format") or "").lower() == "pdf" and item.get("file_path"):
        body = extract_pdf_text(minio_client, item["file_path"])
        if body:
            logger.info("    extracted %d chars of PDF text", len(body))

    document = header + ("\n\n" + body if body else "")
    chunks = chunk_text(document)
    if not chunks:
        logger.warning("    no text to index")
        return 0

    item_id = str(item["item_id"])
    with conn.cursor() as cur:
        # Clean slate for this item so re-runs never leave stale chunks behind.
        cur.execute("DELETE FROM vector_embeddings WHERE item_id = %s", (item_id,))
        indexed = 0
        for idx, chunk in enumerate(chunks):
            embedding = embedder.embed_text(chunk)
            cur.execute(
                """
                INSERT INTO vector_embeddings (item_id, chunk_index, chunk_text, embedding)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (item_id, chunk_index)
                DO UPDATE SET chunk_text = EXCLUDED.chunk_text,
                              embedding  = EXCLUDED.embedding
                """,
                (item_id, idx, chunk, embedding),
            )
            indexed += 1

        cur.execute(
            """
            INSERT INTO rag_index_state (item_id, content_hash, chunk_count, indexed_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (item_id) DO UPDATE
            SET content_hash = EXCLUDED.content_hash,
                chunk_count  = EXCLUDED.chunk_count,
                indexed_at   = NOW()
            """,
            (item_id, content_hash(item), indexed),
        )
    conn.commit()
    return indexed


def index_media(index_all: bool):
    minio_client = get_minio_client()
    conn = psycopg.connect(CONN_STR)
    try:
        items = fetch_items(conn, index_all)
        logger.info("Media items to index: %d", len(items))
        total_chunks = ok = failed = 0
        for i, item in enumerate(items, 1):
            logger.info("[%d/%d] %s (%s)", i, len(items), item["title"], item["item_type"])
            try:
                n = index_item(conn, minio_client, item)
                if n:
                    logger.info("    indexed %d chunks", n)
                    total_chunks += n
                    ok += 1
                else:
                    failed += 1
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                logger.error("    failed: %s", e)
                failed += 1
        logger.info("Media done: %d items, %d chunks (%d failed)", ok, total_chunks, failed)
    finally:
        conn.close()


def main():
    index_all = "--all" in sys.argv
    skip_catalog = "--skip-catalog" in sys.argv

    logger.info("=" * 60)
    logger.info("CSEDU Unified RAG Indexer  (mode: %s)", "ALL" if index_all else "new-only")
    logger.info("Embedding model: %s", os.getenv("EMBEDDING_MODEL", "default"))
    logger.info("=" * 60)

    if not skip_catalog:
        try:
            from index_catalog_books import index_books
            index_books()
        except Exception as e:  # noqa: BLE001
            logger.error("Catalog indexing failed: %s", e)

    index_media(index_all)
    logger.info("All indexing complete.")


if __name__ == "__main__":
    main()
