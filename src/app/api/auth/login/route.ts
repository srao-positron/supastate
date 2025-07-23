/**
 * Login endpoint for Camille CLI
 * Returns an API key after email/password authentication
 */

import { createClient } from '@/lib/supabase/server'
import { createApiKey } from '@/lib/auth/api-key'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      )
    }
    
    // Create Supabase client
    const supabase = await createClient()
    
    // Authenticate with email/password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (authError || !authData.user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }
    
    // Check if user already has a Camille API key
    const { data: existingKey } = await supabase
      .from('api_keys')
      .select('id, name, created_at')
      .eq('user_id', authData.user.id)
      .eq('name', 'Camille CLI')
      .eq('is_active', true)
      .single()
    
    if (existingKey) {
      // Return existing key info (not the actual key for security)
      return NextResponse.json({
        message: 'API key already exists for Camille CLI',
        keyId: existingKey.id,
        createdAt: existingKey.created_at,
        userId: authData.user.id,
        email: authData.user.email,
        action: 'existing'
      })
    }
    
    // Create a new API key
    const result = await createApiKey(authData.user.id, 'Camille CLI')
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }
    
    // Return the new API key
    return NextResponse.json({
      apiKey: result.apiKey,
      userId: authData.user.id,
      email: authData.user.email,
      action: 'created',
      message: 'API key created for Camille CLI'
    })
    
  } catch (error) {
    console.error('[Login] Error:', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}