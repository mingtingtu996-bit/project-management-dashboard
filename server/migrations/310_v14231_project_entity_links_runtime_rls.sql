-- Allow the low-privilege backend runtime role to maintain the polymorphic
-- links written by normal project workflows. Browser-facing policies remain
-- unchanged; application services must still scope every operation by project.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 310';
  END IF;
END
$$;

ALTER TABLE public.project_entity_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_entity_links TO workbuddy_runtime;

DROP POLICY IF EXISTS project_entity_links_backend_runtime_policy
  ON public.project_entity_links;
CREATE POLICY project_entity_links_backend_runtime_policy
  ON public.project_entity_links
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON POLICY project_entity_links_backend_runtime_policy
  ON public.project_entity_links IS
  'Backend runtime maintains project-scoped polymorphic links; browser-facing access remains governed by existing membership policies.';

NOTIFY pgrst, 'reload schema';

COMMIT;
