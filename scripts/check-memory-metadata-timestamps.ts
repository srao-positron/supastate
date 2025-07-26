import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function checkMemoryTimestamps() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  })

  console.log('📊 Checking memory metadata for timestamps...\n')

  // Get a sample of memories with metadata
  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, created_at, metadata, content')
    .not('metadata', 'is', null)
    .limit(10)

  if (error) {
    console.error('Error fetching memories:', error)
    return
  }

  console.log(`Found ${memories?.length || 0} memories with metadata\n`)

  memories?.forEach((memory, idx) => {
    console.log(`\nMemory ${idx + 1}:`)
    console.log(`  ID: ${memory.id}`)
    console.log(`  Created At: ${memory.created_at}`)
    
    // Check if metadata has timestamp
    if (memory.metadata) {
      console.log(`  Metadata:`)
      if (memory.metadata.timestamp) {
        console.log(`    ✅ Has timestamp: ${memory.metadata.timestamp}`)
        
        // Compare with created_at
        const metaTime = new Date(memory.metadata.timestamp)
        const createdTime = new Date(memory.created_at)
        const diffDays = Math.abs((createdTime.getTime() - metaTime.getTime()) / (1000 * 60 * 60 * 24))
        
        console.log(`    📅 Difference: ${diffDays.toFixed(1)} days`)
      } else {
        console.log(`    ❌ No timestamp in metadata`)
      }
      
      // Show other metadata fields
      const otherFields = Object.keys(memory.metadata).filter(k => k !== 'timestamp')
      if (otherFields.length > 0) {
        console.log(`    Other fields: ${otherFields.join(', ')}`)
      }
    }
    
    console.log(`  Content preview: ${memory.content.substring(0, 50)}...`)
  })

  // Check timestamp distribution
  const { data: allMemories } = await supabase
    .from('memories')
    .select('created_at, metadata')
    .not('metadata', 'is', null)

  if (allMemories) {
    const withTimestamp = allMemories.filter(m => m.metadata?.timestamp)
    console.log(`\n\n📈 Timestamp Statistics:`)
    console.log(`Total memories with metadata: ${allMemories.length}`)
    console.log(`Memories with timestamp in metadata: ${withTimestamp.length}`)
    
    if (withTimestamp.length > 0) {
      // Get date range from metadata timestamps
      const metadataTimestamps = withTimestamp
        .map(m => new Date(m.metadata.timestamp))
        .filter(d => !isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime())
      
      if (metadataTimestamps.length > 0) {
        console.log(`\nMetadata timestamp range:`)
        console.log(`  Oldest: ${metadataTimestamps[0].toISOString()}`)
        console.log(`  Newest: ${metadataTimestamps[metadataTimestamps.length - 1].toISOString()}`)
        
        // Count by month
        const monthCounts = metadataTimestamps.reduce((acc, date) => {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          acc[monthKey] = (acc[monthKey] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        
        console.log('\nMemories by month (from metadata.timestamp):')
        Object.entries(monthCounts)
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([month, count]) => {
            console.log(`  ${month}: ${count} memories`)
          })
      }
    }
  }
}

checkMemoryTimestamps().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})