import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const NEO4J_URI = 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = 'neo4j'
const NEO4J_PASSWORD = 'XROfdG-0_Idz6zzm6s1C5Bwao6GgW_84T7BeT_uvtW8'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkExistingCodeData() {
  console.log('\n=== Checking Existing Code Data ===')
  
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    // Count CodeEntity nodes
    const codeCount = await session.run(`
      MATCH (c:CodeEntity)
      RETURN count(c) as count
    `)
    console.log(`Total CodeEntity nodes: ${codeCount.records[0].get('count')}`)
    
    // Count CodeEntity nodes with metadata
    const codeWithMetadata = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.metadata IS NOT NULL AND c.metadata <> '{}'
      RETURN count(c) as count
    `)
    console.log(`CodeEntity nodes with metadata: ${codeWithMetadata.records[0].get('count')}`)
    
    // Count EntitySummary nodes for code
    const codeSummaries = await session.run(`
      MATCH (s:EntitySummary {entity_type: 'code'})
      RETURN count(s) as count
    `)
    console.log(`EntitySummary nodes for code: ${codeSummaries.records[0].get('count')}`)
    
    // Count Memory nodes
    const memoryCount = await session.run(`
      MATCH (m:Memory)
      RETURN count(m) as count
    `)
    console.log(`Total Memory nodes: ${memoryCount.records[0].get('count')}`)
    
    // Count existing RELATES_TO relationships
    const relatesTo = await session.run(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      RETURN count(r) as count
    `)
    console.log(`Existing Memory-Code RELATES_TO relationships: ${relatesTo.records[0].get('count')}`)
    
    // Sample some code entities
    const sampleCode = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.content IS NOT NULL
      RETURN c.id as id, c.name as name, c.path as path, c.language as language
      LIMIT 5
    `)
    
    console.log('\nSample CodeEntity nodes:')
    for (const record of sampleCode.records) {
      console.log(`- ${record.get('name')} (${record.get('language')}) - ${record.get('path')}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

async function triggerPatternDetection() {
  console.log('\n=== Triggering Pattern Detection ===')
  
  try {
    // Add message to pattern detection queue
    const { data, error } = await supabase.rpc('pgmq_send', {
      queue_name: 'pattern_detection_queue',
      msg: {
        type: 'manual_trigger',
        source: 'test-code-pattern-detection',
        triggered_at: new Date().toISOString()
      },
      delay: 0
    })
    
    if (error) {
      console.error('Error sending to queue:', error)
      return
    }
    
    console.log('Pattern detection triggered successfully!')
    console.log('Message ID:', data)
    
    // Check logs
    console.log('\nChecking recent pattern processor logs...')
    const { data: logs, error: logError } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (logError) {
      console.error('Error fetching logs:', logError)
    } else if (logs && logs.length > 0) {
      console.log('\nRecent logs:')
      for (const log of logs) {
        console.log(`[${log.level}] ${log.message} (${new Date(log.created_at).toLocaleString()})`)
        if (log.metadata) {
          console.log(`  Metadata: ${JSON.stringify(log.metadata)}`)
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

async function checkPatternResults() {
  console.log('\n=== Checking Pattern Results ===')
  
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    // Check for new EntitySummary nodes
    const newSummaries = await session.run(`
      MATCH (s:EntitySummary {entity_type: 'code'})
      WHERE s.created_at > datetime() - duration('PT5M')
      RETURN count(s) as count
    `)
    console.log(`New EntitySummary nodes for code (last 5 min): ${newSummaries.records[0].get('count')}`)
    
    // Check for new RELATES_TO relationships
    const newRelationships = await session.run(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      WHERE r.detected_at > datetime() - duration('PT5M')
      RETURN count(r) as count, 
             collect(DISTINCT r.detection_method)[0..5] as methods
    `)
    console.log(`New Memory-Code relationships (last 5 min): ${newRelationships.records[0].get('count')}`)
    console.log(`Detection methods: ${newRelationships.records[0].get('methods').join(', ')}`)
    
    // Sample some relationships
    const sampleRelationships = await session.run(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      WHERE r.detected_at > datetime() - duration('PT5M')
      RETURN m.content as memory_content, 
             c.name as code_name,
             r.similarity as similarity,
             r.detection_method as method
      LIMIT 3
    `)
    
    if (sampleRelationships.records.length > 0) {
      console.log('\nSample new relationships:')
      for (const record of sampleRelationships.records) {
        const memorySnippet = record.get('memory_content')?.substring(0, 50) + '...'
        console.log(`- Memory: "${memorySnippet}" <-> Code: ${record.get('code_name')}`)
        console.log(`  Method: ${record.get('method')}, Similarity: ${record.get('similarity')}`)
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

// Main execution
async function main() {
  await checkExistingCodeData()
  await triggerPatternDetection()
  
  // Wait a bit for processing
  console.log('\nWaiting 10 seconds for pattern detection to process...')
  await new Promise(resolve => setTimeout(resolve, 10000))
  
  await checkPatternResults()
}

main().catch(console.error)