"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Copy,
  Eye,
  EyeOff,
  Key,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
} from "lucide-react"
import { format } from "date-fns"

interface ApiKey {
  id: string
  name: string
  key_hash: string
  last_used_at: string | null
  created_at: string
  expires_at: string | null
  is_active: boolean
}

export function ApiKeyManager() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [teamId, setTeamId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchApiKeys()
  }, [])

  async function fetchApiKeys() {
    try {
      const supabase = createClient()
      
      // Get current user and team
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .single()

      if (!teamMember) return

      setTeamId(teamMember.team_id)

      // Fetch API keys
      const { data: keys, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("team_id", teamMember.team_id)
        .order("created_at", { ascending: false })

      if (error) throw error

      setApiKeys(keys || [])
    } catch (error) {
      console.error("Error fetching API keys:", error)
      toast({
        title: "Error",
        description: "Failed to load API keys",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function createApiKey() {
    if (!newKeyName.trim() || !teamId) return

    setIsCreating(true)
    try {
      // Generate a random API key
      const key = `sk_${generateRandomString(32)}`
      
      // Hash the key (in production, this would be done server-side)
      const keyHash = await hashApiKey(key)

      const supabase = createClient()
      const { data, error } = await supabase
        .from("api_keys")
        .insert({
          team_id: teamId,
          name: newKeyName.trim(),
          key_hash: keyHash,
        })
        .select()
        .single()

      if (error) throw error

      setApiKeys([data, ...apiKeys])
      setGeneratedKey(key)
      setNewKeyName("")
      
      toast({
        title: "API key created",
        description: "Make sure to copy your API key now. You won't be able to see it again!",
      })
    } catch (error) {
      console.error("Error creating API key:", error)
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  async function revokeApiKey(keyId: string) {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("api_keys")
        .update({ is_active: false })
        .eq("id", keyId)

      if (error) throw error

      setApiKeys(apiKeys.map(key => 
        key.id === keyId ? { ...key, is_active: false } : key
      ))

      toast({
        title: "API key revoked",
        description: "The API key has been deactivated",
      })
    } catch (error) {
      console.error("Error revoking API key:", error)
      toast({
        title: "Error",
        description: "Failed to revoke API key",
        variant: "destructive",
      })
    }
  }

  async function deleteApiKey(keyId: string) {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("api_keys")
        .delete()
        .eq("id", keyId)

      if (error) throw error

      setApiKeys(apiKeys.filter(key => key.id !== keyId))

      toast({
        title: "API key deleted",
        description: "The API key has been permanently deleted",
      })
    } catch (error) {
      console.error("Error deleting API key:", error)
      toast({
        title: "Error",
        description: "Failed to delete API key",
        variant: "destructive",
      })
    }
  }

  function generateRandomString(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    let result = ""
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  async function hashApiKey(key: string): Promise<string> {
    // In production, use bcrypt on the server side
    // This is a simple hash for demo purposes
    const encoder = new TextEncoder()
    const data = encoder.encode(key)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: "Copied",
        description: "API key copied to clipboard",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">API Keys</h2>
          <p className="text-muted-foreground">
            {apiKeys.length} {apiKeys.length === 1 ? "key" : "keys"} total
          </p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Create a new API key for programmatic access to your team's data
              </DialogDescription>
            </DialogHeader>

            {generatedKey ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-semibold">API Key Created</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Make sure to copy your API key now. You won't be able to see it again!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-background rounded border text-sm font-mono">
                      {showKey ? generatedKey : "sk_********************************"}
                    </code>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copyToClipboard(generatedKey)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setShowCreateDialog(false)
                      setGeneratedKey(null)
                      setShowKey(false)
                    }}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Key Name</Label>
                    <Input
                      id="name"
                      placeholder="Production API Key"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      A descriptive name to identify this API key
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={createApiKey}
                    disabled={!newKeyName.trim() || isCreating}
                  >
                    {isCreating ? "Creating..." : "Create Key"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {apiKeys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Key className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No API keys yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first API key to enable programmatic access
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {apiKeys.map((apiKey) => (
            <Card key={apiKey.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{apiKey.name}</CardTitle>
                    <CardDescription className="text-sm">
                      Created {format(new Date(apiKey.created_at), "PPP")}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKey.is_active ? (
                      <span className="flex items-center gap-1 text-sm text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4" />
                        Revoked
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Key ID: {apiKey.id.slice(0, 8)}...
                    </p>
                    {apiKey.last_used_at && (
                      <p className="text-sm text-muted-foreground">
                        Last used: {format(new Date(apiKey.last_used_at), "PPP")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKey.is_active && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revokeApiKey(apiKey.id)}
                      >
                        Revoke
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteApiKey(apiKey.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}