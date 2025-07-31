import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

// Verify GitHub webhook signature
function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false

  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const expectedSignature = `sha256=${hmac.digest('hex')}`
  
  // Constant time comparison to prevent timing attacks
  return signature === expectedSignature
}

export async function POST(
  request: NextRequest,
  { params }: { params: { repo_id: string } }
) {
  try {
    const supabase = await createClient()
    const { repo_id } = params

    // Get raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('x-hub-signature-256')
    const event = request.headers.get('x-github-event')
    const deliveryId = request.headers.get('x-github-delivery')

    if (!event) {
      return NextResponse.json(
        { error: 'Missing X-GitHub-Event header' },
        { status: 400 }
      )
    }

    console.log(`[GitHub Webhook] Received ${event} event for repo ${repo_id} (delivery: ${deliveryId})`)

    // Get repository and webhook secret
    const { data: repo, error: repoError } = await supabase
      .from('github_repositories')
      .select('id, full_name, webhook_secret')
      .eq('id', repo_id)
      .single()

    if (repoError || !repo) {
      console.error('[GitHub Webhook] Repository not found:', repo_id)
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      )
    }

    // Verify signature if secret is set
    if (repo.webhook_secret) {
      const isValid = verifyWebhookSignature(rawBody, signature, repo.webhook_secret)
      if (!isValid) {
        console.error('[GitHub Webhook] Invalid signature for repo:', repo.full_name)
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        )
      }
    }

    // Parse payload
    const payload = JSON.parse(rawBody)

    // Determine what needs to be updated based on event type
    let crawlData: any = {
      event,
      delivery_id: deliveryId,
      timestamp: new Date().toISOString()
    }

    switch (event) {
      case 'push':
        // Code was pushed - need to update files and commits
        crawlData.updates = ['commits', 'files']
        crawlData.ref = payload.ref
        crawlData.commits = payload.commits?.map((c: any) => ({
          sha: c.id,
          message: c.message,
          added: c.added,
          modified: c.modified,
          removed: c.removed
        }))
        break

      case 'issues':
        // Issue was created/updated/closed
        crawlData.updates = ['issues']
        crawlData.issue_number = payload.issue?.number
        crawlData.action = payload.action
        break

      case 'issue_comment':
        // Comment added to issue
        crawlData.updates = ['issue_comments']
        crawlData.issue_number = payload.issue?.number
        crawlData.comment_id = payload.comment?.id
        crawlData.action = payload.action
        break

      case 'pull_request':
        // PR was created/updated/closed/merged
        crawlData.updates = ['pull_requests']
        crawlData.pr_number = payload.pull_request?.number
        crawlData.action = payload.action
        crawlData.merged = payload.pull_request?.merged
        break

      case 'pull_request_review':
      case 'pull_request_review_comment':
        // PR review or comment
        crawlData.updates = ['pr_comments']
        crawlData.pr_number = payload.pull_request?.number
        crawlData.comment_id = payload.comment?.id
        crawlData.action = payload.action
        break

      case 'release':
        // New release created
        crawlData.updates = ['releases']
        crawlData.release_tag = payload.release?.tag_name
        crawlData.action = payload.action
        break

      case 'gollum':
        // Wiki page created/updated
        crawlData.updates = ['wiki']
        crawlData.pages = payload.pages
        break

      default:
        console.log(`[GitHub Webhook] Unhandled event type: ${event}`)
        return NextResponse.json({
          success: true,
          message: `Event ${event} acknowledged but not processed`
        })
    }

    // Queue the update
    const { data: queueResult, error: queueError } = await supabase.rpc('queue_github_crawl', {
      p_repository_id: repo.id,
      p_crawl_type: 'webhook',
      p_priority: 25, // High priority for webhook updates
      p_data: crawlData
    })

    if (queueError) {
      console.error('[GitHub Webhook] Failed to queue update:', queueError)
      return NextResponse.json(
        { error: 'Failed to queue update' },
        { status: 500 }
      )
    }

    console.log(`[GitHub Webhook] Queued ${event} update for ${repo.full_name}`)

    return NextResponse.json({
      success: true,
      message: `Webhook event ${event} queued for processing`,
      queue_id: queueResult
    })

  } catch (error) {
    console.error('[GitHub Webhook] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GitHub sends a ping event when webhook is created
export async function GET(
  request: NextRequest,
  { params }: { params: { repo_id: string } }
) {
  return NextResponse.json({
    message: 'GitHub webhook endpoint',
    repo_id: params.repo_id
  })
}