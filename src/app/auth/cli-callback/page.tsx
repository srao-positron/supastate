'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, Check } from 'lucide-react';

export default function CLICallbackPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function handleCallback() {
      try {
        const supabase = createClient();
        
        // Get the current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          setError('Not authenticated. Please log in first.');
          setLoading(false);
          return;
        }

        // Check if user already has a Camille API key
        const { data: existingKey } = await supabase
          .from('api_keys')
          .select('id, name, created_at')
          .eq('user_id', user.id)
          .eq('name', 'Camille CLI')
          .eq('is_active', true)
          .single();

        if (existingKey) {
          setError('You already have an API key for Camille CLI. For security reasons, we cannot show existing keys.');
          setLoading(false);
          return;
        }

        // Create a new API key
        const response = await fetch('/api/auth/generate-api-key', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'Camille CLI' }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create API key');
        }

        const { apiKey: newApiKey } = await response.json();
        setApiKey(newApiKey);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setLoading(false);
      }
    }

    handleCallback();
  }, []);

  const copyToClipboard = async () => {
    if (apiKey) {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
          <CardTitle>API Key Created Successfully!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Save this API key - it won't be shown again!
            </AlertDescription>
          </Alert>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Your API Key:</label>
            <div className="flex gap-2">
              <code className="flex-1 p-3 bg-muted rounded-md text-sm break-all">
                {apiKey}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={copyToClipboard}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Configure Camille:</label>
            <div className="p-3 bg-muted rounded-md">
              <code className="text-sm">
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

          <Alert>
            <AlertDescription>
              You can now close this window and return to your terminal.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}