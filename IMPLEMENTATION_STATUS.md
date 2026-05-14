# CSEDU Digital Knowledge Platform - Implementation Status

## Sprint 1 - ✅ COMPLETED

### Backend (Go API)
- ✅ User registration and JWT authentication (`api/internal/auth/handlers.go`)
- ✅ Role-based access control (RBAC) middleware (`api/internal/middleware/auth.go`)
- ✅ Library catalog CRUD operations (`api/internal/library/handlers.go`)
- ✅ Book checkout/return workflow with atomic transactions
- ✅ Fine calculation and payment tracking
- ✅ Media upload with MinIO integration (`api/internal/media/handlers.go`)
- ✅ Admin operations (user management, audit logs)

### Database
- ✅ PostgreSQL schema with pgvector extension (`infra/db/init.sql`)
- ✅ All core tables: users, library_catalog, loans, fines, payments, media_items, etc.
- ✅ Proper constraints: UNIQUE indexes, CHECK constraints, foreign keys
- ✅ Seed data for testing (admin, librarian, researcher, student users)
- ✅ Full-text search indexes on catalog and metadata

### Infrastructure
- ✅ Docker Compose setup with all services
- ✅ PostgreSQL with pgvector
- ✅ Redis for job queue and caching
- ✅ MinIO for file storage
- ✅ Nginx reverse proxy

### Workers
- ✅ Fine calculation worker (`api/cmd/fine-worker/main.go`)
  - Runs on configurable schedule (default: daily)
  - Calculates fines for overdue loans
  - Idempotent operation (safe to run multiple times)
  - Configurable fine rate and maximum fine cap

## Sprint 2 - 🚧 IN PROGRESS

### ✅ Completed in This Session

#### Backend Enhancements
1. **Fine Management System**
   - Added fine listing endpoint (`GET /api/v1/library/fines`)
   - Added fine payment endpoint (`POST /api/v1/library/fines/{fineId}/pay`)
   - Added fine waiver endpoint for staff (`POST /api/v1/library/fines/{fineId}/waive`)
   - Integrated with existing loan workflow

2. **Database Improvements**
   - Added UNIQUE constraint on `fines.loan_id` (one fine per loan)
   - Added UNIQUE constraint on `vector_embeddings(item_id, chunk_index)`
   - Ensures idempotent fine calculation and ingestion

3. **Fine Worker**
   - Implemented automated fine calculation cron job
   - Configurable via environment variables:
     - `FINE_RATE_BDT_PER_DAY` (default: 50.0)
     - `MAX_FINE_PER_LOAN_BDT` (default: 500.0)
     - `FINE_CALC_INTERVAL` (default: 24h)
   - Updates loan status to 'overdue'
   - Creates or updates fine records atomically

4. **RAG Service (Python FastAPI)** ✅ COMPLETE
   - FastAPI service with `/query`, `/embed`, `/embed-batch` endpoints
   - Hybrid retrieval (vector similarity + full-text search with RRF)
   - Sentence-transformers embedder (paraphrase-multilingual-MiniLM-L12-v2)
   - Groq LLM integration with Gemini fallback
   - Access control at retrieval layer (filters by user role)
   - Bilingual support (English + Bangla) with language detection
   - Query rewriting capability
   - Model tier selection (simple/long/complex)
   - Dockerfile with model pre-download

5. **Ingestion Worker** ✅ COMPLETE
   - Redis queue consumer for ingestion jobs
   - PyMuPDF text extraction from PDFs
   - Text chunking (512 tokens, 50-token overlap)
   - Embedding generation via RAG service
   - pgvector storage with idempotent operations
   - Status tracking (processing/completed/failed)

6. **AI Chat Integration** ✅ COMPLETE
   - Updated `api/internal/ai/handlers.go` to call RAG service
   - Chat endpoint with RAG service integration
   - Summarization endpoint using RAG service
   - Chat history storage and retrieval
   - Language support (auto-detect, EN, BN)
   - Query rewriting option
   - Citation extraction with document titles
   - Session management

7. **Frontend AI Chat Enhancement** ✅ COMPLETE
   - Updated API client (`lib/api.ts`) with language and rewrite_query parameters
   - Enhanced AI chat interface with language selector (Auto/EN/BN)
   - Added query rewriting toggle for admins
   - Display model used, detected language, and rewrite status
   - Improved citation display with sources section
   - Better error handling and user feedback
   - Bilingual example queries (English + Bangla)

8. **Frontend Fines Management** ✅ COMPLETE
   - Created `FinesList` component with full fine management UI
   - Display outstanding fines with payment options
   - Payment history with paid/waived status
   - Fine summary dashboard (total, unpaid count, unpaid amount)
   - Staff can waive fines (role-based permission check)
   - Fine policies information display
   - Updated API client with fine-related methods (getMyFines, payFine, waiveFine)

9. **Research Repository Backend** ✅ COMPLETE
   - Created `research_papers` table with extended metadata
   - Implemented research handlers (`api/internal/research/handlers.go`)
   - Submit research paper endpoint (researchers only)
   - List/get research papers with role-based filtering
   - Submit for review workflow
   - Review/approve/reject workflow (staff only)
   - Integrated with media_items and media_metadata tables

10. **Student Projects Backend** ✅ COMPLETE
    - Created `student_projects` table with team and supervisor tracking
    - Implemented projects handlers (`api/internal/projects/handlers.go`)
    - Submit project endpoint (students only)
    - List/get projects with filtering by year and status
    - Approve/reject workflow (staff only)
    - Supervisor validation (students cannot supervise)
    - Academic year validation (2000-2100)

11. **Research & Projects API Integration** ✅ COMPLETE
    - Added routes to main API (`api/cmd/api/main.go`)
    - Research endpoints: POST /, GET /, GET /{paperId}, POST /{paperId}/submit-for-review, POST /{paperId}/review
    - Projects endpoints: POST /, GET /, GET /{projectId}, POST /{projectId}/approve
    - Role-based access control for all endpoints
    - Updated API client (`lib/api.ts`) with all research and project methods

12. **Specialized Upload Forms** ✅ COMPLETE
    - Created `ResearchUploadForm` component with research-specific fields (authors, co-authors, DOI, journal, conference)
    - Created `ProjectUploadForm` component with project-specific fields (team members, supervisor, academic year, course code)
    - Fixed MIME type issues in dropzone (proper MIME types instead of file extensions)
    - Each upload type has distinct UI and validation
    - Research: PDF/DOCX only, requires authors and abstract
    - Projects: Multiple formats (PDF/DOCX/PPTX/MP4/Images), requires team members and academic year
    - Archive: Uses generic UploadForm with appropriate restrictions

13. **AI Chat Consolidation** ✅ COMPLETE
    - Removed dedicated `/ai-chat` page
    - Removed `AIChatInterface` component
    - Kept only `FloatingChatWidget` (bottom-right floating button)
    - Updated all navigation links to remove AI chat page references
    - Updated home page to mention floating AI assistant
    - Cleaner UX with single AI chat interface

14. **Project Documentation** ✅ COMPLETE
    - Created comprehensive `PROJECT_SETUP.md` with:
      - Prerequisites and environment setup
      - Docker Compose and local development instructions
      - All service ports and URLs
      - Default test accounts for all roles
      - Step-by-step testing workflows for all features
      - Database verification queries
      - Troubleshooting guide
      - Architecture diagram

### ❌ Remaining Sprint 2 Tasks

#### Backend Features
1. **SSO Integration** - LOW PRIORITY (deferred)
   - OAuth 2.0 callback handler
   - Token exchange
   - User profile mapping

#### Frontend Components
1. **Member Dashboard** - PARTIALLY COMPLETE
   - ✅ Active loans display (implemented in loans page)
   - ✅ Fine balance and payment (implemented in fines page)
   - ✅ Borrowing history (implemented in loans page)
   - ❌ Hold requests (not yet implemented)

2. **Librarian Dashboard** - PARTIALLY COMPLETE
   - ❌ Checkout/return interface (needs dedicated UI)
   - ❌ Barcode scanner input
   - ❌ Overdue alerts
   - ✅ Fine management (waive fine capability added)
   - ❌ Bulk catalog import

3. **Admin Dashboard** - PARTIALLY COMPLETE
   - ✅ User management (implemented in admin handlers)
   - ✅ Role assignment (implemented)
   - ❌ System statistics dashboard
   - ❌ Audit log viewer

4. **AI Chat Widget** - ✅ COMPLETE
   - ✅ Floating chat interface
   - ✅ Multi-turn conversation
   - ✅ Citation display
   - ✅ Language selection (EN/BN/Auto)
   - ✅ Query rewriting for admins

5. **Research Portal** - ✅ COMPLETE
   - ✅ Research paper listing and display (uses existing ResearchGrid component)
   - ✅ Backend submission workflow implemented
   - ✅ Backend review process (draft → review → published)
   - ✅ Frontend submission form (ResearchUploadForm with specialized fields)

6. **Project Showcase** - ✅ COMPLETE
   - ✅ Project listing and display (uses existing ProjectsGrid component)
   - ✅ Backend submission workflow implemented
   - ✅ Backend approval workflow (staff only)
   - ✅ Frontend submission form (ProjectUploadForm with specialized fields)

#### Bilingual Support - PARTIALLY COMPLETE
- ❌ Frontend i18n setup (English + Bangla) - needs next-i18next or similar
- ❌ Database content in both languages - needs migration
- ✅ AI query language detection (implemented in RAG service)
- ✅ Response generation in user's language (implemented in RAG service)

## Environment Configuration

### Required Environment Variables

```bash
# Database
DB_USER=csedu_user
DB_PASSWORD=changeme_in_dev
DB_NAME=csedu_platform
DB_HOST=postgres
DB_PORT=5432

# Redis
REDIS_URL=redis://redis:6379

# MinIO
MINIO_ENDPOINT=minio:9000
MINIO_USER=minioadmin
MINIO_PASSWORD=changeme_in_dev
MINIO_BUCKET=csedu-files

# JWT
JWT_SECRET=super_secret_jwt_key_change_this
JWT_EXPIRY_HOURS=1
REFRESH_EXPIRY_DAYS=7

# Fine Calculation
FINE_RATE_BDT_PER_DAY=50.0
MAX_FINE_PER_LOAN_BDT=500.0
FINE_CALC_INTERVAL=24h

# Groq API (Sprint 2)
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
GROQ_MODEL_SIMPLE=llama-3.1-8b-instant
GROQ_MODEL_LONG=meta-llama/llama-4-scout-17b-16e-instruct
GROQ_MODEL_COMPLEX=openai/gpt-oss-120b

# Gemini API (Sprint 2 - Fallback)
GEMINI_API_KEY=xxxxxxxxxxxxxxxxxxxx

# SSO (Sprint 2)
SSO_CLIENT_ID=
SSO_CLIENT_SECRET=
SSO_REDIRECT_URI=http://localhost/api/v1/auth/sso/callback
SSO_PROVIDER_URL=
```

## API Endpoints Summary

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/logout` - Logout

### Library Catalog
- `GET /api/v1/library/catalog` - List catalog (with search, filters, pagination)
- `GET /api/v1/library/catalog/{itemId}` - Get catalog item details

### Loans
- `POST /api/v1/library/loans` - Borrow a book
- `GET /api/v1/library/loans` - List user's loans
- `POST /api/v1/library/loans/{loanId}/return` - Return a book
- `GET /api/v1/library/loans/all` - List all loans (staff/admin)

### Fines
- `GET /api/v1/library/fines` - List user's fines
- `POST /api/v1/library/fines/{fineId}/pay` - Pay a fine
- `POST /api/v1/library/fines/{fineId}/waive` - Waive a fine (staff/admin)

### Media
- `GET /api/v1/media` - List media items
- `GET /api/v1/media/{itemId}` - Get media details
- `POST /api/v1/media/upload` - Upload media
- `GET /api/v1/media/my-uploads` - List user's uploads
- `GET /api/v1/media/{itemId}/download` - Download media file

### Admin
- `GET /api/v1/admin/users` - List all users
- `PATCH /api/v1/admin/users/{userId}/role` - Update user role
- `GET /api/v1/admin/audit-log` - View audit log
- `GET /api/v1/admin/catalog/export` - Export catalog as CSV
- `POST /api/v1/admin/catalog/import` - Import catalog from CSV
- `PATCH /api/v1/admin/media/{itemId}/status` - Update media status

### AI (Sprint 2 - Pending)
- `POST /api/v1/ai/chat` - AI chat query
- `GET /api/v1/ai/chat/history/{sessionId}` - Get chat history
- `POST /api/v1/ai/summarize` - Summarize document

## Testing Checklist

### Backend Tests
- [ ] User registration and login flow
- [ ] JWT token generation and validation
- [ ] RBAC middleware enforcement
- [ ] Book checkout with availability check
- [ ] Book return with inventory update
- [ ] Fine calculation accuracy
- [ ] Fine payment processing
- [ ] Concurrent loan attempts (race condition)
- [ ] Overdue fine blocking checkout

### Integration Tests
- [ ] Full borrow → overdue → fine → payment cycle
- [ ] Media upload → storage → retrieval
- [ ] Admin role assignment and permission changes

### End-to-End Tests (Pending Frontend)
- [ ] Student borrowing journey
- [ ] Librarian checkout workflow
- [ ] Admin user management
- [ ] AI query with access control

## Next Steps (Priority Order)

1. **Implement RAG Service** (Python FastAPI)
   - Set up FastAPI application structure
   - Implement document ingestion pipeline
   - Integrate MiniLM for embeddings
   - Implement hybrid retrieval (pgvector + FTS)
   - Add Groq LLM integration with Gemini fallback
   - Implement access control filtering

2. **Implement Ingestion Worker**
   - Redis queue consumer
   - PDF text extraction
   - Chunking logic
   - Embedding generation
   - pgvector storage

3. **Complete AI Endpoints in Go API**
   - Chat endpoint with RAG service proxy
   - History retrieval
   - Summarization endpoint

4. **Frontend Implementation**
   - Member dashboard
   - Librarian dashboard
   - AI chat widget
   - Research portal
   - Project showcase

5. **Bilingual Support**
   - i18n setup
   - Language detection
   - Translated UI components

6. **SSO Integration**
   - OAuth 2.0 flow
   - Token exchange
   - User profile mapping

## Known Issues and Limitations

1. **Fine Worker**: Currently runs on a fixed schedule. Consider implementing real-time fine calculation on return.

2. **Payment Gateway**: Currently stubbed. Integration with actual payment gateway (bKash, Nagad, etc.) needed for production.

3. **Barcode Scanner**: Frontend input field accepts keyboard input. Physical HID scanner integration needs testing.

4. **RAG Service**: Not yet implemented. This is the most critical missing piece for Sprint 2.

5. **Bilingual Support**: Database schema supports it, but UI and AI responses need implementation.

## Deployment Notes

### Development
```bash
docker-compose up -d
```

### Production Considerations
1. Use Docker secrets for sensitive environment variables
2. Enable TLS/HTTPS in Nginx
3. Set up proper backup strategy for PostgreSQL
4. Configure Redis persistence
5. Set up monitoring (Prometheus + Grafana)
6. Implement rate limiting for API endpoints
7. Add request logging and audit trail
8. Configure proper CORS origins

## Documentation References

- SDD Document: `sdd_text.txt`
- SRS Document: `Team_Devops_SRS_V02.pdf`
- Feedback PDF: `CamScanner 17-04-2026 01.34.pdf`
- Database Schema: `infra/db/init.sql`
- Docker Compose: `docker-compose.yml`

---

**Last Updated**: Current Session
**Status**: Sprint 1 Complete, Sprint 2 In Progress (Core Backend Features Implemented)
