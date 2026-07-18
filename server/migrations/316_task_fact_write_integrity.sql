-- 316: Make the application task write chain the sole progress snapshot writer
-- and persist task-reconcile rollback execution state.

BEGIN;

DROP TRIGGER IF EXISTS trigger_auto_record_snapshot ON public.tasks;
DROP FUNCTION IF EXISTS public.auto_record_progress_snapshot();

ALTER TABLE public.task_reconcile_backups
  ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rolled_back_by UUID,
  ADD COLUMN IF NOT EXISTS rollback_result JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_task_reconcile_backups_rollback_state
  ON public.task_reconcile_backups(project_id, reconcile_batch_id, rolled_back_at);

COMMENT ON COLUMN public.task_reconcile_backups.rolled_back_at IS
  'Timestamp of the first successful atomic reconcile rollback.';
COMMENT ON COLUMN public.task_reconcile_backups.rolled_back_by IS
  'Actor that executed the first successful atomic reconcile rollback.';
COMMENT ON COLUMN public.task_reconcile_backups.rollback_result IS
  'Counts and outcome metadata from the atomic reconcile rollback.';

COMMIT;
