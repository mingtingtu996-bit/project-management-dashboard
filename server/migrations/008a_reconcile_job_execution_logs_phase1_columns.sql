-- Reconcile job_execution_logs columns required by 009 on fresh database replay.

ALTER TABLE job_execution_logs
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result JSONB,
  ADD COLUMN IF NOT EXISTS job_id TEXT,
  ADD COLUMN IF NOT EXISTS triggered_by TEXT;

UPDATE job_execution_logs
   SET completed_at = finished_at
 WHERE completed_at IS NULL
   AND finished_at IS NOT NULL;
