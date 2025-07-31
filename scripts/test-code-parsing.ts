#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { getDriver } from '../src/lib/neo4j/client'

dotenv.config({ path: '.env.local' })

async function testCodeParsing() {
  console.log('Testing code parsing results...\n')
  
  const driver = getDriver()
  const session = driver.session()
  
  try {
    // Check for parsed functions
    console.log('1. Checking parsed functions...')
    const functionResult = await session.run(`
      MATCH (f:RepoFunction)
      RETURN f.name as name, f.signature as signature, f.is_exported as exported
      LIMIT 10
    `)
    
    if (functionResult.records.length > 0) {
      console.log(`Found ${functionResult.records.length} functions:`)
      functionResult.records.forEach(record => {
        console.log(`  - ${record.get('name')}: ${record.get('signature')} (exported: ${record.get('exported')})`)
      })
    } else {
      console.log('No functions found yet')
    }
    
    // Check for parsed classes
    console.log('\n2. Checking parsed classes...')
    const classResult = await session.run(`
      MATCH (c:RepoClass)
      RETURN c.name as name, c.extends as extends, c.method_count as methods
      LIMIT 10
    `)
    
    if (classResult.records.length > 0) {
      console.log(`Found ${classResult.records.length} classes:`)
      classResult.records.forEach(record => {
        const ext = record.get('extends')
        const name = record.get('name')
        const methods = record.get('methods')
        console.log(`  - ${name}${ext ? ` extends ${ext}` : ''} (${methods} methods)`)
      })
    } else {
      console.log('No classes found yet')
    }
    
    // Check for parsed interfaces
    console.log('\n3. Checking parsed interfaces...')
    const interfaceResult = await session.run(`
      MATCH (i:RepoInterface)
      RETURN i.name as name, i.property_count as props
      LIMIT 10
    `)
    
    if (interfaceResult.records.length > 0) {
      console.log(`Found ${interfaceResult.records.length} interfaces:`)
      interfaceResult.records.forEach(record => {
        console.log(`  - ${record.get('name')} (${record.get('props')} properties)`)
      })
    } else {
      console.log('No interfaces found yet')
    }
    
    // Check relationships
    console.log('\n4. Checking code entity relationships...')
    const relResult = await session.run(`
      MATCH (f:RepoFile)-[r:CONTAINS_FUNCTION|CONTAINS_CLASS|CONTAINS_INTERFACE]->(e)
      RETURN f.path as file, type(r) as rel, labels(e)[0] as type, e.name as name
      LIMIT 10
    `)
    
    if (relResult.records.length > 0) {
      console.log(`Found ${relResult.records.length} relationships:`)
      relResult.records.forEach(record => {
        console.log(`  - ${record.get('file')} ${record.get('rel')} ${record.get('type')} "${record.get('name')}"`)
      })
    } else {
      console.log('No code entity relationships found')
    }
    
    // Summary stats
    console.log('\n5. Summary statistics...')
    const statsResult = await session.run(`
      MATCH (n)
      WHERE n:RepoFunction OR n:RepoClass OR n:RepoInterface
      RETURN labels(n)[0] as type, count(n) as count
    `)
    
    console.log('Code entity counts:')
    statsResult.records.forEach(record => {
      console.log(`  - ${record.get('type')}: ${record.get('count')}`)
    })
    
  } catch (error) {
    console.error('Error testing code parsing:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

testCodeParsing()