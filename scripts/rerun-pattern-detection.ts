#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function rerunPatternDetection() {
  console.log('🔄 Re-running Pattern Detection with Updated Function...\n')

  try {
    await neo4jService.initialize()
    
    // First clear existing patterns
    console.log('🗑️  Clearing existing Pattern nodes...')
    const deleteResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)
      DETACH DELETE p
      RETURN COUNT(p) as deleted
    `, {})
    
    console.log(`Deleted ${deleteResult.records[0]?.deleted?.toNumber() || 0} patterns`)

    // Check existing relationships to be cleaned up
    console.log('\n🔍 Checking existing RELATES_TO relationships...')
    const relatesResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:RELATES_TO]-(c:CodeEntity)
      RETURN COUNT(r) as count
    `, {})
    
    const existingCount = relatesResult.records[0]?.count?.toNumber() || 0
    console.log(`Found ${existingCount} RELATES_TO relationships`)

    // Get workspaces to process
    console.log('\n📊 Getting workspaces to process...')
    const workspaceResult = await neo4jService.executeQuery(`
      MATCH (n)
      WHERE n:Memory OR n:CodeEntity OR n:EntitySummary
      WITH DISTINCT n.workspace_id as workspace_id
      WHERE workspace_id IS NOT NULL
      RETURN workspace_id
      LIMIT 10
    `, {})
    
    const workspaces = workspaceResult.records.map(r => r.workspace_id).filter(Boolean)
    console.log(`Found ${workspaces.length} workspaces: ${workspaces.slice(0, 3).join(', ')}...`)

    // Trigger pattern detection for each workspace
    console.log('\n🚀 Triggering pattern detection...')
    
    for (const workspace of workspaces.slice(0, 3)) { // Process first 3 workspaces
      console.log(`\nProcessing workspace: ${workspace}`)
      
      // Extract userId if it's a personal workspace
      let userId = undefined
      if (workspace.startsWith('user:')) {
        userId = workspace.substring(5)
      }
      
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pattern-processor`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            workspace_id: workspace,
            user_id: userId,
            pattern_types: ['debugging', 'learning', 'memory_code'],
            limit: 100
          })
        })
        
        if (response.ok) {
          const result = await response.json()
          console.log(`✅ Pattern detection started: ${result.batchId}`)
        } else {
          console.error(`❌ Failed to trigger pattern detection: ${response.status}`)
        }
      } catch (error) {
        console.error(`❌ Error triggering pattern detection:`, error)
      }
      
      // Add delay between workspaces
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // Wait a bit for processing
    console.log('\n⏳ Waiting 30 seconds for pattern detection to complete...')
    await new Promise(resolve => setTimeout(resolve, 30000))

    // Check results
    console.log('\n📊 Checking Results:')
    console.log('─'.repeat(80))
    
    // Check Pattern nodes
    const patternResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)
      RETURN p.type as type, p.name as name, COUNT(p) as count
      ORDER BY count DESC
      LIMIT 10
    `, {})
    
    console.log('\nPattern Nodes Created:')
    patternResult.records.forEach(record => {
      console.log(`  ${record.type}/${record.name}: ${record.count?.toNumber() || 0}`)
    })

    // Check Pattern relationships
    const patternRelResult = await neo4jService.executeQuery(`
      MATCH (p:Pattern)-[r]-(e)
      RETURN type(r) as relType, labels(e) as entityType, COUNT(r) as count
      ORDER BY count DESC
    `, {})
    
    console.log('\nPattern Relationships Created:')
    patternRelResult.records.forEach(record => {
      console.log(`  ${record.relType} -> ${record.entityType}: ${record.count?.toNumber() || 0}`)
    })

    // Check Memory-Code relationships
    const memCodeResult = await neo4jService.executeQuery(`
      MATCH (m:Memory)-[r:REFERENCES_CODE]->(c:CodeEntity)
      RETURN COUNT(r) as count
    `, {})
    
    console.log(`\nMemory-Code REFERENCES_CODE relationships: ${memCodeResult.records[0]?.count?.toNumber() || 0}`)

    // Check recent logs
    console.log('\n📋 Recent Pattern Detection Logs:')
    const { data: logs } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (logs) {
      logs.forEach(log => {
        console.log(`[${new Date(log.created_at).toLocaleTimeString()}] ${log.level}: ${log.message}`)
      })
    }

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

rerunPatternDetection()