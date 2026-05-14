#!/bin/bash
set -e

echo "=== Stopping all containers ==="
docker compose down -v

echo "=== Removing old images ==="
docker compose rm -f

echo "=== Rebuilding all images ==="
docker compose build --no-cache api frontend

echo "=== Starting database services ==="
docker compose up -d postgres redis minio

echo "=== Waiting for database to initialize ==="
sleep 20

echo "=== Verifying database is ready ==="
docker compose exec -T postgres psql -U csedu_user -d csedu_platform -c "SELECT COUNT(*) FROM users;"

echo "=== Starting API and Frontend ==="
docker compose up -d api frontend

echo "=== Waiting for services to start ==="
sleep 10

echo "=== Checking API health ==="
curl -f http://localhost:8080/health && echo " - API is healthy"

echo "=== Checking catalog (should be empty) ==="
curl -s http://localhost:8080/api/v1/library/catalog | jq '.total'

echo ""
echo "=== Done! All services are running ==="
echo "Database has been reset with NO seed books"
echo "Only 4 users exist: admin, librarian, researcher, student"
echo ""
docker compose ps
