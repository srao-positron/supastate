#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

console.log(`
🔧 Pattern Processor Function Updates Needed:
═══════════════════════════════════════════════════════════

1. LOWER SIMILARITY THRESHOLD:
   - Change MIN_SIMILARITY_THRESHOLD from 0.75 to 0.70
   - Our analysis shows most similarities are in 0.70-0.79 range

2. FIX RELATIONSHIP TYPES:
   - Change RELATES_TO to REFERENCES_CODE for Memory->Code
   - Add DISCUSSED_IN for Code->Memory (bidirectional)
   - This is what the dashboard queries expect

3. ADD PATTERN-ENTITY RELATIONSHIPS:
   - Create FOUND_IN relationships from Pattern to EntitySummary
   - Create DERIVED_FROM relationships from Pattern to Memory/Code
   - Use the sampleEntityIds already in pattern metadata

4. FIX MEMORY-CODE RELATIONSHIP CREATION:
   - The semantic matching is creating 0 relationships
   - Need to fix the query to properly match entities
   - Add better logging to debug the issue

Here are the key changes needed:

═══════════════════════════════════════════════════════════
`)

// Create the updated detectMemoryCodeRelationships function
const updatedFunction = `
// Updated constants
const MIN_SIMILARITY_THRESHOLD = 0.70    // Lowered from 0.75

async function detectMemoryCodeRelationships(session: any, workspaceId?: string, userId?: string) {
  await logger.info('Starting memory-code relationship detection...', { 
    functionName: 'detectMemoryCodeRelationships',
    workspaceId,
    userId 
  })
  const patterns = []
  let relationshipsCreated = 0
  
  // Build tenant filter
  const tenantFilter = getTenantFilter(workspaceId, userId, 'm')
  const tenantFilterCode = getTenantFilter(workspaceId, userId, 'c')
  
  // First, get counts to understand the data
  const countResult = await session.run(\`
    MATCH (m:EntitySummary {entity_type: 'memory'})
    WHERE m.embedding IS NOT NULL AND \${tenantFilter}
    WITH COUNT(m) as memoryCount
    MATCH (c:EntitySummary {entity_type: 'code'})
    WHERE c.embedding IS NOT NULL AND \${tenantFilterCode}
    WITH memoryCount, COUNT(c) as codeCount
    RETURN memoryCount, codeCount
  \`)
  
  const counts = countResult.records[0]
  const memoryCount = toNumber(getValue(counts, 'memoryCount'))
  const codeCount = toNumber(getValue(counts, 'codeCount'))
  
  await logger.info(\`Found \${memoryCount} memories and \${codeCount} code entities for relationship detection\`, {
    functionName: 'detectMemoryCodeRelationships',
    memoryCount,
    codeCount
  })
  
  // Process in smaller batches to avoid timeouts
  const BATCH_SIZE = 10
  let offset = 0
  
  while (offset < Math.min(memoryCount, 100)) { // Process up to 100 memories
    // Get a batch of memories
    const memoryBatch = await session.run(\`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WHERE m.embedding IS NOT NULL AND \${tenantFilter}
      RETURN m
      ORDER BY m.created_at DESC
      SKIP \$offset
      LIMIT \$batchSize
    \`, { offset: neo4j.int(offset), batchSize: neo4j.int(BATCH_SIZE) })
    
    if (memoryBatch.records.length === 0) break
    
    await logger.info(\`Processing batch \${offset/BATCH_SIZE + 1} with \${memoryBatch.records.length} memories\`, {
      functionName: 'detectMemoryCodeRelationships',
      batch: offset/BATCH_SIZE + 1,
      size: memoryBatch.records.length
    })
    
    // Process each memory
    for (const memRecord of memoryBatch.records) {
      const memorySummary = getValue(memRecord, 'm')?.properties
      if (!memorySummary) continue
      
      const memoryId = memorySummary.entity_id
      const projectName = memorySummary.project_name
      
      // Find similar code entities
      const semanticResult = await session.run(\`
        MATCH (m:EntitySummary {entity_id: \$memoryId, entity_type: 'memory'})
        MATCH (c:EntitySummary {entity_type: 'code'})
        WHERE c.embedding IS NOT NULL
          AND c.project_name = \$projectName
          AND vector.similarity.cosine(m.embedding, c.embedding) >= \$minSimilarity
        WITH m, c, vector.similarity.cosine(m.embedding, c.embedding) as similarity
        ORDER BY similarity DESC
        LIMIT 5
        
        // Get the actual Memory and CodeEntity nodes
        MATCH (memory:Memory {id: m.entity_id})
        MATCH (code:CodeEntity {id: c.entity_id})
        
        // Check if relationship already exists and limits
        WHERE NOT EXISTS((memory)-[:REFERENCES_CODE]-(code))
          AND SIZE([(memory)-[:REFERENCES_CODE|DISCUSSES]->() | 1]) < \$maxPerEntity
          AND SIZE([(code)<-[:REFERENCES_CODE|DISCUSSED_IN]-() | 1]) < \$maxPerEntity
        
        // Create bidirectional relationships
        CREATE (memory)-[r1:REFERENCES_CODE]->(code)
        SET r1.similarity = similarity,
            r1.detected_at = datetime(),
            r1.detection_method = 'semantic_similarity'
        
        CREATE (code)-[r2:DISCUSSED_IN]->(memory)
        SET r2.similarity = similarity,
            r2.detected_at = datetime(),
            r2.detection_method = 'semantic_similarity'
        
        RETURN count(DISTINCT memory) as created
      \`, {
        memoryId: memoryId,
        projectName: projectName,
        minSimilarity: MIN_SIMILARITY_THRESHOLD,
        maxPerEntity: neo4j.int(MAX_RELATIONSHIPS_PER_ENTITY)
      })
      
      const created = toNumber(getValue(semanticResult.records[0], 'created'))
      if (created > 0) {
        relationshipsCreated += created
        await logger.debug(\`Created \${created} relationships for memory \${memoryId}\`, {
          functionName: 'detectMemoryCodeRelationships',
          memoryId,
          created
        })
      }
    }
    
    offset += BATCH_SIZE
  }
  
  await logger.info(\`Created \${relationshipsCreated} semantic memory-code relationships\`, {
    functionName: 'detectMemoryCodeRelationships',
    relationshipCount: relationshipsCreated
  })
  
  // Also do keyword matching...
  // [Keep existing keyword matching code but update relationship types]
  
  return patterns
}

// Updated storePatternBatch to create relationships
async function storePatternBatch(session: any, patterns: any[], batchId: string) {
  if (patterns.length === 0) return
  
  // Transform patterns to a format suitable for batch processing
  const patternData = patterns.map(pattern => ({
    patternId: \`\${pattern.type}-\${pattern.pattern}-\${batchId}-\${Date.now()}-\${Math.random()}\`,
    type: pattern.type,
    pattern: pattern.pattern,
    confidence: pattern.confidence || 0.5,
    frequency: pattern.frequency || 1,
    scopeId: pattern.userId || pattern.workspaceId || 'global',
    scopeData: JSON.stringify({
      project: pattern.project,
      period: pattern.day || pattern.week || 'unknown'
    }),
    metadata: JSON.stringify(pattern.metadata || {}),
    userId: pattern.userId || null,
    workspaceId: pattern.workspaceId || null,
    project: pattern.project || null,
    sampleEntityIds: pattern.metadata?.sampleEntityIds || []
  }))
  
  try {
    // First create all pattern nodes
    await session.run(\`
      UNWIND \$patterns AS pattern
      MERGE (p:Pattern {
        pattern_type: pattern.type,
        pattern_name: pattern.pattern,
        scope_id: pattern.scopeId,
        scope_data: pattern.scopeData
      })
      ON CREATE SET
        p.id = pattern.patternId,
        p.type = pattern.type,
        p.name = pattern.pattern,
        p.confidence = pattern.confidence,
        p.frequency = pattern.frequency,
        p.first_detected = datetime(),
        p.last_validated = datetime(),
        p.last_updated = datetime(),
        p.batch_id = \$batchId,
        p.metadata = pattern.metadata,
        p.user_id = pattern.userId,
        p.workspace_id = pattern.workspaceId,
        p.project = pattern.project
      ON MATCH SET
        p.frequency = p.frequency + pattern.frequency,
        p.confidence = CASE 
          WHEN pattern.confidence > p.confidence THEN pattern.confidence 
          ELSE p.confidence 
        END,
        p.last_validated = datetime(),
        p.last_updated = datetime()
    \`, {
      patterns: patternData,
      batchId
    })
    
    // Then create relationships to source entities
    for (const pattern of patternData) {
      if (pattern.sampleEntityIds && pattern.sampleEntityIds.length > 0) {
        // Create FOUND_IN relationships to EntitySummary nodes
        await session.run(\`
          MATCH (p:Pattern {id: \$patternId})
          UNWIND \$entityIds AS entityId
          MATCH (e:EntitySummary {id: entityId})
          MERGE (p)-[r:FOUND_IN]->(e)
          SET r.created_at = datetime()
        \`, {
          patternId: pattern.patternId,
          entityIds: pattern.sampleEntityIds
        })
        
        // Also create DERIVED_FROM relationships to the actual Memory/CodeEntity nodes
        await session.run(\`
          MATCH (p:Pattern {id: \$patternId})
          UNWIND \$entityIds AS summaryId
          MATCH (s:EntitySummary {id: summaryId})
          MATCH (s)-[:SUMMARIZES]->(entity)
          WHERE entity:Memory OR entity:CodeEntity
          MERGE (p)-[r:DERIVED_FROM]->(entity)
          SET r.created_at = datetime(),
              r.via_summary = summaryId
        \`, {
          patternId: pattern.patternId,
          entityIds: pattern.sampleEntityIds
        })
        
        await logger.debug(\`Created relationships for pattern \${pattern.patternId}\`, {
          functionName: 'storePatternBatch',
          patternId: pattern.patternId,
          entityCount: pattern.sampleEntityIds.length
        })
      }
    }
    
    await logger.info(\`Stored batch of \${patterns.length} patterns with relationships\`, {
      functionName: 'storePatternBatch',
      patternCount: patterns.length,
      batchId
    })
  } catch (error) {
    await logger.error(\`Failed to store pattern batch\`, error, {
      functionName: 'storePatternBatch',
      patternCount: patterns.length,
      batchId,
      error: error.message
    })
    throw error
  }
}
`

console.log('\n📝 Updated Function Code:')
console.log('─'.repeat(80))
console.log(updatedFunction)

console.log('\n✅ Next Steps:')
console.log('1. Update pattern-processor/index.ts with these changes')
console.log('2. Deploy the updated function')
console.log('3. Clear Pattern nodes and re-run pattern detection')
console.log('4. Verify relationships are created correctly')