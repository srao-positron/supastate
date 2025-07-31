-- Create update_updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create table to track processing checkpoints
CREATE TABLE IF NOT EXISTS pattern_processing_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_type TEXT NOT NULL UNIQUE,
  last_processed_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01'::timestamptz,
  processed_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add index for checkpoint lookups
CREATE INDEX idx_checkpoint_type ON pattern_processing_checkpoints(checkpoint_type);

-- RLS policies
ALTER TABLE pattern_processing_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage checkpoints" 
  ON pattern_processing_checkpoints 
  FOR ALL 
  TO service_role 
  USING (true);

-- Initial checkpoints
INSERT INTO pattern_processing_checkpoints (checkpoint_type, last_processed_at)
VALUES 
  ('memory_summaries', '1970-01-01'::timestamptz),
  ('code_summaries', '1970-01-01'::timestamptz),
  ('pattern_detection', '1970-01-01'::timestamptz)
ON CONFLICT (checkpoint_type) DO NOTHING;

-- Update trigger
CREATE TRIGGER update_checkpoints_updated_at
  BEFORE UPDATE ON pattern_processing_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE pattern_processing_checkpoints IS 'Tracks processing progress to avoid reprocessing data';