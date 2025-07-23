# Supastate Deployment Guide

## Overview

The Supastate server-side processing architecture is now fully deployed and ready for use!

## Key Components

### 1. API Endpoints (Live on Vercel)

- **Memory Ingestion**: `POST https://supastate.ai/api/ingest/memory`
- **Code Ingestion**: `POST https://supastate.ai/api/ingest/code`
- **Search API**: `GET https://supastate.ai/api/search/memories?q=query&project=project-name`

### 2. Edge Functions (Deployed on Supabase)

- **process-embeddings**: Main processing function that generates embeddings
  - Uses background tasks to avoid timeout limitations
  - Processes up to 100 items per run
  - Respects OpenAI rate limits (40 req/s, 900k tokens/min)

- **schedule-processor**: Scheduler function to trigger processing
  - Should be called by a cron job every minute

### 3. Database Schema

All migrations have been deployed:
- Queue tables: `memory_queue`, `code_queue`
- Processing status tracking: `processing_status`
- Search function with project filtering support

## Setup Instructions

### 1. Set OpenAI API Key

```bash
npx supabase secrets set OPENAI_API_KEY=your-real-openai-api-key
```

### 2. Create a Cron Job

In the Supabase Dashboard:
1. Go to Database → Extensions → Enable pg_cron
2. Go to SQL Editor and run:

```sql
-- Create a cron job to run every minute
SELECT cron.schedule(
  'process-embeddings-job',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/schedule-processor',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('trigger', 'cron')
  ) AS request_id;
  $$
);
```

### 3. Create an API Key

In Supabase Dashboard → SQL Editor:

```sql
-- Create a test user
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'api@supastate.ai',
  crypt('secure-password', gen_salt('bf')),
  now(),
  now(),
  now()
)
RETURNING id;

-- Create API key for the user (replace USER_ID with the ID from above)
INSERT INTO api_keys (user_id, name, key_hash)
VALUES (
  'USER_ID',
  'Production API Key',
  encode(sha256('your-secure-api-key'::bytea), 'hex')
);
```

### 4. Test the APIs

```bash
# Test memory ingestion
curl -X POST https://supastate.ai/api/ingest/memory \
  -H "Authorization: Bearer your-secure-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "projectPath": "/my/project",
    "chunks": [
      {
        "chunkId": "test-001",
        "content": "This is a test memory chunk",
        "metadata": {
          "messageType": "user",
          "timestamp": "2025-07-23T00:00:00Z"
        }
      }
    ]
  }'

# Wait a minute for processing, then search
curl "https://supastate.ai/api/search/memories?q=test&project=project" \
  -H "Authorization: Bearer your-secure-api-key"
```

## Configuration

### Cron Job Settings
- **Schedule**: `*/1 * * * *` (every minute)
- **Method**: POST
- **Timeout**: 5000ms
- **URL**: Your schedule-processor function URL

### Processing Configuration

The Edge Function uses background tasks, so it:
- Returns immediately (within 5s timeout)
- Continues processing up to 100 items in the background
- Automatically handles rate limiting
- Retries failed items

### Environment Variables

Required in Supabase:
- `OPENAI_API_KEY`: Your OpenAI API key for embeddings

## Monitoring

1. **Check Queue Status**:
```sql
-- Pending items
SELECT status, COUNT(*) FROM memory_queue GROUP BY status;
SELECT status, COUNT(*) FROM code_queue GROUP BY status;
```

2. **View Logs**:
- Supabase Dashboard → Functions → Logs
- Vercel Dashboard → Functions → Logs

3. **Processing Status**:
```sql
SELECT * FROM processing_status 
WHERE status = 'active' 
ORDER BY started_at DESC;
```

## Troubleshooting

1. **Items stuck in queue**: Check Edge Function logs for errors
2. **Search returns no results**: Ensure embeddings have been generated (check `embedding IS NOT NULL`)
3. **Rate limit errors**: The function automatically handles rate limiting, but you can adjust `BATCH_SIZE` if needed

## Next Steps

1. Configure Camille to use the new APIs
2. Set up monitoring dashboards
3. Consider adding alerts for failed processing
4. Implement data retention policies for queue tables