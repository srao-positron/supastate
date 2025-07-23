import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createHash, randomBytes } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Parse request body
    const { name } = await request.json()
    
    // Generate a secure API key
    const apiKey = `supa_${randomBytes(32).toString('base64url')}`
    const keyHash = createHash('sha256').update(apiKey).digest('hex')
    
    // Use service client to create API key
    const serviceClient = await createServiceClient()
    
    const { data: apiKeyData, error: apiKeyError } = await serviceClient
      .from('api_keys')
      .insert({
        user_id: user.id,
        name: name || `API Key ${new Date().toISOString().split('T')[0]}`,
        key_hash: keyHash,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select('id, name, created_at')
      .single()
    
    if (apiKeyError) {
      console.error('Failed to create API key:', apiKeyError)
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
    }
    
    return NextResponse.json({ 
      apiKey,
      userId: user.id,
      ...apiKeyData
    })
  } catch (error) {
    console.error('Generate API key error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}