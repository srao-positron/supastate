import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

async function checkNeo4jCodeEntities() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )

  const session = driver.session()

  try {
    console.log('Checking code entities in Neo4j...\n')

    // Check all node labels
    const labelsResult = await session.run(`
      CALL db.labels() YIELD label
      RETURN label
      ORDER BY label
    `)
    console.log('All node labels in database:')
    labelsResult.records.forEach(record => {
      console.log(`  - ${record.get('label')}`)
    })
    console.log()

    // Get count of CodeEntity nodes
    const codeEntityCount = await session.run(`
      MATCH (e:CodeEntity)
      RETURN COUNT(e) as total
    `)
    console.log(`Total CodeEntity nodes: ${codeEntityCount.records[0].get('total')}`)

    // Get count of Entity nodes
    const entityCount = await session.run(`
      MATCH (e:Entity)
      RETURN COUNT(e) as total
    `)
    console.log(`Total Entity nodes: ${entityCount.records[0].get('total')}`)

    // Get sample of CodeEntity nodes
    const result = await session.run(`
      MATCH (e:CodeEntity)
      RETURN e, properties(e) as props
      LIMIT 10
    `)

    console.log(`\nSample entities (${result.records.length}):\n`)

    result.records.forEach((record, idx) => {
      const props = record.get('props')
      
      console.log(`Entity ${idx + 1}:`)
      console.log(`  ID: ${props.id || 'N/A'}`)
      console.log(`  Name: ${props.name || 'N/A'}`)
      console.log(`  Type: ${props.type || 'N/A'}`)
      console.log(`  File: ${props.file_path || 'N/A'}`)
      console.log(`  Workspace ID: ${props.workspace_id || 'N/A'}`)
      console.log(`  User ID: ${props.user_id || 'N/A'}`)
      console.log(`  Team ID: ${props.team_id || 'N/A'}`)
      console.log()
    })

    // Check workspace ID distribution for CodeEntity
    const workspaceResult = await session.run(`
      MATCH (e:CodeEntity)
      RETURN e.workspace_id as workspace_id, COUNT(e) as count
      ORDER BY count DESC
    `)

    console.log('Workspace ID distribution:')
    workspaceResult.records.forEach(record => {
      console.log(`  ${record.get('workspace_id')}: ${record.get('count')} entities`)
    })

    // Check entity type distribution for CodeEntity
    const typeResult = await session.run(`
      MATCH (e:CodeEntity)
      RETURN e.type as type, COUNT(e) as count
      ORDER BY count DESC
    `)

    console.log('\nEntity type distribution:')
    typeResult.records.forEach(record => {
      console.log(`  ${record.get('type')}: ${record.get('count')} entities`)
    })

    // Check linked entities
    const linkedResult = await session.run(`
      MATCH (e:CodeEntity)-[:RELATED_TO]->(m:Memory)
      RETURN COUNT(DISTINCT e) as linkedCount
    `)
    console.log(`\nLinked CodeEntity nodes: ${linkedResult.records[0].get('linkedCount')}`)

  } finally {
    await session.close()
    await driver.close()
  }
}

checkNeo4jCodeEntities().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})