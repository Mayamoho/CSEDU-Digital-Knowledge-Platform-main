"""Keeps the RAG index in step with the platform's content.

Runs as a background thread inside the RAG service, which already has the
embedding model, MinIO and PyMuPDF loaded — no extra container, no extra RAM.

Two paths, deliberately:

1. Redis queue `ingestion_jobs` — the Go API pushes a job the moment a file is
   uploaded or replaced, so a new upload is searchable within seconds.
2. Reconcile sweep every RAG_SWEEP_INTERVAL seconds — catches what the queue
   can't: research/project submissions, admin publish actions, metadata edits,
   and jobs lost while this service was down. It compares a content hash of each
   published item against rag_index_state and re-embeds only what changed, so a
   steady-state sweep costs one query and zero embedding work.
"""

import json
import logging
import os
import threading
import time

import psycopg
import redis

from index_all import (
    CONN_STR,
    content_hash,
    fetch_items,
    get_minio_client,
    index_item,
)

logger = logging.getLogger("ingest_worker")

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
QUEUE_NAME = os.getenv("RAG_INGEST_QUEUE", "ingestion_jobs")
SWEEP_INTERVAL = int(os.getenv("RAG_SWEEP_INTERVAL", "60"))
BLPOP_TIMEOUT = 5


def _indexed_hashes(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT item_id::text, content_hash FROM rag_index_state")
        return {row[0]: row[1] for row in cur.fetchall()}


def _set_ingestion_status(conn, item_id, status, error=None) -> None:
    """Record the RAG indexing outcome on media_items (separate from workflow
    status). Best-effort: a bookkeeping failure must never mask the real error."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE media_items SET ingestion_status = %s, ingestion_error = %s "
                "WHERE item_id = %s",
                (status, error, item_id),
            )
        conn.commit()
    except Exception as e:  # noqa: BLE001
        conn.rollback()
        logger.error("could not record ingestion_status=%s for %s: %s", status, item_id, e)


def _alert_uploader(conn, item) -> None:
    """In-app notification to the uploader that their item failed to index."""
    uploader = item.get("created_by")
    if not uploader:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO notifications (user_id, title, body, link) "
                "VALUES (%s, %s, %s, %s)",
                (
                    uploader,
                    "Ingestion failed",
                    f"'{item.get('title')}' could not be indexed for AI search. "
                    "It stays visible but won't appear in AI answers until re-processed.",
                    None,
                ),
            )
        conn.commit()
    except Exception as e:  # noqa: BLE001
        conn.rollback()
        logger.error("could not alert uploader of %s: %s", item.get("item_id"), e)


def _index_items(conn, minio_client, items) -> int:
    done = 0
    for item in items:
        try:
            chunks = index_item(conn, minio_client, item)
            if chunks:
                logger.info(
                    "indexed '%s' (%s) -> %d chunks", item["title"], item["item_type"], chunks
                )
                done += 1
            _set_ingestion_status(conn, item["item_id"], "indexed")
        except Exception as e:  # noqa: BLE001
            conn.rollback()
            logger.error("failed to index %s: %s", item.get("item_id"), e)
            _set_ingestion_status(conn, item["item_id"], "failed", str(e)[:500])
            _alert_uploader(conn, item)
    return done


def index_by_ids(conn, minio_client, item_ids) -> int:
    items = fetch_items(conn, index_all=False, item_ids=list(item_ids))
    if not items:
        logger.warning("ingestion job for unknown item(s): %s", item_ids)
        return 0
    return _index_items(conn, minio_client, items)


def sweep(conn, minio_client) -> int:
    """(Re)index every published item whose content hash differs from the stored one."""
    items = fetch_items(conn, index_all=True)
    known = _indexed_hashes(conn)
    stale = [it for it in items if known.get(str(it["item_id"])) != content_hash(it)]
    if not stale:
        return 0
    logger.info("sweep: %d of %d published items need (re)indexing", len(stale), len(items))
    return _index_items(conn, minio_client, stale)


def _connect():
    return psycopg.connect(CONN_STR)


def _run() -> None:
    minio_client = get_minio_client()
    rdb = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    conn = _connect()
    last_sweep = 0.0

    logger.info("ingest worker running (queue=%s, sweep=%ss)", QUEUE_NAME, SWEEP_INTERVAL)

    while True:
        try:
            if conn.closed:
                conn = _connect()

            job = rdb.blpop(QUEUE_NAME, timeout=BLPOP_TIMEOUT)
            if job:
                try:
                    item_id = json.loads(job[1]).get("item_id")
                except (ValueError, TypeError, AttributeError):
                    item_id = None
                if item_id:
                    logger.info("job: item_id=%s", item_id)
                    index_by_ids(conn, minio_client, [item_id])
                else:
                    logger.warning("dropping malformed job: %s", str(job[1])[:200])

            now = time.monotonic()
            if now - last_sweep >= SWEEP_INTERVAL:
                last_sweep = now
                sweep(conn, minio_client)

        except Exception as e:  # noqa: BLE001
            logger.error("ingest loop error: %s", e)
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001
                try:
                    conn = _connect()
                except Exception as ce:  # noqa: BLE001
                    logger.error("reconnect failed: %s", ce)
            time.sleep(5)


def start_background_worker() -> threading.Thread:
    t = threading.Thread(target=_run, name="rag-ingest-worker", daemon=True)
    t.start()
    return t
