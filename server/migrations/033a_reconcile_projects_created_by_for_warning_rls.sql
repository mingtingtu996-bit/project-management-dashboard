-- Reconcile early project ownership alias required by warning RLS policies.
-- Migration 034 references projects.created_by before later ownership migrations run.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'owner_id'
  ) THEN
    EXECUTE 'UPDATE public.projects SET created_by = COALESCE(created_by, owner_id) WHERE created_by IS NULL';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_projects_created_by
  ON public.projects(created_by)
  WHERE created_by IS NOT NULL;
