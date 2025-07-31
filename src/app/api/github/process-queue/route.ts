import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // This endpoint requires service role authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY!)) {
      return NextResponse.json(
        { error: 'Unauthorized - Service role key required' },
        { status: 401 }
      )
    }

    console.log('[GitHub Queue Processor] Starting...')

    // Get pending crawl jobs
    const { data: pendingJobs, error: fetchError } = await supabase
      .from('github_crawl_queue')
      .select(`
        id,
        repository_id,
        crawl_type,
        priority,
        data,
        attempts,
        github_repositories!inner (
          id,
          full_name,
          owner,
          name,
          default_branch,
          private
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5)

    if (fetchError) {
      console.error('[GitHub Queue Processor] Error fetching jobs:', fetchError)
      throw fetchError
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('[GitHub Queue Processor] No pending crawl jobs')
      return NextResponse.json({ processed: 0 })
    }

    console.log(`[GitHub Queue Processor] Found ${pendingJobs.length} pending jobs`)

    const results = []

    for (const job of pendingJobs as any[]) {
      try {
        // Call the crawl API
        const crawlResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:3000'}/api/github/crawl`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            job_id: job.id
          })
        })

        if (!crawlResponse.ok) {
          const error = await crawlResponse.json()
          throw new Error(error.error || 'Crawl failed')
        }

        const crawlResult = await crawlResponse.json()
        
        results.push({
          job_id: job.id,
          repository: job.github_repositories.full_name,
          status: 'success',
          entities_processed: crawlResult.entities_processed
        })

        console.log(`[GitHub Queue Processor] Successfully processed ${job.github_repositories.full_name}`)

      } catch (error: any) {
        console.error(`[GitHub Queue Processor] Error processing job ${job.id}:`, error)
        
        results.push({
          job_id: job.id,
          repository: job.github_repositories?.full_name || 'unknown',
          status: 'error',
          error: error.message
        })
      }
    }

    return NextResponse.json({
      processed: results.length,
      results
    })

  } catch (error: any) {
    console.error('[GitHub Queue Processor] Fatal error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}