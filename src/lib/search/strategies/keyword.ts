import { BaseSearchStrategy } from './base'
import { SearchQuery, SearchResult, MatchType } from '../types'
import { neo4jService } from '@/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'

export class KeywordSearchStrategy extends BaseSearchStrategy {
  name = 'keyword'
  
  async execute(query: SearchQuery): Promise<SearchResult[]> {
    const searchTerms = this.getSearchTerms(query.text)
    const searchPattern = searchTerms.join('.*')
    
    const results = await neo4jService.executeQuery(`
      // Combine memory and code search
      CALL {
        // Search memories by content
        MATCH (m:Memory)
        WHERE m.content =~ '(?i).*' + $searchPattern + '.*'
          AND ${getOwnershipFilter({ 
            userId: query.context.userId, 
            workspaceId: query.context.workspaceId, 
            teamId: query.context.teamId,
            nodeAlias: 'm' 
          })}
          AND $includeMemories
        RETURN m as entity, 0.7 as score
        
        UNION
        
        // Search code by content, path, or name
        MATCH (c:CodeEntity)
        WHERE (c.content =~ '(?i).*' + $searchPattern + '.*' OR 
               c.path =~ '(?i).*' + $searchPattern + '.*' OR
               c.name =~ '(?i).*' + $searchPattern + '.*')
          AND ${getOwnershipFilter({ 
            userId: query.context.userId, 
            workspaceId: query.context.workspaceId, 
            teamId: query.context.teamId,
            nodeAlias: 'c' 
          })}
          AND $includeCode
        WITH c, 
          CASE 
            WHEN c.path =~ '(?i).*' + $searchPattern + '.*' THEN 0.8
            WHEN c.name =~ '(?i).*' + $searchPattern + '.*' THEN 0.75
            ELSE 0.7
          END as score
        RETURN c as entity, score
      }
      
      // Get additional context
      WITH entity, score
      ORDER BY score DESC
      LIMIT $limit
      
      // Get relationships
      OPTIONAL MATCH (entity)-[:REFERENCES_CODE|DISCUSSED_IN]-(related)
      WHERE (related:Memory OR related:CodeEntity)
      
      // Get patterns for memories
      OPTIONAL MATCH (p:Pattern)-[:DERIVED_FROM]->(entity)
      WHERE entity:Memory
      
      // Get session info for memories
      OPTIONAL MATCH (entity)-[:IN_SESSION]->(session:Session)
      WHERE entity:Memory
      
      RETURN 
        entity,
        score,
        labels(entity) as entityType,
        collect(DISTINCT related) as relatedEntities,
        collect(DISTINCT p) as patterns,
        session
      ORDER BY score DESC
    `, {
      searchPattern,
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
  
  private transformResults(neo4jResults: any, query: SearchQuery): SearchResult[] {
    const searchTerms = this.getSearchTerms(query.text)
    
    return neo4jResults.records.map((record: any) => {
      const entity = record.entity
      const score = record.score
      const entityType = record.entityType
      const relatedEntities = record.relatedEntities || []
      const patterns = record.patterns || []
      const session = record.session
      
      const isMemory = entityType && entityType.includes('Memory')
      const isCode = entityType && entityType.includes('CodeEntity')
      
      // Handle entity properties - could be entity.properties or direct properties
      const entityProps = entity.properties || entity
      
      // Generate highlight
      const highlights: string[] = []
      
      if (entityProps.content) {
        const snippet = this.generateSnippet(entityProps.content, searchTerms)
        highlights.push(this.highlightTerms(snippet, searchTerms))
      }
      
      // For code, also highlight path matches
      if (isCode && entityProps.path) {
        const pathMatch = searchTerms.some(term => 
          entityProps.path.toLowerCase().includes(term.toLowerCase())
        )
        if (pathMatch) {
          highlights.unshift(`Path: <mark>${entityProps.path}</mark>`)
        }
      }
      
      // Build relationships
      const relationships = {
        memories: relatedEntities
          .filter((e: any) => e.labels && e.labels.includes('Memory'))
          .map((m: any) => {
            const props = m.properties || m
            return {
              id: props.id,
              snippet: props.content?.substring(0, 100) + '...',
              occurred_at: props.occurred_at,
              relationship_type: 'keyword'
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
              relationship_type: 'keyword'
            }
          }),
        patterns: patterns.map((p: any) => {
          const props = p.properties || p
          return {
            id: props.id,
            type: props.type,
            confidence: props.confidence,
            name: props.name
          }
        })
      }
      
      return {
        entity: entityProps,
        score,
        matchType: 'keyword' as MatchType,
        highlights: this.deduplicateHighlights(highlights),
        relationships
      }
    })
  }
}