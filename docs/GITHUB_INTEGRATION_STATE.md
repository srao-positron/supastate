# GitHub Integration State Documentation

## Overview
This document captures the current state of the GitHub integration in Supastate as of July 31, 2025. The integration enables crawling GitHub repositories, storing them in Neo4j with embeddings, and processing code files asynchronously.

## ✅ Completed Components

### 1. Database Infrastructure
- **Tables Created:**
  - `github_repositories` - Stores repository metadata
  - `github_user_repos` - Maps users to their accessible repositories  
  - `github_indexed_branches` - Tracks branch sync status
  - `github_crawl_queue` - Job queue for crawl operations
  - `github_crawl_history` - Audit trail of crawl operations
  - `github_webhook_events` - Stores incoming webhook payloads
  - `github_ingestion_logs` - Detailed logging for debugging
  - `github_file_diffs` - Tracks file changes between branches

- **PGMQ Queues:**
  - `github_crawl` - Main crawl job queue
  - `github_code_parsing` - Code parsing job queue

- **Cron Jobs:**
  - `github-crawl-coordinator` - Runs every minute
  - `github-code-parser-worker` - Runs every 30 seconds

### 2. API Endpoints
- **OAuth Flow:**
  - `/api/github/auth` - Initiates OAuth flow
  - `/api/github/callback` - Handles OAuth callback
  - `/api/github/status` - Checks connection status

- **Repository Management:**
  - `/api/github/repos` - Lists user's repositories
  - `/api/github/ingest` - Queues repository for crawling
  - `/api/github/branches/import-fixed` - Imports branches (fixed auth issues)

### 3. Edge Functions (Deployed)
- **github-crawl-coordinator** - Async coordinator using PGMQ pattern
- **github-crawl-worker** - Processes crawl jobs from queue
- **github-code-parser-worker** - Parses code files and extracts functions/classes

### 4. Neo4j Integration
- **Working Node Types:**
  - `Repository` - With description embeddings (3072 dimensions)
  - `RepoIssue` - With title and body embeddings
  
- **Working Relationships:**
  - `(:Repository)-[:HAS_ISSUE]->(:RepoIssue)`

## 🔧 Current Implementation Status

### Async Processing Pattern
The system now follows a true async pattern:

```
1. API receives request → Queues job to github_crawl_queue
2. Cron triggers coordinator → Reads pending jobs
3. Coordinator → Sends jobs to PGMQ → Spawns workers (fire-and-forget)
4. Workers → Read from PGMQ → Process independently → Update status
```

### Key Fix Applied
- Coordinator no longer waits for workers (was causing timeouts)
- Uses background task pattern from Supabase docs
- Response time: ~1 second (down from 2+ minutes)

## ❌ Not Yet Implemented

### 1. Complete Entity Crawling
The worker currently only crawls:
- ✅ Repository metadata
- ✅ Issues

Still needs to implement:
- ❌ Pull requests
- ❌ Commits
- ❌ Files (code)
- ❌ Branches

### 2. Code Parsing Integration
- `github-code-parser-worker` is deployed but not connected
- File crawling needs to queue files to `github_code_parsing` queue
- Parser should extract functions/classes and create nodes

### 3. Relationship Discovery (Phase 5)
- No relationships between code entities
- No semantic similarity relationships
- No Camille-to-GitHub connections

### 4. Webhook System (Phase 4)
- Tables exist but no endpoint implementation
- No webhook signature verification
- No event processors

## 📁 Key Files and Locations

### API Routes
- `/src/app/api/github/auth/route.ts` - OAuth initiation
- `/src/app/api/github/callback/route.ts` - OAuth callback
- `/src/app/api/github/ingest/route.ts` - Repository ingestion
- `/src/app/api/github/branches/import-fixed/route.ts` - Branch import

### Edge Functions
- `/supabase/functions/github-crawl-coordinator/index.ts`
- `/supabase/functions/github-crawl-worker/index.ts`
- `/supabase/functions/github-code-parser-worker/index.ts`

### Database Migrations
- `/supabase/migrations/20250730_github_integration.sql`
- `/supabase/migrations/20250807_github_branch_tracking.sql`
- `/supabase/migrations/20250808_github_cron_jobs.sql`
- `/supabase/migrations/20250809_github_rpc_functions.sql`

### Libraries
- `/src/lib/github/client.ts` - GitHub API client
- `/src/lib/github/auth.ts` - OAuth helpers
- `/src/lib/github/branches.ts` - Branch operations

## 🎓 Key Learnings

### 1. Authentication Patterns
- GitHub OAuth Apps don't use refresh tokens (tokens persist)
- Service-level auth needed for background operations
- Browser auth not required for public repositories

### 2. Async Processing
- Supabase edge functions have timeouts (2 minutes default)
- Use fire-and-forget pattern for long operations
- PGMQ provides reliable message queuing

### 3. Neo4j in Deno
- Must use browser-compatible driver:
  ```typescript
  import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'
  ```
- Node.js driver causes `string_decoder` errors

### 4. Database Patterns
- Always use `IF EXISTS/IF NOT EXISTS` in migrations
- Service role key bypasses RLS for background jobs
- Use `pgmq_send` for queuing, `pgmq_read` for consuming

## 🔍 Current Data State

### Neo4j
- 2 Repository nodes (camille, vercel/swr)
- 133 RepoIssue nodes
- All have proper embeddings (3072 dimensions)
- OpenAI integration working correctly

### PostgreSQL
- 3 pending messages in `github_crawl` queue
- 1 repository marked as "crawling" (vercel/swr)
- Worker appears to have stopped (needs investigation)

## 🚀 Next Steps (When Resuming)

1. **Complete File Crawling**
   - Implement file listing in github-crawl-worker
   - Queue files to github_code_parsing queue
   - Create RepoFile nodes with content embeddings

2. **Connect Code Parser**
   - Ensure parser reads from PGMQ queue
   - Create RepoFunction and RepoClass nodes
   - Link to parent RepoFile nodes

3. **Implement Remaining Crawl Types**
   - Pull requests with comments
   - Commit history
   - Branch comparisons

4. **Build Relationship Discovery**
   - Code similarity relationships
   - Explicit relationships (imports, calls)
   - Cross-entity connections

## 🐛 Known Issues

1. **Worker Timeout**
   - Worker stops processing after ~5 minutes
   - May need to implement batching or progress checkpoints

2. **Missing Columns**
   - Had to manually add `queued_at` column
   - May be other missing columns in migrations

3. **Error Handling**
   - Worker crashes don't update job status
   - Need better error recovery mechanisms

## 📊 Testing Commands

```bash
# Check GitHub data in Neo4j
npx tsx scripts/check-github-neo4j-data.ts

# Check crawl queue status
psql $DATABASE_URL -c "SELECT * FROM pgmq.metrics('github_crawl');"

# Check job status
psql $DATABASE_URL -c "SELECT id, status, error FROM github_crawl_queue ORDER BY created_at DESC LIMIT 5;"

# Manually trigger coordinator
curl -X POST https://service.supastate.ai/functions/v1/github-crawl-coordinator \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Summary
The GitHub integration foundation is solid. Authentication works, async processing is properly implemented, and Neo4j integration with embeddings is functional. The main work remaining is completing the entity crawling and implementing the relationship discovery system.