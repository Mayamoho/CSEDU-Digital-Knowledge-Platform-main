"""FR-AI-012: AI auto-generated keywords for ingested documents.

When an item reaches the RAG indexer with no human-supplied keywords, we ask
the Groq LLM for a short list of subject keywords derived from the document
text. They are persisted to media_metadata.keywords so the catalog facets,
full-text search and the indexed document all benefit — not just the AI answer.

Synchronous on purpose: the ingest worker and index_all are plain sync code
(psycopg + threads), so this uses a blocking httpx call rather than the async
LLMClient used by the query path. Best-effort throughout: any failure (no API
key, rate limit, bad JSON) returns [] and ingestion proceeds unchanged.
"""

import json
import logging
import os
import re

import httpx

from config import settings

logger = logging.getLogger("keyword_extractor")

# Toggle so a deploy can disable LLM keyword calls without a rebuild.
ENABLED = os.getenv("RAG_AUTO_KEYWORDS", "true").lower() in ("1", "true", "yes")
MAX_KEYWORDS = int(os.getenv("RAG_AUTO_KEYWORDS_MAX", "8"))
# Cap the text we send so a 100-page PDF doesn't blow the token budget.
MAX_INPUT_CHARS = int(os.getenv("RAG_AUTO_KEYWORDS_INPUT_CHARS", "6000"))

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

_PROMPT = (
    "Extract {n} concise subject keywords or key phrases that best describe the "
    "following academic document. Return ONLY a JSON array of lowercase strings, "
    "no prose, no markdown. Prefer domain terms over generic words.\n\n"
    "Document:\n{text}"
)


def _parse_keywords(raw: str) -> list[str]:
    """Pull a clean keyword list out of whatever the model returned."""
    raw = raw.strip()
    # Strip ```json fences if the model wrapped the array.
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    parsed = None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Last resort: grab the first [...] block.
        m = re.search(r"\[.*\]", raw, flags=re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except json.JSONDecodeError:
                parsed = None
    if not isinstance(parsed, list):
        return []

    seen, out = set(), []
    for kw in parsed:
        if not isinstance(kw, str):
            continue
        kw = kw.strip().strip(".,;").lower()
        if kw and kw not in seen and len(kw) <= 60:
            seen.add(kw)
            out.append(kw)
        if len(out) >= MAX_KEYWORDS:
            break
    return out


def extract_keywords(text: str) -> list[str]:
    """Return up to MAX_KEYWORDS AI keywords for the document, or [] on failure."""
    if not ENABLED:
        return []
    api_key = settings.groq_api_key
    if not api_key:
        return []
    text = (text or "").strip()
    if len(text) < 40:  # too little signal to bother the LLM
        return []

    prompt = _PROMPT.format(n=MAX_KEYWORDS, text=text[:MAX_INPUT_CHARS])
    payload = {
        "model": settings.groq_model_simple,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 256,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=settings.groq_timeout) as client:
            resp = client.post(_GROQ_URL, json=payload, headers=headers)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
    except Exception as e:  # noqa: BLE001
        logger.warning("keyword extraction failed: %s", e)
        return []

    keywords = _parse_keywords(content)
    if keywords:
        logger.info("    AI keywords: %s", ", ".join(keywords))
    return keywords
