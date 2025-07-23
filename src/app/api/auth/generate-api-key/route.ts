import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createHash, randomBytes } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Parse request body
    const { name = 'Camille CLI' } = await request.json()
    
    // Generate a secure API key
    const apiKey = `supastate_${randomBytes(32).toString('base64url')}`
    const keyHash = createHash('sha256').update(apiKey).digest('hex')
    
    // Store the hashed key
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        name,
        key_hash: keyHash,
        is_active: true
      })
      .select('id')
      .single()
    
    if (error) {
      console.error('Failed to create API key:', error)
      return NextResponse.json({ 
        error: 'Failed to create API key' 
      }, { status: 500 })
    }
    
    // Return the API key (only time it's shown in plain text)
    return NextResponse.json({
      apiKey,
      keyId: data.id,
      name,
      createdAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('API key generation error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}