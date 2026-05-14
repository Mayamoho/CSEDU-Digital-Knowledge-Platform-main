-- CSEDU Digital Knowledge Platform — Database Initialization
-- PostgreSQL 16 + pgvector
-- Run order: extensions → enums → tables → indexes → constraints → seed

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE role_tier      AS ENUM ('public', 'student', 'researcher', 'librarian', 'administrator');
CREATE TYPE item_status    AS ENUM ('draft', 'review', 'published', 'archived');
CREATE TYPE access_tier    AS ENUM ('public', 'student', 'researcher', 'librarian', 'restricted');
CREATE TYPE fine_status    AS ENUM ('pending', 'paid', 'waived');
CREATE TYPE payment_status AS ENUM ('pending', 'successful', 'failed');
CREATE TYPE loan_status    AS ENUM ('active', 'returned', 'overdue');
CREATE TYPE hold_status    AS ENUM ('active', 'fulfilled', 'cancelled');

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    user_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL UNIQUE,
    name          TEXT        NOT NULL,
    password_hash TEXT,                     -- NULL for SSO-only users
    role_tier     role_tier   NOT NULL DEFAULT 'student',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login    TIMESTAMPTZ
);

-- ============================================================
-- MEDIA ITEMS
-- ============================================================
CREATE TABLE media_items (
    item_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    item_type   TEXT        NOT NULL,  -- 'archive' | 'research' | 'project'
    format      TEXT        NOT NULL,
    status      item_status NOT NULL DEFAULT 'draft',
    access_tier access_tier NOT NULL DEFAULT 'public',
    created_by  UUID        REFERENCES users(user_id) ON DELETE SET NULL,
    file_path   TEXT,
    upload_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE media_items
    ADD CONSTRAINT chk_media_format CHECK (format IN (
        'pdf','video','image','audio','docx','doc',
        'pptx','ppt','xlsx','xls','mp4','mp3','jpg','jpeg','png','gif',
        'zip','apk','project'
    ));

ALTER TABLE media_items
    ADD CONSTRAINT chk_media_item_type CHECK (item_type IN ('archive','research','project'));

-- ============================================================
-- MEDIA METADATA  (1:1 with media_items)
-- ============================================================
CREATE TABLE media_metadata (
    meta_id  UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id  UUID   NOT NULL UNIQUE REFERENCES media_items(item_id) ON DELETE CASCADE,
    tags     TEXT[] NOT NULL DEFAULT '{}',
    abstract TEXT   NOT NULL DEFAULT '',
    keywords TEXT[] NOT NULL DEFAULT '{}',
    language TEXT   NOT NULL DEFAULT 'en'
);

-- Full-text search column + trigger (avoids immutability restrictions on array_to_string)
ALTER TABLE media_metadata ADD COLUMN fts tsvector;

CREATE OR REPLACE FUNCTION media_metadata_fts_update() RETURNS trigger AS $$
BEGIN
    NEW.fts := to_tsvector('english',
        coalesce(NEW.abstract, '') || ' ' ||
        coalesce(array_to_string(NEW.keywords, ' '), '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_media_metadata_fts
    BEFORE INSERT OR UPDATE ON media_metadata
    FOR EACH ROW EXECUTE FUNCTION media_metadata_fts_update();

CREATE INDEX idx_metadata_fts ON media_metadata USING GIN (fts);

-- ============================================================
-- LIBRARY CATALOG
-- ============================================================
CREATE TABLE library_catalog (
    catalog_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT        NOT NULL,
    author           TEXT        NOT NULL,
    isbn             TEXT,
    format           TEXT        NOT NULL DEFAULT 'book',
    location         TEXT,
    cover_image      TEXT,
    year             INT,
    total_copies     INT         NOT NULL DEFAULT 1,
    available_copies INT         NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalog_title  ON library_catalog USING GIN (to_tsvector('english', title));
CREATE INDEX idx_catalog_author ON library_catalog USING GIN (to_tsvector('english', author));
CREATE INDEX idx_catalog_isbn   ON library_catalog (isbn);

-- ============================================================
-- LOANS
-- ============================================================
CREATE TABLE loans (
    loan_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(user_id)              ON DELETE RESTRICT,
    catalog_id    UUID        NOT NULL REFERENCES library_catalog(catalog_id) ON DELETE RESTRICT,
    checkout_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_date      TIMESTAMPTZ NOT NULL,
    return_date   TIMESTAMPTZ,           -- NULL = currently borrowed
    status        loan_status NOT NULL DEFAULT 'active'
);

ALTER TABLE loans
    ADD CONSTRAINT chk_loan_dates CHECK (due_date > checkout_date);

-- Prevents the same user from borrowing the same book multiple times simultaneously
CREATE UNIQUE INDEX idx_loans_active_user_item
    ON loans (user_id, catalog_id)
    WHERE return_date IS NULL;

-- ============================================================
-- FINES
-- ============================================================
CREATE TABLE fines (
    fine_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id       UUID          NOT NULL UNIQUE REFERENCES loans(loan_id) ON DELETE RESTRICT,
    user_id       UUID          NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    amount        NUMERIC(10,2) NOT NULL,
    status        fine_status   NOT NULL DEFAULT 'pending',
    calculated_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE fines
    ADD CONSTRAINT chk_fine_positive CHECK (amount > 0);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
    payment_id UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    fine_id    UUID           NOT NULL REFERENCES fines(fine_id)  ON DELETE RESTRICT,
    user_id    UUID           NOT NULL REFERENCES users(user_id)  ON DELETE RESTRICT,
    amount     NUMERIC(10,2)  NOT NULL,
    status     payment_status NOT NULL DEFAULT 'pending',
    paid_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE payments
    ADD CONSTRAINT chk_payment_positive CHECK (amount > 0);

-- ============================================================
-- HOLDS
-- ============================================================
CREATE TABLE holds (
    hold_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(user_id)              ON DELETE CASCADE,
    catalog_id UUID        NOT NULL REFERENCES library_catalog(catalog_id) ON DELETE CASCADE,
    placed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    status     hold_status NOT NULL DEFAULT 'active'
);

-- ============================================================
-- VECTOR EMBEDDINGS  (RAG — Sprint 2)
-- ============================================================
CREATE TABLE vector_embeddings (
    embedding_id UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id      UUID    NOT NULL REFERENCES media_items(item_id) ON DELETE CASCADE,
    chunk_index  INT     NOT NULL,
    chunk_text   TEXT    NOT NULL,
    embedding    vector(768),
    UNIQUE(item_id, chunk_index)
);

ALTER TABLE vector_embeddings
    ADD CONSTRAINT chk_chunk_index CHECK (chunk_index >= 0);

CREATE INDEX idx_embeddings_hnsw
    ON vector_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================
-- AI CHAT MESSAGES  (Sprint 2)
-- ============================================================
CREATE TABLE ai_chat_messages (
    message_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID        NOT NULL,
    user_id        UUID        REFERENCES users(user_id) ON DELETE SET NULL,
    query          TEXT        NOT NULL,
    response       TEXT        NOT NULL,
    source_doc_ids UUID[]      NOT NULL DEFAULT '{}',
    model_used     TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_chat_messages
    ADD CONSTRAINT chk_query_length CHECK (char_length(query) <= 5000);

CREATE INDEX idx_chat_session ON ai_chat_messages (session_id);
CREATE INDEX idx_chat_user    ON ai_chat_messages (user_id);

-- ============================================================
-- AUDIT LOG  (append-only)
-- ============================================================
CREATE TABLE audit_log (
    log_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id      UUID        REFERENCES users(user_id) ON DELETE SET NULL,
    action        TEXT        NOT NULL,
    resource_type TEXT        NOT NULL,
    resource_id   UUID,
    ip_addr       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_actor    ON audit_log (actor_id);
CREATE INDEX idx_audit_resource ON audit_log (resource_type, resource_id);
CREATE INDEX idx_audit_time     ON audit_log (created_at);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert_only ON audit_log FOR INSERT WITH CHECK (true);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE refresh_tokens (
    token_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked    BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_user ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_hash ON refresh_tokens (token_hash);

-- ============================================================
-- RESEARCH PAPERS (extends media_items for research-specific metadata)
-- ============================================================
CREATE TABLE research_papers (
    paper_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id       UUID        NOT NULL UNIQUE REFERENCES media_items(item_id) ON DELETE CASCADE,
    authors       TEXT[]      NOT NULL DEFAULT '{}',
    co_authors    TEXT[]      NOT NULL DEFAULT '{}',
    publication_date DATE,
    doi           TEXT,
    journal       TEXT,
    conference    TEXT,
    reviewer_id   UUID        REFERENCES users(user_id) ON DELETE SET NULL,
    review_notes  TEXT,
    reviewed_at   TIMESTAMPTZ,
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_research_item ON research_papers (item_id);
CREATE INDEX idx_research_reviewer ON research_papers (reviewer_id);
CREATE INDEX idx_research_submitted ON research_papers (submitted_at);

-- ============================================================
-- STUDENT PROJECTS
-- ============================================================
CREATE TABLE student_projects (
    project_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id        UUID        NOT NULL UNIQUE REFERENCES media_items(item_id) ON DELETE CASCADE,
    team_members   TEXT[]      NOT NULL DEFAULT '{}',
    supervisor_id  UUID        REFERENCES users(user_id) ON DELETE SET NULL,
    academic_year  INT         NOT NULL,
    course_code    TEXT,
    web_url        TEXT,
    github_repo    TEXT,
    app_download   TEXT,
    approved_by    UUID        REFERENCES users(user_id) ON DELETE SET NULL,
    approved_at    TIMESTAMPTZ,
    submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE student_projects
    ADD CONSTRAINT chk_academic_year CHECK (academic_year >= 2000 AND academic_year <= 2100);

CREATE INDEX idx_project_item ON student_projects (item_id);
CREATE INDEX idx_project_supervisor ON student_projects (supervisor_id);
CREATE INDEX idx_project_year ON student_projects (academic_year);
CREATE INDEX idx_project_approved ON student_projects (approved_by);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Administrator  (password: Admin@12345)
INSERT INTO users (user_id, email, name, password_hash, role_tier) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'admin@cs.du.ac.bd',
    'Platform Admin',
    '$2a$12$9/T7O.Pwrapt.nlReO/3QeYWhJDClYIt1UlrdzB5yuHq.EoUPcTSC',
    'administrator'
);

-- Librarian  (password: Staff@12345)
INSERT INTO users (user_id, email, name, password_hash, role_tier) VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'librarian@cs.du.ac.bd',
    'Head Librarian',
    '$2a$12$p9V8CIW/ztTCdyzaEGdAYuUIEqXB.PaxIGnRyPm2U/tttHVdFVIA.',
    'librarian'
);

-- Researcher  (password: Research@12345)
INSERT INTO users (user_id, email, name, password_hash, role_tier) VALUES (
    'c0000000-0000-0000-0000-000000000003',
    'researcher@cs.du.ac.bd',
    'Faculty Researcher',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYxK5Z8Z9W.',
    'researcher'
);

-- Student  (password: Student@12345)
INSERT INTO users (user_id, email, name, password_hash, role_tier) VALUES (
    'd0000000-0000-0000-0000-000000000004',
    'student@cs.du.ac.bd',
    'Student User',
    '$2a$12$ZK5qL9v8rN7mP6xK1J2qXuYzN8tMQJqhN8/LewY5GyYxK5Z8Z9Wa',
    'student'
);

-- ISBN unique index for CSV upsert (partial — only when isbn is not null)
CREATE UNIQUE INDEX idx_catalog_isbn_unique ON library_catalog (isbn) WHERE isbn IS NOT NULL;
