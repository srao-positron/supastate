#!/usr/bin/env npx tsx
import neo4j from 'neo4j-driver'

const NEO4J_URI = 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = 'neo4j'
const NEO4J_PASSWORD = 'XROfdG-0_Idz6zzm6s1C5Bwao6GgW_84T7BeT_uvtW8'

async function main() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    console.log('=== Investigating EntitySummary Duplicates ===\n')
    
    // 1. Find entities with multiple summaries
    console.log('1. Entities with multiple EntitySummary nodes:')
    const duplicateSummaries = await session.run(`
      MATCH (e)<-[:SUMMARIZES]-(s:EntitySummary)
      WITH e, collect(s) as summaries, count(s) as summaryCount
      WHERE summaryCount > 1
      RETURN labels(e)[0] as entityType, e.id as entityId, 
             summaryCount,
             [sum IN summaries | {
               id: sum.id,
               created_at: sum.created_at,
               summary: substring(sum.summary, 0, 50)
             }] as summaryDetails
      ORDER BY summaryCount DESC
      LIMIT 10
    `)
    
    if (duplicateSummaries.records.length === 0) {
      console.log('  No entities found with multiple summaries')
    } else {
      console.log(`  Found ${duplicateSummaries.records.length} entities with multiple summaries:\n`)
      for (const record of duplicateSummaries.records) {
        const entityType = record.get('entityType')
        const entityId = record.get('entityId')
        const summaryCount = record.get('summaryCount').toNumber()
        const details = record.get('summaryDetails')
        
        console.log(`  ${entityType} ${entityId}: ${summaryCount} summaries`)
        for (let i = 0; i < details.length; i++) {
          console.log(`    Summary ${i + 1}:`)
          console.log(`      ID: ${details[i].id}`)
          console.log(`      Created: ${new Date(details[i].created_at).toLocaleString()}`)
          console.log(`      Text: "${details[i].summary}..."`)
        }
        console.log()
      }
    }
    
    // 2. Check timing patterns of duplicate creation
    console.log('\n2. Timing analysis of duplicate EntitySummary creation:')
    const timingAnalysis = await session.run(`
      MATCH (e)<-[:SUMMARIZES]-(s:EntitySummary)
      WITH e, collect(s) as summaries
      WHERE size(summaries) > 1
      WITH e, summaries
      UNWIND summaries as s1
      UNWIND summaries as s2
      WITH s1, s2
      WHERE s1.id < s2.id
      WITH s1, s2, duration.between(s1.created_at, s2.created_at) as timeDiff
      RETURN count(*) as pairCount,
             avg(timeDiff.seconds) as avgSecondsDiff,
             min(timeDiff.seconds) as minSecondsDiff,
             max(timeDiff.seconds) as maxSecondsDiff
    `)
    
    if (timingAnalysis.records.length > 0) {
      const record = timingAnalysis.records[0]
      const pairCount = record.get('pairCount').toNumber()
      const avgDiff = record.get('avgSecondsDiff')
      const minDiff = record.get('minSecondsDiff')
      const maxDiff = record.get('maxSecondsDiff')
      
      console.log(`  Analyzed ${pairCount} duplicate pairs`)
      console.log(`  Average time between duplicates: ${avgDiff} seconds`)
      console.log(`  Minimum time between duplicates: ${minDiff} seconds`)
      console.log(`  Maximum time between duplicates: ${maxDiff} seconds`)
    }
    
    // 3. Check if duplicates have same content
    console.log('\n\n3. Checking if duplicate summaries have identical content:')
    const contentCheck = await session.run(`
      MATCH (e)<-[:SUMMARIZES]-(s:EntitySummary)
      WITH e, collect(s) as summaries
      WHERE size(summaries) > 1
      WITH e, summaries
      UNWIND range(0, size(summaries)-2) as i
      UNWIND range(i+1, size(summaries)-1) as j
      WITH e, summaries[i] as s1, summaries[j] as s2
      WHERE s1.summary = s2.summary
      RETURN labels(e)[0] as entityType, count(*) as identicalPairs
      ORDER BY identicalPairs DESC
    `)
    
    if (contentCheck.records.length === 0) {
      console.log('  No duplicate summaries have identical content')
    } else {
      console.log('  Found entities with identical summary content:')
      for (const record of contentCheck.records) {
        const entityType = record.get('entityType')
        const count = record.get('identicalPairs').toNumber()
        console.log(`    ${entityType}: ${count} pairs with identical content`)
      }
    }
    
    // 4. Check pattern detection batch information
    console.log('\n\n4. Pattern detection batch analysis:')
    const batchAnalysis = await session.run(`
      MATCH (s:EntitySummary)
      WHERE s.entity_type = 'memory' OR s.entity_type = 'code'
      WITH s.batch_id as batchId, count(s) as summariesInBatch,
           min(s.created_at) as batchStart, max(s.created_at) as batchEnd,
           collect(distinct s.entity_type) as entityTypes
      WHERE batchId IS NOT NULL
      RETURN batchId, summariesInBatch, batchStart, batchEnd, entityTypes
      ORDER BY batchStart DESC
      LIMIT 10
    `)
    
    console.log('  Recent pattern detection batches:')
    if (batchAnalysis.records.length === 0) {
      console.log('    No batch_id found in EntitySummary nodes')
    } else {
      for (const record of batchAnalysis.records) {
        const batchId = record.get('batchId')
        const count = record.get('summariesInBatch').toNumber()
        const start = record.get('batchStart')
        const end = record.get('batchEnd')
        const types = record.get('entityTypes')
        
        console.log(`\n    Batch ${batchId}:`)
        console.log(`      Summaries: ${count}`)
        console.log(`      Entity types: ${types.join(', ')}`)
        console.log(`      Start: ${new Date(start).toLocaleString()}`)
        console.log(`      End: ${new Date(end).toLocaleString()}`)
      }
    }
    
    // 5. Check for concurrent pattern detection runs
    console.log('\n\n5. Checking for overlapping pattern detection runs:')
    const concurrentRuns = await session.run(`
      MATCH (s1:EntitySummary), (s2:EntitySummary)
      WHERE s1.id < s2.id
        AND s1.entity_id = s2.entity_id
        AND s1.created_at <= s2.created_at <= s1.created_at + duration('PT5M')
      RETURN s1.entity_id as entityId, 
             s1.created_at as created1, s2.created_at as created2,
             duration.between(s1.created_at, s2.created_at).seconds as secondsApart
      ORDER BY secondsApart ASC
      LIMIT 10
    `)
    
    if (concurrentRuns.records.length === 0) {
      console.log('  No overlapping pattern detection runs found')
    } else {
      console.log('  Found potential concurrent runs creating duplicates:')
      for (const record of concurrentRuns.records) {
        const entityId = record.get('entityId')
        const created1 = record.get('created1')
        const created2 = record.get('created2')
        const seconds = record.get('secondsApart')
        
        console.log(`\n    Entity ${entityId}:`)
        console.log(`      First summary: ${new Date(created1).toLocaleString()}`)
        console.log(`      Second summary: ${new Date(created2).toLocaleString()}`)
        console.log(`      Time apart: ${seconds} seconds`)
      }
    }
    
    // 6. Check unique constraint status
    console.log('\n\n6. Checking constraints on EntitySummary:')
    const constraints = await session.run(`
      SHOW CONSTRAINTS
      WHERE entityType = 'NODE' AND labelsOrTypes = ['EntitySummary']
    `)
    
    if (constraints.records.length === 0) {
      console.log('  ⚠️  No constraints found on EntitySummary nodes!')
    } else {
      console.log('  Existing constraints:')
      for (const record of constraints.records) {
        console.log(`    - ${record.get('name')}: ${record.get('type')}`)
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)