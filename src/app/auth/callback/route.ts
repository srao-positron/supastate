import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/memories'
  const isCli = searchParams.get('cli') === 'true'
  const port = searchParams.get('port')

  // If this is a CLI authentication, redirect to the CLI callback handler
  if (isCli && code) {
    const cliCallbackUrl = new URL(`${origin}/auth/cli/callback`)
    cliCallbackUrl.searchParams.set('code', code)
    if (port) {
      cliCallbackUrl.searchParams.set('port', port)
    }
    return NextResponse.redirect(cliCallbackUrl.toString())
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Successful authentication
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with error details
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
}