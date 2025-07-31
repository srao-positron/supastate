"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Key,
  Users,
  Activity,
  Settings,
  LogOut,
  Database,
  GitBranch,
  MessageSquare,
  Brain,
  Search,
  Code2,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  {
    href: "/memories",
    label: "Dashboard",
    icon: Brain,
  },
  {
    href: "/search",
    label: "Unified Search",
    icon: Sparkles,
  },
  {
    href: "/memory-search",
    label: "Memory Search",
    icon: Search,
  },
  {
    href: "/code-search",
    label: "Code Search",
    icon: Code2,
  },
  {
    href: "/reviews",
    label: "PR Reviews",
    icon: MessageSquare,
  },
  {
    href: "/dashboard/team",
    label: "Team Members",
    icon: Users,
  },
  {
    href: "/dashboard/api-keys",
    label: "API Keys",
    icon: Key,
  },
  {
    href: "/dashboard/activity",
    label: "Activity",
    icon: Activity,
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
  },
]

export function NavSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userInfo, setUserInfo] = useState<{
    name: string | null
    avatar: string | null
    username: string | null
  }>({ name: null, avatar: null, username: null })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchUserInfo() {
      const supabase = createClient()
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Extract GitHub info from user metadata
      const metadata = user.user_metadata || {}
      setUserInfo({
        name: metadata.full_name || metadata.name || null,
        avatar: metadata.avatar_url || null,
        username: metadata.user_name || metadata.username || null
      })

      setIsLoading(false)
    }

    fetchUserInfo()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/10">
      {/* User header */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          {userInfo.avatar ? (
            <img
              src={userInfo.avatar}
              alt={userInfo.name || userInfo.username || "User"}
              className="h-10 w-10 rounded-full"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">
                {isLoading ? "..." : (userInfo.name || userInfo.username || "U").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex-1 truncate">
            <h2 className="text-sm font-semibold truncate">
              {isLoading ? "Loading..." : userInfo.name || userInfo.username || "User"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {userInfo.username ? `@${userInfo.username}` : "GitHub User"}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  isActive && "bg-secondary"
                )}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          )
        })}
      </nav>

      <Separator />

      {/* Footer */}
      <div className="p-4">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  )
}