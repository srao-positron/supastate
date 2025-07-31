import { 
  UnifiedSearchRequest, 
  UnifiedSearchResponse, 
  UnifiedSearchResult,
  SearchQuery,
  SearchResult,
  SearchStrategy,
  ISearchStrategy,
  FacetCount,
  GroupedMemories,
  GroupedCode,
  SearchEntityType
} from './types'
import { IntentAnalyzer } from './intent-analyzer'
import { SemanticSearchStrategy } from './strategies/semantic'
import { TemporalSearchStrategy } from './strategies/temporal'
import { PatternSearchStrategy } from './strategies/pattern'
import { CodeLinkedSearchStrategy } from './strategies/code-linked'
import { KeywordSearchStrategy } from './strategies/keyword'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'
import { serializeTemporalFields, temporalToISOString } from '@/lib/utils/temporal'

export class UnifiedSearchOrchestrator {
  private strategies: Map<string, ISearchStrategy>
  private intentAnalyzer: IntentAnalyzer
  
  constructor() {
    this.strategies = new Map<string, ISearchStrategy>([
      ['semantic', new SemanticSearchStrategy()],
      ['temporal', new TemporalSearchStrategy()],
      ['pattern', new PatternSearchStrategy()],
      ['code_linked', new CodeLinkedSearchStrategy()],
      ['keyword', new KeywordSearchStrategy()]
    ])
    this.intentAnalyzer = new IntentAnalyzer()
  }
  
  async search(
    request: UnifiedSearchRequest, 
    context: { userId: string; workspaceId?: string; teamId?: string }
  ): Promise<UnifiedSearchResponse> {
    console.log('Unified search request:', { query: request.query, context })
    
    // Analyze the search intent
    const interpretation = await this.intentAnalyzer.analyze(request.query)
    console.log('Search interpretation:', interpretation)
    
    // Build search query object
    const searchQuery: SearchQuery = {
      text: request.query,
      context,
      filters: request.filters,
      limit: request.pagination?.limit || 50
    }
    
    // Execute strategies based on interpretation
    const strategyResults = await this.executeStrategies(
      searchQuery,
      interpretation.strategies
    )
    
    // Merge and rank results
    const mergedResults = this.mergeResults(strategyResults)
    const rankedResults = this.rankResults(mergedResults, interpretation)
    
    // Apply filters
    const filteredResults = this.applyFilters(rankedResults, request.filters)
    
    // Transform to unified format
    const unifiedResults = await this.transformToUnifiedResults(
      filteredResults,
      request.options
    )
    
    // Generate facets for filtering
    const facets = this.generateFacets(unifiedResults)
    
    // Group results if requested
    const groups = this.groupResults(unifiedResults, request.options)
    
    // Handle pagination
    const paginatedResults = this.paginateResults(
      unifiedResults,
      request.pagination
    )
    
    return {
      interpretation: {
        intent: interpretation.primaryIntent,
        entities: this.intentAnalyzer.extractEntities(request.query),
        timeContext: interpretation.timeframe,
        searchStrategies: interpretation.strategies
      },
      results: paginatedResults.results,
      groups,
      facets,
      pagination: paginatedResults.pagination
    }
  }
  
  private async executeStrategies(
    query: SearchQuery,
    strategyNames: SearchStrategy[]
  ): Promise<Map<string, SearchResult[]>> {
    const results = new Map<string, SearchResult[]>()
    
    console.log('Executing strategies:', strategyNames)
    
    // Execute each strategy in parallel
    const promises = strategyNames.map(async (strategyName) => {
      const strategy = this.strategies.get(strategyName)
      if (strategy) {
        try {
          console.log(`Executing ${strategyName} strategy...`)
          const strategyResults = await strategy.execute(query)
          console.log(`${strategyName} returned ${strategyResults.length} results`)
          results.set(strategyName, strategyResults)
        } catch (error) {
          console.error(`Strategy ${strategyName} failed:`, error)
          results.set(strategyName, [])
        }
      }
    })
    
    await Promise.all(promises)
    return results
  }
  
  private mergeResults(strategyResults: Map<string, SearchResult[]>): SearchResult[] {
    const merged = new Map<string, SearchResult>()
    
    // Combine results from all strategies
    for (const [strategy, results] of strategyResults) {
      for (const result of results) {
        const key = `${result.entity.id}_${result.entity.labels?.[0] || 'unknown'}`
        const existing = merged.get(key)
        
        if (existing) {
          // Merge scores and keep the best match type
          existing.score = Math.max(existing.score, result.score)
          if (result.matchType === 'semantic' && existing.matchType !== 'semantic') {
            existing.matchType = result.matchType
          }
          // Merge highlights
          if (result.highlights) {
            existing.highlights = [...(existing.highlights || []), ...result.highlights]
          }
        } else {
          merged.set(key, { ...result })
        }
      }
    }
    
    return Array.from(merged.values())
  }
  
  private rankResults(results: SearchResult[], interpretation: any): SearchResult[] {
    return results.sort((a, b) => {
      let scoreA = a.score
      let scoreB = b.score
      
      // Boost based on intent
      if (interpretation.primaryIntent === 'find_code') {
        if (a.entity.path) scoreA += 0.1 // Boost code results
        if (b.entity.path) scoreB += 0.1
      } else if (interpretation.primaryIntent === 'find_memory') {
        if (a.entity.occurred_at) scoreA += 0.1 // Boost memory results
        if (b.entity.occurred_at) scoreB += 0.1
      }
      
      // Boost for having relationships
      if (a.relationships && Object.values(a.relationships).some(r => Array.isArray(r) && r.length > 0)) {
        scoreA += 0.05
      }
      if (b.relationships && Object.values(b.relationships).some(r => Array.isArray(r) && r.length > 0)) {
        scoreB += 0.05
      }
      
      return scoreB - scoreA
    })
  }
  
  private applyFilters(results: SearchResult[], filters?: any): SearchResult[] {
    if (!filters) return results
    
    return results.filter(result => {
      // Date range filter
      if (filters.dateRange) {
        const date = result.entity.occurred_at || result.entity.created_at
        if (date) {
          const resultDate = new Date(date)
          if (filters.dateRange.start && resultDate < new Date(filters.dateRange.start)) {
            return false
          }
          if (filters.dateRange.end && resultDate > new Date(filters.dateRange.end)) {
            return false
          }
        }
      }
      
      // Project filter
      if (filters.projects && filters.projects.length > 0) {
        if (!filters.projects.includes(result.entity.project_name)) {
          return false
        }
      }
      
      // Language filter (for code)
      if (filters.languages && filters.languages.length > 0 && result.entity.language) {
        if (!filters.languages.includes(result.entity.language)) {
          return false
        }
      }
      
      // Relationship filter
      if (filters.mustHaveRelationships && result.relationships) {
        const hasRelationships = Object.values(result.relationships)
          .some(r => Array.isArray(r) && r.length > 0)
        if (!hasRelationships) {
          return false
        }
      }
      
      return true
    })
  }
  
  private async transformToUnifiedResults(
    results: SearchResult[],
    options?: any
  ): Promise<UnifiedSearchResult[]> {
    return results.map(result => {
      // Serialize temporal fields in the entity
      const serializedEntity = serializeTemporalFields(result.entity)
      
      const isMemory = serializedEntity.occurred_at !== undefined
      const isCode = serializedEntity.path !== undefined
      
      const type: SearchEntityType = isMemory ? 'memory' : isCode ? 'code' : 'pattern'
      
      // Add content API URL (only for memory and code)
      const contentUrl = type === 'pattern' ? '' : `/api/content/${type}/${serializedEntity.id}`
      
      // Generate title
      let title = ''
      if (isMemory) {
        title = serializedEntity.project_name || 'Memory'
        if (serializedEntity.occurred_at) {
          try {
            const date = new Date(serializedEntity.occurred_at)
            title += ` - ${date.toLocaleDateString()}`
          } catch (e) {
            // Fallback if date parsing fails
            console.warn('Failed to parse date:', serializedEntity.occurred_at)
          }
        }
      } else if (isCode) {
        const pathParts = serializedEntity.path?.split('/') || []
        title = pathParts[pathParts.length - 1] || serializedEntity.name || 'Code'
      }
      
      // Get snippet
      const snippet = result.highlights?.[0]?.replace(/<\/?mark>/g, '') || 
                     serializedEntity.content?.substring(0, 200) + '...' ||
                     'No preview available'
      
      // Serialize relationships
      const serializedRelationships = serializeTemporalFields(result.relationships || {
        memories: [],
        code: [],
        patterns: []
      })
      
      return {
        id: serializedEntity.id,
        type,
        content: {
          title,
          snippet,
          highlights: result.highlights || []
        },
        metadata: {
          score: result.score,
          matchType: result.matchType,
          timestamp: temporalToISOString(serializedEntity.occurred_at || serializedEntity.created_at),
          project: serializedEntity.project_name,
          language: serializedEntity.language,
          sessionId: serializedEntity.session_id
        },
        entity: serializedEntity,
        relationships: serializedRelationships,
        contentUrl
      }
    })
  }
  
  private generateFacets(results: UnifiedSearchResult[]): any {
    const projectCounts = new Map<string, number>()
    const languageCounts = new Map<string, number>()
    const typeCounts = new Map<string, number>()
    
    for (const result of results) {
      // Count by project
      if (result.metadata.project) {
        projectCounts.set(
          result.metadata.project,
          (projectCounts.get(result.metadata.project) || 0) + 1
        )
      }
      
      // Count by language
      if (result.metadata.language) {
        languageCounts.set(
          result.metadata.language,
          (languageCounts.get(result.metadata.language) || 0) + 1
        )
      }
      
      // Count by type
      typeCounts.set(result.type, (typeCounts.get(result.type) || 0) + 1)
    }
    
    const toFacetArray = (map: Map<string, number>): FacetCount[] => {
      return Array.from(map.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
    }
    
    return {
      projects: toFacetArray(projectCounts),
      languages: toFacetArray(languageCounts),
      timeRanges: [], // TODO: Implement time range facets
      resultTypes: toFacetArray(typeCounts)
    }
  }
  
  private groupResults(results: UnifiedSearchResult[], options?: any): any {
    if (!options?.groupBySession && !options?.groupByFile) {
      return undefined
    }
    
    const groups: any = {}
    
    if (options.groupBySession) {
      const sessions = new Map<string, UnifiedSearchResult[]>()
      
      results
        .filter(r => r.type === 'memory' && r.metadata.sessionId)
        .forEach(result => {
          const sessionId = result.metadata.sessionId!
          if (!sessions.has(sessionId)) {
            sessions.set(sessionId, [])
          }
          sessions.get(sessionId)!.push(result)
        })
      
      groups.memories = {
        sessions: Array.from(sessions.entries()).map(([id, memories]) => {
          const timestamps = memories
            .map(m => m.metadata.timestamp)
            .filter(Boolean)
            .map(t => new Date(t!))
          
          return {
            id,
            title: memories[0].metadata.project || 'Session',
            memoryCount: memories.length,
            timeRange: timestamps.length > 0 ? {
              start: new Date(Math.min(...timestamps.map(d => d.getTime()))).toISOString(),
              end: new Date(Math.max(...timestamps.map(d => d.getTime()))).toISOString()
            } : undefined
          }
        })
      }
    }
    
    if (options.groupByFile) {
      const projects = new Map<string, Set<string>>()
      
      results
        .filter(r => r.type === 'code')
        .forEach(result => {
          const project = result.metadata.project || 'Unknown'
          if (!projects.has(project)) {
            projects.set(project, new Set())
          }
          if (result.metadata.language) {
            projects.get(project)!.add(result.metadata.language)
          }
        })
      
      groups.code = {
        projects: Array.from(projects.entries()).map(([name, languages]) => ({
          name,
          fileCount: results.filter(r => r.type === 'code' && r.metadata.project === name).length,
          languages: Array.from(languages)
        }))
      }
    }
    
    return groups
  }
  
  private paginateResults(
    results: UnifiedSearchResult[],
    pagination?: { limit?: number; cursor?: string }
  ): { results: UnifiedSearchResult[]; pagination: any } {
    const limit = pagination?.limit || 20
    const cursor = pagination?.cursor
    
    let startIndex = 0
    if (cursor) {
      // Simple cursor implementation - encode the index
      startIndex = parseInt(Buffer.from(cursor, 'base64').toString(), 10) || 0
    }
    
    const paginatedResults = results.slice(startIndex, startIndex + limit)
    const hasMore = startIndex + limit < results.length
    
    return {
      results: paginatedResults,
      pagination: {
        hasMore,
        nextCursor: hasMore 
          ? Buffer.from((startIndex + limit).toString()).toString('base64')
          : undefined,
        totalResults: results.length
      }
    }
  }
}