-- v1.4.23.1 migration governance closeout follow-up.
--
-- This forward migration keeps the audited 214/246 ledger rows immutable while
-- aligning the live catalog with the canonical schema-drift contract:
-- 1) widen recommendation_actions constraints to the current product domain;
-- 2) re-state the Advisor RLS policies as static DDL so drift parsing and live
--    catalog readback share the same policy surface.

BEGIN;

ALTER TABLE public.recommendation_actions
  DROP CONSTRAINT IF EXISTS recommendation_actions_action_type_check;

ALTER TABLE public.recommendation_actions
  ADD CONSTRAINT recommendation_actions_action_type_check
  CHECK (action_type IN ('adopted', 'declined'));

ALTER TABLE public.recommendation_actions
  DROP CONSTRAINT IF EXISTS recommendation_actions_recommendation_kind_check;

ALTER TABLE public.recommendation_actions
  ADD CONSTRAINT recommendation_actions_recommendation_kind_check
  CHECK (recommendation_kind IN ('schedule_acceleration', 'construction_organization_plan_network'));

ALTER TABLE IF EXISTS public.project_key_node_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_key_node_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_constraint_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_constraint_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_entity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_entity_types FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_relation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_relation_rules FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_key_node_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_key_node_snapshots TO workbuddy_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_constraint_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_constraint_snapshots TO workbuddy_runtime;
GRANT SELECT ON TABLE public.data_lineage_entity_types TO authenticated;
GRANT SELECT ON TABLE public.data_lineage_entity_types TO workbuddy_runtime;
GRANT SELECT ON TABLE public.data_lineage_relation_rules TO authenticated;
GRANT SELECT ON TABLE public.data_lineage_relation_rules TO workbuddy_runtime;

DROP POLICY IF EXISTS project_key_node_snapshots_auth_read_policy
  ON public.project_key_node_snapshots;
CREATE POLICY project_key_node_snapshots_auth_read_policy
  ON public.project_key_node_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_key_node_snapshots.project_id
        AND public.is_active_company_member(p.company_id, NULL::TEXT[])
    )
  );

DROP POLICY IF EXISTS project_key_node_snapshots_auth_write_policy
  ON public.project_key_node_snapshots;
CREATE POLICY project_key_node_snapshots_auth_write_policy
  ON public.project_key_node_snapshots
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_key_node_snapshots.project_id
        AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_key_node_snapshots.project_id
        AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    )
  );

DROP POLICY IF EXISTS project_key_node_snapshots_backend_runtime_policy
  ON public.project_key_node_snapshots;
CREATE POLICY project_key_node_snapshots_backend_runtime_policy
  ON public.project_key_node_snapshots
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

DROP POLICY IF EXISTS task_constraint_snapshots_auth_read_policy
  ON public.task_constraint_snapshots;
CREATE POLICY task_constraint_snapshots_auth_read_policy
  ON public.task_constraint_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = task_constraint_snapshots.project_id
        AND public.is_active_company_member(p.company_id, NULL::TEXT[])
    )
  );

DROP POLICY IF EXISTS task_constraint_snapshots_auth_write_policy
  ON public.task_constraint_snapshots;
CREATE POLICY task_constraint_snapshots_auth_write_policy
  ON public.task_constraint_snapshots
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = task_constraint_snapshots.project_id
        AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = task_constraint_snapshots.project_id
        AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    )
  );

DROP POLICY IF EXISTS task_constraint_snapshots_backend_runtime_policy
  ON public.task_constraint_snapshots;
CREATE POLICY task_constraint_snapshots_backend_runtime_policy
  ON public.task_constraint_snapshots
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

DROP POLICY IF EXISTS data_lineage_entity_types_authenticated_read_policy
  ON public.data_lineage_entity_types;
CREATE POLICY data_lineage_entity_types_authenticated_read_policy
  ON public.data_lineage_entity_types
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS data_lineage_entity_types_backend_runtime_read_policy
  ON public.data_lineage_entity_types;
CREATE POLICY data_lineage_entity_types_backend_runtime_read_policy
  ON public.data_lineage_entity_types
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS data_lineage_relation_rules_authenticated_read_policy
  ON public.data_lineage_relation_rules;
CREATE POLICY data_lineage_relation_rules_authenticated_read_policy
  ON public.data_lineage_relation_rules
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS data_lineage_relation_rules_backend_runtime_read_policy
  ON public.data_lineage_relation_rules;
CREATE POLICY data_lineage_relation_rules_backend_runtime_read_policy
  ON public.data_lineage_relation_rules
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
