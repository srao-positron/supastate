import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

async function cleanAllData() {
  console.log('🧹 Cleaning all data from Neo4j and Supabase...\n')

  // Clean Neo4j
  console.log('1. Cleaning Neo4j...')
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )

  const session = driver.session()

  try {
    // Delete all nodes and relationships
    console.log('   - Deleting all nodes and relationships...')
    await session.run(`
      MATCH (n)
      DETACH DELETE n
    `)
    console.log('   ✅ Neo4j cleaned')
  } catch (error) {
    console.error('   ❌ Error cleaning Neo4j:', error)
  } finally {
    await session.close()
    await driver.close()
  }

  // Clean Supabase
  console.log('\n2. Cleaning Supabase tables...')
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  })

  const tables = [
    'memory_queue',
    'code_processing_queue',
    'processed_memories',
    'code_files',
    'memory_summaries',
    'supastate_logs'
  ]

  for (const table of tables) {
    try {
      console.log(`   - Cleaning ${table}...`)
      const { error } = await supabase
        .from(table)
        .delete()
        .not('id', 'is', null) // Delete all rows
      
      if (error) {
        console.error(`   ❌ Error cleaning ${table}:`, error.message)
      } else {
        console.log(`   ✅ ${table} cleaned`)
      }
    } catch (error) {
      console.error(`   ❌ Error cleaning ${table}:`, error)
    }
  }

  console.log('\n✨ All data cleaned successfully!')
  console.log('\nYou can now re-import data from Camille with proper timestamps.')
}

cleanAllData().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})