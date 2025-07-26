import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const port = searchParams.get('port') || '8899'
  
  console.log('[CLI Auth Debug] Received callback with:', {
    code: code ? 'present' : 'missing',
    port,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries())
  })
  
  if (!code) {
    console.error('[CLI Auth Debug] No code in callback URL')
    return NextResponse.redirect(new URL('/auth/login?error=no_code', request.url))
  }
  
  try {
    // Exchange code for session
    console.log('[CLI Auth Debug] Exchanging code for session...')
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (authError || !authData.session) {
      console.error('[CLI Auth Debug] Failed to exchange code:', authError)
      return NextResponse.redirect(new URL('/auth/login?error=invalid_code', request.url))
    }
    
    console.log('[CLI Auth Debug] Successfully exchanged code for session')
    
    // Get user info
    console.log('[CLI Auth Debug] Getting user info...')
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error('[CLI Auth Debug] Failed to get user:', userError)
      return NextResponse.redirect(new URL('/auth/login?error=no_user', request.url))
    }
    
    console.log('[CLI Auth Debug] Got user:', { id: user.id, email: user.email })
    
    // We have the session with JWT tokens
    const accessToken = authData.session.access_token
    const refreshToken = authData.session.refresh_token
    const expiresIn = authData.session.expires_in
    const expiresAt = authData.session.expires_at
    
    // Return HTML page that sends the API key back to CLI
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Supastate CLI Authentication</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #f3f4f6;
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 0.5rem;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              max-width: 500px;
              text-align: center;
            }
            .success { color: #10b981; }
            .error { color: #ef4444; }
            .code {
              background: #f3f4f6;
              padding: 1rem;
              border-radius: 0.25rem;
              font-family: monospace;
              font-size: 0.875rem;
              margin: 1rem 0;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="success">✅ Authentication Successful!</h1>
            <p>Your authentication tokens have been sent to Camille CLI.</p>
            <p>You can close this window and return to your terminal.</p>
            <div class="code">
              <strong>Session expires at:</strong><br>
              ${new Date(expiresAt! * 1000).toLocaleString()}
            </div>
          </div>
          <script>
            // Send JWT tokens back to CLI
            (async () => {
              console.log('[CLI Auth Debug] Attempting to send tokens to CLI at http://localhost:${port}/cli-callback');
              try {
                const response = await fetch('http://localhost:${port}/cli-callback', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    accessToken: '${accessToken}',
                    refreshToken: '${refreshToken}',
                    expiresIn: ${expiresIn},
                    expiresAt: ${expiresAt},
                    userId: '${user.id}',
                    email: '${user.email || ''}',
                  }),
                });
                console.log('[CLI Auth Debug] Response from CLI:', response.status, response.statusText);
              } catch (err) {
                // CLI might have closed, that's ok
                console.error('[CLI Auth Debug] Could not send to CLI:', err);
              }
            })();
          </script>
        </body>
      </html>
    `
    
    console.log('[CLI Auth Debug] Returning HTML response with JWT tokens')
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    })
    
  } catch (error) {
    console.error('[CLI Auth Debug] Unexpected error:', error)
    return NextResponse.redirect(new URL('/auth/login?error=unexpected', request.url))
  }
}