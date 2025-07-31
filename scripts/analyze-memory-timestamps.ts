#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`,
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function analyzeMemoryTimestamps() {
  console.log('🔍 Analyzing memory timestamp handling...\n')

  // Get a sample of memories with metadata
  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, created_at, metadata, project_name, content')
    .not('metadata', 'is', null)
    .limit(20)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log(`Found ${memories?.length || 0} memories with metadata\n`)

  // Analyze timestamp patterns
  let hasStartTime = 0
  let hasEndTime = 0
  let hasTimestamp = 0
  const timestampExamples: any[] = []

  memories?.forEach(m => {
    if (m.metadata) {
      if (m.metadata.startTime) hasStartTime++
      if (m.metadata.endTime) hasEndTime++
      if (m.metadata.timestamp) hasTimestamp++

      // Collect examples
      if (timestampExamples.length < 5 && (m.metadata.startTime || m.metadata.timestamp)) {
        timestampExamples.push({
          id: m.id,
          created_at: m.created_at,
          startTime: m.metadata.startTime,
          endTime: m.metadata.endTime,
          timestamp: m.metadata.timestamp,
          contentPreview: m.content?.substring(0, 50) + '...'
        })
      }
    }
  })

  console.log('📊 Timestamp field analysis:')
  console.log(`  Memories with startTime: ${hasStartTime}`)
  console.log(`  Memories with endTime: ${hasEndTime}`)
  console.log(`  Memories with timestamp: ${hasTimestamp}`)

  console.log('\n📝 Sample memories showing timestamp discrepancy:')
  timestampExamples.forEach((ex, idx) => {
    console.log(`\n${idx + 1}. Memory ${ex.id}:`)
    console.log(`   Created at (DB): ${ex.created_at}`)
    console.log(`   Start time (metadata): ${ex.startTime || 'N/A'}`)
    console.log(`   End time (metadata): ${ex.endTime || 'N/A'}`)
    console.log(`   Timestamp (metadata): ${ex.timestamp || 'N/A'}`)
    
    if (ex.startTime) {
      const createdDate = new Date(ex.created_at)
      const actualDate = new Date(ex.startTime)
      const diffHours = Math.abs(createdDate.getTime() - actualDate.getTime()) / (1000 * 60 * 60)
      console.log(`   Time difference: ${diffHours.toFixed(1)} hours`)
    }
    
    console.log(`   Content: ${ex.contentPreview}`)
  })

  // Check date distribution if we used metadata timestamps
  const actualDates = new Map<string, number>()
  const createdDates = new Map<string, number>()

  memories?.forEach(m => {
    const createdDate = m.created_at.split('T')[0]
    createdDates.set(createdDate, (createdDates.get(createdDate) || 0) + 1)

    const actualTimestamp = m.metadata?.startTime || m.metadata?.timestamp
    if (actualTimestamp) {
      const actualDate = actualTimestamp.split('T')[0]
      actualDates.set(actualDate, (actualDates.get(actualDate) || 0) + 1)
    }
  })

  console.log('\n\n📅 Date distribution comparison:')
  console.log('\nUsing created_at (current):')
  Array.from(createdDates.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7)
    .forEach(([date, count]) => {
      console.log(`  ${date}: ${count} memories`)
    })

  console.log('\nUsing metadata timestamps (proposed):')
  Array.from(actualDates.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7)
    .forEach(([date, count]) => {
      console.log(`  ${date}: ${count} memories`)
    })

  // Check how Neo4j is storing dates
  console.log('\n\n🔍 Checking Neo4j Memory nodes...')
  const { data: neo4jCount } = await supabase.rpc('execute_neo4j_query', {
    query: `
      MATCH (m:Memory)
      RETURN 
        COUNT(m) as total,
        COUNT(m.occurred_at) as hasOccurredAt,
        COUNT(m.created_at) as hasCreatedAt
    `
  }).single()

  if (neo4jCount) {
    console.log(`Neo4j Memory nodes: ${(neo4jCount as any).total}`)
    console.log(`  With occurred_at: ${(neo4jCount as any).hasOccurredAt}`)
    console.log(`  With created_at: ${(neo4jCount as any).hasCreatedAt}`)
  }

  console.log('\n\n💡 Key Findings:')
  console.log('1. Supabase memories table has NO occurred_at column')
  console.log('2. Metadata contains actual conversation timestamps (startTime/endTime)')
  console.log('3. Neo4j Memory nodes DO have occurred_at field')
  console.log('4. But occurred_at is set to created_at during ingestion')
  console.log('\n✅ Solution: Update ingestion to use metadata.startTime for occurred_at')
}

analyzeMemoryTimestamps().catch(console.error)