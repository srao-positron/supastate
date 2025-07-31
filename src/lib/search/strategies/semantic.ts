import { BaseSearchStrategy } from './base'
import { SearchQuery, SearchResult, MatchType } from '../types'
import { neo4jService } from '@/lib/neo4j/service'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'
import { generateEmbedding } from '@/lib/embeddings/generator'

export class SemanticSearchStrategy extends BaseSearchStrategy {
  name = 'semantic'
  
  async execute(query: SearchQuery): Promise<SearchResult[]> {
    try {
      // Generate embedding for the search query
      const queryEmbedding = await generateEmbedding(query.text)
      
      // Search both memories and code using vector similarity
      const results = await neo4jService.executeQuery(`
        // Search all EntitySummary nodes (which summarize both Memory and CodeEntity)
        MATCH (s:EntitySummary)
        WHERE s.embedding IS NOT NULL
          AND ${getOwnershipFilter({ 
            userId: query.context.userId, 
            workspaceId: query.context.workspaceId, 
            teamId: query.context.teamId,
            nodeAlias: 's' 
          })}
        WITH s, vector.similarity.cosine($embedding, s.embedding) as similarity
        WHERE similarity > 0.65
        
        // Get the actual entity (Memory or CodeEntity)
        MATCH (s)-[:SUMMARIZES]->(entity)
        WHERE (entity:Memory OR entity:CodeEntity)
        
        // Include only requested entity types based on filters
        WITH s, entity, similarity
        WHERE 
          (entity:Memory AND $includeMemories) OR 
          (entity:CodeEntity AND $includeCode)
        
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
          s.summary as summary,
          similarity,
          labels(entity) as entityType,
          collect(DISTINCT related) as relatedEntities,
          collect(DISTINCT p) as patterns,
          session
        ORDER BY similarity DESC
        LIMIT $limit
      `, {
        embedding: queryEmbedding,
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
    } catch (error) {
      console.error('Semantic search error:', error)
      // Fall back to keyword search if semantic search fails
      return this.fallbackKeywordSearch(query)
    }
  }
  
  private transformResults(neo4jResults: any, query: SearchQuery): SearchResult[] {
    const searchTerms = this.getSearchTerms(query.text)
    
    return neo4jResults.records.map((record: any) => {
      const entity = record.entity
      const summary = record.summary
      const similarity = record.similarity
      const entityType = record.entityType
      const relatedEntities = record.relatedEntities || []
      const patterns = record.patterns || []
      const session = record.session
      
      const isMemory = entityType && entityType.includes('Memory')
      const isCode = entityType && entityType.includes('CodeEntity')
      
      // Handle entity properties - could be entity.properties or direct properties
      const entityProps = entity.properties || entity
      
      // Generate title based on entity type
      let title = ''
      if (isMemory) {
        title = entityProps.project_name || 'Memory'
        if (entityProps.occurred_at) {
          const date = new Date(entityProps.occurred_at)
          title += ` - ${date.toLocaleDateString()}`
        }
      } else if (isCode) {
        title = entityProps.path || entityProps.name || 'Code'
      }
      
      // Generate highlight
      const content = entityProps.content || summary || ''
      const highlights: string[] = []
      
      if (content) {
        const snippet = this.generateSnippet(content, searchTerms)
        const highlightedSnippet = this.highlightTerms(snippet, searchTerms)
        highlights.push(highlightedSnippet)
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
              relationship_type: 'REFERENCES_CODE'
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
              relationship_type: 'DISCUSSED_IN'
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
        score: similarity,
        matchType: 'semantic' as MatchType,
        highlights: this.deduplicateHighlights(highlights),
        relationships
      }
    })
  }
  
  private async fallbackKeywordSearch(query: SearchQuery): Promise<SearchResult[]> {
    const searchTerms = this.getSearchTerms(query.text)
    const searchPattern = searchTerms.join('.*')
    
    const results = await neo4jService.executeQuery(`
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
        
        // Search code by content or path
        MATCH (c:CodeEntity)
        WHERE (c.content =~ '(?i).*' + $searchPattern + '.*' OR 
               c.path =~ '(?i).*' + $searchPattern + '.*')
          AND ${getOwnershipFilter({ 
            userId: query.context.userId, 
            workspaceId: query.context.workspaceId, 
            teamId: query.context.teamId,
            nodeAlias: 'c' 
          })}
          AND $includeCode
        RETURN c as entity, 0.7 as score
      }
      
      WITH entity, score
      ORDER BY score DESC
      LIMIT $limit
      
      // Get relationships
      OPTIONAL MATCH (entity)-[:REFERENCES_CODE|DISCUSSED_IN]-(related)
      WHERE (related:Memory OR related:CodeEntity)
      
      RETURN 
        entity,
        score,
        labels(entity) as entityType,
        collect(DISTINCT related) as relatedEntities
    `, {
      searchPattern,
      includeMemories: query.filters?.includeMemories !== false,
      includeCode: query.filters?.includeCode !== false,
      limit: parseInt(String(query.limit || 50), 10),
      ...getOwnershipParams({ 
        userId: query.context.userId, 
        workspaceId: query.context.workspaceId,
        teamId: query.context.teamId 
      })
    })
    
    return this.transformResults(results, query)
  }
}