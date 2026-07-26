"""Structured extraction over a single indexed document.

Covers three SRS requirements that the free-form /query endpoint could not
satisfy, because each one demands a *shape*, not just prose:

  FR-AI-003  Document Summarization — 100-300 words, at least 3 key points.
  FR-AI-009  Research Insights      — key findings (>=3), methodology, conclusion.
  FR-AI-010  Project Intelligence   — technologies, skills demonstrated, outcome.

The LLM is asked for strict JSON and the result is validated here, so a model
that ignores the schema degrades to a usable partial answer instead of leaking
raw markdown into the UI. Everything is grounded in the item's own indexed
chunks — no chunks, no insights, never a guess.
"""

import json
import logging
import re
from typing import Any, Dict, List

from database import db
from llm_client import llm_client

logger = logging.getLogger(__name__)

# How much of the document to hand the model. Roughly 6k tokens, which fits the
# 8B tier comfortably and leaves headroom on the free-tier TPM budget.
MAX_CONTEXT_CHARS = 24000

SUMMARY_SCHEMA = {
    "summary": "a 100-300 word prose summary",
    "key_points": "an array of at least 3 short strings",
}

RESEARCH_SCHEMA = {
    "key_findings": "an array of at least 3 short strings",
    "methodology": "a 1-3 sentence summary of how the work was carried out",
    "conclusion": "a 1-3 sentence summary of what the authors conclude",
    "summary": "a 100-300 word prose summary",
    "key_points": "an array of at least 3 short strings",
}

PROJECT_SCHEMA = {
    "technologies": "an array of the technologies, languages and frameworks used",
    "skills": "an array of the skills the project demonstrates",
    "outcome": "1-3 sentences on what the project achieved",
    "summary": "a 100-300 word prose summary",
    "key_points": "an array of at least 3 short strings",
}

SCHEMAS = {
    "summary": SUMMARY_SCHEMA,
    "research": RESEARCH_SCHEMA,
    "project": PROJECT_SCHEMA,
}


def load_document(item_id: str) -> Dict[str, Any]:
    """Fetch an item's title, type and indexed text. Empty text means the
    ingestion pipeline has not reached this item yet."""
    meta = db.execute_one(
        """
        SELECT mi.title, mi.item_type, COALESCE(mm.abstract, '') AS abstract
          FROM media_items mi
          LEFT JOIN media_metadata mm ON mm.item_id = mi.item_id
         WHERE mi.item_id = %s
        """,
        (item_id,),
    )
    if not meta:
        return {}

    rows = db.execute_query(
        """
        SELECT chunk_text FROM vector_embeddings
         WHERE item_id = %s ORDER BY chunk_index LIMIT 40
        """,
        (item_id,),
    ) or []

    text = "\n\n".join(r["chunk_text"] for r in rows)
    if not text:
        text = meta["abstract"]
    return {
        "title": meta["title"],
        "item_type": meta["item_type"],
        "text": text[:MAX_CONTEXT_CHARS],
    }


def _build_prompt(kind: str, title: str, text: str, language: str) -> str:
    schema = SCHEMAS[kind]
    fields = "\n".join(f'  "{k}": {v}' for k, v in schema.items())
    lang = {
        "bn": "Write every value in Bengali (বাংলা).",
        "en": "Write every value in English.",
    }.get(language, "Write every value in the same language as the document.")

    return (
        "You are the CSEDU Knowledge Assistant. Read the document below and "
        "extract structured information about it.\n\n"
        f"Return ONLY a JSON object with exactly these keys:\n{{\n{fields}\n}}\n\n"
        "RULES:\n"
        "1. Use ONLY facts stated in the document. Never invent details.\n"
        "2. If a field genuinely cannot be determined from the document, use an "
        "empty string or empty array for it — do not guess.\n"
        f"3. {lang}\n"
        "4. Output raw JSON. No markdown fences, no commentary.\n\n"
        f"Document title: {title}\n\nDocument:\n{text}"
    )


def _parse_json(raw: str) -> Dict[str, Any]:
    """Pull a JSON object out of a model response that may still be wrapped in
    prose or a markdown fence."""
    raw = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if fenced:
        raw = fenced.group(1)
    else:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            raw = raw[start : end + 1]
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _as_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _trim_summary(summary: str, min_words: int = 100, max_words: int = 300) -> str:
    """Enforce the FR-AI-003 length band. We can only cut a long summary, not
    invent words for a short one, so a short summary is returned as-is and the
    caller reports the real word count."""
    words = summary.split()
    if len(words) > max_words:
        return " ".join(words[:max_words]).rstrip(",;: ") + "…"
    return summary


def normalise(kind: str, parsed: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce the model output into the documented shape, whatever it returned."""
    summary = _trim_summary(str(parsed.get("summary", "")).strip())
    out: Dict[str, Any] = {
        "summary": summary,
        "word_count": len(summary.split()),
        "key_points": _as_list(parsed.get("key_points"))[:8],
    }
    if kind == "research":
        out["key_findings"] = _as_list(parsed.get("key_findings"))[:8]
        out["methodology"] = str(parsed.get("methodology", "")).strip()
        out["conclusion"] = str(parsed.get("conclusion", "")).strip()
    elif kind == "project":
        out["technologies"] = _as_list(parsed.get("technologies"))[:15]
        out["skills"] = _as_list(parsed.get("skills"))[:15]
        out["outcome"] = str(parsed.get("outcome", "")).strip()
    return out


async def generate(item_id: str, kind: str, language: str = "auto") -> Dict[str, Any]:
    """Produce structured insights for one item. Raises ValueError when the item
    is unknown or has no indexed text to reason over."""
    doc = load_document(item_id)
    if not doc:
        raise ValueError("item not found")
    if not doc["text"].strip():
        raise ValueError("item has no indexed content yet")

    if kind == "auto":
        kind = doc["item_type"] if doc["item_type"] in ("research", "project") else "summary"
    if kind not in SCHEMAS:
        kind = "summary"

    prompt = _build_prompt(kind, doc["title"], doc["text"], language)

    # The complex tier: this is multi-page synthesis into a fixed schema, which
    # is exactly what the 120B model is provisioned for in the SDD.
    model = llm_client._select_model("complex")
    raw, model_used = "", "none"
    if llm_client.groq_api_key:
        try:
            raw = await llm_client._call_groq(prompt, model)
            model_used = f"groq/{model}"
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Groq insights call failed: {e}. Falling back to Gemini.")
    if not raw and llm_client.gemini_api_key:
        try:
            from config import settings

            raw = await llm_client._call_gemini(prompt)
            model_used = f"gemini/{settings.gemini_model}"
        except Exception as e:  # noqa: BLE001
            logger.error(f"Gemini insights call failed: {e}")

    if not raw:
        raise RuntimeError("no LLM provider available")

    parsed = _parse_json(raw)
    if not parsed:
        # The model answered in prose. Rather than fail, treat the whole reply
        # as the summary — degraded but still useful.
        logger.warning("Insights response was not JSON; falling back to prose")
        parsed = {"summary": raw}

    result = normalise(kind, parsed)
    result.update({
        "item_id": item_id,
        "kind": kind,
        "title": doc["title"],
        "item_type": doc["item_type"],
        "model_used": model_used,
    })
    return result
