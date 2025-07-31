import { BaseSearchStrategy } from './base'
import { SearchQuery, SearchResult, MatchType } from '../types'
import { neo4jService } from '@/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'

export class PatternSearchStrategy extends BaseSearchStrategy {
  name = 'pattern'
  
  async execute(query: SearchQuery): Promise<SearchResult[]> {
    // Detect pattern type from query
    const patternTypes = this.detectPatternTypes(query.text)
    
    if (patternTypes.length === 0) {
      return [] // No pattern indicators found
    }
    
    const results = await neo4jService.executeQuery(`
      // Find patterns matching the query
      MATCH (p:Pattern)
      WHERE p.type IN $patternTypes
        AND p.confidence > 0.7
        AND ${getOwnershipFilter({ 
          userId: query.context.userId, 
          workspaceId: query.context.workspaceId, 
          teamId: query.context.teamId,
          nodeAlias: 'p' 
        })}
      
      // Get entities associated with these patterns
      MATCH (p)-[:DERIVED_FROM|FOUND_IN]->(entity)
      WHERE (entity:Memory AND $includeMemories) OR 
            (entity:CodeEntity AND $includeCode)
      
      WITH p, entity, p.confidence as pattern_confidence
      
      // Get related entities
      OPTIONAL MATCH (entity)-[:REFERENCES_CODE|DISCUSSED_IN]-(related)
      WHERE (related:Memory OR related:CodeEntity)
      
      // Get session info for memories
      OPTIONAL MATCH (entity)-[:IN_SESSION]->(session:Session)
      WHERE entity:Memory
      
      // Get all patterns for this entity
      OPTIONAL MATCH (other_pattern:Pattern)-[:DERIVED_FROM|FOUND_IN]->(entity)
      WHERE other_pattern.id <> p.id
      
      RETURN 
        entity,
        p as main_pattern,
        pattern_confidence as score,
        labels(entity) as entityType,
        collect(DISTINCT related) as relatedEntities,
        collect(DISTINCT other_pattern) as otherPatterns,
        session
      ORDER BY score DESC
      LIMIT $limit
    `, {
      patternTypes,
      includeMemories: query.filters?.includeMemories !== false,
      includeCode: query.filters?.includeCode !== false,
      limit: query.limit || 50,
      ...getOwnershipParams({ 
        userId: query.context.userId, 
        workspaceId: query.context.workspaceId,
        teamId: query.context.teamId 
      })
    })
    
    return this.transformResults(results, query)
  }
  
  private detectPatternTypes(queryText: string): string[] {
    const lowerQuery = queryText.toLowerCase()
    const patterns: string[] = []
    
    // Debugging patterns
    if (lowerQuery.includes('debug') || lowerQuery.includes('bug') || 
        lowerQuery.includes('fix') || lowerQuery.includes('error') ||
        lowerQuery.includes('issue') || lowerQuery.includes('problem')) {
      patterns.push('debugging')
    }
    
    // Learning patterns
    if (lowerQuery.includes('learn') || lowerQuery.includes('research') ||
        lowerQuery.includes('study') || lowerQuery.includes('understand') ||
        lowerQuery.includes('explore') || lowerQuery.includes('tutorial')) {
      patterns.push('learning')
    }
    
    // Problem solving patterns
    if (lowerQuery.includes('solve') || lowerQuery.includes('solution') ||
        lowerQuery.includes('approach') || lowerQuery.includes('implement')) {
      patterns.push('problem_solving')
    }
    
    // Documentation patterns
    if (lowerQuery.includes('document') || lowerQuery.includes('docs') ||
        lowerQuery.includes('readme') || lowerQuery.includes('guide')) {
      patterns.push('documentation')
    }
    
    // Review patterns
    if (lowerQuery.includes('review') || lowerQuery.includes('feedback') ||
        lowerQuery.includes('pr') || lowerQuery.includes('pull request')) {
      patterns.push('review')
    }
    
    // If query explicitly mentions patterns or sessions
    if (lowerQuery.includes('pattern') || lowerQuery.includes('session')) {
      // Return all pattern types if not specific
      if (patterns.length === 0) {
        patterns.push('debugging', 'learning', 'problem_solving', 'documentation', 'review')
      }
    }
    
    return patterns
  }
  
  private transformResults(neo4jResults: any, query: SearchQuery): SearchResult[] {
    const searchTerms = this.getSearchTerms(query.text)
    
    return neo4jResults.records.map((record: any) => {
      const entity = record.entity
      const mainPattern = record.main_pattern
      const score = record.score
      const entityType = record.entityType
      const relatedEntities = record.relatedEntities || []
      const otherPatterns = record.otherPatterns || []
      const session = record.session
      
      const isMemory = entityType && entityType.includes('Memory')
      const isCode = entityType && entityType.includes('CodeEntity')
      
      // Handle entity properties
      const entityProps = entity.properties || entity
      
      // Generate highlights
      const highlights = []
      
      // Add pattern context as highlight if pattern exists
      if (mainPattern) {
        const patternProps = mainPattern.properties || mainPattern
        highlights.push(`Part of <mark>${patternProps.type}</mark> pattern (${Math.round((patternProps.confidence || 0) * 100)}% confidence)`)
      }
      
      if (entityProps.content) {
        const snippet = this.generateSnippet(entityProps.content, searchTerms)
        highlights.push(this.highlightTerms(snippet, searchTerms))
      }
      
      // Build relationships
      const allPatterns = mainPattern ? [mainPattern, ...otherPatterns].map((p: any) => {
        const props = p.properties || p
        return {
          id: props.id,
          type: props.type,
          confidence: props.confidence,
          name: props.name || props.type
        }
      }) : []
      
      const relationships = {
        memories: relatedEntities
          .filter((e: any) => e.labels && e.labels.includes('Memory'))
          .map((m: any) => {
            const props = m.properties || m
            return {
              id: props.id,
              snippet: props.content?.substring(0, 100) + '...',
              occurred_at: props.occurred_at,
              relationship_type: 'pattern'
            }
          }),
        code: relatedEntities
          .filter((e: any) => e.labels && e.labels.includes('CodeEntity'))
          .map((c: any) => {
            const props = c.properties || c
            return {
              id: props.id,
              path: props.path,
              snippet: props.content?.substring(0, 100) + '...',
              language: props.language,
              relationship_type: 'pattern'
            }
          }),
        patterns: allPatterns
      }
      
      return {
        entity: entityProps,
        score,
        matchType: 'pattern' as MatchType,
        highlights: this.deduplicateHighlights(highlights),
        relationships
      }
    })
  }
}