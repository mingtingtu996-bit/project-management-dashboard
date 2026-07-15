-- Reconcile early task milestone link prerequisites before 023 reads tasks.milestone_id.
-- Later migration 088 backfills from task_milestones and tightens the runtime contract.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS milestone_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'milestones'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_tasks_milestone_id'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT fk_tasks_milestone_id
      FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id
  ON public.tasks(milestone_id)
  WHERE milestone_id IS NOT NULL;
