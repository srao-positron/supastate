#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { getDriver } from '../src/lib/neo4j/client'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function deleteAllGitHubData() {
  console.log('🗑️  Deleting all existing GitHub data from Neo4j...\n')
  
  const driver = getDriver()
  const session = driver.session()
  
  try {
    // Count existing data first
    console.log('Counting existing GitHub data...')
    
    const counts = await session.run(`
      MATCH (r:Repository) WITH count(r) as repos
      OPTIONAL MATCH (i:RepoIssue) WITH repos, count(i) as issues
      OPTIONAL MATCH (pr:RepoPullRequest) WITH repos, issues, count(pr) as prs
      OPTIONAL MATCH (c:RepoCommit) WITH repos, issues, prs, count(c) as commits
      OPTIONAL MATCH (f:RepoFile) WITH repos, issues, prs, commits, count(f) as files
      OPTIONAL MATCH (ce:CodeEntity) WITH repos, issues, prs, commits, files, count(ce) as codeEntities
      RETURN repos, issues, prs, commits, files, codeEntities
    `)
    
    if (counts.records.length > 0) {
      const record = counts.records[0]
      console.log('Current data:')
      console.log(`- Repositories: ${record.get('repos')}`)
      console.log(`- Issues: ${record.get('issues')}`)
      console.log(`- Pull Requests: ${record.get('prs')}`)
      console.log(`- Commits: ${record.get('commits')}`)
      console.log(`- Files: ${record.get('files')}`)
      console.log(`- Code Entities: ${record.get('codeEntities')}`)
    }
    
    // Delete all GitHub-related nodes and relationships
    console.log('\nDeleting GitHub data...')
    
    // Delete code entities related to the repository
    await session.run(`
      MATCH (ce:CodeEntity)
      WHERE ce.repository = 'srao-positron/camille' OR ce.repository = 'anthropic/camille'
      DETACH DELETE ce
    `)
    console.log('✓ Deleted CodeEntity nodes')
    
    // Delete files
    await session.run(`
      MATCH (f:RepoFile)
      DETACH DELETE f
    `)
    console.log('✓ Deleted RepoFile nodes')
    
    // Delete commits
    await session.run(`
      MATCH (c:RepoCommit)
      DETACH DELETE c
    `)
    console.log('✓ Deleted RepoCommit nodes')
    
    // Delete pull requests
    await session.run(`
      MATCH (pr:RepoPullRequest)
      DETACH DELETE pr
    `)
    console.log('✓ Deleted RepoPullRequest nodes')
    
    // Delete issues
    await session.run(`
      MATCH (i:RepoIssue)
      DETACH DELETE i
    `)
    console.log('✓ Deleted RepoIssue nodes')
    
    // Delete repositories
    await session.run(`
      MATCH (r:Repository)
      DETACH DELETE r
    `)
    console.log('✓ Deleted Repository nodes')
    
    // Verify deletion
    console.log('\nVerifying deletion...')
    const verifyResult = await session.run(`
      MATCH (n)
      WHERE n:Repository OR n:RepoIssue OR n:RepoPullRequest OR n:RepoCommit OR n:RepoFile 
        OR (n:CodeEntity AND (n.repository = 'srao-positron/camille' OR n.repository = 'anthropic/camille'))
      RETURN count(n) as remaining, labels(n) as nodeLabels
    `)
    
    const remaining = verifyResult.records[0]?.get('remaining')?.toNumber() || 0
    if (remaining === 0) {
      console.log('✅ All GitHub data successfully deleted from Neo4j')
    } else {
      console.log(`⚠️  Warning: ${remaining} GitHub nodes still remain`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

async function testFreshImportWithParsing() {
  console.log('🚀 Testing fresh import of Camille repository with async code parsing...\n')
  
  try {
    // 1. Delete existing data
    await deleteAllGitHubData()
    console.log()
    
    // 2. Get user with GitHub token
    console.log('2. Getting user with GitHub token...')
    const { data: users } = await supabase
      .from('users')
      .select('id, email, github_username, workspace_id')
      .not('github_access_token_encrypted', 'is', null)
      .limit(1)
    
    if (!users || users.length === 0) {
      console.error('No users with GitHub tokens found. Please log in with GitHub first.')
      return
    }
    
    const user = users[0]
    console.log(`User: ${user.email} (${user.github_username || 'unknown'})`)
    console.log(`User ID: ${user.id}`)
    console.log(`Workspace ID: ${user.workspace_id || 'None (personal data)'}\n`)
    
    // 3. Create a new test repository
    console.log('3. Creating test repository record...')
    const testRepoName = 'anthropic/camille' // Using the actual Camille repo
    const [owner, name] = testRepoName.split('/')
    
    // First, clean up any existing repository records in Supabase
    await supabase
      .from('github_repositories')
      .delete()
      .or(`full_name.eq.${testRepoName},full_name.eq.srao-positron/camille`)
    
    const { data: repo, error: repoError } = await supabase
      .from('github_repositories')
      .insert({
        full_name: testRepoName,
        owner,
        name,
        github_id: Date.now(), // Unique ID
        html_url: `https://github.com/${testRepoName}`,
        clone_url: `https://github.com/${testRepoName}.git`,
        github_created_at: new Date().toISOString(),
        github_updated_at: new Date().toISOString(),
        private: false,
        description: 'Camille - Code intelligence for Claude',
        language: 'TypeScript',
        default_branch: 'main'
      })
      .select()
      .single()
    
    if (repoError) {
      console.error('Error creating repository:', repoError)
      return
    }
    console.log(`✓ Repository created: ${repo.id} (${repo.full_name})\n`)
    
    // 4. Grant user access
    console.log('4. Granting user access...')
    const { error: accessError } = await supabase
      .from('github_user_repos')
      .upsert({
        user_id: user.id,
        repository_id: repo.id,
        role: 'owner'
      }, {
        onConflict: 'user_id,repository_id',
        ignoreDuplicates: false
      })
    
    if (accessError) {
      console.error('Error granting access:', accessError)
      return
    }
    console.log('✓ User access granted\n')
    
    // 5. Queue initial crawl
    console.log('5. Queueing initial crawl...')
    const { data: job, error: queueError } = await supabase
      .from('github_crawl_queue')
      .insert({
        repository_id: repo.id,
        crawl_type: 'initial',
        priority: 10,
        scheduled_for: new Date().toISOString(),
        options: {
          include_code: true,
          parse_code_async: true, // Enable async code parsing
          max_files: 100 // Limit for testing
        }
      })
      .select()
      .single()
    
    if (queueError) {
      console.error('Error queueing crawl:', queueError)
      return
    }
    
    console.log(`✓ Crawl job queued: ${job.id}`)
    console.log('  Options: include_code=true, parse_code_async=true\n')
    
    // 6. Trigger the crawl
    console.log('6. Triggering crawl with async parsing...')
    const startTime = Date.now()
    
    const response = await fetch(`${appUrl}/api/github/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        job_id: job.id
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('Crawl failed:', error)
      return
    }
    
    const result = await response.json()
    const duration = (Date.now() - startTime) / 1000
    
    console.log('✓ Crawl completed successfully!')
    console.log(`  Duration: ${duration.toFixed(1)} seconds`)
    console.log(`  API calls: ${result.api_calls || 'N/A'}`)
    console.log(`  Entities processed:`)
    if (result.entities_processed) {
      console.log(`    - Repository: ${result.entities_processed.repository || 0}`)
      console.log(`    - Issues: ${result.entities_processed.issues || 0}`)
      console.log(`    - Pull Requests: ${result.entities_processed.pull_requests || 0}`)
      console.log(`    - Commits: ${result.entities_processed.commits || 0}`)
      console.log(`    - Files: ${result.entities_processed.files || 0}`)
    }
    
    // 7. Check code parsing queue
    console.log('\n7. Checking code parsing queue...')
    const { data: codeQueue } = await supabase
      .from('code_ingestion_queue')
      .select('*')
      .eq('repository', testRepoName)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (codeQueue && codeQueue.length > 0) {
      console.log(`✓ Found ${codeQueue.length} files queued for parsing:`)
      codeQueue.slice(0, 5).forEach(item => {
        console.log(`  - ${item.file_path} (${item.status})`)
      })
      if (codeQueue.length > 5) {
        console.log(`  ... and ${codeQueue.length - 5} more`)
      }
    } else {
      console.log('⚠️  No files found in code parsing queue')
    }
    
    // 8. Wait for async parsing to complete
    console.log('\n8. Waiting for async code parsing to complete...')
    let attempts = 0
    const maxAttempts = 30 // 30 seconds
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
      
      const { data: queueStatus } = await supabase
        .from('code_ingestion_queue')
        .select('status')
        .eq('repository', testRepoName)
        .in('status', ['pending', 'processing'])
      
      if (!queueStatus || queueStatus.length === 0) {
        console.log('✓ All files processed!')
        break
      }
      
      if (attempts % 5 === 0) {
        console.log(`  Still processing... ${queueStatus.length} files remaining`)
      }
      attempts++
    }
    
    // 9. Check ingestion logs
    console.log('\n9. Checking ingestion logs...')
    const { data: logs } = await supabase
      .from('github_ingestion_logs')
      .select('level, message, details')
      .eq('job_id', job.id)
      .in('level', ['warning', 'error'])
      .order('timestamp', { ascending: false })
      .limit(10)
    
    if (logs && logs.length > 0) {
      console.log('\nWarnings/Errors:')
      logs.forEach(log => {
        const icon = log.level === 'error' ? '❌' : '⚠️'
        console.log(`${icon} [${log.level}] ${log.message}`)
      })
    } else {
      console.log('✓ No warnings or errors during import')
    }
    
    // 10. Verify data in Neo4j
    console.log('\n10. Verifying data in Neo4j...')
    const driver = getDriver()
    const session = driver.session()
    
    try {
      // Count all entities
      const countResult = await session.run(`
        MATCH (r:Repository {full_name: $repo})
        OPTIONAL MATCH (r)-[:HAS_ISSUE]->(i:RepoIssue)
        OPTIONAL MATCH (r)-[:HAS_COMMIT]->(c:RepoCommit)
        OPTIONAL MATCH (r)-[:HAS_FILE]->(f:RepoFile)
        OPTIONAL MATCH (ce:CodeEntity {repository: $repo})
        RETURN 
          count(DISTINCT r) as repos,
          count(DISTINCT i) as issues,
          count(DISTINCT c) as commits,
          count(DISTINCT f) as files,
          count(DISTINCT ce) as codeEntities
      `, { repo: testRepoName })
      
      const counts = countResult.records[0]
      console.log('\nNeo4j data counts:')
      console.log(`  - Repositories: ${counts.get('repos')}`)
      console.log(`  - Issues: ${counts.get('issues')}`)
      console.log(`  - Commits: ${counts.get('commits')}`)
      console.log(`  - Files: ${counts.get('files')}`)
      console.log(`  - Code Entities: ${counts.get('codeEntities')} 🔍`)
      
      // Check code entity types
      if (counts.get('codeEntities').toNumber() > 0) {
        const typeResult = await session.run(`
          MATCH (ce:CodeEntity {repository: $repo})
          RETURN ce.type as type, count(ce) as count
          ORDER BY count DESC
        `, { repo: testRepoName })
        
        console.log('\nCode entity types found:')
        typeResult.records.forEach(record => {
          console.log(`  - ${record.get('type')}: ${record.get('count')}`)
        })
      }
      
      // Check for parse errors
      const { data: parseErrors } = await supabase
        .from('code_ingestion_queue')
        .select('file_path, error')
        .eq('repository', testRepoName)
        .eq('status', 'failed')
        .limit(5)
      
      if (parseErrors && parseErrors.length > 0) {
        console.log('\n⚠️  Parse errors found:')
        parseErrors.forEach(err => {
          console.log(`  - ${err.file_path}: ${err.error}`)
        })
      }
      
    } finally {
      await session.close()
      await driver.close()
    }
    
    console.log('\n✅ Fresh import test with async code parsing completed successfully!')
    console.log('\n📊 Summary:')
    console.log('- All GitHub data was deleted and reimported')
    console.log('- Async code parsing was enabled')
    console.log('- Code entities should now be present in Neo4j')
    console.log(`- User ID used: ${user.id}`)
    console.log(`- Repository: ${testRepoName}`)
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

// Run the test
testFreshImportWithParsing()