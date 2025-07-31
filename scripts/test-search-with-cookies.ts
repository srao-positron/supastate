#!/usr/bin/env npx tsx

async function testUnifiedSearchAPI() {
  const authCookie = 'sb-zqlfxakbkwssxfynrmnk-auth-token.0=base64-eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU9pSklVekkxTmlJc0ltdDVaQ0k2SWpKaE9UUTVaV001TnkxbU16VmhMVFJqWlRZdFlUa3dOeTFtTWpFMU16ZzBObUpoTURraUxDSjBlWEFpT2lKS1YxUWlmUS5leUpwYzNNaU9pSm9kSFJ3Y3pvdkwzcHhiR1o0WVd0aWEzZHpjM2htZVc1eWJXNXJMbk4xY0dGaVlYTmxMbU52TG1GMWRHZ3Zkakl2ZEc5clpXNGlMQ0p6ZFdJaU9pSmhNREpqTTJabFpDMHpZVEkwTFRRME1tWXRZbVZqWXkwNU4ySmhZemhpTnpWbE9UQWlMQ0poZFdRaU9pSmhkWFJvWlc1MGFXTmhkR1ZrSWl3aVpYaHdJam94TnpZek5qSTVNVFV6TENKcFlYUWlPakUzTmpNMk1qVTFOVE1zSW1WdFlXbHNJam9pYzJGMWNtRmljbUY1YzJsdVoyaEFaMjFoYVd3dVkyOXRJaXdpY0dodmJtVWlPaUlpTENKaGNIQmZiV1YwWVdSaGRHRWlPbnNpY0hKdmRtbGtaWElpT2lKbmIyOW5iR1VpTENKd2NtOTJhV1JsY25NaU9sc2laMjl2WjJ4bElsMTlMQ0oxYzJWeVgyMWxkR0ZrWVhSaElqcDdJbUYyWVhSaGNsOTFjbXdpT2lKb2RIUndjem92TDJ4b05TNW5iMjluYkdWMWMyVnlZMjl1ZEdWdWRDNWpiMjB2WVMwdlFVWTVRWGxUYmxGV1JETm1YekUyWlRNNFlXVmlOVEF4V2pOSWJGWktPVmhtU3pWMk5ETkNaR1ZvVGxCUE9IcFplSFJvUkZGMVZ6SXhiR3RKVGxVOWN6azJMV01pTENKbGJXRnBiQ0k2SW5OaGRYSmhZbkpoZVhOcGJtZG9RR2R0WVdsc0xtTnZiU0lzSW1WdFlXbHNYM1psY21sbWFXVmtJanAwY25WbExDSm1kV3hzWDI1aGJXVWlPaUpUWVhWeVlXSWdVbUY1YzJsdVoyZ2lMQ0pwYzNNaU9pSm9kSFJ3Y3pvdkwyRmpZMjkxYm5SekxtZHZiMmRzWlM1amIyMGlMQ0p1WVcxbElqb2lVMkYxY21GaUlGSmhlWE5wYm1kb0lpd2ljR2xqZEhWeVpTSTZJbWgwZEhCek9pOHZiR2cyTG1kdmIyZHNaWFZ6WlhKamIyNTBaVzUwTG1OdmJTOWhMUzlCUmpsQmVWTnVVVlpFTTJaZk1UWmxNemhoWldJMU1ERmFNMGhzVmtvNVdHWkxOWFkwTTBKa1pXaE9VRTQ0ZWxwNGRHaEVVWFZYTWpGc2EwbE9WVDF6T1RZdFl5SXNJbkJ5YjNacFpHVnlYMmxrSWpvaU1URXlNREk0TnpnNU1qYzNPRE14TkRBNU1qTTRJaXdpYzNWaUlqb2lNVEUxTWpVNU5qYzBPRFV3T1RBM05UUXlPVFE0SW4wc0luSnZiR1VpT2lKaGRYUm9aVzUwYVdOaGRHVmtJaXdpWVdGc0lqb2lZV0ZzTVNJc0ltRnRjaUk2VzNzaWJXVjBhRzlrSWpvaWIyRjFkR2dpTENKMGFXMWxjM1JoYlhBaU9qRTNOak0yTWpVMU5UTjlYU3dpYzJWemMybHZibDlwWkNJNkltRXdZelV6WkdKakxXWmtOV1l0TkRNeU5TMWhNVEUzTFRjNU5UTm1ZVFF5TVRNNU5DSXNJbWx6WDJGdWIyNTViVzkxY3lJNlptRnNjMlY5LnVZcENIOFNsdWhtblM3Vy1OUEhSUzVJWl9aQ2Z2LWEzOHRzSUZGYUJoS1kiLCJ0b2tlbl90eXBlIjoiYmVhcmVyIiwiZXhwaXJlc19pbiI6MzYwMCwicmVmcmVzaF90b2tlbiI6IkdtZU9lOFdvd1RsN3ZJVlVfU3hWWXciLCJ1c2VyIjp7ImlkIjoiYTAyYzNmZWQtM2EyNC00NDJmLWJlY2MtOTdiYWM4Yjc1ZTkwIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiZW1haWwiOiJzYXVyYWJyYXlzaW5naEBnbWFpbC5jb20iLCJlbWFpbF9jb25maXJtZWRfYXQiOiIyMDI0LTEyLTI5VDA1OjI2OjI4Ljk2MTU4NFoiLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6Imdvb2dsZSIsInByb3ZpZGVycyI6WyJnb29nbGUiXX0sInVzZXJfbWV0YWRhdGEiOnsiYXZhdGFyX3VybCI6Imh0dHBzOi8vbGg2Lmdvb2dsZXVzZXJjb250ZW50LmNvbS9hLS9BRjlBeVNuUVZEQ2ZfMTZlMzhhZWI1MDFaM0hsVko5WGZLNXY0M0JkZWhOUE84elp4dGhEUXVXMjFsa0lOVT1zOTYtYyIsImVtYWlsIjoic2F1cmFicmF5c2luZ2hAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZ1bGxfbmFtZSI6IlNhdXJhYiBSYXlzaW5naCIsImlzcyI6Imh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbSIsIm5hbWUiOiJTYXVyYWIgUmF5c2luZ2giLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDYuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EtL0FGOUF5U25RVkQzZl8xNmUzOGFlYjUwMVozSGxWSjlYZks1djQzQmRlaE5QTzh6Wnh0aERRdVcyMWxrSU5VPXM5Ni1jIiwicHJvdmlkZXJfaWQiOiIxMTIwMjg3ODkyNzc4MzE0MDkyMzgiLCJzdWIiOiIxMTUyNTk2NzQ4NTA5MDc1NDI5NDgifSwiYW1yIjpbeyJtZXRob2QiOiJvYXV0aCIsInRpbWVzdGFtcCI6MTc2MzYyNTU1M31dLCJzZXNzaW9uX2lkIjoiYTBjNTNkYmMtZmQ1Zi00MzI1LWExMTctNzk1M2ZhNDIxMzk0IiwiaXNfYW5vbnltb3VzIjpmYWxzZX19; sb-zqlfxakbkwssxfynrmnk-auth-token.1=base64-dE5DQUlvQ1hJdGRIbHdaU0lLQkNCaVpXRnlaWElLQUVOeVpXWnlaWE5vWDNSdmEyVnVJZ3BCVEcxdFQyVTRWMjkzVkd3M2RrbFdWVjlUZUZaWmR3b0FDQUpwWVhRU0N5ZG1lWFZrWVhvbkNnQUlBQXBsZUhCcGNtVnpYMmx1Q2tBZURBb0FDQUlKWlhod2FYSmxjMTloZEJJTEozWjBkWEprZURBbkNnQUlBQT09'

  // Test queries
  const queries = [
    'middleware',
    'MCP', 
    'debug',
    'pattern detection'
  ]

  for (const query of queries) {
    console.log(`\n--- Testing query: "${query}" ---`)
    
    try {
      const response = await fetch('http://localhost:3000/api/search/unified', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': authCookie
        },
        body: JSON.stringify({
          query,
          includeMemories: true,
          includeCode: true,
          limit: 10
        })
      })

      console.log('Response status:', response.status)

      const data = await response.json()
      
      if (data.error) {
        console.error('Error:', data.error)
        if (data.details) console.error('Details:', data.details)
      } else {
        console.log(`Results: ${data.results?.length || 0} found`)
        console.log(`Intent: ${data.intent?.primaryIntent || 'unknown'}`)
        
        if (data.results?.length > 0) {
          data.results.slice(0, 3).forEach((result: any, i: number) => {
            console.log(`\n${i + 1}. ${result.title || 'Untitled'}`)
            console.log(`   Type: ${result.type}`)
            console.log(`   Score: ${result.score}`)
            if (result.snippet) {
              console.log(`   Snippet: ${result.snippet.substring(0, 100)}...`)
            }
            if (result.highlights?.length > 0) {
              console.log(`   Highlights: ${result.highlights[0]}`)
            }
          })
        } else {
          console.log('(No results found)')
        }
        
        // Show facets
        if (data.facets) {
          console.log('\nFacets:')
          Object.entries(data.facets).forEach(([key, values]: [string, any]) => {
            if (values.length > 0) {
              console.log(`  ${key}: ${values.slice(0, 3).map((v: any) => `${v.value} (${v.count})`).join(', ')}`)
            }
          })
        }
      }
    } catch (error) {
      console.error('Request failed:', error)
    }
  }
}

testUnifiedSearchAPI().catch(console.error)