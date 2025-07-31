import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    return []
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured, skipping embedding generation')
    return []
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text.substring(0, 8000), // Limit input size
      dimensions: 3072,
    })

    return response.data[0].embedding
  } catch (error) {
    console.error('Failed to generate embedding:', error)
    return []
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    return []
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured, skipping embeddings generation')
    return texts.map(() => [])
  }

  try {
    // Filter out empty texts and limit size
    const validTexts = texts
      .filter(text => text && text.trim().length > 0)
      .map(text => text.substring(0, 8000))

    if (validTexts.length === 0) {
      return texts.map(() => [])
    }

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: validTexts,
      dimensions: 3072,
    })

    // Map back to original array indices
    const embeddings: number[][] = []
    let validIndex = 0
    
    for (const text of texts) {
      if (text && text.trim().length > 0) {
        embeddings.push(response.data[validIndex].embedding)
        validIndex++
      } else {
        embeddings.push([])
      }
    }

    return embeddings
  } catch (error) {
    console.error('Failed to generate embeddings:', error)
    return texts.map(() => [])
  }
}