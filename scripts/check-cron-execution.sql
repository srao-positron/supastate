-- Check the last execution time of our cron jobs
SELECT 
    j.jobname,
    j.schedule,
    j.active,
    js.start_time,
    js.end_time,
    js.status,
    js.return_message,
    CASE 
        WHEN js.status = 'succeeded' THEN '✅'
        WHEN js.status = 'failed' THEN '❌'
        WHEN js.status = 'running' THEN '🔄'
        ELSE '❓'
    END as status_icon
FROM cron.job j
LEFT JOIN cron.job_run_details js ON j.jobid = js.jobid
WHERE j.jobname LIKE '%worker%' 
   OR j.jobname LIKE '%memory%'
   OR j.jobname LIKE '%pattern%'
   OR j.jobname LIKE '%code%'
ORDER BY js.start_time DESC
LIMIT 20;