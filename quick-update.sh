# Quick update script for server deployment
# Run this on the server at ~/csedu-platform

set -e

echo "======================================"
echo "CSEDU Platform - Quick Update"
echo "======================================"

# Pull latest changes
echo ""
echo "1. Pulling latest changes from git..."
git fetch origin
git reset --hard origin/main

# Rebuild frontend and RAG service with all fixes
echo ""
echo "2. Cleaning Docker cache..."
docker builder prune -f 2>/dev/null || true

echo "   Rebuilding frontend and RAG service..."
docker compose -f docker-compose.prod.yml build frontend rag

# Restart the stack (including RAG now)
echo ""
echo "3. Restarting services..."
docker compose -f docker-compose.prod.yml up -d nginx frontend api rag

# Show status
echo ""
echo "4. Checking status..."
docker compose -f docker-compose.prod.yml ps

echo ""
echo "======================================"
echo "Update complete!"
echo ""
echo "Access your app at: http://20.195.127.226:8080"
echo ""
echo "Check logs with:"
echo "  docker compose -f docker-compose.prod.yml logs -f frontend"
echo "  docker compose -f docker-compose.prod.yml logs -f api"
echo "  docker compose -f docker-compose.prod.yml logs -f rag"
echo "  docker compose -f docker-compose.prod.yml logs -f nginx"
echo "======================================"