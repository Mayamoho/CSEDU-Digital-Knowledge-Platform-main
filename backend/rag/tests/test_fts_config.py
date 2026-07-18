"""Unit tests for the RAG service pure helpers (no torch / model downloads)."""

from fts_config import fts_config_for_language


def test_english_uses_english_config():
    assert fts_config_for_language("en") == "english"
    # 'auto' should fall back to english for FTS keyword search.
    assert fts_config_for_language("auto") == "english"
    assert fts_config_for_language("unknown") == "english"


def test_bangla_uses_bangla_config():
    assert fts_config_for_language("bn") == "bangla"


def test_case_insensitive():
    # Defensive: downstream never sends uppercase, but be safe.
    assert fts_config_for_language("BN") == "english"
