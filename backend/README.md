# CSEDU Digital Knowledge Platform - Backend

Backend services for the CSEDU Digital Knowledge Platform including Go API, Python RAG service, and infrastructure.

## 🏗️ Architecture

```
backend/
├── api/              # Go REST API
├── rag/              # Python RAG service
├── infra/            # Infrastructure configs
│   ├── db/          # Database schemas
│   ├── nginx/       # Nginx configuration
│   └── prometheus/  # Monitoring
└── docker-compose.yml
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Go 1.23+ (for local development)
- Python 3.11+ (for local development)

### 1. Setup Environment

```bash
cp .env.example .env
```

Edit `.env` and configure:
- Database credentials
- JWT secret (minimum 32 characters)
- API keys (Groq, Gemini)
- MinIO credentials

### 2. Start Services

```bash
docker compose up -d
```

This will start:
- PostgreSQL (port 5432)
- Redis (port 6379)
- MinIO (port 9000, console 9001)
- API (port 8080)
- RAG Service (port 8001)
- Nginx (port 80)
- Workers (ingestion, fine calculation)

### 3. Initialize Database

The database will be automatically initialized with the schema from `infra/db/init.sql`.

Default users:
- **Administrator**: admin@cs.du.ac.bd / Admin@12345
- **Librarian**: librarian@cs.du.ac.bd / Staff@12345
- **Researcher**: researcher@cs.du.ac.bd / Research@12345
- **Student**: student@cs.du.ac.bd / Student@12345

### 4. Verify Services

```bash
# Check all services are running
docker compose ps

# Test API
curl http://localhost:8080/health

# Test RAG service
curl http://localhost:8001/health
```

## 📦 Services

### Go API (Port 8080)
REST API for authentication, library management, media uploads, and more.

**Endpoints:**
- `/api/v1/auth/*` - Authentication
- `/api/v1/library/*` - Library catalog & loans
- `/api/v1/media/*` - Media management
- `/api/v1/research/*` - Research papers
- `/api/v1/projects/*` - Student projects
- `/api/v1/ai/*` - AI chat
- `/api/v1/admin/*` - Admin operations

### RAG Service (Port 8001)
Python FastAPI service for AI-powered search and chat.

**Endpoints:**
- `/query` - RAG query with context
- `/embed` - Generate embeddings
- `/health` - Health check

### PostgreSQL (Port 5432)
Database with pgvector extension for embeddings.

### Redis (Port 6379)
Caching and job queue.

### MinIO (Port 9000)
S3-compatible object storage for files.
- Console: http://localhost:9001

## 🔧 Development

### Run API Locally

```bash
cd api
go run cmd/api/main.go
```

### Run RAG Service Locally

```bash
cd rag
pip install -r requirements.txt
python main.py
```

### Run Workers

```bash
# Ingestion worker
cd api
go run cmd/ingestion-worker/main.go

# Fine calculation worker
go run cmd/fine-worker/main.go
```

## 🐳 Docker Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f api
docker compose logs -f rag

# Stop services
docker compose down

# Rebuild and restart
docker compose up -d --build

# Start with monitoring (Prometheus + Grafana)
docker compose --profile dev up -d
```

## 🌐 Environment Variables

See `.env.example` for all available configuration options.

**Critical Variables:**
- `JWT_SECRET` - Must be changed in production
- `DB_PASSWORD` - Database password
- `MINIO_PASSWORD` - Object storage password
- `GROQ_API_KEY` - Required for AI features
- `GEMINI_API_KEY` - Optional fallback LLM

## 📊 Monitoring

Start with monitoring profile:
```bash
docker compose --profile dev up -d
```

Access:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)

## 🔒 Security Notes

**Before Production:**
1. Change all default passwords
2. Generate strong JWT_SECRET (32+ characters)
3. Enable SSL for MinIO
4. Configure proper CORS origins
5. Use environment-specific secrets
6. Enable database SSL
7. Set up proper firewall rules

## 🗄️ Database Management

### Backup
```bash
docker exec csedu_postgres pg_dump -U csedu_user csedu_platform > backup.sql
```

### Restore
```bash
docker exec -i csedu_postgres psql -U csedu_user csedu_platform < backup.sql
```

### Migrations
```bash
docker exec csedu_postgres psql -U csedu_user -d csedu_platform -f /path/to/migration.sql
```

## 🧪 Testing

```bash
# Test API endpoints
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cs.du.ac.bd","password":"Admin@12345"}'

# Test RAG service
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{"query":"What is machine learning?","user_role":"student"}'
```

## 📝 API Documentation

API documentation is available at:
- Swagger UI: http://localhost:8080/swagger (if enabled)
- See `api/internal/` for handler implementations

## 🔗 Related

- [Frontend Repository](../frontend)
- [Project Documentation](../README.md)

## 🆘 Troubleshooting

### Port Conflicts
If ports are already in use:
```bash
# Check what's using a port
sudo lsof -i :8080

# Stop local services or change ports in docker-compose.yml
```

### Database Connection Issues
```bash
# Check database logs
docker logs csedu_postgres

# Verify connection
docker exec csedu_postgres psql -U csedu_user -d csedu_platform -c "SELECT 1"
```

### MinIO Access Issues
```bash
# Check MinIO logs
docker logs csedu_minio

# Access MinIO console
# http://localhost:9001 (minioadmin/changeme_in_dev)
```
