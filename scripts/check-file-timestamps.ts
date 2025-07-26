import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function checkFileTimestamps() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  })

  console.log('Checking file timestamps in processing queue...\n')

  // Check last_modified values
  const { data: files, error } = await supabase
    .from('code_processing_queue')
    .select('id, file_path, last_modified, created_at, status')
    .order('last_modified', { ascending: false, nullsFirst: false })
    .limit(20)

  if (error) {
    console.error('Error fetching files:', error)
    return
  }

  console.log('Sample files with timestamps:')
  files?.forEach((file, idx) => {
    console.log(`\n${idx + 1}. ${file.file_path}`)
    console.log(`   Status: ${file.status}`)
    console.log(`   Last Modified: ${file.last_modified || 'NULL'}`)
    console.log(`   Created At: ${file.created_at}`)
  })

  // Check distribution of last_modified values
  const { data: stats } = await supabase
    .from('code_processing_queue')
    .select('last_modified')
    
  if (stats) {
    const nullCount = stats.filter(s => !s.last_modified).length
    const nonNullCount = stats.filter(s => s.last_modified).length
    
    console.log('\n\nTimestamp Statistics:')
    console.log(`Total files: ${stats.length}`)
    console.log(`Files with last_modified: ${nonNullCount}`)
    console.log(`Files without last_modified: ${nullCount}`)
    
    // Get date range
    const validDates = stats
      .filter(s => s.last_modified)
      .map(s => new Date(s.last_modified))
      .sort((a, b) => a.getTime() - b.getTime())
      
    if (validDates.length > 0) {
      console.log(`\nDate Range:`)
      console.log(`Oldest: ${validDates[0].toISOString()}`)
      console.log(`Newest: ${validDates[validDates.length - 1].toISOString()}`)
      
      // Count by month
      const monthCounts = validDates.reduce((acc, date) => {
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        acc[monthKey] = (acc[monthKey] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      console.log('\nFiles by month:')
      Object.entries(monthCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([month, count]) => {
          console.log(`  ${month}: ${count} files`)
        })
    }
  }
}

checkFileTimestamps().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})