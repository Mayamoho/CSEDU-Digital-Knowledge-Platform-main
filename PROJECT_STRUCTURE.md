# Project Structure

The CSEDU Digital Knowledge Platform has been reorganized for separate frontend and backend deployment.

## 📁 New Structure

```
CSEDU-Digital-Knowledge-Platform/
│
├── frontend/                    # Next.js Frontend (Deploy to Vercel)
│   ├── app/                    # Next.js 14 App Router
│   │   ├── (auth)/            # Authentication pages
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (main)/            # Main application pages
│   │   │   ├── dashboard/
│   │   │   ├── catalog/
│   │   │   ├── archive/
│   │   │   ├── research/
│   │   │   ├── projects/
│   │   │   ├── loans/
│   │   │   ├── fines/
│   │   │   ├── profile/
│   │   │   ├── settings/
│   │   │   └── upload/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   │
│   ├── components/             # React Components
│   │   ├── ui/                # Base UI components (shadcn/ui)
│   │   ├── auth/              # Authentication components
│   │   ├── catalog/           # Library catalog components
│   │   ├── archive/           # Archive components
│   │   ├── research/          # Research paper components
│   │   ├── projects/          # Student project components
│   │   ├── dashboard/         # Dashboard components
│   │   ├── ai-chat/           # AI chat widget
│   │   ├── header.tsx
│   │   └── footer.tsx
│   │
│   ├── lib/                   # Utilities
│   │   ├── api.ts            # API client
│   │   ├── auth-context.tsx  # Auth context provider
│   │   ├── utils.ts          # Helper functions
│   │   └── types.ts          # TypeScript types
│   │
│   ├── hooks/                 # Custom React hooks
│   │   ├── use-toast.ts
│   │   └── use-mobile.ts
│   │
│   ├── public/                # Static assets
│   │   ├── icons/
│   │   └── images/
│   │
│   ├── styles/                # Global styles
│   │   └── globals.css
│   │
│   ├── package.json           # Dependencies
│   ├── tsconfig.json          # TypeScript config
│   ├── next.config.mjs        # Next.js config
│   ├── vercel.json            # Vercel deployment config
│   ├── .env.example           # Environment template
│   ├── .gitignore
│   └── README.md              # Frontend documentation
│
├── backend/                    # Backend Services (Deploy to VPS/Cloud)
│   ├── api/                   # Go REST API
│   │   ├── cmd/              # Entry points
│   │   │   ├── api/          # Main API server
│   │   │   ├── ingestion-worker/  # Document processing worker
│   │   │   └── fine-worker/  # Fine calculation worker
│   │   ├── internal/         # Internal packages
│   │   │   ├── auth/         # Authentication
│   │   │   ├── library/      # Library management
│   │   │   ├── media/        # Media handling
│   │   │   ├── research/     # Research papers
│   │   │   ├── projects/     # Student projects
│   │   │   ├── ai/           # AI integration
│   │   │   ├── admin/        # Admin operations
│   │   │   ├── db/           # Database connection
│   │   │   ├── storage/      # MinIO client
│   │   │   └── middleware/   # HTTP middleware
│   │   ├── go.mod
│   │   ├── go.sum
│   │   ├── Dockerfile
│   │   ├── Dockerfile.worker
│   │   └── Dockerfile.fineworker
│   │
│   ├── rag/                   # Python RAG Service
│   │   ├── main.py           # FastAPI application
│   │   ├── config.py         # Configuration
│   │   ├── retriever.py      # Hybrid retrieval
│   │   ├── embedder.py       # Embedding generation
│   │   ├── llm_client.py     # LLM integration
│   │   ├── database.py       # Database client
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   ├── infra/                 # Infrastructure
│   │   ├── db/               # Database
│   │   │   ├── init.sql      # Schema initialization
│   │   │   └── migrate_*.sql # Migrations
│   │   ├── nginx/            # Nginx config
│   │   │   └── nginx.conf
│   │   └── prometheus/       # Monitoring
│   │       └── prometheus.yml
│   │
│   ├── docker-compose.yml     # Docker orchestration
│   ├── .env.example           # Environment template
│   ├── .gitignore
│   └── README.md              # Backend documentation
│
├── README.md                   # Main project documentation
├── DEPLOYMENT.md               # Deployment guide
├── QUICK_START.md              # Quick start guide
└── PROJECT_STRUCTURE.md        # This file
```

## 🎯 Key Changes

### Before (Monorepo)
```
project/
├── app/
├── components/
├── api/
├── rag/
├── infra/
├── Dockerfile
└── docker-compose.yml
```

### After (Separated)
```
project/
├── frontend/          # Vercel-ready
│   ├── app/
│   ├── components/
│   └── vercel.json
│
└── backend/           # Docker-ready
    ├── api/
    ├── rag/
    ├── infra/
    └── docker-compose.yml
```

## 📦 What's in Each Folder

### Frontend (`/frontend`)
- **Purpose**: User interface
- **Technology**: Next.js 14, React 19, TypeScript
- **Deployment**: Vercel (recommended)
- **Environment**: Browser + Node.js server
- **Dependencies**: React, Next.js, Tailwind CSS, Radix UI

### Backend (`/backend`)
- **Purpose**: API, database, AI services
- **Technology**: Go, Python, PostgreSQL, Redis, MinIO
- **Deployment**: Docker Compose on VPS/Cloud
- **Environment**: Server-side only
- **Services**: 
  - Go API (port 8080)
  - RAG Service (port 8001)
  - PostgreSQL (port 5432)
  - Redis (port 6379)
  - MinIO (ports 9000, 9001)

## 🚀 Deployment Workflow

### Development
```bash
# Terminal 1: Backend
cd backend
docker compose up -d

# Terminal 2: Frontend
cd frontend
pnpm dev
```

### Production

**Frontend:**
```bash
cd frontend
git push origin main
# Vercel auto-deploys
```

**Backend:**
```bash
cd backend
docker compose up -d --build
```

## 🔗 Communication

Frontend communicates with backend via REST API:

```
Frontend (Vercel)
    ↓ HTTPS
    ↓ NEXT_PUBLIC_API_URL
    ↓
Backend API (Your Server)
    ↓
    ├─→ PostgreSQL (Database)
    ├─→ Redis (Cache)
    ├─→ MinIO (Storage)
    └─→ RAG Service (AI)
```

## 📝 Configuration Files

### Frontend
- `vercel.json` - Vercel deployment config
- `.env.example` - Environment template
- `next.config.mjs` - Next.js configuration
- `package.json` - Dependencies

### Backend
- `docker-compose.yml` - Service orchestration
- `.env.example` - Environment template
- `Dockerfile` (multiple) - Container definitions

## 🎓 Benefits of This Structure

1. **Independent Deployment** - Deploy frontend and backend separately
2. **Scalability** - Scale frontend (Vercel) and backend (Docker) independently
3. **Development** - Work on frontend/backend without affecting the other
4. **CI/CD** - Separate pipelines for frontend and backend
5. **Team Collaboration** - Frontend and backend teams can work independently
6. **Cost Optimization** - Free Vercel hosting for frontend, pay only for backend

## 📚 Documentation

- [Main README](./README.md) - Project overview
- [Frontend README](./frontend/README.md) - Frontend setup
- [Backend README](./backend/README.md) - Backend setup
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment
- [Quick Start](./QUICK_START.md) - Get started in 5 minutes

## 🔄 Migration from Old Structure

If you have the old monorepo structure:

1. **Backup your data**
   ```bash
   docker exec csedu_postgres pg_dump -U csedu_user csedu_platform > backup.sql
   ```

2. **Stop old containers**
   ```bash
   docker compose down
   ```

3. **Use new structure**
   - Frontend files are in `frontend/`
   - Backend files are in `backend/`

4. **Restore data**
   ```bash
   cd backend
   docker compose up -d postgres
   docker exec -i csedu_postgres psql -U csedu_user csedu_platform < ../backup.sql
   ```

## ✅ Checklist for New Setup

- [ ] Frontend folder has all UI code
- [ ] Backend folder has all services
- [ ] Environment files configured
- [ ] Git repositories set up
- [ ] Vercel project created
- [ ] Backend deployed
- [ ] Frontend deployed
- [ ] Connection tested
- [ ] Default passwords changed

---

**Ready to deploy? See [QUICK_START.md](./QUICK_START.md) or [DEPLOYMENT.md](./DEPLOYMENT.md)**
