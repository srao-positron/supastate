import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Neo4j from 'neo4j-driver'
import { GraphData, GraphNode, GraphEdge } from '@/types/graph'

const neo4jUri = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const neo4jUser = process.env.NEO4J_USER || 'neo4j'
const neo4jPassword = process.env.NEO4J_PASSWORD || ''

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const driver = Neo4j.driver(neo4jUri, Neo4j.auth.basic(neo4jUser, neo4jPassword))
  const session = driver.session()

  try {
    // Get user's workspace info
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', user.id)
      .single()

    const userId = user.id
    const teamId = profile?.team_id
    const workspaceId = teamId ? `team:${teamId}` : `user:${userId}`

    // Get query parameters
    const searchQuery = request.nextUrl.searchParams.get('search') || ''
    const entityTypes = request.nextUrl.searchParams.get('types')?.split(',') || ['function', 'class', 'interface', 'type', 'import', 'jsx_component', 'method']
    const relationshipTypes = request.nextUrl.searchParams.get('relationships')?.split(',') || ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'DEFINED_IN', 'REFERENCES_CODE']
    const projectName = request.nextUrl.searchParams.get('project')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100')

    // Fetch nodes
    let nodeQuery = `
      MATCH (e:CodeEntity)
      WHERE (e.workspace_id = $workspaceId 
             OR e.workspace_id = $userWorkspaceId
             OR e.user_id = $userId 
             OR e.team_id = $teamId)
      AND e.type IN $entityTypes
    `
    
    const nodeParams: any = {
      workspaceId,
      userWorkspaceId: `user:${userId}`,
      userId,
      teamId: teamId || null,
      entityTypes,
      limit: Neo4j.int(limit)
    }

    if (searchQuery) {
      nodeQuery += ` AND toLower(e.name) CONTAINS toLower($searchQuery)`
      nodeParams.searchQuery = searchQuery
    }

    if (projectName) {
      nodeQuery += ` AND e.project_name = $projectName`
      nodeParams.projectName = projectName
    }

    nodeQuery += `
      OPTIONAL MATCH (e)-[:DEFINED_IN]->(f:CodeFile)
      RETURN e, f
      LIMIT $limit
    `

    const nodeResult = await session.run(nodeQuery, nodeParams)

    const nodes: GraphNode[] = nodeResult.records.map(record => {
      const entity = record.get('e')
      const file = record.get('f')
      
      return {
        id: entity.properties.id,
        name: entity.properties.name,
        type: entity.properties.type as GraphNode['type'],
        filePath: file?.properties.path || entity.properties.file_path || 'unknown',
        lineNumber: entity.properties.line_start?.toNumber ? 
          entity.properties.line_start.toNumber() : 
          entity.properties.line_start || 1,
        description: entity.properties.signature || entity.properties.content?.substring(0, 100)
      }
    })

    // Get unique node IDs for relationship query
    const nodeIds = nodes.map(n => n.id)

    // Fetch relationships
    let edgeQuery = `
      MATCH (e1:CodeEntity)-[r]->(e2:CodeEntity)
      WHERE e1.id IN $nodeIds 
      AND e2.id IN $nodeIds
      AND type(r) IN $relationshipTypes
      RETURN e1.id as source, e2.id as target, type(r) as type, r as relationship
    `

    const edgeResult = await session.run(edgeQuery, {
      nodeIds,
      relationshipTypes
    })

    const edges: GraphEdge[] = edgeResult.records.map(record => ({
      source: record.get('source'),
      target: record.get('target'),
      type: record.get('type').toLowerCase() as GraphEdge['type'],
      count: record.get('relationship').properties?.count?.toNumber ? 
        record.get('relationship').properties.count.toNumber() : 
        1
    }))

    // Also fetch Memory->CodeEntity relationships if requested
    if (relationshipTypes.includes('REFERENCES_CODE')) {
      const memoryEdgeQuery = `
        MATCH (m:Memory)-[r:REFERENCES_CODE]->(e:CodeEntity)
        WHERE e.id IN $nodeIds
        AND (m.workspace_id = $workspaceId 
             OR m.workspace_id = $userWorkspaceId
             OR m.user_id = $userId 
             OR m.team_id = $teamId)
        RETURN m.id as memoryId, e.id as entityId, r.similarity as similarity
        LIMIT 50
      `

      const memoryEdgeResult = await session.run(memoryEdgeQuery, {
        nodeIds,
        workspaceId,
        userWorkspaceId: `user:${userId}`,
        userId,
        teamId: teamId || null
      })

      // Add memory nodes and edges
      memoryEdgeResult.records.forEach(record => {
        const memoryId = record.get('memoryId')
        const entityId = record.get('entityId')
        const similarity = record.get('similarity')?.toNumber ? 
          record.get('similarity').toNumber() : 0.7

        // Add memory node if not already in nodes
        if (!nodes.find(n => n.id === memoryId)) {
          nodes.push({
            id: memoryId,
            name: `Memory`,
            type: 'module', // Using module as a placeholder for memory nodes
            filePath: 'memory',
            lineNumber: 0,
            description: `Conversation memory linked to code (similarity: ${similarity.toFixed(2)})`
          })
        }

        // Add edge
        edges.push({
          source: memoryId,
          target: entityId,
          type: 'calls', // Using calls as a placeholder for references
          count: Math.round(similarity * 10) // Convert similarity to a count-like metric
        })
      })
    }

    const graphData: GraphData = {
      nodes,
      edges,
      metadata: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        generatedAt: new Date().toISOString()
      }
    }

    return NextResponse.json(graphData)
  } catch (error) {
    console.error('Failed to get code graph:', error)
    return NextResponse.json({ 
      error: 'Failed to get code graph',
      nodes: [],
      edges: [],
      metadata: {
        totalNodes: 0,
        totalEdges: 0,
        generatedAt: new Date().toISOString()
      }
    }, { status: 200 }) // Return empty graph on error
  } finally {
    await session.close()
    await driver.close()
  }
}