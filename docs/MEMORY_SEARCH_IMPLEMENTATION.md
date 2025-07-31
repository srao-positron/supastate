# Memory Search Implementation Plan

## Phase 1: Core Search API Implementation

### 1.1 Create Search Strategies

```typescript
// src/lib/search/strategies/base.ts
export interface SearchStrategy {
  name: string
  execute(query: SearchQuery): Promise<SearchResult[]>
  score(result: SearchResult, query: SearchQuery): number
}

// src/lib/search/strategies/semantic.ts
export class SemanticSearchStrategy implements SearchStrategy {
  name = 'semantic'
  
  async execute(query: SearchQuery): Promise<SearchResult[]> {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query.text)
    
    // Search using vector similarity
    const results = await neo4jService.executeQuery(`
      MATCH (m:Memory)<-[:SUMMARIZES]-(s:EntitySummary)
      WHERE s.embedding IS NOT NULL
        AND ${getOwnershipFilter(query.context)}
      WITH m, s, vector.similarity.cosine($embedding, s.embedding) as similarity
      WHERE similarity > $threshold
      MATCH (m)-[:IN_SESSION]->(session:Session)
      OPTIONAL MATCH (m)-[:REFERENCES_CODE]->(c:CodeEntity)
      RETURN m, s, session, collect(c) as code_entities, similarity
      ORDER BY similarity DESC
      LIMIT $limit
    `, {
      embedding: queryEmbedding,
      threshold: 0.65,
      limit: 50,
      ...getOwnershipParams(query.context)
    })
    
    return this.transformResults(results)
  }
}

// src/lib/search/strategies/temporal.ts
export class TemporalSearchStrategy implements SearchStrategy {
  name = 'temporal'
  
  async execute(query: SearchQuery): Promise<SearchResult[]> {
    const timeWindow = this.parseTimeWindow(query.text)
    
    const results = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      WHERE m.occurred_at > datetime() - duration($duration)
        AND ${getOwnershipFilter(query.context)}
      WITH m, 
        duration.between(m.occurred_at, datetime()).hours as hours_ago,
        1.0 / (1.0 + hours_ago * 0.01) as recency_score
      MATCH (m)-[:IN_SESSION]->(session:Session)
      OPTIONAL MATCH (m)-[:REFERENCES_CODE]->(c:CodeEntity)
      OPTIONAL MATCH (p:Pattern)-[:DERIVED_FROM]->(m)
      RETURN m, session, collect(DISTINCT c) as code_entities, 
             collect(DISTINCT p) as patterns, recency_score
      ORDER BY recency_score DESC
      LIMIT $limit
    `, {
      duration: timeWindow,
      limit: 50,
      ...getOwnershipParams(query.context)
    })
    
    return this.transformResults(results)
  }
}

// src/lib/search/strategies/pattern.ts
export class PatternSearchStrategy implements SearchStrategy {
  name = 'pattern'
  
  async execute(query: SearchQuery): Promise<SearchResult[]> {
    const patternType = this.detectPatternType(query.text)
    
    const results = await neo4jService.executeQuery(`
      MATCH (p:Pattern {type: $patternType})-[:DERIVED_FROM]->(m:Memory)
      WHERE p.confidence > 0.7
        AND ${getOwnershipFilter(query.context)}
      WITH p, m
      MATCH (m)-[:IN_SESSION]->(session:Session)
      OPTIONAL MATCH (m)-[:REFERENCES_CODE]->(c:CodeEntity)
      RETURN m, session, p, collect(c) as code_entities, p.confidence as score
      ORDER BY p.confidence DESC, m.occurred_at DESC
      LIMIT $limit
    `, {
      patternType,
      limit: 50,
      ...getOwnershipParams(query.context)
    })
    
    return this.transformResults(results)
  }
}
```

### 1.2 Context Expansion System

```typescript
// src/lib/search/context-expander.ts
export class ContextExpander {
  async expandMemoryContext(
    memory: Memory, 
    options: ContextOptions
  ): Promise<ExpandedMemoryContext> {
    const context: ExpandedMemoryContext = {
      memory,
      chunks: {},
      thread: null,
      relatedCode: [],
      patterns: [],
      timeline: null
    }
    
    // Get surrounding chunks
    if (options.includeChunks) {
      context.chunks = await this.getChunkContext(memory)
    }
    
    // Get full conversation thread
    if (options.includeThread) {
      context.thread = await this.getConversationThread(memory.session_id)
    }
    
    // Get related code entities
    if (options.includeCode) {
      context.relatedCode = await this.getRelatedCode(memory)
    }
    
    // Get pattern context
    if (options.includePatterns) {
      context.patterns = await this.getPatternContext(memory)
    }
    
    // Get timeline context
    if (options.includeTimeline) {
      context.timeline = await this.getTimelineContext(memory)
    }
    
    return context
  }
  
  private async getChunkContext(memory: Memory): Promise<ChunkContext> {
    const [prevChunk, nextChunk] = await Promise.all([
      this.getPreviousChunk(memory.session_id, memory.chunk_index),
      this.getNextChunk(memory.session_id, memory.chunk_index)
    ])
    
    return { previous: prevChunk, next: nextChunk }
  }
  
  private async getConversationThread(sessionId: string): Promise<ConversationThread> {
    const result = await neo4jService.executeQuery(`
      MATCH (m:Memory {session_id: $sessionId})
      WITH m ORDER BY m.chunk_index
      RETURN collect({
        id: m.id,
        content: m.content,
        role: m.metadata.role,
        chunk_index: m.chunk_index,
        occurred_at: m.occurred_at
      }) as messages
    `, { sessionId })
    
    return {
      sessionId,
      messages: result.records[0]?.messages || []
    }
  }
}
```

### 1.3 Main Search API Endpoint

```typescript
// src/app/api/memories/search/route.ts
import { SearchOrchestrator } from '@/lib/search/orchestrator'
import { ContextExpander } from '@/lib/search/context-expander'

export async function POST(request: Request) {
  const body = await request.json()
  const { query, filters, context, pagination, sort } = body
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Get user context
  const userContext = await getUserContext(user.id)
  
  // Create search orchestrator
  const orchestrator = new SearchOrchestrator()
  
  // Analyze query intent
  const intent = await orchestrator.analyzeIntent(query)
  
  // Execute search strategies
  const searchResults = await orchestrator.search({
    query,
    intent,
    context: userContext,
    filters,
    strategies: intent.strategies
  })
  
  // Expand context for results
  const expander = new ContextExpander()
  const expandedResults = await Promise.all(
    searchResults.results.slice(0, 10).map(result => 
      expander.expandMemoryContext(result.memory, context)
    )
  )
  
  // Build response
  return NextResponse.json({
    interpretation: intent,
    results: expandedResults,
    aggregations: searchResults.aggregations,
    pagination: {
      hasMore: searchResults.total > (pagination?.offset || 0) + expandedResults.length,
      nextCursor: searchResults.nextCursor
    }
  })
}
```

### 1.4 Search Orchestrator

```typescript
// src/lib/search/orchestrator.ts
export class SearchOrchestrator {
  private strategies: Map<string, SearchStrategy>
  private intentAnalyzer: IntentAnalyzer
  
  constructor() {
    this.strategies = new Map([
      ['semantic', new SemanticSearchStrategy()],
      ['temporal', new TemporalSearchStrategy()],
      ['pattern', new PatternSearchStrategy()],
      ['code_linked', new CodeLinkedSearchStrategy()],
      ['conversational', new ConversationalSearchStrategy()]
    ])
    this.intentAnalyzer = new IntentAnalyzer()
  }
  
  async analyzeIntent(query: string): Promise<SearchIntent> {
    return this.intentAnalyzer.analyze(query)
  }
  
  async search(request: SearchRequest): Promise<SearchResponse> {
    // Execute strategies in parallel
    const strategyResults = await Promise.all(
      request.strategies.map(strategyName => {
        const strategy = this.strategies.get(strategyName)
        if (!strategy) return null
        return strategy.execute(request)
      })
    )
    
    // Merge and rank results
    const mergedResults = this.mergeResults(strategyResults.filter(Boolean))
    const rankedResults = this.rankResults(mergedResults, request.intent)
    
    // Apply filters
    const filteredResults = this.applyFilters(rankedResults, request.filters)
    
    // Generate aggregations
    const aggregations = this.generateAggregations(filteredResults)
    
    return {
      results: filteredResults,
      aggregations,
      total: filteredResults.length,
      nextCursor: this.generateCursor(filteredResults)
    }
  }
  
  private mergeResults(strategyResults: SearchResult[][]): SearchResult[] {
    const resultMap = new Map<string, SearchResult>()
    
    for (const results of strategyResults) {
      for (const result of results) {
        const existing = resultMap.get(result.memory.id)
        if (existing) {
          // Merge scores and metadata
          existing.score = this.mergeScores(existing.score, result.score)
          existing.matchedStrategies.push(...result.matchedStrategies)
        } else {
          resultMap.set(result.memory.id, result)
        }
      }
    }
    
    return Array.from(resultMap.values())
  }
  
  private rankResults(results: SearchResult[], intent: SearchIntent): SearchResult[] {
    return results.sort((a, b) => {
      // Combine different scoring factors
      const scoreA = this.calculateFinalScore(a, intent)
      const scoreB = this.calculateFinalScore(b, intent)
      return scoreB - scoreA
    })
  }
}
```

## Phase 2: LLM Integration

### 2.1 Intent Analyzer

```typescript
// src/lib/search/intent-analyzer.ts
export class IntentAnalyzer {
  private openai: OpenAI
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  }
  
  async analyze(query: string): Promise<SearchIntent> {
    const prompt = `
Analyze this search query and extract:
1. Primary intent: find_specific_info, explore_topic, debug_issue, recall_learning, review_history
2. Time sensitivity: recent (last 24h), this_week, specific_date, historical, any_time
3. Code relevance: high (looking for code), medium (might involve code), low (unlikely code-related)
4. Pattern indicators: debugging, learning, problem_solving, documentation, none
5. Key entities: specific files, functions, errors, or concepts mentioned

Query: "${query}"

Respond in JSON format.
`
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
    
    const analysis = JSON.parse(response.choices[0].message.content)
    
    return {
      primaryIntent: analysis.primary_intent,
      timeframe: analysis.time_sensitivity,
      codeRelevance: analysis.code_relevance,
      patterns: analysis.pattern_indicators,
      entities: analysis.key_entities,
      strategies: this.determineStrategies(analysis)
    }
  }
  
  private determineStrategies(analysis: any): string[] {
    const strategies = []
    
    // Always include semantic search
    strategies.push('semantic')
    
    // Add temporal if time-sensitive
    if (['recent', 'this_week', 'specific_date'].includes(analysis.time_sensitivity)) {
      strategies.push('temporal')
    }
    
    // Add pattern search if patterns detected
    if (analysis.pattern_indicators.length > 0 && analysis.pattern_indicators[0] !== 'none') {
      strategies.push('pattern')
    }
    
    // Add code search if code-relevant
    if (analysis.code_relevance === 'high') {
      strategies.push('code_linked')
    }
    
    // Add conversational for context
    if (analysis.primary_intent === 'recall_learning' || analysis.primary_intent === 'review_history') {
      strategies.push('conversational')
    }
    
    return strategies
  }
}
```

### 2.2 LLM-Specific Search Endpoint

```typescript
// src/app/api/memories/llm-search/route.ts
export async function POST(request: Request) {
  const body = await request.json()
  const { prompt, context, format = 'detailed', max_tokens = 2000 } = body
  
  // Use the search orchestrator
  const orchestrator = new SearchOrchestrator()
  const searchResults = await orchestrator.search({
    query: prompt,
    context: context,
    strategies: ['semantic', 'temporal', 'code_linked']
  })
  
  // Format results for LLM consumption
  const llmFormatter = new LLMResponseFormatter()
  const formattedResponse = await llmFormatter.format({
    query: prompt,
    results: searchResults.results.slice(0, 10),
    format: format,
    maxTokens: max_tokens
  })
  
  // Generate direct answer if possible
  const answerGenerator = new AnswerGenerator()
  const answer = await answerGenerator.generateAnswer({
    query: prompt,
    memories: formattedResponse.memories,
    context: context
  })
  
  return NextResponse.json({
    answer: answer.text,
    confidence: answer.confidence,
    memories: formattedResponse.memories,
    suggestions: formattedResponse.suggestions,
    metadata: {
      strategies_used: searchResults.interpretation.strategies,
      total_results: searchResults.total,
      processing_time: formattedResponse.processingTime
    }
  })
}
```

## Phase 3: UI Implementation

### 3.1 Search Page Component

```tsx
// src/app/memory-search/page.tsx
'use client'

import { useState } from 'react'
import { SearchBar } from '@/components/search/search-bar'
import { SearchResults } from '@/components/search/search-results'
import { SearchFilters } from '@/components/search/search-filters'
import { useMemorySearch } from '@/hooks/use-memory-search'

export default function MemorySearchPage() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>({})
  const { results, loading, search } = useMemorySearch()
  
  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery)
    await search({
      query: searchQuery,
      filters,
      context: {
        expandChunks: true,
        includeRelated: true
      }
    })
  }
  
  return (
    <div className="container mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Memory Search</h1>
        <SearchBar 
          onSearch={handleSearch}
          placeholder="Search your memories..."
          suggestions={true}
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <SearchFilters 
            filters={filters}
            onChange={setFilters}
          />
        </div>
        
        <div className="lg:col-span-3">
          <SearchResults 
            results={results}
            loading={loading}
            query={query}
          />
        </div>
      </div>
    </div>
  )
}
```

### 3.2 Memory Result Card

```tsx
// src/components/search/memory-result-card.tsx
export function MemoryResultCard({ result }: { result: MemorySearchResult }) {
  const [expanded, setExpanded] = useState(false)
  const [showThread, setShowThread] = useState(false)
  
  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">
              {formatDate(result.memory.occurred_at)}
            </CardTitle>
            <CardDescription>
              {result.memory.project_name} • Session {result.memory.session_id.slice(0, 8)}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {result.score.method === 'semantic' && (
              <Badge variant="secondary">Semantic Match</Badge>
            )}
            {result.related.patterns.map(pattern => (
              <Badge key={pattern.id} variant="outline">
                {pattern.type}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="prose prose-sm max-w-none">
          {result.highlights.content_snippets.map((snippet, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: snippet }} />
          ))}
        </div>
        
        {result.related.code_entities.length > 0 && (
          <div className="mt-4 p-3 bg-muted rounded-md">
            <h4 className="text-sm font-semibold mb-2">Related Code</h4>
            <div className="space-y-1">
              {result.related.code_entities.map(code => (
                <Link
                  key={code.id}
                  href={`/code/${code.id}`}
                  className="text-sm text-blue-600 hover:underline block"
                >
                  {code.path}
                </Link>
              ))}
            </div>
          </div>
        )}
        
        <div className="mt-4 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show Less' : 'Show Context'}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowThread(!showThread)}
          >
            View Thread
          </Button>
          
          {result.context.previous_chunk && (
            <Button variant="ghost" size="sm">
              ← Previous
            </Button>
          )}
          
          {result.context.next_chunk && (
            <Button variant="ghost" size="sm">
              Next →
            </Button>
          )}
        </div>
        
        {expanded && (
          <ExpandedContext context={result.context} />
        )}
        
        {showThread && (
          <ConversationThread thread={result.context.conversation_thread} />
        )}
      </CardContent>
    </Card>
  )
}
```

## Performance Optimizations

### 1. Vector Index Creation

```sql
-- Create vector index for semantic search
CREATE VECTOR INDEX memory_embedding_index FOR (s:EntitySummary) ON s.embedding
OPTIONS {indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}}
```

### 2. Caching Layer

```typescript
// src/lib/search/cache.ts
export class SearchCache {
  private redis: Redis
  
  async getCachedResults(query: string, filters: any): Promise<SearchResult[] | null> {
    const cacheKey = this.generateCacheKey(query, filters)
    const cached = await this.redis.get(cacheKey)
    return cached ? JSON.parse(cached) : null
  }
  
  async cacheResults(query: string, filters: any, results: SearchResult[]): Promise<void> {
    const cacheKey = this.generateCacheKey(query, filters)
    await this.redis.setex(cacheKey, 300, JSON.stringify(results)) // 5 min cache
  }
}
```

### 3. Query Optimization

```typescript
// Batch context expansion
async function batchExpandContext(memories: Memory[]): Promise<ExpandedMemoryContext[]> {
  const sessionIds = [...new Set(memories.map(m => m.session_id))]
  
  // Fetch all session data in one query
  const sessions = await neo4jService.executeQuery(`
    MATCH (m:Memory)
    WHERE m.session_id IN $sessionIds
    WITH m.session_id as session_id, collect(m) as memories
    RETURN session_id, memories
  `, { sessionIds })
  
  // Process in parallel
  return Promise.all(memories.map(memory => 
    this.expandMemoryContext(memory, { fromCache: sessions })
  ))
}
```

## Monitoring & Analytics

```typescript
// Track search metrics
interface SearchMetrics {
  query: string
  strategies_used: string[]
  result_count: number
  click_through_rate: number
  context_expansion_rate: number
  response_time_ms: number
  user_satisfaction: number
}

// Log to analytics
async function trackSearch(metrics: SearchMetrics) {
  await analytics.track('memory_search', metrics)
}
```