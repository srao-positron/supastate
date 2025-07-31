#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testFreshImport() {
  console.log('Testing fresh import of Camille repository...\n')
  
  try {
    // 1. Get user and repository
    console.log('1. Getting user and repository...')
    const { data: users } = await supabase
      .from('users')
      .select('id, email, github_username')
      .not('github_access_token_encrypted', 'is', null)
      .limit(1)
    
    if (!users || users.length === 0) {
      console.error('No users with GitHub tokens found')
      return
    }
    
    const user = users[0]
    console.log(`User: ${user.email} (${user.github_username})`)
    
    const { data: repos } = await supabase
      .from('github_repositories')
      .select('*')
      .eq('full_name', 'srao-positron/camille')
      .single()
    
    if (!repos) {
      console.error('Camille repository not found')
      return
    }
    
    console.log(`Repository: ${repos.full_name} (${repos.id})\n`)
    
    // 2. Queue initial crawl
    console.log('2. Queueing initial crawl...')
    const { data: job, error: queueError } = await supabase
      .from('github_crawl_queue')
      .insert({
        repository_id: repos.id,
        crawl_type: 'initial',
        priority: 10,
        scheduled_for: new Date().toISOString()
      })
      .select()
      .single()
    
    if (queueError) {
      console.error('Error queueing crawl:', queueError)
      return
    }
    
    console.log(`✓ Crawl job queued: ${job.id}\n`)
    
    // 3. Trigger the crawl
    console.log('3. Triggering crawl...')
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
    console.log(`  API calls: ${result.api_calls}`)
    console.log(`  Entities processed:`)
    console.log(`    - Repository: ${result.entities_processed.repository}`)
    console.log(`    - Issues: ${result.entities_processed.issues}`)
    console.log(`    - Pull Requests: ${result.entities_processed.pull_requests}`)
    console.log(`    - Commits: ${result.entities_processed.commits}`)
    console.log(`    - Files: ${result.entities_processed.files}`)
    
    // 4. Check ingestion logs
    console.log('\n4. Checking ingestion logs...')
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
    
    // 5. Test that duplicate prevention works
    console.log('\n5. Testing duplicate prevention...')
    console.log('Running the same crawl again...')
    
    const { data: job2, error: queueError2 } = await supabase
      .from('github_crawl_queue')
      .insert({
        repository_id: repos.id,
        crawl_type: 'update',
        priority: 5,
        scheduled_for: new Date().toISOString()
      })
      .select()
      .single()
    
    if (queueError2) {
      console.error('Error queueing second crawl:', queueError2)
      return
    }
    
    const response2 = await fetch(`${appUrl}/api/github/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        job_id: job2.id
      })
    })
    
    if (response2.ok) {
      const result2 = await response2.json()
      console.log('✓ Second crawl completed')
      console.log('  Entities should be the same (MERGE prevented duplicates):')
      console.log(`    - Issues: ${result2.entities_processed.issues}`)
      console.log(`    - Commits: ${result2.entities_processed.commits}`)
      console.log(`    - Files: ${result2.entities_processed.files}`)
    }
    
    // 6. Verify data in Neo4j
    console.log('\n6. Verifying data integrity...')
    const { getDriver } = await import('../src/lib/neo4j/client')
    const driver = getDriver()
    const session = driver.session()
    
    try {
      const countResult = await session.run(`
        MATCH (r:Repository {full_name: $repo})
        OPTIONAL MATCH (r)-[:HAS_ISSUE]->(i:RepoIssue)
        OPTIONAL MATCH (r)-[:HAS_COMMIT]->(c:RepoCommit)
        OPTIONAL MATCH (r)-[:HAS_FILE]->(f:RepoFile)
        RETURN 
          count(DISTINCT r) as repos,
          count(DISTINCT i) as issues,
          count(DISTINCT c) as commits,
          count(DISTINCT f) as files
      `, { repo: 'srao-positron/camille' })
      
      const counts = countResult.records[0]
      console.log('Neo4j data counts:')
      console.log(`  - Repositories: ${counts.get('repos')}`)
      console.log(`  - Issues: ${counts.get('issues')}`)
      console.log(`  - Commits: ${counts.get('commits')}`)
      console.log(`  - Files: ${counts.get('files')}`)
      
      // Check for duplicates
      const dupResult = await session.run(`
        MATCH (n)
        WHERE n:RepoIssue OR n:RepoCommit OR n:RepoFile
        WITH labels(n)[0] as label, n
        WITH label, count(n) as total, collect(n) as nodes
        UNWIND nodes as node
        WITH label, total, node
        WITH label, total, node.id as id, count(node) as duplicates
        WHERE duplicates > 1
        RETURN label, id, duplicates
        LIMIT 10
      `)
      
      if (dupResult.records.length > 0) {
        console.log('\n⚠️  Found duplicates:')
        dupResult.records.forEach(record => {
          console.log(`  - ${record.get('label')}: ${record.get('id')} (${record.get('duplicates')} copies)`)
        })
      } else {
        console.log('\n✅ No duplicates found - constraints are working correctly!')
      }
      
    } finally {
      await session.close()
      await driver.close()
    }
    
    console.log('\n✅ Fresh import test completed successfully!')
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

testFreshImport()