/**
 * Create API key endpoint - requires session authentication
 */

import { createClient } from '@/lib/supabase/server'
import { createApiKey } from '@/lib/auth/api-key'
import { NextResponse } from 'next/server'
import { log } from '@/lib/logger'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Parse request
    const { name } = await request.json()
    
    if (!name) {
      return NextResponse.json(
        { error: 'API key name required' },
        { status: 400 }
      )
    }
    
    // Create API key
    const result = await createApiKey(user.id, name)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      apiKey: result.apiKey,
      message: 'Save this API key - it will only be shown once!'
    })
    
  } catch (error) {
    log.error('Create API key error', error)
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    )
  }
}