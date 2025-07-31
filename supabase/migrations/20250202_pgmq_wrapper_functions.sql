-- Create wrapper functions for pgmq operations to expose them through PostgREST

-- Function to read messages from a queue
CREATE OR REPLACE FUNCTION public.pgmq_read(
    queue_name text,
    vt integer DEFAULT 30,
    qty integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT to_jsonb(array_agg(row_to_json(t))) 
    INTO result
    FROM pgmq.read(queue_name, vt, qty) t;
    
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Function to delete a message from a queue
CREATE OR REPLACE FUNCTION public.pgmq_delete(
    queue_name text,
    msg_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN pgmq.delete(queue_name, msg_id);
END;
$$;

-- Function to archive a message (move to DLQ)
CREATE OR REPLACE FUNCTION public.pgmq_archive(
    queue_name text,
    msg_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN pgmq.archive(queue_name, msg_id);
END;
$$;

-- Function to send a message to a queue
CREATE OR REPLACE FUNCTION public.pgmq_send(
    queue_name text,
    msg jsonb,
    delay integer DEFAULT 0
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    msg_id bigint;
BEGIN
    SELECT pgmq.send(queue_name, msg, delay) INTO msg_id;
    RETURN msg_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.pgmq_read TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_delete TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_archive TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_send TO service_role, authenticated;

-- Fix the queue functions to use TEXT for workspace_id
CREATE OR REPLACE FUNCTION public.queue_pattern_detection_job(
    p_batch_id UUID DEFAULT gen_random_uuid(),
    p_pattern_types TEXT[] DEFAULT ARRAY['debugging', 'learning', 'refactoring', 'temporal', 'semantic', 'memory_code'],
    p_limit INT DEFAULT 100,
    p_workspace_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    msg_id BIGINT;
BEGIN
    SELECT pgmq.send(
        'pattern_detection',
        json_build_object(
            'batch_id', p_batch_id,
            'pattern_types', p_pattern_types,
            'limit', p_limit,
            'workspace_id', p_workspace_id,
            'created_at', now()
        )::jsonb
    ) INTO msg_id;
    
    RETURN msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_memory_ingestion_job(
    p_memory_id UUID,
    p_user_id UUID,
    p_content TEXT,
    p_workspace_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    msg_id BIGINT;
BEGIN
    SELECT pgmq.send(
        'memory_ingestion',
        json_build_object(
            'type', 'memory',
            'memory_id', p_memory_id,
            'user_id', p_user_id,
            'workspace_id', p_workspace_id,
            'content', p_content,
            'metadata', p_metadata,
            'created_at', now()
        )::jsonb
    ) INTO msg_id;
    
    RETURN msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_code_ingestion_job(
    p_code_entity_id UUID,
    p_user_id UUID,
    p_workspace_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    msg_id BIGINT;
BEGIN
    SELECT pgmq.send(
        'code_ingestion',
        json_build_object(
            'type', 'code',
            'code_entity_id', p_code_entity_id,
            'user_id', p_user_id,
            'workspace_id', p_workspace_id,
            'metadata', p_metadata,
            'created_at', now()
        )::jsonb
    ) INTO msg_id;
    
    RETURN msg_id;
END;
$$;

-- Grant permissions (functions already exist, so just update permissions)
GRANT EXECUTE ON FUNCTION public.queue_pattern_detection_job(UUID, TEXT[], INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.queue_memory_ingestion_job(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.queue_code_ingestion_job(UUID, UUID, TEXT, JSONB) TO authenticated, service_role;