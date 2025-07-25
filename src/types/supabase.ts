export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      analysis_jobs: {
        Row: {
          branch: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          id: string
          orchestration_job_id: string | null
          repository: string
          status: string
          team_id: string | null
        }
        Insert: {
          branch?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          orchestration_job_id?: string | null
          repository: string
          status?: string
          team_id?: string | null
        }
        Update: {
          branch?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          orchestration_job_id?: string | null
          repository?: string
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_orchestration_job_id_fkey"
            columns: ["orchestration_job_id"]
            isOneToOne: false
            referencedRelation: "orchestration_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          last_used_at: string | null
          name: string
          team_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          last_used_at?: string | null
          name: string
          team_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          last_used_at?: string | null
          name?: string
          team_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_states: {
        Row: {
          base_commit_sha: string
          branch_name: string
          created_at: string | null
          entities_added: Json | null
          entities_deleted: string[] | null
          entities_modified: Json | null
          id: string
          last_sync: string
          local_changes: Json | null
          repository_state_id: string | null
          team_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          base_commit_sha: string
          branch_name: string
          created_at?: string | null
          entities_added?: Json | null
          entities_deleted?: string[] | null
          entities_modified?: Json | null
          id?: string
          last_sync?: string
          local_changes?: Json | null
          repository_state_id?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          base_commit_sha?: string
          branch_name?: string
          created_at?: string | null
          entities_added?: Json | null
          entities_deleted?: string[] | null
          entities_modified?: Json | null
          id?: string
          last_sync?: string
          local_changes?: Json | null
          repository_state_id?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_states_repository_state_id_fkey"
            columns: ["repository_state_id"]
            isOneToOne: false
            referencedRelation: "repository_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_states_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      code_entities: {
        Row: {
          branch_state_id: string | null
          commit_sha: string | null
          created_at: string | null
          docstring: string | null
          embedding: string | null
          entity_type: string
          file_hash: string | null
          file_path: string
          id: string
          is_source_truth: boolean | null
          language: string
          metadata: Json | null
          name: string
          project_name: string
          repository_state_id: string | null
          signature: string | null
          source_code: string | null
          team_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          branch_state_id?: string | null
          commit_sha?: string | null
          created_at?: string | null
          docstring?: string | null
          embedding?: string | null
          entity_type: string
          file_hash?: string | null
          file_path: string
          id?: string
          is_source_truth?: boolean | null
          language: string
          metadata?: Json | null
          name: string
          project_name: string
          repository_state_id?: string | null
          signature?: string | null
          source_code?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          branch_state_id?: string | null
          commit_sha?: string | null
          created_at?: string | null
          docstring?: string | null
          embedding?: string | null
          entity_type?: string
          file_hash?: string | null
          file_path?: string
          id?: string
          is_source_truth?: boolean | null
          language?: string
          metadata?: Json | null
          name?: string
          project_name?: string
          repository_state_id?: string | null
          signature?: string | null
          source_code?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "code_entities_branch_state_id_fkey"
            columns: ["branch_state_id"]
            isOneToOne: false
            referencedRelation: "branch_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_entities_repository_state_id_fkey"
            columns: ["repository_state_id"]
            isOneToOne: false
            referencedRelation: "repository_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_entities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_entities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      code_graphs: {
        Row: {
          analyzed_at: string | null
          branch: string
          created_at: string | null
          data: Json
          id: string
          repository: string
          updated_at: string | null
        }
        Insert: {
          analyzed_at?: string | null
          branch: string
          created_at?: string | null
          data: Json
          id?: string
          repository: string
          updated_at?: string | null
        }
        Update: {
          analyzed_at?: string | null
          branch?: string
          created_at?: string | null
          data?: Json
          id?: string
          repository?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      code_queue: {
        Row: {
          content: string
          created_at: string | null
          error: string | null
          file_path: string
          id: string
          language: string | null
          metadata: Json | null
          processed_at: string | null
          retry_count: number | null
          status: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          error?: string | null
          file_path: string
          id?: string
          language?: string | null
          metadata?: Json | null
          processed_at?: string | null
          retry_count?: number | null
          status?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          error?: string | null
          file_path?: string
          id?: string
          language?: string | null
          metadata?: Json | null
          processed_at?: string | null
          retry_count?: number | null
          status?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      code_relationships: {
        Row: {
          branch_state_id: string | null
          created_at: string | null
          id: string
          is_source_truth: boolean | null
          metadata: Json | null
          project_name: string
          relationship_type: string
          repository_state_id: string | null
          source_id: string | null
          target_id: string | null
          team_id: string | null
          user_id: string | null
        }
        Insert: {
          branch_state_id?: string | null
          created_at?: string | null
          id?: string
          is_source_truth?: boolean | null
          metadata?: Json | null
          project_name: string
          relationship_type: string
          repository_state_id?: string | null
          source_id?: string | null
          target_id?: string | null
          team_id?: string | null
          user_id?: string | null
        }
        Update: {
          branch_state_id?: string | null
          created_at?: string | null
          id?: string
          is_source_truth?: boolean | null
          metadata?: Json | null
          project_name?: string
          relationship_type?: string
          repository_state_id?: string | null
          source_id?: string | null
          target_id?: string | null
          team_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "code_relationships_branch_state_id_fkey"
            columns: ["branch_state_id"]
            isOneToOne: false
            referencedRelation: "branch_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_relationships_repository_state_id_fkey"
            columns: ["repository_state_id"]
            isOneToOne: false
            referencedRelation: "repository_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_relationships_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "code_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_relationships_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "code_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_relationships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_relationships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          branch_name: string | null
          code_blocks_count: number | null
          commit_sha: string | null
          created_at: string | null
          ended_at: string | null
          files_modified_count: number | null
          files_touched: string[] | null
          id: string
          message_count: number | null
          metadata: Json | null
          project_name: string
          session_id: string
          started_at: string
          summary: string | null
          team_id: string | null
          tools_used: string[] | null
          topics: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          branch_name?: string | null
          code_blocks_count?: number | null
          commit_sha?: string | null
          created_at?: string | null
          ended_at?: string | null
          files_modified_count?: number | null
          files_touched?: string[] | null
          id?: string
          message_count?: number | null
          metadata?: Json | null
          project_name: string
          session_id: string
          started_at?: string
          summary?: string | null
          team_id?: string | null
          tools_used?: string[] | null
          topics?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          branch_name?: string | null
          code_blocks_count?: number | null
          commit_sha?: string | null
          created_at?: string | null
          ended_at?: string | null
          files_modified_count?: number | null
          files_touched?: string[] | null
          id?: string
          message_count?: number | null
          metadata?: Json | null
          project_name?: string
          session_id?: string
          started_at?: string
          summary?: string | null
          team_id?: string | null
          tools_used?: string[] | null
          topics?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      github_installations: {
        Row: {
          account_name: string
          account_type: string
          events: string[] | null
          id: number
          installed_at: string | null
          permissions: Json | null
          repositories: Json | null
          repository_selection: string
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_type: string
          events?: string[] | null
          id: number
          installed_at?: string | null
          permissions?: Json | null
          repositories?: Json | null
          repository_selection: string
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_type?: string
          events?: string[] | null
          id?: number
          installed_at?: string | null
          permissions?: Json | null
          repositories?: Json | null
          repository_selection?: string
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "github_installations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          branch_name: string | null
          chunk_id: string
          commit_sha: string | null
          content: string
          conversation_id: string | null
          created_at: string | null
          embedding: string | null
          entities_mentioned: string[] | null
          file_paths: string[] | null
          has_code: boolean | null
          id: string
          message_type: string | null
          metadata: Json | null
          project_name: string
          search_text: string | null
          session_id: string | null
          team_id: string | null
          tools_used: string[] | null
          topics: string[] | null
          type: string | null
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          branch_name?: string | null
          chunk_id: string
          commit_sha?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string | null
          embedding?: string | null
          entities_mentioned?: string[] | null
          file_paths?: string[] | null
          has_code?: boolean | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          project_name: string
          search_text?: string | null
          session_id?: string | null
          team_id?: string | null
          tools_used?: string[] | null
          topics?: string[] | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          branch_name?: string | null
          chunk_id?: string
          commit_sha?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string | null
          embedding?: string | null
          entities_mentioned?: string[] | null
          file_paths?: string[] | null
          has_code?: boolean | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          project_name?: string
          search_text?: string | null
          session_id?: string | null
          team_id?: string | null
          tools_used?: string[] | null
          topics?: string[] | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memories_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_queue: {
        Row: {
          chunk_id: string
          content: string
          created_at: string | null
          error: string | null
          id: string
          metadata: Json | null
          processed_at: string | null
          retry_count: number | null
          session_id: string
          status: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          chunk_id: string
          content: string
          created_at?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          processed_at?: string | null
          retry_count?: number | null
          session_id: string
          status?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          chunk_id?: string
          content?: string
          created_at?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          processed_at?: string | null
          retry_count?: number | null
          session_id?: string
          status?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      orchestration_events: {
        Row: {
          content: Json
          id: string
          job_id: string | null
          timestamp: string | null
          type: string
        }
        Insert: {
          content: Json
          id?: string
          job_id?: string | null
          timestamp?: string | null
          type: string
        }
        Update: {
          content?: Json
          id?: string
          job_id?: string | null
          timestamp?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "orchestration_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "orchestration_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestration_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error: string | null
          id: string
          metadata: Json
          progress: Json | null
          result: Json | null
          started_at: string | null
          status: string
          team_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error?: string | null
          id?: string
          metadata?: Json
          progress?: Json | null
          result?: Json | null
          started_at?: string | null
          status?: string
          team_id?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error?: string | null
          id?: string
          metadata?: Json
          progress?: Json | null
          result?: Json | null
          started_at?: string | null
          status?: string
          team_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orchestration_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_jobs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_status: {
        Row: {
          completed_at: string | null
          failed_items: number
          id: string
          metadata: Json | null
          processed_items: number
          queue_type: string
          started_at: string | null
          status: string
          total_items: number
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          failed_items?: number
          id?: string
          metadata?: Json | null
          processed_items?: number
          queue_type: string
          started_at?: string | null
          status?: string
          total_items?: number
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          failed_items?: number
          id?: string
          metadata?: Json | null
          processed_items?: number
          queue_type?: string
          started_at?: string | null
          status?: string
          total_items?: number
          workspace_id?: string
        }
        Relationships: []
      }
      project_summaries: {
        Row: {
          generated_at: string | null
          id: string
          last_memory_timestamp: string | null
          memories_included: number | null
          metadata: Json | null
          project_name: string
          summary: string
          summary_markdown: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          generated_at?: string | null
          id?: string
          last_memory_timestamp?: string | null
          memories_included?: number | null
          metadata?: Json | null
          project_name: string
          summary: string
          summary_markdown: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          generated_at?: string | null
          id?: string
          last_memory_timestamp?: string | null
          memories_included?: number | null
          metadata?: Json | null
          project_name?: string
          summary?: string
          summary_markdown?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          last_synced_at: string | null
          name: string
          repository_url: string | null
          settings: Json | null
          team_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          repository_url?: string | null
          settings?: Json | null
          team_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          repository_url?: string | null
          settings?: Json | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      repository_states: {
        Row: {
          analyzed_at: string
          created_at: string | null
          default_branch: string
          entity_count: number | null
          full_name: string
          github_repo_id: number
          id: string
          languages: Json | null
          main_branch_sha: string
          relationship_count: number | null
          stats: Json | null
        }
        Insert: {
          analyzed_at?: string
          created_at?: string | null
          default_branch?: string
          entity_count?: number | null
          full_name: string
          github_repo_id: number
          id?: string
          languages?: Json | null
          main_branch_sha: string
          relationship_count?: number | null
          stats?: Json | null
        }
        Update: {
          analyzed_at?: string
          created_at?: string | null
          default_branch?: string
          entity_count?: number | null
          full_name?: string
          github_repo_id?: number
          id?: string
          languages?: Json | null
          main_branch_sha?: string
          relationship_count?: number | null
          stats?: Json | null
        }
        Relationships: []
      }
      review_agents: {
        Row: {
          agent_name: string
          agent_prompt: string
          agent_role: string
          created_at: string | null
          id: string
          model: string
          session_id: string | null
        }
        Insert: {
          agent_name: string
          agent_prompt: string
          agent_role: string
          created_at?: string | null
          id?: string
          model?: string
          session_id?: string | null
        }
        Update: {
          agent_name?: string
          agent_prompt?: string
          agent_role?: string
          created_at?: string | null
          id?: string
          model?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_agents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "review_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_events: {
        Row: {
          agent_id: string | null
          content: Json
          created_at: string | null
          event_type: string
          id: string
          session_id: string | null
        }
        Insert: {
          agent_id?: string | null
          content: Json
          created_at?: string | null
          event_type: string
          id?: string
          session_id?: string | null
        }
        Update: {
          agent_id?: string | null
          content?: Json
          created_at?: string | null
          event_type?: string
          id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "review_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "review_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_sessions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          github_check_run_id: number | null
          github_installation_id: number | null
          id: string
          orchestration_id: string | null
          pr_metadata: Json
          pr_number: number
          pr_url: string
          repository: string
          result: Json | null
          started_at: string | null
          status: string
          team_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          github_check_run_id?: number | null
          github_installation_id?: number | null
          id?: string
          orchestration_id?: string | null
          pr_metadata: Json
          pr_number: number
          pr_url: string
          repository: string
          result?: Json | null
          started_at?: string | null
          status?: string
          team_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          github_check_run_id?: number | null
          github_installation_id?: number | null
          id?: string
          orchestration_id?: string | null
          pr_metadata?: Json
          pr_number?: number
          pr_url?: string
          repository?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sessions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          chunks_failed: number | null
          chunks_synced: number | null
          completed_at: string
          created_at: string | null
          duration_ms: number | null
          id: string
          metadata: Json | null
          project_name: string
          status: string
          sync_type: string
          workspace: string
        }
        Insert: {
          chunks_failed?: number | null
          chunks_synced?: number | null
          completed_at: string
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          metadata?: Json | null
          project_name: string
          status: string
          sync_type: string
          workspace: string
        }
        Update: {
          chunks_failed?: number | null
          chunks_synced?: number | null
          completed_at?: string
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          metadata?: Json | null
          project_name?: string
          status?: string
          sync_type?: string
          workspace?: string
        }
        Relationships: []
      }
      sync_status: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          project_name: string
          started_at: string | null
          stats: Json | null
          status: string
          sync_type: string
          team_id: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          project_name: string
          started_at?: string | null
          stats?: Json | null
          status: string
          sync_type: string
          team_id?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          project_name?: string
          started_at?: string | null
          stats?: Json | null
          status?: string
          sync_type?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_status_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          joined_at: string | null
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string | null
          role: string
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string | null
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          github_handles: string[] | null
          github_installation_data: Json | null
          github_installation_id: number | null
          id: string
          name: string
          settings: Json | null
          slug: string
          subscription_tier: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          github_handles?: string[] | null
          github_installation_data?: Json | null
          github_installation_id?: number | null
          id?: string
          name: string
          settings?: Json | null
          slug: string
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          github_handles?: string[] | null
          github_installation_data?: Json | null
          github_installation_id?: number | null
          id?: string
          name?: string
          settings?: Json | null
          slug?: string
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_repositories: {
        Row: {
          created_at: string | null
          full_name: string
          github_repo_id: number
          last_accessed: string | null
          permissions: string[] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          full_name: string
          github_repo_id: number
          last_accessed?: string | null
          permissions?: string[] | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          full_name?: string
          github_repo_id?: number
          last_accessed?: string | null
          permissions?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_repositories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      api_user_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      cleanup_old_orchestration_events: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_old_sync_logs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_repository_diff: {
        Args: { p_repo_id: number; p_branch_name: string; p_team_id: string }
        Returns: {
          entity_type: string
          change_type: string
          entity_name: string
          file_path: string
          details: Json
        }[]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      hybrid_search_memories: {
        Args: {
          query_embedding: string
          query_text?: string
          match_threshold?: number
          match_count?: number
          filter_team_id?: string
          filter_user_id?: string
          filter_projects?: string[]
        }
        Returns: {
          id: string
          team_id: string
          user_id: string
          project_name: string
          chunk_id: string
          content: string
          metadata: Json
          created_at: string
          updated_at: string
          similarity: number
          text_match: boolean
        }[]
      }
      is_team_admin: {
        Args: { check_team_id: string; check_user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { check_team_id: string; check_user_id: string }
        Returns: boolean
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: unknown
      }
      match_memories: {
        Args: {
          query_embedding: string
          match_threshold?: number
          match_count?: number
          filter_team_id?: string
          filter_user_id?: string
          filter_projects?: string[]
        }
        Returns: {
          id: string
          team_id: string
          user_id: string
          project_name: string
          chunk_id: string
          content: string
          metadata: Json
          created_at: string
          updated_at: string
          similarity: number
        }[]
      }
      search_memories: {
        Args:
          | {
              p_team_id: string
              p_query_embedding: string
              p_limit?: number
              p_project_filter?: string[]
            }
          | {
              p_team_id: string
              p_query_embedding: string
              p_user_id?: string
              p_limit?: number
              p_project_filter?: string[]
            }
          | {
              query_embedding: string
              workspace_filter: string
              match_threshold?: number
              match_count?: number
              project_filter?: string
            }
        Returns: {
          id: string
          team_id: string
          user_id: string
          project_name: string
          chunk_id: string
          content: string
          metadata: Json
          created_at: string
          updated_at: string
          similarity: number
        }[]
      }
      search_memories_advanced: {
        Args: {
          p_team_id: string
          p_query?: string
          p_projects?: string[]
          p_users?: string[]
          p_date_from?: string
          p_date_to?: string
          p_branches?: string[]
          p_has_code?: boolean
          p_topics?: string[]
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          id: string
          chunk_id: string
          content: string
          project_name: string
          user_id: string
          conversation_id: string
          created_at: string
          branch_name: string
          commit_sha: string
          topics: string[]
          file_paths: string[]
          relevance: number
        }[]
      }
      set_api_user_context: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      sync_existing_users_to_teams: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
