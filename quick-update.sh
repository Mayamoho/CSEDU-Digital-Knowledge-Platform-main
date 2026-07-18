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

# Apply pending DB migrations (idempotent).
# lock_timeout: a DDL migration (e.g. CREATE UNIQUE INDEX) must never wait
# forever on a lock held by a leaked RAG transaction — that hangs the whole
# deploy. Abort the statement after 5s and move on instead of blocking.
# statement_timeout caps any single slow migration at 60s.
echo ""
echo "1b. Applying database migrations..."
MIGRATIONS="002_media_url_format 005_book_topics 006_rag_index_state \
  007_barcodes 008_notifications_role_requests 009_ingestion_status \
  010_catalog_isbn_unique"
for m in $MIGRATIONS; do
  echo "   - $m"
  docker compose -f docker-compose.prod.yml exec -T \
    -e PGOPTIONS='-c lock_timeout=5000 -c statement_timeout=60000' postgres \
    psql -U csedu_user -d csedu_platform < "infra/db/migrations/${m}.sql" || true
done

# Rebuild frontend, API and RAG service with all fixes.
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