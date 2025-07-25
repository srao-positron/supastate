// Test the hybrid search API functionality
import { config } from 'dotenv'
config({ path: '.env.local' })

// Mock fetch for testing API endpoints
async function testHybridSearchAPI() {
  const baseUrl = 'http://localhost:3000/api/neo4j/hybrid-search'
  
  // Mock auth token (in real usage, this would come from Supabase auth)
  const mockHeaders = {
    'Content-Type': 'application/json',
    // In a real scenario, you'd include: 'Authorization': `Bearer ${token}`
  }

  console.log('🔍 Testing Hybrid Search API...\n')

  // Test 1: Vector search
  console.log('1. Testing vector search for "authentication JWT tokens"')
  const vectorSearchPayload = {
    query: 'authentication JWT tokens',
    searchType: 'vector',
    filters: {
      projectName: 'supastate',
      minSimilarity: 0.6
    },
    limit: 5
  }
  
  console.log('Request:', JSON.stringify(vectorSearchPayload, null, 2))
  console.log('Expected: Results containing memories and code related to authentication\n')

  // Test 2: Graph search
  console.log('2. Testing graph search from a memory node')
  const graphSearchPayload = {
    searchType: 'graph',
    filters: {
      startNodeId: 'test-memory-id', // Would be a real memory ID
      relationshipTypes: ['DISCUSSES', 'PRECEDED_BY'],
      maxDepth: 2,
      direction: 'OUTGOING'
    },
    limit: 10
  }
  
  console.log('Request:', JSON.stringify(graphSearchPayload, null, 2))
  console.log('Expected: Related nodes within 2 hops\n')

  // Test 3: Hybrid search
  console.log('3. Testing hybrid search combining vector and graph')
  const hybridSearchPayload = {
    query: 'bug fixes in authentication',
    searchType: 'hybrid',
    filters: {
      projectName: 'supastate',
      minSimilarity: 0.5,
      timeRange: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
        end: new Date().toISOString()
      }
    },
    includeRelated: {
      types: ['DISCUSSES', 'LED_TO_UNDERSTANDING'],
      maxDepth: 2
    },
    limit: 20
  }
  
  console.log('Request:', JSON.stringify(hybridSearchPayload, null, 2))
  console.log('Expected: Bug fix memories with related code and insights\n')

  // Test 4: Get search suggestions
  console.log('4. Testing search suggestions endpoint')
  console.log('GET /api/neo4j/hybrid-search?type=all')
  console.log('Expected: Projects, concepts, and relationship types\n')

  console.log('✅ API test scenarios documented!')
  console.log('\nTo actually test these endpoints:')
  console.log('1. Start the Next.js dev server: npm run dev')
  console.log('2. Authenticate with Supabase')
  console.log('3. Use a tool like Postman or create a frontend to call these endpoints')
}

// Alternative: Direct Neo4j service test
async function testHybridSearchDirect() {
  console.log('\n🔍 Testing Hybrid Search via Neo4j Service...\n')
  
  try {
    const { neo4jService } = await import('../src/lib/neo4j/service')
    const { closeDriver } = await import('../src/lib/neo4j/client')
    
    // Initialize
    await neo4jService.initialize()
    
    // Test hybrid search
    console.log('Testing hybrid search with sample embedding...')
    
    // Generate a test embedding
    const testEmbedding = new Array(3072).fill(0).map((_, i) => Math.sin(i) * 0.1)
    
    const results = await neo4jService.hybridSearch({
      embedding: testEmbedding,
      filters: {
        projectName: 'supastate',
        minSimilarity: 0.3
      },
      includeRelated: {
        types: ['DISCUSSES', 'PRECEDED_BY'],
        maxDepth: 1
      }
    })
    
    console.log(`Found ${results.length} hybrid search results`)
    
    if (results.length > 0) {
      console.log('\nTop result:')
      const topResult = results[0]
      console.log(`- Score: ${topResult.score}`)
      console.log(`- Content: ${topResult.node.content?.substring(0, 100)}...`)
      console.log(`- Related nodes: ${topResult.relationships?.length || 0}`)
    }
    
    // Cleanup
    await closeDriver()
    console.log('\n✅ Direct service test complete!')
    
  } catch (error) {
    console.error('❌ Direct service test failed:', error)
  }
}

// Run both tests
testHybridSearchAPI()
testHybridSearchDirect().catch(console.error)