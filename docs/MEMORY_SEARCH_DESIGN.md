# Memory Search System Design

## Executive Summary

This document outlines the design for a sophisticated memory search system that leverages our rich graph data model to provide contextual, intelligent search results. The system is designed to serve both human users and LLM agents (like Claude Code) by providing not just search results, but understanding and context.

## Core Principles

1. **Context is King**: Individual memory chunks are often insufficient. We must provide surrounding context, related code, and temporal relationships.
2. **Intelligence over Information**: Use LLM orchestration to understand search intent and choose appropriate strategies.
3. **Relationships Matter**: Leverage our graph structure to surface connected information.
4. **Time Awareness**: Recent memories are often more relevant, but historical patterns provide valuable insights.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   User/LLM      │────▶│  Search Intent   │────▶│ Strategy Engine │
│   Query Input   │     │    Analyzer      │     │  (LLM-powered)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                           │
                              ┌────────────────────────────┴─────────────┐
                              │                                          │
                    ┌─────────▼──────────┐                    ┌─────────▼──────────┐
                    │  Search Strategies │                    │   Result Merger    │
                    ├────────────────────┤                    │   & Ranker         │
                    │ • Semantic         │                    └────────────────────┘
                    │ • Temporal         │                              │
                    │ • Pattern-based    │                              ▼
                    │ • Code-linked      │                    ┌─────────────────────┐
                    │ • Conversational   │                    │  Context Expander   │
                    └────────────────────┘                    │ (prev/next chunks) │
                              │                               └─────────────────────┘
                              ▼                                         │
                    ┌─────────────────────┐                            ▼
                    │   Neo4j & Supabase  │                   ┌─────────────────────┐
                    │   Data Stores       │                   │   Rich Results      │
                    └─────────────────────┘                   └─────────────────────┘
```

## Search Strategies

### 1. Semantic Search (Embedding-based)
- Use vector similarity to find conceptually related memories
- Leverage EntitySummary embeddings for efficient search
- Support similarity threshold tuning

### 2. Temporal Search
- Recent memories (last hour, day, week)
- Date range queries
- Activity pattern detection (e.g., "what was I working on last Tuesday?")

### 3. Pattern-Based Search
- Find memories within debugging sessions
- Locate learning/research sessions
- Surface problem-solving patterns

### 4. Code-Linked Search
- Find memories that reference specific code entities
- Traverse REFERENCES_CODE relationships
- Include code context in results

### 5. Conversational Context Search
- Retrieve entire conversation threads
- Maintain session continuity
- Provide previous/next chunk navigation

### 6. Project-Scoped Search
- Filter by project context
- Cross-project pattern detection
- Project-specific timeline views

## API Design

### Primary Search Endpoint

```typescript
POST /api/memories/search

interface MemorySearchRequest {
  // Natural language query or structured search
  query: string
  
  // Optional: Override automatic strategy selection
  strategies?: SearchStrategy[]
  
  // Filtering options
  filters?: {
    projects?: string[]
    dateRange?: {
      start?: string
      end?: string
    }
    hasCode?: boolean
    patterns?: PatternType[]
  }
  
  // Context options
  context?: {
    expandChunks?: boolean  // Include prev/next chunks
    includeRelated?: boolean // Include related code/docs
    maxContextSize?: number  // Limit context expansion
  }
  
  // Pagination
  pagination?: {
    limit?: number
    offset?: number
    cursor?: string
  }
  
  // Sort preferences
  sort?: {
    by: 'relevance' | 'recency' | 'pattern_strength'
    order?: 'asc' | 'desc'
  }
}

interface MemorySearchResponse {
  // Query understanding
  interpretation: {
    intent: string
    strategies: SearchStrategy[]
    timeframe?: string
    topics?: string[]
  }
  
  // Main results
  results: MemoryResult[]
  
  // Aggregations
  aggregations: {
    totalCount: number
    projectDistribution: Record<string, number>
    timeDistribution: TimeDistribution
    patternSummary: PatternSummary
  }
  
  // Pagination
  pagination: {
    hasMore: boolean
    nextCursor?: string
  }
}

interface MemoryResult {
  memory: {
    id: string
    content: string
    occurred_at: string
    project_name: string
    session_id: string
    chunk_index: number
  }
  
  // Relevance and scoring
  score: {
    relevance: number
    recency: number
    pattern_strength?: number
    method: string // semantic, keyword, pattern, etc.
  }
  
  // Context
  context: {
    previous_chunk?: MemoryChunk
    next_chunk?: MemoryChunk
    session_info: SessionInfo
    conversation_thread?: ConversationThread
  }
  
  // Related entities
  related: {
    code_entities: CodeEntity[]
    patterns: Pattern[]
    similar_memories: Memory[]
  }
  
  // Highlights
  highlights: {
    content_snippets: string[]
    matched_keywords: string[]
  }
}
```

### LLM-Specific Endpoint

```typescript
POST /api/memories/llm-search

interface LLMSearchRequest {
  // The LLM's question or context need
  prompt: string
  
  // Current context (e.g., code being worked on)
  context?: {
    current_file?: string
    current_project?: string
    recent_queries?: string[]
  }
  
  // Preferred response format
  format?: 'detailed' | 'summary' | 'checklist'
  
  // Maximum tokens for response
  max_tokens?: number
}

interface LLMSearchResponse {
  // Direct answer if possible
  answer?: string
  
  // Relevant memories with context
  memories: MemoryWithContext[]
  
  // Suggested follow-up queries
  suggestions: string[]
  
  // Confidence in the response
  confidence: number
}
```

## Search Strategy Implementation

### Intent Analyzer (LLM-Powered)

```typescript
class SearchIntentAnalyzer {
  async analyze(query: string): Promise<SearchIntent> {
    // Use a small, fast LLM to parse intent
    const prompt = `
      Analyze this search query and determine:
      1. Primary intent (find_specific, explore_topic, debug_issue, recall_learning)
      2. Time sensitivity (recent, specific_date, historical)
      3. Code relevance (high, medium, low)
      4. Pattern type (debugging, learning, problem_solving, none)
      
      Query: "${query}"
    `
    
    // Return structured intent
    return {
      primaryIntent: 'find_specific',
      timeframe: 'recent',
      codeRelevance: 'high',
      patterns: ['debugging'],
      strategies: ['temporal', 'code_linked', 'pattern_based']
    }
  }
}
```

### Strategy Implementations

#### 1. Semantic Search Strategy

```cypher
// Find semantically similar memories
MATCH (m:Memory)-[:SUMMARIZES]-(s:EntitySummary)
WHERE s.embedding IS NOT NULL
WITH s, m, vector.similarity.cosine($queryEmbedding, s.embedding) as similarity
WHERE similarity > $threshold
RETURN m, similarity
ORDER BY similarity DESC
LIMIT $limit
```

#### 2. Temporal Search Strategy

```cypher
// Recent memories with time decay scoring
MATCH (m:Memory)
WHERE m.occurred_at > datetime() - duration($timeWindow)
  AND $ownershipFilter
WITH m, 
  duration.between(m.occurred_at, datetime()).days as days_ago,
  1.0 / (1.0 + days_ago * 0.1) as recency_score
RETURN m, recency_score
ORDER BY recency_score DESC
```

#### 3. Pattern-Based Strategy

```cypher
// Find memories within patterns
MATCH (p:Pattern)-[:DERIVED_FROM]->(m:Memory)
WHERE p.type = $patternType
  AND p.confidence > 0.7
WITH p, m
MATCH (m)-[:SUMMARIZES]-(s:EntitySummary)
RETURN m, p, s
ORDER BY p.confidence DESC, m.occurred_at DESC
```

#### 4. Code-Linked Strategy

```cypher
// Find memories discussing specific code
MATCH (m:Memory)-[:REFERENCES_CODE]->(c:CodeEntity)
WHERE c.path CONTAINS $searchTerm
  OR c.name CONTAINS $searchTerm
WITH m, c, COUNT(*) as reference_count
MATCH (m)-[:SUMMARIZES]-(s:EntitySummary)
RETURN m, c, s, reference_count
ORDER BY reference_count DESC, m.occurred_at DESC
```

### Context Expansion

```typescript
class ContextExpander {
  async expandMemoryContext(memory: Memory): Promise<ExpandedContext> {
    // Get surrounding chunks
    const prevChunk = await this.getPreviousChunk(memory.session_id, memory.chunk_index)
    const nextChunk = await this.getNextChunk(memory.session_id, memory.chunk_index)
    
    // Get full conversation thread
    const thread = await this.getConversationThread(memory.session_id)
    
    // Get related code at the time
    const relatedCode = await this.getTemporallyRelatedCode(memory.occurred_at, memory.project_name)
    
    return {
      memory,
      previousChunk: prevChunk,
      nextChunk: nextChunk,
      conversationThread: thread,
      codeContext: relatedCode,
      timelineContext: await this.getTimelineContext(memory.occurred_at)
    }
  }
}
```

## User Experience Design

### Search Interface Components

1. **Intelligent Search Bar**
   - Natural language input
   - Auto-suggestions based on recent searches
   - Quick filters (time, project, pattern type)

2. **Results View**
   - Memory cards with expandable context
   - Timeline visualization
   - Related code sidebar
   - Pattern indicators

3. **Context Navigation**
   - Previous/Next chunk buttons
   - "View Full Conversation" option
   - Jump to code references
   - Timeline scrubber

4. **Filter Panel**
   - Project selector
   - Date range picker
   - Pattern type filters
   - Code association toggle

### UI Mockup Structure

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 "How did I fix the auth bug last week?"                 │
├─────────────────────────────────────────────────────────────┤
│ Filters: [Last Week ▼] [All Projects ▼] [Debugging ✓]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Found 12 memories across 3 debugging sessions              │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📝 Memory from 2025-07-22 14:30                         │ │
│ │                                                         │ │
│ │ "The auth bug was caused by incorrect token refresh    │ │
│ │  logic in the middleware..."                           │ │
│ │                                                         │ │
│ │ 🔗 Related: auth/middleware.ts, auth/refresh.ts        │ │
│ │ 🎯 Pattern: Debugging Session (confidence: 0.92)       │ │
│ │                                                         │ │
│ │ [← Previous] [View Thread] [Next →]                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📝 Memory from 2025-07-22 15:45                         │ │
│ │                                                         │ │
│ │ "Fixed by adding proper error handling and retry       │ │
│ │  logic to the token refresh function..."               │ │
│ │                                                         │ │
│ │ [Show Code Changes]                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Search API
- Implement basic search strategies
- Create context expansion logic
- Build result ranking system

### Phase 2: LLM Integration
- Add intent analyzer
- Implement strategy orchestration
- Create LLM-specific endpoints

### Phase 3: Advanced Features
- Pattern detection integration
- Timeline visualization
- Code diff integration

### Phase 4: UI Enhancement
- Rich result cards
- Context navigation
- Real-time search suggestions

## Performance Considerations

1. **Caching Strategy**
   - Cache embedding computations
   - Store pre-computed context expansions
   - Cache pattern associations

2. **Index Optimization**
   - Vector indexes for embeddings
   - Time-based indexes for temporal queries
   - Full-text indexes for keyword search

3. **Query Optimization**
   - Limit initial result set before expansion
   - Lazy load context information
   - Progressive enhancement of results

## Security & Privacy

1. **Workspace Isolation**
   - Enforce ownership filters
   - Respect team boundaries
   - Audit search queries

2. **LLM Safety**
   - Sanitize LLM responses
   - Limit context exposure
   - Rate limit API calls

## Success Metrics

1. **Search Quality**
   - Click-through rate on results
   - Context expansion usage
   - Result relevance scores

2. **Performance**
   - Search response time < 200ms
   - Context expansion < 100ms
   - LLM intent analysis < 500ms

3. **User Satisfaction**
   - Reduced follow-up queries
   - Increased code reference clicks
   - Pattern discovery rate

## Next Steps

1. Implement core search API with basic strategies
2. Create context expansion system
3. Build LLM intent analyzer
4. Develop rich UI components
5. Test with real user queries
6. Iterate based on usage patterns