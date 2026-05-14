# Deployment Guide

Complete guide for deploying the CSEDU Digital Knowledge Platform.

## 📋 Overview

The platform consists of two main parts:
1. **Frontend** - Next.js application (Deploy to Vercel)
2. **Backend** - Go API + Python RAG + Infrastructure (Deploy to VPS/Cloud)

## 🎯 Deployment Strategy

```
┌─────────────────┐         ┌──────────────────────┐
│                 │         │                      │
│  Vercel         │────────▶│  Your VPS/Cloud      │
│  (Frontend)     │  HTTPS  │  (Backend Services)  │
│                 │         │                      │
└─────────────────┘         └──────────────────────┘
```

---

## 🚀 Part 1: Deploy Backend

### Option A: Deploy to VPS (Recommended)

#### Prerequisites
- Ubuntu 20.04+ server
- Docker & Docker Compose installed
- Domain name (optional but recommended)
- SSL certificate (Let's Encrypt)

#### Steps

1. **Connect to your server**
   ```bash
   ssh user@your-server-ip
   ```

2. **Install Docker**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

3. **Install Docker Compose**
   ```bash
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

4. **Clone repository**
   ```bash
   git clone <your-repo-url>
   cd <repo-name>/backend
   ```

5. **Configure environment**
   ```bash
   cp .env.example .env
   nano .env
   ```
   
   Update these critical values:
   - `DB_PASSWORD` - Strong database password
   - `JWT_SECRET` - Random 32+ character string
   - `MINIO_PASSWORD` - Strong MinIO password
   - `GROQ_API_KEY` - Your Groq API key
   - `GEMINI_API_KEY` - Your Gemini API key (optional)

6. **Start services**
   ```bash
   docker compose up -d
   ```

7. **Verify deployment**
   ```bash
   docker compose ps
   curl http://localhost:8080/health
   ```

8. **Setup SSL with Nginx (Optional but recommended)**
   
   Install Certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```
   
   Get SSL certificate:
   ```bash
   sudo certbot --nginx -d api.yourdomain.com
   ```

9. **Configure firewall**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 22/tcp
   sudo ufw enable
   ```

10. **Your backend is now accessible at:**
    - HTTP: `http://your-server-ip:8080`
    - HTTPS: `https://api.yourdomain.com` (if SSL configured)

### Option B: Deploy to Cloud Platforms

#### AWS ECS / Google Cloud Run / Azure Container Instances

1. Build and push Docker images
2. Configure environment variables
3. Deploy containers
4. Setup load balancer
5. Configure SSL

See platform-specific documentation for details.

---

## 🌐 Part 2: Deploy Frontend to Vercel

### Prerequisites
- Vercel account (free tier works)
- GitHub account
- Backend deployed and accessible

### Steps

1. **Push code to GitHub**
   ```bash
   cd frontend
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/your-repo.git
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Click "Import Project"
   - Select your GitHub repository
   - **Important**: Set root directory to `frontend`

3. **Configure Build Settings**
   - Framework Preset: Next.js
   - Build Command: `pnpm build`
   - Output Directory: `.next`
   - Install Command: `pnpm install`

4. **Add Environment Variables**
   In Vercel dashboard, add:
   ```
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
   ```
   
   Or if using IP:
   ```
   NEXT_PUBLIC_API_URL=http://your-server-ip:8080/api/v1
   ```

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your site will be live at `https://your-project.vercel.app`

6. **Configure Custom Domain (Optional)**
   - Go to Project Settings → Domains
   - Add your custom domain
   - Update DNS records as instructed

---

## 🔧 Post-Deployment Configuration

### 1. Update CORS Settings

Edit `backend/api/cmd/api/main.go`:

```go
r.Use(cors.Handler(cors.Options{
    AllowedOrigins: []string{
        "https://your-project.vercel.app",
        "https://yourdomain.com",
    },
    AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
    AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
    AllowCredentials: true,
}))
```

Rebuild and restart:
```bash
cd backend
docker compose up -d --build api
```

### 2. Test the Connection

Visit your Vercel URL and try:
- Login with default credentials
- Browse catalog
- Test AI chat

### 3. Change Default Passwords

Login as admin and change all default passwords:
- admin@cs.du.ac.bd
- librarian@cs.du.ac.bd
- researcher@cs.du.ac.bd
- student@cs.du.ac.bd

---

## 📊 Monitoring & Maintenance

### View Logs

**Backend:**
```bash
cd backend
docker compose logs -f api
docker compose logs -f rag
```

**Frontend:**
Check Vercel dashboard for deployment logs and runtime logs.

### Backup Database

```bash
docker exec csedu_postgres pg_dump -U csedu_user csedu_platform > backup_$(date +%Y%m%d).sql
```

### Update Application

**Backend:**
```bash
cd backend
git pull
docker compose up -d --build
```

**Frontend:**
```bash
git push origin main
# Vercel auto-deploys on push
```

---

## 🔒 Security Checklist

- [ ] Changed all default passwords
- [ ] Generated strong JWT_SECRET (32+ characters)
- [ ] Configured SSL/HTTPS
- [ ] Updated CORS origins
- [ ] Enabled firewall
- [ ] Regular database backups
- [ ] Monitoring setup
- [ ] Rate limiting configured
- [ ] Environment variables secured

---

## 🆘 Troubleshooting

### Frontend can't connect to backend

1. Check CORS configuration
2. Verify `NEXT_PUBLIC_API_URL` is correct
3. Test backend directly: `curl https://api.yourdomain.com/health`
4. Check browser console for errors

### Backend services not starting

1. Check logs: `docker compose logs`
2. Verify `.env` file exists and is configured
3. Check port conflicts: `sudo lsof -i :8080`
4. Ensure Docker has enough resources

### Database connection issues

1. Check database logs: `docker logs csedu_postgres`
2. Verify credentials in `.env`
3. Test connection: `docker exec csedu_postgres psql -U csedu_user -d csedu_platform -c "SELECT 1"`

---

## 📞 Support

For deployment issues:
1. Check logs first
2. Review this guide
3. Check GitHub issues
4. Contact development team

---

## 🎉 Success!

Your CSEDU Digital Knowledge Platform is now deployed!

- Frontend: `https://your-project.vercel.app`
- Backend API: `https://api.yourdomain.com`
- Admin Panel: Login with admin credentials

**Next Steps:**
1. Change default passwords
2. Add real content
3. Invite users
4. Monitor performance
5. Setup regular backups
