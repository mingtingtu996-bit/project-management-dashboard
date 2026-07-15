-- 173_v14221_project_metadata_column.sql
-- v1.4.22.1 project wizard persists draft and modeling metadata on projects.metadata.

BEGIN;

ALTER TABLE IF EXISTS public.projects
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.projects
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

COMMENT ON COLUMN public.projects.metadata IS
  'Project modeling metadata for v1.4.22.1 wizard drafts, recommendations, features, and onboarding state.';

COMMIT;

NOTIFY pgrst, 'reload schema';
