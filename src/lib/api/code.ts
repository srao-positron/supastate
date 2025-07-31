import { createClient } from '../supabase/client'

export interface CodeEntity {
  id: string
  name: string
  type: 'function' | 'class' | 'component' | 'file' | string
  summary?: string
  file?: {
    path: string
    language?: string
  }
  start_line?: number
  end_line?: number
  content?: string
  project_name?: string
  created_at: string
  updated_at: string
}

export interface CodeSearchParams {
  query?: string
  type?: string
  project?: string
  limit?: number
  offset?: number
}

export const codeAPI = {
  async searchEntities(params: CodeSearchParams): Promise<CodeEntity[]> {
    const { query = '', type, project, limit = 50, offset = 0 } = params
    
    try {
      const response = await fetch('/api/code/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type, project, limit, offset })
      })

      if (!response.ok) {
        throw new Error('Failed to search code entities')
      }

      const data = await response.json()
      return data.entities || []
    } catch (error) {
      console.error('Code search error:', error)
      throw error
    }
  },

  async getProjects(): Promise<string[]> {
    try {
      const response = await fetch('/api/code/projects')
      
      if (!response.ok) {
        throw new Error('Failed to get projects')
      }

      const data = await response.json()
      return data.projects || []
    } catch (error) {
      console.error('Failed to get projects:', error)
      return []
    }
  }
}