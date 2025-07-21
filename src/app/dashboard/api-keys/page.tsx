import { Suspense } from "react"
import { ApiKeyManager } from "@/components/dashboard/api-key-manager"
import { Skeleton } from "@/components/ui/skeleton"

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
        <p className="text-muted-foreground">
          Manage API keys for programmatic access to your team's data
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-64" />
          </div>
        }
      >
        <ApiKeyManager />
      </Suspense>
    </div>
  )
}