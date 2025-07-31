# Pattern Detection System Design

## Executive Summary

This document outlines a comprehensive design for an efficient, scalable pattern detection system that can discover emergent intelligence from the relationships between memories and code entities in Supastate. The system is designed to handle large-scale data while providing real-time insights.

## Core Challenges

1. **Scale**: Millions of memories and code entities across multiple users/projects
2. **Performance**: Current queries timeout due to full graph traversals
3. **Relevance**: Patterns must be meaningful and actionable
4. **Evolution**: Patterns change over time and need continuous validation
5. **Multi-tenancy**: Efficient isolation while enabling cross-tenant insights

## Architectural Principles

### 1. Incremental Processing
- Process data as it arrives, not in bulk
- Build summaries during ingestion
- Update patterns incrementally

### 2. Hierarchical Summarization
- Entity-level summaries (per memory/code)
- Session-level summaries (temporal groupings)
- Project-level summaries (aggregated insights)
- User/Team-level summaries (behavioral patterns)

### 3. Semantic-First Approach
- Use embeddings as primary relationship indicators
- Build semantic clusters before detailed analysis
- Leverage vector indexes for efficient similarity search

## Schema Design

### Summary Nodes

```cypher
// Entity Summary (created during ingestion)
(:EntitySummary {
  id: string,
  entity_id: string,  // Reference to Memory or CodeEntity
  entity_type: 'memory' | 'code',
  
  // Ownership
  user_id: string,
  team_id: string,
  workspace_id: string,
  project_name: string,
  
  // Temporal
  created_at: datetime,
  updated_at: datetime,
  
  // Semantic
  embedding: float[],  // Same as source entity
  semantic_cluster_id: string,  // Assigned cluster
  
  // Pre-computed metrics
  keyword_frequencies: map,  // {error: 5, bug: 2, ...}
  entity_references: string[],  // IDs of referenced entities
  temporal_context: {
    session_id: string,
    sequence_position: int,
    gap_from_previous: duration
  },
  
  // Pattern indicators
  pattern_signals: {
    is_debugging: boolean,
    is_learning: boolean,
    is_refactoring: boolean,
    complexity_score: float,
    urgency_score: float
  }
})

// Session Summary (temporal grouping)
(:SessionSummary {
  id: string,
  user_id: string,
  project_name: string,
  
  start_time: datetime,
  end_time: datetime,
  duration: duration,
  
  // Aggregated data
  entity_count: int,
  dominant_patterns: string[],  // ['debugging', 'refactoring']
  keywords: map,  // Aggregated frequencies
  
  // Semantic summary
  centroid_embedding: float[],  // Average of entity embeddings
  semantic_diversity: float,  // Spread of embeddings
  
  // Relationships
  previous_session_id: string,
  next_session_id: string
})

// Pattern Summary (discovered patterns)
(:PatternSummary {
  id: string,
  pattern_type: string,
  
  // Scope
  scope_type: 'user' | 'project' | 'team' | 'global',
  scope_id: string,
  
  // Pattern data
  first_detected: datetime,
  last_validated: datetime,
  last_updated: datetime,
  
  confidence: float,
  frequency: int,
  stability: float,  // How consistent over time
  
  // Evidence
  supporting_entities: int,  // Count of entities
  example_entity_ids: string[],  // Top examples
  
  // Semantic signature
  pattern_embedding: float[],  // Characteristic embedding
  
  // Metadata
  metadata: map
})

// Semantic Cluster (for efficient similarity)
(:SemanticCluster {
  id: string,
  project_name: string,
  
  // Cluster properties
  centroid_embedding: float[],
  radius: float,
  
  // Metadata
  entity_count: int,
  dominant_keywords: string[],
  cluster_type: string,  // 'memory', 'code', 'mixed'
  
  created_at: datetime,
  updated_at: datetime
})
```

### Relationships

```cypher
// Summary relationships
(:EntitySummary)-[:SUMMARIZES]->(:Memory|:CodeEntity)
(:SessionSummary)-[:CONTAINS_ENTITY]->(:EntitySummary)
(:EntitySummary)-[:IN_CLUSTER]->(:SemanticCluster)
(:PatternSummary)-[:DERIVED_FROM]->(:SessionSummary|:EntitySummary)

// Sequence relationships
(:EntitySummary)-[:PRECEDED_BY {gap: duration}]->(:EntitySummary)
(:SessionSummary)-[:FOLLOWED_BY {gap: duration}]->(:SessionSummary)

// Pattern relationships
(:EntitySummary)-[:EXHIBITS_PATTERN {confidence: float}]->(:PatternSummary)
(:SemanticCluster)-[:INDICATES_PATTERN {strength: float}]->(:PatternSummary)
```

### Indexes

```cypher
// Primary access patterns
CREATE INDEX entity_summary_user_project ON :EntitySummary(user_id, project_name, created_at)
CREATE INDEX session_summary_user_project ON :SessionSummary(user_id, project_name, start_time)
CREATE INDEX pattern_summary_scope ON :PatternSummary(scope_type, scope_id, pattern_type)

// Vector indexes for semantic search
CREATE VECTOR INDEX entity_summary_embedding FOR (e:EntitySummary) ON e.embedding
CREATE VECTOR INDEX cluster_centroid FOR (c:SemanticCluster) ON c.centroid_embedding
CREATE VECTOR INDEX pattern_embedding FOR (p:PatternSummary) ON p.pattern_embedding

// Full-text search
CREATE FULLTEXT INDEX summary_keywords FOR (e:EntitySummary) ON EACH [e.keyword_frequencies]
```

## Processing Pipeline

### 1. Ingestion Phase (Real-time)

```typescript
interface IngestionPipeline {
  async processMemory(memory: Memory): Promise<void> {
    // 1. Create entity summary
    const summary = await createEntitySummary(memory)
    
    // 2. Assign to semantic cluster
    const cluster = await assignToCluster(summary)
    
    // 3. Update session
    const session = await updateOrCreateSession(summary)
    
    // 4. Detect immediate patterns
    const signals = await detectPatternSignals(summary)
    
    // 5. Update sequence relationships
    await updateSequenceRelationships(summary)
    
    // 6. Queue for batch processing
    await queueForBatchAnalysis(summary.id)
  }
}
```

### 2. Batch Processing (Background)

```typescript
interface BatchProcessor {
  async processQueue(): Promise<void> {
    // Process in small batches (100-1000 entities)
    const batch = await getNextBatch()
    
    // 1. Update cluster statistics
    await updateClusterStats(batch)
    
    // 2. Detect session-level patterns
    await detectSessionPatterns(batch)
    
    // 3. Update pattern summaries
    await updatePatternSummaries(batch)
    
    // 4. Prune old summaries
    await pruneOldSummaries()
  }
}
```

### 3. Pattern Detection Strategies

#### A. Semantic Clustering
```typescript
// Use HNSW algorithm for efficient nearest neighbor search
async function assignToCluster(summary: EntitySummary): Promise<SemanticCluster> {
  // Find nearest clusters
  const nearestClusters = await neo4j.query(`
    CALL db.index.vector.queryNodes('cluster_centroid', 10, $embedding)
    YIELD node, score
    WHERE node.project_name = $projectName
      AND score > 0.8  // Similarity threshold
    RETURN node
    LIMIT 1
  `, { embedding: summary.embedding, projectName: summary.project_name })
  
  if (nearestClusters.length > 0) {
    // Add to existing cluster
    return nearestClusters[0]
  } else {
    // Create new cluster
    return createNewCluster(summary)
  }
}
```

#### B. Temporal Pattern Detection
```typescript
// Detect patterns within sessions
async function detectSessionPatterns(sessionId: string): Promise<Pattern[]> {
  const patterns = []
  
  // 1. Work rhythm patterns
  const rhythm = await neo4j.query(`
    MATCH (s:SessionSummary {id: $sessionId})
    MATCH (s)-[:CONTAINS_ENTITY]->(e:EntitySummary)
    WITH s, e ORDER BY e.created_at
    WITH s, collect(e) as entities,
         collect(duration.between(e.created_at, lead(e.created_at))) as gaps
    RETURN s, 
           avg(gaps) as avgGap,
           stdev(gaps) as gapVariance,
           size(entities) as entityCount
  `, { sessionId })
  
  // 2. Focus patterns
  const focus = await neo4j.query(`
    MATCH (s:SessionSummary {id: $sessionId})
    MATCH (s)-[:CONTAINS_ENTITY]->(e:EntitySummary)-[:IN_CLUSTER]->(c:SemanticCluster)
    WITH s, c.id as clusterId, count(e) as clusterFocus
    WHERE clusterFocus > 3
    RETURN s, collect({cluster: clusterId, focus: clusterFocus}) as focusAreas
  `, { sessionId })
  
  return patterns
}
```

#### C. Cross-Entity Pattern Detection
```typescript
// Detect patterns across entities using summaries
async function detectCrossEntityPatterns(projectName: string): Promise<Pattern[]> {
  // Use pre-computed summaries for efficiency
  const debugPatterns = await neo4j.query(`
    MATCH (e:EntitySummary)
    WHERE e.project_name = $projectName
      AND e.pattern_signals.is_debugging = true
      AND e.created_at > datetime() - duration({days: 7})
    WITH date(e.created_at) as day, count(e) as debugCount
    WHERE debugCount > 5
    RETURN 'debugging-spike' as pattern, day, debugCount
  `, { projectName })
  
  return debugPatterns
}
```

## Semantic Search Integration

### 1. Enhanced Memory Search
```typescript
async function searchMemoriesWithPatterns(query: string, options: SearchOptions) {
  const embedding = await getEmbedding(query)
  
  // Search across summaries (more efficient)
  const results = await neo4j.query(`
    CALL db.index.vector.queryNodes('entity_summary_embedding', 20, $embedding)
    YIELD node, score
    WHERE node.entity_type = 'memory'
      AND node.user_id = $userId
    WITH node, score
    
    // Enrich with patterns
    MATCH (node)-[:EXHIBITS_PATTERN]->(p:PatternSummary)
    WITH node, score, collect(p) as patterns
    
    // Get original memory
    MATCH (node)-[:SUMMARIZES]->(m:Memory)
    
    RETURN m, score, patterns
    ORDER BY score DESC
    LIMIT 10
  `, { embedding, userId: options.userId })
  
  return results
}
```

### 2. Pattern-Aware Code Search
```typescript
async function searchCodeWithContext(query: string, options: SearchOptions) {
  // Use semantic clusters for broader matching
  const results = await neo4j.query(`
    // First find relevant clusters
    CALL db.index.vector.queryNodes('cluster_centroid', 5, $embedding)
    YIELD node as cluster, score as clusterScore
    WHERE cluster.project_name = $projectName
    
    // Find entities in those clusters
    MATCH (cluster)<-[:IN_CLUSTER]-(e:EntitySummary)-[:SUMMARIZES]->(c:CodeEntity)
    
    // Boost by pattern associations
    OPTIONAL MATCH (e)-[:EXHIBITS_PATTERN]->(p:PatternSummary)
    WHERE p.pattern_type IN ['architecture', 'debugging']
    
    RETURN c, 
           clusterScore * 0.7 + coalesce(avg(p.confidence), 0) * 0.3 as finalScore,
           collect(distinct p.pattern_type) as relatedPatterns
    ORDER BY finalScore DESC
    LIMIT 20
  `, { embedding: await getEmbedding(query), projectName: options.projectName })
  
  return results
}
```

## Performance Optimizations

### 1. Batch Processing Windows
- Process summaries in 15-minute windows
- Limit batch sizes to 1000 entities
- Use skip-list indexes for time-based queries

### 2. Summary Lifecycle
- Keep detailed summaries for 30 days
- Aggregate to higher-level summaries after 30 days
- Archive raw data after 90 days

### 3. Query Optimization
- Always filter by user/project first
- Use summary nodes instead of raw entities
- Leverage vector indexes for similarity
- Pre-compute common aggregations

## Implementation Phases

### Phase 1: Summary Infrastructure (Week 1)
1. Create summary node schemas
2. Build ingestion pipeline updates
3. Implement basic clustering
4. Create summary indexes

### Phase 2: Pattern Detection (Week 2)
1. Implement session detection
2. Build temporal pattern detectors
3. Create pattern summary system
4. Add incremental updates

### Phase 3: Search Integration (Week 3)
1. Enhance search with summaries
2. Add pattern boosting
3. Implement feedback loops
4. Create pattern APIs

### Phase 4: Background Processing (Week 4)
1. Build edge functions
2. Implement batch processors
3. Add monitoring/metrics
4. Create cleanup jobs

## Success Metrics

1. **Performance**
   - Query response time < 200ms
   - Pattern detection time < 5s per batch
   - CPU usage < 50% average

2. **Quality**
   - Pattern precision > 80%
   - User feedback score > 4/5
   - False positive rate < 10%

3. **Scale**
   - Support 1M+ entities per project
   - Handle 10K+ concurrent users
   - Process 100K+ memories/day

## Next Steps

1. Review and refine schema design
2. Create migration scripts for existing data
3. Build summary generation pipeline
4. Implement incremental pattern detection
5. Create monitoring dashboard

This design prioritizes efficiency, scalability, and real-time insights while maintaining the ability to discover complex emergent patterns across the knowledge graph.