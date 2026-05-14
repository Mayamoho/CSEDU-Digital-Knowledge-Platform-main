# Railway + Vercel Quick Start

Deploy CSEDU Digital Knowledge Platform to the cloud in 10 minutes!

## 🎯 What You'll Get

- ✅ Backend on Railway (PostgreSQL, Redis, API, RAG)
- ✅ Frontend on Vercel (Global CDN)
- ✅ HTTPS everywhere
- ✅ Auto-scaling
- ✅ Monitoring included
- 💰 Cost: ~$5-10/month

---

## 🚂 Step 1: Deploy to Railway (5 minutes)

### 1.1 Create Railway Account
- Go to [railway.app](https://railway.app)
- Sign up with GitHub (free)

### 1.2 Create New Project
- Click "New Project"
- Select "Deploy from GitHub repo"
- Choose your repository

### 1.3 Add PostgreSQL
- Click "New" → "Database" → "PostgreSQL"
- Railway provisions it automatically ✨

### 1.4 Add Redis
- Click "New" → "Database" → "Redis"
- Railway provisions it automatically ✨

### 1.5 Deploy API Service
1. Click "New" → "GitHub Repo"
2. Select your repo
3. Set root directory: `backend/api`
4. Add environment variables (copy from template below)
5. Click "Deploy"

**Environment Variables for API:**
```bash
# Database (auto-filled by Railway)
DATABASE_URL=${{Postgres.DATABASE_URL}}
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_NAME=${{Postgres.PGDATABASE}}

# Redis (auto-filled by Railway)
REDIS_URL=${{Redis.REDIS_URL}}

# JWT (CHANGE THIS!)
JWT_SECRET=your-super-secret-random-string-min-32-chars

# Groq API (get free key at console.groq.com)
GROQ_API_KEY=your-groq-api-key-here

# MinIO (use Cloudflare R2 or AWS S3)
MINIO_ENDPOINT=your-storage-endpoint
MINIO_USER=your-storage-user
MINIO_PASSWORD=your-storage-password
MINIO_BUCKET=csedu-files

# RAG Service (will be filled after deploying RAG)
RAG_SERVICE_URL=https://your-rag-service.up.railway.app

# Other settings
APP_ENV=production
PORT=8080
FINE_RATE_PER_DAY=50
LOAN_PERIOD_DAYS=14
```

### 1.6 Deploy RAG Service
1. Click "New" → "GitHub Repo"
2. Select your repo
3. Set root directory: `backend/rag`
4. Add environment variables (copy from template below)
5. Click "Deploy"

**Environment Variables for RAG:**
```bash
# Database (reference from PostgreSQL)
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_NAME=${{Postgres.PGDATABASE}}

# Redis
REDIS_URL=${{Redis.REDIS_URL}}

# Groq API
GROQ_API_KEY=your-groq-api-key-here
GROQ_MODEL_SIMPLE=llama-3.1-8b-instant

# Gemini (optional)
GEMINI_API_KEY=your-gemini-key-here

# Embedding settings
EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
EMBEDDING_DIMENSION=768
```

### 1.7 Initialize Database
1. Click on PostgreSQL service
2. Click "Connect" → Copy connection string
3. Run locally:
   ```bash
   psql "your-connection-string" < backend/infra/db/init.sql
   ```

### 1.8 Note Your URLs
- API URL: `https://your-api.up.railway.app`
- RAG URL: `https://your-rag.up.railway.app`

**✅ Backend deployed!**

---

## 🚀 Step 2: Deploy to Vercel (3 minutes)

### 2.1 Push to GitHub
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 2.2 Import to Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. **Important**: Set root directory to `frontend`
4. Click "Deploy"

### 2.3 Add Environment Variable
In Vercel dashboard:
- Go to Project Settings → Environment Variables
- Add:
  ```
  Name: NEXT_PUBLIC_API_URL
  Value: https://your-api.up.railway.app/api/v1
  ```
- Click "Save"
- Redeploy

**✅ Frontend deployed!**

---

## 🎉 Step 3: Test Your Deployment

1. **Visit your Vercel URL**
   - Example: `https://your-project.vercel.app`

2. **Login with default credentials**
   - Email: `admin@cs.du.ac.bd`
   - Password: `Admin@12345`

3. **Test features**
   - Browse catalog
   - Try AI chat
   - Upload a document

**🎊 Congratulations! Your platform is live!**

---

## 🔧 Step 4: Post-Deployment Setup

### 4.1 Update CORS
In Railway API service, add environment variable:
```
ALLOWED_ORIGINS=https://your-project.vercel.app
```

### 4.2 Change Default Passwords
Login and change all default passwords:
- admin@cs.du.ac.bd
- librarian@cs.du.ac.bd
- researcher@cs.du.ac.bd
- student@cs.du.ac.bd

### 4.3 Setup Storage
Choose one:
- **Cloudflare R2** (Recommended, free 10GB)
- **AWS S3** (Pay as you go)
- Update MINIO_* variables in Railway

### 4.4 Add Custom Domain (Optional)
**Vercel:**
- Settings → Domains → Add domain

**Railway:**
- Service → Settings → Networking → Add domain

---

## 💰 Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| Railway | Hobby | $5/month |
| Vercel | Hobby | Free |
| Cloudflare R2 | Free tier | Free (10GB) |
| **Total** | | **$5/month** |

---

## 📊 What You Get

### Railway Backend
- ✅ PostgreSQL database (1GB)
- ✅ Redis cache
- ✅ Go API service
- ✅ Python RAG service
- ✅ Auto-scaling
- ✅ Monitoring & logs
- ✅ Automatic HTTPS
- ✅ 500 hours/month execution

### Vercel Frontend
- ✅ Global CDN
- ✅ Automatic HTTPS
- ✅ Instant deployments
- ✅ Preview deployments
- ✅ Analytics
- ✅ 100GB bandwidth/month

---

## 🔄 Continuous Deployment

Both platforms auto-deploy on git push:

```bash
git add .
git commit -m "Update feature"
git push origin main
```

- Railway: Auto-deploys backend
- Vercel: Auto-deploys frontend

---

## 🆘 Troubleshooting

### "Cannot connect to API"
1. Check `NEXT_PUBLIC_API_URL` in Vercel
2. Verify API is running in Railway
3. Check CORS settings

### "Database connection failed"
1. Verify DATABASE_URL in Railway
2. Check if init.sql was run
3. View PostgreSQL logs in Railway

### "RAG service not responding"
1. Check GROQ_API_KEY is set
2. Verify RAG service is running
3. View logs in Railway

---

## 📚 Next Steps

1. ✅ Add your content
2. ✅ Invite users
3. ✅ Configure custom domains
4. ✅ Setup monitoring alerts
5. ✅ Configure backups

---

## 📞 Need Help?

- 📘 [Full Railway Guide](./RAILWAY_DEPLOYMENT.md)
- 📗 [Docker Guide](./DEPLOYMENT.md)
- 📙 [Frontend Setup](./frontend/README.md)
- 📕 [Backend Setup](./backend/README.md)

---

**🎊 Your platform is live! Share it with your team!**

- Frontend: `https://your-project.vercel.app`
- API: `https://your-api.up.railway.app`
- Admin: Login with admin credentials

**Built with ❤️ and deployed on Railway + Vercel**
