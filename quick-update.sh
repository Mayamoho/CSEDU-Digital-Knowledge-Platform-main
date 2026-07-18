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

# Apply pending DB migrations (idempotent)
echo ""
echo "1b. Applying database migrations..."
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U csedu_user -d csedu_platform < infra/db/migrations/002_media_url_format.sql || true
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U csedu_user -d csedu_platform < infra/db/migrations/005_book_topics.sql || true
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U csedu_user -d csedu_platform < infra/db/migrations/006_rag_index_state.sql || true
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U csedu_user -d csedu_platform < infra/db/migrations/007_barcodes.sql || true
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U csedu_user -d csedu_platform < infra/db/migrations/008_notifications_role_requests.sql || true
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U csedu_user -d csedu_platform < infra/db/migrations/009_ingestion_status.sql || true

# Rebuild frontend, API and RAG service with all fixes
echo ""
echo "2. Cleaning Docker cache..."
docker builder prune -f 2>/dev/null || true

echo "   Rebuilding frontend, API, RAG and workers..."
docker compose -f docker-compose.prod.yml build frontend api rag ingestion-worker fine-worker

# Restart the stack. Workers are included so email-sending code and
# updated SMTP credentials in .env are picked up (env_file is only
# re-read when a container is (re)created, not on plain `restart`).
echo ""
echo "3. Restarting services..."
docker compose -f docker-compose.prod.yml up -d nginx frontend api rag ingestion-worker fine-worker

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