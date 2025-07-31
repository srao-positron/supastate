import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
})

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Use the same model as used for ingestion
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
      dimensions: 3072
    })
    
    return response.data[0].embedding
  } catch (error) {
    console.error('Failed to generate embedding:', error)
    throw new Error('Embedding generation failed')
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: texts,
      dimensions: 3072
    })
    
    return response.data.map(item => item.embedding)
  } catch (error) {
    console.error('Failed to generate embeddings:', error)
    throw new Error('Embeddings generation failed')
  }
}