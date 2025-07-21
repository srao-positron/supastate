-- Create tables for code graph visualization

-- Table to store analyzed code graphs
CREATE TABLE IF NOT EXISTS code_graphs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  data JSONB NOT NULL,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to store code relationships
CREATE TABLE IF NOT EXISTS code_relationships (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('calls', 'imports', 'extends', 'implements')),
  count INTEGER DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_code_graphs_repository ON code_graphs(repository);
CREATE INDEX idx_code_graphs_branch ON code_graphs(branch);
CREATE INDEX idx_code_graphs_analyzed_at ON code_graphs(analyzed_at DESC);

CREATE INDEX idx_code_relationships_source ON code_relationships(source);
CREATE INDEX idx_code_relationships_target ON code_relationships(target);
CREATE INDEX idx_code_relationships_type ON code_relationships(type);

-- Add code entity type to memories
ALTER TABLE memories 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'general';

-- Create index for type-based queries
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for code_graphs table
CREATE TRIGGER update_code_graphs_updated_at
BEFORE UPDATE ON code_graphs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS policies for code_graphs
ALTER TABLE code_graphs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read code graphs
CREATE POLICY "Users can view code graphs" ON code_graphs
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to create code graphs
CREATE POLICY "Users can create code graphs" ON code_graphs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- RLS policies for code_relationships
ALTER TABLE code_relationships ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read relationships
CREATE POLICY "Users can view code relationships" ON code_relationships
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to create relationships
CREATE POLICY "Users can create code relationships" ON code_relationships
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');