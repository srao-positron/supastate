# Unified Search - Example Queries and Responses

## Example 1: Debugging Investigation

### Query
```
"How did I fix the auth token refresh bug?"
```

### Intent Analysis
```json
{
  "primaryIntent": "debug_issue",
  "timeframe": "historical",
  "codeRelevance": "high",
  "patterns": ["debugging"],
  "entities": ["auth", "token", "refresh", "bug"],
  "strategies": ["semantic", "pattern", "code_linked", "temporal"]
}
```

### Results

#### Result 1: Memory (Debugging Session)
```json
{
  "type": "memory",
  "content": {
    "title": "Debugging auth token refresh issue - 2025-07-22",
    "snippet": "The auth bug was caused by incorrect token refresh logic in the middleware. The refresh token was being invalidated before the new access token was generated...",
    "highlights": [
      "The <mark>auth bug</mark> was caused by incorrect <mark>token refresh</mark> logic",
      "Fixed by adding proper error handling and retry logic"
    ]
  },
  "metadata": {
    "score": 0.92,
    "matchType": "semantic",
    "timestamp": "2025-07-22T14:30:00Z",
    "project": "supastate",
    "sessionId": "session-123"
  },
  "relationships": {
    "code": [
      {
        "id": "code-456",
        "path": "src/middleware/auth.ts",
        "snippet": "async function refreshToken(token: string)"
      }
    ],
    "patterns": [
      {
        "type": "debugging",
        "confidence": 0.89,
        "name": "auth-debugging-session"
      }
    ]
  },
  "context": {
    "previousChunk": {
      "content": "User reported that they were getting logged out randomly..."
    },
    "nextChunk": {
      "content": "After implementing the fix, tested with multiple concurrent requests..."
    }
  }
}
```

#### Result 2: Code (The Fix)
```json
{
  "type": "code",
  "content": {
    "title": "refreshToken function in auth.ts",
    "snippet": "async function refreshToken(token: string): Promise<AuthTokens> {\n  try {\n    // Lock to prevent concurrent refresh attempts\n    const lock = await acquireLock(`refresh-${token}`)...",
    "highlights": [
      "Lock to prevent concurrent <mark>refresh</mark> attempts",
      "Retry logic for failed <mark>token</mark> generation"
    ]
  },
  "metadata": {
    "score": 0.88,
    "matchType": "code_linked",
    "timestamp": "2025-07-22T15:45:00Z",
    "project": "supastate",
    "language": "typescript"
  },
  "relationships": {
    "memories": [
      {
        "id": "memory-123",
        "snippet": "Fixed by adding proper error handling and retry logic...",
        "occurred_at": "2025-07-22T15:30:00Z"
      }
    ]
  },
  "codeContext": {
    "file": {
      "path": "src/middleware/auth.ts",
      "language": "typescript"
    },
    "functions": [
      {
        "name": "refreshToken",
        "lineStart": 45,
        "lineEnd": 78
      }
    ]
  }
}
```

## Example 2: Learning Research

### Query
```
"vector search neo4j"
```

### Intent Analysis
```json
{
  "primaryIntent": "explore_topic",
  "timeframe": "any",
  "codeRelevance": "medium",
  "patterns": ["learning"],
  "entities": ["vector", "search", "neo4j"],
  "strategies": ["semantic", "pattern", "temporal"]
}
```

### Results

#### Result 1: Memory (Learning Session)
```json
{
  "type": "memory",
  "content": {
    "title": "Implementing vector search in Neo4j - Research",
    "snippet": "Neo4j 5.11+ supports vector indexes natively. Need to use vector.similarity.cosine() for semantic search. The embedding dimension must match (3072 for text-embedding-3-large)...",
    "highlights": [
      "<mark>Neo4j</mark> 5.11+ supports <mark>vector</mark> indexes natively",
      "Use <mark>vector.similarity.cosine()</mark> for semantic <mark>search</mark>"
    ]
  },
  "metadata": {
    "score": 0.94,
    "matchType": "semantic",
    "project": "supastate",
    "pattern": "learning-session"
  },
  "relationships": {
    "code": [
      {
        "path": "src/lib/neo4j/search.ts",
        "snippet": "vector.similarity.cosine(embedding1, embedding2)"
      }
    ],
    "similar_memories": [
      {
        "content": "Testing showed that similarity threshold of 0.7 works best..."
      }
    ]
  }
}
```

## Example 3: Cross-Domain Discovery

### Query
```
"What code did I write yesterday?"
```

### Intent Analysis
```json
{
  "primaryIntent": "review_history",
  "timeframe": "recent",
  "codeRelevance": "high",
  "patterns": [],
  "entities": ["yesterday"],
  "strategies": ["temporal", "code_linked"]
}
```

### Grouped Results
```json
{
  "groups": {
    "code": {
      "2025-07-28": [
        {
          "path": "src/components/search/unified-search.tsx",
          "commits": 3,
          "relatedMemories": 5
        },
        {
          "path": "src/lib/search/orchestrator.ts",
          "commits": 2,
          "relatedMemories": 2
        }
      ]
    },
    "memories": {
      "sessions": [
        {
          "id": "session-789",
          "title": "Implementing unified search UI",
          "duration": "2h 30m",
          "codeFiles": 5
        }
      ]
    }
  }
}
```

## Example 4: LLM Query

### Query (from Claude Code)
```json
{
  "prompt": "Show me how the authentication middleware handles token refresh",
  "context": {
    "current_file": "src/api/auth/refresh/route.ts",
    "current_project": "supastate"
  },
  "format": "detailed"
}
```

### LLM-Optimized Response
```json
{
  "answer": "The authentication middleware handles token refresh through a lock-based mechanism to prevent race conditions. When a refresh is requested, it first acquires a distributed lock using the refresh token as a key, validates the token hasn't been revoked, generates new token pairs, and atomically updates the database. The implementation includes retry logic and proper error handling.",
  
  "memories": [
    {
      "content": "Fixed the auth refresh bug by implementing distributed locking...",
      "relevance": 0.95,
      "context": "This was discovered during a debugging session when users reported being logged out"
    }
  ],
  
  "code": {
    "primary": {
      "path": "src/middleware/auth.ts",
      "function": "refreshToken",
      "lines": "45-78"
    },
    "related": [
      {
        "path": "src/lib/auth/tokens.ts",
        "function": "generateTokenPair"
      }
    ]
  },
  
  "suggestions": [
    "View the full debugging session for this issue",
    "See related PR #123 that fixed the race condition",
    "Check the token validation logic in validateRefreshToken()"
  ],
  
  "confidence": 0.92
}
```

## Example 5: Pattern-Based Search

### Query
```
"Show me all my debugging sessions this week"
```

### Results Summary
```json
{
  "interpretation": {
    "intent": "find_patterns",
    "timeframe": "this_week",
    "patterns": ["debugging"],
    "strategies": ["pattern", "temporal"]
  },
  
  "aggregations": {
    "totalSessions": 8,
    "projectBreakdown": {
      "supastate": 5,
      "camille": 3
    },
    "issuesResolved": 6,
    "avgSessionDuration": "1h 45m"
  },
  
  "results": [
    {
      "pattern": {
        "type": "debugging",
        "name": "auth-token-investigation",
        "confidence": 0.91,
        "duration": "2h 30m"
      },
      "memories": 12,
      "codeChanges": 3,
      "outcome": "Fixed - PR #123"
    },
    {
      "pattern": {
        "type": "debugging",
        "name": "neo4j-query-optimization",
        "confidence": 0.87,
        "duration": "1h 15m"
      },
      "memories": 8,
      "codeChanges": 2,
      "outcome": "Improved query performance by 60%"
    }
  ]
}
```

## UI Interaction Examples

### Filter Application
```typescript
// User clicks "TypeScript only" filter
filters = {
  includeMemories: true,
  includeCode: true,
  languages: ["ts", "tsx"]
}

// Results automatically update to show only:
// - TypeScript code files
// - Memories that reference TypeScript code
```

### Context Navigation
```typescript
// User clicks "View Full Thread"
const thread = await getConversationThread(memory.session_id)
// UI expands to show entire conversation with navigation

// User clicks "← Previous Chunk"  
const prevChunk = await getPreviousChunk(memory.session_id, memory.chunk_index - 1)
// Smoothly transitions to previous part of conversation
```

### Related Item Exploration
```typescript
// User hovers over related code link
// Preview popup shows:
// - File path
// - Function signature
// - First few lines of implementation
// - "Click to view full code" action
```

These examples demonstrate how the unified search provides rich, contextual results that help users understand not just what they're looking for, but the full context around it, including related code, conversations, and patterns.