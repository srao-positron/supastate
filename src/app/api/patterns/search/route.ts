import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { executeQuery } from '@/lib/neo4j/client'
import { getOwnershipFilter, getOwnershipParams } from '@/lib/neo4j/query-patterns'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const { 
      query,
      patternTypes = [],
      minConfidence = 0.5,
      limit = 20,
      workspaceId 
    } = body
    
    try {
      // Build pattern type filter
      let patternTypeFilter = ''
      if (patternTypes.length > 0) {
        patternTypeFilter = 'AND p.pattern_type IN $patternTypes'
      }
      
      // Search for patterns
      const result = await executeQuery(`
        MATCH (p:PatternSummary)
        WHERE ${getOwnershipFilter({ 
          userId: user.id, 
          workspaceId: workspaceId || undefined, 
          nodeAlias: 'p' 
        })}
          AND p.confidence >= $minConfidence
          ${patternTypeFilter}
          ${query ? 'AND (p.pattern_name CONTAINS $query OR p.metadata CONTAINS $query)' : ''}
        RETURN p
        ORDER BY p.confidence DESC, p.frequency DESC
        LIMIT $limit
      `, {
        ...getOwnershipParams({ userId: user.id, workspaceId: workspaceId || undefined }),
        minConfidence,
        patternTypes,
        query,
        limit
      })
      
      const patterns = result.records.map(record => {
        const pattern = record.p
        // Parse JSON fields
        if (pattern.metadata) {
          try {
            pattern.metadata = JSON.parse(pattern.metadata)
          } catch (e) {
            // Keep as string if parsing fails
          }
        }
        return pattern
      })
      
      // Get related entities for each pattern
      const enrichedPatterns = await Promise.all(patterns.map(async (pattern) => {
        // Get related summaries
        const summariesResult = await executeQuery(`
          MATCH (p:PatternSummary {id: $patternId})
          OPTIONAL MATCH (p)-[:BASED_ON]->(s:EntitySummary)
          OPTIONAL MATCH (s)-[:SUMMARIZES]->(e)
          WHERE e:Memory OR e:CodeEntity
          RETURN 
            count(DISTINCT s) as summaryCount,
            collect(DISTINCT {
              type: CASE 
                WHEN e:Memory THEN 'memory' 
                WHEN e:CodeEntity THEN 'code' 
                ELSE 'unknown' 
              END,
              id: e.id,
              content: substring(e.content, 0, 100)
            })[0..5] as sampleEntities
        `, { patternId: pattern.id })
        
        const enrichment = summariesResult.records[0]
        
        return {
          ...pattern,
          summaryCount: enrichment?.summaryCount || 0,
          sampleEntities: enrichment?.sampleEntities || []
        }
      }))
      
      return NextResponse.json({
        patterns: enrichedPatterns,
        total: enrichedPatterns.length
      })
      
    } catch (sessionError) {
      throw sessionError
    }
    
  } catch (error) {
    console.error('Pattern search error:', error)
    return NextResponse.json(
      { error: 'Failed to search patterns' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const searchParams = request.nextUrl.searchParams
    const workspaceId = searchParams.get('workspaceId')
    
    try {
      // Fetch patterns with counts
      const result = await executeQuery(`
        MATCH (p:PatternSummary)
        WHERE ${getOwnershipFilter({ 
          userId: user.id, 
          workspaceId: workspaceId || undefined, 
          nodeAlias: 'p' 
        })}
        OPTIONAL MATCH (p)-[:BASED_ON]->(s:EntitySummary)
        RETURN 
          p,
          count(DISTINCT s) as entityCount
        ORDER BY p.confidence DESC, p.frequency DESC
        LIMIT 50
      `, {
        ...getOwnershipParams({ userId: user.id, workspaceId: workspaceId || undefined })
      })
      
      const patterns = result.records.map(record => {
        const pattern = record.p
        const entityCount = record.entityCount || 0
        
        // Parse JSON fields
        if (pattern.metadata) {
          try {
            pattern.metadata = JSON.parse(pattern.metadata)
          } catch (e) {
            // Keep as string if parsing fails
          }
        }
        
        return {
          ...pattern,
          entityCount
        }
      })
      
      return NextResponse.json({
        patterns,
        total: patterns.length
      })
      
    } catch (sessionError) {
      throw sessionError
    }
    
  } catch (error) {
    console.error('Pattern fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch patterns' },
      { status: 500 }
    )
  }
}