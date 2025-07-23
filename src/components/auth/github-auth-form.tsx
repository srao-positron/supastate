'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Github } from 'lucide-react'

export function GitHubAuthForm() {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const handleGitHubLogin = async () => {
    setLoading(true)
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'read:user user:email repo',
      },
    })

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
      setLoading(false)
    }
    // If successful, the user will be redirected to GitHub
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Welcome to Supastate</CardTitle>
        <CardDescription>
          Sign in with your GitHub account to access your team's code intelligence
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          className="w-full h-12 text-base"
          size="lg"
          onClick={handleGitHubLogin}
          disabled={loading}
        >
          <Github className="mr-2 h-5 w-5" />
          {loading ? 'Redirecting...' : 'Continue with GitHub'}
        </Button>
        
        <p className="text-center text-sm text-muted-foreground">
          By signing in, you agree to grant Supastate access to your GitHub repositories
          for code analysis and collaboration features.
        </p>
      </CardContent>
    </Card>
  )
}