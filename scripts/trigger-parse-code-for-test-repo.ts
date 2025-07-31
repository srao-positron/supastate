#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { readFile } from 'fs/promises'
import { join } from 'path'

dotenv.config({ path: '.env.local' })

const TEST_REPO_PATH = join(process.env.HOME!, '.camille', 'watched', 'supastate-test-repo')
const REPO_NAME = 'local/supastate-test-repo'
const USER_ID = 'a02c3fed-3a24-442f-becc-97bac8b75e90'

async function triggerParseCode() {
  console.log('🚀 Triggering parse-code edge function for test repository files...\n')
  
  const files = [
    'user-service.ts',
    'data_processor.py',
    'TodoList.tsx',
    'feature-code.ts'
  ]
  
  for (const fileName of files) {
    try {
      console.log(`\n📄 Processing ${fileName}...`)
      
      const filePath = join(TEST_REPO_PATH, fileName)
      const content = await readFile(filePath, 'utf-8')
      
      console.log(`  File size: ${content.length} bytes`)
      
      // Call the parse-code edge function
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/parse-code`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: content,
            language: fileName.endsWith('.py') ? 'python' : 'typescript',
            filename: fileName
          })
        }
      )
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`  ❌ Error: ${response.status} - ${errorText}`)
        continue
      }
      
      const result = await response.json()
      console.log(`  ✅ Parsed successfully!`)
      
      if (result.parsed) {
        const parsed = result.parsed
        console.log(`  Found:`)
        console.log(`    - ${parsed.classes?.length || 0} classes`)
        console.log(`    - ${parsed.functions?.length || 0} functions`)
        console.log(`    - ${parsed.imports?.length || 0} imports`)
        console.log(`    - ${parsed.exports?.length || 0} exports`)
        
        // Show details
        if (parsed.classes?.length > 0) {
          console.log(`\n  Classes:`)
          parsed.classes.forEach((cls: any) => {
            console.log(`    - ${cls.name || cls}`)
          })
        }
        
        if (parsed.functions?.length > 0) {
          console.log(`\n  Functions:`)
          parsed.functions.forEach((fn: any) => {
            console.log(`    - ${fn.name || fn}`)
          })
        }
      }
      
      // Note: The parse-code function returns parsed AST data, not entities
      // To create entities, we would need to transform this data and use 
      // a different ingestion process
      console.log(`\n  ℹ️  Note: parse-code returns AST data, not entities`)
      
    } catch (error) {
      console.error(`❌ Error processing ${fileName}:`, error)
    }
  }
  
  console.log('\n✅ Parse code trigger completed!')
  console.log('\nNext: Run npx tsx scripts/check-test-repo-entities.ts to verify entities in Neo4j')
}

triggerParseCode()