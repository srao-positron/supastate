export function getAppUrl() {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000'
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'https://www.supastate.ai'
}

export function getAuthCallbackUrl() {
  return `${getAppUrl()}/auth/callback`
}