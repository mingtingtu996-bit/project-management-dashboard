BEGIN;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS milestone_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'task_milestones'
  ) THEN
    WITH ranked_links AS (
      SELECT
        task_id,
        milestone_id,
        ROW_NUMBER() OVER (
          PARTITION BY task_id
          ORDER BY created_at ASC NULLS LAST, milestone_id ASC
        ) AS row_rank
      FROM public.task_milestones
      WHERE milestone_id IS NOT NULL
    )
    UPDATE public.tasks AS task_row
    SET milestone_id = ranked_links.milestone_id
    FROM ranked_links
    WHERE task_row.id = ranked_links.task_id
      AND task_row.milestone_id IS NULL
      AND ranked_links.row_rank = 1;
  END IF;
END
$$;

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

NOTIFY pgrst, 'reload schema';

COMMIT;
