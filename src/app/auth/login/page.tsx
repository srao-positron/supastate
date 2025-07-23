import { GitHubAuthForm } from '@/components/auth/github-auth-form'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In - Supastate',
  description: 'Sign in to your Supastate account',
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <GitHubAuthForm />
    </div>
  )
}