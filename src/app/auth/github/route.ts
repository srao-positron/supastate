import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { origin } = new URL(request.url)
  const supabase = await createClient()
  
  // Check if this is a CLI auth request
  const cookieStore = await cookies()
  const isCliAuth = cookieStore.get('cli_auth')?.value === 'true'
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: 'user:email' // Only request email scope for CLI auth
    }
  })

  if (error) {
    console.error('[GitHub Auth] Error:', error)
    
    if (isCliAuth) {
      // For CLI auth, redirect back to callback with error
      const cliCallback = cookieStore.get('cli_callback')?.value
      const cliState = cookieStore.get('cli_auth_state')?.value
      
      if (cliCallback && cliState) {
        const callbackUrl = new URL(cliCallback)
        callbackUrl.searchParams.set('state', cliState)
        callbackUrl.searchParams.set('error', 'OAuth initiation failed')
        return NextResponse.redirect(callbackUrl.toString())
      }
    }
    
    return NextResponse.redirect(`${origin}/auth/login?error=oauth_error`)
  }

  if (data.url) {
    return NextResponse.redirect(data.url)
  }

  return NextResponse.redirect(`${origin}/auth/login?error=oauth_error`)
}