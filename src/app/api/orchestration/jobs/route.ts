import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getOrchestrationService } from '@/lib/orchestration/service'
import { z } from 'zod'
import { createHash } from 'crypto'

const CreateJobSchema = z.object({
  type: z.enum(['repo_analysis', 'pr_review', 'pattern_analysis']),
  metadata: z.object({
    repository: z.string().optional(),
    branch: z.string().optional(),
    pr_url: z.string().optional(),
    review_style: z.enum(['thorough', 'quick', 'security-focused']).optional(),
    pattern_type: z.enum(['architecture', 'dependencies', 'anti_patterns']).optional(),
  }),
})

/**
 * Create a new orchestration job
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing API key' } },
        { status: 401 }
      )
    }

    const apiKey = authHeader.slice(7)
    const keyHash = createHash('sha256').update(apiKey).digest('hex')
    
    const supabase = await createServiceClient()
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('team_id, user_id')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single()

    if (keyError || !keyData) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { type, metadata } = CreateJobSchema.parse(body)

    // Validate job-specific requirements
    if (type === 'repo_analysis' && !metadata.repository) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Repository required for repo_analysis' } },
        { status: 400 }
      )
    }

    if (type === 'pr_review' && !metadata.pr_url) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'PR URL required for pr_review' } },
        { status: 400 }
      )
    }

    // Create the job
    const orchestrationService = getOrchestrationService()
    const job = await orchestrationService.createJob(
      type,
      keyData.team_id,
      metadata,
      keyData.user_id
    )

    return NextResponse.json({
      success: true,
      data: {
        job_id: job.id,
        type: job.type,
        status: job.status,
        created_at: job.created_at,
        stream_url: `/api/orchestration/jobs/${job.id}/events`,
      },
      message: 'Job created successfully',
    })
  } catch (error: any) {
    console.error('Create job error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'Invalid request data',
            details: error.errors 
          } 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'Failed to create job' 
        } 
      },
      { status: 500 }
    )
  }
}

/**
 * Get orchestration jobs
 */
export async function GET(request: NextRequest) {
  try {
    // Validate API key
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing API key' } },
        { status: 401 }
      )
    }

    const apiKey = authHeader.slice(7)
    const keyHash = createHash('sha256').update(apiKey).digest('hex')
    
    const supabase = await createServiceClient()
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('team_id')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single()

    if (keyError || !keyData) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } },
        { status: 401 }
      )
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('orchestration_jobs')
      .select('*', { count: 'exact' })
      .eq('team_id', keyData.team_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (type) {
      query = query.eq('type', type)
    }

    const { data: jobs, error, count } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data: {
        jobs: jobs || [],
        pagination: {
          total: count || 0,
          limit,
          offset,
        },
      },
    })
  } catch (error: any) {
    console.error('Get jobs error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'Failed to fetch jobs' 
        } 
      },
      { status: 500 }
    )
  }
}