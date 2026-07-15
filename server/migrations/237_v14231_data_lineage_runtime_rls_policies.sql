-- v1.4.23.1 C-18.L09 follow-up: wizard task creation records
-- template-node -> task lineage inside the task write transaction. Backend
-- runtime must be able to read lineage rules and write lineage facts under RLS.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_entity_types TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_relation_rules TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_lineage_links TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_lineage_events TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_lineage_batches TO workbuddy_runtime';
  END IF;
END $$;

ALTER TABLE public.data_lineage_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_lineage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_lineage_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_lineage_links_backend_runtime_policy ON public.data_lineage_links;
CREATE POLICY data_lineage_links_backend_runtime_policy ON public.data_lineage_links
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

DROP POLICY IF EXISTS data_lineage_events_backend_runtime_policy ON public.data_lineage_events;
CREATE POLICY data_lineage_events_backend_runtime_policy ON public.data_lineage_events
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

DROP POLICY IF EXISTS data_lineage_batches_backend_runtime_policy ON public.data_lineage_batches;
CREATE POLICY data_lineage_batches_backend_runtime_policy ON public.data_lineage_batches
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

COMMIT;
