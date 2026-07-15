-- v1.4.23.1 Supabase Advisor security closeout.
--
-- Closes the staging Advisor security findings that remained after the RLS
-- disabled table pass: RLS-enabled tables without policies, always-true health
-- history write policies, mutable function search_path, and ltree in public.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'ltree') THEN
    ALTER EXTENSION ltree SET SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS ltree WITH SCHEMA extensions;
  END IF;
END $$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'acceptance_catalog',
    'acceptance_dependencies',
    'acceptance_nodes',
    'acceptance_requirements',
    'alerts',
    'certificate_approvals',
    'certificate_dependencies',
    'certificate_work_items',
    'change_logs',
    'construction_drawings',
    'data_confidence_snapshots',
    'data_quality_findings',
    'drawing_package_items',
    'drawing_packages',
    'drawing_review_rules',
    'drawing_versions',
    'duration_plan_network_outcomes',
    'issues',
    'job_execution_logs',
    'job_failures',
    'milestones',
    'participant_units',
    'planning_draft_locks',
    'planning_governance_states',
    'pre_milestone_conditions',
    'pre_milestone_dependencies',
    'pre_milestones',
    'project_data_quality_settings',
    'project_invitations',
    'project_materials',
    'project_members',
    'responsibility_alert_states',
    'responsibility_watchlist',
    'revision_pool_candidates',
    'risks',
    'schema_migrations',
    'standard_processes',
    'task_completion_reports',
    'task_critical_overrides',
    'task_locks',
    'task_milestones',
    'task_preceding_relations',
    'task_progress_snapshots',
    'trigger_execution_logs',
    'warning_acknowledgments',
    'warnings',
    'wbs_structure',
    'wbs_task_links',
    'wbs_template_nodes',
    'wbs_templates',
    'weekly_digests'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO workbuddy_runtime', table_name);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_backend_runtime_policy', table_name);
        EXECUTE format($policy$
          CREATE POLICY %I
            ON public.%I
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
        $policy$, table_name || '_backend_runtime_policy', table_name);
      END IF;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.project_health_history') IS NOT NULL THEN
    ALTER TABLE public.project_health_history ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.project_health_history FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS health_history_select ON public.project_health_history;
    DROP POLICY IF EXISTS health_history_insert ON public.project_health_history;
    DROP POLICY IF EXISTS health_history_update ON public.project_health_history;
    DROP POLICY IF EXISTS project_health_history_auth_project_member_read_policy ON public.project_health_history;
    DROP POLICY IF EXISTS project_health_history_backend_runtime_policy ON public.project_health_history;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_health_history FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_health_history FROM authenticated;
      GRANT SELECT ON TABLE public.project_health_history TO authenticated;

      CREATE POLICY project_health_history_auth_project_member_read_policy
        ON public.project_health_history
        FOR SELECT
        TO authenticated
        USING (
          auth.uid() IS NOT NULL
          AND public.is_active_project_member(project_health_history.project_id, NULL::TEXT[])
        );
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_health_history TO workbuddy_runtime;

      CREATE POLICY project_health_history_backend_runtime_policy
        ON public.project_health_history
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
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  function_name TEXT;
  function_identity TEXT;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'auto_complete_conditions',
    'auto_record_progress_snapshot',
    'auto_resolve_obstacles_on_task_complete',
    'check_lineage_events_append_only',
    'check_task_dependencies_same_project',
    'check_task_milestone_reference',
    'cleanup_milestone_references_on_cancel',
    'cleanup_old_job_logs',
    'confirm_warning_as_risk_atomic',
    'create_certificate_work_item_atomic',
    'create_issue_from_risk_atomic',
    'deactivate_target_project_entity_links_before_delete',
    'delete_risk_with_source_backfill_atomic',
    'delete_task_condition_with_source_backfill_atomic',
    'delete_task_obstacle_with_source_backfill_atomic',
    'delete_task_with_source_backfill_atomic',
    'fill_notification_company_id',
    'fn_update_pre_milestone_status',
    'has_project_edit_permission',
    'is_project_owner',
    'mark_source_deleted_on_downstream_atomic',
    'prevent_delete_active_project_entity_links',
    'protect_upgrade_chain_issue_delete',
    'protect_upgrade_chain_risk_delete',
    'record_task_timeline_event',
    'safe_generate_completion_report',
    'set_duration_forecast_residual_overlay_publication_key',
    'set_notification_company_id',
    'set_updated_at',
    'set_wbs_template_company_id',
    'sync_task_condition_status',
    'sync_task_timeline_for_condition',
    'sync_task_timeline_for_obstacle',
    'sync_task_timeline_for_task',
    'update_certificate_approvals_timestamp',
    'update_certificate_work_items_timestamp',
    'update_construction_drawings_updated_at',
    'update_drawing_package_items_updated_at',
    'update_drawing_packages_updated_at',
    'update_drawing_review_rules_updated_at',
    'update_drawing_versions_updated_at',
    'update_engineering_categories_updated_at',
    'update_engineering_objects_updated_at',
    'update_issues_updated_at',
    'update_project_daily_snapshot_updated_at',
    'update_project_entity_links_updated_at',
    'update_risk_statistics_updated_at',
    'update_task_conditions_updated_at',
    'update_task_dependencies_updated_at',
    'update_task_obstacles_updated_at',
    'update_task_progress_on_condition_complete',
    'update_updated_at_column',
    'update_warnings_updated_at'
  ] LOOP
    FOR function_identity IN
      SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = function_name
    LOOP
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', function_identity);
    END LOOP;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
