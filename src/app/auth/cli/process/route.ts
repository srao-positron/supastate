import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiKey } from '@/lib/auth/api-key'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const encodedCode = searchParams.get('code')
  const port = searchParams.get('port') || '8899'
  
  console.log('[CLI Process] Processing CLI auth with encoded session')
  
  if (!encodedCode) {
    return NextResponse.redirect(new URL('/auth/login?error=no_code', request.url))
  }
  
  try {
    // Decode the session data
    const sessionData = JSON.parse(atob(encodedCode))
    
    // Get user with the access token
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser(sessionData.access_token)
    
    if (userError || !user) {
      console.error('[CLI Process] Failed to get user:', userError)
      throw new Error('Failed to get authenticated user')
    }
    
    console.log('[CLI Process] Got user:', { id: user.id, email: user.email })
    
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
      console.log('[CLI Process] User already has a Camille CLI key')
      action = 'existing'
      apiKey = '' // Don't expose existing keys
    } else {
      console.log('[CLI Process] Creating new API key...')
      const result = await createApiKey(user.id, 'Camille CLI')
      
      if (result.error) {
        console.error('[CLI Process] Failed to create API key:', result.error)
        throw new Error('Failed to create API key')
      }
      
      console.log('[CLI Process] API key created successfully')
      apiKey = result.apiKey!
      action = 'created'
    }
    
    // Return HTML that sends API key back to CLI
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
              console.log('[CLI Auth] Attempting to send API key to CLI at http://localhost:${port}/cli-callback');
              try {
                const response = await fetch('http://localhost:${port}/cli-callback', {
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
                console.log('[CLI Auth] Response from CLI:', response.status, response.statusText);
              } catch (err) {
                // CLI might have closed, that's ok
                console.error('[CLI Auth] Could not send to CLI:', err);
              }
            })();
          </script>
          ` : ''}
        </body>
      </html>
    `
    
    console.log('[CLI Process] Returning HTML response with action:', action)
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    })
    
  } catch (error) {
    console.error('[CLI Process] Unexpected error:', error)
    return NextResponse.redirect(new URL('/auth/login?error=unexpected', request.url))
  }
}