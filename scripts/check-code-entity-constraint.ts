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

async function checkConstraint() {
  console.log('=== Checking for Existing File ===\n')

  // Check if there's already a file with these values
  const { data: existingFiles, error: fileError } = await supabase
    .from('code_entities')
    .select('id, team_id, user_id, project_name, file_path, name, entity_type, language, created_at')
    .is('team_id', null)
    .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
    .eq('project_name', 'camille')
    .eq('file_path', 'src/code-parser/typescript-parser.ts')
    .eq('name', 'typescript-parser.ts')
    .eq('entity_type', 'module')
    .order('created_at', { ascending: false })

  if (fileError) {
    console.error('Error checking files:', fileError)
  } else {
    console.log('Existing files matching all criteria (including entity_type = module):')
    console.log('Count:', existingFiles?.length || 0)
    if (existingFiles && existingFiles.length > 0) {
      existingFiles.forEach(file => {
        console.log(`- ID: ${file.id}`)
        console.log(`  entity_type: ${file.entity_type}`)
        console.log(`  language: ${file.language}`)
        console.log(`  created_at: ${file.created_at}`)
      })
    }
  }

  // Also check without entity_type filter
  console.log('\n=== Checking without entity_type filter ===\n')
  
  const { data: filesWithoutType, error: fileError2 } = await supabase
    .from('code_entities')
    .select('id, team_id, user_id, project_name, file_path, name, entity_type, language, created_at')
    .is('team_id', null)
    .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
    .eq('project_name', 'camille')
    .eq('file_path', 'src/code-parser/typescript-parser.ts')
    .eq('name', 'typescript-parser.ts')
    .order('created_at', { ascending: false })

  if (fileError2) {
    console.error('Error checking files without type:', fileError2)
  } else {
    console.log('Files without entity_type filter:')
    console.log('Count:', filesWithoutType?.length || 0)
    if (filesWithoutType && filesWithoutType.length > 0) {
      filesWithoutType.forEach(file => {
        console.log(`- ID: ${file.id}`)
        console.log(`  entity_type: ${file.entity_type}`)
        console.log(`  language: ${file.language}`)
        console.log(`  created_at: ${file.created_at}`)
      })
    }
  }

  // Check with entity_type = 'function' (what TypeScript files get)
  console.log('\n=== Checking with entity_type = function ===\n')
  
  const { data: filesWithFunction, error: fileError3 } = await supabase
    .from('code_entities')
    .select('id, team_id, user_id, project_name, file_path, name, entity_type, language, created_at')
    .is('team_id', null)
    .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
    .eq('project_name', 'camille')
    .eq('file_path', 'src/code-parser/typescript-parser.ts')
    .eq('name', 'typescript-parser.ts')
    .eq('entity_type', 'function')
    .order('created_at', { ascending: false })

  if (fileError3) {
    console.error('Error checking files with function type:', fileError3)
  } else {
    console.log('Files with entity_type = function:')
    console.log('Count:', filesWithFunction?.length || 0)
    if (filesWithFunction && filesWithFunction.length > 0) {
      filesWithFunction.forEach(file => {
        console.log(`- ID: ${file.id}`)
        console.log(`  entity_type: ${file.entity_type}`)
        console.log(`  language: ${file.language}`)
        console.log(`  created_at: ${file.created_at}`)
      })
    }
  }

  // Check what entity_type values exist for typescript files
  console.log('\n=== All TypeScript Files in Project ===\n')
  
  const { data: tsFiles, error: tsError } = await supabase
    .from('code_entities')
    .select('file_path, entity_type, language')
    .eq('project_name', 'camille')
    .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
    .or('language.eq.typescript,file_path.like.%.ts')
    .limit(10)

  if (tsError) {
    console.error('Error checking TypeScript files:', tsError)
  } else {
    console.log('Sample TypeScript files:')
    if (tsFiles && tsFiles.length > 0) {
      tsFiles.forEach(file => {
        console.log(`- ${file.file_path}`)
        console.log(`  entity_type: ${file.entity_type}`)
        console.log(`  language: ${file.language}`)
      })
    }
  }

  // Let's see getEntityType logic
  console.log('\n=== getEntityType Logic ===')
  console.log('For TypeScript files, getEntityType returns: "function"')
  console.log('But the query is looking for entity_type = "module"')
  console.log('This is the mismatch!')
}

checkConstraint().catch(console.error)