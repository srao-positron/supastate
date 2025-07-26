import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
})

async function checkMemoryDates() {
  console.log('Checking memory dates...\n')

  // Get a sample of memories with their dates
  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching memories:', error)
    return
  }

  console.log(`Found ${memories?.length} memories\n`)

  // Check date distribution
  const dateMap = new Map<string, number>()
  const hourMap = new Map<number, number>()
  const metadataTypes = new Map<string, number>()

  memories?.forEach(memory => {
    const date = new Date(memory.created_at)
    const dateStr = date.toISOString().split('T')[0]
    const hour = date.getHours()
    
    dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1)
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1)

    // Check metadata
    if (memory.metadata) {
      const metadata = typeof memory.metadata === 'string' 
        ? JSON.parse(memory.metadata) 
        : memory.metadata
      
      const type = metadata.type || metadata.messageType || 'general'
      metadataTypes.set(type, (metadataTypes.get(type) || 0) + 1)

      console.log(`Memory ${memory.id.slice(0, 8)}:`)
      console.log(`  Created: ${memory.created_at}`)
      console.log(`  Type: ${type}`)
      console.log(`  Metadata keys: ${Object.keys(metadata).join(', ')}`)
      console.log()
    }
  })

  console.log('\nDate distribution:')
  for (const [date, count] of dateMap) {
    console.log(`  ${date}: ${count} memories`)
  }

  console.log('\nHour distribution:')
  for (const [hour, count] of hourMap) {
    console.log(`  ${hour}:00: ${count} memories`)
  }

  console.log('\nMemory types:')
  for (const [type, count] of metadataTypes) {
    console.log(`  ${type}: ${count} memories`)
  }

  // Check date range
  const { data: dateRange } = await supabase
    .from('memories')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1)

  const { data: latestDate } = await supabase
    .from('memories')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)

  if (dateRange?.[0] && latestDate?.[0]) {
    console.log('\nDate range:')
    console.log(`  Earliest: ${dateRange[0].created_at}`)
    console.log(`  Latest: ${latestDate[0].created_at}`)
  }
}

checkMemoryDates().then(() => process.exit(0))