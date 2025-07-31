#!/bin/bash

# Script to clear all PGMQ queues using psql
# This connects to your Supabase database and runs the queue purge commands

# Load environment variables
source .env.local

# Parse the database URL
if [[ $DATABASE_URL =~ postgres://([^:]+):([^@]+)@([^:]+):([^/]+)/([^?]+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASS="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
else
    echo "❌ Could not parse DATABASE_URL"
    exit 1
fi

echo "🔧 Connecting to Supabase database..."
echo "   Host: $DB_HOST"
echo "   Database: $DB_NAME"
echo ""

# Execute the SQL commands
PGPASSWORD="$DB_PASS" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f scripts/clear-all-queues.sql

echo ""
echo "✅ Queue clearing complete!"