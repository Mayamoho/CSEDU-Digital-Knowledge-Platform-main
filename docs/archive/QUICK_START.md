# Quick Start Guide

Get the CSEDU Digital Knowledge Platform running in 5 minutes!

## 🎯 What You'll Deploy

- **Frontend**: Next.js app on Vercel (Free)
- **Backend**: Docker services on your server/local machine

---

## 🚀 Quick Deploy

### Step 1: Deploy Backend (5 minutes)

```bash
# Navigate to backend
cd backend

# Copy environment file
cp .env.example .env

# Edit .env and add your API keys
nano .env
# Required: GROQ_API_KEY (get free at https://console.groq.com/keys)
# Optional: GEMINI_API_KEY

# Start all services
docker compose up -d

# Wait 30 seconds for services to start, then verify
docker compose ps
curl http://localhost:8080/health
```

**Your backend is now running!**
- API: http://localhost:8080
- MinIO Console: http://localhost:9001

### Step 2: Deploy Frontend to Vercel (3 minutes)

```bash
# Navigate to frontend
cd frontend

# Install Vercel CLI (if not installed)
npm i -g vercel

# Deploy
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name? csedu-platform
# - Directory? ./
# - Override settings? No

# Add environment variable
vercel env add NEXT_PUBLIC_API_URL

# Enter value:
# For local backend: http://localhost:8080/api/v1
# For production: https://your-api-domain.com/api/v1

# Deploy to production
vercel --prod
```

**Your frontend is now live on Vercel!**

---

## 🎉 You're Done!

Visit your Vercel URL and login with:
- **Email**: admin@cs.du.ac.bd
- **Password**: Admin@12345

---

## 🔧 Local Development

### Frontend
```bash
cd frontend
pnpm install
pnpm dev
# Open http://localhost:3000
```

### Backend
```bash
cd backend
docker compose up -d
# API: http://localhost:8080
```

---

## 📚 Next Steps

1. ✅ Change default passwords
2. ✅ Add your content
3. ✅ Configure custom domain
4. ✅ Setup SSL (for production)
5. ✅ Read [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup

---

## 🆘 Troubleshooting

**Backend not starting?**
```bash
docker compose logs api
```

**Frontend can't connect?**
- Check `NEXT_PUBLIC_API_URL` in Vercel
- Verify backend is accessible
- Check CORS settings

**Need help?**
- See [DEPLOYMENT.md](./DEPLOYMENT.md)
- Check [Frontend README](./frontend/README.md)
- Check [Backend README](./backend/README.md)

---

## 🎊 Success Checklist

- [ ] Backend running (`docker compose ps`)
- [ ] API responding (`curl http://localhost:8080/health`)
- [ ] Frontend deployed to Vercel
- [ ] Can login to application
- [ ] Changed default passwords

**Congratulations! Your platform is live! 🚀**
