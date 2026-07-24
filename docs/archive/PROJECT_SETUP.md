# CSEDU Digital Knowledge Platform - Setup & Run Guide

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)
- Go 1.21+ (for local development)
- Python 3.11+ (for RAG service)

## Environment Setup

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Configure API Keys in `.env`:**
   ```bash
   # Required for AI features
   GROQ_API_KEY=your_groq_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Update passwords for production
   DB_PASSWORD=your_secure_password
   MINIO_PASSWORD=your_secure_password
   JWT_SECRET=your_secure_jwt_secret_min_32_chars
   ```

## Running the Full Stack

### Option 1: Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Services and Ports:
- **Frontend (Next.js)**: http://localhost:3000
- **Backend API (Go)**: http://localhost:8080
- **RAG Service (Python)**: http://localhost:8001
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379
- **MinIO**: http://localhost:9000 (Console: http://localhost:9001)
- **Nginx**: http://localhost:80

### Option 2: Local Development

#### 1. Start Infrastructure Services
```bash
# Start only database, redis, and minio
docker-compose up postgres redis minio -d
```

#### 2. Run Backend API
```bash
cd api
go mod download
go run cmd/api/main.go
```

#### 3. Run RAG Service
```bash
cd rag
pip install -r requirements.txt
python main.py
```

#### 4. Run Workers

**Fine Calculation Worker:**
```bash
cd api
go run cmd/fine-worker/main.go
```

**Ingestion Worker:**
```bash
cd api
go run cmd/ingestion-worker/main.go
```

#### 5. Run Frontend
```bash
npm install
npm run dev
```

## Initial Setup & Testing

### 1. Access the Application
Navigate to http://localhost:3000

### 2. Default Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@cs.du.ac.bd | Admin@12345 |
| Librarian | librarian@cs.du.ac.bd | Staff@12345 |
| Researcher | researcher@cs.du.ac.bd | Research@12345 |
| Student | student@cs.du.ac.bd | Student@12345 |

### 3. Test Workflows

#### A. Upload Research Paper (Researcher)
1. Login as researcher
2. Navigate to "Upload" → "Research Paper"
3. Fill in required fields:
   - Title
   - Authors (comma-separated)
   - Abstract
   - Keywords
   - Upload PDF file
4. Submit for review
5. Login as librarian/admin to review and approve

#### B. Upload Student Project (Student)
1. Login as student
2. Navigate to "Upload" → "Student Project"
3. Fill in required fields:
   - Title
   - Team members
   - Supervisor
   - Academic year
   - Abstract
   - Upload project file
4. Submit
5. Login as librarian/admin to approve

#### C. Test AI Chat
1. Login with any account
2. Click floating chat widget (bottom-right)
3. Ask questions like:
   - "What research has been done on machine learning?"
   - "Find books about algorithms"
   - "মেশিন লার্নিং সম্পর্কে গবেষণা দেখান" (Bengali)

#### D. Library Workflow
1. Login as student
2. Browse catalog
3. Borrow a book
4. Check "My Loans"
5. Return book or wait for overdue (fine calculation runs daily)
6. Check "Fines" page
7. Pay fine

#### E. Fine Management
1. Login as librarian/admin
2. View all loans
3. Waive fines if needed
4. Run fine calculation manually (if needed)

## Verifying Database Integration

### Check if uploads are in database:

```bash
# Connect to PostgreSQL
docker exec -it csedu-postgres psql -U csedu_user -d csedu_platform

# Check media items
SELECT item_id, title, item_type, status FROM media_items;

# Check research papers
SELECT p.paper_id, m.title, m.status, p.authors 
FROM research_papers p 
JOIN media_items m ON p.item_id = m.item_id;

# Check student projects
SELECT sp.project_id, m.title, m.status, sp.academic_year 
FROM student_projects sp 
JOIN media_items m ON sp.item_id = m.item_id;

# Check vector embeddings (after ingestion)
SELECT item_id, chunk_index, LEFT(chunk_text, 50) 
FROM vector_embeddings 
LIMIT 10;
```

## Troubleshooting

### Issue: Services not starting
```bash
# Check logs
docker-compose logs [service-name]

# Restart specific service
docker-compose restart [service-name]

# Rebuild specific service
docker-compose up --build [service-name]
```

### Issue: Database not initialized
```bash
# Check if init.sql ran
docker-compose logs postgres | grep "init.sql"

# Manually run init script
docker exec -i csedu-postgres psql -U csedu_user -d csedu_platform < infra/db/init.sql
```

### Issue: RAG service not working
```bash
# Check if models are downloaded
docker-compose logs rag

# Check if embeddings are being created
docker-compose logs ingestion-worker
```

### Issue: File uploads failing
```bash
# Check MinIO is running
docker-compose ps minio

# Check MinIO logs
docker-compose logs minio

# Access MinIO console: http://localhost:9001
# Login: minioadmin / changeme_in_prod
```

## Development Tips

### Hot Reload
- Frontend: Automatically reloads on file changes
- Backend: Use `air` for hot reload (install: `go install github.com/cosmtrek/air@latest`)
- RAG Service: Use `uvicorn main:app --reload`

### Database Migrations
```bash
# Add new migration
# Edit infra/db/init.sql

# Apply migration
docker-compose down
docker-compose up -d postgres
docker exec -i csedu-postgres psql -U csedu_user -d csedu_platform < infra/db/init.sql
```

### Testing API Endpoints
```bash
# Health check
curl http://localhost:8080/health

# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cs.du.ac.bd","password":"Admin@12345"}'

# List research papers (with token)
curl http://localhost:8080/api/v1/research \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Production Deployment

1. Update all passwords in `.env`
2. Set `APP_ENV=production`
3. Configure proper domain in Nginx
4. Enable HTTPS with SSL certificates
5. Set up backup for PostgreSQL
6. Configure monitoring and logging
7. Set up CI/CD pipeline

## Architecture Overview

```
┌─────────────┐
│   Next.js   │ :3000
│  Frontend   │
└──────┬──────┘
       │
┌──────▼──────┐
│    Nginx    │ :80
│   Reverse   │
│    Proxy    │
└──────┬──────┘
       │
       ├─────────────┐
       │             │
┌──────▼──────┐ ┌───▼────────┐
│   Go API    │ │ RAG Service│
│   :8080     │ │   :8001    │
└──────┬──────┘ └───┬────────┘
       │            │
       ├────────────┴─────────┐
       │                      │
┌──────▼──────┐ ┌────────────▼──┐
│ PostgreSQL  │ │     Redis      │
│   :5432     │ │     :6379      │
└─────────────┘ └────────────────┘
       │
┌──────▼──────┐
│    MinIO    │
│ :9000/:9001 │
└─────────────┘
```

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Review IMPLEMENTATION_STATUS.md for feature status
3. Check SDD document for architecture details
