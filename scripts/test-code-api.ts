import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function testCodeAPI() {
  const baseUrl = 'http://localhost:3000'
  
  // First get a session token (you'll need to be logged in)
  // For testing, we'll use the service role key
  const response = await fetch(`${baseUrl}/api/code`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    }
  })

  if (!response.ok) {
    console.error('API Error:', response.status, await response.text())
    return
  }

  const data = await response.json()
  console.log('Code API Response:')
  console.log(`Total entities: ${data.total}`)
  console.log(`Entities returned: ${data.entities.length}`)
  
  if (data.entities.length > 0) {
    console.log('\nFirst few entities:')
    data.entities.slice(0, 3).forEach((entity: any, idx: number) => {
      console.log(`\n${idx + 1}. ${entity.name} (${entity.type})`)
      console.log(`   ID: ${entity.id}`)
      console.log(`   File: ${entity.filePath || 'N/A'}`)
      console.log(`   Lines: ${entity.lineStart}-${entity.lineEnd}`)
    })
  }

  // Test with project filter
  console.log('\n\nTesting with project filter...')
  const projectResponse = await fetch(`${baseUrl}/api/code?projectName=supastate`, {
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    }
  })

  if (projectResponse.ok) {
    const projectData = await projectResponse.json()
    console.log(`Entities in supastate project: ${projectData.total}`)
  }
}

testCodeAPI().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})