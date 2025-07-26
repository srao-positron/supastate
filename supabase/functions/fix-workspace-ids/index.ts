import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Neo4j connection
function getDriver() {
  const NEO4J_URI = Deno.env.get('NEO4J_URI') || 'neo4j+s://eb61aceb.databases.neo4j.io'
  const NEO4J_USER = Deno.env.get('NEO4J_USER') || 'neo4j'
  const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD')

  if (!NEO4J_PASSWORD) {
    throw new Error('NEO4J_PASSWORD environment variable is required')
  }

  return neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { workspaceId, projectName, debug } = await req.json()
    
    if (!projectName) {
      return new Response(
        JSON.stringify({ error: 'projectName is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }
    
    // Debug mode - just query and return info
    if (debug) {
      const driver = getDriver()
      const session = driver.session()
      try {
        const countResult = await session.run(`
          MATCH (e:CodeEntity)
          WHERE e.project_name = $projectName
          RETURN count(e) as total, 
                 count(CASE WHEN e.workspace_id IS NOT NULL THEN 1 END) as withWorkspace,
                 collect(DISTINCT e.workspace_id)[0..5] as sampleWorkspaceIds
        `, { projectName })
        
        const record = countResult.records[0]
        const total = record?.get('total')?.toNumber() || 0
        const withWorkspace = record?.get('withWorkspace')?.toNumber() || 0
        const sampleWorkspaceIds = record?.get('sampleWorkspaceIds') || []
        
        // Get a few sample entities
        const sampleResult = await session.run(`
          MATCH (e:CodeEntity)
          WHERE e.project_name = $projectName
          RETURN e.name, e.type, e.workspace_id, e.project_name
          LIMIT 5
        `, { projectName })
        
        const samples = sampleResult.records.map(r => ({
          name: r.get('e.name'),
          type: r.get('e.type'),
          workspace_id: r.get('e.workspace_id'),
          project_name: r.get('e.project_name')
        }))
        
        return new Response(
          JSON.stringify({ 
            debug: true,
            total,
            withWorkspace,
            sampleWorkspaceIds,
            samples
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      } finally {
        await session.close()
        await driver.close()
      }
    }
    
    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: 'workspaceId is required for update mode' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const driver = getDriver()
    const session = driver.session()

    try {
      // Update all CodeEntity nodes with the given project_name to have the workspace_id
      const result = await session.run(`
        MATCH (e:CodeEntity)
        WHERE e.project_name = $projectName AND e.workspace_id IS NULL
        SET e.workspace_id = $workspaceId
        RETURN count(e) as updated
      `, {
        projectName,
        workspaceId
      })

      const updatedCount = result.records[0]?.get('updated')?.toNumber() || 0

      // Also update CodeFile nodes
      const fileResult = await session.run(`
        MATCH (f:CodeFile)
        WHERE f.project_name = $projectName AND f.workspace_id IS NULL
        SET f.workspace_id = $workspaceId
        RETURN count(f) as updated
      `, {
        projectName,
        workspaceId
      })

      const filesUpdated = fileResult.records[0]?.get('updated')?.toNumber() || 0

      return new Response(
        JSON.stringify({ 
          success: true,
          entitiesUpdated: updatedCount,
          filesUpdated: filesUpdated,
          message: `Updated ${updatedCount} entities and ${filesUpdated} files with workspace_id`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )

    } finally {
      await session.close()
      await driver.close()
    }

  } catch (error) {
    console.error('Error updating workspace IDs:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})