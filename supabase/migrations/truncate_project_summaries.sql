-- Truncate the project_summaries table
-- This will remove all rows but keep the table structure intact

TRUNCATE TABLE project_summaries;

-- If you want to also reset any auto-incrementing sequences (if any), you can use:
-- TRUNCATE TABLE project_summaries RESTART IDENTITY;

-- Note: TRUNCATE is faster than DELETE FROM project_summaries
-- and automatically reclaims disk space