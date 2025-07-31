# GitHub Integration V2 - Comprehensive Design Document

## Overview

This document outlines the enhanced GitHub integration for Supastate, focusing on intelligent branch management, code lineage tracking, and robust incremental updates via webhooks.

## Core Design Principles

1. **Single Source of Truth**: Each repository stored once, accessed by multiple users
2. **Incremental Updates**: Minimize API calls through smart webhooks and delta syncing
3. **Rich Relationships**: Build explicit and semantic connections between all entities
4. **LLM Optimization**: Structure data for efficient graph traversal by AI agents
5. **Quality Over Quantity**: Max 25 high-quality implicit relationships per entity

## Architecture Components

### 1. Smart Branch Management

#### 1.1 Branch Strategy
- **Default Behavior**: Only sync main/master branch on repository discovery
- **Camille Integration**: Auto-sync branches referenced in Camille imports
- **Manual Control**: API for explicitly adding branches
- **Delta Storage**: Only store files that differ from main branch

#### 1.2 Database Schema
```sql
-- Track which branches are indexed
CREATE TABLE IF NOT EXISTS github_indexed_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID REFERENCES github_repositories(id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL,
  base_branch TEXT DEFAULT 'main',
  indexed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE,
  files_indexed INTEGER DEFAULT 0,
  files_different_from_base INTEGER DEFAULT 0,
  requested_by UUID REFERENCES users(id),
  source TEXT CHECK (source IN ('camille', 'manual', 'api', 'webhook')),
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed')),
  UNIQUE(repository_id, branch_name)
);

-- Extend github_crawl_queue for branch-specific crawls
ALTER TABLE github_crawl_queue 
ADD COLUMN branch_name TEXT,
ADD COLUMN compare_with_base BOOLEAN DEFAULT true;
```

#### 1.3 Branch Import API
```typescript
// POST /api/github/branches/import
interface BranchImportRequest {
  url: string;  // https://github.com/owner/repo/tree/branch-name
  compare_with_main?: boolean;  // Default: true
  sync_all_files?: boolean;     // Default: false (only deltas)
}
```

### 2. Code Lineage & Relationship System

#### 2.1 Relationship Types
```cypher
// File lineage
(:CodeEntity)-[:PUSHED_TO]->(:RepoFile {branch: "feature"})
(:RepoFile {branch: "feature"})-[:MODIFIED_FROM]->(:RepoFile {branch: "main"})

// Memory to code
(:Memory)-[:REFERENCES_CODE]->(:RepoFunction)
(:Memory)-[:DISCUSSES_FILE]->(:RepoFile)

// Cross-entity relationships
(:RepoIssue)-[:ADDRESSED_BY]->(:RepoPullRequest)
(:RepoPullRequest)-[:CONTAINS]->(:RepoCommit)
(:RepoCommit)-[:CHANGES]->(:RepoFile)
```

#### 2.2 Relationship Queue
```sql
CREATE TABLE IF NOT EXISTS github_relationship_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN (
    'camille_to_github',
    'memory_to_code',
    'branch_comparison',
    'pattern_detection',
    'explicit_relationships',
    'semantic_discovery'
  )),
  source_entity_id TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  target_hints JSONB DEFAULT '{}',
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',
  max_relationships INTEGER DEFAULT 25,
  min_confidence FLOAT DEFAULT 0.75,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  relationships_created INTEGER DEFAULT 0,
  error TEXT,
  result JSONB
);
```

### 3. Enhanced Code Parsing

#### 3.1 New Node Types
- `RepoFunction`: Functions/methods with signatures and embeddings
- `RepoClass`: Classes with methods and properties
- `RepoInterface`: TypeScript/Java interfaces

#### 3.2 Code Entity Schema (Neo4j)
```cypher
// Function nodes
(:RepoFunction {
  id: "repo#branch#file#function:name",
  name: "calculateTotal",
  signature: "calculateTotal(items: Item[]): number",
  parameters: [{name: "items", type: "Item[]"}],
  return_type: "number",
  docstring: "Calculates the total price of items",
  start_line: 42,
  end_line: 58,
  is_async: false,
  is_exported: true,
  embedding: [...]  // 3072 dimensions
})

// Class nodes
(:RepoClass {
  id: "repo#branch#file#class:name",
  name: "ShoppingCart",
  extends: "BaseCart",
  implements: ["ICart", "IPersistable"],
  method_count: 5,
  property_count: 3,
  embedding: [...]
})
```

### 4. Robust Webhook System

#### 4.1 Webhook Processing Flow
1. Receive webhook → Verify signature → Log immediately
2. Queue incremental updates based on event type
3. Return success quickly to GitHub
4. Process updates asynchronously

#### 4.2 Webhook Event Handlers
```typescript
interface WebhookHandlers {
  push: (payload: PushEvent) => Promise<void>;
  issues: (payload: IssuesEvent) => Promise<void>;
  pull_request: (payload: PullRequestEvent) => Promise<void>;
  pull_request_review: (payload: PullRequestReviewEvent) => Promise<void>;
  create: (payload: CreateEvent) => Promise<void>;  // Branch creation
  delete: (payload: DeleteEvent) => Promise<void>;  // Branch deletion
}
```

#### 4.3 Webhook Health Monitoring
```sql
CREATE TABLE IF NOT EXISTS github_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID REFERENCES github_repositories(id),
  event_type TEXT NOT NULL,
  delivery_id TEXT,
  status TEXT CHECK (status IN ('received', 'processed', 'failed')),
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  payload_summary JSONB
);

-- Health check view
CREATE VIEW webhook_health AS
SELECT 
  r.full_name,
  COUNT(CASE WHEN wl.status = 'processed' THEN 1 END) as successful_events,
  COUNT(CASE WHEN wl.status = 'failed' THEN 1 END) as failed_events,
  MAX(wl.received_at) as last_event_at,
  CASE 
    WHEN MAX(wl.received_at) < NOW() - INTERVAL '1 hour' THEN 'stale'
    WHEN COUNT(CASE WHEN wl.status = 'failed' THEN 1 END) > 5 THEN 'unhealthy'
    ELSE 'healthy'
  END as status
FROM github_repositories r
LEFT JOIN github_webhook_logs wl ON r.id = wl.repository_id
WHERE r.webhook_id IS NOT NULL
GROUP BY r.id, r.full_name;
```

### 5. Universal Embedding Strategy

#### 5.1 Embedding Generation
All entities get a `universal_embedding` for cross-entity search:
- Issues: Title + Body
- PRs: Title + Body + Changed files list
- Commits: Message + File list
- Files: Content preview (first 4000 chars)
- Functions: Signature + Docstring
- Classes: Name + Extends + Docstring

#### 5.2 Vector Indexes
```cypher
CREATE VECTOR INDEX github_universal_embedding IF NOT EXISTS
FOR (n:GitHubEntity)
ON (n.universal_embedding)
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 3072,
    `vector.similarity_function`: 'cosine'
  }
}
```

### 6. LLM-Friendly APIs

#### 6.1 Graph Exploration API
```typescript
// GET /api/github/explore
interface ExploreRequest {
  start_entity: string;
  depth?: number;  // Default: 2
  relationship_types?: string[];
  min_confidence?: number;  // For semantic relationships
  include_content?: boolean;
  max_nodes?: number;  // Default: 100
}

interface ExploreResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
  stats: {
    total_nodes: number;
    total_edges: number;
    entity_types: Record<string, number>;
  };
}
```

#### 6.2 Semantic Search API
```typescript
// POST /api/github/search/semantic
interface SemanticSearchRequest {
  query: string;
  repositories?: string[];  // Filter by repos
  branches?: string[];      // Filter by branches
  entity_types?: string[];  // Filter by entity type
  limit?: number;          // Default: 20
  min_score?: number;      // Default: 0.7
}
```

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create database migrations for new tables
2. Implement branch delta comparison logic
3. Build relationship queue infrastructure
4. Create code parser for TypeScript/JavaScript

### Phase 2: Ingestion & Updates
1. Update crawl API to support branch-specific imports
2. Implement webhook handlers for incremental updates
3. Build relationship detection workers
4. Add code entity extraction to file processing

### Phase 3: Search & Discovery
1. Create universal embeddings for all entities
2. Build semantic relationship discovery
3. Implement LLM-friendly exploration APIs
4. Add cross-entity search capabilities

### Phase 4: Monitoring & Reliability
1. Implement webhook health monitoring
2. Build automatic recovery for missed webhooks
3. Create performance metrics and dashboards
4. Add comprehensive logging throughout

## Testing Strategy

### Test Repository Setup
1. Fork a complex repository (e.g., microsoft/vscode or facebook/react)
2. Create multiple test branches with various changes
3. Generate test issues, PRs, and commits
4. Simulate webhook events

### Test Scenarios
1. Initial repository import (main branch only)
2. Branch import with delta detection
3. Webhook processing for all event types
4. Relationship discovery across entities
5. Cross-branch code evolution tracking
6. Memory-to-code linking accuracy
7. Search performance with large datasets

## Success Metrics

1. **Import Efficiency**: < 5 minutes for 1000-file repository
2. **Webhook Latency**: < 1 second response time
3. **Relationship Quality**: > 80% precision for semantic relationships
4. **Storage Efficiency**: < 10% overhead for branch deltas
5. **Search Performance**: < 500ms for semantic queries

## Security Considerations

1. **Webhook Verification**: Always verify GitHub signatures
2. **Access Control**: Respect user repository permissions
3. **Token Storage**: Encrypted GitHub tokens with user-specific keys
4. **Rate Limiting**: Respect GitHub API limits
5. **Data Isolation**: Maintain workspace boundaries

## Future Enhancements

1. Support for additional languages (Python, Go, Java)
2. Git submodule support
3. GitHub Actions workflow analysis
4. Code quality metrics and trends
5. Automated PR review suggestions based on patterns