#!/usr/bin/env npx tsx

/**
 * Check constraints on EntitySummary nodes
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'
import type { Session } from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI!
const NEO4J_USERNAME = process.env.NEO4J_USER!
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
)

async function checkConstraints() {
  let session: Session | null = null
  
  try {
    console.log('=== Checking EntitySummary Constraints ===\n')
    
    session = driver.session()
    
    // List all constraints
    const constraints = await session.run(`
      SHOW CONSTRAINTS
    `)
    
    console.log('All constraints in database:')
    let hasEntitySummaryConstraint = false
    
    constraints.records.forEach(record => {
      const name = record.get('name')
      const type = record.get('type')
      const entityType = record.get('entityType')
      const labelsOrTypes = record.get('labelsOrTypes')
      const properties = record.get('properties')
      
      console.log(`\n${name}:`)
      console.log(`  Type: ${type}`)
      console.log(`  Entity: ${entityType} - ${labelsOrTypes}`)
      console.log(`  Properties: ${properties}`)
      
      if (labelsOrTypes?.includes('EntitySummary')) {
        hasEntitySummaryConstraint = true
      }
    })
    
    if (!hasEntitySummaryConstraint) {
      console.log('\n⚠️  No constraints found on EntitySummary nodes')
      console.log('\nRecommended constraint to prevent duplicates:')
      console.log(`
CREATE CONSTRAINT entity_summary_unique IF NOT EXISTS
FOR (s:EntitySummary) 
REQUIRE (s.entity_id, s.entity_type) IS UNIQUE
      `)
    }
    
    // Check indexes on EntitySummary
    console.log('\n\n=== Checking EntitySummary Indexes ===\n')
    
    const indexes = await session.run(`
      SHOW INDEXES
      WHERE labelsOrTypes = ['EntitySummary']
    `)
    
    if (indexes.records.length === 0) {
      console.log('No indexes found on EntitySummary nodes')
    } else {
      indexes.records.forEach(record => {
        console.log(`${record.get('name')}:`)
        console.log(`  Properties: ${record.get('properties')}`)
        console.log(`  Type: ${record.get('type')}`)
        console.log(`  State: ${record.get('state')}`)
      })
    }
    
  } catch (error) {
    console.error('Error checking constraints:', error)
  } finally {
    if (session) {
      await session.close()
    }
    await driver.close()
  }
}

// Run the check
checkConstraints()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })