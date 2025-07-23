#!/bin/bash

# Test script for local Camille -> Supastate sync

echo "🔧 Setting up test environment..."

# Create a test user and API key using psql
API_KEY="supastate_test_$(openssl rand -base64 32 | tr -d '=/+')"
# Use openssl to calculate SHA256 hash (same as Node.js crypto)
API_KEY_HASH=$(echo -n "$API_KEY" | openssl dgst -sha256 -hex | sed 's/^.* //')

echo "📝 Creating test user and API key..."

# Use the local Supabase database
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres <<EOF
-- Clean up previous test data
DELETE FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM memories WHERE user_id = '11111111-1111-1111-1111-111111111111';

-- Create test user
INSERT INTO auth.users (id, email, created_at, updated_at) 
VALUES ('11111111-1111-1111-1111-111111111111', 'test@example.com', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Create user profile
INSERT INTO users (id, email, created_at) 
VALUES ('11111111-1111-1111-1111-111111111111', 'test@example.com', NOW())
ON CONFLICT (id) DO NOTHING;

-- Create API key
INSERT INTO api_keys (user_id, name, key_hash, is_active, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Key', '$API_KEY_HASH', true, NOW());
EOF

echo ""
echo "✅ Test setup complete!"
echo ""
echo "🔑 API Key: $API_KEY"
echo "🔑 Key Hash: $API_KEY_HASH"
echo ""
echo "📤 Testing sync endpoint..."

# Generate test embedding
EMBEDDING=$(./generate-test-embedding.sh)

# Test sync with minimal data
curl -X POST http://localhost:3002/api/memories/sync \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"projectName\": \"test-project\",
    \"sessionId\": \"test-session-001\",
    \"chunks\": [
      {
        \"chunkId\": \"test-chunk-001\",
        \"content\": \"This is a test memory chunk from Camille\",
        \"embedding\": [$EMBEDDING],
        \"metadata\": {
          \"filePaths\": [\"test.js\"],
          \"topics\": [\"testing\"],
          \"hasCode\": false
        }
      }
    ]
  }" | jq '.'

echo ""
echo "🔍 Checking database..."

# Check if the chunk was saved
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres <<EOF
SELECT 
  chunk_id, 
  project_name, 
  user_id,
  substring(content, 1, 50) as content_preview,
  pg_typeof(embedding) as embedding_type
FROM memories 
WHERE user_id = '11111111-1111-1111-1111-111111111111'
LIMIT 5;
EOF

echo ""
echo "📤 Testing duplicate prevention..."

# Generate updated embedding (different values)
EMBEDDING_UPDATED=$(./generate-test-embedding.sh | sed 's/0.1/0.2/g')

# Test sync with same chunk ID but different content
curl -X POST http://localhost:3002/api/memories/sync \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"projectName\": \"test-project\",
    \"sessionId\": \"test-session-002\",
    \"chunks\": [
      {
        \"chunkId\": \"test-chunk-001\",
        \"content\": \"This is an UPDATED test memory chunk\",
        \"embedding\": [$EMBEDDING_UPDATED],
        \"metadata\": {
          \"filePaths\": [\"test-updated.js\"],
          \"topics\": [\"testing\", \"update\"],
          \"hasCode\": true
        }
      }
    ]
  }" | jq '.'

echo ""
echo "🔍 Verifying update..."

# Check if the chunk was updated
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres <<EOF
SELECT 
  chunk_id, 
  substring(content, 1, 50) as content_preview,
  metadata->>'hasCode' as has_code,
  updated_at > created_at as was_updated
FROM memories 
WHERE user_id = '11111111-1111-1111-1111-111111111111'
  AND chunk_id = 'test-chunk-001';
EOF