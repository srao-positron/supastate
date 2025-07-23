'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Terminal, CheckCircle, XCircle } from 'lucide-react'

function CLIAuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const client = searchParams.get('client')
  const state = searchParams.get('state')
  const callback = searchParams.get('callback')
  
  useEffect(() => {
    // Check if user is authenticated
    checkAuth()
  }, [])
  
  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      // Redirect to login with return URL
      const returnUrl = encodeURIComponent(window.location.href)
      router.push(`/auth/login?returnUrl=${returnUrl}`)
    }
  }
  
  async function generateAPIKey() {
    setLoading(true)
    setError(null)
    
    try {
      // Generate API key
      const response = await fetch('/api/auth/generate-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${client || 'CLI'} - ${new Date().toLocaleDateString()}`
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to generate API key')
      }
      
      const { apiKey, keyId } = await response.json()
      
      // Get user info
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('User not authenticated')
      }
      
      // Redirect back to CLI callback
      if (callback) {
        const callbackUrl = new URL(callback)
        callbackUrl.searchParams.set('state', state || '')
        callbackUrl.searchParams.set('api_key', apiKey)
        callbackUrl.searchParams.set('user_id', user.id)
        
        setSuccess(true)
        
        // Redirect after short delay
        setTimeout(() => {
          window.location.href = callbackUrl.toString()
        }, 1500)
      } else {
        // No callback, just show the key
        setSuccess(true)
        setError(`API Key: ${apiKey}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }
  
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Authentication Successful!</CardTitle>
            <CardDescription>
              Redirecting back to {client || 'CLI'}...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }
  
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <CardTitle>CLI Authentication</CardTitle>
          </div>
          <CardDescription>
            {client ? `Authorize ${client} to access your Supastate account` : 'Generate an API key for CLI access'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && !success && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>This will create a new API key that allows:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Syncing memories from your local Camille instance</li>
              <li>Searching your personal workspace</li>
              <li>Managing your code graphs</li>
            </ul>
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => window.close()}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={generateAPIKey}
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Authorize & Generate Key'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function CLIAuthPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <CLIAuthContent />
    </Suspense>
  )
}