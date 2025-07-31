#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testCamilleGitHubDetection() {
  console.log('🧪 Testing Camille GitHub Reference Detection')
  console.log('==========================================\n')

  try {
    // Step 1: Create a test code entity with GitHub references
    console.log('1️⃣ Creating test code entity with GitHub references...')
    
    const testCode = `
// Example code with various GitHub references
import { parseCode } from 'github:anthropics/claude-code#main/parser'
import neo4j from 'https://github.com/neo4j/neo4j-javascript-driver/tree/5.0/packages/neo4j-driver'

// Clone command in comment
// git clone https://github.com/vercel/next.js.git -b canary

// Direct URL reference
// See implementation at: https://github.com/supabase/supabase/blob/master/packages/supabase-js/src/index.ts

export function testFunction() {
  // Using code from github.com/microsoft/typescript/tree/release-5.0
  console.log('Test')
}
`

    // Find a user to associate the test with
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1)
    
    if (!users || users.length === 0) {
      throw new Error('No users found in database')
    }
    
    const userId = users[0].id
    const codeEntityId = crypto.randomUUID()
    
    const { data: codeEntity, error: insertError } = await supabase
      .from('code_entities')
      .insert({
        id: codeEntityId,
        user_id: userId,
        team_id: null,
        project_name: 'test-github-detection',
        file_path: 'test/github-references.ts',
        name: 'github-references.ts',
        entity_type: 'module',
        language: 'typescript',
        source_code: testCode,
        metadata: {
          test: true,
          created_for: 'github-detection-test'
        }
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`Failed to create test code entity: ${insertError.message}`)
    }

    console.log(`✅ Created test code entity: ${codeEntityId}`)

    // Step 2: Call the detect-github-references function
    console.log('\n2️⃣ Calling detect-github-references function...')
    
    const response = await fetch(`${supabaseUrl}/functions/v1/detect-github-references`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        code_entity_id: codeEntityId
      })
    })

    if (!response.ok) {
      throw new Error(`Function call failed: ${await response.text()}`)
    }

    const result = await response.json()
    console.log('✅ Detection result:', JSON.stringify(result, null, 2))

    // Step 3: Check if branches were created
    console.log('\n3️⃣ Checking created branches...')
    
    const { data: branches } = await supabase
      .from('github_indexed_branches')
      .select(`
        *,
        repository:github_repositories(*)
      `)
      .eq('source', 'camille')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

    console.log(`✅ Found ${branches?.length || 0} branches created from Camille:`)
    branches?.forEach(branch => {
      console.log(`   - ${branch.repository.full_name}#${branch.branch_name}`)
    })

    // Step 4: Check if crawl jobs were queued
    console.log('\n4️⃣ Checking crawl queue...')
    
    const { data: crawlJobs } = await supabase
      .from('github_crawl_queue')
      .select('*')
      .eq('crawl_type', 'branch')
      .eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

    console.log(`✅ Found ${crawlJobs?.length || 0} pending crawl jobs`)

    // Step 5: Check relationship queue
    console.log('\n5️⃣ Checking relationship queue...')
    
    const { data: relationshipJobs } = await supabase
      .from('github_relationship_queue')
      .select('*')
      .eq('job_type', 'camille_to_github')
      .eq('source_entity_id', codeEntityId)

    console.log(`✅ Found ${relationshipJobs?.length || 0} relationship detection jobs`)

    // Cleanup
    console.log('\n🧹 Cleaning up test data...')
    
    // Delete the test code entity
    await supabase
      .from('code_entities')
      .delete()
      .eq('id', codeEntityId)

    console.log('✅ Test completed successfully!')

    return {
      detected: result.detected,
      queued: result.queued,
      branches: branches?.length || 0,
      crawlJobs: crawlJobs?.length || 0,
      relationshipJobs: relationshipJobs?.length || 0
    }

  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

// Run the test
testCamilleGitHubDetection()
  .then(results => {
    console.log('\n📊 Test Summary:', results)
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Test error:', error)
    process.exit(1)
  })