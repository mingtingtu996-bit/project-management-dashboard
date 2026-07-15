-- v1.4.23.1 follow-up: close the remaining Supabase Advisor public RLS
-- findings currently visible for invitation, reminder, notification,
-- governance, metric, duration, WBS, and dictionary tables.
--
-- This migration is forward-only and idempotent. It is a local migration
-- closeout until staging/production apply, catalog readback, and Advisor
-- rescan evidence are archived.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_project_member(
  p_project_id UUID,
  p_allowed_permission_levels TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND COALESCE(pm.is_active, true) = true
      AND (
        p_allowed_permission_levels IS NULL
        OR pm.permission_level = ANY(p_allowed_permission_levels)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.owner_id = auth.uid()
      AND (
        p_allowed_permission_levels IS NULL
        OR p_allowed_permission_levels && ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[]
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_project_member(UUID, TEXT[]) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.is_active_project_member(UUID, TEXT[]) FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO workbuddy_runtime';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO workbuddy_runtime_login';
  END IF;
END $$;

ALTER TABLE IF EXISTS public.data_quality_rule_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_quality_rule_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.change_action_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.change_action_types FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.governance_approval_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.governance_approval_records FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.metric_value_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.metric_value_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_template_candidate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_template_candidate_events FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reminder_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reminder_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reminder_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reminder_dismissals FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_experience_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_experience_samples FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_template_candidate_aggregations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_template_candidate_aggregations FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_forecast_model_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_forecast_model_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permission_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permission_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_direct_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_direct_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_join_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_join_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_user_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_user_states FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.duration_experience_samples
  ADD COLUMN IF NOT EXISTS learning_scope TEXT NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS learning_scope_source TEXT NOT NULL DEFAULT 'task_completion_writer';

DO $$
BEGIN
  IF to_regclass('public.data_quality_rule_registry') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_quality_rule_registry TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS data_quality_rule_registry_authenticated_read_policy ON public.data_quality_rule_registry';
      EXECUTE $policy$
        CREATE POLICY data_quality_rule_registry_authenticated_read_policy
          ON public.data_quality_rule_registry
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_quality_rule_registry TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS data_quality_rule_registry_backend_runtime_read_policy ON public.data_quality_rule_registry';
      EXECUTE $policy$
        CREATE POLICY data_quality_rule_registry_backend_runtime_read_policy
          ON public.data_quality_rule_registry
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.change_action_types') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.change_action_types TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS change_action_types_authenticated_read_policy ON public.change_action_types';
      EXECUTE $policy$
        CREATE POLICY change_action_types_authenticated_read_policy
          ON public.change_action_types
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.change_action_types TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS change_action_types_backend_runtime_read_policy ON public.change_action_types';
      EXECUTE $policy$
        CREATE POLICY change_action_types_backend_runtime_read_policy
          ON public.change_action_types
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_forecast_model_profiles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_forecast_model_profiles TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_forecast_model_profiles_authenticated_read_policy ON public.duration_forecast_model_profiles';
      EXECUTE $policy$
        CREATE POLICY duration_forecast_model_profiles_authenticated_read_policy
          ON public.duration_forecast_model_profiles
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_forecast_model_profiles TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_forecast_model_profiles_backend_runtime_read_policy ON public.duration_forecast_model_profiles';
      EXECUTE $policy$
        CREATE POLICY duration_forecast_model_profiles_backend_runtime_read_policy
          ON public.duration_forecast_model_profiles
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.permission_roles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.permission_roles TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS permission_roles_authenticated_read_policy ON public.permission_roles';
      EXECUTE $policy$
        CREATE POLICY permission_roles_authenticated_read_policy
          ON public.permission_roles
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.permission_roles TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS permission_roles_backend_runtime_read_policy ON public.permission_roles';
      EXECUTE $policy$
        CREATE POLICY permission_roles_backend_runtime_read_policy
          ON public.permission_roles
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.reminder_preferences') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminder_preferences TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS reminder_preferences_auth_self_policy ON public.reminder_preferences';
      EXECUTE $policy$
        CREATE POLICY reminder_preferences_auth_self_policy
          ON public.reminder_preferences
          FOR ALL
          TO authenticated
          USING (reminder_preferences.user_id = auth.uid())
          WITH CHECK (reminder_preferences.user_id = auth.uid())
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminder_preferences TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS reminder_preferences_backend_runtime_policy ON public.reminder_preferences';
      EXECUTE $policy$
        CREATE POLICY reminder_preferences_backend_runtime_policy
          ON public.reminder_preferences
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

  IF to_regclass('public.reminder_dismissals') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminder_dismissals TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS reminder_dismissals_auth_self_policy ON public.reminder_dismissals';
      EXECUTE $policy$
        CREATE POLICY reminder_dismissals_auth_self_policy
          ON public.reminder_dismissals
          FOR ALL
          TO authenticated
          USING (reminder_dismissals.user_id = auth.uid())
          WITH CHECK (reminder_dismissals.user_id = auth.uid())
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminder_dismissals TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS reminder_dismissals_backend_runtime_policy ON public.reminder_dismissals';
      EXECUTE $policy$
        CREATE POLICY reminder_dismissals_backend_runtime_policy
          ON public.reminder_dismissals
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

  IF to_regclass('public.notification_user_states') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_user_states TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS notification_user_states_auth_self_policy ON public.notification_user_states';
      EXECUTE $policy$
        CREATE POLICY notification_user_states_auth_self_policy
          ON public.notification_user_states
          FOR ALL
          TO authenticated
          USING (notification_user_states.user_id = auth.uid())
          WITH CHECK (notification_user_states.user_id = auth.uid())
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_user_states TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS notification_user_states_backend_runtime_policy ON public.notification_user_states';
      EXECUTE $policy$
        CREATE POLICY notification_user_states_backend_runtime_policy
          ON public.notification_user_states
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

  IF to_regclass('public.governance_approval_records') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.governance_approval_records TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS governance_approval_records_auth_read_policy ON public.governance_approval_records';
      EXECUTE $policy$
        CREATE POLICY governance_approval_records_auth_read_policy
          ON public.governance_approval_records
          FOR SELECT
          TO authenticated
          USING (
            requested_by = auth.uid()
            OR approved_by = auth.uid()
            OR rejected_by = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = governance_approval_records.project_id
                AND public.is_active_company_member(p.company_id, NULL::TEXT[])
            )
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS governance_approval_records_auth_write_policy ON public.governance_approval_records';
      EXECUTE $policy$
        CREATE POLICY governance_approval_records_auth_write_policy
          ON public.governance_approval_records
          FOR ALL
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = governance_approval_records.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
          WITH CHECK (
            (
              requested_by = auth.uid()
              OR approved_by = auth.uid()
              OR rejected_by = auth.uid()
            )
            AND EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = governance_approval_records.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.governance_approval_records TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS governance_approval_records_backend_runtime_policy ON public.governance_approval_records';
      EXECUTE $policy$
        CREATE POLICY governance_approval_records_backend_runtime_policy
          ON public.governance_approval_records
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

  IF to_regclass('public.metric_value_snapshots') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.metric_value_snapshots TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS metric_value_snapshots_auth_read_policy ON public.metric_value_snapshots';
      EXECUTE $policy$
        CREATE POLICY metric_value_snapshots_auth_read_policy
          ON public.metric_value_snapshots
          FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = metric_value_snapshots.project_id
                AND public.is_active_company_member(p.company_id, NULL::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.metric_value_snapshots TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS metric_value_snapshots_backend_runtime_policy ON public.metric_value_snapshots';
      EXECUTE $policy$
        CREATE POLICY metric_value_snapshots_backend_runtime_policy
          ON public.metric_value_snapshots
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

  IF to_regclass('public.wbs_template_candidate_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wbs_template_candidate_events TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS wbs_template_candidate_events_auth_read_policy ON public.wbs_template_candidate_events';
      EXECUTE $policy$
        CREATE POLICY wbs_template_candidate_events_auth_read_policy
          ON public.wbs_template_candidate_events
          FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = wbs_template_candidate_events.project_id
                AND public.is_active_company_member(p.company_id, NULL::TEXT[])
            )
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS wbs_template_candidate_events_auth_write_policy ON public.wbs_template_candidate_events';
      EXECUTE $policy$
        CREATE POLICY wbs_template_candidate_events_auth_write_policy
          ON public.wbs_template_candidate_events
          FOR ALL
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = wbs_template_candidate_events.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
          WITH CHECK (
            created_by = auth.uid()
            AND EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = wbs_template_candidate_events.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wbs_template_candidate_events TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS wbs_template_candidate_events_backend_runtime_policy ON public.wbs_template_candidate_events';
      EXECUTE $policy$
        CREATE POLICY wbs_template_candidate_events_backend_runtime_policy
          ON public.wbs_template_candidate_events
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

  IF to_regclass('public.wbs_template_candidate_aggregations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.wbs_template_candidate_aggregations TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS wbs_template_candidate_aggregations_auth_read_policy ON public.wbs_template_candidate_aggregations';
      EXECUTE $policy$
        CREATE POLICY wbs_template_candidate_aggregations_auth_read_policy
          ON public.wbs_template_candidate_aggregations
          FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = wbs_template_candidate_aggregations.project_id
                AND public.is_active_company_member(p.company_id, NULL::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wbs_template_candidate_aggregations TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS wbs_template_candidate_aggregations_backend_runtime_policy ON public.wbs_template_candidate_aggregations';
      EXECUTE $policy$
        CREATE POLICY wbs_template_candidate_aggregations_backend_runtime_policy
          ON public.wbs_template_candidate_aggregations
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

  IF to_regclass('public.duration_experience_samples') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_experience_samples TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_experience_samples_auth_read_policy ON public.duration_experience_samples';
      EXECUTE $policy$
        CREATE POLICY duration_experience_samples_auth_read_policy
          ON public.duration_experience_samples
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              COALESCE(duration_experience_samples.learning_scope, 'project') IN ('global', 'industry')
              OR EXISTS (
                SELECT 1
                FROM public.projects p
                WHERE p.id = duration_experience_samples.project_id
                  AND public.is_active_company_member(p.company_id, NULL::TEXT[])
              )
            )
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS duration_experience_samples_auth_write_policy ON public.duration_experience_samples';
      EXECUTE $policy$
        CREATE POLICY duration_experience_samples_auth_write_policy
          ON public.duration_experience_samples
          FOR ALL
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = duration_experience_samples.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
          WITH CHECK (
            COALESCE(duration_experience_samples.learning_scope, 'project') = 'project'
            AND EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = duration_experience_samples.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_experience_samples TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_experience_samples_backend_runtime_policy ON public.duration_experience_samples';
      EXECUTE $policy$
        CREATE POLICY duration_experience_samples_backend_runtime_policy
          ON public.duration_experience_samples
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

  IF to_regclass('public.company_invitations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_invitations TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS company_invitations_auth_read_policy ON public.company_invitations';
      EXECUTE $policy$
        CREATE POLICY company_invitations_auth_read_policy
          ON public.company_invitations
          FOR SELECT
          TO authenticated
          USING (
            recipient_user_id = auth.uid()
            OR invited_by = auth.uid()
            OR public.is_active_company_member(company_invitations.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS company_invitations_auth_write_policy ON public.company_invitations';
      EXECUTE $policy$
        CREATE POLICY company_invitations_auth_write_policy
          ON public.company_invitations
          FOR ALL
          TO authenticated
          USING (
            recipient_user_id = auth.uid()
            OR invited_by = auth.uid()
            OR public.is_active_company_member(company_invitations.company_id, ARRAY['company_admin']::TEXT[])
          )
          WITH CHECK (
            recipient_user_id = auth.uid()
            OR (
              invited_by = auth.uid()
              AND public.is_active_company_member(company_invitations.company_id, ARRAY['company_admin']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_invitations TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS company_invitations_backend_runtime_policy ON public.company_invitations';
      EXECUTE $policy$
        CREATE POLICY company_invitations_backend_runtime_policy
          ON public.company_invitations
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

  IF to_regclass('public.project_direct_invitations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_direct_invitations TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_direct_invitations_auth_read_policy ON public.project_direct_invitations';
      EXECUTE $policy$
        CREATE POLICY project_direct_invitations_auth_read_policy
          ON public.project_direct_invitations
          FOR SELECT
          TO authenticated
          USING (
            recipient_user_id = auth.uid()
            OR invited_by = auth.uid()
            OR public.is_active_project_member(project_direct_invitations.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
            OR public.is_active_company_member(project_direct_invitations.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS project_direct_invitations_auth_write_policy ON public.project_direct_invitations';
      EXECUTE $policy$
        CREATE POLICY project_direct_invitations_auth_write_policy
          ON public.project_direct_invitations
          FOR ALL
          TO authenticated
          USING (
            recipient_user_id = auth.uid()
            OR invited_by = auth.uid()
            OR public.is_active_project_member(project_direct_invitations.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
            OR public.is_active_company_member(project_direct_invitations.company_id, ARRAY['company_admin']::TEXT[])
          )
          WITH CHECK (
            recipient_user_id = auth.uid()
            OR (
              invited_by = auth.uid()
              AND (
                public.is_active_project_member(project_direct_invitations.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
                OR public.is_active_company_member(project_direct_invitations.company_id, ARRAY['company_admin']::TEXT[])
              )
            )
            OR (
              public.is_active_project_member(project_direct_invitations.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
              OR public.is_active_company_member(project_direct_invitations.company_id, ARRAY['company_admin']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_direct_invitations TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_direct_invitations_backend_runtime_policy ON public.project_direct_invitations';
      EXECUTE $policy$
        CREATE POLICY project_direct_invitations_backend_runtime_policy
          ON public.project_direct_invitations
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

  IF to_regclass('public.project_join_requests') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_join_requests TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_join_requests_auth_read_policy ON public.project_join_requests';
      EXECUTE $policy$
        CREATE POLICY project_join_requests_auth_read_policy
          ON public.project_join_requests
          FOR SELECT
          TO authenticated
          USING (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_project_member(project_join_requests.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
            OR public.is_active_company_member(project_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS project_join_requests_auth_write_policy ON public.project_join_requests';
      EXECUTE $policy$
        CREATE POLICY project_join_requests_auth_write_policy
          ON public.project_join_requests
          FOR ALL
          TO authenticated
          USING (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_project_member(project_join_requests.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
            OR public.is_active_company_member(project_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
          WITH CHECK (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_project_member(project_join_requests.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
            OR public.is_active_company_member(project_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_join_requests TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_join_requests_backend_runtime_policy ON public.project_join_requests';
      EXECUTE $policy$
        CREATE POLICY project_join_requests_backend_runtime_policy
          ON public.project_join_requests
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

  IF to_regclass('public.company_join_requests') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_join_requests TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS company_join_requests_auth_read_policy ON public.company_join_requests';
      EXECUTE $policy$
        CREATE POLICY company_join_requests_auth_read_policy
          ON public.company_join_requests
          FOR SELECT
          TO authenticated
          USING (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_company_member(company_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS company_join_requests_auth_write_policy ON public.company_join_requests';
      EXECUTE $policy$
        CREATE POLICY company_join_requests_auth_write_policy
          ON public.company_join_requests
          FOR ALL
          TO authenticated
          USING (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_company_member(company_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
          WITH CHECK (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_company_member(company_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_join_requests TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS company_join_requests_backend_runtime_policy ON public.company_join_requests';
      EXECUTE $policy$
        CREATE POLICY company_join_requests_backend_runtime_policy
          ON public.company_join_requests
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
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
