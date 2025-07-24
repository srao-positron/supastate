'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Users, Plus, X, UserPlus, Shield } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface TeamMember {
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  user: {
    id: string
    email: string
    user_metadata: {
      full_name?: string
      user_name?: string
      avatar_url?: string
    }
  }
}

interface Team {
  id: string
  name: string
  slug: string
  description?: string
  github_handles: string[]
  created_at: string
}

export default function TeamPage() {
  const [team, setTeam] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [newGithubHandle, setNewGithubHandle] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAddingHandle, setIsAddingHandle] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    loadTeamData()
  }, [])

  const loadTeamData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user's team
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (!teamMember) {
        setIsLoading(false)
        return
      }

      // Get team details
      const { data: teamData } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamMember.team_id)
        .single()

      if (teamData) {
        setTeam(teamData)
      }

      // Get team members
      const { data: membersData } = await supabase
        .from('team_members')
        .select(`
          user_id,
          role,
          joined_at,
          user:users!inner(
            id,
            email,
            raw_user_meta_data
          )
        `)
        .eq('team_id', teamMember.team_id)
        .order('joined_at', { ascending: true })

      if (membersData) {
        // Transform the data to match our interface
        const transformedMembers = membersData.map(member => ({
          ...member,
          user: {
            ...member.user,
            user_metadata: member.user.raw_user_meta_data || {}
          }
        }))
        setMembers(transformedMembers as TeamMember[])
      }
    } catch (error) {
      console.error('Error loading team data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load team data',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const addGithubHandle = async () => {
    if (!team || !newGithubHandle.trim()) return

    setIsAddingHandle(true)
    try {
      const updatedHandles = [...team.github_handles, newGithubHandle.trim()]
      
      const { error } = await supabase
        .from('teams')
        .update({ github_handles: updatedHandles })
        .eq('id', team.id)

      if (error) throw error

      // Update local state
      setTeam({ ...team, github_handles: updatedHandles })
      setNewGithubHandle('')

      // Run sync function
      await supabase.rpc('sync_existing_users_to_teams')

      toast({
        title: 'Success',
        description: `Added @${newGithubHandle} to team. Users with this handle will be automatically added when they sign in.`
      })

      // Reload members in case someone was just added
      setTimeout(loadTeamData, 1000)
    } catch (error) {
      console.error('Error adding GitHub handle:', error)
      toast({
        title: 'Error',
        description: 'Failed to add GitHub handle',
        variant: 'destructive'
      })
    } finally {
      setIsAddingHandle(false)
    }
  }

  const removeGithubHandle = async (handle: string) => {
    if (!team) return

    try {
      const updatedHandles = team.github_handles.filter(h => h !== handle)
      
      const { error } = await supabase
        .from('teams')
        .update({ github_handles: updatedHandles })
        .eq('id', team.id)

      if (error) throw error

      setTeam({ ...team, github_handles: updatedHandles })

      toast({
        title: 'Success',
        description: `Removed @${handle} from team`
      })
    } catch (error) {
      console.error('Error removing GitHub handle:', error)
      toast({
        title: 'Error',
        description: 'Failed to remove GitHub handle',
        variant: 'destructive'
      })
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-center text-muted-foreground">Loading team data...</p>
      </div>
    )
  }

  if (!team) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">No Team Found</h2>
            <p className="text-muted-foreground">You're not currently part of any team.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Team Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="h-8 w-8" />
          Team Management
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage your team members and GitHub handle assignments
        </p>
      </div>

      {/* Team Info */}
      <Card>
        <CardHeader>
          <CardTitle>{team.name}</CardTitle>
          <CardDescription>
            {team.description || 'No description provided'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Slug:</span> {team.slug}</p>
            <p><span className="font-medium">Created:</span> {new Date(team.created_at).toLocaleDateString()}</p>
            <p><span className="font-medium">Members:</span> {members.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* GitHub Handles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>GitHub Handle Auto-Assignment</span>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Handle
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add GitHub Handle</DialogTitle>
                  <DialogDescription>
                    Users who sign in with this GitHub handle will be automatically added to your team.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="github-handle">GitHub Handle</Label>
                    <Input
                      id="github-handle"
                      placeholder="username (without @)"
                      value={newGithubHandle}
                      onChange={(e) => setNewGithubHandle(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={addGithubHandle}
                    disabled={!newGithubHandle.trim() || isAddingHandle}
                  >
                    {isAddingHandle ? 'Adding...' : 'Add Handle'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            These GitHub handles will be automatically added to the team when they sign in
          </CardDescription>
        </CardHeader>
        <CardContent>
          {team.github_handles.length === 0 ? (
            <p className="text-muted-foreground text-sm">No GitHub handles configured</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {team.github_handles.map((handle) => (
                <Badge key={handle} variant="secondary" className="gap-1">
                  @{handle}
                  <button
                    onClick={() => removeGithubHandle(handle)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            Current members of your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center gap-4">
                {member.user.user_metadata.avatar_url ? (
                  <img
                    src={member.user.user_metadata.avatar_url}
                    alt={member.user.user_metadata.full_name || member.user.email}
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium">
                    {member.user.user_metadata.full_name || member.user.email}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {member.user.user_metadata.user_name && `@${member.user.user_metadata.user_name} • `}
                    {member.user.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {member.role === 'owner' && (
                    <Badge variant="default">
                      <Shield className="h-3 w-3 mr-1" />
                      Owner
                    </Badge>
                  )}
                  {member.role === 'admin' && (
                    <Badge variant="secondary">Admin</Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    Joined {new Date(member.joined_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}