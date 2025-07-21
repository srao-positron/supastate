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

  private async getTeamId(): Promise<string | null> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) return null

    const { data: teamMember } = await this.supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .single()

    return teamMember?.team_id || null
  }

  async searchMemories(params: MemorySearchParams): Promise<MemorySearchResponse> {
    const { query, projectFilter, limit = 20, offset = 0 } = params

    try {
      const teamId = await this.getTeamId()
      if (!teamId) throw new Error('No team found')

      let queryBuilder = this.supabase
        .from('memories')
        .select('*', { count: 'exact' })
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

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
      const teamId = await this.getTeamId()
      if (!teamId) return null

      const { data, error } = await this.supabase
        .from('memories')
        .select('*')
        .eq('id', id)
        .eq('team_id', teamId)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Get memory error:', error)
      return null
    }
  }

  async getRelatedMemories(id: string, limit = 5): Promise<Memory[]> {
    try {
      const teamId = await this.getTeamId()
      if (!teamId) return []

      // First get the memory to find its project
      const memory = await this.getMemory(id)
      if (!memory) return []

      // Get other memories from the same project
      const { data, error } = await this.supabase
        .from('memories')
        .select('*')
        .eq('team_id', teamId)
        .eq('project_name', memory.project_name)
        .neq('id', id)
        .limit(limit)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Get related memories error:', error)
      return []
    }
  }

  async getProjects(): Promise<string[]> {
    try {
      const teamId = await this.getTeamId()
      if (!teamId) return []

      const { data, error } = await this.supabase
        .from('memories')
        .select('project_name')
        .eq('team_id', teamId)
        .order('project_name')

      if (error) throw error

      // Extract unique project names
      const projects = [...new Set(data?.map(item => item.project_name) || [])]
      return projects
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
      const teamId = await this.getTeamId()
      if (!teamId) return { totalMemories: 0, projectCounts: {} }

      // Get total count
      const { count: totalCount } = await this.supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)

      // Get counts by project
      const { data: projectData, error } = await this.supabase
        .from('memories')
        .select('project_name')
        .eq('team_id', teamId)

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