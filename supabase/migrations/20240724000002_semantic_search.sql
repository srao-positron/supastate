-- Semantic search migration already applied to production
-- This is a placeholder to keep migrations in sync

-- The following objects already exist in production:
-- - pgvector extension
-- - match_memories function for semantic search
-- - hybrid_search_memories function for combined semantic + text search
-- Note: Index creation was skipped due to 3072 dimension limit in pgvector indexes