-- Project baseline business version semantics.
-- Draft/revising rows are editable working copies and must not consume a business vN.
-- Frozen rows keep unique vN per project.

ALTER TABLE public.task_baselines
  ALTER COLUMN version DROP NOT NULL,
  ALTER COLUMN version DROP DEFAULT;

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.task_baselines'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%project_id%'
      AND pg_get_constraintdef(oid) ILIKE '%version%'
  LOOP
    EXECUTE format('ALTER TABLE public.task_baselines DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_baselines_project_business_version
  ON public.task_baselines(project_id, version)
  WHERE version IS NOT NULL;

UPDATE public.task_baselines
SET version = NULL
WHERE status IN ('draft', 'revising');

COMMENT ON COLUMN public.task_baselines.version IS
  'Business baseline version. NULL for draft/revising rows; assigned only when frozen/confirmed.';
