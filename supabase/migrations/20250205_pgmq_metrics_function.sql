-- Create a wrapper function for pgmq.metrics to expose it through PostgREST
CREATE OR REPLACE FUNCTION public.pgmq_metrics(p_queue_name text)
RETURNS TABLE (
    queue_name text,
    queue_length bigint,
    newest_msg_age_sec integer,
    oldest_msg_age_sec integer,
    total_messages bigint,
    scrape_time timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.queue_name::text,
        m.queue_length,
        m.newest_msg_age_sec,
        m.oldest_msg_age_sec,
        m.total_messages,
        m.scrape_time
    FROM pgmq.metrics(p_queue_name) m;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.pgmq_metrics(text) TO anon;
GRANT EXECUTE ON FUNCTION public.pgmq_metrics(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pgmq_metrics(text) TO service_role;