#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { getOwnershipFilter, getOwnershipParams } from '../src/lib/neo4j/query-patterns'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function testDirectSearch() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USERNAME || 'neo4j',
      process.env.NEO4J_PASSWORD || ''
    )
  )
  
  const session = driver.session()
  const context = {
    userId: 'a02c3fed-3a24-442f-becc-97bac8b75e90',
    workspaceId: 'user:a02c3fed-3a24-442f-becc-97bac8b75e90',
    teamId: undefined
  }
  
  console.log('Testing direct search with context:', context)
  console.log('\n--- OWNERSHIP FILTER ---')
  console.log('Filter:', getOwnershipFilter(context))
  console.log('Params:', getOwnershipParams(context))
  
  try {
    console.log('\n--- KEYWORD SEARCH TEST ---')
    
    const keywordResult = await session.run(`
      CALL {
        MATCH (m:Memory)
        WHERE m.content =~ '(?i).*debug.*'
          AND ${getOwnershipFilter({ ...context, nodeAlias: 'm' })}
        RETURN m as entity, 0.7 as score
        LIMIT 5
        
        UNION
        
        MATCH (c:CodeEntity)
        WHERE c.content =~ '(?i).*debug.*'
          AND ${getOwnershipFilter({ ...context, nodeAlias: 'c' })}
        RETURN c as entity, 0.7 as score
        LIMIT 5
      }
      
      WITH entity, score
      RETURN entity, score, labels(entity) as entityType
      ORDER BY score DESC
    `, {
      ...getOwnershipParams(context)
    })
    
    console.log(`Found ${keywordResult.records.length} results for "debug"`)
    keywordResult.records.forEach((record, i) => {
      const entity = record.get('entity')
      const entityType = record.get('entityType')
      console.log(`\n${i + 1}. [${entityType.join(',')}]`)
      console.log(`   ID: ${entity.properties.id}`)
      console.log(`   Workspace: ${entity.properties.workspace_id}`)
      console.log(`   Content: ${entity.properties.content?.substring(0, 100)}...`)
    })
    
    console.log('\n--- PATTERN SEARCH TEST ---')
    
    const patternResult = await session.run(`
      MATCH (p:Pattern)
      WHERE ${getOwnershipFilter({ ...context, nodeAlias: 'p' })}
      RETURN p.type as type, count(p) as count
    `, getOwnershipParams(context))
    
    console.log('\nPattern counts:')
    patternResult.records.forEach(record => {
      console.log(`  ${record.get('type')}: ${record.get('count')}`)
    })
    
    console.log('\n--- ENTITY SUMMARY TEST ---')
    
    const summaryResult = await session.run(`
      MATCH (s:EntitySummary)
      WHERE s.embedding IS NOT NULL
        AND ${getOwnershipFilter({ ...context, nodeAlias: 's' })}
      RETURN count(s) as count
    `, getOwnershipParams(context))
    
    console.log(`\nEntitySummary nodes with embeddings: ${summaryResult.records[0].get('count')}`)
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

testDirectSearch().catch(console.error)