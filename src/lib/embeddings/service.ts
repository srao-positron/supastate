/**
 * Centralized Embeddings Service
 * 
 * All embedding generation MUST go through this service
 * to ensure consistency across the system
 */

import OpenAI from 'openai'
import { log } from '@/lib/logger'
import { EMBEDDINGS_CONFIG, validateEmbedding, estimateEmbeddingCost } from './config'

export class EmbeddingsService {
  private openai: OpenAI | null = null
  private requestCount = 0
  private lastResetTime = Date.now()
  
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
   * Generate embedding for a single text
   * ALWAYS uses text-embedding-3-large with 3072 dimensions
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text')
    }
    
    // Rate limiting
    await this.checkRateLimit()
    
    // Cost optimization - summarize very long texts
    let processedText = text
    if (text.length > EMBEDDINGS_CONFIG.USE_SUMMARY_THRESHOLD) {
      log.warn('Text too long for direct embedding, summarizing first', {
        originalLength: text.length,
        threshold: EMBEDDINGS_CONFIG.USE_SUMMARY_THRESHOLD
      })
      processedText = await this.summarizeText(text)
    }
    
    try {
      const openai = this.getOpenAI()
      const response = await openai.embeddings.create({
        model: EMBEDDINGS_CONFIG.MODEL,
        input: processedText,
        dimensions: EMBEDDINGS_CONFIG.DIMENSIONS
      })
      
      const embedding = response.data[0].embedding
      
      // Validate dimensions
      if (!validateEmbedding(embedding)) {
        throw new Error(`Invalid embedding dimensions: ${embedding.length} (expected ${EMBEDDINGS_CONFIG.DIMENSIONS})`)
      }
      
      // Log cost estimate
      const cost = estimateEmbeddingCost(processedText.length)
      log.debug('Generated embedding', {
        textLength: processedText.length,
        wasLummarized: text.length !== processedText.length,
        estimatedCost: cost.costUSD.toFixed(4)
      })
      
      this.requestCount++
      return embedding
    } catch (error) {
      log.error('Failed to generate embedding', error, {
        textLength: text.length,
        model: EMBEDDINGS_CONFIG.MODEL
      })
      throw error
    }
  }
  
  /**
   * Generate embeddings for multiple texts (batch processing)
   * More efficient than individual calls
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    
    const embeddings: number[][] = []
    
    // Process in batches
    for (let i = 0; i < texts.length; i += EMBEDDINGS_CONFIG.BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDINGS_CONFIG.BATCH_SIZE)
      
      // Process very long texts
      const processedBatch = await Promise.all(
        batch.map(async (text) => {
          if (text.length > EMBEDDINGS_CONFIG.USE_SUMMARY_THRESHOLD) {
            return this.summarizeText(text)
          }
          return text
        })
      )
      
      await this.checkRateLimit()
      
      try {
        const openai = this.getOpenAI()
        const response = await openai.embeddings.create({
          model: EMBEDDINGS_CONFIG.MODEL,
          input: processedBatch,
          dimensions: EMBEDDINGS_CONFIG.DIMENSIONS
        })
        
        const batchEmbeddings = response.data.map(d => d.embedding)
        
        // Validate all embeddings
        for (const embedding of batchEmbeddings) {
          if (!validateEmbedding(embedding)) {
            throw new Error(`Invalid embedding dimensions in batch: ${embedding.length}`)
          }
        }
        
        embeddings.push(...batchEmbeddings)
        this.requestCount += batch.length
        
        // Log batch cost
        const totalLength = processedBatch.reduce((sum, text) => sum + text.length, 0)
        const cost = estimateEmbeddingCost(totalLength)
        log.debug('Generated batch embeddings', {
          batchSize: batch.length,
          totalLength,
          estimatedCost: cost.costUSD.toFixed(4)
        })
        
      } catch (error) {
        log.error('Failed to generate batch embeddings', error, {
          batchSize: batch.length,
          batchIndex: i / EMBEDDINGS_CONFIG.BATCH_SIZE
        })
        throw error
      }
    }
    
    return embeddings
  }
  
  /**
   * Calculate cosine similarity between two embeddings
   * (For reference - Neo4j has this built in with gds.similarity.cosine)
   */
  static cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions')
    }
    
    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      norm1 += embedding1[i] * embedding1[i]
      norm2 += embedding2[i] * embedding2[i]
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }
  
  /**
   * Summarize long text using GPT-4o-mini for cost optimization
   */
  private async summarizeText(text: string): Promise<string> {
    try {
      const openai = this.getOpenAI()
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Summarize the following text concisely, preserving key technical details and concepts. Maximum 1000 characters.'
          },
          {
            role: 'user',
            content: text.substring(0, 8000) // Limit input to avoid token limits
          }
        ],
        max_tokens: 250,
        temperature: 0.3
      })
      
      const summary = response.choices[0].message.content || text.substring(0, EMBEDDINGS_CONFIG.SUMMARY_MAX_LENGTH)
      
      log.info('Summarized long text for embedding', {
        originalLength: text.length,
        summaryLength: summary.length
      })
      
      return summary
    } catch (error) {
      log.error('Failed to summarize text, using truncation', error)
      return text.substring(0, EMBEDDINGS_CONFIG.SUMMARY_MAX_LENGTH)
    }
  }
  
  /**
   * Simple rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceReset = now - this.lastResetTime
    
    // Reset counter every minute
    if (timeSinceReset > 60000) {
      this.requestCount = 0
      this.lastResetTime = now
    }
    
    // If we're at the limit, wait
    if (this.requestCount >= EMBEDDINGS_CONFIG.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - timeSinceReset
      log.warn(`Rate limit reached, waiting ${waitTime}ms`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      this.requestCount = 0
      this.lastResetTime = Date.now()
    }
  }
}

// Singleton instance
export const embeddingsService = new EmbeddingsService()