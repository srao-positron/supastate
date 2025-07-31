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

async function checkEntityTypeMismatch() {
  console.log('=== Entity Type Analysis ===\n')

  // Check the specific file mentioned in the error
  const { data: specificFile, error: specificError } = await supabase
    .from('code_entities')
    .select('*')
    .is('team_id', null)
    .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
    .eq('project_name', 'camille')
    .eq('file_path', 'src/memory/edge-resolver.ts')
    .single()

  if (specificError) {
    console.error('Error finding specific file:', specificError)
  } else if (specificFile) {
    console.log('Found existing file:')
    console.log(`- ID: ${specificFile.id}`)
    console.log(`- File: ${specificFile.file_path}`)
    console.log(`- Entity Type: ${specificFile.entity_type}`)
    console.log(`- Language: ${specificFile.language}`)
    console.log(`- Created: ${specificFile.created_at}`)
    console.log(`- Updated: ${specificFile.updated_at}`)
  }

  // Check entity type distribution
  console.log('\n=== Entity Type Distribution for User ===\n')
  
  const { data: distribution, error: distError } = await supabase
    .from('code_entities')
    .select('entity_type, language')
    .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
    .eq('project_name', 'camille')

  if (distError) {
    console.error('Error checking distribution:', distError)
  } else if (distribution) {
    // Group by entity_type and language
    const grouped = distribution.reduce((acc, item) => {
      const key = `${item.entity_type} (${item.language || 'unknown'})`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    console.log('Entity type distribution:')
    Object.entries(grouped)
      .sort(([, a], [, b]) => b - a)
      .forEach(([key, count]) => {
        console.log(`- ${key}: ${count}`)
      })
  }

  // Check files with 'module' entity type
  console.log('\n=== Files with entity_type = "module" ===\n')
  
  const { data: moduleFiles, error: moduleError } = await supabase
    .from('code_entities')
    .select('file_path, language, created_at')
    .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
    .eq('project_name', 'camille')
    .eq('entity_type', 'module')
    .limit(10)

  if (moduleError) {
    console.error('Error checking module files:', moduleError)
  } else if (moduleFiles && moduleFiles.length > 0) {
    console.log(`Found ${moduleFiles.length} files with entity_type = "module":`)
    moduleFiles.forEach(file => {
      console.log(`- ${file.file_path}`)
      console.log(`  Language: ${file.language || 'not set'}`)
      console.log(`  Created: ${file.created_at}`)
    })
  }

  console.log('\n=== Issue Summary ===\n')
  console.log('The problem: Previously ingested files have entity_type = "module"')
  console.log('But the current getEntityType() function returns "function" for TypeScript')
  console.log('This causes the unique constraint to fail because it tries to insert a duplicate')
  console.log('with different entity_type value.')
  console.log('\nThe getEntityType function needs to be updated to match what was previously stored,')
  console.log('or we need to update all existing records to use the new entity_type values.')
}

checkEntityTypeMismatch().catch(console.error)