#!/bin/bash

# Extract database URL from .env.local
DB_URL="postgresql://postgres:crKfyvgOH14qXy61@db.zqlfxakbkwssxfynrmnk.supabase.co:5432/postgres"

# Query users table structure
echo "=== USERS TABLE STRUCTURE ==="
psql "$DB_URL" -c "\d users" 2>/dev/null || echo "Failed to connect"

echo -e "\n=== TEAM_MEMBERS TABLE STRUCTURE ==="
psql "$DB_URL" -c "\d team_members" 2>/dev/null || echo "Failed to connect"

echo -e "\n=== TEAMS TABLE STRUCTURE ==="
psql "$DB_URL" -c "\d teams" 2>/dev/null || echo "Failed to connect"

# Query sample data
echo -e "\n=== SAMPLE USER RECORD ==="
psql "$DB_URL" -c "SELECT * FROM users LIMIT 1;" 2>/dev/null || echo "Failed to connect"