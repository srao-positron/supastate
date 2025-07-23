import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createCliApiKey } from '../cli/route'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Check if this is a CLI authentication
      const cookieStore = await cookies()
      const isCliAuth = cookieStore.get('cli_auth')?.value === 'true'
      const cliState = cookieStore.get('cli_auth_state')?.value
      const cliCallback = cookieStore.get('cli_callback')?.value
      
      if (isCliAuth && cliState && cliCallback) {
        console.log('[Auth Callback] Processing CLI authentication')
        
        try {
          // Get the authenticated user
          const { data: { user }, error: userError } = await supabase.auth.getUser()
          
          if (userError || !user) {
            throw new Error('Failed to get authenticated user')
          }
          
          // Create API key for CLI
          const { apiKey, userId } = await createCliApiKey(user.id, user.email || '')
          
          // Clear CLI auth cookies
          cookieStore.delete('cli_auth')
          cookieStore.delete('cli_auth_state')
          cookieStore.delete('cli_callback')
          
          // Redirect to CLI callback with credentials
          const callbackUrl = new URL(cliCallback)
          callbackUrl.searchParams.set('state', cliState)
          callbackUrl.searchParams.set('api_key', apiKey)
          callbackUrl.searchParams.set('user_id', userId)
          
          return NextResponse.redirect(callbackUrl.toString())
        } catch (error) {
          console.error('[Auth Callback] CLI auth error:', error)
          
          // Redirect to CLI callback with error
          const callbackUrl = new URL(cliCallback)
          callbackUrl.searchParams.set('state', cliState)
          callbackUrl.searchParams.set('error', 'Failed to create API key')
          
          return NextResponse.redirect(callbackUrl.toString())
        }
      }
      
      // Regular web authentication
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
}