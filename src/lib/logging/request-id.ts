import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

export function getRequestId(request: NextRequest): string {
  // Check for existing request ID from proxy/load balancer
  const requestId = 
    request.headers.get('x-request-id') ||
    request.headers.get('x-vercel-id') ||
    randomUUID();
  
  return requestId;
}

export function sanitizeForLogging(data: any): any {
  if (!data) return data;
  
  const sensitive = ['password', 'api_key', 'apiKey', 'token', 'secret', 'authorization'];
  
  if (typeof data === 'object') {
    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    
    for (const key in sanitized) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = sanitizeForLogging(sanitized[key]);
      }
    }
    
    return sanitized;
  }
  
  return data;
}