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
  occurred_at?: string
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
    const { query, projectFilter, limit = 20, offset = 0 } = params

    // Always use Neo4j for search
    try {
      const { data: { session } } = await this.supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/neo4j/hybrid-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          query: query || null,
          searchType: 'hybrid', // Always use hybrid for now
          filters: {
            projectName: projectFilter?.[0],
            onlyMyContent: false
          },
          limit,
          offset
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Search failed')
      }

      const data = await response.json()
      
      // Handle empty results gracefully
      if (!data.results || data.results.length === 0) {
        return {
          results: [],
          total: 0,
          hasMore: false
        }
      }
      
      // Convert Neo4j results to Memory format
      const memories: Memory[] = data.results.map((result: any) => {
        // Handle both direct properties and nested properties structure
        const node = result.node || {}
        const props = node.properties || node
        
        return {
          id: props.id || result.key,
          team_id: props.team_id || 'default-team',
          user_id: props.user_id || null,
          project_name: props.project_name || 'Unknown Project',
          chunk_id: props.chunk_id || result.key || props.id || '',
          content: result.content || props.content || '',
          metadata: (() => {
            // Handle metadata which might be a string or object
            let parsedMetadata = {}
            
            // Parse result.metadata if it's a string
            if (result.metadata) {
              if (typeof result.metadata === 'string') {
                try {
                  parsedMetadata = JSON.parse(result.metadata)
                } catch (e) {
                  console.warn('Failed to parse result.metadata:', e)
                }
              } else {
                parsedMetadata = result.metadata
              }
            }
            
            // Parse props.metadata if it's a string and merge
            if (props.metadata) {
              if (typeof props.metadata === 'string') {
                try {
                  parsedMetadata = { ...parsedMetadata, ...JSON.parse(props.metadata) }
                } catch (e) {
                  console.warn('Failed to parse props.metadata:', e)
                }
              } else {
                parsedMetadata = { ...parsedMetadata, ...props.metadata }
              }
            }
            
            return parsedMetadata
          })(),
          created_at: props.created_at || new Date().toISOString(),
          updated_at: props.updated_at || new Date().toISOString(),
          similarity: result.score
        }
      })

      return {
        results: memories,
        total: data.totalResults || memories.length,
        hasMore: memories.length === limit
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
      const { data: { session } } = await this.supabase.auth.getSession()
      if (!session) return []

      const response = await fetch('/api/memories/projects', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to get projects')
      }

      const projects = await response.json()
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
      const { data: { session } } = await this.supabase.auth.getSession()
      if (!session) return { totalMemories: 0, projectCounts: {} }

      const response = await fetch('/api/memories/stats', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to get memory stats')
      }

      const stats = await response.json()
      return stats
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