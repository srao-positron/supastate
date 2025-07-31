import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkMemoryMetadata() {
  console.log('Checking memory metadata structure...\n');
  
  // First check the table structure
  const { data: columns, error: schemaError } = await supabase
    .rpc('get_table_columns', { table_name: 'memories' });
    
  if (schemaError) {
    // Alternative approach - just select all columns
    console.log('Getting table schema via select...');
  }
  
  // Get a sample of memories with their metadata
  const { data: memories, error } = await supabase
    .from('memories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error fetching memories:', error);
    return;
  }
  
  console.log(`Found ${memories?.length || 0} memories\n`);
  
  // Analyze each memory's metadata
  memories?.forEach((memory, index) => {
    console.log(`\n--- Memory #${index + 1} ---`);
    console.log(`ID: ${memory.id}`);
    console.log(`User ID: ${memory.user_id}`);
    console.log(`Workspace ID: ${memory.workspace_id || 'NULL'}`);
    console.log(`Created At: ${memory.created_at}`);
    
    // Show all top-level fields
    const topLevelFields = Object.keys(memory).filter(key => key !== 'metadata');
    console.log(`All fields: ${topLevelFields.join(', ')}`);
    
    if (memory.metadata) {
      console.log(`\nMetadata:`);
      console.log(JSON.stringify(memory.metadata, null, 2));
      
      // Check specific fields
      const metadata = memory.metadata as any;
      console.log(`\nMetadata Analysis:`);
      console.log(`- Has startTime: ${metadata.startTime ? 'YES' : 'NO'}`);
      console.log(`- StartTime value: ${metadata.startTime || 'N/A'}`);
      console.log(`- Has timestamp: ${metadata.timestamp ? 'YES' : 'NO'}`);
      console.log(`- Timestamp value: ${metadata.timestamp || 'N/A'}`);
      console.log(`- Has occurred_at in metadata: ${metadata.occurred_at ? 'YES' : 'NO'}`);
      console.log(`- Metadata occurred_at value: ${metadata.occurred_at || 'N/A'}`);
      
      // Check for any date-related fields
      const dateFields = Object.keys(metadata).filter(key => 
        key.toLowerCase().includes('date') || 
        key.toLowerCase().includes('time') ||
        key.toLowerCase().includes('occurred')
      );
      if (dateFields.length > 0) {
        console.log(`- Other date-related fields: ${dateFields.join(', ')}`);
      }
    } else {
      console.log(`\nNo metadata found`);
    }
  });
  
  // Summary statistics
  console.log(`\n\n=== SUMMARY ===`);
  const withStartTime = memories?.filter(m => (m.metadata as any)?.startTime).length || 0;
  const withTimestamp = memories?.filter(m => (m.metadata as any)?.timestamp).length || 0;
  const withMetadataOccurredAt = memories?.filter(m => (m.metadata as any)?.occurred_at).length || 0;
  
  console.log(`Total memories checked: ${memories?.length || 0}`);
  console.log(`Memories with startTime: ${withStartTime}`);
  console.log(`Memories with timestamp: ${withTimestamp}`);
  console.log(`Memories with metadata.occurred_at: ${withMetadataOccurredAt}`);
  
  // Check distinct metadata structures
  console.log(`\n\n=== METADATA STRUCTURE PATTERNS ===`);
  const metadataKeys = new Set<string>();
  memories?.forEach(m => {
    if (m.metadata) {
      Object.keys(m.metadata as any).forEach(key => metadataKeys.add(key));
    }
  });
  console.log(`Unique metadata keys found: ${Array.from(metadataKeys).join(', ')}`);
}

checkMemoryMetadata().catch(console.error);