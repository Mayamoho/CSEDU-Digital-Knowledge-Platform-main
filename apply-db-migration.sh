#!/bin/bash

# Apply database migration for project fixes
echo "Applying database migration for project fixes..."

# Check if docker-compose is running
if ! docker-compose ps | grep -q "postgres.*Up"; then
    echo "Starting database..."
    docker-compose up -d postgres
    sleep 5
fi

# Apply the migration
docker-compose exec -T postgres psql -U postgres -d csedu_platform -f /docker-entrypoint-initdb.d/migrate_project_fixes.sql

echo "Migration applied successfully!"