'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient();
      
      // Check if this is a CLI auth
      const isCliAuth = searchParams.get('cli') === 'true';
      const cliPort = searchParams.get('port') || '8899';
      
      console.log('[Auth Callback Page] Processing callback:', {
        isCliAuth,
        cliPort,
        hash: window.location.hash,
        search: window.location.search
      });
      
      // Handle the auth callback
      const { error } = await supabase.auth.getSession();
      
      if (!error) {
        if (isCliAuth) {
          // For CLI auth, redirect to server-side handler
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            // Create a temporary auth code
            const tempCode = btoa(JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: session.expires_at
            }));
            
            // Redirect to server handler with code
            window.location.href = `/auth/cli/process?code=${encodeURIComponent(tempCode)}&port=${cliPort}`;
          }
        } else {
          // Regular auth - redirect to dashboard
          router.push('/dashboard');
        }
      } else {
        console.error('[Auth Callback Page] Error:', error);
        router.push('/auth/login?error=auth_failed');
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