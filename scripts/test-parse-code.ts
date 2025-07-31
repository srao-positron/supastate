// Test the parse-code edge function

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMjQzMTIsImV4cCI6MjA2ODcwMDMxMn0.qHj1WTuVlhS9Tq63ZNFtSGxDBU8w06Lci6pgTzV5-go'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function testParseCode() {
  const testCases = [
    {
      name: 'TypeScript React Component',
      code: `
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export const UserProfile: React.FC<{ userId: string }> = ({ userId }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, [userId]);

  async function fetchUser() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (!error) setUser(data);
    setLoading(false);
  }

  return <div>{loading ? 'Loading...' : user?.name}</div>;
};
`,
      language: 'typescript'
    },
    {
      name: 'Python Data Processing',
      code: `
import pandas as pd
from typing import List, Dict
import asyncio

class DataAnalyzer:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.cache = {}
    
    async def analyze_batch(self, records: List[Dict]) -> pd.DataFrame:
        df = pd.DataFrame(records)
        df['analyzed'] = True
        return df
    
    def get_summary(self, df: pd.DataFrame) -> Dict:
        return {
            'total': len(df),
            'analyzed': df['analyzed'].sum()
        }
`,
      language: 'python'
    }
  ]

  for (const testCase of testCases) {
    console.log(`\n=== Testing: ${testCase.name} ===`)
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          code: testCase.code,
          language: testCase.language,
          filename: 'test.' + testCase.language
        })
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('Error:', response.status, error)
        continue
      }

      const result = await response.json()
      console.log('Result:', JSON.stringify(result, null, 2))
    } catch (error) {
      console.error('Failed:', error)
    }
  }
}

testParseCode()