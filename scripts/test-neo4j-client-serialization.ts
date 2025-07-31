// Test the Neo4j client serialization directly
import { serializeNeo4jData } from '@/lib/utils/neo4j-serializer'

// Simulate what Neo4j driver returns
const mockNeo4jRecord = {
  toObject: () => ({
    memory: {
      properties: {
        id: '123',
        content: 'Test memory',
        occurred_at: {
          year: 2025,
          month: 7,
          day: 29,
          hour: 14,
          minute: 30,
          second: 0,
          nanosecond: 0,
          timeZoneOffsetSeconds: 0
        },
        created_at: {
          year: 2025,
          month: 7,
          day: 28,
          hour: 10,
          minute: 0,
          second: 0,
          nanosecond: 0
        }
      }
    },
    score: 0.85,
    relatedMemories: [
      {
        properties: {
          id: '456',
          occurred_at: {
            year: 2025,
            month: 7,
            day: 27,
            hour: 9,
            minute: 15,
            second: 30,
            nanosecond: 500000000
          }
        }
      }
    ]
  })
}

console.log('Testing Neo4j client serialization...\n')

// Simulate what happens in the client
const rawObject = mockNeo4jRecord.toObject()
console.log('1. Raw Neo4j object:')
console.log(JSON.stringify(rawObject, null, 2).substring(0, 500) + '...')

console.log('\n2. After serialization:')
const serialized = serializeNeo4jData(rawObject)
console.log(JSON.stringify(serialized, null, 2).substring(0, 500) + '...')

console.log('\n3. Date field checks:')
console.log('memory.properties.occurred_at:', serialized.memory.properties.occurred_at)
console.log('memory.properties.created_at:', serialized.memory.properties.created_at)
console.log('relatedMemories[0].properties.occurred_at:', serialized.relatedMemories[0].properties.occurred_at)

console.log('\n4. JSON.stringify test:')
try {
  const json = JSON.stringify(serialized)
  console.log('✅ Successfully serialized to JSON')
  
  // Verify no temporal objects remain
  if (json.includes('"year":') && json.includes('"month":') && json.includes('"day":')) {
    console.log('⚠️  WARNING: JSON still contains temporal object structure')
  } else {
    console.log('✅ No temporal objects found in JSON')
  }
} catch (error) {
  console.error('❌ Failed to serialize:', error)
}

console.log('\n5. React component simulation:')
const ReactComponent = ({ data }: { data: any }) => {
  // This would throw in React if data contains non-serializable objects
  try {
    JSON.stringify(data)
    return 'Success'
  } catch (e) {
    return 'Error: ' + e
  }
}

const result = ReactComponent({ data: serialized })
console.log('React render result:', result === 'Success' ? '✅ Success' : `❌ ${result}`)