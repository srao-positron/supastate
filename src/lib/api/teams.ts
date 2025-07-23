import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"

export interface Team {
  id: string
  name: string
  slug: string
  created_at: string
  settings: Record<string, any>
  subscription_tier: "free" | "pro" | "enterprise"
}

export interface TeamMember {
  team_id: string
  user_id: string
  role: "owner" | "admin" | "member" | "viewer"
  joined_at: string
  user?: {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
  }
}

export interface TeamStats {
  memberCount: number
  memoriesSynced: number
  graphsStored: number
  reviewsConducted: number
  activeProjects: number
}

/**
 * Get the current user's team
 */
export async function getCurrentTeam(): Promise<Team | null> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: teamMember } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .single()

  if (!teamMember) return null

  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamMember.team_id)
    .single()

  return team
}

/**
 * Get team members for a given team
 */
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const supabase = await createClient()
  
  const { data: members, error } = await supabase
    .from("team_members")
    .select(`
      *,
      user:users(*)
    `)
    .eq("team_id", teamId)
    .order("joined_at", { ascending: true })

  if (error) {
    console.error("Error fetching team members:", error)
    return []
  }

  return members || []
}

/**
 * Get team statistics
 */
export async function getTeamStats(teamId: string): Promise<TeamStats> {
  const supabase = await createClient()
  
  // Fetch all stats in parallel
  const [
    memberCountResult,
    memoriesCountResult,
    graphsCountResult,
    reviewsCountResult,
    projectsCountResult,
  ] = await Promise.all([
    // Member count
    supabase
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId),

    // Memories count
    supabase
      .from("memories")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId),

    // Code entities count (representing graphs)
    supabase
      .from("code_entities")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId),

    // Reviews count
    supabase
      .from("review_sessions")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId),

    // Active projects count
    supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId),
  ])

  return {
    memberCount: memberCountResult.count || 0,
    memoriesSynced: memoriesCountResult.count || 0,
    graphsStored: graphsCountResult.count || 0,
    reviewsConducted: reviewsCountResult.count || 0,
    activeProjects: projectsCountResult.count || 0,
  }
}

/**
 * Check if user has permission for a specific action in the team
 */
export async function checkTeamPermission(
  teamId: string,
  userId: string,
  requiredRole: "owner" | "admin" | "member" | "viewer"
): Promise<boolean> {
  const supabase = await createClient()
  
  const { data: member } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .single()

  if (!member) return false

  const roleHierarchy = {
    owner: 4,
    admin: 3,
    member: 2,
    viewer: 1,
  }

  return roleHierarchy[member.role as keyof typeof roleHierarchy] >= roleHierarchy[requiredRole]
}

/**
 * Create a new team
 */
export async function createTeam(
  name: string,
  slug: string,
  ownerId: string
): Promise<Team | null> {
  const supabase = await createClient()
  
  // Start a transaction
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .insert({ name, slug })
    .select()
    .single()

  if (teamError) {
    console.error("Error creating team:", teamError)
    return null
  }

  // Add the creator as the owner
  const { error: memberError } = await supabase
    .from("team_members")
    .insert({
      team_id: team.id,
      user_id: ownerId,
      role: "owner",
    })

  if (memberError) {
    console.error("Error adding team owner:", memberError)
    // In production, this should be in a transaction that rolls back
    return null
  }

  return team
}

/**
 * Update team settings
 */
export async function updateTeamSettings(
  teamId: string,
  settings: Record<string, any>
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("teams")
    .update({ settings })
    .eq("id", teamId)

  if (error) {
    console.error("Error updating team settings:", error)
    return false
  }

  return true
}

/**
 * Invite a user to the team
 */
export async function inviteTeamMember(
  teamId: string,
  email: string,
  role: "admin" | "member" | "viewer"
): Promise<boolean> {
  // In a real implementation, this would:
  // 1. Check if the user exists
  // 2. Send an invitation email
  // 3. Create a pending invitation record
  // 4. Handle acceptance flow
  
  // For now, we'll just return true as a placeholder
  console.log(`Inviting ${email} to team ${teamId} as ${role}`)
  return true
}

/**
 * Remove a team member
 */
export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId)

  if (error) {
    console.error("Error removing team member:", error)
    return false
  }

  return true
}

/**
 * Update a team member's role
 */
export async function updateTeamMemberRole(
  teamId: string,
  userId: string,
  newRole: "admin" | "member" | "viewer"
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("team_members")
    .update({ role: newRole })
    .eq("team_id", teamId)
    .eq("user_id", userId)

  if (error) {
    console.error("Error updating team member role:", error)
    return false
  }

  return true
}