import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function testIngestCode() {
  // Test with a small batch of files
  const testFiles = [
    {
      path: 'test/sample1.ts',
      content: 'export function test1() { return "hello"; }',
      language: 'typescript',
      lastModified: new Date().toISOString()
    },
    {
      path: 'test/sample2.py',
      content: 'def test2():\n    return "world"',
      language: 'python',
      lastModified: new Date().toISOString()
    }
  ]
  
  const body = {
    projectName: 'test-batch',
    workspaceId: 'user:test',
    files: testFiles,
    gitMetadata: {
      branch: 'main',
      commitSha: 'abc123'
    }
  }
  
  console.log('Sending test batch with', testFiles.length, 'files')
  
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-code`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    }
  )
  
  console.log('Response status:', response.status)
  const text = await response.text()
  console.log('Response body:', text)
  
  try {
    const json = JSON.parse(text)
    console.log('Parsed response:', JSON.stringify(json, null, 2))
  } catch (e) {
    // Not JSON
  }
}

testIngestCode()