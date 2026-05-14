# Railway + Vercel Deployment Guide

Complete guide for deploying CSEDU Digital Knowledge Platform with Railway (backend) and Vercel (frontend).

## 🎯 Architecture

```
┌─────────────────┐         ┌──────────────────────┐
│                 │         │                      │
│  Vercel         │────────▶│  Railway             │
│  (Frontend)     │  HTTPS  │  (Backend Services)  │
│                 │         │                      │
└─────────────────┘         └──────────────────────┘
```

---

## 🚂 Part 1: Deploy Backend to Railway

### Prerequisites
- Railway account (free tier available)
- GitHub account
- API keys (Groq, Gemini)

### Step 1: Prepare Railway Services

Railway will host these services:
1. **PostgreSQL** (Railway Plugin)
2. **Redis** (Railway Plugin)
3. **Go API** (Your code)
4. **RAG Service** (Your code)

### Step 2: Create Railway Project

1. **Go to Railway**
   - Visit [railway.app](https://railway.app)
   - Sign in with GitHub
   - Click "New Project"

2. **Add PostgreSQL**
   - Click "New" → "Database" → "Add PostgreSQL"
   - Railway will provision a PostgreSQL database
   - Note: Railway provides connection string automatically

3. **Add Redis**
   - Click "New" → "Database" → "Add Redis"
   - Railway will provision Redis
   - Connection string provided automatically

### Step 3: Deploy Go API

1. **Create New Service**
   - Click "New" → "GitHub Repo"
   - Select your repository
   - Choose `backend` as root directory

2. **Configure Build**
   - Railway will auto-detect the Dockerfile
   - Root Directory: `backend/api`
   - Dockerfile Path: `Dockerfile`

3. **Add Environment Variables**
   ```
   # Database (Railway provides these automatically)
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   DB_HOST=${{Postgres.PGHOST}}
   DB_PORT=${{Postgres.PGPORT}}
   DB_USER=${{Postgres.PGUSER}}
   DB_PASSWORD=${{Postgres.PGPASSWORD}}
   DB_NAME=${{Postgres.PGDATABASE}}
   
   # Redis (Railway provides these automatically)
   REDIS_URL=${{Redis.REDIS_URL}}
   
   # MinIO (Use Railway S3 or external service)
   MINIO_ENDPOINT=your-minio-endpoint
   MINIO_USER=your-minio-user
   MINIO_PASSWORD=your-minio-password
   MINIO_BUCKET=csedu-files
   MINIO_USE_SSL=true
   
   # JWT
   JWT_SECRET=your-super-secret-jwt-key-min-32-characters
   JWT_EXPIRY_HOURS=1
   REFRESH_EXPIRY_DAYS=7
   
   # Fine Configuration
   FINE_RATE_PER_DAY=50
   FINE_RATE_BDT_PER_DAY=50.0
   MAX_FINE_PER_LOAN_BDT=500.0
   FINE_CALC_INTERVAL=24h
   FINE_BLOCK_THRESHOLD=500
   LOAN_PERIOD_DAYS=14
   
   # Groq API
   GROQ_API_KEY=your-groq-api-key
   GROQ_MODEL_SIMPLE=llama-3.1-8b-instant
   GROQ_MODEL_LONG=meta-llama/llama-4-scout-17b-16e-instruct
   GROQ_MODEL_COMPLEX=openai/gpt-oss-120b
   GROQ_TIMEOUT=30
   
   # Gemini API (Optional)
   GEMINI_API_KEY=your-gemini-api-key
   GEMINI_MODEL=gemini-2.0-flash-exp
   
   # RAG Service
   RAG_SERVICE_URL=${{RAG.RAILWAY_PUBLIC_DOMAIN}}
   
   # App
   APP_ENV=production
   PORT=8080
   ```

4. **Deploy**
   - Click "Deploy"
   - Railway will build and deploy your API
   - Note the public URL (e.g., `https://your-api.up.railway.app`)

### Step 4: Deploy RAG Service

1. **Create New Service**
   - Click "New" → "GitHub Repo"
   - Select your repository
   - Choose `backend/rag` as root directory

2. **Configure Build**
   - Root Directory: `backend/rag`
   - Dockerfile Path: `Dockerfile`

3. **Add Environment Variables**
   ```
   # Database (Reference from PostgreSQL service)
   DB_HOST=${{Postgres.PGHOST}}
   DB_PORT=${{Postgres.PGPORT}}
   DB_USER=${{Postgres.PGUSER}}
   DB_PASSWORD=${{Postgres.PGPASSWORD}}
   DB_NAME=${{Postgres.PGDATABASE}}
   
   # Redis
   REDIS_URL=${{Redis.REDIS_URL}}
   
   # Groq API
   GROQ_API_KEY=your-groq-api-key
   GROQ_MODEL_SIMPLE=llama-3.1-8b-instant
   GROQ_MODEL_LONG=meta-llama/llama-4-scout-17b-16e-instruct
   GROQ_MODEL_COMPLEX=openai/gpt-oss-120b
   GROQ_TIMEOUT=30
   
   # Gemini API
   GEMINI_API_KEY=your-gemini-api-key
   GEMINI_MODEL=gemini-2.0-flash-exp
   
   # Embedding Configuration
   EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
   EMBEDDING_DIMENSION=768
   CHUNK_SIZE=512
   CHUNK_OVERLAP=50
   TOP_K_RESULTS=10
   VECTOR_SEARCH_LIMIT=8
   FTS_SEARCH_LIMIT=8
   MAX_QUERY_LENGTH=5000
   MIN_QUERY_LENGTH=3
   MAX_CONTEXT_WINDOW=10
   ```

4. **Deploy**
   - Click "Deploy"
   - Note the public URL

### Step 5: Initialize Database

1. **Connect to PostgreSQL**
   - In Railway dashboard, click on PostgreSQL service
   - Click "Connect" → "psql"
   - Or use the connection string with your local psql client

2. **Run Initialization Script**
   ```bash
   # Copy init.sql content
   cat backend/infra/db/init.sql | railway run psql $DATABASE_URL
   ```

   Or manually:
   - Copy content from `backend/infra/db/init.sql`
   - Paste into Railway's psql console
   - Execute

### Step 6: Setup MinIO Alternative

Railway doesn't provide S3/MinIO. Options:

**Option A: Use Cloudflare R2 (Recommended)**
- Free tier: 10GB storage
- S3-compatible API
- Setup: https://developers.cloudflare.com/r2/

**Option B: Use AWS S3**
- Pay as you go
- Fully compatible

**Option C: Use Railway Volume (Limited)**
- Not recommended for production
- Limited to single instance

Update environment variables with your chosen storage credentials.

---

## 🚀 Part 2: Deploy Frontend to Vercel

### Step 1: Prepare Frontend

1. **Update API URL**
   - You'll set this in Vercel environment variables
   - Use your Railway API URL

### Step 2: Deploy to Vercel

1. **Import Project**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - **Important**: Set root directory to `frontend`

2. **Configure Build**
   - Framework Preset: Next.js
   - Build Command: `pnpm build`
   - Output Directory: `.next`
   - Install Command: `pnpm install`
   - Root Directory: `frontend`

3. **Add Environment Variables**
   ```
   NEXT_PUBLIC_API_URL=https://your-api.up.railway.app/api/v1
   ```

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your site will be live!

---

## 🔧 Post-Deployment Configuration

### 1. Update CORS in API

The API needs to allow requests from your Vercel domain.

**In Railway API service**, add environment variable:
```
ALLOWED_ORIGINS=https://your-project.vercel.app,https://yourdomain.com
```

Then update `backend/api/cmd/api/main.go`:

```go
r.Use(cors.Handler(cors.Options{
    AllowedOrigins: strings.Split(os.Getenv("ALLOWED_ORIGINS"), ","),
    AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
    AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
    AllowCredentials: true,
}))
```

Redeploy the API service.

### 2. Test the Connection

Visit your Vercel URL:
- Try logging in with: `admin@cs.du.ac.bd` / `Admin@12345`
- Browse the catalog
- Test AI chat

### 3. Setup Custom Domains (Optional)

**Vercel:**
- Project Settings → Domains
- Add your domain
- Update DNS records

**Railway:**
- Service Settings → Networking
- Add custom domain
- Update DNS records

---

## 💰 Cost Estimation

### Railway (Backend)
- **Hobby Plan**: $5/month
  - 500 hours execution time
  - 8GB RAM
  - 100GB bandwidth
- **PostgreSQL**: Included
- **Redis**: Included

### Vercel (Frontend)
- **Hobby Plan**: Free
  - 100GB bandwidth
  - Unlimited deployments
- **Pro Plan**: $20/month (if needed)

### Storage (MinIO Alternative)
- **Cloudflare R2**: Free tier (10GB)
- **AWS S3**: ~$0.023/GB/month

**Total Estimated Cost**: $5-10/month

---

## 📊 Monitoring

### Railway Dashboard
- View logs for each service
- Monitor resource usage
- Check deployment status

### Vercel Dashboard
- View deployment logs
- Monitor performance
- Check analytics

---

## 🔄 Continuous Deployment

Both platforms support automatic deployment:

**Railway:**
- Push to `main` branch
- Railway auto-deploys backend services

**Vercel:**
- Push to `main` branch
- Vercel auto-deploys frontend

---

## 🆘 Troubleshooting

### Frontend can't connect to backend

1. **Check CORS**
   - Verify `ALLOWED_ORIGINS` in Railway
   - Check browser console for CORS errors

2. **Check API URL**
   - Verify `NEXT_PUBLIC_API_URL` in Vercel
   - Test API directly: `curl https://your-api.up.railway.app/health`

3. **Check Railway logs**
   - Railway Dashboard → API Service → Logs

### Database connection issues

1. **Check environment variables**
   - Verify Railway provided correct DATABASE_URL
   - Check if PostgreSQL service is running

2. **Check database logs**
   - Railway Dashboard → PostgreSQL → Logs

3. **Test connection**
   ```bash
   railway run psql $DATABASE_URL -c "SELECT 1"
   ```

### RAG service not responding

1. **Check logs**
   - Railway Dashboard → RAG Service → Logs

2. **Verify environment variables**
   - Check GROQ_API_KEY is set
   - Verify database connection

3. **Test endpoint**
   ```bash
   curl https://your-rag.up.railway.app/health
   ```

---

## 🔒 Security Checklist

- [ ] Changed JWT_SECRET to strong random string
- [ ] Updated all default passwords in database
- [ ] Configured CORS properly
- [ ] Using HTTPS for all services
- [ ] Environment variables secured in Railway/Vercel
- [ ] Database backups configured
- [ ] Rate limiting enabled (if needed)

---

## 📚 Useful Commands

### Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link project
railway link

# View logs
railway logs

# Run commands in Railway environment
railway run psql $DATABASE_URL

# Deploy
railway up
```

### Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod

# View logs
vercel logs
```

---

## 🎉 Success!

Your platform is now deployed!

- **Frontend**: https://your-project.vercel.app
- **API**: https://your-api.up.railway.app
- **RAG**: https://your-rag.up.railway.app

**Next Steps:**
1. Change default passwords
2. Add your content
3. Configure custom domains
4. Setup monitoring
5. Configure backups

---

## 📞 Support

- Railway Docs: https://docs.railway.app
- Vercel Docs: https://vercel.com/docs
- Project Issues: GitHub Issues

---

**Deployed with ❤️ on Railway + Vercel**
