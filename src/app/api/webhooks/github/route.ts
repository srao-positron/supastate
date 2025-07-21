import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'

// Verify GitHub webhook signature
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const expectedSignature = `sha256=${hmac.digest('hex')}`
  return signature === expectedSignature
}

export async function POST(request: NextRequest) {
  try {
    // Get webhook signature
    const signature = request.headers.get('x-hub-signature-256')
    const githubEvent = request.headers.get('x-github-event')
    
    if (!signature || !githubEvent) {
      return NextResponse.json({ error: 'Missing headers' }, { status: 400 })
    }

    // Get raw body for signature verification
    const body = await request.text()
    
    // Verify signature
    const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET!
    if (!verifyWebhookSignature(body, signature, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Parse payload
    const payload = JSON.parse(body)
    
    // Handle different event types
    switch (githubEvent) {
      case 'pull_request':
        await handlePullRequest(payload)
        break
      case 'pull_request_review':
        await handlePullRequestReview(payload)
        break
      case 'pull_request_review_comment':
        await handlePullRequestReviewComment(payload)
        break
      default:
        console.log(`Unhandled event type: ${githubEvent}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function handlePullRequest(payload: any) {
  const { action, pull_request, repository, installation } = payload
  
  // Only process opened or reopened PRs
  if (action !== 'opened' && action !== 'reopened') {
    return
  }

  const supabase = await createServiceClient()
  
  // Find team associated with this installation
  const { data: team } = await supabase
    .from('teams')
    .select('id')
    .eq('github_installation_id', installation.id)
    .single()
    
  if (!team) {
    console.error('No team found for installation:', installation.id)
    return
  }

  // Create review session
  const prUrl = pull_request.html_url
  const { data: session, error } = await supabase
    .from('review_sessions')
    .insert({
      team_id: team.id,
      pr_url: prUrl,
      pr_number: pull_request.number,
      repository: repository.full_name,
      pr_metadata: {
        title: pull_request.title,
        body: pull_request.body,
        base_branch: pull_request.base.ref,
        head_branch: pull_request.head.ref,
        author: pull_request.user.login,
        installation_id: installation.id,
      },
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create review session:', error)
    return
  }

  // Trigger review orchestration
  // In production, this would queue a job or trigger a serverless function
  console.log('Created review session:', session.id)
  
  // Post initial comment on PR using GitHub App
  const { postPRComment } = await import('@/lib/github/app')
  const [owner, repo] = repository.full_name.split('/')
  await postPRComment(
    installation.id,
    owner,
    repo,
    pull_request.number,
    `🤖 Supastate multi-agent review initiated!\n\nI'll analyze this PR with specialized AI agents. You can track progress [here](${process.env.NEXT_PUBLIC_APP_URL}/reviews/${session.id}).`
  )
}

async function handlePullRequestReview(payload: any) {
  // Handle review events if needed
  console.log('Pull request review event:', payload.action)
}

async function handlePullRequestReviewComment(payload: any) {
  // Handle review comment events if needed
  console.log('Pull request review comment event:', payload.action)
}

