-- Clear all data from Supabase (preserving users, teams, workspaces)
-- Usage: PGPASSWORD=<password> psql -h <host> -U postgres -d postgres -f scripts/clear-all-data.sql

-- Disable triggers for faster truncation
SET session_replication_role = replica;

-- List of tables to truncate
DO $$
DECLARE
    tables_to_clear text[] := ARRAY[
        -- Memory related
        'memories', 'memory_queue', 'memory_embeddings', 'memory_cache',
        'processed_memories', 'memory_chunks', 'memory_sessions',
        
        -- Code related
        'code_files', 'code_entities', 'code_queue', 'code_chunks',
        'code_sessions', 'code_processing_queue', 'code_processing_tasks',
        'code_embeddings', 'code_cache', 'code_relationships',
        
        -- Pattern related
        'patterns', 'pattern_processor_logs', 'pattern_detection_queue',
        'pattern_detection_history', 'pattern_cache', 'pattern_checkpoints',
        
        -- Embedding related
        'embeddings', 'embedding_queue', 'embedding_processed', 'embedding_cache',
        
        -- Other processing
        'chunk_tracking', 'processing_sessions', 'processing_checkpoints',
        'ingestion_cache', 'session_tracking', 'task_queue', 'job_queue'
    ];
    tbl_name text;
BEGIN
    -- Truncate each table if it exists
    FOREACH tbl_name IN ARRAY tables_to_clear LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables t
            WHERE t.table_schema = 'public' 
            AND t.table_name = tbl_name
        ) THEN
            EXECUTE format('TRUNCATE TABLE %I CASCADE', tbl_name);
            RAISE NOTICE 'Truncated table: %', tbl_name;
        END IF;
    END LOOP;
END $$;

-- Clear pgmq queues
DO $$ 
BEGIN
    -- Check if pgmq schema exists
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgmq') THEN
        -- Purge queues if they exist
        IF EXISTS (SELECT 1 FROM pgmq.q_memory_ingestion LIMIT 1) THEN
            PERFORM pgmq.purge_queue('memory_ingestion');
            RAISE NOTICE 'Purged queue: memory_ingestion';
        END IF;
        
        IF EXISTS (SELECT 1 FROM pgmq.q_pattern_detection LIMIT 1) THEN
            PERFORM pgmq.purge_queue('pattern_detection');
            RAISE NOTICE 'Purged queue: pattern_detection';
        END IF;
        
        IF EXISTS (SELECT 1 FROM pgmq.q_code_ingestion LIMIT 1) THEN
            PERFORM pgmq.purge_queue('code_ingestion');
            RAISE NOTICE 'Purged queue: code_ingestion';
        END IF;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not purge queues: %', SQLERRM;
END $$;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Display summary
DO $$
DECLARE
    table_counts record;
    total_count bigint := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Data Clear Summary ===';
    
    -- Check key tables
    FOR table_counts IN 
        SELECT 'memories' as tbl, COUNT(*) as cnt FROM memories
        UNION ALL
        SELECT 'code_entities', COUNT(*) FROM code_entities
        UNION ALL
        SELECT 'code_files', COUNT(*) FROM code_files
        UNION ALL
        SELECT 'pattern_processor_logs', COUNT(*) FROM pattern_processor_logs
    LOOP
        RAISE NOTICE '  %: % records', table_counts.tbl, table_counts.cnt;
        total_count := total_count + table_counts.cnt;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Total records remaining: %', total_count;
    RAISE NOTICE '';
    RAISE NOTICE '✅ Supabase data cleared successfully!';
    RAISE NOTICE '';
    RAISE NOTICE 'Run this command next to clear Neo4j data:';
    RAISE NOTICE '  npx tsx scripts/clear-neo4j-data.ts';
END $$;