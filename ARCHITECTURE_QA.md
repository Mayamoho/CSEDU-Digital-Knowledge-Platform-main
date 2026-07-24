# Architecture Q&A — CSEDU Digital Knowledge Platform

Prep sheet for a 10-minute viva. Grouped by topic. Each entry: **likely question → answer you give**.

---

## 0. 30-second elevator pitch

> A digital knowledge platform for the CSEDU department: a library catalog + research/project archive + an AI assistant (RAG) over all of it. Role-based access (public → student → researcher → librarian → administrator). Microservice-ish: a Next.js frontend, a Go API, a Python RAG service, Postgres+pgvector, Redis, MinIO — all behind one nginx entry point on port 8080.

---

## 1. High-level architecture

**Q: Describe the overall architecture.**
Three main tiers behind nginx:
- **Frontend** — Next.js (React, standalone build) on :3000
- **API** — Go (chi router) on :8080
- **RAG service** — Python FastAPI on :8001
Backing stores: **PostgreSQL + pgvector** (relational + vector), **Redis** (job queue + cache + magic-link tokens), **MinIO** (S3-compatible object storage for files). Two background workers: **ingestion-worker** (text extract + embed) and **fine-worker** (overdue fine accrual). Observability: **Prometheus + Grafana**.

**Q: Why nginx in front / why one port?**
Shared VM with other teams — only host port 8080 is ours. nginx reverse-proxies `/` → frontend, `/api/v1/*` → Go API. Everything else lives on the private Docker network, unreachable from the host. One entry point = one TLS/security surface, no CORS pain between browser and API.

**Q: Why split the RAG service out of the Go API instead of one binary?**
Different language ecosystems. Embeddings/LLM tooling (fastembed, langdetect, LLM SDKs) is Python-native. Keeping it separate lets the AI service scale/restart independently and keeps heavy ML deps out of the Go build. Go API calls RAG over internal HTTP (`http://rag:8001`).

**Q: How do services find each other?**
Docker Compose service names resolve on the internal network (`rag`, `postgres`, `redis`, `minio`). Network is project-scoped so another team's `postgres` container never collides with ours.

---

## 2. Authentication & Authorization

**Q: How does auth work?**
Stateless **JWT** (HS256, signed with `JWT_SECRET`). On login the API issues an access token carrying `user_id` + `role_tier`, plus a **refresh token** (hashed, stored in `refresh_tokens` table). Middleware `Authenticate` strips the `Bearer` header, validates the token, injects `user_id` and `role_tier` into request context. There's also an optional-auth middleware for endpoints public users can hit.

**Q: Token lifetime / refresh?**
Access token expiry is config-driven (`expiryHours()`); refresh token persists in DB with `expires_at` and is exchanged at `/refresh`. Magic-link tokens live 15 min in Redis; Google OAuth state cookie 10 min.

**Q: What login methods are supported?**
1. Email + password. 2. **Magic link** (passwordless — SMTP emails a link, token in Redis). 3. **Google OAuth2** (stdlib, token delivered via URL fragment). `/auth/providers` tells the frontend which buttons to show so Google is hidden when unconfigured.

**Q: Explain the RBAC model.**
Five tiers: `public < student < researcher < librarian < administrator`. Two orthogonal ideas:
- **Permissions** — `ROLE_PERMISSIONS` map (e.g. `manage_catalog`, `download_public_research`). Checked with `hasPermission`.
- **Access tiers** on content — each media item has an `access_tier`; `canAccessContent` compares numeric role level ≥ content level.
Frontend gates with a `<RoleGate>` component; backend enforces with `RequireRole` middleware. **Frontend gating is UX only — the API is the real guard.**

**Q: Known security fix here?**
Earlier, registration accepted a client-supplied role → self-escalation to librarian/admin. Now the register path forces `student`; elevation only via the admin-reviewed **role request** flow (with university ID + evidence upload).

---

## 3. The RAG / AI assistant (the star feature)

**Q: Walk me through what happens when a user asks the AI a question.**
1. Frontend → Go API `/api/v1/ai/...` (`Chat` handler).
2. Go forwards query + `role_tier` + language + session to RAG at `http://rag:8001/query` (or `/query/stream` for SSE streaming).
3. RAG **retriever** builds the answer context:
   - maps role → allowed `access_tiers`,
   - embeds the query,
   - runs **vector search** (`pgvector`, cosine via `<=>` operator) over `vector_embeddings`,
   - adds a **corpus inventory** (catalog + media listing) and **full-text** media search,
   - all filtered by `access_tier = ANY(allowed)`.
4. **LLM client** generates the answer from retrieved context, with tiered model selection.
5. Response + citations returned; Go stores the turn in `ai_chat_messages` and maps citations to source docs.

**Q: What embedding model / vector setup?**
`fastembed` with a BGE model; embeddings stored in Postgres `vector_embeddings` via the **pgvector** extension. Similarity = `1 - (embedding <=> query)` (cosine distance). Search limit ~16 candidates.

**Q: Which LLM? Cost control?**
**Groq** is primary (fast), with a **model tier** system: `simple` → llama-3.1-8b-instant, `long` → llama-3.3-70b, `complex` → gpt-oss-120b. **Gemini** (gemini-flash) is the fallback. If both fail there's a keyword-only fallback so the app never hard-errors. Streaming tries Groq token stream first; if it fails *before* the first token, it falls back cleanly.

**Q: How is access control enforced inside RAG (can a student see restricted docs)?**
Retrieval itself is filtered: role → access-tier list → every SQL query has `AND access_tier = ANY(%s)`. So restricted content is never even retrieved into the LLM context, not just hidden in the UI.

**Q: Multilingual?**
`langdetect` on the query; the platform also has a Bangla (BN) UI toggle done via a client-side DOM text-node walker + BN dictionary.

---

## 4. Ingestion pipeline

**Q: What happens when a librarian uploads a document?**
1. File → MinIO (object storage), metadata row → `media_items` / `media_metadata`.
2. Go API pushes an ingestion job to **Redis**.
3. **ingestion-worker** picks it up: extracts text (PDF etc.), calls RAG `/ingest/{item_id}` to embed + store vectors, updates ingestion status.
This is async so the upload request returns fast; embedding happens in the background.

**Q: Why a queue instead of doing it inline?**
Embedding + text extraction is slow and CPU-heavy. Decoupling keeps the API responsive and lets ingestion retry/scale independently.

---

## 5. Data model

**Q: Key tables?**
`users`, `media_items` + `media_metadata`, `library_catalog`, `loans`, `fines`, `payments`, `holds`, `vector_embeddings`, `ai_chat_messages`, `audit_log`, `refresh_tokens`, `research_papers`, `student_projects`. Migrations are numbered SQL files (`001…014`) applied on top of `init.sql`.

**Q: Why pgvector instead of a dedicated vector DB (Pinecone/Weaviate)?**
Keeps one datastore — vectors live next to relational data, so an access-tier JOIN/filter is a plain SQL `WHERE`, transactional, no extra service to run on a 4 GiB VM. Good enough at this corpus size.

**Q: Postgres gotchas you hit?** (good to show real experience)
- pgx can't scan `timestamptz`/`date` into Go `*string` → use `to_char()`.
- Array param inside `COALESCE(.., '{}')` infers as `text` not `text[]` → add `::text[]` cast.

---

## 6. Library domain logic

**Q: Loans / fines / holds?**
Loan checkout/return endpoints; loan period 7 days (migration 003). Overdue fines accrued by the **fine-worker** background service. Holds queue for checked-out items with barcode lookup. **Payments**: simulated bKash/Nagad OTP gateway (`payment_sessions`, initiate/confirm) plus in-person cash confirmation — demo, not a real PSP.

**Q: Audit trail?**
`audit.go` middleware + `audit_log` table record sensitive admin actions (role changes, deletes, catalog import/export).

---

## 7. Deployment & Ops

**Q: How is it deployed?**
Docker Compose (`docker-compose.prod.yml`) on an Azure VM. `deploy.sh` does `git reset --hard origin/main`, rebuilds changed images, brings the stack up exposing only nginx:8080. `.env` lives outside git (secrets).

**Q: Any deploy gotchas?**
- After redeploy nginx can cache the old API container IP → 502 on login; fix = restart nginx.
- quick-update can hang at migration if RAG holds an idle-in-transaction lock on `media_items` → terminate the backend via `pg_stat_activity`.

**Q: Observability?**
Prometheus scrapes API + RAG (`/metrics`, prometheus_client counters/histograms); Grafana dashboards. `metrics.go` middleware instruments the Go side.

**Q: Secrets management?**
`.env` from `.env.production` template; `JWT_SECRET` via `openssl rand -hex 32`, DB/MinIO passwords, Groq/Gemini keys. Never committed.

---

## 8. Likely "why" / trade-off questions

**Q: Why Go for the API?**
Fast, statically compiled, small container, great concurrency for the worker + HTTP fan-out to RAG. chi router keeps it lightweight (no heavy framework).

**Q: Why Next.js?**
SSR/standalone build, file-based routing matching the domain (`catalog`, `research`, `archive`, `admin`…), good DX, ships one image.

**Q: Biggest scalability bottleneck?**
The 4 GiB VM and single Postgres. Vector search and LLM calls are the heaviest paths. Scale-out plan: move vectors to a dedicated index if corpus grows, add RAG replicas, put Postgres on managed infra.

**Q: Single points of failure?**
Postgres (one instance), nginx (one entry). LLM has provider fallback so it's resilient; retrieval degrades gracefully to keyword-only.

**Q: What would you improve with more time?**
Automated tests (thin now), cookie-based JWT instead of fragment/localStorage, real SSO, fix the RAG idle-transaction leak, HA Postgres.

---

## 9. One-liner cheat answers (rapid fire)

- **Vector similarity operator?** pgvector `<=>` (cosine distance).
- **LLM primary/fallback?** Groq → Gemini → keyword-only.
- **Auth token type?** Stateless JWT HS256 + DB-stored refresh token.
- **How many host ports open?** One — 8080 (nginx).
- **Access control enforcement point?** API middleware + tier-filtered SQL in RAG; frontend RoleGate is UX only.
- **Async work transport?** Redis queue → ingestion-worker.
- **File storage?** MinIO (S3-compatible).
- **Role tiers?** public, student, researcher, librarian, administrator.
