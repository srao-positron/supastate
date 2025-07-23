import { redirect } from 'next/navigation'

export default function SignupPage() {
  // Since we're using GitHub SSO only, redirect to login
  redirect('/auth/login')
}