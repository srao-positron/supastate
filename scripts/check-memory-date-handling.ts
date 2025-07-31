#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`,
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function checkMemoryDates() {
  console.log('🔍 Checking memory date handling...\n')

  // Check a sample of memories from the database
  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, content, occurred_at, created_at, project_name, metadata')
    .limit(10)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Sample memories from Supabase database:')
  memories?.forEach((m, idx) => {
    console.log(`\n${idx + 1}. Memory ${m.id}:`)
    console.log(`   Project: ${m.project_name}`)
    console.log(`   Occurred at: ${m.occurred_at}`)
    console.log(`   Created at: ${m.created_at}`)
    console.log(`   Same timestamp? ${m.occurred_at === m.created_at}`)
    console.log(`   Content preview: ${m.content?.substring(0, 60)}...`)
    
    // Check if metadata contains any date information
    if (m.metadata && typeof m.metadata === 'object') {
      const dateKeys = Object.keys(m.metadata).filter(k => 
        k.toLowerCase().includes('date') || 
        k.toLowerCase().includes('time') ||
        k.toLowerCase().includes('timestamp')
      )
      if (dateKeys.length > 0) {
        console.log(`   Metadata date fields: ${dateKeys.join(', ')}`)
      }
    }
  })

  // Check date distribution
  const { data: dates } = await supabase
    .from('memories')
    .select('occurred_at, created_at')
    .not('occurred_at', 'is', null)

  if (dates) {
    const occurredDateMap = new Map<string, number>()
    const createdDateMap = new Map<string, number>()
    let sameCount = 0
    
    dates.forEach(d => {
      const occurredDate = d.occurred_at.split('T')[0]
      const createdDate = d.created_at.split('T')[0]
      
      occurredDateMap.set(occurredDate, (occurredDateMap.get(occurredDate) || 0) + 1)
      createdDateMap.set(createdDate, (createdDateMap.get(createdDate) || 0) + 1)
      
      if (d.occurred_at === d.created_at) {
        sameCount++
      }
    })

    console.log('\n\n📊 Date Distribution Analysis:')
    console.log(`Total memories: ${dates.length}`)
    console.log(`Memories with identical occurred_at and created_at: ${sameCount} (${(sameCount/dates.length*100).toFixed(1)}%)`)
    
    console.log('\nOccurred_at distribution:')
    Array.from(occurredDateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10) // Last 10 days
      .forEach(([date, count]) => {
        console.log(`  ${date}: ${count} memories`)
      })
      
    console.log('\nCreated_at distribution:')
    Array.from(createdDateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10) // Last 10 days
      .forEach(([date, count]) => {
        console.log(`  ${date}: ${count} memories`)
      })
  }

  // Check for any memories with different occurred_at and created_at
  const { data: different } = await supabase
    .from('memories')
    .select('id, occurred_at, created_at, project_name')
    .neq('occurred_at', 'created_at')
    .limit(5)

  if (different && different.length > 0) {
    console.log('\n\n🎯 Memories with different occurred_at and created_at:')
    different.forEach(m => {
      console.log(`\nMemory ${m.id}:`)
      console.log(`  Project: ${m.project_name}`)
      console.log(`  Occurred: ${m.occurred_at}`)
      console.log(`  Created: ${m.created_at}`)
    })
  } else {
    console.log('\n\n⚠️  No memories found with different occurred_at and created_at timestamps!')
    console.log('This suggests we are NOT parsing dates from transcripts.')
  }

  console.log('\n\n💡 Summary:')
  console.log('- All memories appear to use ingestion time for both occurred_at and created_at')
  console.log('- We should parse actual timestamps from Camille transcripts')
  console.log('- This would enable accurate time-based analytics and patterns')
}

checkMemoryDates().catch(console.error)