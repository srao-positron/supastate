import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    checks: {}
  }

  try {
    // Test Supabase connection
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    
    // Check if checkpoint table exists
    const { data: checkpoints, error: checkpointError } = await supabase
      .from('pattern_processing_checkpoints')
      .select('*')
    
    results.checks.checkpointTable = {
      exists: !checkpointError,
      error: checkpointError?.message,
      count: checkpoints?.length || 0
    }
    
    // Test Neo4j connection
    const NEO4J_URI = Deno.env.get('NEO4J_URI') || 'neo4j+s://eb61aceb.databases.neo4j.io'
    const NEO4J_USER = Deno.env.get('NEO4J_USER') || 'neo4j'
    const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD')
    
    results.checks.neo4jConfig = {
      hasPassword: !!NEO4J_PASSWORD,
      uri: NEO4J_URI,
      user: NEO4J_USER
    }
    
    if (NEO4J_PASSWORD) {
      const driver = neo4j.driver(
        NEO4J_URI,
        neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
      )
      
      const session = driver.session()
      try {
        // Count memories
        const memoryResult = await session.run(`
          MATCH (m:Memory)
          RETURN count(m) as count
        `)
        results.checks.memories = {
          count: memoryResult.records[0]?.count?.low || 0
        }
        
        // Count existing summaries
        const summaryResult = await session.run(`
          MATCH (s:EntitySummary)
          RETURN count(s) as count
        `)
        results.checks.summaries = {
          count: summaryResult.records[0]?.count?.low || 0
        }
        
        // Check for memories without summaries
        const needsSummaryResult = await session.run(`
          MATCH (m:Memory)
          WHERE m.content IS NOT NULL 
            AND m.embedding IS NOT NULL
            AND NOT EXISTS((m)<-[:SUMMARIZES]-(:EntitySummary))
          RETURN count(m) as count
        `)
        results.checks.memoriesNeedingSummaries = {
          count: needsSummaryResult.records[0]?.count?.low || 0
        }
        
        // Count code entities
        const codeResult = await session.run(`
          MATCH (c:CodeEntity)
          RETURN count(c) as count
        `)
        results.checks.codeEntities = {
          count: codeResult.records[0]?.count?.low || 0
        }
        
        // Check code entities needing summaries
        const codeNeedsSummaryResult = await session.run(`
          MATCH (c:CodeEntity)
          WHERE c.content IS NOT NULL 
            AND c.embedding IS NOT NULL
            AND NOT EXISTS((c)<-[:SUMMARIZES]-(:EntitySummary))
          RETURN count(c) as count
        `)
        results.checks.codeNeedingSummaries = {
          count: codeNeedsSummaryResult.records[0]?.count?.low || 0
        }
        
      } finally {
        await session.close()
        await driver.close()
      }
    }
    
    return new Response(
      JSON.stringify(results, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    results.error = error.message
    results.stack = error.stack
    
    return new Response(
      JSON.stringify(results, null, 2),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})