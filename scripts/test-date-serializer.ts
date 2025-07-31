import { serializeNeo4jData } from '@/lib/utils/neo4j-serializer'

// Mock Neo4j temporal object based on the error
const mockNeo4jDateTime = {
  year: 2025,
  month: 7,
  day: 29,
  hour: 14,
  minute: 30,
  second: 45,
  nanosecond: 123456789,
  timeZoneOffsetSeconds: -18000 // -5 hours (EST)
}

const mockNeo4jDateOnly = {
  year: 2025,
  month: 7,
  day: 29
}

const mockRecord = {
  id: '123',
  content: 'Test memory content',
  occurred_at: mockNeo4jDateTime,
  created_at: mockNeo4jDateTime,
  updated_at: mockNeo4jDateOnly,
  metadata: {
    lastAccessed: mockNeo4jDateTime,
    tags: ['test', 'memory']
  }
}

const mockArray = [
  {
    id: '1',
    timestamp: mockNeo4jDateTime
  },
  {
    id: '2',
    timestamp: mockNeo4jDateOnly
  }
]

console.log('Testing Neo4j date serialization...\n')

console.log('1. Testing single DateTime object:')
const serializedDateTime = serializeNeo4jData(mockNeo4jDateTime)
console.log('Input:', mockNeo4jDateTime)
console.log('Output:', serializedDateTime)
console.log('Type:', typeof serializedDateTime)

console.log('\n2. Testing Date-only object:')
const serializedDate = serializeNeo4jData(mockNeo4jDateOnly)
console.log('Input:', mockNeo4jDateOnly)
console.log('Output:', serializedDate)

console.log('\n3. Testing nested object:')
const serializedRecord = serializeNeo4jData(mockRecord)
console.log('Input:', JSON.stringify(mockRecord, null, 2))
console.log('Output:', JSON.stringify(serializedRecord, null, 2))

console.log('\n4. Testing array:')
const serializedArray = serializeNeo4jData(mockArray)
console.log('Output:', JSON.stringify(serializedArray, null, 2))

console.log('\n5. Testing JSON.stringify compatibility:')
try {
  const json = JSON.stringify(serializedRecord)
  console.log('✅ Successfully serialized to JSON')
  console.log('Sample:', json.substring(0, 100) + '...')
} catch (error) {
  console.error('❌ Failed to serialize:', error)
}

console.log('\n6. Testing React rendering compatibility:')
// Simulate what React would see
const reactComponent = {
  props: {
    data: serializedRecord
  }
}
try {
  JSON.stringify(reactComponent)
  console.log('✅ React-compatible structure')
} catch (error) {
  console.error('❌ Not React-compatible:', error)
}