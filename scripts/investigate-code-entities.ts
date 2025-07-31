import { config } from 'dotenv'
import neo4j from 'neo4j-driver'

// Load environment variables
config({ path: '.env.local' })

async function investigateCodeEntities() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )

  try {
    const session = driver.session()
    
    console.log('=== INVESTIGATING CODE ENTITIES ===\n')
    
    // 1. Count total CodeEntity nodes
    const countResult = await session.run('MATCH (c:CodeEntity) RETURN COUNT(c) as count')
    const totalCount = countResult.records[0]?.get('count').toNumber() || 0
    console.log(`Total CodeEntity nodes: ${totalCount}`)
    
    // 2. Check unique IDs
    const uniqueIdsResult = await session.run(
      'MATCH (c:CodeEntity) RETURN COUNT(DISTINCT c.id) as unique_ids'
    )
    const uniqueIds = uniqueIdsResult.records[0]?.get('unique_ids').toNumber() || 0
    console.log(`Unique CodeEntity IDs: ${uniqueIds}`)
    
    // 3. Check if all have the same ID
    console.log('\nChecking if CodeEntities have duplicate IDs:')
    const duplicateCheckResult = await session.run(`
      MATCH (c:CodeEntity)
      WITH c.id as id, COUNT(c) as count
      WHERE count > 1
      RETURN id, count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    if (duplicateCheckResult.records.length > 0) {
      console.log('Found duplicate IDs:')
      duplicateCheckResult.records.forEach(record => {
        console.log(`  ID: ${record.get('id')} appears ${record.get('count')} times`)
      })
    } else {
      console.log('No duplicate IDs found')
    }
    
    // 4. Sample some CodeEntity properties
    console.log('\nSample CodeEntity nodes:')
    const sampleResult = await session.run(`
      MATCH (c:CodeEntity)
      RETURN c.id, c.name, c.type, c.project_name, c.workspace_id, c.user_id
      LIMIT 10
    `)
    
    sampleResult.records.forEach((record, i) => {
      console.log(`\n${i + 1}. CodeEntity:`)
      console.log(`  ID: ${record.get('c.id')}`)
      console.log(`  Name: ${record.get('c.name')}`)
      console.log(`  Type: ${record.get('c.type')}`)
      console.log(`  Project: ${record.get('c.project_name')}`)
      console.log(`  Workspace: ${record.get('c.workspace_id')}`)
      console.log(`  User: ${record.get('c.user_id')}`)
    })
    
    // 5. Check constraints on CodeEntity
    console.log('\n=== CHECKING CONSTRAINTS ===')
    const constraintsResult = await session.run(`
      SHOW CONSTRAINTS
      WHERE entityType = 'NODE' AND labelsOrTypes = ['CodeEntity']
    `)
    
    if (constraintsResult.records.length > 0) {
      console.log('Constraints on CodeEntity:')
      constraintsResult.records.forEach(record => {
        console.log(`  ${record.get('name')}: ${record.get('type')} on ${record.get('properties')}`)
      })
    } else {
      console.log('No constraints found on CodeEntity')
    }
    
    // 6. Check the MERGE logic by looking at actual property combinations
    console.log('\n=== ANALYZING MERGE KEY COMBINATIONS ===')
    const mergeKeyAnalysis = await session.run(`
      MATCH (c:CodeEntity)
      RETURN 
        c.workspace_id as workspace_id,
        c.user_id as user_id,
        c.project_name as project_name,
        c.name as name,
        c.type as type,
        COUNT(*) as count
      ORDER BY count DESC
      LIMIT 20
    `)
    
    console.log('\nUnique combinations of merge keys:')
    mergeKeyAnalysis.records.forEach((record, i) => {
      console.log(`\n${i + 1}. Combination (appears ${record.get('count')} times):`)
      console.log(`  workspace_id: ${record.get('workspace_id')}`)
      console.log(`  user_id: ${record.get('user_id')}`)
      console.log(`  project_name: ${record.get('project_name')}`)
      console.log(`  name: ${record.get('name')}`)
      console.log(`  type: ${record.get('type')}`)
    })
    
    // 7. Check for null values in key fields
    console.log('\n=== CHECKING FOR NULL VALUES IN KEY FIELDS ===')
    const nullCheckResult = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.workspace_id IS NULL OR c.name IS NULL OR c.type IS NULL
      RETURN 
        COUNT(CASE WHEN c.workspace_id IS NULL THEN 1 END) as null_workspace,
        COUNT(CASE WHEN c.user_id IS NULL THEN 1 END) as null_user,
        COUNT(CASE WHEN c.name IS NULL THEN 1 END) as null_name,
        COUNT(CASE WHEN c.type IS NULL THEN 1 END) as null_type,
        COUNT(CASE WHEN c.project_name IS NULL THEN 1 END) as null_project
    `)
    
    const nullRecord = nullCheckResult.records[0]
    if (nullRecord) {
      console.log(`Null workspace_id: ${nullRecord.get('null_workspace')}`)
      console.log(`Null user_id: ${nullRecord.get('null_user')}`)
      console.log(`Null name: ${nullRecord.get('null_name')}`)
      console.log(`Null type: ${nullRecord.get('null_type')}`)
      console.log(`Null project_name: ${nullRecord.get('null_project')}`)
    }
    
    await session.close()
  } catch (error) {
    console.error('Error investigating CodeEntities:', error)
  } finally {
    await driver.close()
  }
}

investigateCodeEntities().catch(console.error)