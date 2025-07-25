create extension if not exists "pg_trgm" with schema "public" version '1.6';

create extension if not exists "vector" with schema "public" version '0.8.0';

create table "public"."analysis_jobs" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid,
    "repository" text not null,
    "branch" text not null default 'main'::text,
    "status" text not null default 'pending'::text,
    "created_by" uuid,
    "orchestration_job_id" uuid,
    "created_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone
);


alter table "public"."analysis_jobs" enable row level security;

create table "public"."api_keys" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid,
    "name" text not null,
    "key_hash" text not null,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "expires_at" timestamp with time zone,
    "is_active" boolean default true,
    "user_id" uuid
);


alter table "public"."api_keys" enable row level security;

create table "public"."branch_states" (
    "id" uuid not null default gen_random_uuid(),
    "repository_state_id" uuid,
    "team_id" uuid,
    "user_id" uuid,
    "branch_name" text not null,
    "base_commit_sha" text not null,
    "last_sync" timestamp with time zone not null default now(),
    "entities_added" jsonb default '[]'::jsonb,
    "entities_modified" jsonb default '[]'::jsonb,
    "entities_deleted" text[] default '{}'::text[],
    "local_changes" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."branch_states" enable row level security;

create table "public"."code_entities" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid,
    "project_name" text not null,
    "entity_type" text not null,
    "name" text not null,
    "file_path" text not null,
    "language" text not null,
    "signature" text,
    "docstring" text,
    "source_code" text,
    "embedding" vector(3072),
    "metadata" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "repository_state_id" uuid,
    "branch_state_id" uuid,
    "is_source_truth" boolean default false,
    "commit_sha" text,
    "file_hash" text,
    "user_id" uuid
);


alter table "public"."code_entities" enable row level security;

create table "public"."code_graphs" (
    "id" uuid not null default uuid_generate_v4(),
    "repository" text not null,
    "branch" text not null,
    "data" jsonb not null,
    "analyzed_at" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."code_graphs" enable row level security;

create table "public"."code_queue" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" text not null,
    "file_path" text not null,
    "content" text not null,
    "language" text,
    "metadata" jsonb default '{}'::jsonb,
    "status" text not null default 'pending'::text,
    "error" text,
    "retry_count" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "processed_at" timestamp with time zone
);


alter table "public"."code_queue" enable row level security;

create table "public"."code_relationships" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid,
    "project_name" text not null,
    "source_id" uuid,
    "target_id" uuid,
    "relationship_type" text not null,
    "metadata" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "repository_state_id" uuid,
    "branch_state_id" uuid,
    "is_source_truth" boolean default false,
    "user_id" uuid
);


alter table "public"."code_relationships" enable row level security;

create table "public"."conversations" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid,
    "user_id" uuid,
    "session_id" text not null,
    "project_name" text not null,
    "started_at" timestamp with time zone not null default now(),
    "ended_at" timestamp with time zone,
    "summary" text,
    "topics" text[],
    "tools_used" text[],
    "files_touched" text[],
    "commit_sha" text,
    "branch_name" text,
    "message_count" integer default 0,
    "code_blocks_count" integer default 0,
    "files_modified_count" integer default 0,
    "metadata" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."conversations" enable row level security;

create table "public"."github_installations" (
    "id" integer not null,
    "team_id" uuid,
    "account_name" text not null,
    "account_type" text not null,
    "repository_selection" text not null,
    "repositories" jsonb,
    "permissions" jsonb,
    "events" text[],
    "installed_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."github_installations" enable row level security;

create table "public"."memories" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid,
    "user_id" uuid,
    "project_name" text not null,
    "chunk_id" text not null,
    "content" text not null,
    "embedding" vector(3072),
    "metadata" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "type" text default 'general'::text,
    "conversation_id" uuid,
    "session_id" text,
    "file_paths" text[] default '{}'::text[],
    "commit_sha" text,
    "branch_name" text,
    "topics" text[] default '{}'::text[],
    "entities_mentioned" text[] default '{}'::text[],
    "tools_used" text[] default '{}'::text[],
    "message_type" text,
    "has_code" boolean default false,
    "search_text" text,
    "workspace_id" uuid generated always as (COALESCE(team_id, user_id)) stored
);


alter table "public"."memories" enable row level security;

create table "public"."memory_queue" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" text not null,
    "session_id" text not null,
    "chunk_id" text not null,
    "content" text not null,
    "metadata" jsonb default '{}'::jsonb,
    "status" text not null default 'pending'::text,
    "error" text,
    "retry_count" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "processed_at" timestamp with time zone
);


alter table "public"."memory_queue" enable row level security;

create table "public"."orchestration_events" (
    "id" uuid not null default gen_random_uuid(),
    "job_id" uuid,
    "type" text not null,
    "content" jsonb not null,
    "timestamp" timestamp with time zone default now()
);


alter table "public"."orchestration_events" enable row level security;

create table "public"."orchestration_jobs" (
    "id" uuid not null default gen_random_uuid(),
    "type" text not null,
    "status" text not null default 'pending'::text,
    "team_id" uuid,
    "created_by" uuid,
    "metadata" jsonb not null default '{}'::jsonb,
    "progress" jsonb default '{"total": 100, "current": 0, "message": "Initializing..."}'::jsonb,
    "result" jsonb,
    "error" text,
    "created_at" timestamp with time zone default now(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone default now()
);


alter table "public"."orchestration_jobs" enable row level security;

create table "public"."processing_status" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" text not null,
    "queue_type" text not null,
    "total_items" integer not null default 0,
    "processed_items" integer not null default 0,
    "failed_items" integer not null default 0,
    "status" text not null default 'active'::text,
    "started_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone,
    "metadata" jsonb default '{}'::jsonb
);


alter table "public"."processing_status" enable row level security;

create table "public"."project_summaries" (
    "id" uuid not null default gen_random_uuid(),
    "project_name" text not null,
    "workspace_id" uuid not null,
    "summary" text not null,
    "summary_markdown" text not null,
    "last_memory_timestamp" timestamp with time zone,
    "memories_included" integer default 0,
    "generated_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "metadata" jsonb default '{}'::jsonb
);


alter table "public"."project_summaries" enable row level security;

create table "public"."projects" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid,
    "name" text not null,
    "repository_url" text,
    "description" text,
    "settings" jsonb default '{}'::jsonb,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
);


alter table "public"."projects" enable row level security;

create table "public"."repository_states" (
    "id" uuid not null default gen_random_uuid(),
    "github_repo_id" bigint not null,
    "full_name" text not null,
    "default_branch" text not null default 'main'::text,
    "main_branch_sha" text not null,
    "analyzed_at" timestamp with time zone not null default now(),
    "stats" jsonb default '{}'::jsonb,
    "entity_count" integer default 0,
    "relationship_count" integer default 0,
    "languages" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now()
);


alter table "public"."repository_states" enable row level security;

create table "public"."review_agents" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid,
    "agent_name" text not null,
    "agent_role" text not null,
    "agent_prompt" text not null,
    "model" text not null default 'gpt-4-turbo-preview'::text,
    "created_at" timestamp with time zone default now()
);


alter table "public"."review_agents" enable row level security;

create table "public"."review_events" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid,
    "agent_id" uuid,
    "event_type" text not null,
    "content" jsonb not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."review_events" enable row level security;

create table "public"."review_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid,
    "pr_url" text not null,
    "pr_number" integer not null,
    "repository" text not null,
    "pr_metadata" jsonb not null,
    "status" text not null default 'pending'::text,
    "orchestration_id" text,
    "result" jsonb,
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "github_check_run_id" bigint,
    "github_installation_id" integer
);


alter table "public"."review_sessions" enable row level security;

create table "public"."sync_logs" (
    "id" uuid not null default gen_random_uuid(),
    "workspace" text not null,
    "project_name" text not null,
    "sync_type" text not null,
    "status" text not null,
    "chunks_synced" integer default 0,
    "chunks_failed" integer default 0,
    "duration_ms" integer,
    "metadata" jsonb default '{}'::jsonb,
    "completed_at" timestamp with time zone not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."sync_logs" enable row level security;

create table "public"."sync_status" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid,
    "project_name" text not null,
    "sync_type" text not null,
    "status" text not null,
    "started_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone,
    "error_message" text,
    "stats" jsonb default '{}'::jsonb
);


alter table "public"."sync_status" enable row level security;

create table "public"."team_members" (
    "team_id" uuid not null,
    "user_id" uuid not null,
    "role" text not null,
    "joined_at" timestamp with time zone default now()
);


alter table "public"."team_members" enable row level security;

create table "public"."teams" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "slug" text not null,
    "created_at" timestamp with time zone default now(),
    "settings" jsonb default '{}'::jsonb,
    "subscription_tier" text default 'free'::text,
    "github_installation_id" integer,
    "github_installation_data" jsonb,
    "github_handles" text[] default '{}'::text[],
    "description" text,
    "created_by" uuid,
    "updated_at" timestamp with time zone default now()
);


alter table "public"."teams" enable row level security;

create table "public"."user_repositories" (
    "user_id" uuid not null,
    "github_repo_id" bigint not null,
    "full_name" text not null,
    "permissions" text[] default '{}'::text[],
    "last_accessed" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now()
);


alter table "public"."user_repositories" enable row level security;

create table "public"."users" (
    "id" uuid not null,
    "email" text not null,
    "full_name" text,
    "avatar_url" text,
    "created_at" timestamp with time zone default now()
);


alter table "public"."users" enable row level security;

CREATE UNIQUE INDEX analysis_jobs_pkey ON public.analysis_jobs USING btree (id);

CREATE INDEX analysis_jobs_repo_idx ON public.analysis_jobs USING btree (repository);

CREATE INDEX analysis_jobs_team_idx ON public.analysis_jobs USING btree (team_id);

CREATE UNIQUE INDEX api_keys_pkey ON public.api_keys USING btree (id);

CREATE INDEX api_keys_user_id_idx ON public.api_keys USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE UNIQUE INDEX branch_states_pkey ON public.branch_states USING btree (id);

CREATE INDEX branch_states_repo_idx ON public.branch_states USING btree (repository_state_id);

CREATE INDEX code_entities_branch_state_idx ON public.code_entities USING btree (branch_state_id) WHERE (is_source_truth = false);

CREATE INDEX code_entities_name_idx ON public.code_entities USING btree (name);

CREATE INDEX code_entities_name_trgm_idx ON public.code_entities USING gin (name gin_trgm_ops);

CREATE UNIQUE INDEX code_entities_pkey ON public.code_entities USING btree (id);

CREATE INDEX code_entities_repo_state_idx ON public.code_entities USING btree (repository_state_id) WHERE (is_source_truth = true);

CREATE UNIQUE INDEX code_entities_team_id_project_name_file_path_name_entity_ty_key ON public.code_entities USING btree (team_id, project_name, file_path, name, entity_type);

CREATE INDEX code_entities_team_project_idx ON public.code_entities USING btree (team_id, project_name);

CREATE INDEX code_entities_type_idx ON public.code_entities USING btree (entity_type);

CREATE INDEX code_entities_user_project_idx ON public.code_entities USING btree (user_id, project_name) WHERE (team_id IS NULL);

CREATE UNIQUE INDEX code_entities_workspace_unique ON public.code_entities USING btree (team_id, user_id, project_name, file_path, name, entity_type) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX code_graphs_pkey ON public.code_graphs USING btree (id);

CREATE UNIQUE INDEX code_queue_pkey ON public.code_queue USING btree (id);

CREATE UNIQUE INDEX code_queue_workspace_id_file_path_key ON public.code_queue USING btree (workspace_id, file_path);

CREATE UNIQUE INDEX code_relationships_pkey ON public.code_relationships USING btree (id);

CREATE UNIQUE INDEX code_relationships_source_id_target_id_relationship_type_key ON public.code_relationships USING btree (source_id, target_id, relationship_type);

CREATE INDEX code_relationships_source_idx ON public.code_relationships USING btree (source_id, relationship_type);

CREATE INDEX code_relationships_target_idx ON public.code_relationships USING btree (target_id, relationship_type);

CREATE INDEX code_relationships_team_project_idx ON public.code_relationships USING btree (team_id, project_name);

CREATE INDEX code_relationships_user_project_idx ON public.code_relationships USING btree (user_id, project_name) WHERE (team_id IS NULL);

CREATE UNIQUE INDEX conversations_pkey ON public.conversations USING btree (id);

CREATE INDEX conversations_project_idx ON public.conversations USING btree (project_name);

CREATE INDEX conversations_session_idx ON public.conversations USING btree (session_id);

CREATE INDEX conversations_team_user_idx ON public.conversations USING btree (team_id, user_id);

CREATE INDEX conversations_temporal_idx ON public.conversations USING btree (started_at DESC);

CREATE UNIQUE INDEX github_installations_pkey ON public.github_installations USING btree (id);

CREATE INDEX idx_code_graphs_analyzed_at ON public.code_graphs USING btree (analyzed_at DESC);

CREATE INDEX idx_code_graphs_branch ON public.code_graphs USING btree (branch);

CREATE INDEX idx_code_graphs_repository ON public.code_graphs USING btree (repository);

CREATE INDEX idx_code_queue_created ON public.code_queue USING btree (created_at);

CREATE INDEX idx_code_queue_status ON public.code_queue USING btree (status) WHERE (status = 'pending'::text);

CREATE INDEX idx_code_queue_workspace ON public.code_queue USING btree (workspace_id);

CREATE INDEX idx_memories_type ON public.memories USING btree (type);

CREATE INDEX idx_memory_queue_created ON public.memory_queue USING btree (created_at);

CREATE INDEX idx_memory_queue_session ON public.memory_queue USING btree (session_id);

CREATE INDEX idx_memory_queue_status ON public.memory_queue USING btree (status) WHERE (status = 'pending'::text);

CREATE INDEX idx_memory_queue_workspace ON public.memory_queue USING btree (workspace_id);

CREATE INDEX idx_processing_status_active ON public.processing_status USING btree (status) WHERE (status = 'active'::text);

CREATE INDEX idx_processing_status_workspace ON public.processing_status USING btree (workspace_id);

CREATE INDEX idx_project_summaries_updated ON public.project_summaries USING btree (updated_at DESC);

CREATE INDEX idx_project_summaries_workspace_project ON public.project_summaries USING btree (workspace_id, project_name);

CREATE INDEX idx_sync_logs_created_at ON public.sync_logs USING btree (created_at DESC);

CREATE INDEX idx_sync_logs_metadata_session ON public.sync_logs USING btree (((metadata ->> 'syncSessionId'::text))) WHERE ((metadata ->> 'syncSessionId'::text) IS NOT NULL);

CREATE INDEX idx_sync_logs_project ON public.sync_logs USING btree (project_name);

CREATE INDEX idx_sync_logs_workspace ON public.sync_logs USING btree (workspace);

CREATE INDEX idx_team_members_lookup ON public.team_members USING btree (team_id, user_id);

CREATE INDEX idx_team_members_role_lookup ON public.team_members USING btree (team_id, user_id, role);

CREATE INDEX idx_team_members_team_id ON public.team_members USING btree (team_id);

CREATE INDEX idx_team_members_user_id ON public.team_members USING btree (user_id);

CREATE INDEX idx_teams_github_handles ON public.teams USING gin (github_handles);

CREATE INDEX idx_teams_slug ON public.teams USING btree (slug);

CREATE INDEX memories_branch_idx ON public.memories USING btree (branch_name) WHERE (branch_name IS NOT NULL);

CREATE INDEX memories_chunk_id_idx ON public.memories USING btree (chunk_id);

CREATE INDEX memories_commit_idx ON public.memories USING btree (commit_sha) WHERE (commit_sha IS NOT NULL);

CREATE INDEX memories_conversation_idx ON public.memories USING btree (conversation_id);

CREATE INDEX memories_created_idx ON public.memories USING btree (created_at DESC);

CREATE UNIQUE INDEX memories_pkey ON public.memories USING btree (id);

CREATE INDEX memories_search_idx ON public.memories USING gin (to_tsvector('english'::regconfig, search_text));

CREATE INDEX memories_session_idx ON public.memories USING btree (session_id);

CREATE INDEX memories_team_project_idx ON public.memories USING btree (team_id, project_name);

CREATE INDEX memories_temporal_idx ON public.memories USING btree (created_at DESC);

CREATE INDEX memories_topics_idx ON public.memories USING gin (((metadata -> 'topics'::text)));

CREATE INDEX memories_user_project_idx ON public.memories USING btree (user_id, project_name);

CREATE UNIQUE INDEX memories_workspace_chunk_unique ON public.memories USING btree (workspace_id, chunk_id);

CREATE INDEX memories_workspace_id_idx ON public.memories USING btree (workspace_id);

CREATE UNIQUE INDEX memory_queue_pkey ON public.memory_queue USING btree (id);

CREATE UNIQUE INDEX memory_queue_workspace_id_chunk_id_key ON public.memory_queue USING btree (workspace_id, chunk_id);

CREATE INDEX orchestration_events_job_idx ON public.orchestration_events USING btree (job_id, "timestamp");

CREATE UNIQUE INDEX orchestration_events_pkey ON public.orchestration_events USING btree (id);

CREATE INDEX orchestration_events_type_idx ON public.orchestration_events USING btree (type);

CREATE INDEX orchestration_jobs_created_idx ON public.orchestration_jobs USING btree (created_at DESC);

CREATE UNIQUE INDEX orchestration_jobs_pkey ON public.orchestration_jobs USING btree (id);

CREATE INDEX orchestration_jobs_status_idx ON public.orchestration_jobs USING btree (status);

CREATE INDEX orchestration_jobs_team_idx ON public.orchestration_jobs USING btree (team_id);

CREATE INDEX orchestration_jobs_type_idx ON public.orchestration_jobs USING btree (type);

CREATE UNIQUE INDEX processing_status_pkey ON public.processing_status USING btree (id);

CREATE UNIQUE INDEX project_summaries_pkey ON public.project_summaries USING btree (id);

CREATE UNIQUE INDEX project_summaries_workspace_id_project_name_key ON public.project_summaries USING btree (workspace_id, project_name);

CREATE UNIQUE INDEX projects_pkey ON public.projects USING btree (id);

CREATE UNIQUE INDEX projects_team_id_name_key ON public.projects USING btree (team_id, name);

CREATE INDEX repository_states_github_idx ON public.repository_states USING btree (github_repo_id);

CREATE UNIQUE INDEX repository_states_github_repo_id_main_branch_sha_key ON public.repository_states USING btree (github_repo_id, main_branch_sha);

CREATE INDEX repository_states_name_idx ON public.repository_states USING btree (full_name);

CREATE UNIQUE INDEX repository_states_pkey ON public.repository_states USING btree (id);

CREATE UNIQUE INDEX review_agents_pkey ON public.review_agents USING btree (id);

CREATE UNIQUE INDEX review_events_pkey ON public.review_events USING btree (id);

CREATE INDEX review_events_session_idx ON public.review_events USING btree (session_id, created_at);

CREATE INDEX review_events_type_idx ON public.review_events USING btree (event_type);

CREATE UNIQUE INDEX review_sessions_pkey ON public.review_sessions USING btree (id);

CREATE INDEX review_sessions_pr_idx ON public.review_sessions USING btree (repository, pr_number);

CREATE INDEX review_sessions_status_idx ON public.review_sessions USING btree (status);

CREATE INDEX review_sessions_team_idx ON public.review_sessions USING btree (team_id);

CREATE UNIQUE INDEX sync_logs_pkey ON public.sync_logs USING btree (id);

CREATE UNIQUE INDEX sync_status_pkey ON public.sync_status USING btree (id);

CREATE UNIQUE INDEX team_members_pkey ON public.team_members USING btree (team_id, user_id);

CREATE UNIQUE INDEX teams_github_installation_id_key ON public.teams USING btree (github_installation_id);

CREATE INDEX teams_github_installation_idx ON public.teams USING btree (github_installation_id) WHERE (github_installation_id IS NOT NULL);

CREATE UNIQUE INDEX teams_pkey ON public.teams USING btree (id);

CREATE UNIQUE INDEX teams_slug_key ON public.teams USING btree (slug);

CREATE UNIQUE INDEX user_repositories_pkey ON public.user_repositories USING btree (user_id, github_repo_id);

CREATE INDEX user_repositories_user_idx ON public.user_repositories USING btree (user_id);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

alter table "public"."analysis_jobs" add constraint "analysis_jobs_pkey" PRIMARY KEY using index "analysis_jobs_pkey";

alter table "public"."api_keys" add constraint "api_keys_pkey" PRIMARY KEY using index "api_keys_pkey";

alter table "public"."branch_states" add constraint "branch_states_pkey" PRIMARY KEY using index "branch_states_pkey";

alter table "public"."code_entities" add constraint "code_entities_pkey" PRIMARY KEY using index "code_entities_pkey";

alter table "public"."code_graphs" add constraint "code_graphs_pkey" PRIMARY KEY using index "code_graphs_pkey";

alter table "public"."code_queue" add constraint "code_queue_pkey" PRIMARY KEY using index "code_queue_pkey";

alter table "public"."code_relationships" add constraint "code_relationships_pkey" PRIMARY KEY using index "code_relationships_pkey";

alter table "public"."conversations" add constraint "conversations_pkey" PRIMARY KEY using index "conversations_pkey";

alter table "public"."github_installations" add constraint "github_installations_pkey" PRIMARY KEY using index "github_installations_pkey";

alter table "public"."memories" add constraint "memories_pkey" PRIMARY KEY using index "memories_pkey";

alter table "public"."memory_queue" add constraint "memory_queue_pkey" PRIMARY KEY using index "memory_queue_pkey";

alter table "public"."orchestration_events" add constraint "orchestration_events_pkey" PRIMARY KEY using index "orchestration_events_pkey";

alter table "public"."orchestration_jobs" add constraint "orchestration_jobs_pkey" PRIMARY KEY using index "orchestration_jobs_pkey";

alter table "public"."processing_status" add constraint "processing_status_pkey" PRIMARY KEY using index "processing_status_pkey";

alter table "public"."project_summaries" add constraint "project_summaries_pkey" PRIMARY KEY using index "project_summaries_pkey";

alter table "public"."projects" add constraint "projects_pkey" PRIMARY KEY using index "projects_pkey";

alter table "public"."repository_states" add constraint "repository_states_pkey" PRIMARY KEY using index "repository_states_pkey";

alter table "public"."review_agents" add constraint "review_agents_pkey" PRIMARY KEY using index "review_agents_pkey";

alter table "public"."review_events" add constraint "review_events_pkey" PRIMARY KEY using index "review_events_pkey";

alter table "public"."review_sessions" add constraint "review_sessions_pkey" PRIMARY KEY using index "review_sessions_pkey";

alter table "public"."sync_logs" add constraint "sync_logs_pkey" PRIMARY KEY using index "sync_logs_pkey";

alter table "public"."sync_status" add constraint "sync_status_pkey" PRIMARY KEY using index "sync_status_pkey";

alter table "public"."team_members" add constraint "team_members_pkey" PRIMARY KEY using index "team_members_pkey";

alter table "public"."teams" add constraint "teams_pkey" PRIMARY KEY using index "teams_pkey";

alter table "public"."user_repositories" add constraint "user_repositories_pkey" PRIMARY KEY using index "user_repositories_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."analysis_jobs" add constraint "analysis_jobs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."analysis_jobs" validate constraint "analysis_jobs_created_by_fkey";

alter table "public"."analysis_jobs" add constraint "analysis_jobs_orchestration_job_id_fkey" FOREIGN KEY (orchestration_job_id) REFERENCES orchestration_jobs(id) ON DELETE CASCADE not valid;

alter table "public"."analysis_jobs" validate constraint "analysis_jobs_orchestration_job_id_fkey";

alter table "public"."analysis_jobs" add constraint "analysis_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))) not valid;

alter table "public"."analysis_jobs" validate constraint "analysis_jobs_status_check";

alter table "public"."analysis_jobs" add constraint "analysis_jobs_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."analysis_jobs" validate constraint "analysis_jobs_team_id_fkey";

alter table "public"."api_keys" add constraint "api_keys_owner_check" CHECK (((team_id IS NOT NULL) OR (user_id IS NOT NULL))) not valid;

alter table "public"."api_keys" validate constraint "api_keys_owner_check";

alter table "public"."api_keys" add constraint "api_keys_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."api_keys" validate constraint "api_keys_team_id_fkey";

alter table "public"."api_keys" add constraint "api_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."api_keys" validate constraint "api_keys_user_id_fkey";

alter table "public"."branch_states" add constraint "branch_states_repository_state_id_fkey" FOREIGN KEY (repository_state_id) REFERENCES repository_states(id) ON DELETE CASCADE not valid;

alter table "public"."branch_states" validate constraint "branch_states_repository_state_id_fkey";

alter table "public"."branch_states" add constraint "branch_states_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."branch_states" validate constraint "branch_states_team_id_fkey";

alter table "public"."branch_states" add constraint "branch_states_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."branch_states" validate constraint "branch_states_user_id_fkey";

alter table "public"."code_entities" add constraint "code_entities_branch_state_id_fkey" FOREIGN KEY (branch_state_id) REFERENCES branch_states(id) ON DELETE CASCADE not valid;

alter table "public"."code_entities" validate constraint "code_entities_branch_state_id_fkey";

alter table "public"."code_entities" add constraint "code_entities_entity_type_check" CHECK ((entity_type = ANY (ARRAY['function'::text, 'class'::text, 'module'::text, 'interface'::text, 'type'::text, 'constant'::text]))) not valid;

alter table "public"."code_entities" validate constraint "code_entities_entity_type_check";

alter table "public"."code_entities" add constraint "code_entities_repository_state_id_fkey" FOREIGN KEY (repository_state_id) REFERENCES repository_states(id) ON DELETE CASCADE not valid;

alter table "public"."code_entities" validate constraint "code_entities_repository_state_id_fkey";

alter table "public"."code_entities" add constraint "code_entities_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."code_entities" validate constraint "code_entities_team_id_fkey";

alter table "public"."code_entities" add constraint "code_entities_team_id_project_name_file_path_name_entity_ty_key" UNIQUE using index "code_entities_team_id_project_name_file_path_name_entity_ty_key";

alter table "public"."code_entities" add constraint "code_entities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."code_entities" validate constraint "code_entities_user_id_fkey";

alter table "public"."code_entities" add constraint "code_entities_workspace_check" CHECK (((team_id IS NOT NULL) OR (user_id IS NOT NULL))) not valid;

alter table "public"."code_entities" validate constraint "code_entities_workspace_check";

alter table "public"."code_entities" add constraint "code_entities_workspace_unique" UNIQUE using index "code_entities_workspace_unique";

alter table "public"."code_queue" add constraint "code_queue_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "public"."code_queue" validate constraint "code_queue_status_check";

alter table "public"."code_queue" add constraint "code_queue_workspace_id_file_path_key" UNIQUE using index "code_queue_workspace_id_file_path_key";

alter table "public"."code_relationships" add constraint "code_relationships_branch_state_id_fkey" FOREIGN KEY (branch_state_id) REFERENCES branch_states(id) ON DELETE CASCADE not valid;

alter table "public"."code_relationships" validate constraint "code_relationships_branch_state_id_fkey";

alter table "public"."code_relationships" add constraint "code_relationships_relationship_type_check" CHECK ((relationship_type = ANY (ARRAY['calls'::text, 'imports'::text, 'extends'::text, 'implements'::text, 'uses'::text, 'references'::text]))) not valid;

alter table "public"."code_relationships" validate constraint "code_relationships_relationship_type_check";

alter table "public"."code_relationships" add constraint "code_relationships_repository_state_id_fkey" FOREIGN KEY (repository_state_id) REFERENCES repository_states(id) ON DELETE CASCADE not valid;

alter table "public"."code_relationships" validate constraint "code_relationships_repository_state_id_fkey";

alter table "public"."code_relationships" add constraint "code_relationships_source_id_fkey" FOREIGN KEY (source_id) REFERENCES code_entities(id) ON DELETE CASCADE not valid;

alter table "public"."code_relationships" validate constraint "code_relationships_source_id_fkey";

alter table "public"."code_relationships" add constraint "code_relationships_source_id_target_id_relationship_type_key" UNIQUE using index "code_relationships_source_id_target_id_relationship_type_key";

alter table "public"."code_relationships" add constraint "code_relationships_target_id_fkey" FOREIGN KEY (target_id) REFERENCES code_entities(id) ON DELETE CASCADE not valid;

alter table "public"."code_relationships" validate constraint "code_relationships_target_id_fkey";

alter table "public"."code_relationships" add constraint "code_relationships_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."code_relationships" validate constraint "code_relationships_team_id_fkey";

alter table "public"."code_relationships" add constraint "code_relationships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."code_relationships" validate constraint "code_relationships_user_id_fkey";

alter table "public"."code_relationships" add constraint "code_relationships_workspace_check" CHECK (((team_id IS NOT NULL) OR (user_id IS NOT NULL))) not valid;

alter table "public"."code_relationships" validate constraint "code_relationships_workspace_check";

alter table "public"."conversations" add constraint "conversations_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."conversations" validate constraint "conversations_team_id_fkey";

alter table "public"."conversations" add constraint "conversations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."conversations" validate constraint "conversations_user_id_fkey";

alter table "public"."github_installations" add constraint "github_installations_account_type_check" CHECK ((account_type = ANY (ARRAY['User'::text, 'Organization'::text]))) not valid;

alter table "public"."github_installations" validate constraint "github_installations_account_type_check";

alter table "public"."github_installations" add constraint "github_installations_repository_selection_check" CHECK ((repository_selection = ANY (ARRAY['all'::text, 'selected'::text]))) not valid;

alter table "public"."github_installations" validate constraint "github_installations_repository_selection_check";

alter table "public"."github_installations" add constraint "github_installations_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."github_installations" validate constraint "github_installations_team_id_fkey";

alter table "public"."memories" add constraint "memories_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE not valid;

alter table "public"."memories" validate constraint "memories_conversation_id_fkey";

alter table "public"."memories" add constraint "memories_message_type_check" CHECK ((message_type = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'tool_use'::text, 'tool_result'::text]))) not valid;

alter table "public"."memories" validate constraint "memories_message_type_check";

alter table "public"."memories" add constraint "memories_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."memories" validate constraint "memories_team_id_fkey";

alter table "public"."memories" add constraint "memories_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."memories" validate constraint "memories_user_id_fkey";

alter table "public"."memories" add constraint "memories_workspace_check" CHECK (((team_id IS NOT NULL) OR (user_id IS NOT NULL))) not valid;

alter table "public"."memories" validate constraint "memories_workspace_check";

alter table "public"."memories" add constraint "memories_workspace_chunk_unique" UNIQUE using index "memories_workspace_chunk_unique";

alter table "public"."memory_queue" add constraint "memory_queue_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "public"."memory_queue" validate constraint "memory_queue_status_check";

alter table "public"."memory_queue" add constraint "memory_queue_workspace_id_chunk_id_key" UNIQUE using index "memory_queue_workspace_id_chunk_id_key";

alter table "public"."orchestration_events" add constraint "orchestration_events_job_id_fkey" FOREIGN KEY (job_id) REFERENCES orchestration_jobs(id) ON DELETE CASCADE not valid;

alter table "public"."orchestration_events" validate constraint "orchestration_events_job_id_fkey";

alter table "public"."orchestration_events" add constraint "orchestration_events_type_check" CHECK ((type = ANY (ARRAY['status_update'::text, 'progress'::text, 'result'::text, 'error'::text, 'log'::text, 'agent_update'::text]))) not valid;

alter table "public"."orchestration_events" validate constraint "orchestration_events_type_check";

alter table "public"."orchestration_jobs" add constraint "orchestration_jobs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."orchestration_jobs" validate constraint "orchestration_jobs_created_by_fkey";

alter table "public"."orchestration_jobs" add constraint "orchestration_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))) not valid;

alter table "public"."orchestration_jobs" validate constraint "orchestration_jobs_status_check";

alter table "public"."orchestration_jobs" add constraint "orchestration_jobs_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."orchestration_jobs" validate constraint "orchestration_jobs_team_id_fkey";

alter table "public"."orchestration_jobs" add constraint "orchestration_jobs_type_check" CHECK ((type = ANY (ARRAY['repo_analysis'::text, 'pr_review'::text, 'pattern_analysis'::text]))) not valid;

alter table "public"."orchestration_jobs" validate constraint "orchestration_jobs_type_check";

alter table "public"."processing_status" add constraint "processing_status_queue_type_check" CHECK ((queue_type = ANY (ARRAY['memory'::text, 'code'::text]))) not valid;

alter table "public"."processing_status" validate constraint "processing_status_queue_type_check";

alter table "public"."processing_status" add constraint "processing_status_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "public"."processing_status" validate constraint "processing_status_status_check";

alter table "public"."project_summaries" add constraint "project_summaries_workspace_id_project_name_key" UNIQUE using index "project_summaries_workspace_id_project_name_key";

alter table "public"."projects" add constraint "projects_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."projects" validate constraint "projects_team_id_fkey";

alter table "public"."projects" add constraint "projects_team_id_name_key" UNIQUE using index "projects_team_id_name_key";

alter table "public"."repository_states" add constraint "repository_states_github_repo_id_main_branch_sha_key" UNIQUE using index "repository_states_github_repo_id_main_branch_sha_key";

alter table "public"."review_agents" add constraint "review_agents_session_id_fkey" FOREIGN KEY (session_id) REFERENCES review_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."review_agents" validate constraint "review_agents_session_id_fkey";

alter table "public"."review_events" add constraint "review_events_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES review_agents(id) ON DELETE CASCADE not valid;

alter table "public"."review_events" validate constraint "review_events_agent_id_fkey";

alter table "public"."review_events" add constraint "review_events_event_type_check" CHECK ((event_type = ANY (ARRAY['status_update'::text, 'tool_call'::text, 'tool_result'::text, 'thinking'::text, 'agent_thought'::text, 'discussion_turn'::text, 'review_comment'::text, 'final_verdict'::text, 'error'::text]))) not valid;

alter table "public"."review_events" validate constraint "review_events_event_type_check";

alter table "public"."review_events" add constraint "review_events_session_id_fkey" FOREIGN KEY (session_id) REFERENCES review_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."review_events" validate constraint "review_events_session_id_fkey";

alter table "public"."review_sessions" add constraint "review_sessions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."review_sessions" validate constraint "review_sessions_created_by_fkey";

alter table "public"."review_sessions" add constraint "review_sessions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))) not valid;

alter table "public"."review_sessions" validate constraint "review_sessions_status_check";

alter table "public"."review_sessions" add constraint "review_sessions_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."review_sessions" validate constraint "review_sessions_team_id_fkey";

alter table "public"."sync_status" add constraint "sync_status_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "public"."sync_status" validate constraint "sync_status_status_check";

alter table "public"."sync_status" add constraint "sync_status_sync_type_check" CHECK ((sync_type = ANY (ARRAY['memory'::text, 'graph'::text, 'full'::text]))) not valid;

alter table "public"."sync_status" validate constraint "sync_status_sync_type_check";

alter table "public"."sync_status" add constraint "sync_status_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."sync_status" validate constraint "sync_status_team_id_fkey";

alter table "public"."team_members" add constraint "team_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text]))) not valid;

alter table "public"."team_members" validate constraint "team_members_role_check";

alter table "public"."team_members" add constraint "team_members_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE not valid;

alter table "public"."team_members" validate constraint "team_members_team_id_fkey";

alter table "public"."team_members" add constraint "team_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."team_members" validate constraint "team_members_user_id_fkey";

alter table "public"."teams" add constraint "teams_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."teams" validate constraint "teams_created_by_fkey";

alter table "public"."teams" add constraint "teams_github_installation_id_key" UNIQUE using index "teams_github_installation_id_key";

alter table "public"."teams" add constraint "teams_slug_key" UNIQUE using index "teams_slug_key";

alter table "public"."teams" add constraint "teams_subscription_tier_check" CHECK ((subscription_tier = ANY (ARRAY['free'::text, 'pro'::text, 'enterprise'::text]))) not valid;

alter table "public"."teams" validate constraint "teams_subscription_tier_check";

alter table "public"."user_repositories" add constraint "user_repositories_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."user_repositories" validate constraint "user_repositories_user_id_fkey";

alter table "public"."users" add constraint "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."users" validate constraint "users_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.api_user_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  -- Try to get user ID from JWT claim (web auth)
  IF current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL THEN
    RETURN (current_setting('request.jwt.claims', true)::json->>'sub')::UUID;
  END IF;
  
  -- Try to get user ID from API context (API key auth)
  IF current_setting('app.user_id', true) IS NOT NULL THEN
    RETURN current_setting('app.user_id', true)::UUID;
  END IF;
  
  -- No user context found
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_assign_team_on_login()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  github_handle TEXT;
  team_record RECORD;
BEGIN
  -- Extract GitHub username from user metadata
  github_handle := NEW.raw_user_meta_data->>'user_name';
  
  -- Only proceed if we have a GitHub handle
  IF github_handle IS NOT NULL THEN
    -- Find teams that include this GitHub handle
    FOR team_record IN 
      SELECT id FROM public.teams 
      WHERE github_handle = ANY(github_handles)
    LOOP
      -- Add user to team with member role
      INSERT INTO public.team_members (team_id, user_id, role)
      VALUES (team_record.id, NEW.id, 'member')
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_orchestration_events()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM orchestration_events
  WHERE timestamp < NOW() - INTERVAL '7 days'
  AND job_id IN (
    SELECT id FROM orchestration_jobs
    WHERE status IN ('completed', 'failed', 'cancelled')
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_sync_logs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM sync_logs 
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_repository_diff(p_repo_id bigint, p_branch_name text, p_team_id uuid)
 RETURNS TABLE(entity_type text, change_type text, entity_name text, file_path text, details jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_state_id UUID;
BEGIN
  -- Get the latest branch state
  SELECT bs.id INTO v_branch_state_id
  FROM branch_states bs
  JOIN repository_states rs ON rs.id = bs.repository_state_id
  WHERE rs.github_repo_id = p_repo_id
    AND bs.branch_name = p_branch_name
    AND bs.team_id = p_team_id
  ORDER BY bs.last_sync DESC
  LIMIT 1;

  IF v_branch_state_id IS NULL THEN
    RETURN;
  END IF;

  -- Return differences
  RETURN QUERY
  WITH branch_data AS (
    SELECT * FROM branch_states WHERE id = v_branch_state_id
  )
  SELECT 
    'entity' as entity_type,
    'added' as change_type,
    elem->>'name' as entity_name,
    elem->>'file_path' as file_path,
    elem as details
  FROM branch_data, jsonb_array_elements(entities_added) elem
  UNION ALL
  SELECT 
    'entity' as entity_type,
    'modified' as change_type,
    elem->>'name' as entity_name,
    elem->>'file_path' as file_path,
    elem as details
  FROM branch_data, jsonb_array_elements(entities_modified) elem
  UNION ALL
  SELECT 
    'entity' as entity_type,
    'deleted' as change_type,
    elem as entity_name,
    NULL as file_path,
    NULL as details
  FROM branch_data, unnest(entities_deleted) elem;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, users.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url);
  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hybrid_search_memories(query_embedding vector, query_text text DEFAULT NULL::text, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 20, filter_team_id uuid DEFAULT NULL::uuid, filter_user_id uuid DEFAULT NULL::uuid, filter_projects text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, team_id uuid, user_id uuid, project_name text, chunk_id text, content text, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, similarity double precision, text_match boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH semantic_results AS (
    SELECT 
      m.*,
      1 - (m.embedding <=> query_embedding) as similarity
    FROM memories m
    WHERE 
      m.embedding IS NOT NULL
      AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ),
  text_results AS (
    SELECT 
      m.*,
      0.5 as similarity -- Give text matches a baseline similarity
    FROM memories m
    WHERE 
      query_text IS NOT NULL
      AND m.content ILIKE '%' || query_text || '%'
  ),
  combined_results AS (
    SELECT DISTINCT ON (id)
      id,
      team_id,
      user_id,
      project_name,
      chunk_id,
      content,
      metadata,
      created_at,
      updated_at,
      GREATEST(
        COALESCE((SELECT similarity FROM semantic_results sr WHERE sr.id = r.id), 0),
        COALESCE((SELECT similarity FROM text_results tr WHERE tr.id = r.id), 0)
      ) as similarity,
      EXISTS(SELECT 1 FROM text_results tr WHERE tr.id = r.id) as text_match
    FROM (
      SELECT * FROM semantic_results
      UNION
      SELECT * FROM text_results
    ) r
  )
  SELECT *
  FROM combined_results
  WHERE
    -- Apply team/user filters
    (
      (filter_team_id IS NOT NULL AND team_id = filter_team_id)
      OR (filter_user_id IS NOT NULL AND user_id = filter_user_id AND team_id IS NULL)
      OR (filter_team_id IS NULL AND filter_user_id IS NULL)
    )
    -- Apply project filter if provided
    AND (
      filter_projects IS NULL 
      OR project_name = ANY(filter_projects)
    )
  ORDER BY similarity DESC
  LIMIT match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.is_team_admin(check_team_id uuid, check_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    is_admin boolean;
BEGIN
    -- Direct query with no RLS applied
    SELECT EXISTS (
        SELECT 1 
        FROM team_members 
        WHERE team_id = check_team_id 
        AND user_id = check_user_id
        AND role IN ('admin', 'owner')
    ) INTO is_admin;
    
    RETURN is_admin;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_team_member(check_team_id uuid, check_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    is_member boolean;
BEGIN
    -- Direct query with no RLS applied
    SELECT EXISTS (
        SELECT 1 
        FROM team_members 
        WHERE team_id = check_team_id 
        AND user_id = check_user_id
    ) INTO is_member;
    
    RETURN is_member;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_memories(query_embedding text, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 20, filter_team_id uuid DEFAULT NULL::uuid, filter_user_id uuid DEFAULT NULL::uuid, filter_projects text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, team_id uuid, user_id uuid, project_name text, chunk_id text, content text, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, similarity double precision)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.team_id,
    m.user_id,
    m.project_name,
    m.chunk_id,
    m.content,
    m.metadata,
    m.created_at,
    m.updated_at,
    -- Calculate cosine similarity between JSON array strings
    (1 - (
      (m.embedding::vector(3072)) <=> (query_embedding::vector(3072))
    ))::float as similarity
  FROM memories m
  WHERE 
    -- Only match memories with embeddings
    m.embedding IS NOT NULL
    -- Apply similarity threshold
    AND (1 - (
      (m.embedding::vector(3072)) <=> (query_embedding::vector(3072))
    )) > match_threshold
    -- Apply filters
    AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
    AND (filter_team_id IS NULL OR m.team_id = filter_team_id)
    AND (filter_projects IS NULL OR m.project_name = ANY(filter_projects))
  ORDER BY (m.embedding::vector(3072)) <=> (query_embedding::vector(3072)) ASC
  LIMIT match_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_memories(p_team_id uuid, p_query_embedding vector, p_limit integer DEFAULT 10, p_project_filter text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, chunk_id text, content text, project_name text, similarity double precision, metadata jsonb)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.chunk_id,
    m.content,
    m.project_name,
    1 - (m.embedding <=> p_query_embedding) as similarity,
    m.metadata
  FROM memories m
  WHERE m.team_id = p_team_id
    AND (p_project_filter IS NULL OR m.project_name = ANY(p_project_filter))
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_memories(p_team_id uuid, p_query_embedding vector, p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10, p_project_filter text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, team_id uuid, user_id uuid, project_name text, chunk_id text, content text, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.team_id,
    m.user_id,
    m.project_name,
    m.chunk_id,
    m.content,
    m.metadata,
    m.created_at,
    m.updated_at,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM memories m
  WHERE 
    -- Match workspace (team or personal)
    ((p_team_id IS NOT NULL AND m.team_id = p_team_id) OR 
     (p_team_id IS NULL AND m.user_id = p_user_id))
    -- Apply project filter if provided
    AND (p_project_filter IS NULL OR m.project_name = ANY(p_project_filter))
    -- Only return memories with embeddings
    AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_memories(query_embedding vector, workspace_filter text, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 10, project_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, chunk_id text, session_id text, content text, similarity double precision, metadata jsonb, created_at timestamp with time zone, project_name text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  ws_type text;
  ws_id uuid;
BEGIN
  -- Parse workspace filter (format: 'user:uuid' or 'team:uuid')
  IF workspace_filter LIKE 'user:%' THEN
    ws_type := 'user';
    ws_id := SUBSTRING(workspace_filter FROM 6)::uuid;
  ELSIF workspace_filter LIKE 'team:%' THEN
    ws_type := 'team';
    ws_id := SUBSTRING(workspace_filter FROM 6)::uuid;
  ELSE
    RAISE EXCEPTION 'Invalid workspace filter format';
  END IF;

  RETURN QUERY
  SELECT 
    m.id,
    m.chunk_id,
    m.session_id,
    m.content,
    1 - (m.embedding <=> query_embedding) as similarity,
    m.metadata,
    m.created_at,
    m.project_name
  FROM memories m
  WHERE 
    CASE 
      WHEN ws_type = 'user' THEN m.user_id = ws_id
      WHEN ws_type = 'team' THEN m.team_id = ws_id
    END
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
    AND (project_filter IS NULL OR m.project_name = project_filter)
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_memories_advanced(p_team_id uuid, p_query text DEFAULT NULL::text, p_projects text[] DEFAULT NULL::text[], p_users uuid[] DEFAULT NULL::uuid[], p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_branches text[] DEFAULT NULL::text[], p_has_code boolean DEFAULT NULL::boolean, p_topics text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, chunk_id text, content text, project_name text, user_id uuid, conversation_id uuid, created_at timestamp with time zone, branch_name text, commit_sha text, topics text[], file_paths text[], relevance double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.chunk_id,
    m.content,
    m.project_name,
    m.user_id,
    m.conversation_id,
    m.created_at,
    m.branch_name,
    m.commit_sha,
    m.topics,
    m.file_paths,
    CASE 
      WHEN p_query IS NOT NULL THEN 
        ts_rank(to_tsvector('english', m.search_text), plainto_tsquery('english', p_query))
      ELSE 1.0
    END as relevance
  FROM memories m
  WHERE m.team_id = p_team_id
    AND (p_query IS NULL OR to_tsvector('english', m.search_text) @@ plainto_tsquery('english', p_query))
    AND (p_projects IS NULL OR m.project_name = ANY(p_projects))
    AND (p_users IS NULL OR m.user_id = ANY(p_users))
    AND (p_date_from IS NULL OR m.created_at >= p_date_from)
    AND (p_date_to IS NULL OR m.created_at <= p_date_to)
    AND (p_branches IS NULL OR m.branch_name = ANY(p_branches))
    AND (p_has_code IS NULL OR m.has_code = p_has_code)
    AND (p_topics IS NULL OR m.topics && p_topics)
  ORDER BY relevance DESC, m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_api_user_context(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM set_config('app.user_id', p_user_id::text, true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_existing_users_to_teams()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  user_record RECORD;
  team_record RECORD;
  github_handle TEXT;
BEGIN
  -- Loop through all users
  FOR user_record IN SELECT id, raw_user_meta_data FROM auth.users
  LOOP
    github_handle := user_record.raw_user_meta_data->>'user_name';
    
    IF github_handle IS NOT NULL THEN
      -- Find all teams that include this GitHub handle
      FOR team_record IN 
        SELECT id FROM public.teams 
        WHERE github_handle = ANY(github_handles)
      LOOP
        -- Add user to team if not already a member
        INSERT INTO public.team_members (team_id, user_id, role)
        VALUES (team_record.id, user_record.id, 'member')
        ON CONFLICT (team_id, user_id) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_memory_search_text()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.search_text = NEW.content || ' ' || 
    COALESCE(NEW.metadata->>'summary', '') || ' ' ||
    COALESCE(array_to_string(NEW.topics, ' '), '') || ' ' ||
    COALESCE(array_to_string(NEW.file_paths, ' '), '') || ' ' ||
    COALESCE(NEW.project_name, '');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."analysis_jobs" to "anon";

grant insert on table "public"."analysis_jobs" to "anon";

grant references on table "public"."analysis_jobs" to "anon";

grant select on table "public"."analysis_jobs" to "anon";

grant trigger on table "public"."analysis_jobs" to "anon";

grant truncate on table "public"."analysis_jobs" to "anon";

grant update on table "public"."analysis_jobs" to "anon";

grant delete on table "public"."analysis_jobs" to "authenticated";

grant insert on table "public"."analysis_jobs" to "authenticated";

grant references on table "public"."analysis_jobs" to "authenticated";

grant select on table "public"."analysis_jobs" to "authenticated";

grant trigger on table "public"."analysis_jobs" to "authenticated";

grant truncate on table "public"."analysis_jobs" to "authenticated";

grant update on table "public"."analysis_jobs" to "authenticated";

grant delete on table "public"."analysis_jobs" to "service_role";

grant insert on table "public"."analysis_jobs" to "service_role";

grant references on table "public"."analysis_jobs" to "service_role";

grant select on table "public"."analysis_jobs" to "service_role";

grant trigger on table "public"."analysis_jobs" to "service_role";

grant truncate on table "public"."analysis_jobs" to "service_role";

grant update on table "public"."analysis_jobs" to "service_role";

grant delete on table "public"."api_keys" to "anon";

grant insert on table "public"."api_keys" to "anon";

grant references on table "public"."api_keys" to "anon";

grant select on table "public"."api_keys" to "anon";

grant trigger on table "public"."api_keys" to "anon";

grant truncate on table "public"."api_keys" to "anon";

grant update on table "public"."api_keys" to "anon";

grant delete on table "public"."api_keys" to "authenticated";

grant insert on table "public"."api_keys" to "authenticated";

grant references on table "public"."api_keys" to "authenticated";

grant select on table "public"."api_keys" to "authenticated";

grant trigger on table "public"."api_keys" to "authenticated";

grant truncate on table "public"."api_keys" to "authenticated";

grant update on table "public"."api_keys" to "authenticated";

grant delete on table "public"."api_keys" to "service_role";

grant insert on table "public"."api_keys" to "service_role";

grant references on table "public"."api_keys" to "service_role";

grant select on table "public"."api_keys" to "service_role";

grant trigger on table "public"."api_keys" to "service_role";

grant truncate on table "public"."api_keys" to "service_role";

grant update on table "public"."api_keys" to "service_role";

grant delete on table "public"."branch_states" to "anon";

grant insert on table "public"."branch_states" to "anon";

grant references on table "public"."branch_states" to "anon";

grant select on table "public"."branch_states" to "anon";

grant trigger on table "public"."branch_states" to "anon";

grant truncate on table "public"."branch_states" to "anon";

grant update on table "public"."branch_states" to "anon";

grant delete on table "public"."branch_states" to "authenticated";

grant insert on table "public"."branch_states" to "authenticated";

grant references on table "public"."branch_states" to "authenticated";

grant select on table "public"."branch_states" to "authenticated";

grant trigger on table "public"."branch_states" to "authenticated";

grant truncate on table "public"."branch_states" to "authenticated";

grant update on table "public"."branch_states" to "authenticated";

grant delete on table "public"."branch_states" to "service_role";

grant insert on table "public"."branch_states" to "service_role";

grant references on table "public"."branch_states" to "service_role";

grant select on table "public"."branch_states" to "service_role";

grant trigger on table "public"."branch_states" to "service_role";

grant truncate on table "public"."branch_states" to "service_role";

grant update on table "public"."branch_states" to "service_role";

grant delete on table "public"."code_entities" to "anon";

grant insert on table "public"."code_entities" to "anon";

grant references on table "public"."code_entities" to "anon";

grant select on table "public"."code_entities" to "anon";

grant trigger on table "public"."code_entities" to "anon";

grant truncate on table "public"."code_entities" to "anon";

grant update on table "public"."code_entities" to "anon";

grant delete on table "public"."code_entities" to "authenticated";

grant insert on table "public"."code_entities" to "authenticated";

grant references on table "public"."code_entities" to "authenticated";

grant select on table "public"."code_entities" to "authenticated";

grant trigger on table "public"."code_entities" to "authenticated";

grant truncate on table "public"."code_entities" to "authenticated";

grant update on table "public"."code_entities" to "authenticated";

grant delete on table "public"."code_entities" to "service_role";

grant insert on table "public"."code_entities" to "service_role";

grant references on table "public"."code_entities" to "service_role";

grant select on table "public"."code_entities" to "service_role";

grant trigger on table "public"."code_entities" to "service_role";

grant truncate on table "public"."code_entities" to "service_role";

grant update on table "public"."code_entities" to "service_role";

grant delete on table "public"."code_graphs" to "anon";

grant insert on table "public"."code_graphs" to "anon";

grant references on table "public"."code_graphs" to "anon";

grant select on table "public"."code_graphs" to "anon";

grant trigger on table "public"."code_graphs" to "anon";

grant truncate on table "public"."code_graphs" to "anon";

grant update on table "public"."code_graphs" to "anon";

grant delete on table "public"."code_graphs" to "authenticated";

grant insert on table "public"."code_graphs" to "authenticated";

grant references on table "public"."code_graphs" to "authenticated";

grant select on table "public"."code_graphs" to "authenticated";

grant trigger on table "public"."code_graphs" to "authenticated";

grant truncate on table "public"."code_graphs" to "authenticated";

grant update on table "public"."code_graphs" to "authenticated";

grant delete on table "public"."code_graphs" to "service_role";

grant insert on table "public"."code_graphs" to "service_role";

grant references on table "public"."code_graphs" to "service_role";

grant select on table "public"."code_graphs" to "service_role";

grant trigger on table "public"."code_graphs" to "service_role";

grant truncate on table "public"."code_graphs" to "service_role";

grant update on table "public"."code_graphs" to "service_role";

grant delete on table "public"."code_queue" to "anon";

grant insert on table "public"."code_queue" to "anon";

grant references on table "public"."code_queue" to "anon";

grant select on table "public"."code_queue" to "anon";

grant trigger on table "public"."code_queue" to "anon";

grant truncate on table "public"."code_queue" to "anon";

grant update on table "public"."code_queue" to "anon";

grant delete on table "public"."code_queue" to "authenticated";

grant insert on table "public"."code_queue" to "authenticated";

grant references on table "public"."code_queue" to "authenticated";

grant select on table "public"."code_queue" to "authenticated";

grant trigger on table "public"."code_queue" to "authenticated";

grant truncate on table "public"."code_queue" to "authenticated";

grant update on table "public"."code_queue" to "authenticated";

grant delete on table "public"."code_queue" to "service_role";

grant insert on table "public"."code_queue" to "service_role";

grant references on table "public"."code_queue" to "service_role";

grant select on table "public"."code_queue" to "service_role";

grant trigger on table "public"."code_queue" to "service_role";

grant truncate on table "public"."code_queue" to "service_role";

grant update on table "public"."code_queue" to "service_role";

grant delete on table "public"."code_relationships" to "anon";

grant insert on table "public"."code_relationships" to "anon";

grant references on table "public"."code_relationships" to "anon";

grant select on table "public"."code_relationships" to "anon";

grant trigger on table "public"."code_relationships" to "anon";

grant truncate on table "public"."code_relationships" to "anon";

grant update on table "public"."code_relationships" to "anon";

grant delete on table "public"."code_relationships" to "authenticated";

grant insert on table "public"."code_relationships" to "authenticated";

grant references on table "public"."code_relationships" to "authenticated";

grant select on table "public"."code_relationships" to "authenticated";

grant trigger on table "public"."code_relationships" to "authenticated";

grant truncate on table "public"."code_relationships" to "authenticated";

grant update on table "public"."code_relationships" to "authenticated";

grant delete on table "public"."code_relationships" to "service_role";

grant insert on table "public"."code_relationships" to "service_role";

grant references on table "public"."code_relationships" to "service_role";

grant select on table "public"."code_relationships" to "service_role";

grant trigger on table "public"."code_relationships" to "service_role";

grant truncate on table "public"."code_relationships" to "service_role";

grant update on table "public"."code_relationships" to "service_role";

grant delete on table "public"."conversations" to "anon";

grant insert on table "public"."conversations" to "anon";

grant references on table "public"."conversations" to "anon";

grant select on table "public"."conversations" to "anon";

grant trigger on table "public"."conversations" to "anon";

grant truncate on table "public"."conversations" to "anon";

grant update on table "public"."conversations" to "anon";

grant delete on table "public"."conversations" to "authenticated";

grant insert on table "public"."conversations" to "authenticated";

grant references on table "public"."conversations" to "authenticated";

grant select on table "public"."conversations" to "authenticated";

grant trigger on table "public"."conversations" to "authenticated";

grant truncate on table "public"."conversations" to "authenticated";

grant update on table "public"."conversations" to "authenticated";

grant delete on table "public"."conversations" to "service_role";

grant insert on table "public"."conversations" to "service_role";

grant references on table "public"."conversations" to "service_role";

grant select on table "public"."conversations" to "service_role";

grant trigger on table "public"."conversations" to "service_role";

grant truncate on table "public"."conversations" to "service_role";

grant update on table "public"."conversations" to "service_role";

grant delete on table "public"."github_installations" to "anon";

grant insert on table "public"."github_installations" to "anon";

grant references on table "public"."github_installations" to "anon";

grant select on table "public"."github_installations" to "anon";

grant trigger on table "public"."github_installations" to "anon";

grant truncate on table "public"."github_installations" to "anon";

grant update on table "public"."github_installations" to "anon";

grant delete on table "public"."github_installations" to "authenticated";

grant insert on table "public"."github_installations" to "authenticated";

grant references on table "public"."github_installations" to "authenticated";

grant select on table "public"."github_installations" to "authenticated";

grant trigger on table "public"."github_installations" to "authenticated";

grant truncate on table "public"."github_installations" to "authenticated";

grant update on table "public"."github_installations" to "authenticated";

grant delete on table "public"."github_installations" to "service_role";

grant insert on table "public"."github_installations" to "service_role";

grant references on table "public"."github_installations" to "service_role";

grant select on table "public"."github_installations" to "service_role";

grant trigger on table "public"."github_installations" to "service_role";

grant truncate on table "public"."github_installations" to "service_role";

grant update on table "public"."github_installations" to "service_role";

grant delete on table "public"."memories" to "anon";

grant insert on table "public"."memories" to "anon";

grant references on table "public"."memories" to "anon";

grant select on table "public"."memories" to "anon";

grant trigger on table "public"."memories" to "anon";

grant truncate on table "public"."memories" to "anon";

grant update on table "public"."memories" to "anon";

grant delete on table "public"."memories" to "authenticated";

grant insert on table "public"."memories" to "authenticated";

grant references on table "public"."memories" to "authenticated";

grant select on table "public"."memories" to "authenticated";

grant trigger on table "public"."memories" to "authenticated";

grant truncate on table "public"."memories" to "authenticated";

grant update on table "public"."memories" to "authenticated";

grant delete on table "public"."memories" to "service_role";

grant insert on table "public"."memories" to "service_role";

grant references on table "public"."memories" to "service_role";

grant select on table "public"."memories" to "service_role";

grant trigger on table "public"."memories" to "service_role";

grant truncate on table "public"."memories" to "service_role";

grant update on table "public"."memories" to "service_role";

grant delete on table "public"."memory_queue" to "anon";

grant insert on table "public"."memory_queue" to "anon";

grant references on table "public"."memory_queue" to "anon";

grant select on table "public"."memory_queue" to "anon";

grant trigger on table "public"."memory_queue" to "anon";

grant truncate on table "public"."memory_queue" to "anon";

grant update on table "public"."memory_queue" to "anon";

grant delete on table "public"."memory_queue" to "authenticated";

grant insert on table "public"."memory_queue" to "authenticated";

grant references on table "public"."memory_queue" to "authenticated";

grant select on table "public"."memory_queue" to "authenticated";

grant trigger on table "public"."memory_queue" to "authenticated";

grant truncate on table "public"."memory_queue" to "authenticated";

grant update on table "public"."memory_queue" to "authenticated";

grant delete on table "public"."memory_queue" to "service_role";

grant insert on table "public"."memory_queue" to "service_role";

grant references on table "public"."memory_queue" to "service_role";

grant select on table "public"."memory_queue" to "service_role";

grant trigger on table "public"."memory_queue" to "service_role";

grant truncate on table "public"."memory_queue" to "service_role";

grant update on table "public"."memory_queue" to "service_role";

grant delete on table "public"."orchestration_events" to "anon";

grant insert on table "public"."orchestration_events" to "anon";

grant references on table "public"."orchestration_events" to "anon";

grant select on table "public"."orchestration_events" to "anon";

grant trigger on table "public"."orchestration_events" to "anon";

grant truncate on table "public"."orchestration_events" to "anon";

grant update on table "public"."orchestration_events" to "anon";

grant delete on table "public"."orchestration_events" to "authenticated";

grant insert on table "public"."orchestration_events" to "authenticated";

grant references on table "public"."orchestration_events" to "authenticated";

grant select on table "public"."orchestration_events" to "authenticated";

grant trigger on table "public"."orchestration_events" to "authenticated";

grant truncate on table "public"."orchestration_events" to "authenticated";

grant update on table "public"."orchestration_events" to "authenticated";

grant delete on table "public"."orchestration_events" to "service_role";

grant insert on table "public"."orchestration_events" to "service_role";

grant references on table "public"."orchestration_events" to "service_role";

grant select on table "public"."orchestration_events" to "service_role";

grant trigger on table "public"."orchestration_events" to "service_role";

grant truncate on table "public"."orchestration_events" to "service_role";

grant update on table "public"."orchestration_events" to "service_role";

grant delete on table "public"."orchestration_jobs" to "anon";

grant insert on table "public"."orchestration_jobs" to "anon";

grant references on table "public"."orchestration_jobs" to "anon";

grant select on table "public"."orchestration_jobs" to "anon";

grant trigger on table "public"."orchestration_jobs" to "anon";

grant truncate on table "public"."orchestration_jobs" to "anon";

grant update on table "public"."orchestration_jobs" to "anon";

grant delete on table "public"."orchestration_jobs" to "authenticated";

grant insert on table "public"."orchestration_jobs" to "authenticated";

grant references on table "public"."orchestration_jobs" to "authenticated";

grant select on table "public"."orchestration_jobs" to "authenticated";

grant trigger on table "public"."orchestration_jobs" to "authenticated";

grant truncate on table "public"."orchestration_jobs" to "authenticated";

grant update on table "public"."orchestration_jobs" to "authenticated";

grant delete on table "public"."orchestration_jobs" to "service_role";

grant insert on table "public"."orchestration_jobs" to "service_role";

grant references on table "public"."orchestration_jobs" to "service_role";

grant select on table "public"."orchestration_jobs" to "service_role";

grant trigger on table "public"."orchestration_jobs" to "service_role";

grant truncate on table "public"."orchestration_jobs" to "service_role";

grant update on table "public"."orchestration_jobs" to "service_role";

grant delete on table "public"."processing_status" to "anon";

grant insert on table "public"."processing_status" to "anon";

grant references on table "public"."processing_status" to "anon";

grant select on table "public"."processing_status" to "anon";

grant trigger on table "public"."processing_status" to "anon";

grant truncate on table "public"."processing_status" to "anon";

grant update on table "public"."processing_status" to "anon";

grant delete on table "public"."processing_status" to "authenticated";

grant insert on table "public"."processing_status" to "authenticated";

grant references on table "public"."processing_status" to "authenticated";

grant select on table "public"."processing_status" to "authenticated";

grant trigger on table "public"."processing_status" to "authenticated";

grant truncate on table "public"."processing_status" to "authenticated";

grant update on table "public"."processing_status" to "authenticated";

grant delete on table "public"."processing_status" to "service_role";

grant insert on table "public"."processing_status" to "service_role";

grant references on table "public"."processing_status" to "service_role";

grant select on table "public"."processing_status" to "service_role";

grant trigger on table "public"."processing_status" to "service_role";

grant truncate on table "public"."processing_status" to "service_role";

grant update on table "public"."processing_status" to "service_role";

grant delete on table "public"."project_summaries" to "anon";

grant insert on table "public"."project_summaries" to "anon";

grant references on table "public"."project_summaries" to "anon";

grant select on table "public"."project_summaries" to "anon";

grant trigger on table "public"."project_summaries" to "anon";

grant truncate on table "public"."project_summaries" to "anon";

grant update on table "public"."project_summaries" to "anon";

grant delete on table "public"."project_summaries" to "authenticated";

grant insert on table "public"."project_summaries" to "authenticated";

grant references on table "public"."project_summaries" to "authenticated";

grant select on table "public"."project_summaries" to "authenticated";

grant trigger on table "public"."project_summaries" to "authenticated";

grant truncate on table "public"."project_summaries" to "authenticated";

grant update on table "public"."project_summaries" to "authenticated";

grant delete on table "public"."project_summaries" to "service_role";

grant insert on table "public"."project_summaries" to "service_role";

grant references on table "public"."project_summaries" to "service_role";

grant select on table "public"."project_summaries" to "service_role";

grant trigger on table "public"."project_summaries" to "service_role";

grant truncate on table "public"."project_summaries" to "service_role";

grant update on table "public"."project_summaries" to "service_role";

grant delete on table "public"."projects" to "anon";

grant insert on table "public"."projects" to "anon";

grant references on table "public"."projects" to "anon";

grant select on table "public"."projects" to "anon";

grant trigger on table "public"."projects" to "anon";

grant truncate on table "public"."projects" to "anon";

grant update on table "public"."projects" to "anon";

grant delete on table "public"."projects" to "authenticated";

grant insert on table "public"."projects" to "authenticated";

grant references on table "public"."projects" to "authenticated";

grant select on table "public"."projects" to "authenticated";

grant trigger on table "public"."projects" to "authenticated";

grant truncate on table "public"."projects" to "authenticated";

grant update on table "public"."projects" to "authenticated";

grant delete on table "public"."projects" to "service_role";

grant insert on table "public"."projects" to "service_role";

grant references on table "public"."projects" to "service_role";

grant select on table "public"."projects" to "service_role";

grant trigger on table "public"."projects" to "service_role";

grant truncate on table "public"."projects" to "service_role";

grant update on table "public"."projects" to "service_role";

grant delete on table "public"."repository_states" to "anon";

grant insert on table "public"."repository_states" to "anon";

grant references on table "public"."repository_states" to "anon";

grant select on table "public"."repository_states" to "anon";

grant trigger on table "public"."repository_states" to "anon";

grant truncate on table "public"."repository_states" to "anon";

grant update on table "public"."repository_states" to "anon";

grant delete on table "public"."repository_states" to "authenticated";

grant insert on table "public"."repository_states" to "authenticated";

grant references on table "public"."repository_states" to "authenticated";

grant select on table "public"."repository_states" to "authenticated";

grant trigger on table "public"."repository_states" to "authenticated";

grant truncate on table "public"."repository_states" to "authenticated";

grant update on table "public"."repository_states" to "authenticated";

grant delete on table "public"."repository_states" to "service_role";

grant insert on table "public"."repository_states" to "service_role";

grant references on table "public"."repository_states" to "service_role";

grant select on table "public"."repository_states" to "service_role";

grant trigger on table "public"."repository_states" to "service_role";

grant truncate on table "public"."repository_states" to "service_role";

grant update on table "public"."repository_states" to "service_role";

grant delete on table "public"."review_agents" to "anon";

grant insert on table "public"."review_agents" to "anon";

grant references on table "public"."review_agents" to "anon";

grant select on table "public"."review_agents" to "anon";

grant trigger on table "public"."review_agents" to "anon";

grant truncate on table "public"."review_agents" to "anon";

grant update on table "public"."review_agents" to "anon";

grant delete on table "public"."review_agents" to "authenticated";

grant insert on table "public"."review_agents" to "authenticated";

grant references on table "public"."review_agents" to "authenticated";

grant select on table "public"."review_agents" to "authenticated";

grant trigger on table "public"."review_agents" to "authenticated";

grant truncate on table "public"."review_agents" to "authenticated";

grant update on table "public"."review_agents" to "authenticated";

grant delete on table "public"."review_agents" to "service_role";

grant insert on table "public"."review_agents" to "service_role";

grant references on table "public"."review_agents" to "service_role";

grant select on table "public"."review_agents" to "service_role";

grant trigger on table "public"."review_agents" to "service_role";

grant truncate on table "public"."review_agents" to "service_role";

grant update on table "public"."review_agents" to "service_role";

grant delete on table "public"."review_events" to "anon";

grant insert on table "public"."review_events" to "anon";

grant references on table "public"."review_events" to "anon";

grant select on table "public"."review_events" to "anon";

grant trigger on table "public"."review_events" to "anon";

grant truncate on table "public"."review_events" to "anon";

grant update on table "public"."review_events" to "anon";

grant delete on table "public"."review_events" to "authenticated";

grant insert on table "public"."review_events" to "authenticated";

grant references on table "public"."review_events" to "authenticated";

grant select on table "public"."review_events" to "authenticated";

grant trigger on table "public"."review_events" to "authenticated";

grant truncate on table "public"."review_events" to "authenticated";

grant update on table "public"."review_events" to "authenticated";

grant delete on table "public"."review_events" to "service_role";

grant insert on table "public"."review_events" to "service_role";

grant references on table "public"."review_events" to "service_role";

grant select on table "public"."review_events" to "service_role";

grant trigger on table "public"."review_events" to "service_role";

grant truncate on table "public"."review_events" to "service_role";

grant update on table "public"."review_events" to "service_role";

grant delete on table "public"."review_sessions" to "anon";

grant insert on table "public"."review_sessions" to "anon";

grant references on table "public"."review_sessions" to "anon";

grant select on table "public"."review_sessions" to "anon";

grant trigger on table "public"."review_sessions" to "anon";

grant truncate on table "public"."review_sessions" to "anon";

grant update on table "public"."review_sessions" to "anon";

grant delete on table "public"."review_sessions" to "authenticated";

grant insert on table "public"."review_sessions" to "authenticated";

grant references on table "public"."review_sessions" to "authenticated";

grant select on table "public"."review_sessions" to "authenticated";

grant trigger on table "public"."review_sessions" to "authenticated";

grant truncate on table "public"."review_sessions" to "authenticated";

grant update on table "public"."review_sessions" to "authenticated";

grant delete on table "public"."review_sessions" to "service_role";

grant insert on table "public"."review_sessions" to "service_role";

grant references on table "public"."review_sessions" to "service_role";

grant select on table "public"."review_sessions" to "service_role";

grant trigger on table "public"."review_sessions" to "service_role";

grant truncate on table "public"."review_sessions" to "service_role";

grant update on table "public"."review_sessions" to "service_role";

grant delete on table "public"."sync_logs" to "anon";

grant insert on table "public"."sync_logs" to "anon";

grant references on table "public"."sync_logs" to "anon";

grant select on table "public"."sync_logs" to "anon";

grant trigger on table "public"."sync_logs" to "anon";

grant truncate on table "public"."sync_logs" to "anon";

grant update on table "public"."sync_logs" to "anon";

grant delete on table "public"."sync_logs" to "authenticated";

grant insert on table "public"."sync_logs" to "authenticated";

grant references on table "public"."sync_logs" to "authenticated";

grant select on table "public"."sync_logs" to "authenticated";

grant trigger on table "public"."sync_logs" to "authenticated";

grant truncate on table "public"."sync_logs" to "authenticated";

grant update on table "public"."sync_logs" to "authenticated";

grant delete on table "public"."sync_logs" to "service_role";

grant insert on table "public"."sync_logs" to "service_role";

grant references on table "public"."sync_logs" to "service_role";

grant select on table "public"."sync_logs" to "service_role";

grant trigger on table "public"."sync_logs" to "service_role";

grant truncate on table "public"."sync_logs" to "service_role";

grant update on table "public"."sync_logs" to "service_role";

grant delete on table "public"."sync_status" to "anon";

grant insert on table "public"."sync_status" to "anon";

grant references on table "public"."sync_status" to "anon";

grant select on table "public"."sync_status" to "anon";

grant trigger on table "public"."sync_status" to "anon";

grant truncate on table "public"."sync_status" to "anon";

grant update on table "public"."sync_status" to "anon";

grant delete on table "public"."sync_status" to "authenticated";

grant insert on table "public"."sync_status" to "authenticated";

grant references on table "public"."sync_status" to "authenticated";

grant select on table "public"."sync_status" to "authenticated";

grant trigger on table "public"."sync_status" to "authenticated";

grant truncate on table "public"."sync_status" to "authenticated";

grant update on table "public"."sync_status" to "authenticated";

grant delete on table "public"."sync_status" to "service_role";

grant insert on table "public"."sync_status" to "service_role";

grant references on table "public"."sync_status" to "service_role";

grant select on table "public"."sync_status" to "service_role";

grant trigger on table "public"."sync_status" to "service_role";

grant truncate on table "public"."sync_status" to "service_role";

grant update on table "public"."sync_status" to "service_role";

grant delete on table "public"."team_members" to "anon";

grant insert on table "public"."team_members" to "anon";

grant references on table "public"."team_members" to "anon";

grant select on table "public"."team_members" to "anon";

grant trigger on table "public"."team_members" to "anon";

grant truncate on table "public"."team_members" to "anon";

grant update on table "public"."team_members" to "anon";

grant delete on table "public"."team_members" to "authenticated";

grant insert on table "public"."team_members" to "authenticated";

grant references on table "public"."team_members" to "authenticated";

grant select on table "public"."team_members" to "authenticated";

grant trigger on table "public"."team_members" to "authenticated";

grant truncate on table "public"."team_members" to "authenticated";

grant update on table "public"."team_members" to "authenticated";

grant delete on table "public"."team_members" to "service_role";

grant insert on table "public"."team_members" to "service_role";

grant references on table "public"."team_members" to "service_role";

grant select on table "public"."team_members" to "service_role";

grant trigger on table "public"."team_members" to "service_role";

grant truncate on table "public"."team_members" to "service_role";

grant update on table "public"."team_members" to "service_role";

grant delete on table "public"."teams" to "anon";

grant insert on table "public"."teams" to "anon";

grant references on table "public"."teams" to "anon";

grant select on table "public"."teams" to "anon";

grant trigger on table "public"."teams" to "anon";

grant truncate on table "public"."teams" to "anon";

grant update on table "public"."teams" to "anon";

grant delete on table "public"."teams" to "authenticated";

grant insert on table "public"."teams" to "authenticated";

grant references on table "public"."teams" to "authenticated";

grant select on table "public"."teams" to "authenticated";

grant trigger on table "public"."teams" to "authenticated";

grant truncate on table "public"."teams" to "authenticated";

grant update on table "public"."teams" to "authenticated";

grant delete on table "public"."teams" to "service_role";

grant insert on table "public"."teams" to "service_role";

grant references on table "public"."teams" to "service_role";

grant select on table "public"."teams" to "service_role";

grant trigger on table "public"."teams" to "service_role";

grant truncate on table "public"."teams" to "service_role";

grant update on table "public"."teams" to "service_role";

grant delete on table "public"."user_repositories" to "anon";

grant insert on table "public"."user_repositories" to "anon";

grant references on table "public"."user_repositories" to "anon";

grant select on table "public"."user_repositories" to "anon";

grant trigger on table "public"."user_repositories" to "anon";

grant truncate on table "public"."user_repositories" to "anon";

grant update on table "public"."user_repositories" to "anon";

grant delete on table "public"."user_repositories" to "authenticated";

grant insert on table "public"."user_repositories" to "authenticated";

grant references on table "public"."user_repositories" to "authenticated";

grant select on table "public"."user_repositories" to "authenticated";

grant trigger on table "public"."user_repositories" to "authenticated";

grant truncate on table "public"."user_repositories" to "authenticated";

grant update on table "public"."user_repositories" to "authenticated";

grant delete on table "public"."user_repositories" to "service_role";

grant insert on table "public"."user_repositories" to "service_role";

grant references on table "public"."user_repositories" to "service_role";

grant select on table "public"."user_repositories" to "service_role";

grant trigger on table "public"."user_repositories" to "service_role";

grant truncate on table "public"."user_repositories" to "service_role";

grant update on table "public"."user_repositories" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";

create policy "api_keys_access"
on "public"."api_keys"
as permissive
for all
to public
using (((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = api_keys.team_id) AND (team_members.user_id = auth.uid()) AND (team_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))));


create policy "code_entities_workspace_access"
on "public"."code_entities"
as permissive
for all
to public
using (
CASE
    WHEN (team_id IS NULL) THEN (user_id = api_user_id())
    ELSE (team_id IN ( SELECT team_members.team_id
       FROM team_members
      WHERE (team_members.user_id = api_user_id())))
END);


create policy "Users can create code graphs"
on "public"."code_graphs"
as permissive
for insert
to public
with check ((auth.role() = 'authenticated'::text));


create policy "Users can view code graphs"
on "public"."code_graphs"
as permissive
for select
to public
using ((auth.role() = 'authenticated'::text));


create policy "code_queue_insert"
on "public"."code_queue"
as permissive
for insert
to public
with check (true);


create policy "code_queue_select"
on "public"."code_queue"
as permissive
for select
to public
using (((workspace_id = ('user:'::text || (auth.uid())::text)) OR (workspace_id IN ( SELECT ('team:'::text || (team_members.team_id)::text)
   FROM team_members
  WHERE (team_members.user_id = auth.uid())))));


create policy "code_relationships_workspace_access"
on "public"."code_relationships"
as permissive
for all
to public
using (
CASE
    WHEN (team_id IS NULL) THEN (user_id = api_user_id())
    ELSE (team_id IN ( SELECT team_members.team_id
       FROM team_members
      WHERE (team_members.user_id = api_user_id())))
END);


create policy "Users can view their team's conversations"
on "public"."conversations"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = conversations.team_id) AND (team_members.user_id = auth.uid())))));


create policy "Team members can view their GitHub installations"
on "public"."github_installations"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = github_installations.team_id) AND (team_members.user_id = auth.uid())))));


create policy "Team members can view their team's data"
on "public"."memories"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = memories.team_id) AND (team_members.user_id = auth.uid())))));


create policy "memories_delete_policy_v2"
on "public"."memories"
as permissive
for delete
to public
using (((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = memories.team_id) AND (team_members.user_id = auth.uid()) AND (team_members.role = ANY (ARRAY['admin'::text, 'owner'::text]))))))));


create policy "memories_insert_policy_v2"
on "public"."memories"
as permissive
for insert
to public
with check (((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = memories.team_id) AND (team_members.user_id = auth.uid())))))));


create policy "memories_select_policy_v2"
on "public"."memories"
as permissive
for select
to public
using (((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = memories.team_id) AND (team_members.user_id = auth.uid())))))));


create policy "memories_update_policy_v2"
on "public"."memories"
as permissive
for update
to public
using (((user_id = auth.uid()) OR ((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = memories.team_id) AND (team_members.user_id = auth.uid())))))));


create policy "memories_workspace_access"
on "public"."memories"
as permissive
for all
to public
using (
CASE
    WHEN (team_id IS NULL) THEN (user_id = api_user_id())
    ELSE (team_id IN ( SELECT team_members.team_id
       FROM team_members
      WHERE (team_members.user_id = api_user_id())))
END);


create policy "memory_queue_insert"
on "public"."memory_queue"
as permissive
for insert
to public
with check (true);


create policy "memory_queue_select"
on "public"."memory_queue"
as permissive
for select
to public
using (((workspace_id = ('user:'::text || (auth.uid())::text)) OR (workspace_id IN ( SELECT ('team:'::text || (team_members.team_id)::text)
   FROM team_members
  WHERE (team_members.user_id = auth.uid())))));


create policy "Users can view events for their team's jobs"
on "public"."orchestration_events"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM (orchestration_jobs j
     JOIN team_members tm ON ((tm.team_id = j.team_id)))
  WHERE ((j.id = orchestration_events.job_id) AND (tm.user_id = auth.uid())))));


create policy "Users can cancel their team's orchestration jobs"
on "public"."orchestration_jobs"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = orchestration_jobs.team_id) AND (team_members.user_id = auth.uid()) AND (team_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


create policy "Users can create orchestration jobs for their team"
on "public"."orchestration_jobs"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = orchestration_jobs.team_id) AND (team_members.user_id = auth.uid()) AND (team_members.role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))))));


create policy "Users can view their team's orchestration jobs"
on "public"."orchestration_jobs"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = orchestration_jobs.team_id) AND (team_members.user_id = auth.uid())))));


create policy "processing_status_all"
on "public"."processing_status"
as permissive
for all
to public
using (((workspace_id = ('user:'::text || (auth.uid())::text)) OR (workspace_id IN ( SELECT ('team:'::text || (team_members.team_id)::text)
   FROM team_members
  WHERE (team_members.user_id = auth.uid())))));


create policy "Service role can manage summaries"
on "public"."project_summaries"
as permissive
for all
to public
using ((auth.role() = 'service_role'::text));


create policy "Users can view their workspace summaries"
on "public"."project_summaries"
as permissive
for select
to public
using ((workspace_id = COALESCE(( SELECT team_members.team_id
   FROM team_members
  WHERE (team_members.user_id = auth.uid())
 LIMIT 1), auth.uid())));


create policy "project_summaries_select_policy_v2"
on "public"."project_summaries"
as permissive
for select
to public
using (((workspace_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = project_summaries.workspace_id) AND (team_members.user_id = auth.uid()))))));


create policy "Users can view repository states for their repos"
on "public"."repository_states"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM user_repositories ur
  WHERE ((ur.github_repo_id = repository_states.github_repo_id) AND (ur.user_id = auth.uid())))));


create policy "Service role has full access to sync logs"
on "public"."sync_logs"
as permissive
for all
to service_role
using (true)
with check (true);


create policy "Users can view their own sync logs"
on "public"."sync_logs"
as permissive
for select
to authenticated
using (((workspace = ('user:'::text || (auth.uid())::text)) OR (EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.user_id = auth.uid()) AND (sync_logs.workspace = ('team:'::text || (team_members.team_id)::text)))))));


create policy "team_members_delete"
on "public"."team_members"
as permissive
for delete
to public
using (is_team_admin(team_id, auth.uid()));


create policy "team_members_insert"
on "public"."team_members"
as permissive
for insert
to public
with check ((is_team_admin(team_id, auth.uid()) OR (NOT (EXISTS ( SELECT 1
   FROM team_members tm
  WHERE (tm.team_id = team_members.team_id))))));


create policy "team_members_select"
on "public"."team_members"
as permissive
for select
to public
using (((user_id = auth.uid()) OR is_team_member(team_id, auth.uid())));


create policy "team_members_update"
on "public"."team_members"
as permissive
for update
to public
using (is_team_admin(team_id, auth.uid()));


create policy "Teams can be created by authenticated users"
on "public"."teams"
as permissive
for insert
to public
with check ((auth.uid() IS NOT NULL));


create policy "Teams can be updated by team admins and owners"
on "public"."teams"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = teams.id) AND (team_members.user_id = auth.uid()) AND (team_members.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));


create policy "Users can view teams they belong to"
on "public"."teams"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = teams.id) AND (team_members.user_id = auth.uid())))));


create policy "Users can view repositories they have access to"
on "public"."user_repositories"
as permissive
for select
to public
using ((user_id = auth.uid()));


CREATE TRIGGER update_branch_states_updated_at BEFORE UPDATE ON public.branch_states FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_code_entities_updated_at BEFORE UPDATE ON public.code_entities FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_code_graphs_updated_at BEFORE UPDATE ON public.code_graphs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_code_queue_updated_at BEFORE UPDATE ON public.code_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_memories_updated_at BEFORE UPDATE ON public.memories FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_memory_search_text_trigger BEFORE INSERT OR UPDATE ON public.memories FOR EACH ROW EXECUTE FUNCTION update_memory_search_text();

CREATE TRIGGER update_memory_queue_updated_at BEFORE UPDATE ON public.memory_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orchestration_jobs_updated_at BEFORE UPDATE ON public.orchestration_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_project_summaries_updated_at BEFORE UPDATE ON public.project_summaries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


