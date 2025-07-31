import neo4j from 'neo4j-driver';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkJan28Activity() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || '',
    neo4j.auth.basic(
      process.env.NEO4J_USER || '',
      process.env.NEO4J_PASSWORD || ''
    )
  );

  const session = driver.session();

  try {
    console.log('Checking Neo4j activity around July 28, 2025 8:48 PM PST...');
    
    // Convert to UTC timestamp (milliseconds)
    const targetTime = new Date('2025-07-29T03:48:00.000Z').getTime();
    const startTime = targetTime - 10 * 60 * 1000; // 10 minutes before
    const endTime = targetTime + 10 * 60 * 1000;   // 10 minutes after

    console.log(`Time range: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);

    // Check EntitySummary nodes created around that time
    const summaryResult = await session.run(`
      MATCH (es:EntitySummary)
      WHERE es.created >= $startTime AND es.created <= $endTime
      RETURN es, labels(es) as labels
      ORDER BY es.created DESC
      LIMIT 20
    `, { startTime, endTime });

    console.log(`\nFound ${summaryResult.records.length} EntitySummary nodes created in time range:`);
    summaryResult.records.forEach(record => {
      const node = record.get('es').properties;
      const created = new Date(neo4j.int(node.created).toNumber());
      console.log(`\n[${created.toISOString()}] EntitySummary:`);
      console.log(`  ID: ${node.id}`);
      console.log(`  Type: ${node.type}`);
      console.log(`  Summary: ${node.summary?.substring(0, 100)}...`);
    });

    // Check any nodes created around that time
    const allNodesResult = await session.run(`
      MATCH (n)
      WHERE n.created >= $startTime AND n.created <= $endTime
      RETURN labels(n) as labels, count(n) as count
      ORDER BY count DESC
    `, { startTime, endTime });

    console.log(`\n\nAll node types created in time range:`);
    allNodesResult.records.forEach(record => {
      const labels = record.get('labels');
      const count = record.get('count').toNumber();
      console.log(`  ${labels.join(',')}: ${count} nodes`);
    });

    // Check for pattern detection activity
    const patternResult = await session.run(`
      MATCH (p)
      WHERE (p:Pattern OR p:SemanticPattern OR p:CodePattern) 
        AND p.created >= $startTime AND p.created <= $endTime
      RETURN labels(p) as labels, p.type as type, p.created as created
      ORDER BY p.created DESC
      LIMIT 10
    `, { startTime, endTime });

    console.log(`\n\nPattern nodes created in time range: ${patternResult.records.length}`);
    patternResult.records.forEach(record => {
      const labels = record.get('labels');
      const type = record.get('type');
      const created = new Date(neo4j.int(record.get('created')).toNumber());
      console.log(`  [${created.toISOString()}] ${labels.join(',')}: ${type}`);
    });

    // Check most recent EntitySummary nodes
    console.log('\n\n=== Most recent EntitySummary nodes ===');
    const recentResult = await session.run(`
      MATCH (es:EntitySummary)
      WHERE es.created IS NOT NULL
      RETURN es
      ORDER BY es.created DESC
      LIMIT 10
    `);

    recentResult.records.forEach(record => {
      const node = record.get('es').properties;
      const created = node.created ? new Date(neo4j.int(node.created).toNumber()) : null;
      console.log(`\n[${created?.toISOString() || 'No timestamp'}] EntitySummary:`);
      console.log(`  ID: ${node.id}`);
      console.log(`  Type: ${node.type}`);
      console.log(`  Summary: ${node.summary?.substring(0, 80)}...`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

checkJan28Activity().catch(console.error);