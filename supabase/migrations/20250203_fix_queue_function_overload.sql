-- Drop the duplicate function with UUID workspace_id parameter
DROP FUNCTION IF EXISTS public.queue_memory_ingestion_job(p_memory_id uuid, p_user_id uuid, p_content text, p_workspace_id uuid, p_metadata jsonb);

-- Also drop any duplicate pattern detection functions
DROP FUNCTION IF EXISTS public.queue_pattern_detection_job(p_batch_id uuid, p_pattern_types text[], p_limit integer);

-- The remaining functions use text for workspace_id which is correct