import { 
  executeQuery, 
  readTransaction, 
  writeTransaction,
  verifyConnectivity 
} from './client'
import {
  MemoryNode,
  CodeEntityNode,
  ProjectNode,
  InsightNode,
  VectorSearchOptions,
  GraphSearchOptions,
  HybridSearchOptions,
  SearchResult,
  KnowledgeGraph
} from './types'

export class Neo4jService {
  // Initialize connection
  async initialize(): Promise<void> {
    await verifyConnectivity()
    console.log('Neo4j service initialized')
  }

  // ============= VECTOR OPERATIONS =============

  /**
   * Search for similar memories using vector similarity
   * Leverages Neo4j's HNSW index for efficient 3072-dim vector search
   */
  async searchMemoriesByVector(options: VectorSearchOptions): Promise<SearchResult<MemoryNode>[]> {
    const { 
      embedding, 
      limit = 20, 
      threshold = 0.7,
      projectFilter,
      userFilter,
      teamFilter 
    } = options

    const query = `
      CALL db.index.vector.queryNodes('memory_embeddings', $limit, $embedding)
      YIELD node as memory, score
      WHERE score > $threshold
        ${projectFilter ? 'AND memory.project_name = $projectFilter' : ''}
        ${userFilter ? 'AND memory.user_id = $userFilter' : ''}
        ${teamFilter ? 'AND memory.team_id = $teamFilter' : ''}
      RETURN memory, score
      ORDER BY score DESC
    `

    const result = await executeQuery(query, {
      embedding,
      limit,
      threshold,
      projectFilter,
      userFilter,
      teamFilter
    })

    return result.records.map(record => {
      const memory = record.memory
      return {
        node: {
          id: memory.properties?.id || memory.id,
          content: memory.properties?.content || memory.content,
          embedding: memory.properties?.embedding || memory.embedding,
          project_name: memory.properties?.project_name || memory.project_name,
          user_id: memory.properties?.user_id || memory.user_id,
          team_id: memory.properties?.team_id || memory.team_id,
          type: memory.properties?.type || memory.type,
          created_at: memory.properties?.created_at || memory.created_at,
          updated_at: memory.properties?.updated_at || memory.updated_at,
          metadata: memory.properties?.metadata ? JSON.parse(memory.properties.metadata) : memory.metadata
        } as MemoryNode,
        score: record.score
      }
    })
  }

  /**
   * Search for similar code entities using vector similarity
   */
  async searchCodeByVector(options: VectorSearchOptions): Promise<SearchResult<CodeEntityNode>[]> {
    const { embedding, limit = 20, threshold = 0.7, projectFilter } = options

    const query = `
      CALL db.index.vector.queryNodes('code_embeddings', $limit, $embedding)
      YIELD node as code, score
      WHERE score > $threshold
        ${projectFilter ? 'AND code.project_name = $projectFilter' : ''}
      RETURN code, score
      ORDER BY score DESC
    `

    const result = await executeQuery(query, {
      embedding,
      limit,
      threshold,
      projectFilter
    })

    return result.records.map(record => {
      const code = record.code
      return {
        node: {
          id: code.properties?.id || code.id,
          name: code.properties?.name || code.name,
          type: code.properties?.type || code.type,
          file_path: code.properties?.file_path || code.file_path,
          project_name: code.properties?.project_name || code.project_name,
          line_start: code.properties?.line_start || code.line_start,
          line_end: code.properties?.line_end || code.line_end,
          signature: code.properties?.signature || code.signature,
          visibility: code.properties?.visibility || code.visibility,
          is_exported: code.properties?.is_exported || code.is_exported,
          embedding: code.properties?.embedding || code.embedding,
          metadata: code.properties?.metadata ? JSON.parse(code.properties.metadata) : code.metadata,
          language: code.properties?.language || code.language || 'typescript'
        } as CodeEntityNode,
        score: record.score
      }
    })
  }

  // ============= GRAPH OPERATIONS =============

  /**
   * Find all nodes related to a starting node through specified relationships
   * This leverages Neo4j's native graph traversal capabilities
   */
  async findRelatedNodes(options: GraphSearchOptions): Promise<SearchResult<any>[]> {
    const { 
      startNodeId, 
      relationshipTypes, 
      maxDepth, 
      direction = 'BOTH' 
    } = options

    const directionClause = direction === 'BOTH' ? '-' : 
                           direction === 'OUTGOING' ? '->' : '<-'
    const relPattern = relationshipTypes.length > 0 ? 
      `:${relationshipTypes.join('|:')}` : ''

    const query = `
      MATCH path = (start {id: $startNodeId})${directionClause}[r${relPattern}*1..${maxDepth}]${directionClause}(end)
      RETURN DISTINCT end as node, 
             length(path) as distance,
             [rel in relationships(path) | type(rel)] as relationshipPath
      ORDER BY distance
      LIMIT 100
    `

    const result = await executeQuery(query, { startNodeId })

    return result.records.map(record => ({
      node: record.node,
      path: record.relationshipPath,
      score: 1 / (record.distance + 1) // Convert distance to score
    }))
  }

  /**
   * Find shortest path between two nodes
   * Useful for understanding how concepts are connected
   */
  async findPath(startId: string, endId: string, maxHops: number = 5): Promise<any> {
    const query = `
      MATCH path = shortestPath(
        (start {id: $startId})-[*..${maxHops}]-(end {id: $endId})
      )
      RETURN path,
             [node in nodes(path) | node.id] as nodeIds,
             [rel in relationships(path) | type(rel)] as relationships
    `

    const result = await executeQuery(query, { startId, endId })
    return result.records[0] || null
  }

  // ============= HYBRID OPERATIONS =============

  /**
   * Combine vector similarity with graph relationships
   * This is where Neo4j truly shines - finding similar content that's also related
   */
  async hybridSearch(options: HybridSearchOptions): Promise<SearchResult<any>[]> {
    const { embedding, filters, includeRelated } = options

    let query = `
      // Start with vector similarity if embedding provided
      ${embedding ? `
        CALL db.index.vector.queryNodes('memory_embeddings', 50, $embedding)
        YIELD node as memory, score
        WHERE score > ${filters.minSimilarity || 0.5}
      ` : 'MATCH (memory:Memory)'}
      
      // Apply filters
      ${filters.projectName ? 'WHERE memory.project_name = $projectName' : ''}
      ${filters.timeRange ? `
        AND datetime(memory.created_at) >= datetime($startTime)
        AND datetime(memory.created_at) <= datetime($endTime)
      ` : ''}
      
      // Include related nodes if requested
      ${includeRelated ? `
        OPTIONAL MATCH (memory)-[r:${includeRelated.types.join('|:')}*1..${includeRelated.maxDepth}]-(related)
        WITH memory, ${embedding ? 'score,' : ''} collect(DISTINCT related) as relatedNodes
      ` : ''}
      
      RETURN memory, 
             ${embedding ? 'score,' : '0.5 as score,'}
             ${includeRelated ? 'relatedNodes' : '[] as relatedNodes'}
      ORDER BY score DESC
      LIMIT 30
    `

    const params: any = {
      embedding,
      projectName: filters.projectName,
      startTime: filters.timeRange?.start.toISOString(),
      endTime: filters.timeRange?.end.toISOString()
    }

    const result = await executeQuery(query, params)

    return result.records.map(record => ({
      node: record.memory,
      score: record.score,
      relationships: record.relatedNodes
    }))
  }

  // ============= KNOWLEDGE EVOLUTION =============

  /**
   * Track how understanding of a concept evolved over time
   * This shows the learning journey from confusion to mastery
   */
  async trackKnowledgeEvolution(projectName: string, concept: string): Promise<any[]> {
    const query = `
      MATCH path = (early:Memory)-[:EVOLVED_INTO*]->(later:Memory)
      WHERE early.project_name = $projectName
        AND (early.content CONTAINS $concept OR later.content CONTAINS $concept)
        AND early.understanding_level < later.understanding_level
      RETURN path,
             early.understanding_level as startLevel,
             later.understanding_level as endLevel,
             later.understanding_level - early.understanding_level as improvement,
             [node in nodes(path) | {
               id: node.id,
               date: node.created_at,
               level: node.understanding_level,
               breakthroughs: node.breakthroughs
             }] as journey
      ORDER BY improvement DESC
      LIMIT 10
    `

    const result = await executeQuery(query, { projectName, concept })
    return result.records
  }

  // ============= TEAM INTELLIGENCE =============

  /**
   * Find knowledge gaps in the team
   * Identifies code that only one person understands
   */
  async findKnowledgeGaps(teamId: string): Promise<any[]> {
    const query = `
      MATCH (expert:User)-[:CREATED]->(m:Memory)-[:DISCUSSES]->(c:CodeEntity)
      WHERE expert.team_id = $teamId
      WITH c, expert, count(DISTINCT m) as expertKnowledge
      WHERE NOT EXISTS {
        MATCH (other:User)-[:CREATED]->(:Memory)-[:DISCUSSES]->(c)
        WHERE other.team_id = $teamId AND other.id <> expert.id
      }
      RETURN c.file_path as file,
             c.name as entity,
             expert.github_username as expert,
             expertKnowledge as knowledgeCount
      ORDER BY knowledgeCount DESC
      LIMIT 20
    `

    const result = await executeQuery(query, { teamId })
    return result.records
  }

  /**
   * Analyze team's collective intelligence on a project
   */
  async getTeamKnowledgeStats(teamId: string, projectName: string): Promise<any> {
    const query = `
      MATCH (u:User {team_id: $teamId})-[:CREATED]->(m:Memory {project_name: $projectName})
      WITH count(DISTINCT u) as contributors, count(m) as totalMemories
      
      MATCH (m:Memory {project_name: $projectName})-[:DISCUSSES]->(c:CodeEntity)
      WITH contributors, totalMemories, count(DISTINCT c) as coveredEntities
      
      MATCH (c:CodeEntity {project_name: $projectName})
      WITH contributors, totalMemories, coveredEntities, count(c) as totalEntities
      
      RETURN {
        contributors: contributors,
        totalMemories: totalMemories,
        codeCoverage: toFloat(coveredEntities) / toFloat(totalEntities),
        coveredEntities: coveredEntities,
        totalEntities: totalEntities
      } as stats
    `

    const result = await executeQuery(query, { teamId, projectName })
    return result.records[0]?.stats
  }

  // ============= PATTERN DETECTION =============

  /**
   * Find recurring debugging patterns
   * Identifies similar issues that keep appearing
   */
  async findRecurringPatterns(projectName: string, timeWindow: number = 30): Promise<any[]> {
    const query = `
      MATCH (m1:Memory {type: 'debugging', project_name: $projectName})
      WHERE datetime(m1.created_at) > datetime() - duration({days: $timeWindow})
      
      CALL db.index.vector.queryNodes('memory_embeddings', 10, m1.embedding)
      YIELD node as m2, score
      WHERE m2.id <> m1.id 
        AND m2.type = 'debugging'
        AND score > 0.8
        AND datetime(m2.created_at) < datetime(m1.created_at)
      
      WITH m1, collect({memory: m2, score: score}) as similar
      WHERE size(similar) >= 2
      
      RETURN m1.content as recentIssue,
             m1.created_at as occurredAt,
             [s in similar | {
               content: substring(s.memory.content, 0, 100),
               date: s.memory.created_at,
               similarity: s.score
             }] as previousOccurrences
      ORDER BY m1.created_at DESC
    `

    const result = await executeQuery(query, { projectName, timeWindow })
    return result.records
  }

  // ============= INSIGHT GENERATION =============

  /**
   * Generate insights from memory patterns
   * Uses graph patterns to identify important trends
   */
  async generateInsights(projectName: string): Promise<InsightNode[]> {
    // Find hotspots - code frequently discussed
    const hotspotQuery = `
      MATCH (m:Memory {project_name: $projectName})-[:DISCUSSES]->(c:CodeEntity)
      WHERE datetime(m.created_at) > datetime() - duration({days: 7})
      WITH c, collect(m) as memories
      WHERE size(memories) >= 3
      CREATE (i:Insight {
        id: randomUUID(),
        summary: "Frequent discussions about " + c.name,
        category: 'hotspot',
        confidence: toFloat(size(memories)) / 10.0,
        evidence: [m in memories | m.id],
        created_at: datetime()
      })
      MERGE (i)-[:APPLIES_TO]->(c)
      RETURN i
    `

    await executeQuery(hotspotQuery, { projectName })

    // Find knowledge transfer opportunities
    const knowledgeQuery = `
      MATCH (expert:User)-[:CREATED]->(m:Memory)-[:DISCUSSES]->(c:CodeEntity {project_name: $projectName})
      WITH c, expert, count(m) as expertise
      WHERE expertise >= 5
      MATCH (novice:User {team_id: expert.team_id})
      WHERE NOT EXISTS {
        (novice)-[:CREATED]->(:Memory)-[:DISCUSSES]->(c)
      }
      CREATE (i:Insight {
        id: randomUUID(),
        summary: expert.github_username + " could teach " + novice.github_username + " about " + c.name,
        category: 'knowledge_transfer',
        confidence: 0.8,
        evidence: [],
        created_at: datetime()
      })
      RETURN i
    `

    await executeQuery(knowledgeQuery, { projectName })

    // Return all recent insights
    const getInsightsQuery = `
      MATCH (i:Insight)
      WHERE datetime(i.created_at) > datetime() - duration({hours: 1})
      RETURN i
      ORDER BY i.created_at DESC
    `

    const result = await executeQuery(getInsightsQuery, {})
    return result.records.map(r => r.i as InsightNode)
  }

  // ============= KNOWLEDGE GRAPH RETRIEVAL =============

  /**
   * Get the full knowledge graph for visualization
   */
  async getKnowledgeGraph(userId: string, projectName?: string): Promise<KnowledgeGraph> {
    const query = `
      // Get user's memories and related nodes
      MATCH (u:User {id: $userId})
      OPTIONAL MATCH (u)-[:CREATED]->(m:Memory)
      ${projectName ? 'WHERE m.project_name = $projectName' : ''}
      
      // Get related code entities
      OPTIONAL MATCH (m)-[r1:DISCUSSES|MODIFIES|DEBUGS]->(c:CodeEntity)
      
      // Get code relationships
      OPTIONAL MATCH (c)-[r2:CALLS|IMPORTS|EXTENDS]->(c2:CodeEntity)
      WHERE c2.project_name = c.project_name
      
      // Collect everything
      WITH collect(DISTINCT m) as memories,
           collect(DISTINCT c) + collect(DISTINCT c2) as codeEntities,
           collect(DISTINCT {start: m.id, end: c.id, type: type(r1)}) as memoryCodeRels,
           collect(DISTINCT {start: c.id, end: c2.id, type: type(r2)}) as codeRels
      
      RETURN {
        memories: memories,
        codeEntities: codeEntities,
        relationships: memoryCodeRels + codeRels
      } as graph
    `

    const result = await executeQuery(query, { userId, projectName })
    const graphData = result.records[0]?.graph || { memories: [], codeEntities: [], relationships: [] }

    return {
      nodes: [...graphData.memories, ...graphData.codeEntities],
      relationships: graphData.relationships,
      stats: {
        totalNodes: graphData.memories.length + graphData.codeEntities.length,
        totalRelationships: graphData.relationships.length,
        nodeTypes: {
          memories: graphData.memories.length,
          codeEntities: graphData.codeEntities.length
        },
        relationshipTypes: {} // Would need another query to get counts by type
      }
    }
  }
}

// Export singleton instance
class ExtendedNeo4jService extends Neo4jService {
  // Expose executeQuery for advanced queries
  async executeQuery(query: string, params?: Record<string, any>): Promise<any> {
    return executeQuery(query, params)
  }
}

export const neo4jService = new ExtendedNeo4jService()