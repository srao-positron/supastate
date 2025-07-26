import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'

dotenv.config({ path: '.env.local' })

const supabaseUrl = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface TranscriptMessage {
  timestamp: string
  role: 'human' | 'assistant' | 'system'
  content: string | any
  metadata?: Record<string, any>
}

interface ParsedMemory {
  id: string
  content: string
  occurred_at: string // The actual conversation timestamp
  created_at: string  // When it was ingested
  metadata: Record<string, any>
}

async function parseTranscriptFile(filePath: string): Promise<TranscriptMessage[]> {
  const messages: TranscriptMessage[] = []
  
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n').filter(line => line.trim())
    
    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        
        // Handle different JSON structures
        const message = data.message || data
        const timestamp = data.timestamp || message.timestamp || new Date().toISOString()
        
        if (message.role && message.content) {
          // Extract text content - handle both string and array formats
          let textContent: string
          if (typeof message.content === 'string') {
            textContent = message.content
          } else if (Array.isArray(message.content)) {
            // Claude format: content is array of {type, text} objects
            textContent = message.content
              .filter((c: any) => c.type === 'text' && c.text)
              .map((c: any) => c.text)
              .join('\n')
          } else {
            textContent = JSON.stringify(message.content)
          }
          
          if (textContent && textContent.trim()) {
            messages.push({
              timestamp,
              role: message.role,
              content: textContent,
              metadata: data.metadata || {}
            })
          }
        }
      } catch (parseError) {
        console.warn('Skipping malformed line:', parseError)
      }
    }
    
    return messages
  } catch (error) {
    console.error('Failed to parse transcript:', error)
    throw error
  }
}

async function demonstrateTimestampParsing() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  })

  console.log('📊 Demonstrating timestamp parsing from transcripts...\n')

  // Check if we have any transcript files
  const transcriptDir = path.join(process.env.HOME || '', '.camille', 'transcripts')
  
  try {
    const files = await fs.readdir(transcriptDir)
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).slice(0, 3) // Look at first 3 files
    
    console.log(`Found ${files.length} transcript files\n`)
    
    for (const file of jsonlFiles) {
      console.log(`\n📄 Parsing ${file}:`)
      const filePath = path.join(transcriptDir, file)
      
      const messages = await parseTranscriptFile(filePath)
      
      if (messages.length > 0) {
        console.log(`  Total messages: ${messages.length}`)
        
        // Show timestamp range
        const timestamps = messages.map(m => new Date(m.timestamp))
        const minTime = new Date(Math.min(...timestamps.map(t => t.getTime())))
        const maxTime = new Date(Math.max(...timestamps.map(t => t.getTime())))
        
        console.log(`  First message: ${minTime.toISOString()}`)
        console.log(`  Last message: ${maxTime.toISOString()}`)
        console.log(`  Duration: ${((maxTime.getTime() - minTime.getTime()) / 1000 / 60).toFixed(2)} minutes`)
        
        // Show sample messages with timestamps
        console.log('\n  Sample messages:')
        messages.slice(0, 3).forEach((msg, idx) => {
          console.log(`    ${idx + 1}. [${msg.timestamp}] ${msg.role}: ${msg.content.substring(0, 60)}...`)
        })
        
        // Show timestamp distribution by day
        const dayDistribution = messages.reduce((acc, msg) => {
          const day = msg.timestamp.split('T')[0]
          acc[day] = (acc[day] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        
        console.log('\n  Messages by day:')
        Object.entries(dayDistribution)
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([day, count]) => {
            console.log(`    ${day}: ${count} messages`)
          })
      }
    }
    
    // Show how this would affect the memory table
    console.log('\n\n💡 Key insight:')
    console.log('Currently, memories use created_at = processing time (all today)')
    console.log('Should use occurred_at = transcript timestamp (actual conversation time)')
    console.log('\nThis would give us:')
    console.log('- Accurate 30-day activity charts')
    console.log('- Proper hourly distribution')
    console.log('- Meaningful weekly patterns')
    
  } catch (error) {
    console.error('Error reading transcript directory:', error)
  }
}

demonstrateTimestampParsing().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})