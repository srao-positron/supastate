// Simple test for the parse-code edge function

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMjQzMTIsImV4cCI6MjA2ODcwMDMxMn0.qHj1WTuVlhS9Tq63ZNFtSGxDBU8w06Lci6pgTzV5-go'

async function testParseCode() {
  console.log('Testing parse-code edge function...')
  console.log('URL:', `${SUPABASE_URL}/functions/v1/parse-code`)
  
  const testCode = `
    import React from 'react';
    
    export const Button = ({ onClick, children }) => {
      return <button onClick={onClick}>{children}</button>;
    };
  `
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        code: testCode,
        language: 'typescript',
        filename: 'Button.tsx'
      })
    })
    
    console.log('Response status:', response.status)
    console.log('Response headers:', Object.fromEntries(response.headers.entries()))
    
    const text = await response.text()
    console.log('Response body:', text)
    
    if (response.ok) {
      const result = JSON.parse(text)
      console.log('Parsed result:', JSON.stringify(result, null, 2))
    }
  } catch (error) {
    console.error('Request failed:', error)
  }
}

testParseCode()