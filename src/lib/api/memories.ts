import { createClient } from '@/lib/supabase/client'
import { PostgrestError } from '@supabase/supabase-js'

export interface Memory {
  id: string
  team_id: string
  user_id: string | null
  project_name: string
  chunk_id: string
  content: string
  metadata: Record<string, any>
  created_at: string
  updated_at: string
  similarity?: number
}

export interface MemorySearchParams {
  query: string
  projectFilter?: string[]
  limit?: number
  offset?: number
}

export interface MemorySearchResponse {
  results: Memory[]
  total: number
  hasMore: boolean
}

export class MemoriesAPI {
  private supabase = createClient()

  private async getWorkspaceInfo(): Promise<{ teamId: string | null; userId: string | null }> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) return { teamId: null, userId: null }

    // Check if user is part of a team
    const { data: teamMember } = await this.supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .single()

    return {
      teamId: teamMember?.team_id || null,
      userId: user.id
    }
  }

  async searchMemories(params: MemorySearchParams): Promise<MemorySearchResponse> {
    const { query, projectFilter, limit = 20, offset = 0 } = params

    try {
      const { teamId, userId } = await this.getWorkspaceInfo()
      if (!teamId && !userId) throw new Error('Not authenticated')

      let queryBuilder = this.supabase
        .from('memories')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      
      // Filter by workspace (team or personal)
      if (teamId) {
        queryBuilder = queryBuilder.eq('team_id', teamId)
      } else {
        queryBuilder = queryBuilder.eq('user_id', userId).is('team_id', null)
      }

      // Only apply text search if query is not empty
      if (query && query.trim()) {
        // Use ilike for pattern matching instead of textSearch
        queryBuilder = queryBuilder.ilike('content', `%${query}%`)
      }

      if (projectFilter && projectFilter.length > 0) {
        queryBuilder = queryBuilder.in('project_name', projectFilter)
      }

      const { data, error, count } = await queryBuilder

      if (error) throw error

      return {
        results: data || [],
        total: count || 0,
        hasMore: (count || 0) > offset + limit,
      }
    } catch (error) {
      console.error('Memory search error:', error)
      throw error
    }
  }

  async getMemory(id: string): Promise<Memory | null> {
    try {
      const { teamId, userId } = await this.getWorkspaceInfo()
      if (!teamId && !userId) return null

      let query = this.supabase
        .from('memories')
        .select('*')
        .eq('id', id)
      
      // Filter by workspace
      if (teamId) {
        query = query.eq('team_id', teamId)
      } else {
        query = query.eq('user_id', userId).is('team_id', null)
      }
      
      const { data, error } = await query.single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Get memory error:', error)
      return null
    }
  }

  async getRelatedMemories(id: string, limit = 5): Promise<Memory[]> {
    try {
      const { teamId, userId } = await this.getWorkspaceInfo()
      if (!teamId && !userId) return []

      // First get the memory to find its project
      const memory = await this.getMemory(id)
      if (!memory) return []

      // Get other memories from the same project
      let query = this.supabase
        .from('memories')
        .select('*')
        .eq('project_name', memory.project_name)
        .neq('id', id)
        .limit(limit)
        .order('created_at', { ascending: false })
      
      // Filter by workspace
      if (teamId) {
        query = query.eq('team_id', teamId)
      } else {
        query = query.eq('user_id', userId).is('team_id', null)
      }
      
      const { data, error } = await query

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Get related memories error:', error)
      return []
    }
  }

  async getProjects(): Promise<string[]> {
    try {
      const { teamId, userId } = await this.getWorkspaceInfo()
      if (!teamId && !userId) return []

      // Use RPC to get distinct project names more efficiently
      let query = this.supabase
        .from('memories')
        .select('project_name')
      
      // Filter by workspace
      if (teamId) {
        query = query.eq('team_id', teamId)
      } else {
        query = query.eq('user_id', userId).is('team_id', null)
      }
      
      // Get all results to ensure we capture all unique projects
      const { data, error } = await query

      if (error) throw error

      // Extract unique project names and filter out nulls/empty strings
      const uniqueProjects = [...new Set(
        data?.map(item => item.project_name)
          .filter(name => name && name.trim() !== '') || []
      )]
      
      // Sort alphabetically
      return uniqueProjects.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    } catch (error) {
      console.error('Get projects error:', error)
      return []
    }
  }

  async getMemoryStats(): Promise<{
    totalMemories: number
    projectCounts: Record<string, number>
  }> {
    try {
      const { teamId, userId } = await this.getWorkspaceInfo()
      if (!teamId && !userId) return { totalMemories: 0, projectCounts: {} }

      // Get total count
      let countQuery = this.supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
      
      if (teamId) {
        countQuery = countQuery.eq('team_id', teamId)
      } else {
        countQuery = countQuery.eq('user_id', userId).is('team_id', null)
      }
      
      const { count: totalCount } = await countQuery

      // Get counts by project
      let projectQuery = this.supabase
        .from('memories')
        .select('project_name')
      
      if (teamId) {
        projectQuery = projectQuery.eq('team_id', teamId)
      } else {
        projectQuery = projectQuery.eq('user_id', userId).is('team_id', null)
      }
      
      const { data: projectData, error } = await projectQuery

      if (error) throw error

      const projectCounts: Record<string, number> = {}
      projectData?.forEach(item => {
        projectCounts[item.project_name] = (projectCounts[item.project_name] || 0) + 1
      })

      return {
        totalMemories: totalCount || 0,
        projectCounts,
      }
    } catch (error) {
      console.error('Get memory stats error:', error)
      return {
        totalMemories: 0,
        projectCounts: {},
      }
    }
  }
}

export const memoriesAPI = new MemoriesAPI()
export const searchMemories = (params: MemorySearchParams) => memoriesAPI.searchMemories(params)