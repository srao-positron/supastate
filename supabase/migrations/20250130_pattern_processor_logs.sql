-- Create table for pattern processor audit logs
CREATE TABLE IF NOT EXISTS pattern_processor_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID,
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    function_name TEXT,
    pattern_type TEXT,
    entity_count INTEGER,
    error_stack TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pattern_processor_logs_batch_id ON pattern_processor_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_pattern_processor_logs_created_at ON pattern_processor_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_processor_logs_level ON pattern_processor_logs(level);
CREATE INDEX IF NOT EXISTS idx_pattern_processor_logs_function_name ON pattern_processor_logs(function_name);

-- Create RLS policies
ALTER TABLE pattern_processor_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert/read logs
CREATE POLICY "Service role can manage logs" ON pattern_processor_logs
    FOR ALL 
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Allow authenticated users to read logs (for debugging)
CREATE POLICY "Authenticated users can read logs" ON pattern_processor_logs
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Create a view for recent errors
CREATE OR REPLACE VIEW recent_pattern_errors AS
SELECT 
    id,
    batch_id,
    message,
    details,
    function_name,
    error_stack,
    created_at
FROM pattern_processor_logs
WHERE level = 'error'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;