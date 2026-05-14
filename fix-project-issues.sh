#!/bin/bash

echo "🔧 Fixing project submission issues..."

# Stop all services
echo "📦 Stopping services..."
docker compose down

# Remove old database volume to apply schema changes
echo "🗑️  Removing old database volume..."
docker volume rm csedu-digital-knowledge-platform-main_postgres_data 2>/dev/null || true

# Rebuild and start services
echo "🏗️  Rebuilding and starting services..."
docker compose up -d postgres redis minio

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Build and start API
echo "🚀 Building and starting API..."
docker compose up -d api

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
sleep 5

# Build and start frontend
echo "🎨 Building and starting frontend..."
docker compose up -d frontend nginx

# Start workers
echo "⚙️  Starting workers..."
docker compose up -d ingestion-worker fine-worker rag

echo "✅ All services are now running!"
echo ""
echo "🌐 Frontend: http://localhost"
echo "🔧 API: http://localhost/api/v1"
echo "📊 MinIO Console: http://localhost:9001"
echo ""
echo "🔑 Default login credentials:"
echo "   Admin: admin@cs.du.ac.bd / Admin@12345"
echo "   Student: student@cs.du.ac.bd / Student@12345"
echo "   Researcher: researcher@cs.du.ac.bd / Research@12345"
echo ""
echo "✨ Project submission should now work with:"
echo "   - ZIP file support"
echo "   - APK file support" 
echo "   - Optional file upload"
echo "   - Web URL, GitHub repo, and app download links"