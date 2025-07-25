#!/usr/bin/env node
import neo4j from 'neo4j-driver'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD

if (!NEO4J_PASSWORD) {
  console.error('NEO4J_PASSWORD environment variable is required')
  process.exit(1)
}

async function analyzeMetadata() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  )

  const session = driver.session()

  try {
    // Get a sample of memories with metadata
    const result = await session.run(`
      MATCH (m:Memory)
      WHERE m.metadata IS NOT NULL
      RETURN m.content as content, m.metadata as metadata
      LIMIT 20
    `)

    console.log('Sample memories with metadata:')
    console.log('================================')
    
    result.records.forEach((record, index) => {
      const content = record.get('content')
      const metadata = record.get('metadata')
      
      console.log(`\nMemory ${index + 1}:`)
      console.log('Content preview:', content.substring(0, 100) + '...')
      console.log('Metadata:', JSON.stringify(metadata, null, 2))
      
      // Try to detect message type from content
      let detectedType = 'unknown'
      if (content.toLowerCase().includes('user:')) {
        detectedType = 'user'
      } else if (content.toLowerCase().includes('assistant:')) {
        detectedType = 'assistant'
      }
      console.log('Detected type from content:', detectedType)
    })

    // Get statistics on message types
    const statsResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.content =~ '(?i).*user:.*'
      RETURN 'user' as type, count(m) as count
      UNION
      MATCH (m:Memory)
      WHERE m.content =~ '(?i).*assistant:.*'
      RETURN 'assistant' as type, count(m) as count
    `)

    console.log('\n\nMessage type statistics:')
    console.log('========================')
    statsResult.records.forEach(record => {
      console.log(`${record.get('type')}: ${record.get('count')}`)
    })

  } finally {
    await session.close()
    await driver.close()
  }
}

analyzeMetadata().catch(console.error)