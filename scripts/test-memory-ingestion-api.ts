#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function testMemoryIngestion() {
  console.log('=== Testing Memory Ingestion API ===\n')
  
  // Test memory data
  const testMemory = {
    content: "Testing the queue-based memory ingestion system. This is a test memory created to verify the basic flow is working.",
    project_name: "test-project",
    type: "experience",
    metadata: {
      source: "test-script",
      timestamp: new Date().toISOString()
    },
    occurred_at: new Date().toISOString()
  }
  
  // Call the memory ingestion API
  console.log('1. Calling memory ingestion API...')
  
  // Extract the access token from the cookie
  const authCookie = 'base64-eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU9pSklVekkxTmlJc0ltdHBaQ0k2SW13dmEyTmxkRGh0VG14QlZuUktWR0lpTENKMGVYQWlPaUpLVjFRaWZRLmV5SnBjM01pT2lKb2RIUndjem92TDJKcmJuQnNaSGxrYld0NmRYQnpabUZuYm5aaExuTjFjR0ZpWVhObExtTnZMMkYxZEdndmRqRWlMQ0p6ZFdJaU9pSTVNelUwWW1abU9DMDNNalpqTFRRMVptVXRPREV4WWkxaE4yRTNNalEzTVdVNU16UWlMQ0poZFdRaU9pSmhkWFJvWlc1MGFXTmhkR1ZrSWl3aVpYaHdJam94TnpVek16QTBNalV3TENKcFlYUWlPakUzTlRNek1EQTJOVEFzSW1WdFlXbHNJam9pYzJsa1pHaGhjblJvWVM1ekxuSmhiMEJuYldGcGJDNWpiMjBpTENKd2FHOXVaU0k2SWlJc0ltRndjRjl0WlhSaFpHRjBZU0k2ZXlKd2NtOTJhV1JsY2lJNkltVnRZV2xzSWl3aWNISnZkbWxrWlhKeklqcGJJbVZ0WVdsc0lsMTlMQ0oxYzJWeVgyMWxkR0ZrWVhSaElqcDdJbVZ0WVdsc0lqb2ljMmxrWkdoaGNuUm9ZUzV6TG5KaGIwQm5iV0ZwYkM1amIyMGlMQ0psYldGcGJGOTJaWEpwWm1sbFpDSTZkSEoxWlN3aWNHaHZibVZmZG1WeWFXWnBaV1FpT21aaGJITmxMQ0p6ZFdJaU9pSTVNelUwWW1abU9DMDNNalpqTFRRMVptVXRPREV4WWkxaE4yRTNNalEzTVdVNU16UWlmU3dpY205c1pTSTZJbUYxZEdobGJuUnBZMkYwWldRaUxDSmhZV3dpT2lKaFlXd3hJaXdpWVcxeUlqcGJleUp0WlhSb2IyUWlPaUp3WVhOemQyOXlaQ0lzSW5ScGJXVnpkR0Z0Y0NJNk1UYzFNakV5TXpFeE1IMWRMQ0p6WlhOemFXOXVYMmxrSWpvaU0yWXhNekprTnpRdE16UmxNQzAwTURsa0xUazRaR010WXpsa09XTXpOakZoT0dFeUlpd2lhWE5mWVc1dmJubHRiM1Z6SWpwbVlXeHpaWDAudHVoUlVJbmZScFUwZ3h5VVZ6dkNuWHBYYzFOdnN0eERlTGxIcU00NEpKZyIsInRva2VuX3R5cGUiOiJiZWFyZXIiLCJleHBpcmVzX2luIjozNjAwLCJleHBpcmVzX2F0IjoxNzUzMzA0MjUwLCJyZWZyZXNoX3Rva2VuIjoiazZtbWlnNHFwZnBlIiwidXNlciI6eyJpZCI6IjkzNTRiZmY4LTcyNmMtNDVmZS04MTFiLWE3YTcyNDcxZTkzNCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImVtYWlsIjoic2lkZGhhcnRoYS5zLnJhb0BnbWFpbC5jb20iLCJlbWFpbF9jb25maXJtZWRfYXQiOiIyMDI1LTA3LTA2VDA1OjIwOjE5LjMzMzY1OFoiLCJwaG9uZSI6IiIsImNvbmZpcm1hdGlvbl9zZW50X2F0IjoiMjAyNS0wNy0wNlQwNToxOToxNi4xMTAxOTRaIiwiY29uZmlybWVkX2F0IjoiMjAyNS0wNy0wNlQwNToyMDoxOS4zMzM2NThaIiwibGFzdF9zaWduX2luX2F0IjoiMjAyNS0wNy0xMlQxNzo1ODowMC4yNzExMVoiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6InNpZGRoYXJ0aGEucy5yYW9AZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiOTM1NGJmZjgtNzI2Yy00NWZlLTgxMWItYTdhNzI0NzFlOTM0In0sImlkZW50aXRpZXMiOlt7ImlkZW50aXR5X2lkIjoiYmQ2NDBiNjctYmQxNC00YTA3LWJjNTctM2M4NzZmZmVmYjYxIiwiaWQiOiI5MzU0YmZmOC03MjZjLTQ1ZmUtODExYi1hN2E3MjQ3MWU5MzQiLCJ1c2VyX2lkIjoiOTM1NGJmZjgtNzI2Yy00NWZlLTgxMWItYTdhNzI0NzFlOTM0IiwiaWRlbnRpdHlfZGF0YSI6eyJlbWFpbCI6InNpZGRoYXJ0aGEucy5yYW9AZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiOTM1NGJmZjgtNzI2Yy00NWZlLTgxMWItYTdhNzI0NzFlOTM0In0sInByb3ZpZGVyIjoiZW1haWwiLCJsYXN0X3NpZ25faW5fYXQiOiIyMDI1LTA3LTA2VDA1OjE5OjE2LjEwNjg0WiIsImNyZWF0ZWRfYXQiOiIyMDI1LTA3LTA2VDA1OjE5OjE2LjEwNjg5OVoiLCJ1cGRhdGVkX2F0IjoiMjAyNS0wNy0wNlQwNToxOToxNi4xMDY4OTlaIiwiZW1haWwiOiJzaWRkaGFydGhhLnMucmFvQGdtYWlsLmNvbSJ9XSwiY3JlYXRlZF9hdCI6IjIwMjUtMDctMDZUMDU6MTk6MTYuMTAzMTIyWiIsInVwZGF0ZWRfYXQiOiIyMDI1LTA3LTIzVDE5OjU2OjIxLjMwNDkwM1oiLCJpc19hbm9ueW1vdXMiOmZhbHNlfX0'
  // Decode from base64
  const authDataStr = Buffer.from(authCookie.replace('base64-', ''), 'base64').toString('utf-8')
  const authData = JSON.parse(authDataStr)
  const accessToken = authData.access_token
  
  // For API routes, we still need the cookie but also can try Authorization header
  const cookieString = 'sb-bknpldydmkzupsfagnva-auth-token-code-verifier=base64-ImQ0YzU2ZjhlZDg0ODNmMTE2NzQzZjI2ZGE5NmJmMmYyMDgwYThlM2UwNjg4YzY0NDg3NmRlZGMxMWVlNzFlZGFkNGE2OTcwNTgzMTllMzE1ZWNlM2ExNTAwMDQwZDFkMTNmZmIzNzM5NDU2YTM2NWIi; __next_hmr_refresh_hash__=395372effa8f26fa0cc13dd3c90c5df1170d135ba0be478a; sb-bknpldydmkzupsfagnva-auth-token=' + authCookie
  
  const response = await fetch('http://localhost:3000/api/neo4j/ingest-memory', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Cookie': cookieString
    },
    body: JSON.stringify(testMemory)
  })
  
  if (!response.ok) {
    console.error('❌ API call failed:', response.status, response.statusText)
    const error = await response.text()
    console.error('Error:', error)
    return
  }
  
  const result = await response.json()
  console.log('✅ Memory created:', result)
  
  // Wait a moment for queue processing
  console.log('\n2. Waiting 3 seconds for queue processing...')
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  // Trigger the worker manually
  console.log('\n3. Triggering memory ingestion worker...')
  const workerResponse = await fetch(
    'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/memory-ingestion-worker',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    }
  )
  
  if (workerResponse.ok) {
    const workerResult = await workerResponse.json()
    console.log('Worker response:', workerResult)
  } else {
    console.error('Worker error:', await workerResponse.text())
  }
  
  // Check logs
  console.log('\n4. Checking logs...')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  const { data: logs } = await supabase
    .from('pattern_processor_logs')
    .select('created_at, level, message')
    .gte('created_at', new Date(Date.now() - 60000).toISOString())
    .or('message.ilike.%memory%,message.ilike.%Memory%')
    .order('created_at', { ascending: false })
    .limit(10)
    
  if (logs && logs.length > 0) {
    console.log('\nRecent memory-related logs:')
    for (const log of logs) {
      const time = new Date(log.created_at).toLocaleTimeString()
      console.log(`[${time}] [${log.level}] ${log.message}`)
    }
  } else {
    console.log('No recent memory logs found')
  }
  
  console.log('\n✅ Memory ingestion API test complete!')
  console.log('\nNote: The memory was queued for processing.')
  console.log('Pattern detection should be triggered after successful ingestion.')
}

testMemoryIngestion().catch(console.error)