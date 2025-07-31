-- Create helper functions to manage cron jobs through PostgREST

-- Function to list all cron jobs
CREATE OR REPLACE FUNCTION public.list_cron_jobs()
RETURNS TABLE (
  jobid bigint,
  schedule text,
  command text,
  nodename text,
  nodeport integer,
  database text,
  username text,
  active boolean,
  jobname text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = cron, public
AS $$
  SELECT jobid, schedule, command, nodename, nodeport, database, username, active, jobname
  FROM cron.job
  ORDER BY jobid;
$$;

-- Function to get cron job details by name
CREATE OR REPLACE FUNCTION public.get_cron_job(p_jobname text)
RETURNS TABLE (
  jobid bigint,
  schedule text,
  command text,
  active boolean,
  jobname text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = cron, public
AS $$
  SELECT jobid, schedule, command, active, jobname
  FROM cron.job
  WHERE jobname = p_jobname;
$$;

-- Function to schedule or update a cron job
CREATE OR REPLACE FUNCTION public.schedule_cron_job(
  p_jobname text,
  p_schedule text,
  p_command text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cron, public
AS $$
DECLARE
  v_jobid bigint;
BEGIN
  -- First unschedule if exists
  PERFORM cron.unschedule(p_jobname);
  
  -- Schedule new job
  SELECT cron.schedule(p_jobname, p_schedule, p_command) INTO v_jobid;
  
  RETURN v_jobid;
END;
$$;

-- Function to unschedule a cron job
CREATE OR REPLACE FUNCTION public.unschedule_cron_job(p_jobname text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cron, public
AS $$
BEGIN
  PERFORM cron.unschedule(p_jobname);
  RETURN true;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.list_cron_jobs() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_job(text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_cron_job(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unschedule_cron_job(text) TO service_role;

-- Create a view for active cron jobs
CREATE OR REPLACE VIEW public.active_cron_jobs AS
SELECT 
  jobid,
  jobname,
  schedule,
  CASE 
    WHEN command LIKE '%memory-ingestion-worker%' THEN 'Memory Ingestion Worker'
    WHEN command LIKE '%pattern-detection-worker%' THEN 'Pattern Detection Worker'
    WHEN command LIKE '%code-ingestion-worker%' THEN 'Code Ingestion Worker'
    WHEN command LIKE '%process-pattern-queue%' THEN 'Old Pattern Processor'
    ELSE 'Other'
  END as job_type,
  active
FROM cron.job
WHERE active = true;

-- Grant access to the view
GRANT SELECT ON public.active_cron_jobs TO authenticated, service_role;