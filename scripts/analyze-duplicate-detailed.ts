#!/usr/bin/env npx tsx

/**
 * Detailed analysis of duplicate EntitySummary creation patterns
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

async function analyzeDetailedDuplicates() {
  let session: Session | null = null
  
  try {
    console.log('=== Detailed Duplicate EntitySummary Analysis ===\n')
    
    session = driver.session()
    
    // First, check total EntitySummary nodes
    const totalQuery = `
      MATCH (e:EntitySummary)
      RETURN COUNT(e) as total,
             COUNT(DISTINCT e.entityId) as uniqueEntityIds,
             COUNT(CASE WHEN e.entityId IS NULL THEN 1 END) as nullEntityIds,
             COUNT(CASE WHEN e.createdAt IS NOT NULL THEN 1 END) as withTimestamps,
             COUNT(DISTINCT e.workspace_id) as workspaces,
             COUNT(DISTINCT e.user_id) as users
    `
    
    const totalResult = await session.run(totalQuery)
    const totals = totalResult.records[0]
    
    console.log('Overall Statistics:')
    console.log(`  Total EntitySummary nodes: ${totals.get('total').toNumber()}`)
    console.log(`  Unique entityIds: ${totals.get('uniqueEntityIds').toNumber()}`)
    console.log(`  Null entityIds: ${totals.get('nullEntityIds').toNumber()}`)
    console.log(`  With timestamps: ${totals.get('withTimestamps').toNumber()}`)
    console.log(`  Distinct workspaces: ${totals.get('workspaces').toNumber()}`)
    console.log(`  Distinct users: ${totals.get('users').toNumber()}\n`)
    
    // Check the null entityId issue
    console.log('=== Analyzing NULL EntityId Issue ===\n')
    
    const nullQuery = `
      MATCH (e:EntitySummary)
      WHERE e.entityId IS NULL
      RETURN e.workspace_id as workspace,
             e.user_id as user,
             e.entityType as type,
             e.createdAt as created,
             e.lastUpdated as updated,
             e.batch_id as batch,
             ID(e) as nodeId,
             SUBSTRING(e.summary, 0, 100) as summaryPreview
      LIMIT 20
    `
    
    const nullResult = await session.run(nullQuery)
    
    console.log('Sample of EntitySummary nodes with NULL entityId:')
    nullResult.records.forEach((record, idx) => {
      console.log(`\n${idx + 1}. Node ID: ${record.get('nodeId')}`)
      console.log(`   Workspace: ${record.get('workspace')}`)
      console.log(`   User: ${record.get('user')}`)
      console.log(`   Type: ${record.get('type')}`)
      console.log(`   Created: ${record.get('created')}`)
      console.log(`   Batch: ${record.get('batch')}`)
      console.log(`   Summary: ${record.get('summaryPreview')}`)
    })
    
    // Check for proper duplicates (same entityId, not null)
    console.log('\n\n=== Analyzing Real Duplicates (Non-NULL EntityIds) ===\n')
    
    const realDupsQuery = `
      MATCH (e:EntitySummary)
      WHERE e.entityId IS NOT NULL
      WITH e.entityId AS entityId, e.entityType AS entityType,
           COLLECT(e) AS summaries, COUNT(e) AS count
      WHERE count > 1
      RETURN entityId, entityType, count,
             [s IN summaries | {
               id: ID(s),
               created: s.createdAt,
               workspace: s.workspace_id,
               user: s.user_id,
               batch: s.batch_id
             }] AS details
      ORDER BY count DESC
      LIMIT 10
    `
    
    const realDupsResult = await session.run(realDupsQuery)
    
    if (realDupsResult.records.length === 0) {
      console.log('No duplicate EntitySummary nodes found for non-null entityIds!')
    } else {
      console.log(`Found ${realDupsResult.records.length} entities with real duplicates:\n`)
      
      realDupsResult.records.forEach((record, idx) => {
        const entityId = record.get('entityId')
        const entityType = record.get('entityType')
        const count = record.get('count').toNumber()
        const details = record.get('details')
        
        console.log(`${idx + 1}. Entity: ${entityId} (${entityType})`)
        console.log(`   Duplicates: ${count}`)
        
        details.forEach((d: any, i: number) => {
          console.log(`   - Instance ${i + 1}: Created ${d.created || 'no timestamp'}`)
          console.log(`     Workspace: ${d.workspace}, Batch: ${d.batch || 'none'}`)
        })
        
        // Check time differences
        const withTimestamps = details.filter((d: any) => d.created)
        if (withTimestamps.length > 1) {
          const sorted = withTimestamps.sort((a: any, b: any) => 
            new Date(a.created).getTime() - new Date(b.created).getTime()
          )
          
          for (let i = 1; i < sorted.length; i++) {
            const diff = new Date(sorted[i].created).getTime() - 
                        new Date(sorted[i-1].created).getTime()
            if (diff < 5000) {
              console.log(`   ⚠️  Rapid creation detected: ${(diff / 1000).toFixed(2)}s apart`)
            }
          }
        }
        
        console.log('')
      })
    }
    
    // Check relationships from null entityId summaries
    console.log('=== Checking Relationships from NULL EntityId Summaries ===\n')
    
    const relQuery = `
      MATCH (e:EntitySummary)-[r]-(n)
      WHERE e.entityId IS NULL
      RETURN TYPE(r) as relType, 
             labels(n) as nodeLabels,
             COUNT(*) as count
      ORDER BY count DESC
    `
    
    const relResult = await session.run(relQuery)
    
    if (relResult.records.length === 0) {
      console.log('No relationships found for EntitySummary nodes with null entityId')
    } else {
      console.log('Relationships from EntitySummary nodes with null entityId:')
      relResult.records.forEach(record => {
        console.log(`  ${record.get('relType')} -> ${record.get('nodeLabels')}: ${record.get('count').toNumber()}`)
      })
    }
    
    // Check if these null summaries are connected to any real entities
    console.log('\n\n=== Checking What NULL Summaries Summarize ===\n')
    
    const summarizesQuery = `
      MATCH (e:EntitySummary)-[:SUMMARIZES]->(entity)
      WHERE e.entityId IS NULL
      RETURN labels(entity) as entityLabels,
             entity.id as entityId,
             entity.type as entityType,
             COUNT(*) as count
      ORDER BY count DESC
      LIMIT 10
    `
    
    const summarizesResult = await session.run(summarizesQuery)
    
    if (summarizesResult.records.length === 0) {
      console.log('NULL EntitySummary nodes are not connected to any entities via SUMMARIZES relationship!')
    } else {
      console.log('Entities that NULL summaries are connected to:')
      summarizesResult.records.forEach(record => {
        console.log(`  ${record.get('entityLabels')}: ${record.get('entityId')} (${record.get('count').toNumber()} connections)`)
      })
    }
    
    // Final check: Pattern of creation
    console.log('\n\n=== Pattern Detection Summary ===\n')
    
    const patternQuery = `
      MATCH (e:EntitySummary)
      WHERE e.entityId IS NOT NULL AND e.createdAt IS NOT NULL
      WITH date(e.createdAt) as day, 
           e.workspace_id as workspace,
           COUNT(*) as created
      RETURN day, workspace, created
      ORDER BY day DESC, created DESC
      LIMIT 20
    `
    
    const patternResult = await session.run(patternQuery)
    
    console.log('Recent EntitySummary creation patterns:')
    patternResult.records.forEach(record => {
      console.log(`  ${record.get('day')}: ${record.get('created').toNumber()} created in workspace ${record.get('workspace')}`)
    })
    
  } catch (error) {
    console.error('Error analyzing duplicates:', error)
  } finally {
    if (session) {
      await session.close()
    }
    await driver.close()
  }
}

// Run the analysis
analyzeDetailedDuplicates()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })