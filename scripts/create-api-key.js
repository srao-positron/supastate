const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function createApiKey() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  // Create an API key for testing
  const keyName = `claude-testing-${Date.now()}`;
  const keyValue = `ck_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
  
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      name: keyName,
      key_hash: keyValue, // In production, this should be hashed
      permissions: ['read', 'write'],
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    })
    .select()
    .single();
    
  if (error) {
    console.error('Error creating API key:', error);
    return;
  }
  
  console.log('API Key created successfully:');
  console.log('Name:', keyName);
  console.log('Key:', keyValue);
  console.log('ID:', data.id);
  console.log('\nSave this key securely - it won\'t be shown again!');
}

createApiKey().catch(console.error);