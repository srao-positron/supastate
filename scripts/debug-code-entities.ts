#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function debugCodeEntities() {
  console.log('=== Total Code Entities ===\n')

  // Count all code entities
  const { count: totalCount, error: countError } = await supabase
    .from('code_entities')
    .select('*', { count: 'exact', head: true })

  if (countError) {
    console.error('Error counting entities:', countError)
  } else {
    console.log(`Total code entities in database: ${totalCount}`)
  }

  // Count for specific user
  const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
  const { count: userCount, error: userCountError } = await supabase
    .from('code_entities')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (userCountError) {
    console.error('Error counting user entities:', userCountError)
  } else {
    console.log(`Code entities for user ${userId}: ${userCount}`)
  }

  // Get some sample records
  console.log('\n=== Sample Records ===\n')
  
  const { data: samples, error: sampleError } = await supabase
    .from('code_entities')
    .select('id, user_id, team_id, project_name, file_path, entity_type, language, created_at')
    .limit(10)
    .order('created_at', { ascending: false })

  if (sampleError) {
    console.error('Error getting samples:', sampleError)
  } else if (samples && samples.length > 0) {
    console.log('Recent code entities:')
    samples.forEach(entity => {
      console.log(`\n- ID: ${entity.id}`)
      console.log(`  User: ${entity.user_id}`)
      console.log(`  Team: ${entity.team_id || 'null'}`)
      console.log(`  Project: ${entity.project_name}`)
      console.log(`  File: ${entity.file_path}`)
      console.log(`  Type: ${entity.entity_type}`)
      console.log(`  Language: ${entity.language || 'not set'}`)
      console.log(`  Created: ${entity.created_at}`)
    })
  } else {
    console.log('No code entities found in database')
  }

  // Check for the specific file pattern
  console.log('\n=== Checking for Camille Project Files ===\n')
  
  const { data: camilleFiles, error: camilleError } = await supabase
    .from('code_entities')
    .select('file_path, entity_type, language')
    .eq('project_name', 'camille')
    .limit(10)

  if (camilleError) {
    console.error('Error checking camille files:', camilleError)
  } else if (camilleFiles && camilleFiles.length > 0) {
    console.log(`Found ${camilleFiles.length} files in camille project:`)
    camilleFiles.forEach(file => {
      console.log(`- ${file.file_path} (${file.entity_type}, ${file.language || 'no lang'})`)
    })
  } else {
    console.log('No files found for camille project')
  }

  // Check unique entity types
  console.log('\n=== Unique Entity Types in Database ===\n')
  
  const { data: allEntities, error: allError } = await supabase
    .from('code_entities')
    .select('entity_type')

  if (allError) {
    console.error('Error getting entity types:', allError)
  } else if (allEntities) {
    const uniqueTypes = [...new Set(allEntities.map(e => e.entity_type))]
    console.log('Unique entity types:', uniqueTypes.join(', '))
  }
}

debugCodeEntities().catch(console.error)