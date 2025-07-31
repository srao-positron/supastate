import { BaseSearchStrategy } from './base'
import { SearchQuery, SearchResult, MatchType } from '../types'
import { neo4jService } from '@/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'

export class TemporalSearchStrategy extends BaseSearchStrategy {
  name = 'temporal'
  
  async execute(query: SearchQuery): Promise<SearchResult[]> {
    // Parse time context from query
    const timeWindow = this.parseTimeWindow(query.text)
    
    const results = await neo4jService.executeQuery(`
      // Search memories by time with recency scoring
      MATCH (m:Memory)
      WHERE m.occurred_at > datetime() - duration($duration)
        AND ${getOwnershipFilter({ 
          userId: query.context.userId, 
          workspaceId: query.context.workspaceId, 
          teamId: query.context.teamId,
          nodeAlias: 'm' 
        })}
        AND $includeMemories
      WITH m, 
        duration.between(m.occurred_at, datetime()).hours as hours_ago,
        1.0 / (1.0 + hours_ago * 0.01) as recency_score
      
      UNION
      
      // Search code by creation time
      MATCH (c:CodeEntity)
      WHERE c.created_at > datetime() - duration($duration)
        AND ${getOwnershipFilter({ 
          userId: query.context.userId, 
          workspaceId: query.context.workspaceId, 
          teamId: query.context.teamId,
          nodeAlias: 'c' 
        })}
        AND $includeCode
      WITH c as m,
        duration.between(c.created_at, datetime()).hours as hours_ago,
        1.0 / (1.0 + hours_ago * 0.01) as recency_score
      
      // Get additional context
      WITH m, recency_score, hours_ago
      ORDER BY recency_score DESC
      LIMIT $limit
      
      // Get relationships
      OPTIONAL MATCH (m)-[:REFERENCES_CODE|DISCUSSED_IN]-(related)
      WHERE (related:Memory OR related:CodeEntity)
      
      // Get patterns for memories
      OPTIONAL MATCH (p:Pattern)-[:DERIVED_FROM]->(m)
      WHERE m:Memory
      
      // Get session info for memories
      OPTIONAL MATCH (m)-[:IN_SESSION]->(session:Session)
      WHERE m:Memory
      
      RETURN 
        m as entity,
        recency_score as score,
        hours_ago,
        labels(m) as entityType,
        collect(DISTINCT related) as relatedEntities,
        collect(DISTINCT p) as patterns,
        session
      ORDER BY score DESC
    `, {
      duration: timeWindow,
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
  
  private parseTimeWindow(queryText: string): string {
    const lowerQuery = queryText.toLowerCase()
    
    // Check for specific time phrases
    if (lowerQuery.includes('today') || lowerQuery.includes('last 24 hours')) {
      return 'P1D' // 1 day
    } else if (lowerQuery.includes('yesterday')) {
      return 'P2D' // 2 days to include yesterday
    } else if (lowerQuery.includes('this week') || lowerQuery.includes('last week')) {
      return 'P7D' // 7 days
    } else if (lowerQuery.includes('this month') || lowerQuery.includes('last month')) {
      return 'P30D' // 30 days
    } else if (lowerQuery.includes('last hour')) {
      return 'PT1H' // 1 hour
    } else if (lowerQuery.includes('last') && lowerQuery.includes('hours')) {
      // Extract number of hours
      const match = lowerQuery.match(/last (\d+) hours?/)
      if (match) {
        return `PT${match[1]}H`
      }
    } else if (lowerQuery.includes('last') && lowerQuery.includes('days')) {
      // Extract number of days
      const match = lowerQuery.match(/last (\d+) days?/)
      if (match) {
        return `P${match[1]}D`
      }
    }
    
    // Default to last 7 days for temporal queries
    return 'P7D'
  }
  
  private transformResults(neo4jResults: any, query: SearchQuery): SearchResult[] {
    const searchTerms = this.getSearchTerms(query.text)
    
    return neo4jResults.records.map((record: any) => {
      const entity = record.get('entity')
      const score = record.get('score')
      const hoursAgo = record.get('hours_ago')
      const entityType = record.get('entityType')
      const relatedEntities = record.get('relatedEntities')
      const patterns = record.get('patterns')
      const session = record.get('session')
      
      const isMemory = entityType.includes('Memory')
      const isCode = entityType.includes('CodeEntity')
      
      // Generate highlights with time context
      const timeContext = this.formatTimeAgo(hoursAgo)
      const highlights = []
      
      if (entity.properties.content) {
        const snippet = this.generateSnippet(entity.properties.content, searchTerms)
        highlights.push(this.highlightTerms(snippet, searchTerms))
      }
      
      // Add time context as a highlight
      highlights.push(`<mark>${timeContext}</mark>`)
      
      // Build relationships
      const relationships = {
        memories: relatedEntities
          .filter((e: any) => e.labels.includes('Memory'))
          .map((m: any) => ({
            id: m.properties.id,
            snippet: m.properties.content?.substring(0, 100) + '...',
            occurred_at: m.properties.occurred_at,
            relationship_type: 'temporal'
          })),
        code: relatedEntities
          .filter((e: any) => e.labels.includes('CodeEntity'))
          .map((c: any) => ({
            id: c.properties.id,
            path: c.properties.path,
            snippet: c.properties.content?.substring(0, 100) + '...',
            language: c.properties.language,
            relationship_type: 'temporal'
          })),
        patterns: patterns.map((p: any) => ({
          id: p.properties.id,
          type: p.properties.type,
          confidence: p.properties.confidence,
          name: p.properties.name
        }))
      }
      
      return {
        entity: entity.properties,
        score,
        matchType: 'keyword' as MatchType, // Temporal search is keyword-based
        highlights: this.deduplicateHighlights(highlights),
        relationships
      }
    })
  }
  
  private formatTimeAgo(hours: number): string {
    if (hours < 1) {
      const minutes = Math.round(hours * 60)
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
    } else if (hours < 24) {
      const h = Math.round(hours)
      return `${h} hour${h !== 1 ? 's' : ''} ago`
    } else if (hours < 168) { // Less than a week
      const days = Math.round(hours / 24)
      return `${days} day${days !== 1 ? 's' : ''} ago`
    } else if (hours < 720) { // Less than a month
      const weeks = Math.round(hours / 168)
      return `${weeks} week${weeks !== 1 ? 's' : ''} ago`
    } else {
      const months = Math.round(hours / 720)
      return `${months} month${months !== 1 ? 's' : ''} ago`
    }
  }
}