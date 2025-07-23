import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Welcome to Supastate
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Cloud-based team collaboration for Camille code intelligence
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/auth/login">
              <Button size="lg">
                Sign in with GitHub
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
        
        <div className="grid gap-6 md:grid-cols-3">
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">Memory Sync</h3>
            <p className="text-sm text-muted-foreground">
              Share Claude Code conversations and insights across your team
            </p>
          </div>
          
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">Code Graphs</h3>
            <p className="text-sm text-muted-foreground">
              Explore and query your codebase structure in the cloud
            </p>
          </div>
          
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">Multi-Agent Reviews</h3>
            <p className="text-sm text-muted-foreground">
              Automated PR reviews with specialized AI agents
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Ready to supercharge your team's code intelligence?
          </p>
          <Link href="/auth/login">
            <Button size="lg" variant="default">
              Get Started with GitHub
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}