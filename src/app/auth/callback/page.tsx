'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const handleCallback = async () => {
      // Check if this is a CLI auth
      const isCliAuth = searchParams.get('cli') === 'true';
      const cliPort = searchParams.get('port') || '8899';
      
      console.log('[Auth Callback Page] Processing callback:', {
        isCliAuth,
        cliPort,
        hash: window.location.hash,
        search: window.location.search
      });
      
      // Parse hash tokens if present
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      
      if (accessToken) {
        // We have tokens from implicit flow
        console.log('[Auth Callback Page] Found implicit flow tokens');
        
        if (isCliAuth) {
          // For CLI auth, redirect to server-side handler with tokens
          const tempCode = btoa(JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: Date.now() + 3600 * 1000 // 1 hour from now
          }));
          
          console.log('[Auth Callback Page] Redirecting to CLI processor');
          window.location.href = `/auth/cli/process?code=${encodeURIComponent(tempCode)}&port=${cliPort}`;
        } else {
          // Regular auth - set up Supabase session and redirect
          const supabase = createClient();
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken!
          });
          router.push('/dashboard');
        }
      } else {
        // No hash tokens, server-side flow will handle code exchange
        console.log('[Auth Callback Page] No implicit flow tokens, waiting for server-side processing');
        
        // The route handler will process the code exchange
        // Just show loading state
      }
    };
    
    handleCallback();
  }, [router, searchParams]);
  
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Processing authentication...</h2>
        <p className="text-gray-600">Please wait while we complete your login.</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Loading...</h2>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}