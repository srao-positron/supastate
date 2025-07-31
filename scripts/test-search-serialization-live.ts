import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function testSearchSerialization() {
  console.log('Testing unified search with date serialization...\n')
  
  // Create Supabase client
  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
  
  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('Not authenticated. Please log in first.')
    return
  }
  
  console.log('Authenticated as:', user.email)
  
  // Get session for auth token
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('No session found')
    return
  }
  
  try {
    // Make unified search request
    const response = await fetch('http://localhost:3000/api/search/unified', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        query: 'memory',
        filters: {
          includeMemories: true,
          includeCode: true
        },
        pagination: {
          limit: 5
        }
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('Search failed:', response.status, error)
      return
    }
    
    const data = await response.json()
    console.log('\nSearch completed successfully')
    console.log('Results found:', data.results?.length || 0)
    
    // Analyze results
    if (data.results && data.results.length > 0) {
      console.log('\n=== DATE FIELD ANALYSIS ===')
      
      let hasDateIssues = false
      
      data.results.forEach((result: any, index: number) => {
        console.log(`\n--- Result ${index + 1} (${result.type}) ---`)
        
        // Check all date fields
        const checkDateField = (obj: any, path: string) => {
          const dateFields = ['occurred_at', 'created_at', 'updated_at', 'timestamp']
          
          Object.keys(obj).forEach(key => {
            const value = obj[key]
            const fullPath = path ? `${path}.${key}` : key
            
            if (dateFields.includes(key) && value !== null && value !== undefined) {
              console.log(`${fullPath}: ${value}`)
              
              // Check if it's a Neo4j temporal object
              if (typeof value === 'object' && 'year' in value && 'month' in value && 'day' in value) {
                console.log(`  ❌ FOUND NEO4J TEMPORAL OBJECT - Not serialized!`)
                console.log(`     Raw value:`, JSON.stringify(value))
                hasDateIssues = true
              } else if (typeof value === 'string') {
                try {
                  new Date(value)
                  console.log(`  ✅ Valid ISO date string`)
                } catch (e) {
                  console.log(`  ⚠️  String but not valid date format`)
                }
              } else {
                console.log(`  ⚠️  Unexpected type: ${typeof value}`)
              }
            } else if (value && typeof value === 'object' && !Array.isArray(value)) {
              // Recursively check nested objects
              checkDateField(value, fullPath)
            }
          })
        }
        
        checkDateField(result, '')
      })
      
      console.log('\n=== SERIALIZATION TEST ===')
      try {
        const json = JSON.stringify(data)
        console.log('✅ Full response can be serialized to JSON')
        console.log(`Response size: ${(json.length / 1024).toFixed(2)} KB`)
        
        // Try to parse it back
        const parsed = JSON.parse(json)
        console.log('✅ Can parse JSON back to object')
      } catch (error: any) {
        console.error('❌ Serialization failed:', error.message)
        hasDateIssues = true
      }
      
      if (hasDateIssues) {
        console.log('\n⚠️  WARNING: Date serialization issues detected!')
        console.log('The Neo4j client may not be properly serializing temporal objects.')
      } else {
        console.log('\n✅ All dates are properly serialized!')
      }
      
    } else {
      console.log('No results to analyze')
    }
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

// Run the test
console.log('Note: Make sure the dev server is running (npm run dev)')
console.log('This test will use your current Supabase session\n')

testSearchSerialization()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })