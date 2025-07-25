// Load environment variables first
import { config } from 'dotenv'
config({ path: '.env.local' })

import { ingestionService } from '../src/lib/neo4j/ingestion'
import { neo4jService } from '../src/lib/neo4j/service'
import { closeDriver, executeQuery } from '../src/lib/neo4j/client'

// Helper to generate test embedding
function generateTestEmbedding(text: string): number[] {
  // In real implementation, this would use OpenAI
  // For testing, generate a deterministic embedding based on text
  const embedding = new Array(3072).fill(0)
  for (let i = 0; i < text.length; i++) {
    embedding[i % 3072] += text.charCodeAt(i) / 1000
  }
  return embedding.map(v => v / text.length)
}

// Temporarily mock the OpenAI embedding generation for testing
import { IngestionService } from '../src/lib/neo4j/ingestion'

// Override the generateEmbedding method for testing
class TestIngestionService extends IngestionService {
  protected async generateEmbedding(text: string): Promise<number[]> {
    console.log('   📊 Generating test embedding...')
    return generateTestEmbedding(text)
  }
}

const testIngestionService = new TestIngestionService()

async function testMemoryIngestion() {
  try {
    console.log('🚀 Testing memory ingestion...\n')
    
    // Initialize Neo4j
    await neo4jService.initialize()
    
    // Sample memories to test different scenarios
    const sampleMemories = [
      {
        content: `I'm working on implementing authentication for the Supastate app. 
        The AuthService class needs to handle JWT tokens and integrate with GitHub OAuth. 
        I'm thinking about using the middleware pattern to protect routes.`,
        project_name: 'supastate',
        type: 'implementation',
        topics: ['authentication', 'oauth', 'security'],
        entities_mentioned: ['AuthService', 'JWT', 'GitHub OAuth']
      },
      {
        content: `Fixed a bug in the AuthService where tokens weren't being refreshed properly. 
        The issue was in the token expiry check - it was using seconds instead of milliseconds. 
        This was causing users to be logged out prematurely.`,
        project_name: 'supastate',
        type: 'debugging',
        topics: ['bug-fix', 'authentication'],
        entities_mentioned: ['AuthService']
      },
      {
        content: `After debugging the authentication issue, I now understand how JWT refresh tokens work. 
        The key insight is that the refresh token should have a longer expiry than the access token, 
        and we need to handle the refresh flow transparently in the background.`,
        project_name: 'supastate',
        type: 'learning',
        topics: ['jwt', 'authentication', 'tokens'],
        metadata: {
          understanding_level: 4,
          breakthroughs: ['JWT refresh flow', 'Token expiry handling']
        }
      },
      {
        content: `Working on the memory search feature. Need to implement vector embeddings using OpenAI 
        and store them in Neo4j. The MemoryService will handle ingestion and the SearchService 
        will handle hybrid queries combining vector similarity with graph relationships.`,
        project_name: 'supastate', 
        type: 'planning',
        topics: ['vector-search', 'neo4j', 'embeddings'],
        entities_mentioned: ['MemoryService', 'SearchService', 'OpenAI']
      }
    ]
    
    // Ingest memories
    console.log(`Ingesting ${sampleMemories.length} sample memories...\n`)
    
    for (const [index, memory] of sampleMemories.entries()) {
      console.log(`${index + 1}. Ingesting: "${memory.content.substring(0, 50)}..."`)
      
      const result = await testIngestionService.ingestMemory({
        ...memory,
        user_id: 'test-user-123',
        team_id: 'test-team-123'
      })
      
      console.log(`   ✅ Created memory: ${result.id}`)
      console.log(`   📊 Type: ${result.type}`)
      console.log(`   🏷️  Topics: ${memory.topics?.join(', ')}\n`)
    }
    
    // Test vector search with one of our memories
    console.log('\n📍 Testing vector search...')
    const searchEmbedding = await generateTestEmbedding('authentication JWT tokens')
    
    const searchResults = await neo4jService.searchMemoriesByVector({
      embedding: searchEmbedding,
      limit: 3,
      threshold: 0.5
    })
    
    console.log(`Found ${searchResults.length} similar memories:`)
    searchResults.forEach((result, i) => {
      console.log(`${i + 1}. Score: ${result.score?.toFixed(3)} - "${result.node.content.substring(0, 60)}..."`)
    })
    
    // Test relationship detection
    console.log('\n🔗 Testing relationship detection...')
    const stats = await executeQuery(`
      MATCH (m:Memory)-[r]->(target)
      RETURN type(r) as relationship, labels(target) as targetType, count(*) as count
      ORDER BY count DESC
    `)
    
    console.log('Relationships created:')
    stats.records.forEach(record => {
      console.log(`- ${record.relationship}: ${record.count} connections to ${record.targetType}`)
    })
    
    // Test knowledge graph retrieval
    console.log('\n📊 Testing knowledge graph retrieval...')
    const graph = await neo4jService.getKnowledgeGraph('test-user-123', 'supastate')
    console.log(`Knowledge graph contains ${graph.nodes.length} nodes and ${graph.relationships.length} relationships`)
    
    console.log('\n✅ Memory ingestion test complete!')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  } finally {
    await closeDriver()
    process.exit()
  }
}


// Run the test
testMemoryIngestion()