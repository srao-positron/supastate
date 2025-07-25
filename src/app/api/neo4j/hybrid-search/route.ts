import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { neo4jService } from '@/lib/neo4j/service'
import OpenAI from 'openai'
import { log } from '@/lib/logger'

// Initialize OpenAI for generating embeddings
let openai: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }
    openai = new OpenAI({ apiKey })
  }
  return openai
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Neo4j service
    try {
      await neo4jService.initialize()
    } catch (initError) {
      const errorMessage = initError instanceof Error ? initError.message : 'Unknown error'
      log.error('Failed to initialize Neo4j', initError, {
        service: 'HybridSearch',
        endpoint: 'POST'
      })
      return NextResponse.json({
        error: 'Failed to connect to Neo4j database',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      }, { status: 503 })
    }

    // Get request body
    const body = await request.json()
    const { 
      query,
      searchType = 'hybrid', // 'vector', 'graph', or 'hybrid'
      filters = {},
      includeRelated = null,
      limit = 30
    } = body

    log.info('Hybrid search request', {
      service: 'HybridSearch',
      hasQuery: !!query,
      searchType,
      filters,
      limit,
      userId: user.id
    })

    let results: any[] = []

    // Generate embedding for vector search if query provided
    let embedding: number[] | undefined
    if (query && (searchType === 'vector' || searchType === 'hybrid')) {
      const response = await getOpenAI().embeddings.create({
        model: 'text-embedding-3-large',
        input: query,
        dimensions: 3072
      })
      embedding = response.data[0].embedding
    }

    // Perform search based on type
    try {
      switch (searchType) {
        case 'vector':
          // Pure vector search across memories and code
          const [memoryResults, codeResults] = await Promise.all([
            neo4jService.searchMemoriesByVector({
              embedding: embedding!,
              limit: limit / 2,
              threshold: filters.minSimilarity || 0.6,
              projectFilter: filters.projectName,
              userFilter: filters.onlyMyContent ? user.id : undefined,
              teamFilter: filters.teamId
            }),
            neo4jService.searchCodeByVector({
              embedding: embedding!,
              limit: limit / 2,
              threshold: filters.minSimilarity || 0.6,
              projectFilter: filters.projectName
            })
          ])
          
          results = [
            ...memoryResults.map(r => ({ ...r, nodeType: 'Memory' })),
            ...codeResults.map(r => ({ ...r, nodeType: 'CodeEntity' }))
          ].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit)
          break

        case 'graph':
          // Pure graph traversal from a starting node
          if (!filters.startNodeId) {
            return NextResponse.json(
              { error: 'startNodeId required for graph search' }, 
              { status: 400 }
            )
          }
          
          const graphResults = await neo4jService.findRelatedNodes({
            startNodeId: filters.startNodeId,
            relationshipTypes: filters.relationshipTypes || [],
            maxDepth: filters.maxDepth || 3,
            direction: filters.direction || 'BOTH'
          })
          
          results = graphResults.map(r => ({
            ...r,
            nodeType: r.node.labels?.[0] || 'Unknown'
          }))
          break

        case 'hybrid':
          // If no query provided, return recent memories for initial load
          if (!embedding) {
            log.info('No query provided, returning recent memories', {
              service: 'HybridSearch',
              searchType: 'hybrid'
            })
            
            // Get recent memories without vector search
            // Note: Using direct string interpolation for LIMIT due to Neo4j driver issue with numeric parameters
            const limitValue = Math.floor(limit)
            const recentMemories = await neo4jService.executeQuery(`
              MATCH (m:Memory)
              ${filters.projectName ? 'WHERE m.project_name = $projectName' : ''}
              RETURN m as node, 0.5 as score
              ORDER BY m.created_at DESC
              LIMIT ${limitValue}
            `, {
              projectName: filters.projectName
            })
            
            results = recentMemories.records.map((record: any) => ({
              node: record.node,
              score: record.score,
              nodeType: 'Memory'
            }))
            break
          }
          
          // Combine vector similarity with graph relationships
          const hybridResults = await neo4jService.hybridSearch({
            embedding,
            filters: {
              projectName: filters.projectName,
              timeRange: filters.timeRange ? {
                start: new Date(filters.timeRange.start),
                end: new Date(filters.timeRange.end)
              } : undefined,
              minSimilarity: filters.minSimilarity
            },
            includeRelated: includeRelated ? {
              types: includeRelated.types || ['DISCUSSES', 'PRECEDED_BY', 'LED_TO_UNDERSTANDING'],
              maxDepth: includeRelated.maxDepth || 2
            } : undefined
          })
          
          results = hybridResults.map(r => ({
            ...r,
            nodeType: 'Memory',
            relatedCount: r.relationships?.length || 0
          }))
          break

        default:
          return NextResponse.json(
            { error: 'Invalid search type' }, 
            { status: 400 }
          )
      }
    } catch (searchError) {
      log.error(`${searchType} search error`, searchError, {
        service: 'HybridSearch',
        searchType,
        endpoint: 'POST'
      })
      // If it's a Neo4j connection error or empty result, handle gracefully
      results = []
    }

    // Get additional context for top results
    const enrichedResults = await enrichResults(results.slice(0, 10))

    // Log search for analytics
    log.info(`User performed ${searchType} search`, {
      service: 'HybridSearch',
      userId: user.id,
      searchType,
      query: query?.substring(0, 50),
      filters,
      resultCount: results.length,
      endpoint: 'POST'
    })

    return NextResponse.json({
      success: true,
      searchType,
      query,
      results: enrichedResults,
      totalResults: results.length,
      filters
    })

  } catch (error) {
    log.error('HybridSearch endpoint error', error, {
      service: 'HybridSearch',
      endpoint: 'POST'
    })
    return NextResponse.json(
      { error: 'Search failed' }, 
      { status: 500 }
    )
  }
}

/**
 * Enrich search results with additional context
 */
async function enrichResults(results: any[]): Promise<any[]> {
  return results.map(result => {
    const node = result.node
    
    // Add human-readable summary based on node type
    let summary = ''
    let title = ''
    
    if (result.nodeType === 'Memory') {
      title = `Memory from ${node.created_at || 'unknown date'}`
      summary = node.content?.substring(0, 200) + '...'
    } else if (result.nodeType === 'CodeEntity') {
      title = `${node.type} ${node.name}`
      summary = `${node.file_path} (lines ${node.line_start}-${node.line_end})`
    }
    
    return {
      ...result,
      title,
      summary,
      // Include key fields based on type
      key: node.id,
      content: node.content,
      metadata: node.metadata,
      // Include relationship info if available
      relatedNodes: result.relationships?.map((r: any) => ({
        id: r.id,
        type: r.labels?.[0],
        name: r.name || r.content?.substring(0, 50)
      }))
    }
  })
}

// GET endpoint for search suggestions based on existing data
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Neo4j service
    try {
      await neo4jService.initialize()
    } catch (initError) {
      log.error('Failed to initialize Neo4j', initError, {
        service: 'HybridSearch',
        endpoint: 'GET'
      })
      // Return empty suggestions instead of error
      return NextResponse.json({
        suggestions: {
          projects: [],
          concepts: [],
          relationships: []
        }
      })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all'

    // Get search suggestions based on type
    let suggestions: any = {}
    
    if (type === 'all' || type === 'projects') {
      // Get user's projects
      const projectsResult = await neo4jService.executeQuery(`
        MATCH (m:Memory)
        WHERE m.user_id = $userId OR m.team_id IN $teamIds
        RETURN DISTINCT m.project_name as name
        ORDER BY name
        LIMIT 20
      `, {
        userId: user.id,
        teamIds: [] // TODO: Get user's team IDs
      })
      
      suggestions.projects = projectsResult.records.map((r: any) => r.name)
    }
    
    if (type === 'all' || type === 'concepts') {
      // Get popular concepts
      const conceptsResult = await neo4jService.executeQuery(`
        MATCH (c:Concept)<-[:DISCUSSES]-(m:Memory)
        WHERE m.user_id = $userId OR m.team_id IN $teamIds
        RETURN c.name as name, count(m) as count
        ORDER BY count DESC
        LIMIT 20
      `, {
        userId: user.id,
        teamIds: []
      })
      
      suggestions.concepts = conceptsResult.records.map((r: any) => ({
        name: r.name,
        count: r.count
      }))
    }
    
    if (type === 'all' || type === 'relationships') {
      // Available relationship types
      suggestions.relationshipTypes = [
        'DISCUSSES',
        'PRECEDED_BY',
        'LED_TO_UNDERSTANDING',
        'CALLS',
        'IMPORTS',
        'EXTENDS',
        'IMPLEMENTS',
        'HAS_METHOD',
        'BELONGS_TO_PROJECT',
        'CREATED'
      ]
    }

    return NextResponse.json({
      success: true,
      suggestions
    })

  } catch (error) {
    log.error('Failed to get suggestions', error, {
      service: 'HybridSearch',
      endpoint: 'GET'
    })
    return NextResponse.json(
      { error: 'Failed to get suggestions' }, 
      { status: 500 }
    )
  }
}