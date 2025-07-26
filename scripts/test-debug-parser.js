const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testDebugParser() {
  console.log('Testing debug parser...\n');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-code-debug`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  
  const result = await response.json();
  console.log('Success:', result.success);
  console.log('\nLogs:');
  result.logs.forEach(log => console.log(log));
  
  if (result.error) {
    console.log('\nError:', result.error);
  }
}

testDebugParser().catch(console.error);