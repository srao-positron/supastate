import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

// Neo4j connection
let driver: any = null

function getDriver() {
  if (!driver) {
    const NEO4J_URI = Deno.env.get('NEO4J_URI') || 'neo4j+s://eb61aceb.databases.neo4j.io'
    const NEO4J_USER = Deno.env.get('NEO4J_USER') || 'neo4j'
    const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD')

    if (!NEO4J_PASSWORD) {
      throw new Error('NEO4J_PASSWORD environment variable is required')
    }

    driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 60000,
      }
    )
  }
  return driver
}

serve(async (req) => {
  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { headers: { 'Content-Type': 'application/json' }, status: 401 }
      )
    }
    
    // Parse request
    const { query, parameters = {} } = await req.json()
    
    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      )
    }
    
    // Execute query
    const neo4jDriver = getDriver()
    const session = neo4jDriver.session()
    
    try {
      const result = await session.run(query, parameters)
      
      const results = result.records.map((record: any) => {
        const obj: any = {}
        record.keys.forEach((key: string) => {
          const value = record.get(key)
          // Convert Neo4j integers to numbers
          if (value && typeof value.toNumber === 'function') {
            obj[key] = value.toNumber()
          } else if (value && value.properties) {
            // Node or relationship
            obj[key] = {
              ...value.properties,
              labels: value.labels,
              type: value.type
            }
          } else {
            obj[key] = value
          }
        })
        return obj
      })
      
      return new Response(
        JSON.stringify({ results }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
      
    } finally {
      await session.close()
    }
    
  } catch (error) {
    console.error('Query error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})