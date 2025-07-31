#!/bin/bash

# Reset all data in Supabase and Neo4j
# Usage: ./scripts/reset-all.sh

set -e

echo "=== COMPLETE DATA RESET - Supabase and Neo4j ==="
echo ""
echo "⚠️  This will DELETE:"
echo "   - All memories, code entities, and patterns"
echo "   - All queued messages and processing tasks"
echo "   - All Neo4j nodes and relationships"
echo "   - All embeddings and cached data"
echo ""
echo "🛡️  This will PRESERVE:"
echo "   - Users, teams, workspaces, and memberships"
echo "   - Settings and configuration"
echo "   - Billing and subscription data"
echo "   - System tables and authentication"
echo ""
echo "Press Ctrl+C within 5 seconds to cancel..."
sleep 5

# Load environment variables
source .env.local

# Extract database connection details
DB_HOST=$(echo $SUPABASE_DB_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo $SUPABASE_DB_URL | sed -n 's/.*postgres:\([^@]*\)@.*/\1/p')

echo ""
echo "1. Clearing Supabase data..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U postgres -d postgres -f scripts/clear-all-data.sql

echo ""
echo "2. Clearing Neo4j data..."
npx tsx scripts/clear-neo4j-data.ts

echo ""
echo "✅ All data cleared successfully!"
echo ""
echo "You can now start fresh with:"
echo "  - Camille for memory/code ingestion"
echo "  - API endpoints for manual ingestion"
echo "  - Pattern detection will run automatically"