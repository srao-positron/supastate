-- Add last_modified column to code_processing_queue table
ALTER TABLE code_processing_queue 
ADD COLUMN IF NOT EXISTS last_modified TIMESTAMPTZ DEFAULT NOW();

-- Add last_modified column to code_files table if not exists
ALTER TABLE code_files 
ADD COLUMN IF NOT EXISTS last_modified TIMESTAMPTZ DEFAULT NOW();