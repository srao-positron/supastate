import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
})

// Initialize Neo4j driver
function getNeo4jDriver() {
  const NEO4J_URI = Deno.env.get('NEO4J_URI') || 'neo4j+s://eb61aceb.databases.neo4j.io'
  const NEO4J_USER = Deno.env.get('NEO4J_USER') || 'neo4j'
  const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD')

  if (!NEO4J_PASSWORD) {
    throw new Error('NEO4J_PASSWORD environment variable is required')
  }

  return neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 60000,
      maxTransactionRetryTime: 30000
    }
  )
}

// Detect temporal patterns in a session
async function detectTemporalPatterns(sessionId: string, driver: any) {
  const session = driver.session()
  
  try {
    // Analyze entity sequence in session
    const result = await session.run(`
      MATCH (s:SessionSummary {id: $sessionId})
      MATCH (s)-[:CONTAINS_ENTITY]->(e:EntitySummary)
      WITH s, e ORDER BY e.created_at
      WITH s, 
           collect(e) as entities,
           collect(duration.between(e.created_at, lead(e.created_at)).minutes) as gaps
      WHERE size(entities) > 3
      
      // Calculate rhythm metrics
      WITH s,
           size(entities) as entityCount,
           reduce(sum = 0, gap IN gaps | sum + gap) / CASE WHEN size(gaps) > 0 THEN size(gaps) ELSE 1 END as avgGap,
           reduce(maxGap = 0, gap IN gaps | CASE WHEN gap > maxGap THEN gap ELSE maxGap END) as maxGap,
           reduce(minGap = 999, gap IN gaps | CASE WHEN gap < minGap AND gap > 0 THEN gap ELSE minGap END) as minGap
      
      RETURN s.id as sessionId,
             entityCount,
             avgGap,
             maxGap,
             minGap,
             CASE 
               WHEN avgGap < 5 AND maxGap < 10 THEN 'rapid-fire'
               WHEN avgGap BETWEEN 5 AND 15 AND maxGap < 30 THEN 'steady-flow'
               WHEN avgGap > 15 OR maxGap > 30 THEN 'interrupted'
               ELSE 'unknown'
             END as workRhythm
    `, { sessionId })
    
    if (result.records.length > 0) {
      const record = result.records[0]
      const rhythm = record.get('workRhythm')
      
      if (rhythm !== 'unknown') {
        // Store temporal pattern
        await session.run(`
          MERGE (p:PatternSummary {
            id: $patternId,
            pattern_type: 'temporal',
            scope_type: 'session',
            scope_id: $sessionId
          })
          SET p.last_validated = datetime(),
              p.last_updated = datetime(),
              p.confidence = $confidence,
              p.frequency = COALESCE(p.frequency, 0) + 1,
              p.stability = 0.8,
              p.metadata = $metadata
          
          WITH p
          MATCH (s:SessionSummary {id: $sessionId})
          MERGE (s)-[:EXHIBITS_PATTERN {confidence: $confidence}]->(p)
        `, {
          patternId: `temporal-${rhythm}-${sessionId}`,
          sessionId,
          confidence: 0.7,
          metadata: {
            rhythm,
            avgGap: record.get('avgGap'),
            entityCount: record.get('entityCount')
          }
        })
      }
    }
  } finally {
    await session.close()
  }
}

// Detect debugging patterns
async function detectDebuggingPatterns(projectName: string, userId: string, driver: any) {
  const session = driver.session()
  
  try {
    const result = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.project_name = $projectName
        AND e.user_id = $userId
        AND e.pattern_signals.is_debugging = true
        AND e.created_at > datetime() - duration({days: 7})
      
      WITH date(e.created_at) as day,
           count(e) as debugCount,
           collect(e.id)[0..5] as examples
      WHERE debugCount > 3
      
      RETURN day, debugCount, examples
      ORDER BY day DESC
      LIMIT 7
    `, { projectName, userId })
    
    for (const record of result.records) {
      const day = record.get('day')
      const count = record.get('debugCount')
      
      if (count > 5) {
        // Significant debugging activity
        await session.run(`
          MERGE (p:PatternSummary {
            id: $patternId,
            pattern_type: 'debugging',
            scope_type: 'project',
            scope_id: $projectName
          })
          SET p.last_validated = datetime(),
              p.last_updated = datetime(),
              p.confidence = $confidence,
              p.frequency = $frequency,
              p.supporting_entities = $count,
              p.example_entity_ids = $examples,
              p.metadata = $metadata
          
          ON CREATE SET
            p.first_detected = datetime(),
            p.stability = 0.7
        `, {
          patternId: `debugging-spike-${projectName}-${day}`,
          projectName,
          confidence: Math.min(count / 10, 0.9),
          frequency: count,
          count,
          examples: record.get('examples'),
          metadata: {
            day: day.toString(),
            intensity: count > 10 ? 'high' : 'moderate'
          }
        })
      }
    }
  } finally {
    await session.close()
  }
}

// Use LLM to discover complex patterns
async function discoverComplexPatterns(summaries: any[], driver: any) {
  if (summaries.length < 5) return // Need enough data
  
  try {
    // Prepare summaries for LLM analysis
    const summaryData = summaries.map(s => ({
      id: s.id,
      type: s.entity_type,
      keywords: s.keyword_frequencies,
      signals: s.pattern_signals,
      created: s.created_at
    }))
    
    const analysisPrompt = `Analyze these entity summaries and identify patterns:
${JSON.stringify(summaryData, null, 2)}

Look for:
1. Learning progressions (concepts building on each other)
2. Problem-solving patterns (how issues are approached and resolved)
3. Knowledge gaps (areas needing more exploration)
4. Collaboration opportunities (related work by different users)

Return JSON with discovered patterns, each having:
- type: string
- name: string
- confidence: number (0-1)
- entities: array of entity IDs involved
- description: string
- recommendations: string`

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'system',
        content: 'You are a pattern detection expert. Analyze development patterns and provide insights.'
      }, {
        role: 'user',
        content: analysisPrompt
      }],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.7
    })
    
    const analysis = JSON.parse(response.choices[0].message.content || '{"patterns": []}')
    
    // Store discovered patterns
    const session = driver.session()
    try {
      for (const pattern of analysis.patterns || []) {
        await session.run(`
          CREATE (p:PatternSummary {
            id: $patternId,
            pattern_type: $type,
            scope_type: 'analysis',
            scope_id: $scopeId,
            first_detected: datetime(),
            last_validated: datetime(),
            last_updated: datetime(),
            confidence: $confidence,
            frequency: size($entities),
            supporting_entities: size($entities),
            example_entity_ids: $entities,
            metadata: $metadata
          })
          
          WITH p
          UNWIND $entities as entityId
          MATCH (e:EntitySummary {id: entityId})
          CREATE (e)-[:EXHIBITS_PATTERN {confidence: $confidence}]->(p)
        `, {
          patternId: `llm-${pattern.type}-${Date.now()}`,
          type: pattern.type,
          scopeId: summaries[0].project_name,
          confidence: pattern.confidence,
          entities: pattern.entities,
          metadata: {
            name: pattern.name,
            description: pattern.description,
            recommendations: pattern.recommendations,
            llm_generated: true
          }
        })
      }
    } finally {
      await session.close()
    }
  } catch (error) {
    console.error('LLM pattern detection failed:', error)
  }
}

// Update pattern confidence based on new evidence
async function updatePatternConfidence(driver: any) {
  const session = driver.session()
  
  try {
    // Decay old patterns
    await session.run(`
      MATCH (p:PatternSummary)
      WHERE p.last_validated < datetime() - duration({days: 7})
      SET p.confidence = p.confidence * 0.9,
          p.stability = CASE 
            WHEN p.stability > 0.3 THEN p.stability - 0.1 
            ELSE p.stability 
          END
    `)
    
    // Boost patterns with recent evidence
    await session.run(`
      MATCH (p:PatternSummary)<-[r:EXHIBITS_PATTERN]-(e:EntitySummary)
      WHERE e.created_at > datetime() - duration({days: 1})
      WITH p, count(e) as recentEvidence
      WHERE recentEvidence > 2
      SET p.confidence = CASE 
            WHEN p.confidence < 0.9 THEN p.confidence + 0.05 
            ELSE p.confidence 
          END,
          p.last_validated = datetime(),
          p.frequency = p.frequency + recentEvidence
    `)
  } finally {
    await session.close()
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    const driver = getNeo4jDriver()
    
    // Get recent sessions to analyze
    const session = driver.session()
    let recentSessions: any[] = []
    
    try {
      const sessionResult = await session.run(`
        MATCH (s:SessionSummary)
        WHERE s.end_time > datetime() - duration({hours: 1})
          AND NOT EXISTS((s)-[:EXHIBITS_PATTERN]->())
        RETURN s
        ORDER BY s.end_time DESC
        LIMIT 10
      `)
      
      recentSessions = sessionResult.records.map(r => r.get('s').properties)
    } finally {
      await session.close()
    }
    
    console.log(`Found ${recentSessions.length} recent sessions to analyze`)
    
    // Analyze temporal patterns in sessions
    for (const session of recentSessions) {
      await detectTemporalPatterns(session.id, driver)
    }
    
    // Get recent projects with activity
    const projectSession = driver.session()
    let activeProjects: any[] = []
    
    try {
      const projectResult = await projectSession.run(`
        MATCH (e:EntitySummary)
        WHERE e.created_at > datetime() - duration({hours: 6})
        RETURN DISTINCT e.project_name as project, e.user_id as userId, count(e) as activity
        ORDER BY activity DESC
        LIMIT 20
      `)
      
      activeProjects = projectResult.records.map(r => ({
        project: r.get('project'),
        userId: r.get('userId'),
        activity: r.get('activity')
      }))
    } finally {
      await projectSession.close()
    }
    
    // Detect debugging patterns in active projects
    for (const { project, userId } of activeProjects) {
      if (project && userId) {
        await detectDebuggingPatterns(project, userId, driver)
      }
    }
    
    // Get recent entity summaries for LLM analysis
    const summarySession = driver.session()
    let recentSummaries: any[] = []
    
    try {
      const summaryResult = await summarySession.run(`
        MATCH (e:EntitySummary)
        WHERE e.created_at > datetime() - duration({hours: 2})
        RETURN e
        ORDER BY e.created_at DESC
        LIMIT 50
      `)
      
      recentSummaries = summaryResult.records.map(r => r.get('e').properties)
    } finally {
      await summarySession.close()
    }
    
    // Group summaries by project for LLM analysis
    const summariesByProject = recentSummaries.reduce((acc, summary) => {
      const project = summary.project_name || 'default'
      if (!acc[project]) acc[project] = []
      acc[project].push(summary)
      return acc
    }, {} as Record<string, any[]>)
    
    // Run LLM analysis on each project's summaries
    for (const [project, summaries] of Object.entries(summariesByProject)) {
      if (summaries.length >= 5) {
        await discoverComplexPatterns(summaries, driver)
      }
    }
    
    // Update pattern confidence scores
    await updatePatternConfidence(driver)
    
    // Clean up old queue items
    await supabase
      .from('pattern_detection_queue')
      .delete()
      .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .eq('status', 'completed')
    
    await driver.close()
    
    return new Response(
      JSON.stringify({
        success: true,
        analyzed: {
          sessions: recentSessions.length,
          projects: activeProjects.length,
          summaries: recentSummaries.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Pattern detection error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})