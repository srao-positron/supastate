# Supastate V2 Architecture: Server-Side Processing

## Overview

The current architecture requires Camille to:
1. Generate embeddings locally (slow, requires OpenAI API calls)
2. Store embeddings in LanceDB (14GB+ storage)
3. Build code graphs in Kuzu (more storage)
4. Sync everything to Supastate (massive data transfer)

This is inefficient and slow. The new architecture moves all processing to Supastate.

## New Architecture

### Data Flow

```
Camille Client                    Supastate Server
     |                                   |
     |-- Raw transcript/code -------->   |
     |   (small, compressed)             |
     |                                   |-- Queue for processing
     |                                   |-- Generate embeddings
     |<-- Search results --------------  |-- Store in Postgres
     |    (instant)                      |-- Build code graph
                                         |-- Handle rate limits
```

### Key Changes

1. **Camille becomes a thin client**
   - Sends raw data only (transcripts, code, metadata)
   - No local embedding generation
   - No local vector storage (optional cache only)
   - Uses Supastate APIs for all search/query operations

2. **Supastate becomes the processing engine**
   - Receives raw data via streaming APIs
   - Queues embedding generation
   - Handles OpenAI rate limits gracefully
   - Stores vectors and graphs in Postgres
   - Provides real-time search APIs

3. **Benefits**
   - Instant "sync" - data sent as generated
   - No duplicate work across team members
   - Reduced client storage (MB instead of GB)
   - Faster Camille startup (no index loading)
   - Real-time collaboration

## Implementation Plan

### Phase 1: Supastate Ingestion APIs

1. **Memory Ingestion API**
   ```typescript
   POST /api/ingest/memory
   {
     sessionId: string
     chunks: [{
       content: string
       metadata: {
         timestamp: string
         filePaths?: string[]
         messageType: 'user' | 'assistant'
         // ... other metadata
       }
     }]
   }
   ```

2. **Code Ingestion API**
   ```typescript
   POST /api/ingest/code
   {
     projectPath: string
     files: [{
       path: string
       content: string
       language: string
       lastModified: string
     }]
   }
   ```

3. **Processing Queue**
   - Use Supabase Edge Functions or pg_cron
   - Process in batches to optimize OpenAI API usage
   - Handle rate limits with exponential backoff
   - Update processing status in real-time

### Phase 2: Storage Schema

1. **Raw Data Tables**
   ```sql
   -- Store raw transcripts before processing
   CREATE TABLE memory_queue (
     id UUID PRIMARY KEY,
     workspace_id TEXT NOT NULL,
     session_id TEXT NOT NULL,
     content TEXT NOT NULL,
     metadata JSONB,
     status TEXT DEFAULT 'pending',
     created_at TIMESTAMPTZ DEFAULT NOW(),
     processed_at TIMESTAMPTZ
   );

   -- Store code files before processing
   CREATE TABLE code_queue (
     id UUID PRIMARY KEY,
     workspace_id TEXT NOT NULL,
     file_path TEXT NOT NULL,
     content TEXT NOT NULL,
     language TEXT,
     metadata JSONB,
     status TEXT DEFAULT 'pending',
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. **Processed Data**
   - Extend existing memories/code_objects tables
   - Add processing_status field
   - Link back to queue tables

### Phase 3: Camille Client Changes

1. **Abstract Storage Layer**
   ```typescript
   interface StorageProvider {
     addMemory(chunk: MemoryChunk): Promise<void>
     searchMemories(query: string): Promise<SearchResult[]>
     addCodeFile(file: CodeFile): Promise<void>
     queryGraph(query: string): Promise<GraphResult>
   }

   class LocalStorageProvider implements StorageProvider { /* LanceDB/Kuzu */ }
   class SupastateStorageProvider implements StorageProvider { /* API calls */ }
   ```

2. **Streaming Updates**
   - Send data as it's generated
   - Don't wait for embeddings
   - Show processing status in UI

### Phase 4: Search & Query APIs

1. **Hybrid Search**
   ```typescript
   GET /api/search/memories?q=...&workspace=...
   GET /api/search/code?q=...&workspace=...
   ```

2. **Graph Queries**
   ```typescript
   POST /api/graph/query
   {
     cypher: string
     workspace: string
   }
   ```

## Migration Strategy

1. **Backwards Compatible**
   - Camille works with or without Supastate
   - Existing local storage continues to work
   - Gradual migration of features

2. **Feature Flags**
   ```typescript
   if (config.supastate?.enabled && config.supastate?.serverSideProcessing) {
     // Use new architecture
   } else {
     // Use local processing
   }
   ```

## Performance Targets

- **Ingestion**: < 100ms to accept and queue data
- **Processing**: < 5s for embedding generation per chunk
- **Search**: < 200ms for vector search
- **Graph Query**: < 500ms for complex queries

## Security Considerations

- API authentication via existing API keys
- Workspace isolation in all queries
- Rate limiting per workspace
- Data encryption at rest and in transit