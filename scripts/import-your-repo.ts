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

async function importYourRepo() {
  console.log('🚀 Importing Your Repository for Testing')
  console.log('======================================\n')

  try {
    // Get user
    const { data: users } = await supabase
      .from('users')
      .select('id, email, github_username')
      .limit(1)
    
    if (!users || users.length === 0) {
      throw new Error('No users found')
    }
    
    const userId = users[0].id
    const githubUsername = users[0].github_username
    console.log(`User: ${users[0].email}`)
    console.log(`GitHub Username: ${githubUsername}\n`)

    // Let's import your hawking-edison repository
    const repoToImport = {
      owner: githubUsername,
      name: 'hawking-edison',
      url: `https://github.com/${githubUsername}/hawking-edison`
    }

    console.log(`📥 Importing repository: ${repoToImport.owner}/${repoToImport.name}`)
    
    const importPayload = {
      repository_url: repoToImport.url,
      user_id: userId,
      force_refresh: true // Force refresh to ensure we get latest data
    }
    
    console.log('Request payload:', JSON.stringify(importPayload, null, 2))
    
    const importResponse = await fetch(`http://localhost:3000/api/github/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify(importPayload)
    })

    console.log(`Response status: ${importResponse.status}`)

    const responseText = await importResponse.text()
    console.log('Response:', responseText)

    if (!importResponse.ok) {
      // Let's check if the repository exists in the database
      const { data: existingRepo } = await supabase
        .from('github_repositories')
        .select('*')
        .eq('full_name', `${repoToImport.owner}/${repoToImport.name}`)
        .single()

      if (existingRepo) {
        console.log('\n📊 Repository already exists in database:')
        console.log(`ID: ${existingRepo.id}`)
        console.log(`Full Name: ${existingRepo.full_name}`)
        console.log(`Last Crawled: ${existingRepo.last_crawled_at || 'Never'}`)
        console.log(`Crawl Status: ${existingRepo.crawl_status}`)
        
        // Queue a new crawl
        console.log('\n📋 Queuing new crawl job...')
        const { data: crawlJob, error: crawlError } = await supabase
          .from('github_crawl_queue')
          .insert({
            repository_id: existingRepo.id,
            crawl_type: 'manual',
            priority: 10,
            data: { force_refresh: true }
          })
          .select()
          .single()

        if (crawlJob) {
          console.log('✅ Crawl job queued successfully')
          console.log(`Job ID: ${crawlJob.id}`)
          console.log(`Status: ${crawlJob.status}`)
        } else if (crawlError) {
          console.log('❌ Failed to queue crawl:', crawlError.message)
        }
      }
      return
    }

    const result = JSON.parse(responseText)
    console.log('\n✅ Repository imported successfully!')
    console.log('Result:', JSON.stringify(result, null, 2))

    // Check branches
    if (result.repository?.id) {
      const { data: branches } = await supabase
        .from('github_indexed_branches')
        .select('*')
        .eq('repository_id', result.repository.id)

      console.log(`\n🌿 Branches (${branches?.length || 0}):`)
      branches?.forEach(branch => {
        console.log(`- ${branch.branch_name} (${branch.sync_status})`)
      })
    }

    console.log('\n🎯 Test Scenarios Available:')
    console.log('1. Test branch import and delta detection')
    console.log('2. Test code parsing from different branches')
    console.log('3. Test GitHub search functionality')
    console.log('4. Test Camille-to-GitHub reference detection')
    console.log('5. Monitor crawl progress in the queue')

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the import
importYourRepo()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })