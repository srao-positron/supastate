# Queue-Based Architecture for Supastate

## Overview

This document outlines the migration from edge functions to a queue-based architecture for both ingestion and pattern detection in Supastate. This approach solves timeout issues and provides better scalability, reliability, and monitoring.

## Architecture Design

### 1. Queue Structure

We'll implement three main queues:

1. **`memory_ingestion`** - Processes incoming memories and code entities
2. **`pattern_detection`** - Runs pattern detection algorithms
3. **`summary_generation`** - Generates LLM-enhanced summaries (future)

### 2. Message Flow

```
User Input → API Endpoint → Queue Message → Worker → Processing → Neo4j/Supabase
```

### 3. Queue Messages

#### Memory Ingestion Message
```json
{
  "type": "memory",
  "user_id": "uuid",
  "workspace_id": "uuid", 
  "memory_id": "uuid",
  "content": "...",
  "metadata": {}
}
```

#### Pattern Detection Message
```json
{
  "batch_id": "uuid",
  "pattern_types": ["debugging", "learning", "refactoring", "temporal", "semantic", "memory_code"],
  "limit": 100,
  "user_id": "uuid",
  "workspace_id": "uuid"
}
```

## Implementation Strategy

### Phase 1: Queue Infrastructure
1. Create queue tables using pgmq
2. Set up queue monitoring views
3. Create helper functions for queue operations

### Phase 2: Ingestion Queue
1. Create `queue-memory-ingestion` edge function
2. Modify existing ingestion to post to queue
3. Create worker that processes queue messages
4. Reuse existing Neo4j ingestion logic

### Phase 3: Pattern Detection Queue  
1. Create `queue-pattern-detection` edge function
2. Convert pattern processor to queue worker
3. Reuse all existing pattern detection functions
4. Add queue-based logging and error handling

### Phase 4: Integration
1. Update cron jobs to use queues
2. Add queue monitoring dashboard
3. Implement dead letter queue for failed jobs

## Benefits

1. **No Timeouts**: Workers can run as long as needed
2. **Reliability**: Automatic retries for failed jobs
3. **Visibility**: Built-in job status tracking
4. **Scalability**: Can process multiple jobs in parallel
5. **Decoupling**: API responds immediately, processing happens async
6. **Error Recovery**: Failed jobs don't lose data

## Queue Worker Pattern

```typescript
// Existing function (unchanged)
async function processMemories(driver, supabase, limit) {
  // ... existing logic
}

// New queue worker
async function processMemoryIngestionQueue() {
  const { data: jobs } = await pgmq.read('memory_ingestion', 10)
  
  for (const job of jobs) {
    try {
      // Call existing function
      await processMemories(driver, supabase, job.message.limit)
      
      // Mark job complete
      await pgmq.delete('memory_ingestion', job.msg_id)
    } catch (error) {
      // Job will retry automatically
      logger.error('Processing failed', error)
    }
  }
}
```

## Monitoring

Queue health can be monitored with:
```sql
-- View queue stats
SELECT * FROM pgmq.metrics('memory_ingestion');

-- View failed jobs
SELECT * FROM pgmq.queue_memory_ingestion 
WHERE retry_count > 0;
```

## Migration Path

1. Implement queues alongside existing functions
2. Gradually migrate traffic to queue-based approach
3. Monitor performance and reliability
4. Deprecate direct edge function calls

This architecture provides a robust foundation for scaling Supastate's data processing capabilities.