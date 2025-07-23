import { App } from '@octokit/app'
import { Octokit } from '@octokit/rest'

let _app: App | null = null

export function getGitHubApp(): App {
  if (!_app) {
    const appId = process.env.GITHUB_APP_ID!
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY!
    
    _app = new App({
      appId,
      privateKey,
      webhooks: {
        secret: process.env.GITHUB_APP_WEBHOOK_SECRET!,
      },
    })
  }
  
  return _app
}

export async function getInstallationOctokit(installationId: number) {
  const app = getGitHubApp()
  return await app.getInstallationOctokit(installationId)
}

export async function postPRComment(
  installationId: number,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
) {
  const octokit = await getInstallationOctokit(installationId)
  
  return await (octokit as any).issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  })
}

export async function createCheckRun(
  installationId: number,
  owner: string,
  repo: string,
  headSha: string,
  name: string,
  status: 'queued' | 'in_progress' | 'completed',
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out',
  output?: {
    title: string
    summary: string
    text?: string
  }
) {
  const octokit = await getInstallationOctokit(installationId)
  
  return await (octokit as any).checks.create({
    owner,
    repo,
    name,
    head_sha: headSha,
    status,
    conclusion,
    output,
  })
}

export async function updateCheckRun(
  installationId: number,
  owner: string,
  repo: string,
  checkRunId: number,
  status: 'queued' | 'in_progress' | 'completed',
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out',
  output?: {
    title: string
    summary: string
    text?: string
  }
) {
  const octokit = await getInstallationOctokit(installationId)
  
  return await (octokit as any).checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status,
    conclusion,
    output,
  })
}

export async function getPRDiff(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const octokit = await getInstallationOctokit(installationId)
  
  const { data } = await (octokit as any).pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: 'diff',
    },
  })
  
  return data as unknown as string
}

export async function getPRFiles(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
) {
  const octokit = await getInstallationOctokit(installationId)
  
  const { data } = await (octokit as any).pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100, // Max 3000 files per PR
  })
  
  return data
}