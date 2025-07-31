import { config } from 'dotenv';
import neo4j from 'neo4j-driver';

// Load environment variables
config({ path: '.env.local' });

interface RelatedItem {
  id: string;
  type: 'Memory' | 'CodeEntity';
  name?: string;
  title?: string;
  content?: string;
  relationshipType: string;
  relationshipDetails?: any;
  score?: number;
}

async function findRelatedItems(nodeId: string, nodeType: 'Memory' | 'CodeEntity') {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  );
  const session = driver.session();

  try {
    console.log(`\n=== Finding Related Items for ${nodeType}: ${nodeId} ===\n`);

    const relatedItems: RelatedItem[] = [];

    if (nodeType === 'Memory') {
      // 1. Find directly referenced code entities
      console.log('1. Directly Referenced Code:');
      console.log('---------------------------');
      const directCodeResult = await session.run(`
        MATCH (m:Memory {id: $nodeId})-[r:REFERENCES_CODE]->(c:CodeEntity)
        RETURN 
          c.id as id,
          c.name as name,
          c.type as codeType,
          c.content as content,
          r.similarity as similarity,
          r.detection_method as method
        ORDER BY r.similarity DESC
      `, { nodeId });

      directCodeResult.records.forEach(record => {
        const item: RelatedItem = {
          id: record.get('id'),
          type: 'CodeEntity',
          name: record.get('name'),
          content: record.get('content'),
          relationshipType: 'REFERENCES_CODE',
          relationshipDetails: {
            similarity: record.get('similarity'),
            method: record.get('method'),
            codeType: record.get('codeType')
          },
          score: record.get('similarity')
        };
        relatedItems.push(item);
        console.log(`- ${item.name} (${item.relationshipDetails.codeType}) - Similarity: ${item.score?.toFixed(3)}`);
      });

      // 2. Find memories from same time period (context)
      console.log('\n2. Contextual Memories (same time period):');
      console.log('------------------------------------------');
      const contextResult = await session.run(`
        MATCH (m:Memory {id: $nodeId})
        MATCH (other:Memory)
        WHERE other.id <> m.id
          AND other.user_id = m.user_id
          AND abs(duration.inSeconds(m.occurred_at, other.occurred_at).seconds) < 3600
        RETURN 
          other.id as id,
          other.title as title,
          other.content as content,
          other.occurred_at as occurred_at,
          abs(duration.inSeconds(m.occurred_at, other.occurred_at).seconds) as timeDiff
        ORDER BY timeDiff ASC
        LIMIT 5
      `, { nodeId });

      contextResult.records.forEach(record => {
        const timeDiff = record.get('timeDiff').toNumber();
        const item: RelatedItem = {
          id: record.get('id'),
          type: 'Memory',
          title: record.get('title'),
          content: record.get('content'),
          relationshipType: 'TEMPORAL_CONTEXT',
          relationshipDetails: {
            timeDifference: timeDiff,
            occurredAt: record.get('occurred_at')
          },
          score: 1 - (timeDiff / 3600) // Score based on time proximity
        };
        relatedItems.push(item);
        console.log(`- "${item.title || 'Untitled'}" - ${Math.floor(timeDiff / 60)} minutes apart`);
      });

      // 3. Find memories that reference the same code
      console.log('\n3. Memories referencing same code:');
      console.log('----------------------------------');
      const sameCodeResult = await session.run(`
        MATCH (m:Memory {id: $nodeId})-[:REFERENCES_CODE]->(c:CodeEntity)<-[:REFERENCES_CODE]-(other:Memory)
        WHERE other.id <> m.id
        RETURN DISTINCT
          other.id as id,
          other.title as title,
          other.content as content,
          c.name as sharedCode,
          COUNT(DISTINCT c) as sharedCodeCount
        ORDER BY sharedCodeCount DESC
        LIMIT 5
      `, { nodeId });

      sameCodeResult.records.forEach(record => {
        const item: RelatedItem = {
          id: record.get('id'),
          type: 'Memory',
          title: record.get('title'),
          content: record.get('content'),
          relationshipType: 'SHARED_CODE_REFERENCE',
          relationshipDetails: {
            sharedCode: record.get('sharedCode'),
            sharedCodeCount: record.get('sharedCodeCount').toNumber()
          },
          score: Math.min(record.get('sharedCodeCount').toNumber() * 0.2, 1)
        };
        relatedItems.push(item);
        console.log(`- "${item.title || 'Untitled'}" - References ${item.relationshipDetails.sharedCodeCount} same code files`);
      });

    } else if (nodeType === 'CodeEntity') {
      // 1. Find memories that discuss this code
      console.log('1. Memories discussing this code:');
      console.log('---------------------------------');
      const discussedResult = await session.run(`
        MATCH (c:CodeEntity {id: $nodeId})<-[r:REFERENCES_CODE]-(m:Memory)
        RETURN 
          m.id as id,
          m.title as title,
          m.content as content,
          r.similarity as similarity,
          r.detection_method as method
        ORDER BY r.similarity DESC
      `, { nodeId });

      discussedResult.records.forEach(record => {
        const item: RelatedItem = {
          id: record.get('id'),
          type: 'Memory',
          title: record.get('title'),
          content: record.get('content'),
          relationshipType: 'DISCUSSED_IN',
          relationshipDetails: {
            similarity: record.get('similarity'),
            method: record.get('method')
          },
          score: record.get('similarity')
        };
        relatedItems.push(item);
        console.log(`- "${item.title || 'Untitled'}" - Similarity: ${item.score?.toFixed(3)}`);
      });

      // 2. Find imported/importing code entities
      console.log('\n2. Code Dependencies:');
      console.log('--------------------');
      
      // Imports from this file
      const importsResult = await session.run(`
        MATCH (c:CodeEntity {id: $nodeId})-[r:IMPORTS]->(imported:CodeEntity)
        RETURN 
          imported.id as id,
          imported.name as name,
          imported.type as codeType,
          r.specifiers as specifiers
      `, { nodeId });

      importsResult.records.forEach(record => {
        const item: RelatedItem = {
          id: record.get('id'),
          type: 'CodeEntity',
          name: record.get('name'),
          relationshipType: 'IMPORTS',
          relationshipDetails: {
            codeType: record.get('codeType'),
            specifiers: record.get('specifiers')
          },
          score: 0.8
        };
        relatedItems.push(item);
        console.log(`- Imports: ${item.name} (${item.relationshipDetails.codeType})`);
      });

      // Imported by other files
      const importedByResult = await session.run(`
        MATCH (c:CodeEntity {id: $nodeId})<-[r:IMPORTS]-(importer:CodeEntity)
        RETURN 
          importer.id as id,
          importer.name as name,
          importer.type as codeType,
          r.specifiers as specifiers
      `, { nodeId });

      importedByResult.records.forEach(record => {
        const item: RelatedItem = {
          id: record.get('id'),
          type: 'CodeEntity',
          name: record.get('name'),
          relationshipType: 'IMPORTED_BY',
          relationshipDetails: {
            codeType: record.get('codeType'),
            specifiers: record.get('specifiers')
          },
          score: 0.8
        };
        relatedItems.push(item);
        console.log(`- Imported by: ${item.name} (${item.relationshipDetails.codeType})`);
      });

      // 3. Find functions/classes defined in this file
      console.log('\n3. Code Structure:');
      console.log('-----------------');
      const definesResult = await session.run(`
        MATCH (c:CodeEntity {id: $nodeId})-[r:DEFINES_FUNCTION|DEFINES_CLASS]->(defined:CodeEntity)
        RETURN 
          defined.id as id,
          defined.name as name,
          defined.type as codeType,
          type(r) as relType
      `, { nodeId });

      definesResult.records.forEach(record => {
        const item: RelatedItem = {
          id: record.get('id'),
          type: 'CodeEntity',
          name: record.get('name'),
          relationshipType: record.get('relType'),
          relationshipDetails: {
            codeType: record.get('codeType')
          },
          score: 0.9
        };
        relatedItems.push(item);
        console.log(`- Defines: ${item.name} (${item.relationshipDetails.codeType})`);
      });

      // 4. Find other code in same project
      console.log('\n4. Same Project Code:');
      console.log('--------------------');
      const sameProjectResult = await session.run(`
        MATCH (c:CodeEntity {id: $nodeId})-[:BELONGS_TO_PROJECT]->(p)<-[:BELONGS_TO_PROJECT]-(other:CodeEntity)
        WHERE other.id <> c.id
        RETURN 
          other.id as id,
          other.name as name,
          other.type as codeType,
          p.name as projectName
        LIMIT 10
      `, { nodeId });

      sameProjectResult.records.forEach(record => {
        const item: RelatedItem = {
          id: record.get('id'),
          type: 'CodeEntity',
          name: record.get('name'),
          relationshipType: 'SAME_PROJECT',
          relationshipDetails: {
            codeType: record.get('codeType'),
            projectName: record.get('projectName')
          },
          score: 0.6
        };
        relatedItems.push(item);
        console.log(`- ${item.name} (${item.relationshipDetails.codeType}) in ${item.relationshipDetails.projectName}`);
      });
    }

    // Summary
    console.log('\n\n=== Relationship Summary ===');
    console.log('Total related items found:', relatedItems.length);
    
    // Group by relationship type
    const grouped = relatedItems.reduce((acc, item) => {
      acc[item.relationshipType] = (acc[item.relationshipType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\nBy relationship type:');
    Object.entries(grouped).forEach(([type, count]) => {
      console.log(`- ${type}: ${count}`);
    });

    // Return sorted by score
    return relatedItems.sort((a, b) => (b.score || 0) - (a.score || 0));

  } catch (error) {
    console.error('Error finding related items:', error);
    throw error;
  } finally {
    await session.close();
    await driver.close();
  }
}

// Example usage
async function main() {
  // Get a sample memory ID to test with
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  );
  const session = driver.session();

  try {
    // Find a memory that has code references
    const memoryResult = await session.run(`
      MATCH (m:Memory)-[:REFERENCES_CODE]->(:CodeEntity)
      RETURN m.id as id, m.title as title
      LIMIT 1
    `);

    if (memoryResult.records.length > 0) {
      const memoryId = memoryResult.records[0].get('id');
      const memoryTitle = memoryResult.records[0].get('title');
      console.log(`Testing with Memory: "${memoryTitle || 'Untitled'}" (${memoryId})`);
      await findRelatedItems(memoryId, 'Memory');
    }

    // Find a code entity that has relationships
    const codeResult = await session.run(`
      MATCH (c:CodeEntity)<-[:REFERENCES_CODE]-(:Memory)
      RETURN c.id as id, c.name as name
      LIMIT 1
    `);

    if (codeResult.records.length > 0) {
      const codeId = codeResult.records[0].get('id');
      const codeName = codeResult.records[0].get('name');
      console.log(`\n\nTesting with CodeEntity: "${codeName}" (${codeId})`);
      await findRelatedItems(codeId, 'CodeEntity');
    }

  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the example
main().catch(console.error);