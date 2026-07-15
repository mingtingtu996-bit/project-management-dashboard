-- v1.4.23.1 follow-up: close the live Supabase Advisor public RLS
-- surface found on 2026-06-29. Catalog readback showed 31 public tables
-- with relrowsecurity=false; this is a new surface beyond migration 252.
--
-- Forward-only and idempotent. It enables RLS/FORCE RLS, grants
-- authenticated read only where a tenant/global read boundary exists, and
-- keeps mutation/write access behind the backend runtime role.

BEGIN;

ALTER TABLE IF EXISTS public.algorithm_caliber_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_caliber_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_import_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_quality_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_quality_events FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_records FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_upgrade_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_upgrade_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.certificate_template_apply_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.certificate_template_apply_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_project_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deletion_retention_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deletion_retention_events FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.demo_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.demo_projects FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_algorithm_accuracy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_algorithm_accuracy_events FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_benchmarks FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_forecast_project_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_forecast_project_overlays FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_suggestion_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_suggestion_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.material_arrival_to_condition ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.material_arrival_to_condition FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.metric_caliber_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.metric_caliber_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_climate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_climate_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_location_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_location_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_schedule_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_schedule_states FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_weather_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_weather_forecasts FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.regional_climate_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.regional_climate_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.site_shutdown_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.site_shutdown_events FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_duration_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_duration_forecasts FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_reconcile_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_reconcile_backups FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_coverage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_coverage_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_owner_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_owner_confirmations FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_policy_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_policy_configs FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_threshold_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_threshold_candidates FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.algorithm_catalog') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_catalog TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_catalog_authenticated_read_policy ON public.algorithm_catalog';
      EXECUTE $policy$
        CREATE POLICY algorithm_catalog_authenticated_read_policy
          ON public.algorithm_catalog
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              algorithm_catalog.ordinary_user_visible = true
              OR (
                algorithm_catalog.project_id IS NOT NULL
                AND public.is_active_project_member(algorithm_catalog.project_id, NULL::TEXT[])
              )
              OR (
                algorithm_catalog.company_id IS NOT NULL
                AND public.is_active_company_member(algorithm_catalog.company_id, NULL::TEXT[])
              )
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_caliber_versions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_caliber_versions TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_caliber_versions_authenticated_read_policy ON public.algorithm_caliber_versions';
      EXECUTE $policy$
        CREATE POLICY algorithm_caliber_versions_authenticated_read_policy
          ON public.algorithm_caliber_versions
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              (algorithm_caliber_versions.project_id IS NULL AND algorithm_caliber_versions.company_id IS NULL)
              OR (
                algorithm_caliber_versions.project_id IS NOT NULL
                AND public.is_active_project_member(algorithm_caliber_versions.project_id, NULL::TEXT[])
              )
              OR (
                algorithm_caliber_versions.company_id IS NOT NULL
                AND public.is_active_company_member(algorithm_caliber_versions.company_id, NULL::TEXT[])
              )
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_catalog') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_catalog TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_catalog_authenticated_read_policy ON public.algorithm_seed_catalog';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_catalog_authenticated_read_policy
          ON public.algorithm_seed_catalog
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              (algorithm_seed_catalog.project_id IS NULL AND algorithm_seed_catalog.company_id IS NULL)
              OR (
                algorithm_seed_catalog.project_id IS NOT NULL
                AND public.is_active_project_member(algorithm_seed_catalog.project_id, NULL::TEXT[])
              )
              OR (
                algorithm_seed_catalog.company_id IS NOT NULL
                AND public.is_active_company_member(algorithm_seed_catalog.company_id, NULL::TEXT[])
              )
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_versions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_versions TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_versions_authenticated_read_policy ON public.algorithm_seed_versions';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_versions_authenticated_read_policy
          ON public.algorithm_seed_versions
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_records') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_records TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_records_authenticated_read_policy ON public.algorithm_seed_records';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_records_authenticated_read_policy
          ON public.algorithm_seed_records
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.algorithm_seed_versions v
              WHERE v.id = algorithm_seed_records.seed_version_id
                AND v.status IN ('active', 'deprecated')
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_import_logs') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_import_logs TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_import_logs_authenticated_read_policy ON public.algorithm_seed_import_logs';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_import_logs_authenticated_read_policy
          ON public.algorithm_seed_import_logs
          FOR SELECT
          TO authenticated
          USING (algorithm_seed_import_logs.imported_by = auth.uid())
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_overrides') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_overrides TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_overrides_authenticated_read_policy ON public.algorithm_seed_overrides';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_overrides_authenticated_read_policy
          ON public.algorithm_seed_overrides
          FOR SELECT
          TO authenticated
          USING (
            algorithm_seed_overrides.created_by = auth.uid()
            OR algorithm_seed_overrides.published_by = auth.uid()
            OR (
              algorithm_seed_overrides.project_id IS NOT NULL
              AND public.is_active_project_member(algorithm_seed_overrides.project_id, NULL::TEXT[])
            )
            OR (
              algorithm_seed_overrides.company_id IS NOT NULL
              AND public.is_active_company_member(algorithm_seed_overrides.company_id, NULL::TEXT[])
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_upgrade_candidates') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_upgrade_candidates TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_upgrade_candidates_authenticated_read_policy ON public.algorithm_seed_upgrade_candidates';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_upgrade_candidates_authenticated_read_policy
          ON public.algorithm_seed_upgrade_candidates
          FOR SELECT
          TO authenticated
          USING (
            algorithm_seed_upgrade_candidates.created_by = auth.uid()
            OR (
              algorithm_seed_upgrade_candidates.project_id IS NOT NULL
              AND public.is_active_project_member(algorithm_seed_upgrade_candidates.project_id, NULL::TEXT[])
            )
            OR (
              algorithm_seed_upgrade_candidates.company_id IS NOT NULL
              AND public.is_active_company_member(algorithm_seed_upgrade_candidates.company_id, NULL::TEXT[])
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_quality_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_quality_events TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_quality_events_auth_read_policy ON public.algorithm_seed_quality_events';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_quality_events_auth_read_policy
          ON public.algorithm_seed_quality_events
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(algorithm_seed_quality_events.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.metric_caliber_versions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.metric_caliber_versions TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS metric_caliber_versions_authenticated_read_policy ON public.metric_caliber_versions';
      EXECUTE $policy$
        CREATE POLICY metric_caliber_versions_authenticated_read_policy
          ON public.metric_caliber_versions
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.demo_projects') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.demo_projects TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS demo_projects_authenticated_read_policy ON public.demo_projects';
      EXECUTE $policy$
        CREATE POLICY demo_projects_authenticated_read_policy
          ON public.demo_projects
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL AND demo_projects.is_active = true)
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.regional_climate_rules') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.regional_climate_rules TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS regional_climate_rules_authenticated_read_policy ON public.regional_climate_rules';
      EXECUTE $policy$
        CREATE POLICY regional_climate_rules_authenticated_read_policy
          ON public.regional_climate_rules
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL AND regional_climate_rules.status = 'active')
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_benchmarks') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_benchmarks TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_benchmarks_authenticated_read_policy ON public.duration_benchmarks';
      EXECUTE $policy$
        CREATE POLICY duration_benchmarks_authenticated_read_policy
          ON public.duration_benchmarks
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              (duration_benchmarks.project_id IS NULL AND duration_benchmarks.company_id IS NULL)
              OR (
                duration_benchmarks.project_id IS NOT NULL
                AND public.is_active_project_member(duration_benchmarks.project_id, NULL::TEXT[])
              )
              OR (
                duration_benchmarks.company_id IS NOT NULL
                AND public.is_active_company_member(duration_benchmarks.company_id, NULL::TEXT[])
              )
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_suggestion_overrides') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_suggestion_overrides TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_suggestion_overrides_authenticated_read_policy ON public.duration_suggestion_overrides';
      EXECUTE $policy$
        CREATE POLICY duration_suggestion_overrides_authenticated_read_policy
          ON public.duration_suggestion_overrides
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              duration_suggestion_overrides.created_by = auth.uid()
              OR (
                duration_suggestion_overrides.project_id IS NOT NULL
                AND public.is_active_project_member(duration_suggestion_overrides.project_id, NULL::TEXT[])
              )
              OR (
                duration_suggestion_overrides.company_id IS NOT NULL
                AND public.is_active_company_member(duration_suggestion_overrides.company_id, NULL::TEXT[])
              )
              OR (
                duration_suggestion_overrides.project_id IS NULL
                AND duration_suggestion_overrides.company_id IS NULL
                AND duration_suggestion_overrides.override_status = 'active'
              )
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.company_project_templates') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.company_project_templates TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS company_project_templates_authenticated_read_policy ON public.company_project_templates';
      EXECUTE $policy$
        CREATE POLICY company_project_templates_authenticated_read_policy
          ON public.company_project_templates
          FOR SELECT
          TO authenticated
          USING (
            company_project_templates.deleted_at IS NULL
            AND public.is_active_company_member(company_project_templates.company_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.certificate_template_apply_batches') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.certificate_template_apply_batches TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS certificate_template_apply_batches_auth_read_policy ON public.certificate_template_apply_batches';
      EXECUTE $policy$
        CREATE POLICY certificate_template_apply_batches_auth_read_policy
          ON public.certificate_template_apply_batches
          FOR SELECT
          TO authenticated
          USING (
            certificate_template_apply_batches.applied_by = auth.uid()
            OR public.is_active_project_member(certificate_template_apply_batches.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.deletion_retention_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.deletion_retention_events TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS deletion_retention_events_auth_read_policy ON public.deletion_retention_events';
      EXECUTE $policy$
        CREATE POLICY deletion_retention_events_auth_read_policy
          ON public.deletion_retention_events
          FOR SELECT
          TO authenticated
          USING (
            deletion_retention_events.actor_id = auth.uid()
            OR deletion_retention_events.confirmed_by = auth.uid()
            OR public.is_active_project_member(deletion_retention_events.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_algorithm_accuracy_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_algorithm_accuracy_events TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_algorithm_accuracy_events_auth_read_policy ON public.duration_algorithm_accuracy_events';
      EXECUTE $policy$
        CREATE POLICY duration_algorithm_accuracy_events_auth_read_policy
          ON public.duration_algorithm_accuracy_events
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(duration_algorithm_accuracy_events.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_forecast_project_overlays') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_forecast_project_overlays TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_forecast_project_overlays_auth_read_policy ON public.duration_forecast_project_overlays';
      EXECUTE $policy$
        CREATE POLICY duration_forecast_project_overlays_auth_read_policy
          ON public.duration_forecast_project_overlays
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(duration_forecast_project_overlays.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.material_arrival_to_condition') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.material_arrival_to_condition TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS material_arrival_to_condition_auth_project_member_read_policy ON public.material_arrival_to_condition';
      EXECUTE $policy$
        CREATE POLICY material_arrival_to_condition_auth_project_member_read_policy
          ON public.material_arrival_to_condition
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(material_arrival_to_condition.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.project_climate_profiles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.project_climate_profiles TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_climate_profiles_auth_project_member_read_policy ON public.project_climate_profiles';
      EXECUTE $policy$
        CREATE POLICY project_climate_profiles_auth_project_member_read_policy
          ON public.project_climate_profiles
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(project_climate_profiles.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.project_location_observations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.project_location_observations TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_location_observations_auth_read_policy ON public.project_location_observations';
      EXECUTE $policy$
        CREATE POLICY project_location_observations_auth_read_policy
          ON public.project_location_observations
          FOR SELECT
          TO authenticated
          USING (
            project_location_observations.observed_by_user_id = auth.uid()
            OR public.is_active_project_member(project_location_observations.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.project_schedule_states') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.project_schedule_states TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_schedule_states_auth_project_member_read_policy ON public.project_schedule_states';
      EXECUTE $policy$
        CREATE POLICY project_schedule_states_auth_project_member_read_policy
          ON public.project_schedule_states
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(project_schedule_states.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.project_weather_forecasts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.project_weather_forecasts TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_weather_forecasts_auth_project_member_read_policy ON public.project_weather_forecasts';
      EXECUTE $policy$
        CREATE POLICY project_weather_forecasts_auth_project_member_read_policy
          ON public.project_weather_forecasts
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(project_weather_forecasts.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.site_shutdown_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.site_shutdown_events TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS site_shutdown_events_auth_project_member_read_policy ON public.site_shutdown_events';
      EXECUTE $policy$
        CREATE POLICY site_shutdown_events_auth_project_member_read_policy
          ON public.site_shutdown_events
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(site_shutdown_events.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.task_duration_forecasts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.task_duration_forecasts TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS task_duration_forecasts_auth_project_member_read_policy ON public.task_duration_forecasts';
      EXECUTE $policy$
        CREATE POLICY task_duration_forecasts_auth_project_member_read_policy
          ON public.task_duration_forecasts
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(task_duration_forecasts.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.task_reconcile_backups') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.task_reconcile_backups TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS task_reconcile_backups_auth_read_policy ON public.task_reconcile_backups';
      EXECUTE $policy$
        CREATE POLICY task_reconcile_backups_auth_read_policy
          ON public.task_reconcile_backups
          FOR SELECT
          TO authenticated
          USING (
            task_reconcile_backups.created_by = auth.uid()
            OR public.is_active_project_member(task_reconcile_backups.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.warning_coverage_snapshots') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.warning_coverage_snapshots TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS warning_coverage_snapshots_auth_project_member_read_policy ON public.warning_coverage_snapshots';
      EXECUTE $policy$
        CREATE POLICY warning_coverage_snapshots_auth_project_member_read_policy
          ON public.warning_coverage_snapshots
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(warning_coverage_snapshots.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.warning_owner_confirmations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.warning_owner_confirmations TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS warning_owner_confirmations_auth_read_policy ON public.warning_owner_confirmations';
      EXECUTE $policy$
        CREATE POLICY warning_owner_confirmations_auth_read_policy
          ON public.warning_owner_confirmations
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(warning_owner_confirmations.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.warning_policy_configs') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.warning_policy_configs TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS warning_policy_configs_auth_project_member_read_policy ON public.warning_policy_configs';
      EXECUTE $policy$
        CREATE POLICY warning_policy_configs_auth_project_member_read_policy
          ON public.warning_policy_configs
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(warning_policy_configs.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.warning_threshold_candidates') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.warning_threshold_candidates TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS warning_threshold_candidates_auth_project_member_read_policy ON public.warning_threshold_candidates';
      EXECUTE $policy$
        CREATE POLICY warning_threshold_candidates_auth_project_member_read_policy
          ON public.warning_threshold_candidates
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(warning_threshold_candidates.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    IF to_regclass('public.algorithm_caliber_versions') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_caliber_versions TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_caliber_versions_backend_runtime_policy ON public.algorithm_caliber_versions';
      EXECUTE $policy$
        CREATE POLICY algorithm_caliber_versions_backend_runtime_policy
          ON public.algorithm_caliber_versions
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

    IF to_regclass('public.algorithm_catalog') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_catalog TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_catalog_backend_runtime_policy ON public.algorithm_catalog';
      EXECUTE $policy$
        CREATE POLICY algorithm_catalog_backend_runtime_policy
          ON public.algorithm_catalog
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

    IF to_regclass('public.algorithm_seed_catalog') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_catalog TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_catalog_backend_runtime_policy ON public.algorithm_seed_catalog';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_catalog_backend_runtime_policy
          ON public.algorithm_seed_catalog
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

    IF to_regclass('public.algorithm_seed_import_logs') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_import_logs TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_import_logs_backend_runtime_policy ON public.algorithm_seed_import_logs';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_import_logs_backend_runtime_policy
          ON public.algorithm_seed_import_logs
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

    IF to_regclass('public.algorithm_seed_overrides') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_overrides TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_overrides_backend_runtime_policy ON public.algorithm_seed_overrides';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_overrides_backend_runtime_policy
          ON public.algorithm_seed_overrides
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

    IF to_regclass('public.algorithm_seed_quality_events') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_quality_events TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_quality_events_backend_runtime_policy ON public.algorithm_seed_quality_events';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_quality_events_backend_runtime_policy
          ON public.algorithm_seed_quality_events
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

    IF to_regclass('public.algorithm_seed_records') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_records TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_records_backend_runtime_policy ON public.algorithm_seed_records';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_records_backend_runtime_policy
          ON public.algorithm_seed_records
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

    IF to_regclass('public.algorithm_seed_upgrade_candidates') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_upgrade_candidates TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_upgrade_candidates_backend_runtime_policy ON public.algorithm_seed_upgrade_candidates';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_upgrade_candidates_backend_runtime_policy
          ON public.algorithm_seed_upgrade_candidates
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

    IF to_regclass('public.algorithm_seed_versions') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_versions TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_versions_backend_runtime_policy ON public.algorithm_seed_versions';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_versions_backend_runtime_policy
          ON public.algorithm_seed_versions
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

    IF to_regclass('public.certificate_template_apply_batches') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.certificate_template_apply_batches TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS certificate_template_apply_batches_backend_runtime_policy ON public.certificate_template_apply_batches';
      EXECUTE $policy$
        CREATE POLICY certificate_template_apply_batches_backend_runtime_policy
          ON public.certificate_template_apply_batches
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

    IF to_regclass('public.company_project_templates') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_project_templates TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS company_project_templates_backend_runtime_policy ON public.company_project_templates';
      EXECUTE $policy$
        CREATE POLICY company_project_templates_backend_runtime_policy
          ON public.company_project_templates
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

    IF to_regclass('public.deletion_retention_events') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deletion_retention_events TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS deletion_retention_events_backend_runtime_policy ON public.deletion_retention_events';
      EXECUTE $policy$
        CREATE POLICY deletion_retention_events_backend_runtime_policy
          ON public.deletion_retention_events
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

    IF to_regclass('public.demo_projects') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.demo_projects TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS demo_projects_backend_runtime_policy ON public.demo_projects';
      EXECUTE $policy$
        CREATE POLICY demo_projects_backend_runtime_policy
          ON public.demo_projects
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

    IF to_regclass('public.duration_algorithm_accuracy_events') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_algorithm_accuracy_events TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_algorithm_accuracy_events_backend_runtime_policy ON public.duration_algorithm_accuracy_events';
      EXECUTE $policy$
        CREATE POLICY duration_algorithm_accuracy_events_backend_runtime_policy
          ON public.duration_algorithm_accuracy_events
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

    IF to_regclass('public.duration_benchmarks') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_benchmarks TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_benchmarks_backend_runtime_policy ON public.duration_benchmarks';
      EXECUTE $policy$
        CREATE POLICY duration_benchmarks_backend_runtime_policy
          ON public.duration_benchmarks
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

    IF to_regclass('public.duration_forecast_project_overlays') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_forecast_project_overlays TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_forecast_project_overlays_backend_runtime_policy ON public.duration_forecast_project_overlays';
      EXECUTE $policy$
        CREATE POLICY duration_forecast_project_overlays_backend_runtime_policy
          ON public.duration_forecast_project_overlays
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

    IF to_regclass('public.duration_suggestion_overrides') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_suggestion_overrides TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_suggestion_overrides_backend_runtime_policy ON public.duration_suggestion_overrides';
      EXECUTE $policy$
        CREATE POLICY duration_suggestion_overrides_backend_runtime_policy
          ON public.duration_suggestion_overrides
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

    IF to_regclass('public.material_arrival_to_condition') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.material_arrival_to_condition TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS material_arrival_to_condition_backend_runtime_policy ON public.material_arrival_to_condition';
      EXECUTE $policy$
        CREATE POLICY material_arrival_to_condition_backend_runtime_policy
          ON public.material_arrival_to_condition
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

    IF to_regclass('public.metric_caliber_versions') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.metric_caliber_versions TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS metric_caliber_versions_backend_runtime_policy ON public.metric_caliber_versions';
      EXECUTE $policy$
        CREATE POLICY metric_caliber_versions_backend_runtime_policy
          ON public.metric_caliber_versions
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

    IF to_regclass('public.project_climate_profiles') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_climate_profiles TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_climate_profiles_backend_runtime_policy ON public.project_climate_profiles';
      EXECUTE $policy$
        CREATE POLICY project_climate_profiles_backend_runtime_policy
          ON public.project_climate_profiles
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

    IF to_regclass('public.project_location_observations') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_location_observations TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_location_observations_backend_runtime_policy ON public.project_location_observations';
      EXECUTE $policy$
        CREATE POLICY project_location_observations_backend_runtime_policy
          ON public.project_location_observations
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

    IF to_regclass('public.project_schedule_states') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_schedule_states TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_schedule_states_backend_runtime_policy ON public.project_schedule_states';
      EXECUTE $policy$
        CREATE POLICY project_schedule_states_backend_runtime_policy
          ON public.project_schedule_states
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

    IF to_regclass('public.project_weather_forecasts') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_weather_forecasts TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_weather_forecasts_backend_runtime_policy ON public.project_weather_forecasts';
      EXECUTE $policy$
        CREATE POLICY project_weather_forecasts_backend_runtime_policy
          ON public.project_weather_forecasts
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

    IF to_regclass('public.regional_climate_rules') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.regional_climate_rules TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS regional_climate_rules_backend_runtime_policy ON public.regional_climate_rules';
      EXECUTE $policy$
        CREATE POLICY regional_climate_rules_backend_runtime_policy
          ON public.regional_climate_rules
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

    IF to_regclass('public.site_shutdown_events') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_shutdown_events TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS site_shutdown_events_backend_runtime_policy ON public.site_shutdown_events';
      EXECUTE $policy$
        CREATE POLICY site_shutdown_events_backend_runtime_policy
          ON public.site_shutdown_events
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

    IF to_regclass('public.task_duration_forecasts') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_duration_forecasts TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS task_duration_forecasts_backend_runtime_policy ON public.task_duration_forecasts';
      EXECUTE $policy$
        CREATE POLICY task_duration_forecasts_backend_runtime_policy
          ON public.task_duration_forecasts
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

    IF to_regclass('public.task_reconcile_backups') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_reconcile_backups TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS task_reconcile_backups_backend_runtime_policy ON public.task_reconcile_backups';
      EXECUTE $policy$
        CREATE POLICY task_reconcile_backups_backend_runtime_policy
          ON public.task_reconcile_backups
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

    IF to_regclass('public.warning_coverage_snapshots') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warning_coverage_snapshots TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS warning_coverage_snapshots_backend_runtime_policy ON public.warning_coverage_snapshots';
      EXECUTE $policy$
        CREATE POLICY warning_coverage_snapshots_backend_runtime_policy
          ON public.warning_coverage_snapshots
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

    IF to_regclass('public.warning_owner_confirmations') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warning_owner_confirmations TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS warning_owner_confirmations_backend_runtime_policy ON public.warning_owner_confirmations';
      EXECUTE $policy$
        CREATE POLICY warning_owner_confirmations_backend_runtime_policy
          ON public.warning_owner_confirmations
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

    IF to_regclass('public.warning_policy_configs') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warning_policy_configs TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS warning_policy_configs_backend_runtime_policy ON public.warning_policy_configs';
      EXECUTE $policy$
        CREATE POLICY warning_policy_configs_backend_runtime_policy
          ON public.warning_policy_configs
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

    IF to_regclass('public.warning_threshold_candidates') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warning_threshold_candidates TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS warning_threshold_candidates_backend_runtime_policy ON public.warning_threshold_candidates';
      EXECUTE $policy$
        CREATE POLICY warning_threshold_candidates_backend_runtime_policy
          ON public.warning_threshold_candidates
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
