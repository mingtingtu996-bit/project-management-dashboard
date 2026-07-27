-- Reconcile project template flag before migration 038 creates RLS policies over it.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_projects_is_template
  ON public.projects(is_template)
  WHERE is_template = TRUE;
