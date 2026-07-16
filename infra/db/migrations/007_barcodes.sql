-- 007: Barcode support for the librarian circulation desk (SDD Flow 3).
-- Members and catalog items get scannable barcodes. Idempotent.

ALTER TABLE users           ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE library_catalog ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Deterministic backfill: M-<first 8 hex of user_id> / B-<first 8 hex of catalog_id>.
UPDATE users
SET barcode = 'M-' || UPPER(SUBSTRING(REPLACE(user_id::text, '-', '') FROM 1 FOR 8))
WHERE barcode IS NULL;

UPDATE library_catalog
SET barcode = 'B-' || UPPER(SUBSTRING(REPLACE(catalog_id::text, '-', '') FROM 1 FOR 8))
WHERE barcode IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_barcode   ON users (barcode);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_barcode ON library_catalog (barcode);

-- Assign barcodes automatically to future rows.
CREATE OR REPLACE FUNCTION assign_user_barcode() RETURNS trigger AS $$
BEGIN
    IF NEW.barcode IS NULL THEN
        NEW.barcode := 'M-' || UPPER(SUBSTRING(REPLACE(NEW.user_id::text, '-', '') FROM 1 FOR 8));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_catalog_barcode() RETURNS trigger AS $$
BEGIN
    IF NEW.barcode IS NULL THEN
        NEW.barcode := 'B-' || UPPER(SUBSTRING(REPLACE(NEW.catalog_id::text, '-', '') FROM 1 FOR 8));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_barcode ON users;
CREATE TRIGGER trg_user_barcode
    BEFORE INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION assign_user_barcode();

DROP TRIGGER IF EXISTS trg_catalog_barcode ON library_catalog;
CREATE TRIGGER trg_catalog_barcode
    BEFORE INSERT ON library_catalog
    FOR EACH ROW EXECUTE FUNCTION assign_catalog_barcode();
