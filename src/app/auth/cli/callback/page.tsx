'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';

function CLICallbackContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const code = searchParams.get('code');
  const callbackPort = searchParams.get('port') || '8899';

  useEffect(() => {
    async function processCallback() {
      if (!code) {
        setError('No authorization code received');
        setLoading(false);
        return;
      }

      try {
        // Exchange the code for an API key
        const response = await fetch('/api/auth/exchange-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to exchange token');
        }

        const data = await response.json();
        
        if (data.action === 'created') {
          setApiKey(data.apiKey);
          
          // Send the API key back to the CLI
          try {
            await fetch(`http://localhost:${callbackPort}/cli-callback`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                apiKey: data.apiKey,
                userId: data.userId,
                email: data.email,
              }),
            });
          } catch (err) {
            // CLI might have closed, that's ok
            console.log('Could not send to CLI:', err);
          }
        } else {
          setError('You already have an API key for Camille CLI. For security reasons, we cannot show existing keys.');
        }
        
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setLoading(false);
      }
    }

    processCallback();
  }, [code, callbackPort]);

  const copyCommand = async () => {
    const command = `camille supastate enable --url https://service.supastate.ai --api-key ${apiKey}`;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">Creating your API key...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>✅ API Key Created Successfully!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Your API key has been sent to Camille CLI. You can close this window.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">If the CLI didn't receive it, copy this command:</label>
            <div className="p-3 bg-muted rounded-md">
              <code className="text-sm break-all">
                camille supastate enable --url https://service.supastate.ai --api-key {apiKey}
              </code>
            </div>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={copyCommand}
            >
              {copied ? 'Copied!' : 'Copy Command'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CLICallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">Loading...</div>
          </CardContent>
        </Card>
      </div>
    }>
      <CLICallbackContent />
    </Suspense>
  );
}