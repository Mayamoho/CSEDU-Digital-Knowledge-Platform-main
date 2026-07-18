"""Tests for FR-AI-012 keyword extraction parsing and guard rails.

Network is never touched: extract_keywords short-circuits when no API key is
configured, and _parse_keywords is pure. Run with: pytest rag/test_keyword_extractor.py
"""

import keyword_extractor as ke


def test_parse_plain_json_array():
    assert ke._parse_keywords('["neural networks", "deep learning", "CNN"]') == [
        "neural networks",
        "deep learning",
        "cnn",
    ]


def test_parse_strips_code_fence_and_dedups_and_punctuation():
    raw = '```json\n["algorithms", "Algorithms", "sorting."]\n```'
    assert ke._parse_keywords(raw) == ["algorithms", "sorting"]


def test_parse_recovers_array_from_surrounding_prose():
    assert ke._parse_keywords('here you go: ["ai", "ml"] hope that helps') == ["ai", "ml"]


def test_parse_non_json_returns_empty():
    assert ke._parse_keywords("not json at all") == []


def test_parse_caps_at_max_keywords():
    raw = "[" + ",".join(f'"kw{i}"' for i in range(50)) + "]"
    assert len(ke._parse_keywords(raw)) == ke.MAX_KEYWORDS


def test_extract_returns_empty_without_api_key(monkeypatch):
    monkeypatch.setattr(ke.settings, "groq_api_key", None, raising=False)
    assert ke.extract_keywords("a reasonably long academic document " * 5) == []


def test_extract_returns_empty_for_tiny_text():
    assert ke.extract_keywords("short") == []
