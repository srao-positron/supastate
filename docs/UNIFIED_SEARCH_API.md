# Unified Search API Documentation

## Overview

The Unified Search API combines memory and code search into a single intelligent interface that understands the relationships between your memories and code.

## Endpoint

```
POST /api/search/unified
```

## Request Format

```typescript
{
  query: string                    // Your search query
  
  filters?: {
    includeMemories?: boolean      // Search memories (default: true)
    includeCode?: boolean          // Search code (default: true)
    
    dateRange?: {                  // Time range filter
      start?: string               // ISO date string
      end?: string                 // ISO date string
    }
    
    projects?: string[]            // Filter by project names
    languages?: string[]           // Filter by programming languages
    patterns?: string[]            // Filter by pattern types
    
    mustHaveRelationships?: boolean // Only show connected items
    relationshipTypes?: string[]    // Filter by relationship types
  }
  
  options?: {
    searchMode?: 'smart' | 'exact' | 'fuzzy'
    expandContext?: boolean        // Include surrounding context
    includeRelated?: boolean       // Include related items
    groupBySession?: boolean       // Group memory chunks by session
    groupByFile?: boolean          // Group code entities by file
  }
  
  pagination?: {
    limit?: number                 // Results per page (default: 20)
    cursor?: string                // Pagination cursor
  }
}
```

## Response Format

```typescript
{
  interpretation: {
    intent: string                 // What the system thinks you're looking for
    entities: Entity[]             // Detected entities in your query
    timeContext?: string           // Detected time context
    searchStrategies: string[]     // Strategies used for search
  }
  
  results: UnifiedSearchResult[]   // Search results
  
  groups?: {                       // Optional grouped results
    memories?: GroupedMemories
    code?: GroupedCode
    patterns?: DetectedPattern[]
  }
  
  facets: {                        // Facets for filtering
    projects: FacetCount[]
    languages: FacetCount[]
    timeRanges: FacetCount[]
    resultTypes: FacetCount[]
  }
  
  pagination: {
    hasMore: boolean
    nextCursor?: string
    totalResults?: number
  }
}
```

## Search Strategies

The system uses Anthropic's Claude to understand your query intent and automatically selects the best search strategies:

### 1. **Semantic Search**
- Uses vector embeddings to find conceptually similar content
- Best for: Technical concepts, ideas, topics
- Example: "vector embeddings similarity search"

### 2. **Temporal Search**
- Searches based on time context
- Best for: Recent work, time-specific queries
- Example: "what did I work on yesterday"

### 3. **Pattern Search**
- Finds debugging sessions, learning patterns, etc.
- Best for: Activity patterns, session types
- Example: "show me all debugging sessions"

### 4. **Code-Linked Search**
- Finds memories that reference code or vice versa
- Best for: Cross-domain searches
- Example: "auth middleware implementations"

### 5. **Keyword Search**
- Traditional text matching
- Best for: Specific terms, exact matches
- Example: "RELATES_TO relationship"

## Example Queries

### Find Recent Work
```javascript
const response = await fetch('/api/search/unified', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    query: "what was I working on this week",
    filters: {
      includeMemories: true,
      includeCode: true
    }
  })
})
```

### Search for Code Implementations
```javascript
const response = await fetch('/api/search/unified', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    query: "authentication middleware",
    filters: {
      includeCode: true,
      includeMemories: false,
      languages: ['typescript', 'javascript']
    }
  })
})
```

### Find Debugging Sessions
```javascript
const response = await fetch('/api/search/unified', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    query: "debugging sessions about auth issues",
    filters: {
      patterns: ['debugging'],
      dateRange: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    }
  })
})
```

### Cross-Domain Search
```javascript
const response = await fetch('/api/search/unified', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    query: "how did I implement the search feature",
    filters: {
      includeMemories: true,
      includeCode: true,
      mustHaveRelationships: true
    },
    options: {
      includeRelated: true,
      expandContext: true
    }
  })
})
```

## Understanding Results

Each result includes:

- **Type**: Whether it's a memory or code
- **Content**: Title, snippet, and highlighted matches
- **Metadata**: Score, match type, timestamps, project info
- **Relationships**: Related memories, code files, and patterns
- **Context**: Additional context for memories (previous/next chunks)

## Tips for Better Search

1. **Be Specific**: More specific queries yield better results
2. **Use Natural Language**: The system understands questions like "How did I fix..."
3. **Include Time Context**: Words like "yesterday", "last week" help narrow results
4. **Combine Filters**: Use filters to narrow down results by project, language, etc.
5. **Check Relationships**: Look at related items to understand the full context

## Error Handling

The API returns standard HTTP status codes:

- `200 OK`: Successful search
- `400 Bad Request`: Invalid query or parameters
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error during search

Error responses include a descriptive message:

```json
{
  "error": "Query is required",
  "details": "Additional error information"
}
```