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
    href: "/dashboard",
    label: "Overview",
    icon: Home,
  },
  {
    href: "/memories",
    label: "Memory Explorer",
    icon: Brain,
  },
  {
    href: "/graph",
    label: "Code Graph",
    icon: GitBranch,
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
  const [teamName, setTeamName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchTeam() {
      const supabase = createClient()
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user's team
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .single()

      if (teamMember) {
        const { data: team } = await supabase
          .from("teams")
          .select("name")
          .eq("id", teamMember.team_id)
          .single()

        if (team) {
          setTeamName(team.name)
        }
      }

      setIsLoading(false)
    }

    fetchTeam()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/10">
      {/* Team header */}
      <div className="p-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">
              {isLoading ? "..." : teamName?.charAt(0)?.toUpperCase() || "T"}
            </span>
          </div>
          <div className="flex-1 truncate">
            <h2 className="text-sm font-semibold truncate">
              {isLoading ? "Loading..." : teamName || "Your Team"}
            </h2>
            <p className="text-xs text-muted-foreground">Team workspace</p>
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