-- Index backing the retention purge in the cron sweep.
--
-- Runs are deleted a fixed window after `start_ts`, falling back to `created_at`
-- for the ones whose start time we could never parse. Indexing that exact
-- expression means the purge seeks to the doomed rows instead of scanning every
-- group in the table on each invocation.
CREATE INDEX IF NOT EXISTS idx_mplus_groups_retention ON mplus_groups (COALESCE(start_ts, created_at));
