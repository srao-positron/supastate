# Unified Search System Design

## Overview

This document outlines a unified search system that combines memory search and code search into a single, intelligent interface. The system understands the relationships between memories and code, providing contextual results that span both domains.

## Key Concepts

### Unified Search Philosophy
- **One Search, All Knowledge**: Users shouldn't need to decide whether to search memories or code
- **Contextual Understanding**: The system understands that memories often discuss code, and code often relates to specific conversations
- **Relationship-Aware**: Leverages the graph structure to surface connected information
- **Intent-Driven**: Uses AI to understand what the user is really looking for

## Architecture

```
┌─────────────────────┐
│   Unified Search    │
│      Query          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌──────────────────┐
│   Intent Analyzer   │────▶│ Entity Detector  │
│  (What & Where?)    │     │ (Code? Memory?)  │
└──────────┬──────────┘     └──────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│           Search Strategy Router             │
├─────────────────┬─────────────────┬─────────┤
│  Memory Search  │  Code Search    │  Cross  │
│   Strategies    │  Strategies     │ Search  │
└─────────────────┴─────────────────┴─────────┘
                          │
                          ▼
┌─────────────────────────────────────────────┐
│            Result Unification                │
│  • Merge memories and code                   │
│  • Rank by relevance and relationships       │
│  • Expand context across both domains        │
└─────────────────────────────────────────────┘
```

## Search Types

### 1. Pure Memory Search
- "What was I working on last week?"
- "Show me all debugging sessions"
- "Find conversations about authentication"

### 2. Pure Code Search
- "Find the auth middleware function"
- "Show all TypeScript files with error handling"
- "Where is the user model defined?"

### 3. Cross-Domain Search (Most Powerful)
- "How did I implement the auth fix?" → Shows memories discussing the problem AND the code changes
- "Show me everything about the payment bug" → Returns debugging conversations, related code, and fix commits
- "What does the getUserProfile function do?" → Shows code AND memories explaining/discussing it

### 4. Relationship Search
- "What code did I write while debugging auth issues?"
- "Show memories that reference database migrations"
- "Find code that was discussed in learning sessions"

## Unified API Design

```typescript
POST /api/search/unified

interface UnifiedSearchRequest {
  query: string
  
  // Optional filters
  filters?: {
    // Entity type filters
    includeMemories?: boolean  // default: true
    includeCode?: boolean      // default: true
    
    // Temporal filters
    dateRange?: {
      start?: string
      end?: string
    }
    
    // Scope filters
    projects?: string[]
    languages?: string[]      // for code
    patterns?: string[]       // for memories
    
    // Relationship filters
    mustHaveRelationships?: boolean  // only show connected items
    relationshipTypes?: RelationshipType[]
  }
  
  // Search behavior
  options?: {
    searchMode?: 'smart' | 'exact' | 'fuzzy'
    expandContext?: boolean
    includeRelated?: boolean
    groupBySession?: boolean   // group memory chunks
    groupByFile?: boolean      // group code entities
  }
  
  // Pagination
  pagination?: {
    limit?: number
    cursor?: string
  }
}

interface UnifiedSearchResponse {
  // Query interpretation
  interpretation: {
    intent: 'find_code' | 'find_memory' | 'find_both' | 'explore_topic'
    entities: DetectedEntity[]
    timeContext?: string
    searchStrategies: string[]
  }
  
  // Unified results
  results: UnifiedSearchResult[]
  
  // Grouped results (optional)
  groups?: {
    memories?: GroupedMemories
    code?: GroupedCode
    patterns?: DetectedPattern[]
  }
  
  // Facets for filtering
  facets: {
    projects: FacetCount[]
    languages: FacetCount[]
    timeRanges: FacetCount[]
    resultTypes: FacetCount[]
  }
  
  pagination: PaginationInfo
}

interface UnifiedSearchResult {
  id: string
  type: 'memory' | 'code' | 'pattern' | 'relationship'
  
  // Core content
  content: {
    title: string
    snippet: string
    highlights: string[]
  }
  
  // Metadata
  metadata: {
    score: number
    matchType: 'semantic' | 'keyword' | 'relationship' | 'pattern'
    timestamp?: string
    project?: string
    language?: string  // for code
    sessionId?: string // for memories
  }
  
  // The actual entity
  entity: Memory | CodeEntity | Pattern
  
  // Related items
  relationships: {
    memories: RelatedMemory[]
    code: RelatedCode[]
    patterns: RelatedPattern[]
  }
  
  // Context (for memories)
  context?: {
    previousChunk?: Memory
    nextChunk?: Memory
    session?: Session
  }
  
  // Code-specific context
  codeContext?: {
    file: CodeFile
    functions?: CodeFunction[]
    imports?: Import[]
    usages?: Usage[]
  }
}
```

## Search Strategies

### 1. Unified Semantic Search
```cypher
// Search across both memories and code using embeddings
WITH $queryEmbedding as qe
MATCH (e:EntitySummary)
WHERE e.embedding IS NOT NULL
  AND ${ownershipFilter}
WITH e, vector.similarity.cosine(qe, e.embedding) as similarity
WHERE similarity > 0.65
MATCH (e)-[:SUMMARIZES]->(entity)
WHERE entity:Memory OR entity:CodeEntity
OPTIONAL MATCH (entity)-[r:REFERENCES_CODE|DISCUSSED_IN|RELATES_TO]-(related)
RETURN entity, type(r) as relType, related, similarity
ORDER BY similarity DESC
```

### 2. Cross-Reference Search
```cypher
// Find memories and code that reference each other
MATCH (m:Memory)-[:REFERENCES_CODE]->(c:CodeEntity)
WHERE m.content CONTAINS $searchTerm
   OR c.content CONTAINS $searchTerm
WITH m, c
OPTIONAL MATCH (p:Pattern)-[:DERIVED_FROM]->(m)
RETURN m, c, collect(p) as patterns
```

### 3. Temporal Cross-Domain Search
```cypher
// Find code and memories from the same time period
MATCH (m:Memory)
WHERE m.occurred_at > datetime() - duration('P7D')
  AND m.content CONTAINS $searchTerm
WITH m, date(m.occurred_at) as memoryDate
MATCH (c:CodeEntity)
WHERE date(c.created_at) = memoryDate
  AND c.project_name = m.project_name
RETURN m, c, memoryDate
ORDER BY m.occurred_at DESC
```

### 4. Pattern-Connected Search
```cypher
// Find code and memories connected through patterns
MATCH (p:Pattern {type: $patternType})
MATCH (p)-[:DERIVED_FROM]->(m:Memory)
MATCH (p)-[:FOUND_IN]->(s:EntitySummary)-[:SUMMARIZES]->(c:CodeEntity)
WHERE m.project_name = c.project_name
RETURN p, m, c
```

## Implementation Components

### 1. Unified Intent Analyzer
```typescript
class UnifiedIntentAnalyzer {
  async analyze(query: string): Promise<UnifiedIntent> {
    const prompt = `
Analyze this search query to determine:
1. Primary target: code, memory, both, or relationship
2. Search type: specific_item, explore_topic, debug_issue, understand_implementation
3. Time context: recent, specific_period, historical, any
4. Entity detection: specific files, functions, errors, or concepts
5. Relationship interest: looking for connections between code and discussions

Query: "${query}"

Examples:
- "How did I fix the auth bug?" → both, debug_issue, recent, [auth, bug], high
- "getUserProfile function" → code, specific_item, any, [getUserProfile], low
- "What was I working on yesterday?" → memory, explore_topic, recent, [], medium
`
    
    return await this.llm.analyze(prompt)
  }
}
```

### 2. Unified Search Orchestrator
```typescript
class UnifiedSearchOrchestrator {
  async search(request: UnifiedSearchRequest): Promise<UnifiedSearchResponse> {
    // Analyze intent
    const intent = await this.intentAnalyzer.analyze(request.query)
    
    // Route to appropriate strategies
    const strategies = this.selectStrategies(intent, request.filters)
    
    // Execute searches in parallel
    const results = await Promise.all([
      this.searchMemories(request, strategies.memory),
      this.searchCode(request, strategies.code),
      this.searchRelationships(request, strategies.cross)
    ])
    
    // Unify and rank results
    const unifiedResults = this.unifyResults(results, intent)
    
    // Expand context where needed
    const expandedResults = await this.expandContext(unifiedResults, request.options)
    
    // Group if requested
    const groups = request.options?.groupBySession || request.options?.groupByFile
      ? this.groupResults(expandedResults)
      : undefined
    
    return {
      interpretation: intent,
      results: expandedResults,
      groups,
      facets: this.generateFacets(expandedResults),
      pagination: this.paginationInfo(expandedResults, request.pagination)
    }
  }
  
  private unifyResults(
    [memories, code, relationships]: SearchResultSet[],
    intent: UnifiedIntent
  ): UnifiedSearchResult[] {
    const unified = new Map<string, UnifiedSearchResult>()
    
    // Add memory results
    for (const memory of memories) {
      unified.set(`memory:${memory.id}`, {
        id: memory.id,
        type: 'memory',
        content: this.extractContent(memory),
        metadata: this.extractMetadata(memory),
        entity: memory,
        relationships: { memories: [], code: [], patterns: [] }
      })
    }
    
    // Add code results
    for (const codeEntity of code) {
      unified.set(`code:${codeEntity.id}`, {
        id: codeEntity.id,
        type: 'code',
        content: this.extractContent(codeEntity),
        metadata: this.extractMetadata(codeEntity),
        entity: codeEntity,
        relationships: { memories: [], code: [], patterns: [] }
      })
    }
    
    // Enhance with relationships
    for (const rel of relationships) {
      const memoryResult = unified.get(`memory:${rel.memory.id}`)
      const codeResult = unified.get(`code:${rel.code.id}`)
      
      if (memoryResult && rel.code) {
        memoryResult.relationships.code.push(rel.code)
      }
      if (codeResult && rel.memory) {
        codeResult.relationships.memories.push(rel.memory)
      }
    }
    
    // Rank by relevance considering intent
    return this.rankUnifiedResults(Array.from(unified.values()), intent)
  }
}
```

### 3. Unified UI Components

```tsx
// src/app/search/page.tsx
export default function UnifiedSearchPage() {
  const [results, setResults] = useState<UnifiedSearchResult[]>([])
  const [view, setView] = useState<'unified' | 'memories' | 'code'>('unified')
  
  return (
    <div className="container mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Search Everything</h1>
        <UnifiedSearchBar 
          placeholder="Search memories, code, or ask a question..."
          onSearch={handleSearch}
        />
        
        <div className="mt-4 flex gap-2">
          <ToggleGroup value={view} onValueChange={setView}>
            <ToggleGroupItem value="unified">All</ToggleGroupItem>
            <ToggleGroupItem value="memories">Memories</ToggleGroupItem>
            <ToggleGroupItem value="code">Code</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <UnifiedFilters onFilterChange={handleFilterChange} />
        </div>
        
        <div className="lg:col-span-3">
          {view === 'unified' && <UnifiedResultsView results={results} />}
          {view === 'memories' && <MemoryResultsView results={filterMemories(results)} />}
          {view === 'code' && <CodeResultsView results={filterCode(results)} />}
        </div>
      </div>
    </div>
  )
}
```

```tsx
// Unified result card that handles both memory and code
function UnifiedResultCard({ result }: { result: UnifiedSearchResult }) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            {result.type === 'memory' && <Brain className="h-4 w-4" />}
            {result.type === 'code' && <Code className="h-4 w-4" />}
            <CardTitle className="text-lg">{result.content.title}</CardTitle>
          </div>
          <Badge variant={result.type === 'memory' ? 'default' : 'secondary'}>
            {result.type}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="prose prose-sm max-w-none mb-4">
          {result.content.highlights.map((highlight, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: highlight }} />
          ))}
        </div>
        
        {/* Show relationships */}
        {result.relationships.code.length > 0 && result.type === 'memory' && (
          <RelatedCodeSection code={result.relationships.code} />
        )}
        
        {result.relationships.memories.length > 0 && result.type === 'code' && (
          <RelatedMemoriesSection memories={result.relationships.memories} />
        )}
        
        <ResultActions result={result} />
      </CardContent>
    </Card>
  )
}
```

## Benefits of Unified Search

1. **Single Entry Point**: Users don't need to decide where to search
2. **Contextual Understanding**: See how code and discussions relate
3. **Better Discovery**: Find things you didn't know were connected
4. **Time Savings**: One search instead of multiple
5. **Richer Results**: Each result includes related context from other domains

## Migration Plan

1. **Phase 1**: Build unified search API alongside existing endpoints
2. **Phase 2**: Create new unified UI while keeping old pages
3. **Phase 3**: Migrate existing search pages to use unified API
4. **Phase 4**: Deprecate separate search endpoints
5. **Phase 5**: Remove old search pages, redirect to unified search

## Performance Considerations

1. **Parallel Execution**: Search memories and code simultaneously
2. **Smart Caching**: Cache frequently accessed relationships
3. **Progressive Loading**: Load basic results first, enhance with relationships
4. **Index Optimization**: Ensure proper indexes for cross-domain queries

## Success Metrics

1. **Usage Patterns**
   - Ratio of cross-domain vs single-domain searches
   - Click-through rate on related items
   - Time to find information

2. **Search Quality**
   - Result relevance scores
   - User satisfaction ratings
   - Reduced follow-up searches

3. **Performance**
   - Search response time < 300ms
   - Relationship loading < 100ms
   - UI responsiveness