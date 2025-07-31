#!/usr/bin/env npx tsx
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function testDirectCrawl() {
  console.log('Testing direct crawl API...')
  
  const jobId = '4d1bd06c-88dd-43b3-b8f2-1bb71b041752'
  
  const response = await fetch(`${appUrl}/api/github/crawl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`
    },
    body: JSON.stringify({
      job_id: jobId
    })
  })
  
  console.log('Response status:', response.status)
  
  const text = await response.text()
  console.log('Response:', text)
  
  try {
    const json = JSON.parse(text)
    console.log('Parsed response:', JSON.stringify(json, null, 2))
  } catch (e) {
    console.log('Response is not JSON')
  }
}

testDirectCrawl()