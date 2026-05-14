# CSEDU Digital Knowledge Platform

A comprehensive digital knowledge management system for the Department of Computer Science and Engineering, University of Dhaka.

## 📁 Project Structure

This project is organized into two main directories:

```
project-root/
├── frontend/          # Next.js application (Deploy to Vercel)
│   ├── app/          # Next.js 14 App Router
│   ├── components/   # React components
│   ├── lib/          # Utilities & API client
│   └── ...
│
└── backend/          # Backend services (Deploy to VPS/Cloud)
    ├── api/          # Go REST API
    ├── rag/          # Python RAG service
    ├── infra/        # Infrastructure configs
    └── docker-compose.yml
```

## 🚀 Quick Start

### Option 1: Railway + Vercel (Recommended for Production)

**5-minute deployment to the cloud!**

1. **Deploy Backend to Railway**
   - See [Railway Deployment Guide](./RAILWAY_DEPLOYMENT.md)
   - One-click PostgreSQL and Redis
   - Auto-scaling and monitoring included

2. **Deploy Frontend to Vercel**
   - Push to GitHub
   - Import to Vercel
   - Set root directory to `frontend`
   - Add `NEXT_PUBLIC_API_URL` environment variable

**Total Cost**: ~$5-10/month

### Option 2: Local Development

**For development and testing:**

```bash
# Backend
cd backend
docker compose up -d

# Frontend
cd frontend
pnpm install && pnpm dev
```

See [Quick Start Guide](./QUICK_START.md) for detailed instructions.

## 🌟 Features

### Core Modules
- **Library Catalog** - Digital library management with borrowing system
- **Digital Archive** - Historical documents and multimedia archives
- **Research Repository** - Academic papers and research publications
- **Student Projects** - Showcase of student work and achievements

### Advanced Features
- **AI-Powered Search** - RAG-based semantic search with multilingual support
- **Document Summarization** - Automatic summarization of research papers
- **Fine Management** - Automated fine calculation for overdue books
- **Role-Based Access** - Multi-tier access control (Public, Student, Researcher, Librarian, Administrator)

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI, shadcn/ui
- **State Management**: React Context
- **Deployment**: Vercel

### Backend
- **API**: Go 1.23 with Chi router
- **RAG Service**: Python 3.11 with FastAPI
- **Database**: PostgreSQL 16 with pgvector
- **Cache**: Redis 7
- **Storage**: MinIO (S3-compatible)
- **AI Models**: Groq (Llama), Gemini
- **Deployment**: Docker Compose

## 📋 Prerequisites

### For Frontend Development
- Node.js 22+
- pnpm 9+

### For Backend Development
- Docker & Docker Compose
- Go 1.23+ (optional, for local development)
- Python 3.11+ (optional, for local development)

## 🔧 Environment Setup

### Frontend Environment Variables
```env
NEXT_PUBLIC_API_URL=https://your-backend-api.com/api/v1
```

### Backend Environment Variables
See `backend/.env.example` for complete list. Key variables:
- Database credentials
- JWT secret
- API keys (Groq, Gemini)
- MinIO credentials

## 📖 Documentation

- [Frontend Documentation](./frontend/README.md)
- [Backend Documentation](./backend/README.md)
- [API Documentation](./backend/api/README.md)
- [Deployment Guide](./DEPLOYMENT.md)

## 🔐 Default Credentials

After initial setup, use these credentials to login:

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@cs.du.ac.bd | Admin@12345 |
| Librarian | librarian@cs.du.ac.bd | Staff@12345 |
| Researcher | researcher@cs.du.ac.bd | Research@12345 |
| Student | student@cs.du.ac.bd | Student@12345 |

**⚠️ Change these passwords in production!**

## 🚢 Deployment

### Production Deployment (Railway + Vercel)

**Recommended for production use:**

1. **Backend to Railway**
   - Managed PostgreSQL and Redis
   - Auto-scaling
   - Built-in monitoring
   - See [Railway Deployment Guide](./RAILWAY_DEPLOYMENT.md)

2. **Frontend to Vercel**
   - Global CDN
   - Automatic HTTPS
   - Zero-config deployment
   - See [Railway Deployment Guide](./RAILWAY_DEPLOYMENT.md)

**Cost**: ~$5-10/month

### Self-Hosted Deployment (Docker)

**For VPS or on-premise:**

1. Deploy backend with Docker Compose
2. Deploy frontend to Vercel or self-host
3. See [Deployment Guide](./DEPLOYMENT.md)

### Quick Links

- 📘 [Railway + Vercel Guide](./RAILWAY_DEPLOYMENT.md) - **Recommended**
- 📗 [Docker Deployment Guide](./DEPLOYMENT.md)
- 📙 [Quick Start](./QUICK_START.md)
- 📕 [Frontend Setup](./frontend/README.md)
- 📔 [Backend Setup](./backend/README.md)

## 🧪 Testing

### Frontend
```bash
cd frontend
pnpm dev
```
Open http://localhost:3000

### Backend
```bash
cd backend
docker compose up -d
```
API: http://localhost:8080
RAG: http://localhost:8001

## 📊 Monitoring

Backend includes optional monitoring with Prometheus and Grafana:

```bash
cd backend
docker compose --profile dev up -d
```

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is developed for the Department of Computer Science and Engineering, University of Dhaka.

## 👥 Team

**Team Devops**
- Department of Computer Science and Engineering
- University of Dhaka

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Contact the development team
- Email: support@cs.du.ac.bd

## 🎯 Roadmap

- [ ] Mobile application
- [ ] Advanced analytics dashboard
- [ ] Integration with university SSO
- [ ] Automated citation generation
- [ ] Collaborative research tools
- [ ] Enhanced AI capabilities

---

**Built with ❤️ by Team Devops**
