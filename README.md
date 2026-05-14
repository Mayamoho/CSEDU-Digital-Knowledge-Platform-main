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

### Frontend (Vercel Deployment)

1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

2. Follow the [Frontend README](./frontend/README.md) for:
   - Local development setup
   - Vercel deployment instructions
   - Environment configuration

### Backend (Docker Deployment)

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Follow the [Backend README](./backend/README.md) for:
   - Docker setup
   - Service configuration
   - Database initialization

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

### Frontend to Vercel

1. Push frontend code to GitHub
2. Import project to Vercel
3. Set root directory to `frontend`
4. Configure environment variables
5. Deploy

See [Frontend README](./frontend/README.md) for detailed instructions.

### Backend to VPS/Cloud

1. Clone repository on server
2. Navigate to `backend` directory
3. Configure `.env` file
4. Run `docker compose up -d`

See [Backend README](./backend/README.md) for detailed instructions.

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
