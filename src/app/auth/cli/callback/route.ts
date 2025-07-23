import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiKey } from '@/lib/auth/api-key'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const port = searchParams.get('port') || '8899'
  
  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=no_code', request.url))
  }
  
  try {
    // Exchange code for session
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (authError || !authData.session) {
      console.error('[CLI Auth] Failed to exchange code:', authError)
      return NextResponse.redirect(new URL('/auth/login?error=invalid_code', request.url))
    }
    
    // Get user info
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error('[CLI Auth] Failed to get user:', userError)
      return NextResponse.redirect(new URL('/auth/login?error=no_user', request.url))
    }
    
    // Check if user already has a CLI API key
    const { data: existingKey } = await supabase
      .from('api_keys')
      .select('id, name, created_at')
      .eq('user_id', user.id)
      .eq('name', 'Camille CLI')
      .eq('is_active', true)
      .single()
    
    let apiKey: string
    let action: string
    
    if (existingKey) {
      // User already has a key - for security, we don't return it
      // Instead, we'll show a message
      action = 'existing'
      apiKey = '' // Don't expose existing keys
    } else {
      // Create new API key
      const result = await createApiKey(user.id, 'Camille CLI')
      
      if (result.error) {
        console.error('[CLI Auth] Failed to create API key:', result.error)
        return NextResponse.redirect(new URL('/auth/login?error=api_key_failed', request.url))
      }
      
      apiKey = result.apiKey!
      action = 'created'
    }
    
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
            ${action === 'created' ? `
              <h1 class="success">✅ Authentication Successful!</h1>
              <p>Your API key has been created and sent to Camille CLI.</p>
              <p>You can close this window and return to your terminal.</p>
              <div class="code">
                <strong>If the CLI didn't receive it, run:</strong><br>
                camille supastate enable --url https://www.supastate.ai --api-key ${apiKey}
              </div>
            ` : `
              <h1 class="error">⚠️ API Key Already Exists</h1>
              <p>You already have an API key for Camille CLI.</p>
              <p>For security reasons, we cannot show existing keys.</p>
              <p>To generate a new key, please revoke the existing one in the Supastate dashboard.</p>
            `}
          </div>
          ${action === 'created' ? `
          <script>
            // Send API key back to CLI
            (async () => {
              try {
                await fetch('http://localhost:${port}/cli-callback', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    apiKey: '${apiKey}',
                    userId: '${user.id}',
                    email: '${user.email || ''}',
                  }),
                });
              } catch (err) {
                // CLI might have closed, that's ok
                console.log('Could not send to CLI:', err);
              }
            })();
          </script>
          ` : ''}
        </body>
      </html>
    `
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    })
    
  } catch (error) {
    console.error('[CLI Auth] Unexpected error:', error)
    return NextResponse.redirect(new URL('/auth/login?error=unexpected', request.url))
  }
}