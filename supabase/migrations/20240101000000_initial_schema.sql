-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settings JSONB DEFAULT '{}',
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise'))
);

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team membership
CREATE TABLE team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- API Keys for machine-to-machine auth
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL, -- Store bcrypt hash of the key
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Conversation memories from Camille
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_name TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI ada-002 embeddings
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, chunk_id)
);

-- Memory search index for performance
CREATE INDEX memories_embedding_idx ON memories 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX memories_team_project_idx ON memories(team_id, project_name);
CREATE INDEX memories_created_idx ON memories(created_at DESC);

-- Code entities (nodes from Camille's graph)
CREATE TABLE code_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('function', 'class', 'module', 'interface', 'type', 'constant')),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  signature TEXT,
  docstring TEXT,
  source_code TEXT,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, project_name, file_path, name, entity_type)
);

-- Code entity search indexes
CREATE INDEX code_entities_embedding_idx ON code_entities 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX code_entities_team_project_idx ON code_entities(team_id, project_name);
CREATE INDEX code_entities_type_idx ON code_entities(entity_type);
CREATE INDEX code_entities_name_idx ON code_entities(name);

-- Code relationships (edges from Camille's graph)
CREATE TABLE code_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  source_id UUID REFERENCES code_entities(id) ON DELETE CASCADE,
  target_id UUID REFERENCES code_entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('calls', 'imports', 'extends', 'implements', 'uses', 'references')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, target_id, relationship_type)
);

-- Relationship indexes for graph traversal
CREATE INDEX code_relationships_source_idx ON code_relationships(source_id, relationship_type);
CREATE INDEX code_relationships_target_idx ON code_relationships(target_id, relationship_type);
CREATE INDEX code_relationships_team_project_idx ON code_relationships(team_id, project_name);

-- Review sessions for multi-agent PR reviews
CREATE TABLE review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  pr_url TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  repository TEXT NOT NULL,
  pr_metadata JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  orchestration_id TEXT, -- External orchestration system ID
  result JSONB, -- Final review result
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Review session indexes
CREATE INDEX review_sessions_team_idx ON review_sessions(team_id);
CREATE INDEX review_sessions_status_idx ON review_sessions(status);
CREATE INDEX review_sessions_pr_idx ON review_sessions(repository, pr_number);

-- Review agents participating in sessions
CREATE TABLE review_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES review_sessions(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  agent_role TEXT NOT NULL,
  agent_prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-4-turbo-preview',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review events for real-time tracking
CREATE TABLE review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES review_sessions(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES review_agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'status_update', 'tool_call', 'tool_result', 'thinking', 
    'agent_thought', 'discussion_turn', 'review_comment',
    'final_verdict', 'error'
  )),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event indexes for real-time queries
CREATE INDEX review_events_session_idx ON review_events(session_id, created_at);
CREATE INDEX review_events_type_idx ON review_events(event_type);

-- Projects metadata
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  repository_url TEXT,
  description TEXT,
  settings JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, name)
);

-- Sync status tracking
CREATE TABLE sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('memory', 'graph', 'full')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  stats JSONB DEFAULT '{}'
);

-- Row Level Security (RLS) Policies
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies for team-based access
CREATE POLICY "Users can view teams they belong to" ON teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = teams.id 
      AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can view their team's data" ON memories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = memories.team_id 
      AND team_members.user_id = auth.uid()
    )
  );

-- Similar policies for other tables...

-- Functions for common operations
CREATE OR REPLACE FUNCTION search_memories(
  p_team_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 10,
  p_project_filter TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  chunk_id TEXT,
  content TEXT,
  project_name TEXT,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
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
$$;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_memories_updated_at BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_code_entities_updated_at BEFORE UPDATE ON code_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();