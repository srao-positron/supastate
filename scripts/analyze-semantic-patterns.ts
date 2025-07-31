#!/usr/bin/env npx tsx

/**
 * Analyze patterns found through semantic search
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function analyzeSemanticPatterns() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  try {
    const session = driver.session()
    
    console.log('\n=== Analyzing Semantic Pattern Detection ===')
    
    // Check patterns detected by different methods
    const patternsByMethod = await session.run(`
      MATCH (p:PatternSummary)
      RETURN 
        p.metadata as metadata,
        p.pattern_type as type,
        p.pattern_name as name,
        p.confidence as confidence,
        p.frequency as frequency
      ORDER BY p.last_updated DESC
      LIMIT 20
    `)
    
    const semanticPatterns: any[] = []
    const keywordPatterns: any[] = []
    
    patternsByMethod.records.forEach(record => {
      const metadata = record.get('metadata')
      const pattern = {
        type: record.get('type'),
        name: record.get('name'),
        confidence: record.get('confidence'),
        frequency: record.get('frequency'),
        metadata: metadata ? JSON.parse(metadata) : {}
      }
      
      if (pattern.metadata.detectionMethod === 'semantic') {
        semanticPatterns.push(pattern)
      } else {
        keywordPatterns.push(pattern)
      }
    })
    
    console.log(`\nPattern Detection Summary:`)
    console.log(`  Semantic patterns: ${semanticPatterns.length}`)
    console.log(`  Keyword patterns: ${keywordPatterns.length}`)
    
    if (semanticPatterns.length > 0) {
      console.log('\n=== Semantic Patterns Found ===')
      semanticPatterns.forEach((pattern, idx) => {
        console.log(`\n${idx + 1}. ${pattern.type} - ${pattern.name}`)
        console.log(`   Confidence: ${pattern.confidence}`)
        console.log(`   Frequency: ${pattern.frequency}`)
        console.log(`   Avg Similarity: ${pattern.metadata.avgSimilarity}`)
        if (pattern.metadata.sampleEntityIds) {
          console.log(`   Sample entities: ${pattern.metadata.sampleEntityIds.length}`)
        }
      })
      
      // Analyze one semantic pattern in detail
      const samplePattern = semanticPatterns[0]
      if (samplePattern?.metadata?.sampleEntityIds?.length > 0) {
        console.log(`\n\n=== Analyzing Semantic Pattern: ${samplePattern.name} ===`)
        
        const entities = await session.run(`
          MATCH (e:EntitySummary)-[:SUMMARIZES]->(m:Memory)
          WHERE e.id IN $entityIds
          RETURN e.keyword_frequencies as keywords, 
                 m.content as content,
                 e.pattern_signals as signals
          LIMIT 5
        `, { entityIds: samplePattern.metadata.sampleEntityIds })
        
        console.log('\nSample entities in this semantic cluster:')
        entities.records.forEach((record, idx) => {
          console.log(`\n${idx + 1}. Keywords: ${record.get('keywords')}`)
          console.log(`   Signals: ${record.get('signals')}`)
          console.log(`   Content: ${record.get('content')?.substring(0, 150)}...`)
        })
      }
    }
    
    // Check if we're finding non-obvious patterns through semantic similarity
    console.log('\n\n=== Checking Semantic Discovery Quality ===')
    
    // Find entities that are semantically similar but have different keywords
    const crossKeywordSimilarity = await session.run(`
      MATCH (e1:EntitySummary)
      WHERE e1.pattern_signals CONTAINS '"is_debugging":true'
      WITH e1 LIMIT 1
      MATCH (e2:EntitySummary)
      WHERE e2.id <> e1.id
        AND e2.embedding IS NOT NULL
        AND e1.embedding IS NOT NULL
        AND NOT (e2.pattern_signals CONTAINS '"is_debugging":true')
      WITH e1, e2, gds.similarity.cosine(e1.embedding, e2.embedding) as similarity
      WHERE similarity > 0.9
      RETURN e1.keyword_frequencies as e1_keywords,
             e2.keyword_frequencies as e2_keywords,
             e1.pattern_signals as e1_signals,
             e2.pattern_signals as e2_signals,
             similarity
      ORDER BY similarity DESC
      LIMIT 5
    `)
    
    if (crossKeywordSimilarity.records.length > 0) {
      console.log('\nFound semantically similar entities with different keywords:')
      crossKeywordSimilarity.records.forEach((record, idx) => {
        console.log(`\n${idx + 1}. Similarity: ${record.get('similarity')}`)
        console.log(`   Entity 1 keywords: ${record.get('e1_keywords')}`)
        console.log(`   Entity 2 keywords: ${record.get('e2_keywords')}`)
        console.log(`   Entity 1 signals: ${record.get('e1_signals')}`)
        console.log(`   Entity 2 signals: ${record.get('e2_signals')}`)
      })
    } else {
      console.log('\nNo cross-keyword semantic similarities found yet.')
    }
    
    await session.close()
  } finally {
    await driver.close()
  }
}

analyzeSemanticPatterns().catch(console.error)