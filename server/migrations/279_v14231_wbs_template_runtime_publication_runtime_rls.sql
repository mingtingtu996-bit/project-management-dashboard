-- v1.4.23.1 default master-plan WBS template runtime backend role RLS closeout.
-- This grants the backend runtime role access to governed WBS template runtime
-- publication records. It does not grant access to templates, tasks, baselines,
-- task_dependencies, or seed runtime.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_publications TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_events TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS wbs_template_runtime_publications_backend_runtime
  ON public.wbs_template_runtime_publications;
CREATE POLICY wbs_template_runtime_publications_backend_runtime
  ON public.wbs_template_runtime_publications
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

DROP POLICY IF EXISTS wbs_template_runtime_events_backend_runtime
  ON public.wbs_template_runtime_events;
CREATE POLICY wbs_template_runtime_events_backend_runtime
  ON public.wbs_template_runtime_events
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

COMMENT ON POLICY wbs_template_runtime_publications_backend_runtime
  ON public.wbs_template_runtime_publications IS
  'Allows the backend runtime role to consume and maintain governed WBS template runtime publication records, including default master-plan runtime publications; does not grant access to templates, tasks, baselines, task_dependencies, or seed runtime.';

COMMENT ON POLICY wbs_template_runtime_events_backend_runtime
  ON public.wbs_template_runtime_events IS
  'Allows the backend runtime role to consume and maintain governed WBS template runtime publication event records without granting access to templates, tasks, baselines, task_dependencies, or seed runtime.';

NOTIFY pgrst, 'reload schema';

COMMIT;
