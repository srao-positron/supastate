// Unified Search Types and Interfaces

export type SearchEntityType = 'memory' | 'code' | 'pattern' | 'relationship'
export type SearchIntent = 'find_code' | 'find_memory' | 'find_both' | 'explore_topic' | 'debug_issue' | 'understand_implementation'
export type SearchStrategy = 'semantic' | 'temporal' | 'pattern' | 'code_linked' | 'keyword' | 'relationship'
export type MatchType = 'semantic' | 'keyword' | 'relationship' | 'pattern'

export interface UnifiedSearchRequest {
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
    relationshipTypes?: string[]
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

export interface UnifiedSearchResponse {
  // Query interpretation
  interpretation: {
    intent: SearchIntent
    entities: DetectedEntity[]
    timeContext?: string
    searchStrategies: SearchStrategy[]
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

export interface UnifiedSearchResult {
  id: string
  type: SearchEntityType
  
  // Core content
  content: {
    title: string
    snippet: string
    highlights: string[]
  }
  
  // Metadata
  metadata: {
    score: number
    matchType: MatchType
    timestamp?: string
    project?: string
    language?: string  // for code
    sessionId?: string // for memories
  }
  
  // The actual entity
  entity: any // Memory | CodeEntity | Pattern
  
  // Related items
  relationships: {
    memories: RelatedMemory[]
    code: RelatedCode[]
    patterns: RelatedPattern[]
  }
  
  // Context (for memories)
  context?: {
    previousChunk?: any // Memory
    nextChunk?: any // Memory
    session?: any // Session
  }
  
  // Code-specific context
  codeContext?: {
    file: any // CodeFile
    functions?: any[] // CodeFunction[]
    imports?: any[] // Import[]
    usages?: any[] // Usage[]
  }
  
  // API URL to fetch full content
  contentUrl: string
}

export interface DetectedEntity {
  text: string
  type: 'function' | 'file' | 'error' | 'concept' | 'project'
  confidence: number
}

export interface SearchIntentAnalysis {
  primaryIntent: SearchIntent
  timeframe: 'recent' | 'this_week' | 'specific_period' | 'historical' | 'any'
  codeRelevance: 'high' | 'medium' | 'low'
  patterns: string[]
  entities: string[]
  strategies: SearchStrategy[]
}

export interface RelatedMemory {
  id: string
  snippet: string
  occurred_at: string
  relationship_type: string
}

export interface RelatedCode {
  id: string
  path: string
  snippet: string
  language: string
  relationship_type: string
}

export interface RelatedPattern {
  id: string
  type: string
  confidence: number
  name: string
}

export interface FacetCount {
  value: string
  count: number
}

export interface GroupedMemories {
  sessions: Array<{
    id: string
    title: string
    memoryCount: number
    timeRange: { start: string; end: string }
  }>
}

export interface GroupedCode {
  projects: Array<{
    name: string
    fileCount: number
    languages: string[]
  }>
}

export interface DetectedPattern {
  id: string
  type: string
  name: string
  confidence: number
  entityCount: number
}

export interface PaginationInfo {
  hasMore: boolean
  nextCursor?: string
  totalResults?: number
}

// Search Strategy Interface
export interface ISearchStrategy {
  name: string
  execute(query: SearchQuery): Promise<SearchResult[]>
  score(result: SearchResult, query: SearchQuery): number
}

export interface SearchQuery {
  text: string
  context: SearchContext
  filters?: any
  limit?: number
}

export interface SearchContext {
  userId: string
  workspaceId?: string
  teamId?: string
}

export interface SearchResult {
  entity: any
  score: number
  matchType: MatchType
  highlights?: string[]
  relationships?: any
}