# CSEDU Digital Knowledge Platform - Frontend

Next.js frontend application for the CSEDU Digital Knowledge Platform.

## 🚀 Deployment on Vercel

### Prerequisites
- Vercel account
- Backend API deployed and accessible

### Steps

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Select the `frontend` directory as the root directory

3. **Configure Environment Variables**
   Add the following environment variable in Vercel:
   - `NEXT_PUBLIC_API_URL`: Your backend API URL (e.g., `https://your-api.com/api/v1`)

4. **Deploy**
   - Click "Deploy"
   - Vercel will automatically build and deploy your application

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
