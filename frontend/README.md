# CSEDU Digital Knowledge Platform - Frontend

Next.js frontend application for the CSEDU Digital Knowledge Platform.

## 🚀 Deployment on Vercel

### Prerequisites
- Vercel account (free tier available)
- Backend deployed on Railway (or other platform)
- Backend API URL

### Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/your-repo&root-directory=frontend&env=NEXT_PUBLIC_API_URL)

### Manual Deployment Steps

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
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
   - Root Directory: `frontend` ⚠️

4. **Add Environment Variables**
   In Vercel dashboard, add:
   
   | Name | Value | Example |
   |------|-------|---------|
   | `NEXT_PUBLIC_API_URL` | Your backend API URL | `https://your-api.up.railway.app/api/v1` |

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (~2 minutes)
   - Your site will be live at `https://your-project.vercel.app`

6. **Configure Custom Domain (Optional)**
   - Go to Project Settings → Domains
   - Add your custom domain
   - Update DNS records as instructed

### Automatic Deployments

Vercel automatically deploys when you push to GitHub:

```bash
git add .
git commit -m "Update feature"
git push origin main
# Vercel auto-deploys! ✨
```

### Environment Variables for Different Environments

**Production:**
```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

**Preview (for testing):**
```env
NEXT_PUBLIC_API_URL=https://staging-api.yourdomain.com/api/v1
```

**Development:**
```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
```

## 🛠️ Local Development

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Create `.env.local` file**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and set:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
   ```

3. **Run development server**
   ```bash
   pnpm dev
   ```

4. **Open browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
frontend/
├── app/              # Next.js 14 App Router pages
├── components/       # React components
├── lib/             # Utilities and API client
├── hooks/           # Custom React hooks
├── public/          # Static assets
└── styles/          # Global styles
```

## 🔧 Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint

## 🌐 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `https://api.example.com/api/v1` |
| `INTERNAL_API_URL` | Internal API URL (Docker) | `http://api:8080/api/v1` |

## 📝 Notes

- The `NEXT_PUBLIC_` prefix makes the variable accessible in the browser
- For production, ensure your backend API has proper CORS configuration
- Update the API URL in Vercel environment variables after deploying backend

## 🔗 Related

- [Backend Repository](../backend)
- [Project Documentation](../README.md)
