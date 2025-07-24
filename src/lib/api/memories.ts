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
  useSemanticSearch?: boolean
}

export interface MemorySearchResponse {
  results: Memory[]
  total: number
  hasMore: boolean
}

export class MemoriesAPI {
  private supabase = createClient()

  private async getWorkspaceInfo(): Promise<{ teamId: string | null; userId: string | null }> {
    const { data: { user }, error: userError } = await this.supabase.auth.getUser()
    
    // Debug logging
    console.log('[MemoriesAPI] getWorkspaceInfo - auth check:', {
      hasUser: !!user,
      userId: user?.id,
      userError: userError?.message
    })
    
    if (!user) return { teamId: null, userId: null }

    // Check if user is part of a team
    const { data: teamMembers, error } = await this.supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    // Debug logging
    console.log('[MemoriesAPI] getWorkspaceInfo - team check:', {
      userId: user.id,
      teamMembers,
      error: error?.message,
      hasTeam: teamMembers && teamMembers.length > 0
    })

    // If there's an error or no team membership, just use personal workspace
    if (error || !teamMembers || teamMembers.length === 0) {
      console.log('[MemoriesAPI] Using personal workspace')
      return {
        teamId: null,
        userId: user.id
      }
    }

    console.log('[MemoriesAPI] Using team workspace:', teamMembers[0]?.team_id)
    return {
      teamId: teamMembers[0]?.team_id || null,
      userId: user.id
    }
  }

  async searchMemories(params: MemorySearchParams): Promise<MemorySearchResponse> {
    const { query, projectFilter, limit = 20, offset = 0, useSemanticSearch = false } = params

    // If semantic search is enabled and we have a query, use the semantic search endpoint
    if (useSemanticSearch && query && query.trim()) {
      return this.semanticSearch(params)
    }

    try {
      const { teamId, userId } = await this.getWorkspaceInfo()
      if (!teamId && !userId) throw new Error('Not authenticated')

      let queryBuilder = this.supabase
        .from('memories')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      
      // Filter by workspace (team or personal)
      // If user is part of a team, show both team memories AND their personal memories
      if (teamId) {
        // Show memories where:
        // 1. team_id matches the user's team OR
        // 2. user_id matches and team_id is null (personal memories)
        queryBuilder = queryBuilder.or(`team_id.eq.${teamId},user_id.eq.${userId}`)
      } else {
        // User not in a team - only show their personal memories
        queryBuilder = queryBuilder.eq('user_id', userId)
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

      // Debug logging
      console.log('[MemoriesAPI] searchMemories result:', {
        teamId,
        userId,
        count,
        error: error?.message,
        errorDetails: error,
        dataLength: data?.length,
        query,
        projectFilter
      })

      if (error) {
        console.error('[MemoriesAPI] Search error details:', error)
        throw error
      }

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
      // If user is part of a team, show both team memories AND their personal memories
      if (teamId) {
        query = query.or(`team_id.eq.${teamId},user_id.eq.${userId}`)
      } else {
        query = query.eq('user_id', userId)
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
      // If user is part of a team, show both team memories AND their personal memories
      if (teamId) {
        query = query.or(`team_id.eq.${teamId},user_id.eq.${userId}`)
      } else {
        query = query.eq('user_id', userId)
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
      // If user is part of a team, show both team memories AND their personal memories
      if (teamId) {
        query = query.or(`team_id.eq.${teamId},user_id.eq.${userId}`)
      } else {
        query = query.eq('user_id', userId)
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
      
      // Filter by workspace - show both team memories AND personal memories
      if (teamId) {
        countQuery = countQuery.or(`team_id.eq.${teamId},user_id.eq.${userId}`)
      } else {
        countQuery = countQuery.eq('user_id', userId)
      }
      
      const { count: totalCount } = await countQuery

      // Get counts by project
      let projectQuery = this.supabase
        .from('memories')
        .select('project_name')
      
      // Filter by workspace - show both team memories AND personal memories
      if (teamId) {
        projectQuery = projectQuery.or(`team_id.eq.${teamId},user_id.eq.${userId}`)
      } else {
        projectQuery = projectQuery.eq('user_id', userId)
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

  private async semanticSearch(params: MemorySearchParams): Promise<MemorySearchResponse> {
    const { query, projectFilter, limit = 20 } = params

    console.log('[MemoriesAPI] semanticSearch called with:', {
      query,
      projectFilter,
      limit
    })

    try {
      const response = await fetch('/api/memories/semantic-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          projectFilter: projectFilter || null,  // Convert undefined to null
          limit,
          threshold: 0.7,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[MemoriesAPI] Semantic search failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        throw new Error(`Semantic search failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      
      console.log('[MemoriesAPI] semanticSearch response:', {
        resultsCount: data.results?.length || 0,
        total: data.total,
        firstResult: data.results?.[0]
      })
      
      return {
        results: data.results || [],
        total: data.total || 0,
        hasMore: data.hasMore || false,
      }
    } catch (error) {
      console.error('Semantic search error:', error)
      // Fall back to regular search
      return this.searchMemories({ ...params, useSemanticSearch: false })
    }
  }
}

export const memoriesAPI = new MemoriesAPI()
export const searchMemories = (params: MemorySearchParams) => memoriesAPI.searchMemories(params)