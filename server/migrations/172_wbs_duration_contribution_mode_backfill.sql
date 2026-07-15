-- 172_wbs_duration_contribution_mode_backfill.sql
-- Schema support for WBS duration contribution mode.
--
-- Runtime writes infer and persist duration_contribution_mode in
-- taskWriteChainService. This migration deliberately avoids SQL-level business
-- defaults so the database does not become a second inference source.

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS duration_contribution_mode TEXT;

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_duration_contribution_mode_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_duration_contribution_mode_check
  CHECK (
    duration_contribution_mode IS NULL
    OR duration_contribution_mode IN (
      'duration_bearing',
      'embedded_check',
      'quality_gate',
      'external_wait',
      'record_only',
      'handover_marker'
    )
  );

CREATE INDEX IF NOT EXISTS idx_tasks_duration_contribution_mode
  ON tasks(project_id, duration_contribution_mode);

COMMENT ON COLUMN tasks.duration_contribution_mode IS
  'WBS schedule-duration contribution mode. Runtime defaults are inferred by taskWriteChainService, not by database migration SQL.';

COMMIT;
