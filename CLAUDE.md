# CLAUDE.md - Development Rules and Guidelines

This document contains specific instructions for Claude when working on the Supastate codebase.

## 🔴 CRITICAL: Workspace Isolation and Multi-Tenancy

### ABSOLUTE RULE: Pattern Detection and Data Access MUST Respect Workspace Boundaries

**WORKSPACE ISOLATION REQUIREMENTS**:
- **Patterns MUST NEVER cross workspace boundaries** - Each workspace is completely isolated
- **Patterns CAN cross between users within the same workspace** - This enables team collaboration
- **All pattern detection queries MUST filter by workspace_id** - No exceptions
- **All data queries MUST use getOwnershipFilter** - This ensures proper isolation
- **Queue pattern detection per workspace** - Never run global pattern detection

**CRITICAL IMPLEMENTATION RULES**:
1. When queueing pattern detection after ingestion, ALWAYS include workspace_id
2. Pattern detection worker MUST filter all queries by the provided workspace_id
3. User-triggered pattern detection API MUST only scan that user's workspace
4. NEVER create patterns that link entities from different workspaces
5. ALWAYS test workspace isolation when making changes

**RELATIONSHIP LIMITS (Added 2025-07-29)**:
To prevent relationship explosion and maintain performance:
- `MAX_RELATIONSHIPS_PER_ENTITY = 25` - Each entity can have max 25 relationships
- `MIN_SIMILARITY_THRESHOLD = 0.75` - Only create high-quality semantic relationships
- `MAX_SEMANTIC_CANDIDATES = 50` - Limit candidates to prevent memory issues
- All relationship creation MUST check existing relationship counts before creating new ones

## 🔴 CRITICAL: User/Workspace Data Duality Pattern

### MUST READ - This Pattern Affects ALL Neo4j Queries!

**THE PROBLEM**: Supastate data exists in two states that cause queries to fail silently:

1. **Personal Data** (before joining a team):
   - Has `user_id` only
   - `workspace_id` is NULL
   - Example: 5996 Memory nodes with no workspace_id

2. **Team Data** (after joining a team):
   - Has `workspace_id` 
   - May have `user_id` too
   - Example: 1833 CodeEntity nodes with workspace_id

**THE SOLUTION**: ALWAYS use the standard query patterns:

```typescript
// ❌ WRONG - This will miss thousands of records!
MATCH (m:Memory) WHERE m.workspace_id = $workspaceId

// ❌ WRONG - This will miss team data!
MATCH (m:Memory) WHERE m.user_id = $userId

// ✅ CORRECT - This handles both cases!
import { getOwnershipFilter } from '@/lib/neo4j/query-patterns'

const filter = getOwnershipFilter({ userId, workspaceId, nodeAlias: 'm' })
const query = `MATCH (m:Memory) WHERE ${filter}`
```

**EVERY Neo4j Query Checklist:**
- [ ] Import `getOwnershipFilter` from query-patterns.ts
- [ ] Use ownership filter in WHERE clause
- [ ] Test with both user-only and workspace data
- [ ] Never assume all nodes have workspace_id
- [ ] Handle the transition when users join teams

**Common Failures:**
- Pattern detection finding 0 records (missing personal data)
- Summaries not created for existing memories
- Code entities not found for users
- Insights showing empty results

## 🔴 CRITICAL Pre-Deployment Rules

### Rule 1: ALWAYS Build Before Pushing
**MANDATORY**: Run `npm run build` before pushing any changes that will trigger deployments.

```bash
# Before pushing to GitHub (triggers Vercel deployment)
npm run build
npm run lint
npm run typecheck

# Before pushing database migrations to Supabase
npx supabase db diff  # Check what will change
```

**Why**: This prevents broken deployments and saves time by catching errors locally.

## Project-Specific Rules

### 2. Database Migrations
- **ALWAYS use IF EXISTS/IF NOT EXISTS** in ALL migrations for idempotency:
  ```sql
  -- ✅ CORRECT - Idempotent migrations
  CREATE TABLE IF NOT EXISTS my_table (...);
  CREATE INDEX IF NOT EXISTS idx_name ON table_name (...);
  ALTER TABLE IF EXISTS my_table ADD COLUMN IF NOT EXISTS new_col;
  DROP TABLE IF EXISTS old_table;
  CREATE OR REPLACE FUNCTION my_function() ...;
  
  -- ❌ WRONG - Will fail if objects already exist
  CREATE TABLE my_table (...);
  CREATE INDEX idx_name ON table_name (...);
  ALTER TABLE my_table ADD COLUMN new_col;
  ```
- This prevents migration failures when re-running or when objects already exist
- Always test migrations locally first with `npx supabase db diff`
- Keep migrations re-runnable - they may be applied multiple times
- Record manual production changes in the migrations table

### 3. Component Dependencies
- Verify all UI components exist before importing
- Check that required packages are installed in package.json
- Common missing components: Switch, Checkbox, Sheet, etc.

### 4. Environment Variables
- Never commit .env.local or production secrets
- Use .env.example for documentation
- Verify all required env vars are set in Vercel/Supabase dashboards

### 5. Type Safety
- Run `npm run typecheck` before commits
- Fix all TypeScript errors before pushing
- Use proper typing for Supabase responses

### 6. Authentication & Security
- Always check team/user context in API routes
- Use Row Level Security (RLS) policies
- Never expose service role keys to client

### 7. Semantic Search
- OpenAI API key required for semantic search
- Embedding dimension: 3072 (text-embedding-3-large)
- Fall back to text search if semantic search fails

### 8. Supabase Edge Functions
- **ALWAYS replace functions instead of creating new versions** - Use the same name
- If you must create a v2, immediately delete v1 after deployment
- Never leave multiple versions of the same function deployed
- Example: Use `smart-pattern-detection` not `smart-pattern-detection-v2`

## Pre-Push Checklist

```bash
# Run this sequence before EVERY push:
npm run build      # Catch build errors
npm run lint       # Fix code style issues  
npm run typecheck  # Ensure type safety
npm test          # Run tests if available

# For database changes:
npx supabase db diff
```

## Common Issues & Solutions

1. **Missing UI Component Error**
   - Check src/components/ui/ directory
   - Install missing @radix-ui packages
   - Create component if needed

2. **Vercel Build Failures**
   - Always run `npm run build` locally first
   - Check for missing dependencies
   - Verify environment variables

3. **Migration Conflicts**
   - Keep migrations idempotent
   - Record manual changes in schema_migrations
   - Use placeholder migrations for already-applied changes

## Quick Commands

```bash
# Development
npm run dev

# Pre-deployment checks (MANDATORY before push)
npm run build && npm run lint && npm run type-check

# Database
npx supabase db diff
npx supabase db push
npx supabase db reset  # Local only!

# Generate types
npx supabase gen types typescript --local > src/types/supabase.ts
```

## Development Workflow Checklist

### When You Receive: "Build feature X"

- [ ] 1. **Read CLAUDE.md first** (this file)
- [ ] 2. **Search existing code** for similar patterns
- [ ] 3. **Run build locally** before any implementation
- [ ] 4. **Write or update tests** if applicable
- [ ] 5. **Implement feature** following existing patterns
- [ ] 6. **Run full pre-push checks**:
  ```bash
  npm run build && npm run lint && npm run type-check
  ```
- [ ] 7. **Test locally** with `npm run dev`
- [ ] 8. **Commit with proper message** (fix:, feat:, etc.)
- [ ] 9. **Push only after** all checks pass

### Red Flags That Require STOP

**STOP and fix if:**
- Build fails locally
- TypeScript errors exist
- Missing UI components referenced
- Environment variables not documented
- Database migration not tested
- Pushing without running build first

## Memory Integration (Future)

When Camille memory tools are available, follow these patterns:
- Search for related past work before implementing
- Check for previous bug fixes
- Look for architectural decisions
- Review past discussions on similar features

## Debugging Supabase Edge Functions

### Method 1: Dashboard SQL Editor (Recommended)

Edge function logs are stored in a separate analytics database. Access them through the Supabase Dashboard:

1. Go to: https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/logs/edge-functions
2. Or use SQL Editor with these queries:

```sql
-- View recent logs for a specific function
SELECT 
  id,
  timestamp,
  event_message,
  metadata.level as level,
  metadata.function_id as function_id
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.function_id = 'pattern-processor'  -- Your function name
  AND timestamp > NOW() - INTERVAL '30 minutes'
ORDER BY timestamp DESC
LIMIT 50;

-- Find errors and warnings
SELECT 
  id,
  timestamp,
  event_message,
  metadata.level as level,
  metadata.error_type as error_type
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.level IN ('error', 'warning')
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 50;

-- Search for specific patterns
SELECT 
  id,
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE event_message LIKE '%pattern%'
  OR event_message LIKE '%Batch%'
  OR event_message LIKE '%error%'
ORDER BY timestamp DESC
LIMIT 50;
```

### Method 2: Check Logs Script

```bash
# Show usage
npx tsx scripts/check-edge-function-logs.ts

# Check specific function errors
npx tsx scripts/check-edge-function-logs.ts pattern-processor --errors

# Search for patterns in logs
npx tsx scripts/check-edge-function-logs.ts pattern-processor --search=Neo4j

# Look back further in time
npx tsx scripts/check-edge-function-logs.ts --hours=48

# Check all functions for errors
npx tsx scripts/check-edge-function-logs.ts --errors --hours=24
```

**Note**: This script requires a valid Supabase dashboard session token. The token expires after ~10 minutes. To get a fresh token:
1. Log into Supabase Dashboard
2. Open Developer Tools > Network tab
3. Look for any API request to `api.supabase.com`
4. Copy the Authorization header value
5. Update the token in the script

### Method 3: Platform API (Requires Platform Auth)

The analytics API endpoint is:
```
https://api.supabase.com/platform/projects/zqlfxakbkwssxfynrmnk/analytics/endpoints/logs.all
```

**Note**: This requires platform authentication (not service role key). The Dashboard uses session-based auth.

### Important Notes:
- Edge function logs are in a separate analytics database
- Console.log() statements in edge functions appear in event_message
- Logs have a slight delay (usually < 30 seconds)
- For real-time debugging, check Neo4j for pattern results instead
- Function IDs:
  - pattern-processor / smart-pattern-detection: `af0c921e-4d31-4353-8176-f5963f370af2`