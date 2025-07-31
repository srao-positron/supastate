# GitHub Repository Metadata System Design

## Overview

This document outlines the design for storing, indexing, and searching GitHub repository metadata in Supastate. The system will enable LLM coding assistants to access comprehensive repository information including issues, pull requests, commits, code, and documentation while maintaining proper access control and avoiding data duplication.

## Core Principles

1. **Single Source of Truth**: Each repository's data is stored once, regardless of how many users have access
2. **Access Control**: User access is tracked separately from data storage
3. **Neo4j-Native Semantic Search**: All vector search happens in Neo4j with its superior vector capabilities (3072 dimensions, native indexing)
4. **Graph-Powered Intelligence**: Leverage Neo4j's graph relationships to enhance search results with contextual information
5. **Queue-Based Processing**: Asynchronous crawling and processing via queues
6. **Real-time Updates**: Webhook-based updates after initial crawl
7. **Data Isolation**: GitHub data is separate from user code/memories in both storage and UX

## Data Model

### PostgreSQL (Supabase)

```sql
-- Repository registry and access control
CREATE TABLE github_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT UNIQUE NOT NULL,
  owner VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) UNIQUE NOT NULL, -- owner/name
  private BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  default_branch VARCHAR(255),
  html_url TEXT NOT NULL,
  clone_url TEXT NOT NULL,
  homepage TEXT,
  language VARCHAR(100),
  topics TEXT[], -- GitHub topics/tags
  
  -- Crawl status
  last_crawled_at TIMESTAMP WITH TIME ZONE,
  crawl_status VARCHAR(50) DEFAULT 'pending', -- pending, crawling, completed, failed
  crawl_error TEXT,
  webhook_id BIGINT,
  webhook_secret TEXT,
  webhook_installed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  stars_count INT DEFAULT 0,
  forks_count INT DEFAULT 0,
  open_issues_count INT DEFAULT 0,
  size_kb BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  pushed_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(owner, name)
);

-- User access permissions
CREATE TABLE github_user_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository_id UUID NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
  permissions TEXT[], -- e.g., ['pull', 'push', 'admin']
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, repository_id)
);

-- Crawl queue
CREATE TABLE github_crawl_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES github_repositories(id),
  crawl_type VARCHAR(50) NOT NULL, -- initial, update, webhook
  priority INT DEFAULT 0,
  data JSONB, -- webhook payload or specific items to update
  status VARCHAR(50) DEFAULT 'pending',
  attempts INT DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_github_repos_full_name ON github_repositories(full_name);
CREATE INDEX idx_github_repos_crawl_status ON github_repositories(crawl_status);
CREATE INDEX idx_github_user_repos_user ON github_user_repos(user_id);
CREATE INDEX idx_github_user_repos_repo ON github_user_repos(repository_id);
CREATE INDEX idx_github_crawl_queue_status ON github_crawl_queue(status, priority DESC);
```

### Neo4j Schema

```cypher
// Repository metadata
CREATE CONSTRAINT repo_unique IF NOT EXISTS
ON (r:Repository) ASSERT r.github_id IS UNIQUE;

// Repository node
(:Repository {
  github_id: Integer,
  full_name: String,
  owner: String,
  name: String,
  description: String,
  private: Boolean,
  default_branch: String,
  language: String,
  topics: [String],
  stars_count: Integer,
  created_at: DateTime,
  updated_at: DateTime,
  description_embedding: [Float] // Vector for semantic search
})

// Issue node
(:RepoIssue {
  id: String, // repo_full_name#issue_number
  github_id: Integer,
  number: Integer,
  title: String,
  body: String,
  state: String, // open, closed
  author: String,
  labels: [String],
  created_at: DateTime,
  updated_at: DateTime,
  closed_at: DateTime,
  title_embedding: [Float],
  body_embedding: [Float]
})

// Pull Request node (extends Issue)
(:RepoPullRequest {
  // All Issue properties plus:
  merged: Boolean,
  merged_at: DateTime,
  head_ref: String,
  base_ref: String,
  additions: Integer,
  deletions: Integer,
  changed_files: Integer
})

// Comment node
(:RepoComment {
  id: String,
  github_id: Integer,
  body: String,
  author: String,
  created_at: DateTime,
  updated_at: DateTime,
  body_embedding: [Float]
})

// Commit node
(:RepoCommit {
  sha: String,
  message: String,
  author: String,
  author_email: String,
  committed_at: DateTime,
  additions: Integer,
  deletions: Integer,
  message_embedding: [Float]
})

// Code entities (parsed from repository)
(:RepoFunction {
  id: String, // repo_full_name#file_path#name#line
  name: String,
  file_path: String,
  line_start: Integer,
  line_end: Integer,
  parameters: String,
  return_type: String,
  docstring: String,
  content: String,
  language: String,
  branch: String,
  commit_sha: String,
  signature_embedding: [Float],
  docstring_embedding: [Float],
  content_embedding: [Float]
})

(:RepoClass {
  // Similar to RepoFunction
})

(:RepoInterface {
  // Similar to RepoFunction
})

// File node
(:RepoFile {
  path: String,
  name: String,
  type: String, // code, markdown, config, etc.
  language: String,
  size: Integer,
  content: String, // For reasonable sized files
  branch: String,
  commit_sha: String,
  content_embedding: [Float]
})

// Wiki page
(:RepoWiki {
  id: String,
  title: String,
  content: String,
  updated_at: DateTime,
  title_embedding: [Float],
  content_embedding: [Float]
})

// Relationships
(:Repository)-[:HAS_ISSUE]->(:RepoIssue)
(:Repository)-[:HAS_PULL_REQUEST]->(:RepoPullRequest)
(:RepoIssue)-[:HAS_COMMENT]->(:RepoComment)
(:RepoPullRequest)-[:HAS_COMMENT]->(:RepoComment)
(:Repository)-[:HAS_COMMIT]->(:RepoCommit)
(:Repository)-[:HAS_FILE]->(:RepoFile)
(:RepoFile)-[:CONTAINS_FUNCTION]->(:RepoFunction)
(:RepoFile)-[:CONTAINS_CLASS]->(:RepoClass)
(:Repository)-[:HAS_WIKI_PAGE]->(:RepoWiki)
(:RepoCommit)-[:MODIFIES]->(:RepoFile)
(:RepoPullRequest)-[:INCLUDES_COMMIT]->(:RepoCommit)

// User access (for runtime filtering)
(:User {id: String})-[:HAS_ACCESS_TO]->(:Repository)
```

## Processing Pipeline

### 1. Repository Discovery

When Camille sends GitHub metadata containing repository URLs:

```typescript
// API endpoint: POST /api/github/discover
{
  user_id: string,
  repositories: [{
    full_name: string, // owner/name
    url: string,
    permissions: string[]
  }]
}

// Processing:
1. For each repository:
   a. Check if github_repositories record exists
   b. If not, create it and queue for crawling
   c. Update github_user_repos access record
   d. Update last_seen_at timestamp
```

### 2. Crawl Queue Processing

```typescript
// Queue: github-crawl-queue
// Workers: github-crawl-coordinator, github-crawl-worker

interface CrawlJob {
  repository_id: string
  repository_full_name: string
  crawl_type: 'initial' | 'update' | 'webhook'
  priority: number
  data?: {
    // For webhook updates
    event_type?: string
    payload?: any
  }
}

// Crawl stages for initial crawl:
1. Repository metadata
2. Issues and PRs (with pagination)
3. Commits (recent history)
4. Code content (default branch + major branches)
5. Wiki pages
6. Install webhook
```

### 3. Code Parsing & Embedding Generation

Reuse existing code parsing logic but store as different node types with embeddings:

```typescript
// Existing parser output
interface ParsedEntity {
  type: 'function' | 'class' | 'interface'
  name: string
  // ... other properties
}

// Transform for GitHub storage with embeddings
async function transformToRepoEntity(
  entity: ParsedEntity,
  repository: Repository,
  file: RepoFile
): Promise<RepoEntity> {
  // Generate embeddings for different aspects
  const [signatureEmbedding, contentEmbedding, docstringEmbedding] = await Promise.all([
    generateEmbedding(`${entity.type} ${entity.name}(${entity.parameters}): ${entity.return_type}`),
    generateEmbedding(entity.content),
    entity.docstring ? generateEmbedding(entity.docstring) : null
  ])
  
  return {
    ...entity,
    id: `${repository.full_name}#${file.path}#${entity.name}#${entity.line}`,
    nodeLabel: `Repo${capitalize(entity.type)}`, // RepoFunction, RepoClass, etc.
    repository_id: repository.github_id,
    branch: file.branch,
    commit_sha: file.commit_sha,
    // Store embeddings directly in Neo4j
    signature_embedding: signatureEmbedding,
    content_embedding: contentEmbedding,
    docstring_embedding: docstringEmbedding
  }
}

// All embeddings are 3072-dimensional vectors from text-embedding-3-large
// Stored directly in Neo4j, never in PostgreSQL
```

### 4. Webhook Processing

```typescript
// Webhook endpoint: POST /api/github/webhook/[repo_id]

// Supported events:
- push: Update code for affected files
- issues: Update issue data
- issue_comment: Add comment
- pull_request: Update PR data
- pull_request_review_comment: Add comment
- release: Store release info
- wiki: Update wiki content

// Processing:
1. Verify webhook signature
2. Queue specific updates based on event type
3. Process incrementally (don't re-crawl everything)
```

## Search Architecture

### Neo4j-Powered Search

All semantic search operations are performed directly in Neo4j, leveraging its native vector search capabilities and graph traversal power. PostgreSQL is used only for metadata, access control, and queue management.

### Vector Indexes in Neo4j

```cypher
// Create vector indexes for all searchable content
CREATE VECTOR INDEX repo_description_embedding IF NOT EXISTS
FOR (n:Repository) ON (n.description_embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};

CREATE VECTOR INDEX repo_issue_title_embedding IF NOT EXISTS
FOR (n:RepoIssue) ON (n.title_embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};

CREATE VECTOR INDEX repo_issue_body_embedding IF NOT EXISTS
FOR (n:RepoIssue) ON (n.body_embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};

CREATE VECTOR INDEX repo_function_signature_embedding IF NOT EXISTS
FOR (n:RepoFunction) ON (n.signature_embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};

CREATE VECTOR INDEX repo_function_content_embedding IF NOT EXISTS
FOR (n:RepoFunction) ON (n.content_embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};

CREATE VECTOR INDEX repo_file_content_embedding IF NOT EXISTS
FOR (n:RepoFile) ON (n.content_embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};

CREATE VECTOR INDEX repo_commit_message_embedding IF NOT EXISTS
FOR (n:RepoCommit) ON (n.message_embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};

CREATE VECTOR INDEX repo_wiki_content_embedding IF NOT EXISTS
FOR (n:RepoWiki) ON (n.content_embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};
```

### Dedicated Search Endpoint

```typescript
// POST /api/github/search
{
  query: string,
  user_id: string,
  filters?: {
    repositories?: string[], // Limit to specific repos
    entity_types?: string[], // issues, code, commits, wiki
    languages?: string[],
    date_range?: { start: Date, end: Date }
  },
  limit?: number
}

// Search process:
1. Generate query embedding
2. Get user's accessible repositories from PostgreSQL
3. Execute Neo4j vector + graph search with access filter
4. Leverage graph relationships for context
5. Return enriched results
```

### Advanced Query Examples

```cypher
// Multi-hop semantic search: Find issues related to functions similar to query
CALL db.index.vector.queryNodes('repo_function_signature_embedding', 10, $queryEmbedding)
YIELD node AS fn, score
MATCH (fn)<-[:CONTAINS_FUNCTION]-(f:RepoFile)<-[:HAS_FILE]-(r:Repository)
WHERE r.full_name IN $accessibleRepos
MATCH (r)-[:HAS_ISSUE]->(i:RepoIssue)
WHERE i.body CONTAINS fn.name OR i.title CONTAINS fn.name
RETURN DISTINCT i, fn, r.full_name, score
ORDER BY score DESC
LIMIT 20

// Find code patterns across repositories with graph context
CALL db.index.vector.queryNodes('repo_function_content_embedding', 20, $queryEmbedding)
YIELD node AS fn, score
MATCH (fn)<-[:CONTAINS_FUNCTION]-(f:RepoFile)<-[:HAS_FILE]-(r:Repository)
WHERE r.full_name IN $accessibleRepos AND score > 0.8
OPTIONAL MATCH (f)-[:CONTAINS_CLASS]->(c:RepoClass)
OPTIONAL MATCH (pr:RepoPullRequest)-[:INCLUDES_COMMIT]->(:RepoCommit)-[:MODIFIES]->(f)
RETURN fn, f.path, r.full_name, 
       collect(DISTINCT c.name) AS classes_in_file,
       collect(DISTINCT pr.title) AS related_prs,
       score
ORDER BY score DESC

// Semantic issue search with comment context
CALL db.index.vector.queryNodes('repo_issue_body_embedding', 15, $queryEmbedding)
YIELD node AS issue, score
MATCH (issue)<-[:HAS_ISSUE]-(r:Repository)
WHERE r.full_name IN $accessibleRepos
OPTIONAL MATCH (issue)-[:HAS_COMMENT]->(c:RepoComment)
WITH issue, r, score, collect(c) AS comments
RETURN issue, r.full_name, score,
       [c IN comments | {author: c.author, snippet: left(c.body, 200)}] AS comment_context
ORDER BY score DESC

// Find similar commits across accessible repositories
CALL db.index.vector.queryNodes('repo_commit_message_embedding', 20, $queryEmbedding)
YIELD node AS commit, score
MATCH (commit)<-[:HAS_COMMIT]-(r:Repository)
WHERE r.full_name IN $accessibleRepos
MATCH (commit)-[:MODIFIES]->(f:RepoFile)
RETURN commit, r.full_name, collect(DISTINCT f.path) AS modified_files, score
ORDER BY score DESC

// Cross-repository code similarity with dependency analysis
CALL db.index.vector.queryNodes('repo_function_signature_embedding', 30, $queryEmbedding)
YIELD node AS fn, score
MATCH (fn)<-[:CONTAINS_FUNCTION]-(f:RepoFile)<-[:HAS_FILE]-(r:Repository)
WHERE r.full_name IN $accessibleRepos
// Find other functions in same file that might be related
OPTIONAL MATCH (f)-[:CONTAINS_FUNCTION]->(related:RepoFunction)
WHERE related.id <> fn.id
// Find imports/dependencies
OPTIONAL MATCH (f)-[:IMPORTS]->(dep:RepoFile)
RETURN fn, f.path, r.full_name, 
       collect(DISTINCT related.name) AS related_functions,
       collect(DISTINCT dep.path) AS dependencies,
       score
ORDER BY score DESC
```

### Graph-Enhanced Search Features

1. **Contextual Enrichment**: Use graph relationships to provide richer context
   - Show related PRs when finding code
   - Include comment threads with issues
   - Display commit history for files

2. **Multi-hop Searches**: Traverse relationships for indirect matches
   - Find issues mentioning similar functions
   - Discover code changes related to issue patterns
   - Track feature evolution through commits

3. **Pattern Detection**: Leverage graph structure for insights
   - Common code patterns across repositories
   - Issue clustering by similarity
   - Commit pattern analysis

4. **Relationship-based Ranking**: Boost results based on graph connections
   - Prioritize actively maintained code
   - Weight by PR/issue activity
   - Consider author expertise (commit count)

## Security & Access Control

### Runtime Access Verification

```typescript
async function getUserAccessibleRepos(userId: string): Promise<string[]> {
  // Option 1: From our database (faster, might be stale)
  const { data } = await supabase
    .from('github_user_repos')
    .select('repository:github_repositories(full_name)')
    .eq('user_id', userId)
  
  return data.map(d => d.repository.full_name)
  
  // Option 2: From GitHub API (slower, always accurate)
  // Use sparingly due to rate limits
}

// Apply in all GitHub search queries
const accessibleRepos = await getUserAccessibleRepos(userId)
const repoFilter = `r.full_name IN [${accessibleRepos.map(r => `'${r}'`).join(',')}]`
```

### Webhook Security

- Generate unique webhook secret per repository
- Store encrypted in database
- Verify all webhook payloads using HMAC-SHA256

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create database schema (PostgreSQL + Neo4j)
- [ ] Implement repository discovery API
- [ ] Build basic crawl queue infrastructure
- [ ] Create GitHub API client with rate limiting

### Phase 2: Crawling (Week 2)
- [ ] Implement issue/PR crawler
- [ ] Implement code content crawler
- [ ] Add code parsing for GitHub repos
- [ ] Create embedding generation pipeline

### Phase 3: Search (Week 3)
- [ ] Build dedicated search API
- [ ] Implement vector similarity search
- [ ] Create search UI components
- [ ] Add search result grouping/ranking

### Phase 4: Webhooks (Week 4)
- [ ] Implement webhook endpoint
- [ ] Add incremental update logic
- [ ] Create webhook installation during crawl
- [ ] Handle webhook events

### Phase 5: Optimization (Week 5)
- [ ] Add caching layer
- [ ] Implement smart re-crawling
- [ ] Optimize vector search performance
- [ ] Add monitoring and analytics

## Queue Architecture

```yaml
Queues:
  github-discovery-queue:
    - Process new repository discoveries
    - Check/create repository records
    - Update user access permissions
    
  github-crawl-queue:
    - Coordinate repository crawling
    - Priority: webhooks > updates > initial
    
  github-parse-queue:
    - Parse code files from repositories
    - Generate embeddings
    
  github-webhook-queue:
    - Process webhook events
    - Queue targeted updates
```

## API Endpoints

```typescript
// Repository discovery
POST /api/github/discover
- Called by Camille when sending GitHub metadata

// Manual repository import
POST /api/github/import
- Allow users to manually import a repository

// Search
POST /api/github/search
- Semantic search across GitHub data

// Webhook receiver
POST /api/github/webhook/[repo_id]
- Receive GitHub webhook events

// Repository list
GET /api/github/repositories
- List user's accessible repositories

// Repository details
GET /api/github/repositories/[owner]/[name]
- Get detailed repository information
```

## Monitoring & Observability

- Track crawl progress per repository
- Monitor webhook delivery success
- Track search query performance
- Monitor GitHub API rate limits
- Alert on crawl failures

## Future Enhancements

1. **Smart Crawling**: Use repository activity to prioritize crawls
2. **Incremental Parsing**: Only parse changed files
3. **Branch Support**: Crawl multiple branches based on activity
4. **Cross-Repository Patterns**: Find similar code across repos
5. **Dependency Analysis**: Track package dependencies
6. **PR Review Assistant**: Use PR data to assist code reviews
7. **Commit Message Analysis**: Extract patterns from commit history
8. **Issue Clustering**: Group similar issues across repositories

## Success Metrics

- Time to crawl a repository
- Search result relevance (user feedback)
- Webhook processing latency
- Data freshness (time since last update)
- Storage efficiency (deduplication rate)