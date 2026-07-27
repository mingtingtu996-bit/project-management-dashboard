-- Restore the pre-310 project entity link RLS policy set.

BEGIN;

DROP POLICY IF EXISTS project_entity_links_backend_runtime_policy
  ON public.project_entity_links;

NOTIFY pgrst, 'reload schema';

COMMIT;
