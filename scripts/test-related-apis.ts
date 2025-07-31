#!/usr/bin/env npx tsx

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Get auth cookie from environment or use the provided one
const AUTH_COOKIE = process.env.AUTH_COOKIE || 'sb-zqlfxakbkwssxfynrmnk-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU9pSklVekkxTmlJc0luUjVjQ0k2SWtwWFZDSXNJbXRwWkNJNklqTnJNRGhsTWpaak0yRmxaRGxpSWl3aVpYQnJJanA3SW10MGVTSTZJbFJUSWl3aVpTSTZJa0ZSUVVJaUxDSjRJam9pU0dwdGRrdE1XSGxRU1Y5TlVHVlJjRjlOYlhsS09VUlZZMUpYV25aeFEySnFhMDF5VmxobU4wODBZMUpFYTA1MlowVktVV1JxT0VoTGEyWk1SRU4xVXpkVlNHeEZOMFJWTlRGSE5uaE9jRGRxUjB0SGJXSktVekJoYW5GWllqVjBNazQxU3paMVNHMUNXVUo2V0drd2FuSnJjRGRYTlRJM2JYbFVNbGhoTlY5aFdHTkxRVzFoTjJoc05VeDBkRGh5Vm01Q1JETXRXRmcwZEhKMGN6RTBUSEozYkY5MVMwZE9lR1Z6WXpVdGEyaHdhR2hVZGxvek16aHdaVVZQYkRoTFdGaE9OV1p6Ykd4UVgxaFFhMUJLZDBGMk4zUjJMV2t5UW01M2RqQlJkRWgyVXpKQmNsTnZVRUZ0VmtSSU5YSTBWVTFaWjJZMldrOUdUa0ZsZW10a1FVMDRPRTl1VGtGRE4wcHRiR042VTNCalp6Tm1XVVpMVjA5VlVHcEdNV05CVjNabFpVOW1RM042UVdoSlVYYzBiMnhXY0U1cVFsaGZOazUzV0U1MU16UklTM1ZSU0VjdE9GbDNjME5MU0ROaGJWRTRjWFIyWVhNeVl6RjRTSFZ4Vms5bVZGSlhiMDVOTm1Od1QwaEJOR3hvZUZWVlEwMUhkSEV6Um1KMGRrTlRZVTk1V0d0VGNVTlFjM2wyVGxVMllXVnJOWGgwTTJsR2RXNUJabFpzUVRFMWNubHVia042ZDJ0b2R6RjZNMjluVFRGTVQwMWlkblpvZEhWUVkzRjVlV1JGUmkxV1RGcGxiVTFST1dwdmFFaHlNWEJMTkVaelJUbFZTME5TU0hKdU5uaHhPR3BQTUZSb01tbDBjbGxSU0hkdWFEbE1SVWRPUTJsV1JFbDFUMnBrTVhKZk5DMUpObmR6VWpOdU1YRkRNRVZwTTFBMlVrOVFjWFZTTjJGSFJEbHlYelY2VEZOQmRXbFJPVXg0VEZkcGJIRnNlRTlCWlZGR1VqRm9PVFZ3Umpnd1YzSnJlVU5VUkdOM1lWQnJXbE4wZVdaSGNGVjRSRWhzT1hNMlMwOXVObUphYVhVek5sRTVkVVJoYUdkU1JYbE1YMHRvVUVsaFRGaHZjVTV6TVZSVGRYbENPR1pDYUdKRVMxSmhNVmhQZFRKcVEwOXFYM2RZYld4V1VrNTJNVjlNVFhwbU5VcGFZVmwyZVhwb0luMTkuZXlKaGRXUWlPaUpoZFhSb1pXNTBhV05oZEdWa0lpd2laWGh3SWpveE56TXlOekEwTWpZMkxDSnBZWFFpT2pFM016STNNREE0TmpZc0ltbHpjeUk2SW1oMGRIQnpPaTh2ZW5Gc1puaGhhMkpyZDNOemVHWjVibkp0Ym1zdWMzVndZV0poYzJVdVkyOHZZWFYwYUM5Mk1TSXNJbk4xWWlJNklqTmhOV0V5TURZeExURXpNekV0TkRCak9TMWhaREEzTFRKaE5XSTNPVEkxWkRWa01pSXNJbVZ0WVdsc0lqb2ljMjlzWVhOb2NtRnZRR2R0WVdsc0xtTnZiU0lzSW5Cb2IyNWxJam9pSWl3aVlYQndYMjFsZEdGa1lYUmhJanA3SW5CeWIzWnBaR1Z5SWpvaVoyOXZaMnhsSWl3aWNISnZkbWxrWlhKeklqcGJJbWR2YjJkc1pTSmRmU3dpZFhObGNsOXRaWFJoWkdGMFlTSTZleUpoZG1GMFlYSlZjbXdpT2lKb2RIUndjem92TDJ4b0xtZHZiMmRzWlhWelpYSmpiMjUwWlc1MExtTnZiUzloTDBGRFJ6STVRMEZxYTBaclp6WldPRFpRZVV0T2RFSk1iek5JWlVGNVMxaE9jazQxUWxselVtczNWVTFOV210VlRFTnphMGR1VlhKTGMycFJUaXRwVTFGMFMzUkNjVFowTTFSWE0zaDJRekJwVlZFM09YTkNVSFpGVG1STVVIcHdXRWxKVDJaUmJFbGtZVzQxVFRkTmVqRmtXSGhFV0RGNGMwdHJNVlV3TTBKcVdHcFFkV1UxYW1KaGJWOUdPVWN3YldONGNEaE1ObGhFVFdGSWJFcEdVSFJ1ZUhObGQzSXdNV2hXVUQwOUlpd2laVzFoYVd3aU9pSnpiMnhoYzJoeVlXOUFaMjFoYVd3dVkyOXRJaXdpWm5Wc2JGOXVZVzFsSWpvaVUyOXNZWE5vSUZKaGJ5SXNJbUYyWVhSaGNsOTFjbXdpT2lKb2RIUndjem92TDJ4b0xtZHZiMmRzWlhWelpYSmpiMjUwWlc1MExtTnZiUzloTDBGRFJ6STVRMEZxYTBaclp6WldPRFpRZVV0T2RFSk1iek5JWlVGNVMxaE9jazQxUWxselVtczNWVTFOV210VlRFTnphMGR1VlhKTGMycFJUaXRwVTFGMFMzUkNjVFowTTFSWE0zaDJRekJwVlZFM09YTkNVSFpGVG1STVVIcHdXRWxKVDJaUmJFbGtZVzQxVFRkTmVqRmtXSGhFV0RGNGMwdHJNVlV3TTBKcVdHcFFkV1UxYW1KaGJWOUdPVWN3YldONGNEaE1ObGhFVFdGSWJFcEdVSFJ1ZUhObGQzSXdNV2hXVUQwOVB6TXlJaXdpY0dsalpISldaMW80SWpvaWFIUjBjSE02THk5cGJXRm5aWE10Y0d4aGRHWnZjbTB0ZEdrNExYVnBMbk0xTG1SbFlYSnpZMlJ1TG1OdmJTOXdkV0pzYVdNdmJXVnRZbVZ5Y3k5alJtbHRVbXREVG1SUGJYQTRRa1ZTVW10VWIweFJOVVY0UVRaWGJqZGplbGNfWkdVME1qazFaV0l6WldFME9HSTJOV0l4TWpBd09UTTBZemMzTXpJME1pNXFjR2NpTENKd2NtOW1hV3hsWDJOdmJHOXlJam9pWm1abU0yWTRJbjBzSW5KdmJHVWlPaUpoZFhSb1pXNTBhV05oZEdWa0lpd2lZV0ZzSWpvaVlXRnNNU0lzSW1GdGNpSTZXM3NpYldWMGFHOWtJam9pYjJGMWRHZ2lMQ0owYVcxbGMzUmhiWEFpT2pFM016STNNREE0TmpWOVhTd2ljMlZ6YzJsdmJsOXBaQ0k2SW1ObE5UWTRaamswTFRGa09USXRORGs0Wmkxa05XRXdMVEJpWlRSak1XVmtNV0UxWmlJc0ltbHpYMkZ1YjI1NWJXOTFjeUk2Wm1Gc2MyVjkucHp0RWlUX0dHVmRwNWlGN0NOdDl5OHVPT21mdEg5TmlYcXdMTFJRUGFLbw==; Max-Age=0; Path=/; SameSite=Lax; Secure';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  endpoint: string;
  status: 'success' | 'error';
  message: string;
  data?: any;
}

async function testAPI(endpoint: string, description: string): Promise<TestResult> {
  console.log(`\nTesting: ${description}`);
  console.log(`Endpoint: ${endpoint}`);
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'Cookie': AUTH_COOKIE,
        'Accept': 'application/json'
      }
    });
    
    const responseText = await response.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse response as JSON:', responseText);
      return {
        endpoint,
        status: 'error',
        message: `Failed to parse response: ${responseText.substring(0, 100)}...`
      };
    }
    
    if (!response.ok) {
      console.error(`❌ Error: ${response.status} ${response.statusText}`);
      console.error('Response:', JSON.stringify(data, null, 2));
      return {
        endpoint,
        status: 'error',
        message: `HTTP ${response.status}: ${data.error || response.statusText}`,
        data
      };
    }
    
    console.log(`✅ Success: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
    
    return {
      endpoint,
      status: 'success',
      message: 'API call successful',
      data
    };
    
  } catch (error: any) {
    console.error(`❌ Network Error:`, error.message);
    return {
      endpoint,
      status: 'error',
      message: `Network error: ${error.message}`
    };
  }
}

async function main() {
  console.log('🧪 Testing Related Content APIs');
  console.log('=' .repeat(80));
  
  const results: TestResult[] = [];
  
  // Test memory related API
  const memoryId = '7d78c280-27d2-4f6f-b42b-55aa32d9aac7'; // From previous tests
  results.push(await testAPI(
    `/api/memories/${memoryId}/related`,
    'Memory Related Content API'
  ));
  
  // Test code related API  
  const codeEntityId = '1ad528cf-589f-41d2-bee9-cd84dc7a07e1'; // From previous tests
  results.push(await testAPI(
    `/api/code/${codeEntityId}/related`,
    'Code Related Content API'
  ));
  
  // Summary
  console.log('\n' + '=' .repeat(80));
  console.log('📊 Test Summary:');
  console.log('=' .repeat(80));
  
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  
  console.log(`Total tests: ${results.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  
  if (errorCount > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`- ${r.endpoint}: ${r.message}`);
    });
  }
  
  // Check if code API is returning related content
  const codeResult = results.find(r => r.endpoint.includes('/api/code/'));
  if (codeResult?.status === 'success' && codeResult.data?.related) {
    const related = codeResult.data.related;
    console.log('\n📝 Code Related Content Analysis:');
    console.log(`- Definitions: ${related.definitions?.length || 0}`);
    console.log(`- Same File (before): ${related.sameFile?.before?.length || 0}`);
    console.log(`- Same File (after): ${related.sameFile?.after?.length || 0}`);
    console.log(`- Dependencies: ${related.dependencies?.length || 0}`);
    console.log(`- Usages: ${related.usages?.length || 0}`);
    console.log(`- Memories: ${related.memories?.length || 0}`);
    
    if (related.definitions?.length > 0) {
      console.log('\n🎯 Found Function/Class Definitions:');
      related.definitions.forEach((def: any) => {
        console.log(`  - ${def.nodeType}: ${def.displayName || def.name}`);
      });
    }
  }
}

main().catch(console.error);