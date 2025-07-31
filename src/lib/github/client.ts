import { Octokit } from '@octokit/rest'

interface GitHubClientOptions {
  token: string
  onRateLimit?: (retryAfter: number, options: any) => void
  onSecondaryRateLimit?: (retryAfter: number, options: any) => void
}

export class GitHubClient {
  private octokit: Octokit
  private requestCount = 0
  private rateLimitRemaining = 5000
  private rateLimitReset = Date.now()

  constructor(options: GitHubClientOptions) {
    this.octokit = new Octokit({
      auth: options.token,
      request: {
        retries: 3,
        retryAfter: 60
      }
    })
  }

  // Get rate limit info
  async getRateLimit() {
    const { data } = await this.octokit.rateLimit.get()
    return {
      core: data.rate,
      search: data.resources.search,
      graphql: data.resources.graphql
    }
  }

  // Repository methods
  async getRepository(owner: string, repo: string) {
    this.requestCount++
    const { data } = await this.octokit.repos.get({ owner, repo })
    this.updateRateLimit(data)
    return data
  }

  // Issues and PRs
  async listIssues(owner: string, repo: string, options?: {
    state?: 'open' | 'closed' | 'all'
    per_page?: number
    page?: number
    since?: string
  }) {
    this.requestCount++
    const { data } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state: options?.state || 'all',
      per_page: options?.per_page || 100,
      page: options?.page || 1,
      since: options?.since
    })
    this.updateRateLimit(data)
    return data
  }

  async getIssue(owner: string, repo: string, issue_number: number) {
    this.requestCount++
    const { data } = await this.octokit.issues.get({
      owner,
      repo,
      issue_number
    })
    this.updateRateLimit(data)
    return data
  }

  async listIssueComments(owner: string, repo: string, issue_number: number, options?: {
    per_page?: number
    page?: number
  }) {
    this.requestCount++
    const { data } = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number,
      per_page: options?.per_page || 100,
      page: options?.page || 1
    })
    this.updateRateLimit(data)
    return data
  }

  // Pull Requests
  async getPullRequest(owner: string, repo: string, pull_number: number) {
    this.requestCount++
    const { data } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number
    })
    this.updateRateLimit(data)
    return data
  }

  // Commits
  async listCommits(owner: string, repo: string, options?: {
    sha?: string
    per_page?: number
    page?: number
    since?: string
    until?: string
  }) {
    this.requestCount++
    const { data } = await this.octokit.repos.listCommits({
      owner,
      repo,
      sha: options?.sha,
      per_page: options?.per_page || 100,
      page: options?.page || 1,
      since: options?.since,
      until: options?.until
    })
    this.updateRateLimit(data)
    return data
  }

  async getCommit(owner: string, repo: string, ref: string) {
    this.requestCount++
    const { data } = await this.octokit.repos.getCommit({
      owner,
      repo,
      ref
    })
    this.updateRateLimit(data)
    return data
  }

  // Repository content
  async getContent(owner: string, repo: string, path: string, ref?: string) {
    this.requestCount++
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref
    })
    this.updateRateLimit(data)
    return data
  }

  // Get repository tree (all files)
  async getTree(owner: string, repo: string, tree_sha: string, recursive: boolean = true) {
    this.requestCount++
    const { data } = await this.octokit.git.getTree({
      owner,
      repo,
      tree_sha,
      recursive: recursive ? '1' : undefined
    })
    this.updateRateLimit(data)
    return data
  }

  // Webhooks
  async createWebhook(owner: string, repo: string, config: {
    url: string
    secret: string
  }) {
    this.requestCount++
    const { data } = await this.octokit.repos.createWebhook({
      owner,
      repo,
      config: {
        url: config.url,
        content_type: 'json',
        secret: config.secret,
        insecure_ssl: '0'
      },
      events: [
        'push',
        'issues',
        'issue_comment',
        'pull_request',
        'pull_request_review',
        'pull_request_review_comment',
        'release',
        'gollum' // Wiki updates
      ],
      active: true
    })
    this.updateRateLimit(data)
    return data
  }

  async deleteWebhook(owner: string, repo: string, hook_id: number) {
    this.requestCount++
    await this.octokit.repos.deleteWebhook({
      owner,
      repo,
      hook_id
    })
  }

  // Wiki pages (if available)
  async listWikiPages(owner: string, repo: string) {
    try {
      this.requestCount++
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/wiki', {
        owner,
        repo
      })
      return response.data
    } catch (error: any) {
      if (error.status === 404) {
        // Wiki not enabled
        return []
      }
      throw error
    }
  }

  // Helper to check if we're approaching rate limits
  isRateLimited(): boolean {
    return this.rateLimitRemaining < 100
  }

  getRateLimitInfo() {
    return {
      remaining: this.rateLimitRemaining,
      reset: new Date(this.rateLimitReset),
      requestCount: this.requestCount
    }
  }

  private updateRateLimit(response: any) {
    // GitHub returns rate limit info in headers
    // This is a simplified version - in production, parse from response headers
    if (response.headers) {
      this.rateLimitRemaining = parseInt(response.headers['x-ratelimit-remaining'] || '5000')
      this.rateLimitReset = parseInt(response.headers['x-ratelimit-reset'] || '0') * 1000
    }
  }

  // Pagination helper
  async *paginate<T>(
    method: (options: any) => Promise<T[]>,
    baseOptions: any
  ): AsyncGenerator<T, void, unknown> {
    let page = 1
    let hasMore = true

    while (hasMore) {
      const items = await method({ ...baseOptions, page, per_page: 100 })
      
      if (items.length === 0) {
        hasMore = false
      } else {
        for (const item of items) {
          yield item
        }
        page++
      }

      // Be nice to GitHub's API
      if (this.isRateLimited()) {
        console.warn('Approaching rate limit, slowing down...')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }
}

// Factory function to create a client with a user's token
export async function createGitHubClient(token: string): Promise<GitHubClient> {
  return new GitHubClient({
    token,
    onRateLimit: (retryAfter) => {
      console.log(`Rate limited. Waiting ${retryAfter} seconds...`)
    },
    onSecondaryRateLimit: (retryAfter) => {
      console.log(`Secondary rate limit. Waiting ${retryAfter} seconds...`)
    }
  })
}