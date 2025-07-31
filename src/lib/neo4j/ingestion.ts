import neo4j from 'neo4j-driver'
import { executeQuery, writeTransaction } from './client'
import { MemoryNode, CodeEntityNode, MemoryRelationType } from './types'
import { neo4jService } from './service'
import { relationshipInferenceEngine } from './relationship-inference'
import { log } from '@/lib/logger'
import { embeddingsService } from '@/lib/embeddings/service'
import { generateContextAwareEmbedding } from './pattern-discovery/detectors/sequence-aware-detector'

/**
 * Ingest a memory into Neo4j with embeddings and relationships
 */
export async function ingestMemory(memory: {
    id?: string
    content: string
    project_name: string
    user_id?: string
    team_id?: string
    workspace_id?: string
    type?: string
    metadata?: Record<string, any>
    chunk_id?: string
    session_id?: string
    file_paths?: string[]
    topics?: string[]
    entities_mentioned?: string[]
    tools_used?: string[]
    occurred_at?: string
  }, options: {
    useInferenceEngine?: boolean
    inferEvolution?: boolean
  } = {}): Promise<MemoryNode> {
    log.info('Processing memory for ingestion', {
      projectName: memory.project_name,
      hasUserId: !!memory.user_id,
      hasTeamId: !!memory.team_id,
      userId: memory.user_id,
      teamId: memory.team_id,
      workspaceId: memory.workspace_id,
      type: memory.type,
      hasOccurredAt: !!memory.occurred_at,
      occurredAt: memory.occurred_at,
      contentPreview: memory.content.substring(0, 100) + '...'
    })
    
    // 1. Generate embedding for the memory content
    log.info('Generating embedding for memory', {
      contentLength: memory.content.length,
      hasChunkContext: !!(memory.chunk_id && memory.session_id),
      contentPreview: memory.content.substring(0, 50) + '...'
    })
    const embedding = await generateEmbedding(memory.content, {
      chunk_id: memory.chunk_id,
      session_id: memory.session_id
    })
    log.info('Embedding generated successfully', {
      dimensions: embedding.length
    })
    
    // 2. Create memory node in Neo4j
    const memoryNode = await createMemoryNode({
      ...memory,
      id: memory.id || crypto.randomUUID(),
      embedding,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      occurred_at: memory.occurred_at,
      workspace_id: memory.workspace_id
    })
    
    // 3. Infer and create relationships
    await inferMemoryRelationships(memoryNode)
    
    // 4. Create project relationship
    await ensureProjectExists(memory.project_name)
    await createProjectRelationship(memoryNode.id, memory.project_name)
    
    // 5. Create user relationship if user_id provided
    if (memory.user_id) {
      await createUserRelationship(memory.user_id, memoryNode.id)
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
export async function ingestMemoryWithEmbedding(memory: {
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
    const memoryNode = await createMemoryNode({
      ...memory,
      id: memory.id || crypto.randomUUID(),
      embedding: memory.embedding,
      created_at: memory.created_at || new Date().toISOString(),
      occurred_at: memory.occurred_at || memory.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    
    // 2. Infer and create relationships
    await inferMemoryRelationships(memoryNode)
    
    // 3. Create project relationship
    await ensureProjectExists(memory.project_name)
    await createProjectRelationship(memoryNode.id, memory.project_name)
    
    // 4. Create user relationship if user_id provided
    if (memory.user_id) {
      await createUserRelationship(memory.user_id, memoryNode.id)
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
   * Generate embedding with context awareness
   */
async function generateEmbedding(
    text: string, 
    context?: { chunk_id?: string, session_id?: string }
  ): Promise<number[]> {
    try {
      if (context?.chunk_id && context?.session_id) {
        // Use context-aware embedding for better semantic representation
        return generateContextAwareEmbedding({ content: text, ...context })
      }
      // Fall back to standard embedding
      return embeddingsService.generateEmbedding(text)
    } catch (error) {
      log.error('Embedding generation failed', error)
      throw error
    }
  }

  /**
   * Generate content hash for memory deduplication
   */
async function generateMemoryContentHash(memory: {
    content: string,
    project_name: string,
    occurred_at?: string
  }): Promise<string> {
    // Normalize content for consistent hashing
    const normalized = JSON.stringify({
      // Remove extra whitespace and normalize line endings
      content: memory.content.replace(/\s+/g, ' ').trim(),
      project_name: memory.project_name,
      // Include occurred_at to distinguish same content at different times
      occurred_at: memory.occurred_at ? new Date(memory.occurred_at).toISOString().split('T')[0] : 'unknown'
    })
    
    // Use Web Crypto API for browser compatibility
    const encoder = new TextEncoder()
    const data = encoder.encode(normalized)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex
  }

  /**
   * Create memory node in Neo4j
   */
async function createMemoryNode(data: Partial<MemoryNode> & { 
    id: string, 
    content: string, 
    embedding: number[],
    chunk_id?: string
  }): Promise<MemoryNode> {
    // Generate content hash for deduplication
    const contentHash = await generateMemoryContentHash({
      content: data.content,
      project_name: data.project_name!,
      occurred_at: data.occurred_at
    })
    
    log.info('Generated content hash for deduplication', {
      contentHash,
      projectName: data.project_name,
      occurredAt: data.occurred_at
    })
    
    // First check if memory with this hash already exists
    const existingQuery = `
      MATCH (m:Memory {content_hash: $contentHash})
      RETURN m
    `
    
    const existingResult = await executeQuery(existingQuery, { contentHash })
    
    if (existingResult.records.length > 0) {
      // Memory with same content already exists
      const existingRecord = existingResult.records[0]
      const existingMemory = existingRecord.m
      log.info('Found existing memory with same content hash', {
        existingId: existingMemory.id,
        newId: data.id,
        contentHash,
        existingWorkspaceId: existingMemory.workspace_id,
        existingUserId: existingMemory.user_id,
        existingOccurredAt: existingMemory.occurred_at,
        newWorkspaceId: data.workspace_id,
        newUserId: data.user_id,
        newOccurredAt: data.occurred_at
      })
      
      // Update the existing memory with new metadata if needed
      const updateQuery = `
        MATCH (m:Memory {content_hash: $contentHash})
        SET m.updated_at = $updated_at,
            m.chunk_id = COALESCE(m.chunk_id, $chunk_id)
        RETURN m {
          .id, .content, .embedding, .project_name, .user_id, .team_id,
          .type, .chunk_id, .created_at, .occurred_at, .updated_at, .metadata
        }
      `
      
      const updateResult = await executeQuery(updateQuery, {
        contentHash,
        updated_at: data.updated_at || new Date().toISOString(),
        chunk_id: data.chunk_id || null
      })
      
      const updatedRecord = updateResult.records[0]
      const updatedNode = updatedRecord.m
      
      // Return the existing memory node with all properties
      const memoryNode: MemoryNode = {
        id: updatedNode.id,
        content: updatedNode.content || data.content,
        embedding: updatedNode.embedding || data.embedding,
        project_name: updatedNode.project_name || data.project_name,
        user_id: updatedNode.user_id,
        team_id: updatedNode.team_id,
        type: updatedNode.type || data.type || 'general',
        chunk_id: updatedNode.chunk_id || data.chunk_id,
        created_at: updatedNode.created_at,
        occurred_at: updatedNode.occurred_at,
        updated_at: updatedNode.updated_at,
        metadata: updatedNode.metadata ? JSON.parse(updatedNode.metadata) : {}
      }
      
      // Skip relationship inference for deduplicated memories to avoid errors
      return memoryNode
    }
    
    // Create new memory with content hash
    const query = `
      CREATE (m:Memory {
        id: $id,
        content: $content,
        content_hash: $contentHash,
        embedding: $embedding,
        project_name: $project_name,
        workspace_id: $workspace_id,
        user_id: $user_id,
        team_id: $team_id,
        type: $type,
        chunk_id: $chunk_id,
        created_at: $created_at,
        occurred_at: $occurred_at,
        updated_at: $updated_at,
        metadata: $metadata
      })
      RETURN m
    `
    
    const params = {
      id: data.id,
      content: data.content,
      contentHash,
      embedding: data.embedding,
      project_name: data.project_name,
      workspace_id: data.workspace_id || null,
      user_id: data.user_id || null,
      team_id: data.team_id || null,
      type: data.type || 'general',
      chunk_id: data.chunk_id || null,
      created_at: neo4j.DateTime.fromStandardDate(new Date(data.created_at!)),
      occurred_at: neo4j.DateTime.fromStandardDate(new Date(data.occurred_at || data.created_at!)),
      updated_at: neo4j.DateTime.fromStandardDate(new Date(data.updated_at!)),
      metadata: JSON.stringify(data.metadata || {})
    }

    log.info('Creating memory node with params', {
      id: params.id,
      projectName: params.project_name,
      workspaceId: params.workspace_id,
      userId: params.user_id,
      teamId: params.team_id,
      occurredAt: params.occurred_at,
      createdAt: params.created_at,
      embeddingDimensions: params.embedding.length,
      contentPreview: params.content.substring(0, 50) + '...',
      contentHash,
      type: params.type
    })

    const result = await executeQuery(query, params)
    
    if (!result.records.length) {
      throw new Error('Failed to create memory node')
    }
    
    // Extract the node properties from the Neo4j result
    const record = result.records[0]
    const node = record.m
    
    log.info('Memory node created successfully', {
      id: node.id,
      workspaceId: node.workspace_id,
      userId: node.user_id,
      occurredAt: node.occurred_at,
      createdAt: node.created_at
    })
    
    return {
      id: node.id,
      content: node.content,
      embedding: node.embedding,
      project_name: node.project_name,
      workspace_id: node.workspace_id,
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
async function inferMemoryRelationships(memory: MemoryNode): Promise<void> {
    // 1. Find similar memories to establish PRECEDED_BY relationships
    await findAndLinkPrecedingMemories(memory)
    
    // 2. Find related code entities based on content analysis
    await findAndLinkRelatedCode(memory)
    
    // 3. Detect if this is a debugging session
    if (isDebuggingMemory(memory.content)) {
      await createDebugSession(memory)
    }
    
    // 4. Extract and link concepts
    await extractAndLinkConcepts(memory)
  }

  /**
   * Find memories that this one might be preceded by
   */
async function findAndLinkPrecedingMemories(memory: MemoryNode): Promise<void> {
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
async function findAndLinkRelatedCode(memory: MemoryNode): Promise<void> {
    // Extract potential code references from content
    const codeReferences = extractCodeReferences(memory.content)
    
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
function extractCodeReferences(content: string): string[] {
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
function isDebuggingMemory(content: string): boolean {
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
async function createDebugSession(memory: MemoryNode): Promise<void> {
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
async function extractAndLinkConcepts(memory: MemoryNode): Promise<void> {
    // Extract key concepts using simple keyword extraction
    // In a real implementation, this could use NLP or LLM
    const concepts = extractConcepts(memory.content)
    
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
function extractConcepts(content: string): string[] {
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
async function ensureProjectExists(projectName: string): Promise<void> {
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
async function createProjectRelationship(memoryId: string, projectName: string): Promise<void> {
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
async function createUserRelationship(userId: string, memoryId: string): Promise<void> {
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
export async function batchIngestMemories(memories: Array<Parameters<typeof ingestMemory>[0]>): Promise<void> {
    log.info('Starting batch memory ingestion', { totalMemories: memories.length })
    
    for (const memory of memories) {
      try {
        await ingestMemory(memory)
      } catch (error) {
        log.error('Failed to ingest memory in batch', error, {
          memoryIndex: memories.indexOf(memory),
          projectName: memory.project_name
        })
      }
    }
    
    log.info('Batch memory ingestion completed')
  }