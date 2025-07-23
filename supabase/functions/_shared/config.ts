export interface Config {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey?: string;
  environment: string;
}

export function getConfig(): Config {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('[Config] Missing required environment variables', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!supabaseServiceRoleKey,
    });
    throw new Error('Missing required environment variables');
  }
  
  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    openaiApiKey: Deno.env.get('OPENAI_API_KEY'),
    environment: Deno.env.get('DENO_ENV') || 'production',
  };
}