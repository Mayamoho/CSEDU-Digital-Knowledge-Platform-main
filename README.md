# CSEDU Digital Knowledge Platform

A unified academic knowledge platform for the Department of Computer Science and
Engineering, University of Dhaka — digital archive, research repository, student
project showcase and library circulation system, with a retrieval-augmented (RAG)
AI assistant over everything the platform stores.

**CSE 4113 — Internet Programming Lab · Team Devops**

| | |
|---|---|
| **Live application** | <https://devops.farefin.com> |
| **API base URL** | <https://devops.farefin.com/api/v1> |
| **API health** | <https://devops.farefin.com/api/v1/health> |
| **API documentation** | [`docs/api/`](docs/api/) — Postman collection, 90 requests across 16 folders |
| **Architecture diagrams** | [`docs/diagrams/`](docs/diagrams/) — open `index.html` in a browser |
| **Design documents** | `Team_Devops_SDD.pdf` · `Team_Devops_SRS_V02.pdf` |

---

## 1. Features

**Library** — catalogue search with faceted filters, borrowing and returns,
barcode circulation desk for librarians, holds/reservations, automatic overdue
fines, simulated bKash/Nagad OTP payments and in-person cash settlement, CSV
bulk import/export.

**Digital archive** — multi-format uploads (PDF, video, image, audio, office
documents, external links) with five access tiers enforced on every read.

**Research repository** — submission, peer review and publication workflow with
reviewer assignment, review notes and draft resubmission.

**Student projects** — showcase with team members, supervisor, course code, live
demo/repository links, and staff approval before publication.

**AI assistant (RAG)** — hybrid retrieval (pgvector cosine similarity fused with
PostgreSQL full-text search) over every indexed document, grounded answers with
citations, streamed token-by-token over Server-Sent Events, Groq primary with
Gemini fallback, per-document summarisation.

**Platform** — JWT authentication with Google OAuth 2.0 and passwordless
magic-link sign-in, five-tier RBAC, verified role-upgrade requests, in-app and
email notifications, resource ratings and reviews, full English/বাংলা interface,
append-only audit log, Prometheus metrics.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui + Radix | Server components give SEO-friendly public pages and fast first paint; one language across UI and types |
| State | React Context (`AuthProvider`, `I18nProvider`) + server components | The app has little global client state; Redux/Zustand would add ceremony without benefit |
| Backend | Go 1.23, chi router — modular monolith | Fast, statically compiled, small containers; clean internal packages can be extracted into services later |
| RAG service | Python 3.11, FastAPI | The ML ecosystem (sentence-transformers, PyMuPDF, langdetect) is Python-native |
| Database | PostgreSQL 16 + pgvector + full-text search | One store for relational data *and* 768-dim vectors — no separate vector database to operate |
| Cache / queue | Redis | Ingestion job queue, 5-minute AI response cache, magic-link tokens |
| Object storage | MinIO (S3-compatible) | Zero cloud cost; migrating to real S3 is a config change |
| Embeddings | `paraphrase-multilingual-MiniLM-L12-v2` (local) | Runs in-container, no API cost, supports Bangla |
| LLM | Groq free tier (llama-3.1-8b / llama-3.3-70b / gpt-oss-120b), Gemini 2.5 Flash fallback | Free, fast, OpenAI-compatible; tiered by query complexity |
| Email | Brevo SMTP (free tier) | Overdue notices, hold alerts, magic links |
| Reverse proxy | nginx (rate limiting, security headers, SSE pass-through) | Single entry point; the stack publishes exactly one host port |
| Deployment | Docker Compose on an Azure VM, images built in GitHub Actions and served from GHCR | Compose gives most of the orchestration benefit at a fraction of the complexity |

## 3. Repository layout

The application that is deployed lives at the repository root.

```
.
├── app/                 # Next.js App Router — (auth) and (main) route groups
├── components/          # Feature-sliced React components + shadcn/ui primitives
├── hooks/  lib/         # Shared hooks; API client, auth context, i18n, types
├── api/                 # Go API (modular monolith)
│   ├── cmd/api          #   HTTP server and route table
│   ├── cmd/fine-worker  #   Nightly overdue-fine cron
│   ├── cmd/ingestion-worker
│   └── internal/        #   auth, library, loan, fine, media, research,
│                        #   projects, reviews, roles, notify, admin, ai,
│                        #   middleware, storage, mailer, db
├── rag/                 # Python FastAPI RAG service (embed, retrieve, generate)
├── infra/
│   ├── db/init.sql      # Schema, constraints, indexes, seed data
│   ├── db/migrations/   # Idempotent numbered migrations 001–014
│   ├── nginx/           # Reverse proxy, rate limits, security headers
│   └── prometheus/      # Scrape configuration
├── docs/
│   ├── api/             # Postman collection + environments
│   └── diagrams/        # Mermaid sources + index.html viewer
├── docker-compose.yml            # Development
├── docker-compose.prod.yml       # Production (only host port 8080 published)
├── docker-compose.ghcr.yml       # Production overlay: pull prebuilt images
└── .github/workflows/deploy.yml  # test → build → push to GHCR → deploy → smoke
```

> `frontend/` and `backend/` are an earlier restructuring experiment. They are
> **not** deployed and are excluded from the TypeScript build; treat the root
> tree as the source of truth.

## 4. Local setup

**Prerequisites:** Docker Engine + Compose plugin, Node.js 20+, and (for backend
work outside Docker) Go 1.23 and Python 3.11.

```bash
git clone https://github.com/Mayamoho/CSEDU-Digital-Knowledge-Platform-main.git
cd CSEDU-Digital-Knowledge-Platform-main

cp .env.example .env          # then fill in the values described below
docker compose up -d          # postgres, redis, minio, api, rag, workers, nginx

npm install                   # frontend dependencies
npm run dev                   # http://localhost:3000
```

The schema in `infra/db/init.sql` runs automatically on a fresh database volume
and seeds four demo accounts (admin, librarian, researcher, student — see
`SERVER_DEPLOY.md`). Rotate those passwords before exposing an instance.

Applying a new migration locally:

```bash
docker compose exec -T postgres psql -U csedu_user -d csedu_platform \
  < infra/db/migrations/014_role_request_verification.sql
```

### Environment variables

Copy `.env.example` (development) or `.env.production` (deployment template).
Neither file contains real secrets — both ship with placeholders.

| Variable | Purpose |
|---|---|
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` / `DB_HOST` / `DB_PORT` | PostgreSQL connection |
| `REDIS_URL` | Cache and job queue |
| `MINIO_USER` / `MINIO_PASSWORD` / `MINIO_BUCKET` / `MINIO_ENDPOINT` | Object storage |
| `JWT_SECRET` | HS256 signing key — generate with `openssl rand -hex 32` |
| `JWT_EXPIRY_HOURS` / `REFRESH_EXPIRY_DAYS` | Token lifetimes (default 1 hour / 7 days) |
| `FINE_RATE_BDT_PER_DAY` / `MAX_FINE_PER_LOAN_BDT` / `FINE_BLOCK_THRESHOLD_BDT` / `LOAN_PERIOD_DAYS` | Circulation and fine policy |
| `GROQ_API_KEY` / `GROQ_MODEL_*` | Primary LLM |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Fallback LLM and query rewriting |
| `EMBEDDING_MODEL` / `CHUNK_SIZE` / `CHUNK_OVERLAP` / `TOP_K_RESULTS` | RAG pipeline tuning |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Email (leave `SMTP_HOST` empty to disable) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth sign-in (leave blank to hide the button) |
| `NEXT_PUBLIC_API_URL` | API base as seen by the browser (`/api/v1` behind nginx) |

## 5. Running the tests

```bash
# Go — unit tests with coverage
cd api && go vet ./... && go test ./... -cover

# Python — RAG keyword extraction
cd rag && pytest -q test_keyword_extractor.py

# Frontend — type checking and production build
npx tsc --noEmit
npm run build
```

Covered today: JWT issuing and validation, including tampered-payload,
`alg=none`, foreign-secret and expiry rejection; the `Authenticate` /
`RequireRole` / `OptionalAuth` middleware chain against the full RBAC matrix; the
fine calculation rule and its cap; barcode normalisation; RAG keyword parsing.
The same commands run in CI on every push to `main` and gate the image build.

## 6. API documentation

Import into Postman:

1. `docs/api/CSEDU-Platform.postman_collection.json`
2. `docs/api/CSEDU-Platform.postman_environment.json` (or `.local.json`)
3. Run **1. Auth → Login (admin)** — the test script stores the access token and
   every other request inherits it.

Conventions: REST over JSON, versioned by URL prefix (`/api/v1`), bearer-token
auth, `{"error": "..."}` error bodies, `page`/`per_page` pagination with a
`total` count. `OptionalAuth` routes work anonymously and simply return more when
a token is present.

## 7. Deployment

Push to `main`. GitHub Actions runs the test gate, builds four images
(frontend, api, rag, fine-worker) on its own runners, pushes them to GHCR, then
connects to the VM over SSH to apply migrations, pull the new images, restart the
stack and smoke-check the site. See `SERVER_DEPLOY.md` for first-time server
setup and `DEPLOYMENT.md` for alternatives.

Production publishes exactly one host port (8080) — the VM is shared with other
teams. A host-level nginx terminates TLS for `devops.farefin.com` and proxies to
it. Everything else (PostgreSQL, Redis, MinIO, the RAG service, the workers)
stays on the private Docker network.

## 8. Security

- Passwords hashed with bcrypt (cost 12); accounts lock for 15 minutes after 5
  consecutive failed sign-ins.
- Access tokens are short-lived JWTs; refresh tokens are stored hashed and can be
  revoked server-side at logout.
- Role tier is read from the **signed token**, never from the request body.
  Self-registration always forces `student`; privileged roles come only from an
  administrator decision on a verified role request.
- Access tiers are enforced in SQL, including inside the RAG retriever — the
  model never sees a document the caller may not read.
- nginx applies rate limits (60 requests/minute on credential endpoints, 60/min
  on AI routes, 20/s elsewhere), per-IP connection limits and security headers.
- No credentials are committed. `.env.production` holds placeholders; runtime
  secrets live in the VM's untracked `.env`, and deployment secrets in GitHub
  Actions secrets.
- Every privileged action writes to an append-only `audit_log` table protected by
  a row-level-security INSERT-only policy.

## 9. Team

| Name | Student ID |
|---|---|
| Mehedi Hasan Sakib | 2021-511-189 |
| Sumaiya Tabassum | 2021-611-205 |
| Md. Abu Kawser | 2021-211-209 |

28th Batch · Department of Computer Science and Engineering · University of Dhaka
