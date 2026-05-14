#!/bin/bash
set -e

echo "=== Stopping all containers ==="
docker compose down

echo "=== Rebuilding all images ==="
docker compose build --no-cache api frontend

echo "=== Starting services ==="
docker compose up -d postgres redis minio

echo "=== Waiting for services to be healthy ==="
sleep 15

echo "=== Starting API and Frontend ==="
docker compose up -d api frontend

echo "=== Waiting for API to start ==="
sleep 5

echo "=== Checking API health ==="
curl -f http://localhost:8080/health || echo "API not ready yet"

echo "=== Done! Services are running ==="
docker compose ps
