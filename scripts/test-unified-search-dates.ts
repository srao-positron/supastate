import { cookies } from 'next/headers'

// Mock cookies to test locally
async function testUnifiedSearchDates() {
  console.log('Testing unified search date serialization...\n')
  
  const baseUrl = 'http://localhost:3000'
  
  try {
    // Test search request
    const searchQuery = 'test'
    const response = await fetch(`${baseUrl}/api/search/unified`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add auth headers if needed
      },
      body: JSON.stringify({
        query: searchQuery,
        filters: {
          includeMemories: true,
          includeCode: true
        }
      })
    })
    
    if (!response.ok) {
      console.error('Search failed:', response.status, response.statusText)
      const error = await response.text()
      console.error('Error:', error)
      return
    }
    
    const data = await response.json()
    console.log('Search response received')
    console.log('Number of results:', data.results?.length || 0)
    
    // Check each result for date fields
    if (data.results && data.results.length > 0) {
      console.log('\nChecking date fields in results:')
      
      data.results.forEach((result: any, index: number) => {
        console.log(`\nResult ${index + 1} (${result.type}):`)
        console.log('- ID:', result.id)
        console.log('- Title:', result.content?.title)
        
        // Check metadata timestamp
        if (result.metadata?.timestamp) {
          console.log('- Timestamp:', result.metadata.timestamp)
          console.log('  Type:', typeof result.metadata.timestamp)
          try {
            new Date(result.metadata.timestamp)
            console.log('  ✅ Valid date string')
          } catch (e) {
            console.log('  ❌ Invalid date format')
          }
        }
        
        // Check entity dates
        if (result.entity) {
          const dateFields = ['occurred_at', 'created_at', 'updated_at']
          dateFields.forEach(field => {
            if (result.entity[field]) {
              console.log(`- Entity ${field}:`, result.entity[field])
              console.log(`  Type:`, typeof result.entity[field])
              try {
                new Date(result.entity[field])
                console.log('  ✅ Valid date string')
              } catch (e) {
                console.log('  ❌ Invalid date format')
              }
            }
          })
        }
        
        // Check relationships
        if (result.relationships?.memories?.length > 0) {
          console.log('- Memory relationships:')
          result.relationships.memories.forEach((mem: any, idx: number) => {
            if (mem.occurred_at) {
              console.log(`  Memory ${idx + 1} occurred_at:`, mem.occurred_at, typeof mem.occurred_at)
            }
          })
        }
      })
      
      // Test JSON serialization
      console.log('\n\nTesting full response serialization:')
      try {
        const json = JSON.stringify(data)
        console.log('✅ Successfully serialized entire response to JSON')
        console.log('Response size:', json.length, 'characters')
      } catch (error) {
        console.error('❌ Failed to serialize response:', error)
      }
    } else {
      console.log('No results returned from search')
    }
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

// Check if running directly
if (require.main === module) {
  console.log('Note: This test requires the Next.js server to be running (npm run dev)')
  console.log('Make sure you have valid auth cookies set\n')
  
  testUnifiedSearchDates().catch(console.error)
}