# Updating Ingestion Pipeline to Enhanced Version

## Overview

The enhanced ingestion pipeline adds real-time summarization and pattern detection to the existing memory and code processing. This document outlines how to transition from the current pipeline to the enhanced version.

## Changes Required

### 1. Database Migration

First, apply the database migrations to create the required tables:

```bash
# Apply pattern detection tables
npx supabase db push

# Or manually run:
psql $SUPABASE_DB_URL -f supabase/migrations/20250127_pattern_detection_tables.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20250127_pattern_detection_cron.sql
```

### 2. Update Environment Variables

Ensure these environment variables are set in your Supabase dashboard:

```
OPENAI_API_KEY=<your-openai-key>
NEO4J_URI=<your-neo4j-uri>
NEO4J_USER=<your-neo4j-user>
NEO4J_PASSWORD=<your-neo4j-password>
```

### 3. Deploy New Edge Functions

```bash
# Deploy the enhanced processing function
npx supabase functions deploy enhanced-process-neo4j

# Deploy pattern detection functions
npx supabase functions deploy detect-patterns-batch
npx supabase functions deploy schedule-pattern-detection
```

### 4. Update Application Code

Update the memory ingestion endpoint in your application:

```typescript
// In src/app/api/memories/ingest/route.ts
// Change the processing endpoint from:
const processUrl = `${SUPABASE_URL}/functions/v1/process-neo4j-embeddings`

// To:
const processUrl = `${SUPABASE_URL}/functions/v1/enhanced-process-neo4j`
```

For code processing, the existing pipeline can continue to work, but you should add summary creation:

```typescript
// In process-code/index.ts, after creating code entities, add:
await processCodeWithSummary(entity, file, driver, supabaseClient)
```

### 5. Update Cron Jobs

The new cron jobs will automatically be created when you run the migration. To verify:

```sql
-- Check scheduled jobs
SELECT * FROM cron.job;
```

You should see:
- `pattern-detection-5min` - Runs every 5 minutes
- `process-memory-queue` - Runs every 2 minutes
- `process-code-queue` - Runs every 3 minutes

### 6. Testing the Enhanced Pipeline

1. **Test Memory Ingestion:**
```bash
curl -X POST https://your-supabase-url/functions/v1/ingest-memory \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "test-project",
    "chunks": [{
      "sessionId": "test-session",
      "chunkId": "test-chunk-1",
      "content": "Working on debugging the authentication error in the login component."
    }]
  }'
```

2. **Verify Summary Creation:**
```cypher
// In Neo4j Browser
MATCH (m:Memory {chunk_id: 'test-chunk-1'})
MATCH (s:EntitySummary)-[:SUMMARIZES]->(m)
RETURN m, s
```

3. **Check Pattern Detection:**
```cypher
// After a few minutes, check for patterns
MATCH (p:PatternSummary)
WHERE p.scope_type = 'project'
  AND p.pattern_type = 'debugging'
RETURN p
LIMIT 10
```

## Benefits of Enhanced Pipeline

1. **Real-time Intelligence**: Patterns are discovered as data is ingested
2. **Efficient Queries**: Summary nodes enable fast pattern queries without scanning all data
3. **LLM Enhancement**: Optional LLM analysis provides deeper insights
4. **Background Processing**: Pattern detection runs asynchronously without blocking ingestion
5. **Multi-tenant Support**: Patterns are properly scoped to users/teams/projects

## Monitoring

Monitor the enhanced pipeline through:

1. **Supabase Dashboard**: Check function logs
2. **Database Tables**: Query pattern_detection_queue status
3. **Neo4j Browser**: Visualize summary nodes and patterns
4. **Application UI**: Pattern notifications and insights

## Rollback Plan

If issues arise, you can rollback by:

1. Updating endpoints back to original functions
2. Disabling cron jobs: `SELECT cron.unschedule('pattern-detection-5min');`
3. The original data remains intact - only new summary nodes are added

## Next Steps

1. Create UI components to display discovered patterns
2. Build MCP tools that leverage pattern insights
3. Implement user feedback loop for pattern validation
4. Add semantic clustering for improved pattern discovery