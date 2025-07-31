import { BaseSearchStrategy } from './base'
import { SearchQuery, SearchResult, MatchType } from '../types'
import { neo4jService } from '@/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'

export class CodeLinkedSearchStrategy extends BaseSearchStrategy {
  name = 'code_linked'
  
  async execute(query: SearchQuery): Promise<SearchResult[]> {
    const searchTerms = this.getSearchTerms(query.text)
    const searchPattern = searchTerms.join('.*')
    
    const results = await neo4jService.executeQuery(`
      CALL {
        // Find memories that reference code matching the query
        MATCH (m:Memory)-[:REFERENCES_CODE]->(c:CodeEntity)
        WHERE (m.content =~ '(?i).*' + $searchPattern + '.*' OR 
               c.content =~ '(?i).*' + $searchPattern + '.*' OR
               c.path =~ '(?i).*' + $searchPattern + '.*')
          AND ${getOwnershipFilter({ 
            userId: query.context.userId, 
            workspaceId: query.context.workspaceId, 
            teamId: query.context.teamId,
            nodeAlias: 'm' 
          })}
        RETURN m, c, 0.85 as base_score
        
        UNION
        
        // Find code that's discussed in memories matching the query
        MATCH (c:CodeEntity)<-[:DISCUSSED_IN]-(m:Memory)
        WHERE (m.content =~ '(?i).*' + $searchPattern + '.*' OR 
               c.content =~ '(?i).*' + $searchPattern + '.*' OR
               c.path =~ '(?i).*' + $searchPattern + '.*')
          AND ${getOwnershipFilter({ 
            userId: query.context.userId, 
            workspaceId: query.context.workspaceId, 
            teamId: query.context.teamId,
            nodeAlias: 'c' 
          })}
        RETURN m, c, 0.85 as base_score
      }
      
      // Get unique memory-code pairs
      WITH DISTINCT m, c, base_score
      
      // Decide which entity to return based on filters
      WITH 
        CASE 
          WHEN $includeMemories AND NOT $includeCode THEN m
          WHEN $includeCode AND NOT $includeMemories THEN c
          ELSE m  // Default to memory if both are included
        END as primary_entity,
        CASE 
          WHEN $includeMemories AND NOT $includeCode THEN c
          WHEN $includeCode AND NOT $includeMemories THEN m
          ELSE c  // The linked entity
        END as linked_entity,
        base_score,
        m, c
      
      // Get additional relationships
      OPTIONAL MATCH (primary_entity)-[:REFERENCES_CODE|DISCUSSED_IN]-(other_related)
      WHERE other_related <> linked_entity AND (other_related:Memory OR other_related:CodeEntity)
      
      // Get patterns
      OPTIONAL MATCH (p:Pattern)-[:DERIVED_FROM|FOUND_IN]->(primary_entity)
      
      // Get session info for memories
      OPTIONAL MATCH (m)-[:IN_SESSION]->(session:Session)
      
      RETURN 
        primary_entity as entity,
        linked_entity,
        base_score as score,
        labels(primary_entity) as entityType,
        m, c,
        collect(DISTINCT other_related) as otherRelated,
        collect(DISTINCT p) as patterns,
        session
      ORDER BY score DESC
      LIMIT $limit
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
      const entity = record.get('entity')
      const linkedEntity = record.get('linked_entity')
      const score = record.get('score')
      const entityType = record.get('entityType')
      const memory = record.get('m')
      const code = record.get('c')
      const otherRelated = record.get('otherRelated')
      const patterns = record.get('patterns')
      const session = record.get('session')
      
      const isMemory = entityType.includes('Memory')
      const isCode = entityType.includes('CodeEntity')
      
      // Generate highlights
      const highlights = []
      
      // Add link context
      if (isMemory && code) {
        highlights.push(`References code: <mark>${code.properties.path || 'Code'}</mark>`)
      } else if (isCode && memory) {
        highlights.push(`Discussed in memory from <mark>${new Date(memory.properties.occurred_at).toLocaleDateString()}</mark>`)
      }
      
      if (entity.properties.content) {
        const snippet = this.generateSnippet(entity.properties.content, searchTerms)
        highlights.push(this.highlightTerms(snippet, searchTerms))
      }
      
      // Build relationships - ensure we include the primary linked item
      const relationships: {
        memories: any[],
        code: any[],
        patterns: any[]
      } = {
        memories: [],
        code: [],
        patterns: patterns.map((p: any) => ({
          id: p.properties.id,
          type: p.properties.type,
          confidence: p.properties.confidence,
          name: p.properties.name
        }))
      }
      
      // Add the linked entity as the primary relationship
      if (linkedEntity) {
        if (linkedEntity.labels.includes('Memory')) {
          relationships.memories.push({
            id: linkedEntity.properties.id,
            snippet: linkedEntity.properties.content?.substring(0, 100) + '...',
            occurred_at: linkedEntity.properties.occurred_at,
            relationship_type: isMemory ? 'REFERENCES_CODE' : 'DISCUSSED_IN'
          })
        } else if (linkedEntity.labels.includes('CodeEntity')) {
          relationships.code.push({
            id: linkedEntity.properties.id,
            path: linkedEntity.properties.path,
            snippet: linkedEntity.properties.content?.substring(0, 100) + '...',
            language: linkedEntity.properties.language,
            relationship_type: isCode ? 'DISCUSSED_IN' : 'REFERENCES_CODE'
          })
        }
      }
      
      // Add other related entities
      otherRelated.forEach((related: any) => {
        if (related.labels.includes('Memory')) {
          relationships.memories.push({
            id: related.properties.id,
            snippet: related.properties.content?.substring(0, 100) + '...',
            occurred_at: related.properties.occurred_at,
            relationship_type: 'related'
          })
        } else if (related.labels.includes('CodeEntity')) {
          relationships.code.push({
            id: related.properties.id,
            path: related.properties.path,
            snippet: related.properties.content?.substring(0, 100) + '...',
            language: related.properties.language,
            relationship_type: 'related'
          })
        }
      })
      
      return {
        entity: entity.properties,
        score,
        matchType: 'relationship' as MatchType,
        highlights: this.deduplicateHighlights(highlights),
        relationships
      }
    })
  }
}