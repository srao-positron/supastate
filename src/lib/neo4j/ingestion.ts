import OpenAI from 'openai'
import { executeQuery, writeTransaction } from './client'
import { MemoryNode, CodeEntityNode, MemoryRelationType } from './types'
import { neo4jService } from './service'
import { relationshipInferenceEngine } from './relationship-inference'
import { log } from '@/lib/logger'

export class IngestionService {
  private openai: OpenAI | null = null

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required')
      }
      this.openai = new OpenAI({ apiKey })
    }
    return this.openai
  }
  /**
   * Ingest a memory into Neo4j with embeddings and relationships
   */
  async ingestMemory(memory: {
    id?: string
    content: string
    project_name: string
    user_id?: string
    team_id?: string
    type?: string
    metadata?: Record<string, any>
    chunk_id?: string
    session_id?: string
    file_paths?: string[]
    topics?: string[]
    entities_mentioned?: string[]
    tools_used?: string[]
  }, options: {
    useInferenceEngine?: boolean
    inferEvolution?: boolean
  } = {}): Promise<MemoryNode> {
    log.info('Processing memory for ingestion', {
      projectName: memory.project_name,
      hasUserId: !!memory.user_id,
      hasTeamId: !!memory.team_id,
      type: memory.type
    })
    
    // 1. Generate embedding for the memory content
    const embedding = await this.generateEmbedding(memory.content)
    
    // 2. Create memory node in Neo4j
    const memoryNode = await this.createMemoryNode({
      ...memory,
      id: memory.id || crypto.randomUUID(),
      embedding,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    
    // 3. Infer and create relationships
    await this.inferMemoryRelationships(memoryNode)
    
    // 4. Create project relationship
    await this.ensureProjectExists(memory.project_name)
    await this.createProjectRelationship(memoryNode.id, memory.project_name)
    
    // 5. Create user relationship if user_id provided
    if (memory.user_id) {
      await this.createUserRelationship(memory.user_id, memoryNode.id)
    }
    
    // 6. Use inference engine if enabled
    if (options.useInferenceEngine) {
      log.debug('Running relationship inference', { memoryId: memoryNode.id })
      try {
        const inferenceResult = await relationshipInferenceEngine.inferMemoryCodeRelationships(memoryNode.id)
        log.info('Relationship inference completed', {
          memoryId: memoryNode.id,
          relationshipsCreated: inferenceResult.relationshipsCreated
        })
        
        if (options.inferEvolution) {
          const evolutionResult = await relationshipInferenceEngine.inferMemoryEvolution(memoryNode.id)
          log.info('Evolution inference completed', {
            memoryId: memoryNode.id,
            relationshipsCreated: evolutionResult.relationshipsCreated
          })
        }
      } catch (error) {
        log.error('Relationship inference failed', error, { memoryId: memoryNode.id })
        // Don't fail the whole ingestion if inference fails
      }
    }
    
    log.info('Memory ingested successfully', { memoryId: memoryNode.id })
    return memoryNode
  }

  /**
   * Ingest a memory with pre-computed embeddings (for migration)
   */
  async ingestMemoryWithEmbedding(memory: {
    id?: string
    content: string
    embedding: number[]
    project_name: string
    user_id?: string
    team_id?: string
    type?: string
    metadata?: Record<string, any>
    chunk_id?: string
    session_id?: string
    file_paths?: string[]
    topics?: string[]
    entities_mentioned?: string[]
    tools_used?: string[]
    created_at?: string
    occurred_at?: string
  }, options: {
    useInferenceEngine?: boolean
    inferEvolution?: boolean
  } = {}): Promise<MemoryNode> {
    log.info('Processing memory with pre-computed embedding', {
      projectName: memory.project_name,
      embeddingSize: memory.embedding.length
    })
    
    // 1. Create memory node in Neo4j with provided embedding
    const memoryNode = await this.createMemoryNode({
      ...memory,
      id: memory.id || crypto.randomUUID(),
      embedding: memory.embedding,
      created_at: memory.created_at || new Date().toISOString(),
      occurred_at: memory.occurred_at || memory.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    
    // 2. Infer and create relationships
    await this.inferMemoryRelationships(memoryNode)
    
    // 3. Create project relationship
    await this.ensureProjectExists(memory.project_name)
    await this.createProjectRelationship(memoryNode.id, memory.project_name)
    
    // 4. Create user relationship if user_id provided
    if (memory.user_id) {
      await this.createUserRelationship(memory.user_id, memoryNode.id)
    }
    
    // 5. Use inference engine if enabled
    if (options.useInferenceEngine) {
      try {
        await relationshipInferenceEngine.inferMemoryCodeRelationships(memoryNode.id)
        
        if (options.inferEvolution) {
          await relationshipInferenceEngine.inferMemoryEvolution(memoryNode.id)
        }
      } catch (error) {
        log.error('Relationship inference failed', error, { memoryId: memoryNode.id })
        // Don't fail the whole ingestion if inference fails
      }
    }
    
    log.info('Memory with pre-computed embedding ingested successfully', { memoryId: memoryNode.id })
    return memoryNode
  }

  /**
   * Generate embedding using OpenAI
   */
  protected async generateEmbedding(text: string): Promise<number[]> {
    try {
      const openai = this.getOpenAI()
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 3072
      })
      return response.data[0].embedding
    } catch (error) {
      log.error('Embedding generation failed', error)
      throw error
    }
  }

  /**
   * Create memory node in Neo4j
   */
  private async createMemoryNode(data: Partial<MemoryNode> & { 
    id: string, 
    content: string, 
    embedding: number[],
    chunk_id?: string
  }): Promise<MemoryNode> {
    const query = `
      MERGE (m:Memory {id: $id})
      ON CREATE SET 
        m.content = $content,
        m.embedding = $embedding,
        m.project_name = $project_name,
        m.user_id = $user_id,
        m.team_id = $team_id,
        m.type = $type,
        m.chunk_id = $chunk_id,
        m.created_at = $created_at,
        m.occurred_at = $occurred_at,
        m.updated_at = $updated_at,
        m.metadata = $metadata
      ON MATCH SET
        m.content = $content,
        m.embedding = $embedding,
        m.project_name = $project_name,
        m.user_id = $user_id,
        m.team_id = $team_id,
        m.type = $type,
        m.chunk_id = $chunk_id,
        m.occurred_at = $occurred_at,
        m.updated_at = $updated_at,
        m.metadata = $metadata
      RETURN m
    `
    
    const params = {
      id: data.id,
      content: data.content,
      embedding: data.embedding,
      project_name: data.project_name,
      user_id: data.user_id || null,
      team_id: data.team_id || null,
      type: data.type || 'general',
      chunk_id: data.chunk_id || null,
      created_at: data.created_at,
      occurred_at: (data as any).occurred_at || data.created_at,
      updated_at: data.updated_at,
      metadata: JSON.stringify(data.metadata || {})
    }

    log.debug('Creating memory node', {
      id: params.id,
      projectName: params.project_name,
      embeddingDimensions: params.embedding.length,
      contentPreview: params.content.substring(0, 50) + '...'
    })

    const result = await executeQuery(query, params)
    
    if (!result.records.length) {
      throw new Error('Failed to create memory node')
    }
    
    // Extract the node properties from the Neo4j result
    const record = result.records[0]
    const node = record.m
    
    return {
      id: node.id,
      content: node.content,
      embedding: node.embedding,
      project_name: node.project_name,
      user_id: node.user_id,
      team_id: node.team_id,
      type: node.type,
      chunk_id: node.chunk_id,
      created_at: node.created_at,
      occurred_at: node.occurred_at,
      updated_at: node.updated_at,
      metadata: node.metadata ? JSON.parse(node.metadata) : {}
    } as MemoryNode
  }

  /**
   * Infer relationships between this memory and existing code/memories
   */
  private async inferMemoryRelationships(memory: MemoryNode): Promise<void> {
    // 1. Find similar memories to establish PRECEDED_BY relationships
    await this.findAndLinkPrecedingMemories(memory)
    
    // 2. Find related code entities based on content analysis
    await this.findAndLinkRelatedCode(memory)
    
    // 3. Detect if this is a debugging session
    if (this.isDebuggingMemory(memory.content)) {
      await this.createDebugSession(memory)
    }
    
    // 4. Extract and link concepts
    await this.extractAndLinkConcepts(memory)
  }

  /**
   * Find memories that this one might be preceded by
   */
  private async findAndLinkPrecedingMemories(memory: MemoryNode): Promise<void> {
    try {
      // Find recent memories from the same project
      const query = `
        MATCH (prev:Memory)
        WHERE prev.project_name = $project_name
          AND prev.id <> $id
          AND datetime(prev.created_at) < datetime($created_at)
          AND datetime(prev.created_at) > datetime($created_at) - duration({hours: 24})
        WITH prev
        ORDER BY prev.created_at DESC
        LIMIT 5
        
        // Create PRECEDED_BY relationship
        MATCH (current:Memory {id: $id})
        CREATE (current)-[r:PRECEDED_BY {
          time_gap_minutes: duration.between(datetime(prev.created_at), datetime($created_at)).minutes,
          created_at: datetime()
        }]->(prev)
        RETURN count(r) as relationships_created
      `
      
      const result = await executeQuery(query, {
        id: memory.id,
        project_name: memory.project_name,
        created_at: memory.created_at
      })
      
      log.debug('Created PRECEDED_BY relationships', {
        count: result.records[0]?.relationships_created || 0
      })
    } catch (error) {
      log.error('Error creating PRECEDED_BY relationships', error)
      // Don't fail the whole ingestion if this fails
    }
  }

  /**
   * Find and link related code based on memory content
   */
  private async findAndLinkRelatedCode(memory: MemoryNode): Promise<void> {
    // Extract potential code references from content
    const codeReferences = this.extractCodeReferences(memory.content)
    
    for (const ref of codeReferences) {
      const query = `
        MATCH (m:Memory {id: $memoryId})
        MATCH (c:CodeEntity)
        WHERE c.name = $codeName 
          OR c.file_path CONTAINS $codeName
          OR c.project_name = $projectName AND c.name CONTAINS $codeName
        WITH m, c
        LIMIT 1
        MERGE (m)-[r:DISCUSSES]->(c)
        SET r.confidence = 0.8,
            r.created_at = datetime()
        RETURN r
      `
      
      await executeQuery(query, {
        memoryId: memory.id,
        codeName: ref,
        projectName: memory.project_name
      })
    }
  }

  /**
   * Extract code entity references from memory content
   */
  private extractCodeReferences(content: string): string[] {
    const references: string[] = []
    
    // Function/class names (CamelCase or snake_case)
    const codePattern = /\b([A-Z][a-zA-Z0-9]*|[a-z_]+[a-z0-9_]*)\b/g
    const matches = content.match(codePattern) || []
    
    // Filter to likely code references
    const codeKeywords = ['function', 'class', 'method', 'component', 'service', 'controller']
    const relevantMatches = matches.filter(match => {
      // Check if preceded by code keywords
      const regex = new RegExp(`(${codeKeywords.join('|')})\\s+${match}`, 'i')
      return regex.test(content) || /[A-Z]/.test(match[0]) // Or is CamelCase
    })
    
    return [...new Set(relevantMatches)].slice(0, 10) // Limit to 10 references
  }

  /**
   * Check if this is a debugging memory
   */
  private isDebuggingMemory(content: string): boolean {
    const debugKeywords = [
      'error', 'bug', 'fix', 'debug', 'issue', 'problem', 
      'exception', 'crash', 'failed', 'broken', 'stack trace'
    ]
    const contentLower = content.toLowerCase()
    return debugKeywords.some(keyword => contentLower.includes(keyword))
  }

  /**
   * Create a debug session for debugging memories
   */
  private async createDebugSession(memory: MemoryNode): Promise<void> {
    const query = `
      CREATE (ds:DebugSession {
        id: randomUUID(),
        issue: substring($content, 0, 200),
        resolved: false,
        created_at: datetime()
      })
      WITH ds
      MATCH (m:Memory {id: $memoryId})
      CREATE (ds)-[:INCLUDES]->(m)
      RETURN ds
    `
    
    await executeQuery(query, {
      memoryId: memory.id,
      content: memory.content
    })
  }

  /**
   * Extract and link concepts from memory
   */
  private async extractAndLinkConcepts(memory: MemoryNode): Promise<void> {
    // Extract key concepts using simple keyword extraction
    // In a real implementation, this could use NLP or LLM
    const concepts = this.extractConcepts(memory.content)
    
    for (const concept of concepts) {
      const query = `
        MERGE (c:Concept {name: $concept})
        ON CREATE SET c.id = randomUUID(),
                      c.created_at = datetime()
        WITH c
        MATCH (m:Memory {id: $memoryId})
        MERGE (m)-[r:DISCUSSES]->(c)
        SET r.created_at = datetime()
        RETURN c
      `
      
      await executeQuery(query, {
        memoryId: memory.id,
        concept: concept
      })
    }
  }

  /**
   * Simple concept extraction (can be enhanced with NLP)
   */
  private extractConcepts(content: string): string[] {
    // Extract technical concepts
    const techPatterns = [
      /\b(authentication|authorization|caching|database|api|frontend|backend)\b/gi,
      /\b(react|vue|angular|node|python|typescript|javascript)\b/gi,
      /\b(performance|security|scalability|testing|deployment)\b/gi
    ]
    
    const concepts = new Set<string>()
    techPatterns.forEach(pattern => {
      const matches = content.match(pattern) || []
      matches.forEach(match => concepts.add(match.toLowerCase()))
    })
    
    return Array.from(concepts).slice(0, 5)
  }

  /**
   * Ensure project node exists
   */
  private async ensureProjectExists(projectName: string): Promise<void> {
    const query = `
      MERGE (p:Project {name: $projectName})
      ON CREATE SET p.id = randomUUID(),
                    p.total_memories = 0,
                    p.created_at = datetime()
      ON MATCH SET p.updated_at = datetime()
      RETURN p
    `
    
    await executeQuery(query, { projectName })
  }

  /**
   * Create relationship between memory and project
   */
  private async createProjectRelationship(memoryId: string, projectName: string): Promise<void> {
    const query = `
      MATCH (m:Memory {id: $memoryId})
      MATCH (p:Project {name: $projectName})
      MERGE (m)-[r:BELONGS_TO_PROJECT]->(p)
      SET r.created_at = datetime()
      WITH p
      SET p.total_memories = p.total_memories + 1
      RETURN p
    `
    
    await executeQuery(query, { memoryId, projectName })
  }

  /**
   * Create relationship between user and memory
   */
  private async createUserRelationship(userId: string, memoryId: string): Promise<void> {
    // First ensure user exists
    await executeQuery(`
      MERGE (u:User {id: $userId})
      ON CREATE SET u.created_at = datetime()
      RETURN u
    `, { userId })

    const query = `
      MATCH (u:User {id: $userId})
      MATCH (m:Memory {id: $memoryId})
      MERGE (u)-[r:CREATED]->(m)
      SET r.created_at = datetime()
      RETURN r
    `
    
    await executeQuery(query, { userId, memoryId })
  }

  /**
   * Batch ingest memories
   */
  async batchIngestMemories(memories: Array<Parameters<typeof this.ingestMemory>[0]>): Promise<void> {
    log.info('Starting batch memory ingestion', { totalMemories: memories.length })
    
    for (const memory of memories) {
      try {
        await this.ingestMemory(memory)
      } catch (error) {
        log.error('Failed to ingest memory in batch', error, {
          memoryIndex: memories.indexOf(memory),
          projectName: memory.project_name
        })
      }
    }
    
    log.info('Batch memory ingestion completed')
  }
}

export const ingestionService = new IngestionService()