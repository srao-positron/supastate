#!/usr/bin/env npx tsx

/**
 * Check how EntitySummary nodes are being created
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function checkEntitySummaryCreation() {
  const session = driver.session()
  
  try {
    console.log('=== Checking EntitySummary Creation ===\n')
    
    // 1. Check total EntitySummary nodes
    const totalResult = await session.run(`
      MATCH (e:EntitySummary)
      RETURN 
        count(e) as total,
        count(e.embedding) as withEmbedding,
        count(e.pattern_signals) as withSignals,
        count(e.keyword_frequencies) as withKeywords
    `)
    
    const total = totalResult.records[0].get('total').low || 0
    const withEmbedding = totalResult.records[0].get('withEmbedding').low || 0
    const withSignals = totalResult.records[0].get('withSignals').low || 0
    const withKeywords = totalResult.records[0].get('withKeywords').low || 0
    
    console.log(`Total EntitySummary nodes: ${total}`)
    console.log(`  With embeddings: ${withEmbedding}`)
    console.log(`  With pattern_signals: ${withSignals}`)
    console.log(`  With keyword_frequencies: ${withKeywords}`)
    
    // 2. Check relationship to Memory nodes
    const memoryRelResult = await session.run(`
      MATCH (s:EntitySummary)-[:SUMMARIZES]->(m:Memory)
      RETURN count(distinct s) as summariesWithMemory, count(distinct m) as memoriesWithSummary
    `)
    
    console.log(`\nEntitySummaries linked to Memories: ${memoryRelResult.records[0].get('summariesWithMemory').low || 0}`)
    console.log(`Memories with summaries: ${memoryRelResult.records[0].get('memoriesWithSummary').low || 0}`)
    
    // 3. Sample a few EntitySummaries to check their data
    console.log('\nSample EntitySummary nodes:')
    const sampleResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals IS NOT NULL
      RETURN 
        e.id as id,
        e.entity_type as type,
        e.project_name as project,
        e.pattern_signals as signals,
        size(e.embedding) as embSize
      LIMIT 3
    `)
    
    sampleResult.records.forEach((record, idx) => {
      console.log(`\n${idx + 1}. ID: ${record.get('id')}`)
      console.log(`   Type: ${record.get('type')}`)
      console.log(`   Project: ${record.get('project')}`)
      console.log(`   Embedding size: ${record.get('embSize')}`)
      console.log(`   Signals: ${record.get('signals').substring(0, 100)}...`)
    })
    
    // 4. Check if embeddings match between Memory and EntitySummary
    console.log('\n\nChecking embedding consistency...')
    const embeddingCheck = await session.run(`
      MATCH (s:EntitySummary)-[:SUMMARIZES]->(m:Memory)
      WHERE s.embedding IS NOT NULL AND m.embedding IS NOT NULL
      WITH s, m,
           reduce(dot = 0.0, i IN range(0, size(s.embedding)-1) | dot + s.embedding[i] * m.embedding[i]) as dotProduct,
           sqrt(reduce(sum = 0.0, val IN s.embedding | sum + val * val)) as norm1,
           sqrt(reduce(sum = 0.0, val IN m.embedding | sum + val * val)) as norm2
      WITH s.id as summaryId, m.id as memoryId,
           CASE 
             WHEN norm1 = 0 OR norm2 = 0 THEN 0 
             ELSE dotProduct / (norm1 * norm2) 
           END as similarity
      RETURN avg(similarity) as avgSimilarity, min(similarity) as minSim, max(similarity) as maxSim
    `)
    
    if (embeddingCheck.records.length > 0) {
      const avg = embeddingCheck.records[0].get('avgSimilarity')
      const min = embeddingCheck.records[0].get('minSim')
      const max = embeddingCheck.records[0].get('maxSim')
      console.log(`Embedding similarity between EntitySummary and Memory:`)
      console.log(`  Average: ${avg}`)
      console.log(`  Min: ${min}`)
      console.log(`  Max: ${max}`)
      
      if (avg < 0.99) {
        console.log('\n⚠️  WARNING: EntitySummary embeddings don\'t match Memory embeddings!')
        console.log('This suggests embeddings might be recalculated during summary creation.')
      }
    }
    
    // 5. Check distribution of debugging signals
    console.log('\n\nDebugging signal distribution:')
    const debugDistribution = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      WITH e.project_name as project, count(e) as debugCount
      RETURN project, debugCount
      ORDER BY debugCount DESC
      LIMIT 10
    `)
    
    debugDistribution.records.forEach(record => {
      console.log(`  ${record.get('project')}: ${record.get('debugCount').low || 0} debugging entities`)
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkEntitySummaryCreation().catch(console.error)