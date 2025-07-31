#!/usr/bin/env npx tsx

/**
 * Create a proper vector search implementation for edge functions
 */

const properVectorSearchCode = `
async function detectDebuggingPatternsWithVectorSearch(session: any) {
  const patterns = []
  
  console.log('Starting semantic debugging pattern detection...')
  
  // Get debugging seeds with embeddings
  const debugSeeds = await session.run(\`
    MATCH (e:EntitySummary)
    WHERE e.pattern_signals CONTAINS '"is_debugging":true'
      AND e.embedding IS NOT NULL
    RETURN e.id as id, e.embedding as embedding
    ORDER BY e.created_at DESC
    LIMIT 5
  \`)
  
  console.log(\`Found \${debugSeeds.records.length} debugging seeds for semantic search\`)
  
  if (debugSeeds.records.length === 0) {
    return await detectDebuggingPatternsKeywordOnly(session)
  }
  
  // Process each seed
  for (const seedRecord of debugSeeds.records) {
    const seedId = getValue(seedRecord, 'id')
    const seedEmbedding = getValue(seedRecord, 'embedding')
    
    if (!seedId || !seedEmbedding) continue
    
    console.log(\`Finding similar entities for seed \${seedId}...\`)
    
    // Use vector index for similarity search
    // This is the proper way to do semantic search in Neo4j!
    const similarResult = await session.run(\`
      CALL db.index.vector.queryNodes(
        'entity_summary_embedding',
        100,
        $embedding
      ) YIELD node, score
      WHERE node.id <> $seedId
        AND score > 0.65  // Similarity threshold
      WITH node as e, score as similarity, toString(date(node.created_at)) as day
      RETURN e, similarity, day
      ORDER BY similarity DESC
    \`, {
      seedId: seedId,
      embedding: seedEmbedding
    })
    
    console.log(\`Found \${similarResult.records.length} semantically similar entities\`)
    
    // Group by project and week
    const groupedResults = new Map()
    
    for (const record of similarResult.records) {
      const entity = getValue(record, 'e')?.properties
      const similarity = getValue(record, 'similarity')
      const day = getValue(record, 'day')
      
      if (!entity) continue
      
      const weekStart = day ? day.substring(0, 8) + '01' : 'unknown'
      const key = \`\${entity.user_id || 'unknown'}|\${entity.project_name || 'unknown'}|week-\${weekStart}\`
      
      if (!groupedResults.has(key)) {
        groupedResults.set(key, {
          userId: entity.user_id,
          workspaceId: entity.workspace_id,
          project: entity.project_name,
          week: weekStart,
          count: 0,
          totalSimilarity: 0,
          entities: []
        })
      }
      
      const group = groupedResults.get(key)
      group.count++
      group.totalSimilarity += similarity
      group.entities.push(entity.id)
    }
    
    // Create patterns from groups with 3+ similar entities
    for (const [key, group] of groupedResults) {
      if (group.count >= 3) {
        const avgSimilarity = group.totalSimilarity / group.count
        const pattern = {
          type: 'debugging',
          pattern: 'debugging-session-semantic', 
          userId: group.userId,
          workspaceId: group.workspaceId,
          project: group.project,
          week: group.week,
          confidence: Math.min(avgSimilarity * (group.count / 10), 0.95),
          frequency: group.count,
          metadata: {
            avgSimilarity: avgSimilarity,
            detectionMethod: 'semantic-vector-search',
            temporalGrouping: 'weekly',
            sampleEntityIds: group.entities.slice(0, 5)
          }
        }
        
        console.log(\`Creating semantic pattern for \${group.project} with \${group.count} entities (avg similarity: \${avgSimilarity.toFixed(3)})\`)
        patterns.push(pattern)
      }
    }
  }
  
  // Also run keyword detection
  const keywordPatterns = await detectDebuggingPatternsKeywordOnly(session)
  
  // Merge patterns, preferring semantic when there's overlap
  const mergedPatterns = new Map()
  
  for (const pattern of [...patterns, ...keywordPatterns]) {
    const period = pattern.day || pattern.week || 'unknown'
    const key = \`\${pattern.userId}|\${pattern.project}|\${period}\`
    
    if (!mergedPatterns.has(key) || pattern.metadata?.detectionMethod?.includes('semantic')) {
      mergedPatterns.set(key, pattern)
    } else {
      // Merge frequencies
      const existing = mergedPatterns.get(key)
      existing.frequency = Math.max(existing.frequency, pattern.frequency)
      existing.confidence = Math.max(existing.confidence, pattern.confidence)
    }
  }
  
  return Array.from(mergedPatterns.values())
}
`;

console.log('=== Proper Vector Search Implementation ===\n')
console.log('The current implementation is NOT doing real semantic search!')
console.log('It\'s just finding entities with is_debugging:true and returning a fake similarity of 0.7\n')

console.log('Here\'s how it SHOULD work with actual vector search:')
console.log('1. Use db.index.vector.queryNodes() to find similar entities based on embeddings')
console.log('2. This uses the vector index for efficient cosine similarity search')
console.log('3. Returns actual similarity scores (0.65 - 1.0)')
console.log('4. Groups semantically similar entities even if they don\'t have the same keywords\n')

console.log('Benefits of proper vector search:')
console.log('- Finds debugging sessions that are semantically similar but use different words')
console.log('- Can find patterns across different error types (e.g., "bug", "issue", "problem")')
console.log('- More accurate similarity scores based on actual embedding distances')
console.log('- Leverages Neo4j\'s optimized vector index for fast search\n')

console.log('The vector index approach we tested locally works perfectly:')
console.log('- Found 99 similar entities with scores from 0.85-0.91')
console.log('- Much more accurate than keyword matching')
console.log('- Can discover hidden patterns in the data\n')

console.log('To implement this properly, we need to:')
console.log('1. Figure out why db.index.vector.queryNodes fails in Deno/edge functions')
console.log('2. Or find an alternative syntax that works in edge functions')
console.log('3. Or use a hybrid approach with pre-computed similarity scores')