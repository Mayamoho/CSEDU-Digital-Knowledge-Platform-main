# 🚀 START HERE - Railway + Vercel Deployment

Welcome! Your CSEDU Digital Knowledge Platform is ready to deploy to the cloud.

## ⚡ Quick Links

| What do you want to do? | Click here |
|--------------------------|------------|
| 🚂 **Deploy to Railway + Vercel** (10 min) | [RAILWAY_QUICK_START.md](./RAILWAY_QUICK_START.md) |
| 📘 **Detailed Railway Guide** (30 min) | [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) |
| 💻 **Run Locally** (5 min) | [QUICK_START.md](./QUICK_START.md) |
| 🐳 **Self-Host with Docker** (1 hour) | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| 📚 **Understand the Project** | [README.md](./README.md) |

## 🎯 Recommended Path

### For Production Deployment:

```
1. Read this file (2 min) ✓ You're here!
   ↓
2. Follow RAILWAY_QUICK_START.md (10 min)
   ↓
3. Deploy and test (5 min)
   ↓
4. Done! 🎉
```

**Total Time**: ~15-20 minutes
**Cost**: $5/month

## 📋 What You Need

### Required (Free):
- ✅ GitHub account
- ✅ Railway account → [railway.app](https://railway.app)
- ✅ Vercel account → [vercel.com](https://vercel.com)
- ✅ Groq API key → [console.groq.com](https://console.groq.com/keys)

### Optional:
- Gemini API key (for fallback AI)
- Cloudflare R2 account (for file storage)
- Custom domain

## 🏗️ What You'll Deploy

### Backend on Railway:
- PostgreSQL database (with pgvector)
- Redis cache
- Go REST API
- Python RAG service (AI-powered search)

### Frontend on Vercel:
- Next.js application
- Global CDN
- Automatic HTTPS

## 💰 Cost

| Service | Cost |
|---------|------|
| Railway (Backend) | $5/month |
| Vercel (Frontend) | Free |
| Cloudflare R2 (Storage) | Free (10GB) |
| **Total** | **$5/month** |

## 🚀 Quick Deploy (10 Minutes)

### Step 1: Deploy Backend (5 min)

1. Go to [railway.app](https://railway.app)
2. Create new project
3. Add PostgreSQL + Redis
4. Deploy API service from `backend/api`
5. Deploy RAG service from `backend/rag`

### Step 2: Deploy Frontend (3 min)

1. Push code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import repository
4. Set root directory to `frontend`
5. Add environment variable: `NEXT_PUBLIC_API_URL`
6. Deploy

### Step 3: Test (2 min)

1. Visit your Vercel URL
2. Login: `admin@cs.du.ac.bd` / `Admin@12345`
3. Browse catalog, test AI chat
4. Change default passwords

**Done! Your platform is live! 🎊**

## 📖 Documentation Structure

```
📁 Project Root
│
├── 🚀 START_HERE.md                    ← You are here
├── 📘 RAILWAY_QUICK_START.md           ← 10-minute guide
├── 📗 RAILWAY_DEPLOYMENT.md            ← Detailed Railway guide
├── 📙 DEPLOYMENT_SUMMARY.md            ← What's been configured
├── 📕 README.md                        ← Project overview
│
├── 📁 frontend/
│   ├── README.md                       ← Frontend setup
│   ├── vercel.json                     ← Vercel config
│   └── .env.production                 ← Env template
│
└── 📁 backend/
    ├── README.md                       ← Backend setup
    ├── .env.railway                    ← Railway env template
    ├── railway.json                    ← Railway config
    └── ...
```

## 🎓 Choose Your Path

### Path 1: I want to deploy NOW! 🚀
→ Go to [RAILWAY_QUICK_START.md](./RAILWAY_QUICK_START.md)

### Path 2: I want to understand everything first 📚
→ Go to [README.md](./README.md)

### Path 3: I want to develop locally first 💻
→ Go to [QUICK_START.md](./QUICK_START.md)

### Path 4: I want to self-host 🐳
→ Go to [DEPLOYMENT.md](./DEPLOYMENT.md)

## ⚠️ Important Notes

### 1. Storage Setup Required
Railway doesn't provide file storage. You need:
- **Cloudflare R2** (Recommended - Free 10GB)
- **AWS S3** (Pay as you go)

### 2. Database Initialization
After deploying, run:
```bash
railway run psql $DATABASE_URL < backend/infra/db/init.sql
```

### 3. Change Default Passwords
After first login, change these:
- admin@cs.du.ac.bd
- librarian@cs.du.ac.bd
- researcher@cs.du.ac.bd
- student@cs.du.ac.bd

### 4. Generate Strong JWT Secret
```bash
openssl rand -base64 32
```

## 🆘 Need Help?

### Common Issues:

**"Frontend can't connect to backend"**
→ Check `NEXT_PUBLIC_API_URL` in Vercel settings

**"Database connection failed"**
→ Verify Railway provided DATABASE_URL correctly

**"RAG service not responding"**
→ Check GROQ_API_KEY is set in Railway

### Get Support:
- 📘 Read [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)
- 🐛 Check GitHub Issues
- 💬 Ask in Discord/Slack (if available)

## ✅ Success Checklist

After deployment, verify:
- [ ] Frontend loads at Vercel URL
- [ ] Can login with admin credentials
- [ ] Can browse library catalog
- [ ] Can upload files
- [ ] AI chat responds
- [ ] No errors in browser console

## 🎊 Ready?

**Let's deploy your platform!**

👉 **Next Step**: [RAILWAY_QUICK_START.md](./RAILWAY_QUICK_START.md)

---

**Questions?** Read the [FAQ section](./RAILWAY_DEPLOYMENT.md#troubleshooting) in the deployment guide.

**Good luck! 🚀**

*Built with ❤️ by Team Devops*
*Optimized for Railway + Vercel*
