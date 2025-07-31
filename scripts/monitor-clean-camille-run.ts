import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

interface Stats {
  memories: number
  codeEntities: number
  neo4jNodes: number
  relationships: number
  patterns: number
  errors: number
  duplicates: number
}

async function getStats(): Promise<Stats> {
  const session = driver.session()
  
  try {
    // Get Supabase counts
    const [memCount, codeCount] = await Promise.all([
      supabase.from('memories').select('id', { count: 'exact', head: true }),
      supabase.from('code_entities').select('id', { count: 'exact', head: true })
    ])
    
    // Get Neo4j counts
    const nodeResult = await session.run(`
      MATCH (n)
      RETURN labels(n)[0] as label, count(n) as count
    `)
    
    const relResult = await session.run(`
      MATCH ()-[r]->()
      RETURN type(r) as type, count(r) as count
    `)
    
    // Check for duplicates
    const dupResult = await session.run(`
      MATCH (es:EntitySummary)
      WITH es.entity_id as entityId, count(*) as count
      WHERE count > 1
      RETURN count(*) as duplicateCount
    `)
    
    // Get pattern counts
    const patternResult = await session.run(`
      MATCH (p:Pattern)
      RETURN count(p) as count
    `)
    
    // Get error count
    const { count: errorCount } = await supabase
      .from('function_logs')
      .select('id', { count: 'exact', head: true })
      .eq('level', 'error')
      .gte('timestamp', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    
    const totalNodes = nodeResult.records.reduce((sum, r) => sum + r.get('count').toNumber(), 0)
    const totalRels = relResult.records.reduce((sum, r) => sum + r.get('count').toNumber(), 0)
    
    return {
      memories: memCount.count || 0,
      codeEntities: codeCount.count || 0,
      neo4jNodes: totalNodes,
      relationships: totalRels,
      patterns: patternResult.records[0]?.get('count')?.toNumber() || 0,
      errors: errorCount || 0,
      duplicates: dupResult.records[0]?.get('duplicateCount')?.toNumber() || 0
    }
  } finally {
    await session.close()
  }
}

async function getRecentErrors() {
  const { data: errors } = await supabase
    .from('function_logs')
    .select('timestamp, function_name, event_message')
    .eq('level', 'error')
    .gte('timestamp', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: false })
    .limit(5)
    
  return errors || []
}

async function checkRelationshipLimits() {
  const session = driver.session()
  try {
    const result = await session.run(`
      MATCH (n)
      WHERE n:Memory OR n:CodeEntity
      WITH n, COUNT { (n)-[:RELATES_TO]-() } as relCount
      WHERE relCount > 0
      RETURN max(relCount) as maxRels, avg(relCount) as avgRels, count(n) as nodesWithRels
    `)
    
    const record = result.records[0]
    return {
      maxRelationships: record?.get('maxRels')?.toNumber() || 0,
      avgRelationships: record?.get('avgRels') || 0,
      nodesWithRelationships: record?.get('nodesWithRels')?.toNumber() || 0
    }
  } finally {
    await session.close()
  }
}

async function monitor() {
  console.clear()
  console.log('=== Monitoring Clean Camille Run ===')
  console.log(`Started at: ${new Date().toLocaleTimeString()}\n`)
  
  let previousStats: Stats | null = null
  
  setInterval(async () => {
    try {
      const stats = await getStats()
      const relStats = await checkRelationshipLimits()
      const errors = await getRecentErrors()
      
      console.clear()
      console.log('=== Monitoring Clean Camille Run ===')
      console.log(`Time: ${new Date().toLocaleTimeString()}\n`)
      
      console.log('📊 Current Stats:')
      console.log(`Memories: ${stats.memories}`)
      console.log(`Code Entities: ${stats.codeEntities}`)
      console.log(`Neo4j Nodes: ${stats.neo4jNodes}`)
      console.log(`Relationships: ${stats.relationships}`)
      console.log(`Patterns: ${stats.patterns}`)
      console.log(`Errors (last 10m): ${stats.errors}`)
      console.log(`Duplicate Summaries: ${stats.duplicates}`)
      
      console.log('\n🔗 Relationship Stats:')
      console.log(`Max relationships per node: ${relStats.maxRelationships} (limit: 25)`)
      console.log(`Avg relationships: ${relStats.avgRelationships.toFixed(2)}`)
      console.log(`Nodes with relationships: ${relStats.nodesWithRelationships}`)
      
      if (previousStats) {
        console.log('\n📈 Progress (last 5s):')
        console.log(`+${stats.memories - previousStats.memories} memories`)
        console.log(`+${stats.codeEntities - previousStats.codeEntities} code entities`)
        console.log(`+${stats.neo4jNodes - previousStats.neo4jNodes} Neo4j nodes`)
        console.log(`+${stats.relationships - previousStats.relationships} relationships`)
        console.log(`+${stats.patterns - previousStats.patterns} patterns`)
      }
      
      if (errors.length > 0) {
        console.log('\n❌ Recent Errors:')
        errors.forEach(err => {
          const time = new Date(err.timestamp).toLocaleTimeString()
          console.log(`[${time}] ${err.function_name}: ${err.event_message.substring(0, 80)}...`)
        })
      }
      
      if (stats.duplicates > 0) {
        console.log(`\n⚠️  WARNING: Found ${stats.duplicates} duplicate EntitySummary nodes!`)
      }
      
      if (relStats.maxRelationships > 25) {
        console.log(`\n⚠️  WARNING: Relationship limit exceeded! Max: ${relStats.maxRelationships}`)
      }
      
      previousStats = stats
      
    } catch (error) {
      console.error('Monitor error:', error.message)
    }
  }, 5000)
}

// Start monitoring
monitor().catch(console.error)

// Keep process alive
process.stdin.resume()