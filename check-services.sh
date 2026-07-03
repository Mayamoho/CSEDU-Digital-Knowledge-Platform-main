#!/bin/bash

echo "======================================"
echo "CSEDU Platform - Service Diagnostics"
echo "======================================"

echo ""
echo "1. Checking container status..."
docker compose ps

echo ""
echo "2. Checking API container logs (last 50 lines)..."
docker compose logs --tail=50 api

echo ""
echo "3. Checking if API port is listening..."
docker compose exec api netstat -tlnp 2>/dev/null || echo "netstat not available"

echo ""
echo "4. Testing API health from inside nginx container..."
docker compose exec nginx wget -qO- http://api:8080/health || echo "API not reachable from nginx"

echo ""
echo "5. Testing API health from host..."
curl -v http://localhost:8080/health 2>&1 | head -20

echo ""
echo "6. Checking frontend container logs (last 30 lines)..."
docker compose logs --tail=30 frontend

echo ""
echo "7. Checking RAG container logs (last 30 lines)..."
docker compose logs --tail=30 rag

echo ""
echo "======================================"
echo "Diagnostics Complete"
echo "======================================"
