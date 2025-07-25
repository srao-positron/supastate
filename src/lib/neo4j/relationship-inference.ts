import { executeQuery, writeTransaction } from './client'
import { neo4jService } from './service'
import OpenAI from 'openai'

export interface InferenceResult {
  relationshipsCreated: number
  suggestedRelationships: Array<{
    fromId: string
    toId: string
    type: string
    confidence: number
    reason: string
  }>
}

export class RelationshipInferenceEngine {
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
   * Infer relationships between a memory and existing code entities
   */
  async inferMemoryCodeRelationships(memoryId: string): Promise<InferenceResult> {
    console.log(`[InferenceEngine] Analyzing memory ${memoryId} for code relationships`)
    
    // Get the memory content
    const memoryResult = await executeQuery(`
      MATCH (m:Memory {id: $memoryId})
      RETURN m
    `, { memoryId })
    
    if (!memoryResult.records.length) {
      throw new Error(`Memory ${memoryId} not found`)
    }
    
    const memory = memoryResult.records[0].m
    const memoryContent = memory.properties.content
    const projectName = memory.properties.project_name
    
    // Extract potential code references using multiple strategies
    const codeReferences = await this.extractCodeReferences(memoryContent)
    const suggestedRelationships: InferenceResult['suggestedRelationships'] = []
    let relationshipsCreated = 0
    
    // Strategy 1: Direct name matching
    for (const ref of codeReferences.directReferences) {
      const matchResult = await executeQuery(`
        MATCH (c:CodeEntity)
        WHERE c.project_name = $projectName
          AND (c.name = $refName OR c.name CONTAINS $refName)
        RETURN c
        LIMIT 5
      `, { projectName, refName: ref.name })
      
      for (const record of matchResult.records) {
        const codeEntity = record.c
        const relationship = {
          fromId: memoryId,
          toId: codeEntity.properties.id,
          type: 'DISCUSSES',
          confidence: ref.confidence,
          reason: ref.reason
        }
        
        if (ref.confidence > 0.7) {
          // High confidence - create the relationship
          await this.createRelationship(relationship)
          relationshipsCreated++
        } else {
          // Lower confidence - suggest for review
          suggestedRelationships.push(relationship)
        }
      }
    }
    
    // Strategy 2: Semantic similarity search
    const similarCode = await this.findSemanticallySimilarCode(memory, projectName)
    for (const match of similarCode) {
      if (match.score > 0.8) {
        const relationship = {
          fromId: memoryId,
          toId: match.codeId,
          type: 'DISCUSSES',
          confidence: match.score,
          reason: 'High semantic similarity'
        }
        
        // Check if relationship already exists
        const exists = await this.relationshipExists(memoryId, match.codeId, 'DISCUSSES')
        if (!exists) {
          await this.createRelationship(relationship)
          relationshipsCreated++
        }
      }
    }
    
    // Strategy 3: Contextual analysis using LLM
    if (codeReferences.directReferences.length < 3) {
      // Use LLM for deeper analysis when simple extraction yields few results
      const llmSuggestions = await this.analyzewithLLM(memoryContent, projectName)
      suggestedRelationships.push(...llmSuggestions)
    }
    
    console.log(`[InferenceEngine] Created ${relationshipsCreated} relationships, suggested ${suggestedRelationships.length}`)
    
    return {
      relationshipsCreated,
      suggestedRelationships
    }
  }

  /**
   * Infer relationships between memories (knowledge evolution)
   */
  async inferMemoryEvolution(memoryId: string): Promise<InferenceResult> {
    console.log(`[InferenceEngine] Analyzing memory ${memoryId} for evolution patterns`)
    
    const result = await executeQuery(`
      MATCH (current:Memory {id: $memoryId})
      MATCH (other:Memory)
      WHERE other.project_name = current.project_name
        AND other.id <> current.id
        AND other.user_id = current.user_id
        AND datetime(other.created_at) < datetime(current.created_at)
        AND datetime(other.created_at) > datetime(current.created_at) - duration({days: 7})
      WITH current, other,
           // Calculate content similarity using stored embeddings
           gds.similarity.cosine(current.embedding, other.embedding) as similarity
      WHERE similarity > 0.7
      RETURN other, similarity
      ORDER BY similarity DESC
      LIMIT 10
    `, { memoryId })
    
    let relationshipsCreated = 0
    const suggestedRelationships: InferenceResult['suggestedRelationships'] = []
    
    for (const record of result.records) {
      const otherMemory = record.other
      const similarity = record.similarity
      
      // Analyze if this represents knowledge evolution
      const evolutionType = await this.detectEvolutionType(
        otherMemory.properties.content,
        result.records[0].current.properties.content
      )
      
      if (evolutionType) {
        const relationship = {
          fromId: otherMemory.properties.id,
          toId: memoryId,
          type: evolutionType,
          confidence: similarity,
          reason: `Knowledge evolution: ${evolutionType.toLowerCase().replace('_', ' ')}`
        }
        
        if (similarity > 0.85 && ['EVOLVED_INTO', 'LED_TO_UNDERSTANDING'].includes(evolutionType)) {
          await this.createRelationship(relationship)
          relationshipsCreated++
        } else {
          suggestedRelationships.push(relationship)
        }
      }
    }
    
    return {
      relationshipsCreated,
      suggestedRelationships
    }
  }

  /**
   * Extract code references from text
   */
  private async extractCodeReferences(content: string): Promise<{
    directReferences: Array<{ name: string; confidence: number; reason: string }>
  }> {
    const references: Array<{ name: string; confidence: number; reason: string }> = []
    
    // Pattern 1: Explicit mentions (e.g., "the AuthService class", "in handleLogin function")
    const explicitPatterns = [
      /(?:class|interface|function|method|component|service|controller|module)\s+(\w+)/gi,
      /(\w+)(?:Service|Controller|Component|Module|Handler|Manager|Provider)/g,
      /`(\w+)`/g, // Code in backticks
    ]
    
    for (const pattern of explicitPatterns) {
      const matches = content.matchAll(pattern)
      for (const match of matches) {
        const name = match[1] || match[0]
        if (name.length > 2 && !this.isCommonWord(name)) {
          references.push({
            name,
            confidence: 0.9,
            reason: 'Explicit code reference'
          })
        }
      }
    }
    
    // Pattern 2: File paths
    const filePattern = /(?:src\/|lib\/|components\/)[\w\/]+\.(ts|js|tsx|jsx)/g
    const fileMatches = content.matchAll(filePattern)
    for (const match of fileMatches) {
      const filePath = match[0]
      const fileName = filePath.split('/').pop()?.replace(/\.(ts|js|tsx|jsx)$/, '')
      if (fileName) {
        references.push({
          name: fileName,
          confidence: 0.95,
          reason: 'File path reference'
        })
      }
    }
    
    // Pattern 3: CamelCase that might be code
    const camelCasePattern = /\b([A-Z][a-zA-Z0-9]+)\b/g
    const camelMatches = content.matchAll(camelCasePattern)
    for (const match of camelMatches) {
      const name = match[1]
      if (name.length > 3 && !this.isCommonWord(name)) {
        // Lower confidence for implicit references
        const existing = references.find(r => r.name === name)
        if (!existing) {
          references.push({
            name,
            confidence: 0.6,
            reason: 'Possible code reference (CamelCase)'
          })
        }
      }
    }
    
    // Deduplicate and sort by confidence
    const uniqueReferences = Array.from(
      new Map(references.map(r => [r.name, r])).values()
    ).sort((a, b) => b.confidence - a.confidence)
    
    return { directReferences: uniqueReferences }
  }

  /**
   * Find semantically similar code using embeddings
   */
  private async findSemanticallySimilarCode(
    memory: any,
    projectName: string
  ): Promise<Array<{ codeId: string; score: number }>> {
    const embedding = memory.properties.embedding
    
    const results = await neo4jService.searchCodeByVector({
      embedding,
      limit: 10,
      threshold: 0.75,
      projectFilter: projectName
    })
    
    return results.map(r => ({
      codeId: r.node.id,
      score: r.score || 0
    }))
  }

  /**
   * Use LLM to analyze content for code references
   */
  private async analyzewithLLM(
    content: string,
    projectName: string
  ): Promise<InferenceResult['suggestedRelationships']> {
    try {
      const openai = this.getOpenAI()
      
      // Get some context about available code
      const codeContext = await executeQuery(`
        MATCH (c:CodeEntity {project_name: $projectName})
        RETURN DISTINCT c.name as name, c.type as type
        LIMIT 50
      `, { projectName })
      
      const availableCode = codeContext.records.map(r => 
        `${r.type} ${r.name}`
      ).join(', ')
      
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are analyzing developer memories to find references to code entities.
            Available code entities in the project include: ${availableCode}
            
            Return a JSON array of potential code references with confidence scores.
            Each item should have: { name: string, type: string, confidence: number, reason: string }`
          },
          {
            role: 'user',
            content: `Analyze this memory for code references:\n\n${content.substring(0, 1000)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
      
      const suggestions = JSON.parse(response.choices[0].message.content || '[]')
      
      // Convert to relationship suggestions
      const relationships: InferenceResult['suggestedRelationships'] = []
      for (const suggestion of suggestions) {
        // Try to find the actual code entity
        const matchResult = await executeQuery(`
          MATCH (c:CodeEntity)
          WHERE c.project_name = $projectName
            AND c.name = $name
            AND c.type = $type
          RETURN c.id as id
          LIMIT 1
        `, { projectName, name: suggestion.name, type: suggestion.type })
        
        if (matchResult.records.length > 0) {
          relationships.push({
            fromId: '', // Will be filled by caller
            toId: matchResult.records[0].id,
            type: 'DISCUSSES',
            confidence: suggestion.confidence,
            reason: suggestion.reason
          })
        }
      }
      
      return relationships
    } catch (error) {
      console.error('[InferenceEngine] LLM analysis failed:', error)
      return []
    }
  }

  /**
   * Detect type of knowledge evolution between memories
   */
  private async detectEvolutionType(
    earlierContent: string,
    laterContent: string
  ): Promise<string | null> {
    // Simple heuristic-based detection
    const earlier = earlierContent.toLowerCase()
    const later = laterContent.toLowerCase()
    
    // Debugging → Understanding
    if (earlier.includes('error') || earlier.includes('bug') || earlier.includes('issue')) {
      if (later.includes('fixed') || later.includes('solved') || later.includes('understand')) {
        return 'LED_TO_UNDERSTANDING'
      }
    }
    
    // Learning progression
    if (later.includes('now i understand') || later.includes('figured out') || 
        later.includes('learned that')) {
      return 'EVOLVED_INTO'
    }
    
    // Implementation progression
    if (earlier.includes('planning') || earlier.includes('thinking about')) {
      if (later.includes('implemented') || later.includes('created') || later.includes('built')) {
        return 'PRECEDED_BY'
      }
    }
    
    return null
  }

  /**
   * Create a relationship in Neo4j
   */
  private async createRelationship(rel: {
    fromId: string
    toId: string
    type: string
    confidence: number
    reason: string
  }): Promise<void> {
    const query = `
      MATCH (from {id: $fromId})
      MATCH (to {id: $toId})
      MERGE (from)-[r:${rel.type}]->(to)
      SET r.confidence = $confidence,
          r.reason = $reason,
          r.inferred = true,
          r.created_at = datetime()
      RETURN r
    `
    
    await executeQuery(query, {
      fromId: rel.fromId,
      toId: rel.toId,
      confidence: rel.confidence,
      reason: rel.reason
    })
  }

  /**
   * Check if a relationship already exists
   */
  private async relationshipExists(
    fromId: string,
    toId: string,
    type: string
  ): Promise<boolean> {
    const result = await executeQuery(`
      MATCH (from {id: $fromId})-[r:${type}]->(to {id: $toId})
      RETURN count(r) as count
    `, { fromId, toId })
    
    return result.records[0].count > 0
  }

  /**
   * Check if a word is too common to be a code reference
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'The', 'This', 'That', 'These', 'Those',
      'Component', 'Service', 'Module', 'Function',
      'Error', 'Exception', 'Result', 'Response',
      'Data', 'Info', 'Item', 'List', 'Array'
    ])
    return commonWords.has(word)
  }

  /**
   * Batch process memories for relationship inference
   */
  async batchInferRelationships(
    memoryIds: string[],
    options: {
      includeEvolution?: boolean
      includeCodeConnections?: boolean
    } = {}
  ): Promise<{
    totalCreated: number
    totalSuggested: number
    results: Array<{ memoryId: string; result: InferenceResult }>
  }> {
    console.log(`[InferenceEngine] Batch processing ${memoryIds.length} memories`)
    
    const results: Array<{ memoryId: string; result: InferenceResult }> = []
    let totalCreated = 0
    let totalSuggested = 0
    
    for (const memoryId of memoryIds) {
      try {
        let codeResult: InferenceResult = { relationshipsCreated: 0, suggestedRelationships: [] }
        let evolutionResult: InferenceResult = { relationshipsCreated: 0, suggestedRelationships: [] }
        
        if (options.includeCodeConnections !== false) {
          codeResult = await this.inferMemoryCodeRelationships(memoryId)
        }
        
        if (options.includeEvolution) {
          evolutionResult = await this.inferMemoryEvolution(memoryId)
        }
        
        const combinedResult: InferenceResult = {
          relationshipsCreated: codeResult.relationshipsCreated + evolutionResult.relationshipsCreated,
          suggestedRelationships: [...codeResult.suggestedRelationships, ...evolutionResult.suggestedRelationships]
        }
        
        results.push({ memoryId, result: combinedResult })
        totalCreated += combinedResult.relationshipsCreated
        totalSuggested += combinedResult.suggestedRelationships.length
        
      } catch (error) {
        console.error(`[InferenceEngine] Failed to process memory ${memoryId}:`, error)
        results.push({ 
          memoryId, 
          result: { relationshipsCreated: 0, suggestedRelationships: [] } 
        })
      }
    }
    
    console.log(`[InferenceEngine] Batch complete: ${totalCreated} created, ${totalSuggested} suggested`)
    
    return {
      totalCreated,
      totalSuggested,
      results
    }
  }
}

export const relationshipInferenceEngine = new RelationshipInferenceEngine()