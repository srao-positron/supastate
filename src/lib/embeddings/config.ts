/**
 * Centralized Embeddings Configuration
 * 
 * IMPORTANT: All embeddings in the system MUST use these settings
 * to ensure consistency for semantic search and similarity calculations
 */

export const EMBEDDINGS_CONFIG = {
  // Model MUST be text-embedding-3-large for compatibility
  MODEL: 'text-embedding-3-large' as const,
  
  // Dimensions MUST be 3072 - this is what's stored in Neo4j
  DIMENSIONS: 3072 as const,
  
  // Batch size for efficient API usage
  BATCH_SIZE: 100 as const,
  
  // Rate limiting
  MAX_REQUESTS_PER_MINUTE: 500 as const,
  
  // Cost optimization thresholds
  SUMMARY_MAX_LENGTH: 1000, // Characters before we summarize
  USE_SUMMARY_THRESHOLD: 5000, // Characters - use GPT-4o-mini to summarize first
} as const

// Type for embedding vectors
export type EmbeddingVector = number[]

// Validate embedding dimensions
export function validateEmbedding(embedding: number[]): boolean {
  return embedding.length === EMBEDDINGS_CONFIG.DIMENSIONS
}

// Cost estimation (rough)
export function estimateEmbeddingCost(textLength: number): {
  tokens: number
  costUSD: number
} {
  // Rough estimate: 1 token ≈ 4 characters
  const tokens = Math.ceil(textLength / 4)
  // text-embedding-3-large pricing (as of 2024)
  const costPerMillion = 0.13 // $0.13 per 1M tokens
  const costUSD = (tokens / 1_000_000) * costPerMillion
  
  return { tokens, costUSD }
}