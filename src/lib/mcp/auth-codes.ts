// Temporary in-memory store for auth codes
// In production, this should use Redis or similar
const authCodes = new Map<string, { userId: string; email: string; timestamp: number; exp: number }>()

export function storeAuthCode(code: string, userId: string, email: string): void {
  const timestamp = Date.now()
  authCodes.set(code, {
    userId,
    email,
    timestamp,
    exp: timestamp + 5 * 60 * 1000 // 5 minutes
  })
  
  // Clean up expired codes
  for (const [key, value] of authCodes.entries()) {
    if (Date.now() > value.exp) {
      authCodes.delete(key)
    }
  }
}

export function getAuthCode(code: string): { userId: string; email: string } | null {
  const data = authCodes.get(code)
  if (!data) return null
  
  // Check if expired
  if (Date.now() > data.exp) {
    authCodes.delete(code)
    return null
  }
  
  // Delete after use (one-time use)
  authCodes.delete(code)
  return { userId: data.userId, email: data.email }
}

export function generateAuthCode(): string {
  // Generate a short, opaque code like Stripe's
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 15)
  return `ac_${random}${timestamp}`
}