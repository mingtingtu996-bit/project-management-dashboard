-- v1.4.23.1 follow-up: close the local migration side of the Supabase
-- Advisor public RLS findings discovered during C-18 / C-18.L review.
--
-- This migration is intentionally forward-only and idempotent. It hardens the
-- known public tables that Advisor flagged locally; a real Advisor/catalog
-- rescan is still required after applying it to staging or production.

BEGIN;

ALTER TABLE IF EXISTS public.project_key_node_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_key_node_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_constraint_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_constraint_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_entity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_entity_types FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_relation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_relation_rules FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.project_key_node_snapshots') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_key_node_snapshots TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_key_node_snapshots_auth_read_policy ON public.project_key_node_snapshots';
      EXECUTE $policy$
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
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS project_key_node_snapshots_auth_write_policy ON public.project_key_node_snapshots';
      EXECUTE $policy$
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
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_key_node_snapshots TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_key_node_snapshots_backend_runtime_policy ON public.project_key_node_snapshots';
      EXECUTE $policy$
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
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.task_constraint_snapshots') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_constraint_snapshots TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS task_constraint_snapshots_auth_read_policy ON public.task_constraint_snapshots';
      EXECUTE $policy$
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
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS task_constraint_snapshots_auth_write_policy ON public.task_constraint_snapshots';
      EXECUTE $policy$
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
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_constraint_snapshots TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS task_constraint_snapshots_backend_runtime_policy ON public.task_constraint_snapshots';
      EXECUTE $policy$
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
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.data_lineage_entity_types') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_entity_types TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS data_lineage_entity_types_authenticated_read_policy ON public.data_lineage_entity_types';
      EXECUTE $policy$
        CREATE POLICY data_lineage_entity_types_authenticated_read_policy
          ON public.data_lineage_entity_types
          FOR SELECT
          TO authenticated
          USING (true)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_entity_types TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS data_lineage_entity_types_backend_runtime_read_policy ON public.data_lineage_entity_types';
      EXECUTE $policy$
        CREATE POLICY data_lineage_entity_types_backend_runtime_read_policy
          ON public.data_lineage_entity_types
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.data_lineage_relation_rules') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_relation_rules TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS data_lineage_relation_rules_authenticated_read_policy ON public.data_lineage_relation_rules';
      EXECUTE $policy$
        CREATE POLICY data_lineage_relation_rules_authenticated_read_policy
          ON public.data_lineage_relation_rules
          FOR SELECT
          TO authenticated
          USING (true)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_relation_rules TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS data_lineage_relation_rules_backend_runtime_read_policy ON public.data_lineage_relation_rules';
      EXECUTE $policy$
        CREATE POLICY data_lineage_relation_rules_backend_runtime_read_policy
          ON public.data_lineage_relation_rules
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
