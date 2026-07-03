#!/bin/bash

echo "======================================"
echo "CSEDU Platform - Quick Update"
echo "======================================"

echo "1. Pulling latest changes from git..."
git fetch --all
git reset --hard origin/main

echo ""
echo "2. Fixing file structure (copying profile dialogs)..."
# Fix the duplicate component folder issue
if [ -d "frontend/components/profile" ]; then
    echo "   Copying profile components to root components folder..."
    mkdir -p components/profile
    cp frontend/components/profile/edit-profile-dialog.tsx components/profile/ 2>/dev/null || true
    cp frontend/components/profile/change-password-dialog.tsx components/profile/ 2>/dev/null || true
    cp frontend/components/profile/profile-content.tsx components/profile/ 2>/dev/null || true
fi

echo ""
echo "3. Killing processes blocking ports..."
sudo fuser -k 6379/tcp 2>/dev/null || true
sudo fuser -k 9000/tcp 2>/dev/null || true
sudo fuser -k 9001/tcp 2>/dev/null || true

echo ""
echo "4. Stopping all containers..."
docker compose down

echo ""
echo "5. Cleaning Docker cache..."
docker builder prune -a -f

echo ""
echo "6. Starting core services (postgres, redis, minio)..."
docker compose up -d postgres redis minio

echo ""
echo "7. Waiting for database to be ready..."
sleep 15

echo ""
echo "8. Starting backend services (api, rag, workers)..."
docker compose up -d api rag ingestion-worker fine-worker

echo ""
echo "9. Waiting for backend to be ready..."
sleep 10

echo ""
echo "10. Building and starting frontend..."
docker compose up -d --build frontend

echo ""
echo "11. Starting nginx..."
docker compose up -d nginx

echo ""
echo "12. Waiting for all services to stabilize..."
sleep 10

echo ""
echo "======================================"
echo "Status of all services:"
echo "======================================"
docker compose ps

echo ""
echo "======================================"
echo "Service Health Checks:"
echo "======================================"
echo "Testing API..."
curl -s http://localhost:8080/health > /dev/null && echo "✅ API is healthy" || echo "❌ API failed"

echo "Testing Frontend..."
curl -s http://localhost:3000 > /dev/null && echo "✅ Frontend is healthy" || echo "❌ Frontend failed"

echo "Testing RAG Service..."
curl -s http://localhost:8001/health > /dev/null && echo "✅ RAG is healthy" || echo "❌ RAG failed"

echo ""
echo "======================================"
echo "Done! Your platform is updated."
echo "======================================"
echo ""
echo "Access the platform at:"
echo "  Frontend: http://localhost:3000"
echo "  API:      http://localhost:8080"
echo "  RAG:      http://localhost:8001"
echo ""
echo "If any service failed, check logs with:"
echo "  docker compose logs [service-name]"
echo ""
