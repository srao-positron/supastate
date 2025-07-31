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

async function forkAndTestRepository() {
  console.log('🍴 Forking TypeScript Repository for Testing')
  console.log('=========================================\n')

  try {
    // Step 1: Get user with GitHub token
    console.log('1️⃣ Finding user with GitHub access...')
    
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .limit(1)
    
    if (!users || users.length === 0) {
      throw new Error('No users found')
    }
    
    const userId = users[0].id
    console.log(`✅ Using user: ${users[0].email}`)

    // Get GitHub token
    const { data: tokenData } = await supabase.rpc('get_github_token', {
      user_id: userId
    })

    if (!tokenData) {
      throw new Error('No GitHub token found. Please connect your GitHub account first.')
    }

    // Step 2: Fork a small TypeScript repository
    console.log('\n2️⃣ Forking TypeScript repository...')
    
    // We'll fork the TypeScript starter template - it's small and perfect for testing
    const repoToFork = {
      owner: 'microsoft',
      repo: 'TypeScript-Node-Starter'
    }
    
    console.log(`   Forking ${repoToFork.owner}/${repoToFork.repo}...`)
    
    const forkResponse = await fetch(`https://api.github.com/repos/${repoToFork.owner}/${repoToFork.repo}/forks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })

    if (!forkResponse.ok) {
      const error = await forkResponse.text()
      
      // Check if already forked
      if (forkResponse.status === 422 && error.includes('already exists')) {
        console.log('   ℹ️  Repository already forked, using existing fork')
        
        // Get the existing fork
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${tokenData}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        })
        
        const userData = await userResponse.json()
        const username = userData.login
        
        // Get the forked repo
        const forkCheckResponse = await fetch(`https://api.github.com/repos/${username}/${repoToFork.repo}`, {
          headers: {
            'Authorization': `Bearer ${tokenData}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        })
        
        if (forkCheckResponse.ok) {
          const fork = await forkCheckResponse.json()
          console.log(`✅ Using existing fork: ${fork.full_name}`)
          return { fork, userId, tokenData }
        }
      }
      
      throw new Error(`Failed to fork repository: ${error}`)
    }

    const fork = await forkResponse.json()
    console.log(`✅ Successfully forked to: ${fork.full_name}`)
    
    // Wait a bit for GitHub to process the fork
    console.log('   ⏳ Waiting for fork to be ready...')
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Step 3: Import the forked repository into Supastate
    console.log('\n3️⃣ Importing forked repository into Supastate...')
    
    const importResponse = await fetch(`http://localhost:3002/api/github/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'x-supabase-auth': JSON.stringify({ sub: userId })
      },
      body: JSON.stringify({
        owner: fork.owner.login,
        name: fork.name,
        crawl_scope: 'full'
      })
    })

    if (!importResponse.ok) {
      throw new Error(`Failed to import repository: ${await importResponse.text()}`)
    }

    const importResult = await importResponse.json()
    console.log('✅ Repository imported:', importResult)

    // Step 4: Create test branches in the fork
    console.log('\n4️⃣ Creating test branches in the fork...')
    
    const testBranches = [
      { name: 'test/async-features', files: ['src/async-handler.ts', 'tests/async.test.ts'] },
      { name: 'test/new-parser', files: ['src/parser/new-parser.ts'] },
      { name: 'test/bugfix-memory', files: ['src/utils/memory.ts'] }
    ]

    for (const branch of testBranches) {
      console.log(`   Creating branch: ${branch.name}`)
      
      try {
        // Get default branch ref
        const refResponse = await fetch(`https://api.github.com/repos/${fork.full_name}/git/refs/heads/${fork.default_branch}`, {
          headers: {
            'Authorization': `Bearer ${tokenData}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        })
        
        if (!refResponse.ok) {
          console.warn(`   ⚠️  Failed to get ref for ${fork.default_branch}`)
          continue
        }
        
        const ref = await refResponse.json()
        
        // Create new branch
        const createBranchResponse = await fetch(`https://api.github.com/repos/${fork.full_name}/git/refs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: `refs/heads/${branch.name}`,
            sha: ref.object.sha
          })
        })
        
        if (createBranchResponse.ok || createBranchResponse.status === 422) {
          console.log(`   ✅ Branch ${branch.name} ready`)
          
          // Queue branch import
          const branchImportResponse = await fetch(`http://localhost:3002/api/github/branches/import`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'x-supabase-auth': JSON.stringify({ sub: userId })
            },
            body: JSON.stringify({
              repository_id: importResult.repository.id,
              branch_name: branch.name,
              compare_to_base: true
            })
          })
          
          if (branchImportResponse.ok) {
            const branchResult = await branchImportResponse.json()
            console.log(`   ✅ Branch queued for import: ${branchResult.message}`)
          }
        }
      } catch (error) {
        console.warn(`   ⚠️  Error creating branch ${branch.name}:`, error)
      }
    }

    // Step 5: Test Camille code with GitHub references
    console.log('\n5️⃣ Testing Camille GitHub reference detection...')
    
    const testCode = `
// Testing GitHub integration with our fork
import { parseTypeScript } from 'github:${fork.full_name}#test/new-parser/src/parser/new-parser.ts'

// Clone the test branches
// git clone https://github.com/${fork.full_name}.git -b test/async-features

// See the async implementation at:
// https://github.com/${fork.full_name}/tree/test/async-features/src/async-handler.ts

export function testWithFork() {
  console.log('Testing with forked repo')
}
`

    const codeEntityId = crypto.randomUUID()
    
    const { error: codeError } = await supabase
      .from('code_entities')
      .insert({
        id: codeEntityId,
        user_id: userId,
        team_id: null,
        project_name: 'github-fork-test',
        file_path: 'test/github-fork-integration.ts',
        name: 'github-fork-integration.ts',
        entity_type: 'module',
        language: 'typescript',
        source_code: testCode
      })

    if (!codeError) {
      console.log('✅ Created test code entity with fork references')
      
      // Trigger GitHub detection
      const detectResponse = await fetch(`${supabaseUrl}/functions/v1/detect-github-references`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          code_entity_id: codeEntityId
        })
      })

      if (detectResponse.ok) {
        const detectResult = await detectResponse.json()
        console.log('✅ GitHub references detected:', detectResult)
      }
    }

    console.log('\n✅ Fork and test setup complete!')
    console.log('\n📊 Summary:')
    console.log(`   Repository: ${fork.full_name}`)
    console.log(`   Default Branch: ${fork.default_branch}`)
    console.log(`   Test Branches: ${testBranches.map(b => b.name).join(', ')}`)
    console.log('\n🎯 Next Steps:')
    console.log('   1. Check the crawl queue for processing status')
    console.log('   2. Monitor Neo4j for imported code entities')
    console.log('   3. Test branch comparison and delta detection')
    console.log('   4. Verify Camille-to-GitHub relationships')

    return { fork, userId }

  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  }
}

// Run the test
forkAndTestRepository()
  .then(result => {
    console.log('\n✨ Test environment ready!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Setup failed:', error)
    process.exit(1)
  })