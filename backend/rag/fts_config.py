"""Pure helpers for FTS language -> PostgreSQL text-search configuration.

Kept dependency-free (no torch / sentence-transformers) so it can be
unit-tested in CI without downloading models.
"""


def fts_config_for_language(language: str) -> str:
    """Return the PostgreSQL FTS config name for a query language.

    - ``bn``  -> ``bangla`` (registered in migration
                 012_bangla_fts.sql, wraps the ``simple`` dictionary)
    - anything else (``en`` / ``auto`` / unknown) -> ``english``

    Semantic retrieval is handled separately by the multilingual MiniLM
    embeddings; this config only affects exact keyword (FTS) recall.
    """
    if language == "bn":
        return "bangla"
    return "english"
