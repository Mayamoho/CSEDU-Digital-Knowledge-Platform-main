-- 010_catalog_isbn_unique.sql
-- Bulk CSV import upserts books ON CONFLICT (isbn). That requires a UNIQUE
-- index on isbn, but prod DBs created before this index existed only have the
-- plain (non-unique) idx_catalog_isbn. Without this, every ISBN row fails with
-- "no unique or exclusion constraint matching the ON CONFLICT specification"
-- and the whole import is silently skipped.
--
-- Partial (WHERE isbn IS NOT NULL) so multiple physical-only / ISBN-less rows
-- remain allowed. The import query repeats this predicate for index inference.
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_isbn_unique
    ON library_catalog (isbn)
    WHERE isbn IS NOT NULL;
