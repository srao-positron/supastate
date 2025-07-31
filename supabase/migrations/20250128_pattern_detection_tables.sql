-- Create pattern detection queue table
CREATE TABLE IF NOT EXISTS pattern_detection_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('memory', 'code')),
  workspace_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  priority FLOAT DEFAULT 0.5,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for efficient queue processing
CREATE INDEX idx_pattern_queue_status ON pattern_detection_queue(status, priority DESC, created_at);
CREATE INDEX idx_pattern_queue_workspace ON pattern_detection_queue(workspace_id, project_name);
CREATE INDEX idx_pattern_queue_entity ON pattern_detection_queue(entity_id, entity_type);

-- Create pattern results table
CREATE TABLE IF NOT EXISTS discovered_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id TEXT NOT NULL UNIQUE,
  pattern_type TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  description TEXT,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  frequency INTEGER DEFAULT 1,
  stability FLOAT DEFAULT 0.5,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('user', 'project', 'team', 'global', 'session', 'analysis')),
  scope_id TEXT NOT NULL,
  workspace_id TEXT,
  user_id UUID,
  team_id UUID,
  metadata JSONB DEFAULT '{}',
  first_detected TIMESTAMPTZ DEFAULT now(),
  last_validated TIMESTAMPTZ DEFAULT now(),
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for pattern queries
CREATE INDEX idx_patterns_scope ON discovered_patterns(scope_type, scope_id);
CREATE INDEX idx_patterns_type ON discovered_patterns(pattern_type, confidence DESC);
CREATE INDEX idx_patterns_workspace ON discovered_patterns(workspace_id);
CREATE INDEX idx_patterns_user ON discovered_patterns(user_id);
CREATE INDEX idx_patterns_team ON discovered_patterns(team_id);
CREATE INDEX idx_patterns_validation ON discovered_patterns(last_validated, confidence);

-- Create pattern evidence table
CREATE TABLE IF NOT EXISTS pattern_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES discovered_patterns(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('memory', 'code', 'session')),
  confidence FLOAT DEFAULT 0.5,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_evidence_pattern ON pattern_evidence(pattern_id);
CREATE INDEX idx_evidence_entity ON pattern_evidence(entity_id, entity_type);

-- Create pattern notifications table
CREATE TABLE IF NOT EXISTS pattern_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES discovered_patterns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('new_pattern', 'pattern_evolution', 'insight', 'recommendation')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON pattern_notifications(user_id, read, created_at DESC);
CREATE INDEX idx_notifications_pattern ON pattern_notifications(pattern_id);

-- Create RLS policies
ALTER TABLE pattern_detection_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_notifications ENABLE ROW LEVEL SECURITY;

-- Pattern detection queue policies (service role only)
CREATE POLICY "Service role can manage pattern queue" 
  ON pattern_detection_queue 
  FOR ALL 
  TO service_role 
  USING (true);

-- Discovered patterns policies
-- Note: This simplified policy doesn't check team membership
-- Update this when team_members table is available
CREATE POLICY "Users can view their own patterns" 
  ON discovered_patterns 
  FOR SELECT 
  TO authenticated 
  USING (
    user_id = auth.uid() 
    OR scope_type = 'global'
  );

CREATE POLICY "Service role can manage patterns" 
  ON discovered_patterns 
  FOR ALL 
  TO service_role 
  USING (true);

-- Pattern evidence policies
-- Note: This simplified policy doesn't check team membership
-- Update this when team_members table is available
CREATE POLICY "Users can view evidence for their patterns" 
  ON pattern_evidence 
  FOR SELECT 
  TO authenticated 
  USING (
    pattern_id IN (
      SELECT id FROM discovered_patterns 
      WHERE user_id = auth.uid() 
        OR scope_type = 'global'
    )
  );

CREATE POLICY "Service role can manage evidence" 
  ON pattern_evidence 
  FOR ALL 
  TO service_role 
  USING (true);

-- Pattern notifications policies
CREATE POLICY "Users can view their own notifications" 
  ON pattern_notifications 
  FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" 
  ON pattern_notifications 
  FOR UPDATE 
  TO authenticated 
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can manage notifications" 
  ON pattern_notifications 
  FOR ALL 
  TO service_role 
  USING (true);

-- Create functions for pattern management
CREATE OR REPLACE FUNCTION update_pattern_confidence(
  p_pattern_id UUID,
  p_confidence_delta FLOAT
) RETURNS void AS $$
BEGIN
  UPDATE discovered_patterns
  SET confidence = LEAST(GREATEST(confidence + p_confidence_delta, 0), 1),
      last_validated = now(),
      updated_at = now()
  WHERE id = p_pattern_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean old queue items
CREATE OR REPLACE FUNCTION clean_pattern_queue() RETURNS void AS $$
BEGIN
  DELETE FROM pattern_detection_queue
  WHERE status = 'completed' 
    AND processed_at < now() - INTERVAL '7 days';
    
  DELETE FROM pattern_detection_queue
  WHERE status = 'failed' 
    AND retry_count > 3
    AND updated_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pattern_queue_updated_at
  BEFORE UPDATE ON pattern_detection_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_patterns_updated_at
  BEFORE UPDATE ON discovered_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Add comments
COMMENT ON TABLE pattern_detection_queue IS 'Queue for background pattern detection processing';
COMMENT ON TABLE discovered_patterns IS 'Stores discovered patterns from the knowledge graph';
COMMENT ON TABLE pattern_evidence IS 'Links patterns to supporting evidence (entities)';
COMMENT ON TABLE pattern_notifications IS 'User notifications about discovered patterns';