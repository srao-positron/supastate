import neo4j from 'neo4j-driver'

const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'localneo4j')
)

async function main() {
  const session = driver.session()
  
  try {
    console.log('=== Checking CodeEntity metadata format ===\n')
    
    // Get a sample CodeEntity with metadata
    const result = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.metadata IS NOT NULL
      RETURN c.name, c.metadata, c.functions
      LIMIT 5
    `)
    
    for (const record of result.records) {
      console.log(`Entity: ${record.get('c.name')}`)
      
      const metadata = record.get('c.metadata')
      const functions = record.get('c.functions')
      
      console.log(`Metadata type: ${typeof metadata}`)
      console.log(`Metadata value:`, metadata)
      
      console.log(`Functions type: ${typeof functions}`)
      console.log(`Functions value:`, functions)
      
      // Try to access functions
      if (metadata && typeof metadata === 'object' && metadata.functions) {
        console.log(`metadata.functions type: ${typeof metadata.functions}`)
        console.log(`metadata.functions:`, metadata.functions)
      }
      
      console.log('---\n')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)
