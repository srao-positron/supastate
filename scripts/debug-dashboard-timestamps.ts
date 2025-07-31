import neo4j from 'neo4j-driver';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_PASSWORD) {
  console.error('NEO4J_PASSWORD not found in environment variables');
  process.exit(1);
}

async function debugTimestamps() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  );

  const session = driver.session();

  try {
    // First, let's see what timestamps we have
    console.log('=== Checking Memory Timestamps ===\n');
    
    const result = await session.run(`
      MATCH (m:Memory)
      WHERE m.workspace_id = 'user:a02c3fed-3a24-442f-becc-97bac8b75e90'
      RETURN 
        m.occurred_at as occurred_at,
        m.created_at as created_at,
        m.content as content,
        m.id as id
      ORDER BY m.created_at DESC
      LIMIT 20
    `);

    console.log(`Found ${result.records.length} memories\n`);

    const timestamps = new Map<string, number>();
    const hourCounts = new Map<number, number>();
    
    result.records.forEach((record, idx) => {
      const occurred_at = record.get('occurred_at');
      const created_at = record.get('created_at');
      const content = record.get('content');
      const id = record.get('id');
      
      console.log(`Memory ${idx + 1} (ID: ${id}):`);
      console.log(`  occurred_at: ${occurred_at || 'NULL'}`);
      console.log(`  created_at:  ${created_at || 'NULL'}`);
      console.log(`  content:     ${content ? content.substring(0, 50) + '...' : 'NULL'}`);
      
      // Parse the timestamp to check distribution
      const ts = occurred_at || created_at;
      if (ts) {
        const date = new Date(ts);
        const dayKey = date.toISOString().split('T')[0];
        const hour = date.getHours();
        
        timestamps.set(dayKey, (timestamps.get(dayKey) || 0) + 1);
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        
        console.log(`  parsed date: ${dayKey} hour: ${hour}`);
      }
      console.log('');
    });

    console.log('\n=== Date Distribution ===');
    Array.from(timestamps.entries()).sort().forEach(([date, count]) => {
      console.log(`${date}: ${count} memories`);
    });

    console.log('\n=== Hour Distribution ===');
    Array.from(hourCounts.entries()).sort((a, b) => a[0] - b[0]).forEach(([hour, count]) => {
      console.log(`Hour ${hour}: ${count} memories`);
    });

    // Check if all timestamps are similar
    console.log('\n=== Timestamp Analysis ===');
    const allTimestamps = result.records.map(r => r.get('occurred_at') || r.get('created_at')).filter(Boolean);
    
    if (allTimestamps.length > 0) {
      const uniqueTimestamps = new Set(allTimestamps);
      console.log(`Total timestamps: ${allTimestamps.length}`);
      console.log(`Unique timestamps: ${uniqueTimestamps.size}`);
      
      if (uniqueTimestamps.size === 1) {
        console.log('\n⚠️  WARNING: All memories have the SAME timestamp!');
        console.log(`Timestamp: ${Array.from(uniqueTimestamps)[0]}`);
      }
    }

  } catch (error) {
    console.error('Error querying Neo4j:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

debugTimestamps().catch(console.error);