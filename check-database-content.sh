#!/bin/bash

echo "======================================"
echo "CSEDU Platform - Database Content Check"
echo "======================================"

echo ""
echo "1. Checking media_items (research/projects/archives)..."
docker compose exec -T postgres psql -U csedu_user -d csedu_platform -c "
SELECT item_type, status, COUNT(*) as count 
FROM media_items 
GROUP BY item_type, status 
ORDER BY item_type, status;
"

echo ""
echo "2. Checking library_catalog (books)..."
docker compose exec -T postgres psql -U csedu_user -d csedu_platform -c "
SELECT COUNT(*) as total_books, 
       SUM(total_copies) as total_copies,
       SUM(available_copies) as available_copies
FROM library_catalog;
"

echo ""
echo "3. Checking vector_embeddings (media items indexed)..."
docker compose exec -T postgres psql -U csedu_user -d csedu_platform -c "
SELECT mi.item_type, COUNT(DISTINCT ve.item_id) as indexed_items, COUNT(*) as total_chunks
FROM vector_embeddings ve
JOIN media_items mi ON ve.item_id = mi.item_id
GROUP BY mi.item_type;
"

echo ""
echo "4. Checking catalog_embeddings (books indexed)..."
docker compose exec -T postgres psql -U csedu_user -d csedu_platform -c "
SELECT COUNT(*) as indexed_books FROM catalog_embeddings;
"

echo ""
echo "5. Sample media items..."
docker compose exec -T postgres psql -U csedu_user -d csedu_platform -c "
SELECT item_type, title, status FROM media_items LIMIT 10;
"

echo ""
echo "6. Sample library books..."
docker compose exec -T postgres psql -U csedu_user -d csedu_platform -c "
SELECT title, author, format, available_copies, total_copies FROM library_catalog LIMIT 10;
"

echo ""
echo "======================================"
echo "Database Content Check Complete"
echo "======================================"
