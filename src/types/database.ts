export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      api_keys: {
        Row: {
          id: string
          team_id: string
          name: string
          key_hash: string
          last_used_at: string | null
          created_at: string
          expires_at: string | null
          is_active: boolean
        }
        Insert: {
          id?: string
          team_id: string
          name: string
          key_hash: string
          last_used_at?: string | null
          created_at?: string
          expires_at?: string | null
          is_active?: boolean
        }
        Update: {
          id?: string
          team_id?: string
          name?: string
          key_hash?: string
          last_used_at?: string | null
          created_at?: string
          expires_at?: string | null
          is_active?: boolean
        }
      }
      code_entities: {
        Row: {
          id: string
          team_id: string
          project_name: string
          entity_type: 'function' | 'class' | 'module' | 'interface' | 'type' | 'constant'
          name: string
          file_path: string
          language: string
          signature: string | null
          docstring: string | null
          source_code: string | null
          embedding: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id: string
          project_name: string
          entity_type: 'function' | 'class' | 'module' | 'interface' | 'type' | 'constant'
          name: string
          file_path: string
          language: string
          signature?: string | null
          docstring?: string | null
          source_code?: string | null
          embedding?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          project_name?: string
          entity_type?: 'function' | 'class' | 'module' | 'interface' | 'type' | 'constant'
          name?: string
          file_path?: string
          language?: string
          signature?: string | null
          docstring?: string | null
          source_code?: string | null
          embedding?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      memories: {
        Row: {
          id: string
          team_id: string
          user_id: string | null
          project_name: string
          chunk_id: string
          content: string
          embedding: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id: string
          user_id?: string | null
          project_name: string
          chunk_id: string
          content: string
          embedding?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          user_id?: string | null
          project_name?: string
          chunk_id?: string
          content?: string
          embedding?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      review_agents: {
        Row: {
          id: string
          session_id: string
          agent_name: string
          agent_role: string
          agent_prompt: string
          model: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          agent_name: string
          agent_role: string
          agent_prompt: string
          model?: string
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          agent_name?: string
          agent_role?: string
          agent_prompt?: string
          model?: string
          created_at?: string
        }
      }
      review_events: {
        Row: {
          id: string
          session_id: string
          agent_id: string | null
          event_type: 'status_update' | 'tool_call' | 'tool_result' | 'thinking' | 
                      'agent_thought' | 'discussion_turn' | 'review_comment' |
                      'final_verdict' | 'error'
          content: Json
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          agent_id?: string | null
          event_type: 'status_update' | 'tool_call' | 'tool_result' | 'thinking' | 
                      'agent_thought' | 'discussion_turn' | 'review_comment' |
                      'final_verdict' | 'error'
          content: Json
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          agent_id?: string | null
          event_type?: 'status_update' | 'tool_call' | 'tool_result' | 'thinking' | 
                       'agent_thought' | 'discussion_turn' | 'review_comment' |
                       'final_verdict' | 'error'
          content?: Json
          created_at?: string
        }
      }
      review_sessions: {
        Row: {
          id: string
          team_id: string
          pr_url: string
          pr_number: number
          repository: string
          pr_metadata: Json
          status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
          orchestration_id: string | null
          result: Json | null
          created_by: string | null
          created_at: string
          started_at: string | null
          completed_at: string | null
          github_check_run_id: number | null
          github_installation_id: number | null
        }
        Insert: {
          id?: string
          team_id: string
          pr_url: string
          pr_number: number
          repository: string
          pr_metadata: Json
          status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
          orchestration_id?: string | null
          result?: Json | null
          created_by?: string | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          github_check_run_id?: number | null
          github_installation_id?: number | null
        }
        Update: {
          id?: string
          team_id?: string
          pr_url?: string
          pr_number?: number
          repository?: string
          pr_metadata?: Json
          status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
          orchestration_id?: string | null
          result?: Json | null
          created_by?: string | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          github_check_run_id?: number | null
          github_installation_id?: number | null
        }
      }
      teams: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
          settings: Json
          subscription_tier: 'free' | 'pro' | 'enterprise'
          github_installation_id: number | null
          github_installation_data: Json | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
          settings?: Json
          subscription_tier?: 'free' | 'pro' | 'enterprise'
          github_installation_id?: number | null
          github_installation_data?: Json | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
          settings?: Json
          subscription_tier?: 'free' | 'pro' | 'enterprise'
          github_installation_id?: number | null
          github_installation_data?: Json | null
        }
      }
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_memories: {
        Args: {
          p_team_id: string
          p_query_embedding: string
          p_limit?: number
          p_project_filter?: string[]
        }
        Returns: {
          id: string
          chunk_id: string
          content: string
          project_name: string
          similarity: number
          metadata: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}