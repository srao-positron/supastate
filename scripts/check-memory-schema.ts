#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'

async function checkMemorySchema() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // Check Memory node properties
    console.log('Checking Memory node schema...')
    
    const query = `
      MATCH (m:Memory)
      WITH m LIMIT 1
      RETURN keys(m) as properties
    `
    
    const result = await session.run(query)
    const properties = result.records[0]?.get('properties')
    
    console.log('\nMemory node properties:')
    properties?.forEach((prop: string) => console.log(`- ${prop}`))
    
    // Check if embedding property exists and its type
    const embeddingQuery = `
      MATCH (m:Memory)
      WHERE m.embedding IS NOT NULL
      WITH m LIMIT 1
      RETURN 
        size(m.embedding) as embeddingSize,
        m.embedding[..5] as sampleValues
    `
    
    const embeddingResult = await session.run(embeddingQuery)
    if (embeddingResult.records.length > 0) {
      const record = embeddingResult.records[0]
      console.log('\nEmbedding details:')
      console.log('- Size:', record.get('embeddingSize'))
      console.log('- Sample values:', record.get('sampleValues'))
    }
    
    // Check what vector indexes exist for Memory nodes
    const indexQuery = `
      SHOW INDEXES
      WHERE labelsOrTypes = ['Memory'] AND type = 'VECTOR'
    `
    
    const indexResult = await session.run(indexQuery)
    console.log('\nVector indexes on Memory nodes:')
    indexResult.records.forEach(record => {
      const index = record.toObject()
      console.log(`- ${index.name} on property: ${index.properties}`)
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

// Load env
async function main() {
  const envPath = '.env.local'
  const envContent = await import('fs').then(fs => fs.promises.readFile(envPath, 'utf-8'))
  envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=')
    if (key && values.length) {
      process.env[key] = values.join('=')
    }
  })
  
  await checkMemorySchema()
}

main().catch(console.error)