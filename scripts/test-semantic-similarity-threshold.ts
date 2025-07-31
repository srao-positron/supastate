#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'

async function testSemanticThreshold() {
  console.log('🔍 Testing Semantic Similarity Thresholds...\n')

  try {
    await neo4jService.initialize()
    
    // Test different thresholds
    const thresholds = [0.75, 0.70, 0.65, 0.60, 0.55, 0.50]
    
    for (const threshold of thresholds) {
      console.log(`\n📊 Testing threshold: ${threshold}`)
      console.log('─'.repeat(80))
      
      const result = await neo4jService.executeQuery(`
        MATCH (m:EntitySummary {entity_type: 'memory'})
        WHERE m.embedding IS NOT NULL
        WITH m
        LIMIT 5
        MATCH (c:EntitySummary {entity_type: 'code', project_name: m.project_name})
        WHERE c.embedding IS NOT NULL
          AND vector.similarity.cosine(m.embedding, c.embedding) > $threshold
        WITH m.entity_id as memoryId, c.entity_id as codeId, 
             vector.similarity.cosine(m.embedding, c.embedding) as similarity
        RETURN COUNT(*) as matches, MIN(similarity) as minSim, MAX(similarity) as maxSim, AVG(similarity) as avgSim
      `, { threshold })
      
      const record = result.records[0]
      if (record) {
        console.log(`Matches found: ${record.matches?.toNumber() || 0}`)
        console.log(`Similarity range: ${record.minSim?.toFixed(3) || 'N/A'} - ${record.maxSim?.toFixed(3) || 'N/A'}`)
        console.log(`Average similarity: ${record.avgSim?.toFixed(3) || 'N/A'}`)
      }
    }

    // Look at the actual similarity distribution
    console.log('\n📊 Similarity Distribution (sampling 100 pairs):')
    console.log('─'.repeat(80))
    
    const distResult = await neo4jService.executeQuery(`
      MATCH (m:EntitySummary {entity_type: 'memory', project_name: 'supastate'})
      WHERE m.embedding IS NOT NULL
      WITH m
      LIMIT 10
      MATCH (c:EntitySummary {entity_type: 'code', project_name: 'supastate'})
      WHERE c.embedding IS NOT NULL
      WITH m, c, vector.similarity.cosine(m.embedding, c.embedding) as similarity
      ORDER BY similarity DESC
      LIMIT 100
      RETURN 
        CASE 
          WHEN similarity >= 0.9 THEN '0.90-1.00'
          WHEN similarity >= 0.8 THEN '0.80-0.89'
          WHEN similarity >= 0.7 THEN '0.70-0.79'
          WHEN similarity >= 0.6 THEN '0.60-0.69'
          WHEN similarity >= 0.5 THEN '0.50-0.59'
          WHEN similarity >= 0.4 THEN '0.40-0.49'
          ELSE '< 0.40'
        END as bucket,
        COUNT(*) as count
      ORDER BY bucket DESC
    `, {})
    
    distResult.records.forEach(record => {
      console.log(`${record.bucket}: ${record.count?.toNumber() || 0} pairs`)
    })

    // Find the highest similarity pairs
    console.log('\n📊 Top 5 Most Similar Memory-Code Pairs:')
    console.log('─'.repeat(80))
    
    const topPairs = await neo4jService.executeQuery(`
      MATCH (m:EntitySummary {entity_type: 'memory', project_name: 'supastate'})
      WHERE m.embedding IS NOT NULL
      WITH m
      LIMIT 20
      MATCH (c:EntitySummary {entity_type: 'code', project_name: 'supastate'})
      WHERE c.embedding IS NOT NULL
      WITH m, c, vector.similarity.cosine(m.embedding, c.embedding) as similarity
      ORDER BY similarity DESC
      LIMIT 5
      MATCH (memory:Memory {id: m.entity_id})
      MATCH (code:CodeEntity {id: c.entity_id})
      RETURN 
        LEFT(memory.content, 100) as memorySnippet,
        code.name as codeName,
        code.path as codePath,
        similarity
      ORDER BY similarity DESC
    `, {})
    
    topPairs.records.forEach((record, i) => {
      console.log(`\n${i + 1}. Similarity: ${record.similarity?.toFixed(3)}`)
      console.log(`   Memory: "${record.memorySnippet}..."`)
      console.log(`   Code: ${record.codeName} (${record.codePath})`)
    })

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

testSemanticThreshold()