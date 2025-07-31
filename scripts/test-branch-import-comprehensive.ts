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

async function createTestRepository() {
  console.log('🧪 Creating Test Repository for Branch Import')
  console.log('==========================================\n')

  try {
    // Step 1: Check if test repository already exists
    console.log('1️⃣ Checking for existing test repository...')
    
    const { data: existingRepo } = await supabase
      .from('github_repositories')
      .select('*')
      .eq('full_name', 'test-user/typescript-test-repo')
      .single()
    
    if (existingRepo) {
      console.log('✅ Test repository already exists')
      return existingRepo
    }

    // Step 2: Find a user to associate with
    console.log('\n2️⃣ Finding a user to associate with test repository...')
    
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .limit(1)
    
    if (!users || users.length === 0) {
      throw new Error('No users found in database')
    }
    
    const userId = users[0].id
    console.log(`✅ Using user: ${users[0].email}`)

    // Step 3: Create test repository record
    console.log('\n3️⃣ Creating test repository record...')
    
    const repoData = {
      owner: 'test-user',
      name: 'typescript-test-repo',
      full_name: 'test-user/typescript-test-repo',
      description: 'Test TypeScript repository for branch management testing',
      private: false,
      fork: true,
      default_branch: 'main',
      language: 'TypeScript',
      stargazers_count: 100,
      watchers_count: 50,
      forks_count: 25,
      open_issues_count: 10,
      size: 5000,
      created_at: new Date('2024-01-01').toISOString(),
      updated_at: new Date().toISOString(),
      pushed_at: new Date().toISOString(),
      homepage: 'https://github.com/test-user/typescript-test-repo',
      html_url: 'https://github.com/test-user/typescript-test-repo',
      clone_url: 'https://github.com/test-user/typescript-test-repo.git',
      ssh_url: 'git@github.com:test-user/typescript-test-repo.git',
      topics: ['typescript', 'testing', 'supastate'],
      license: 'MIT',
      metadata: {
        test: true,
        source: 'test-script',
        forked_from: 'microsoft/TypeScript'
      }
    }

    const { data: repository, error: repoError } = await supabase
      .from('github_repositories')
      .insert(repoData)
      .select()
      .single()

    if (repoError) {
      throw new Error(`Failed to create repository: ${repoError.message}`)
    }

    console.log(`✅ Created test repository: ${repository.full_name}`)

    // Step 4: Associate user with repository
    console.log('\n4️⃣ Associating user with repository...')
    
    const { error: assocError } = await supabase
      .from('github_user_repos')
      .insert({
        user_id: userId,
        repository_id: repository.id,
        permissions: { admin: true, push: true, pull: true }
      })

    if (assocError && assocError.code !== '23505') { // Ignore duplicate key error
      throw new Error(`Failed to associate user: ${assocError.message}`)
    }

    console.log('✅ User associated with repository')

    // Step 5: Create some test branches
    console.log('\n5️⃣ Creating test branches...')
    
    const testBranches = [
      { name: 'main', is_default: true },
      { name: 'feature/async-improvements', files_different: 15 },
      { name: 'bugfix/memory-leak', files_different: 3 },
      { name: 'release/v5.0', files_different: 150 },
      { name: 'experimental/new-parser', files_different: 45 }
    ]

    for (const branch of testBranches) {
      const { error: branchError } = await supabase
        .from('github_indexed_branches')
        .insert({
          repository_id: repository.id,
          branch_name: branch.name,
          base_branch: branch.is_default ? null : 'main',
          files_different_from_base: branch.files_different || 0,
          sync_status: branch.is_default ? 'synced' : 'pending',
          source: 'test',
          metadata: {
            test: true,
            created_by: 'test-script'
          }
        })

      if (branchError && branchError.code !== '23505') {
        console.warn(`⚠️  Failed to create branch ${branch.name}: ${branchError.message}`)
      } else {
        console.log(`   ✅ Created branch: ${branch.name}`)
      }
    }

    // Step 6: Queue a test crawl job
    console.log('\n6️⃣ Queuing test crawl job...')
    
    const { error: crawlError } = await supabase
      .from('github_crawl_queue')
      .insert({
        repository_id: repository.id,
        crawl_type: 'branch',
        branch_name: 'feature/async-improvements',
        crawl_scope: 'delta',
        priority: 5,
        data: {
          test: true,
          source: 'test-script'
        }
      })

    if (crawlError) {
      console.warn(`⚠️  Failed to queue crawl job: ${crawlError.message}`)
    } else {
      console.log('✅ Queued test crawl job')
    }

    // Step 7: Create some test files in Neo4j
    console.log('\n7️⃣ Creating test files in Neo4j...')
    
    const testFiles = [
      { path: 'src/index.ts', branch: 'main', language: 'typescript' },
      { path: 'src/parser.ts', branch: 'main', language: 'typescript' },
      { path: 'src/async/worker.ts', branch: 'feature/async-improvements', language: 'typescript' },
      { path: 'tests/memory.test.ts', branch: 'bugfix/memory-leak', language: 'typescript' }
    ]

    // Note: In a real scenario, these would be created in Neo4j
    // For now, we'll just log them
    console.log(`   ℹ️  Would create ${testFiles.length} test files in Neo4j`)

    console.log('\n✅ Test repository setup complete!')
    return repository

  } catch (error) {
    console.error('❌ Error creating test repository:', error)
    throw error
  }
}

// Run the test
createTestRepository()
  .then(repo => {
    console.log('\n📊 Test Repository Created:')
    console.log(`   ID: ${repo.id}`)
    console.log(`   Name: ${repo.full_name}`)
    console.log(`   Default Branch: ${repo.default_branch}`)
    console.log('\n✨ You can now test branch import and crawling with this repository!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Setup error:', error)
    process.exit(1)
  })