#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const neo4jUri = process.env.NEO4J_URI
const neo4jUser = process.env.NEO4J_USER
const neo4jPassword = process.env.NEO4J_PASSWORD

if (!neo4jUri || !neo4jUser || !neo4jPassword) {
  console.error('Missing required Neo4j environment variables')
  process.exit(1)
}

const driver = neo4j.driver(
  neo4jUri,
  neo4j.auth.basic(neo4jUser, neo4jPassword)
)

async function checkMemoryDates() {
  const session = driver.session()
  
  try {
    console.log('=== Memory Date Analysis in Neo4j ===\n')
    
    // 1. Check sample memories
    console.log('📅 Sample Memory Dates:\n')
    const sampleResult = await session.run(`
      MATCH (m:Memory)
      RETURN m.id as id, 
             m.occurred_at as occurred_at, 
             m.created_at as created_at,
             substring(m.content, 0, 50) as content_preview
      ORDER BY m.occurred_at DESC
      LIMIT 10
    `)
    
    sampleResult.records.forEach(record => {
      const id = record.get('id')
      const occurred = record.get('occurred_at')
      const created = record.get('created_at')
      const preview = record.get('content_preview')
      
      console.log(`Memory: ${id}`)
      console.log(`  Content: ${preview}...`)
      console.log(`  Occurred: ${occurred}`)
      console.log(`  Created:  ${created}`)
      console.log(`  Same date? ${occurred === created ? '⚠️  YES (using ingestion time)' : '✅ NO (using actual time)'}\n`)
    })
    
    // 2. Check date distribution
    console.log('\n📊 Date Distribution:\n')
    const distResult = await session.run(`
      MATCH (m:Memory)
      WITH date(m.occurred_at) as date, count(m) as count
      RETURN date, count
      ORDER BY date DESC
      LIMIT 20
    `)
    
    const totalByDate = {}
    distResult.records.forEach(record => {
      const date = record.get('date')
      const count = record.get('count').toNumber()
      totalByDate[date] = count
    })
    
    console.log('Memories by date:')
    Object.entries(totalByDate).forEach(([date, count]) => {
      console.log(`  ${date}: ${count} memories`)
    })
    
    // 3. Check for memories using actual timestamps
    console.log('\n🔍 Checking timestamp accuracy:\n')
    
    const accuracyResult = await session.run(`
      MATCH (m:Memory)
      WITH m.occurred_at = m.created_at as using_ingestion_time, count(m) as count
      RETURN using_ingestion_time, count
    `)
    
    accuracyResult.records.forEach(record => {
      const usingIngestion = record.get('using_ingestion_time')
      const count = record.get('count').toNumber()
      
      if (usingIngestion) {
        console.log(`⚠️  ${count} memories using ingestion timestamp (not actual conversation time)`)
      } else {
        console.log(`✅ ${count} memories using actual conversation timestamp`)
      }
    })
    
    // 4. Show date range
    console.log('\n📆 Date Range:\n')
    const rangeResult = await session.run(`
      MATCH (m:Memory)
      RETURN min(m.occurred_at) as earliest, max(m.occurred_at) as latest
    `)
    
    const earliest = rangeResult.records[0].get('earliest')
    const latest = rangeResult.records[0].get('latest')
    
    console.log(`Earliest memory: ${earliest}`)
    console.log(`Latest memory: ${latest}`)
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

checkMemoryDates().catch(console.error)