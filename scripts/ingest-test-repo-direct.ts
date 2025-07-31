#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const TEST_REPO_PATH = join(process.env.HOME!, '.camille', 'watched', 'supastate-test-repo')
const REPO_NAME = 'local/supastate-test-repo'
const USER_ID = 'a02c3fed-3a24-442f-becc-97bac8b75e90'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function ingestTestRepo() {
  console.log('🚀 Ingesting test repository files directly...\n')
  
  const files = [
    { name: 'user-service.ts', language: 'typescript' },
    { name: 'data_processor.py', language: 'python' },
    { name: 'TodoList.tsx', language: 'typescript' },
    { name: 'feature-code.ts', language: 'typescript' }
  ]
  
  try {
    // Prepare file data for ingestion
    const fileData = await Promise.all(
      files.map(async (file) => {
        const filePath = join(TEST_REPO_PATH, file.name)
        const content = await readFile(filePath, 'utf-8')
        
        return {
          path: `${REPO_NAME}/${file.name}`,
          content: content,
          language: file.language,
          lastModified: new Date().toISOString(),
          gitMetadata: {
            repoUrl: `file://${TEST_REPO_PATH}`,
            repoName: REPO_NAME,
            branch: 'feature/async-parsing-test',
            commitSha: 'test-commit-sha',
            author: 'Test User',
            authorEmail: 'test@example.com'
          }
        }
      })
    )
    
    console.log(`Prepared ${fileData.length} files for ingestion`)
    
    // Get a user token for authentication
    const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
      email: 'srao@positronnetworks.com',
      password: process.env.TEST_USER_PASSWORD || ''
    })
    
    if (authError || !session) {
      console.log('Using service role token instead...')
      
      // Call the ingest-code edge function
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-code`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'x-supabase-auth': JSON.stringify({ user_id: USER_ID })
          },
          body: JSON.stringify({
            files: fileData,
            projectName: REPO_NAME,
            fullSync: true
          })
        }
      )
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Error: ${response.status} - ${errorText}`)
        return
      }
      
      const result = await response.json()
      console.log('✅ Ingestion completed!')
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log('Authenticated successfully')
      
      // Call with user token
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-code`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            files: fileData,
            projectName: REPO_NAME,
            fullSync: true
          })
        }
      )
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Error: ${response.status} - ${errorText}`)
        return
      }
      
      const result = await response.json()
      console.log('✅ Ingestion completed!')
      console.log(JSON.stringify(result, null, 2))
    }
    
    console.log('\nNext: Run npx tsx scripts/check-test-repo-entities.ts to verify entities in Neo4j')
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

ingestTestRepo()