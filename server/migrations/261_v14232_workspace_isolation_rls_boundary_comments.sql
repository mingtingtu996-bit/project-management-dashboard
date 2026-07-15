-- v1.4.23.2-D workspace isolation boundary comments.
-- Forward-only note: do not rewrite legacy migration files 007/011.
--
-- These legacy policies use auth.uid() predicates and were originally written
-- before the current backend isolation model settled on application-layer
-- company/project membership checks. They are retained as historical schema
-- objects, but they are not a backend tenant-isolation dependency for route
-- traffic. The deployable isolation boundary for v1.4.23.2-D is:
--   1. application-layer company/project membership enforcement,
--   2. route/workspace isolation guards in CI,
--   3. explicit runtime RLS policies only where later migrations added them.
--
-- If v1.6 moves to database-level RLS as the primary boundary, this comment
-- should be replaced by a forward migration that installs the real policy set.

DO $$
DECLARE
  v_comment CONSTANT TEXT := 'v1.4.23.2-D boundary: legacy auth.uid() RLS policy retained for historical schema compatibility only. It is not the backend tenant-isolation dependency for WorkBuddy route traffic; application-layer company/project membership guards plus CI workspace-isolation checks are the v1.4.23.2 isolation truth. Do not cite this policy as database-level tenant isolation until a future forward migration installs non-bypass runtime RLS as the primary boundary.';
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (
         (tablename = 'tasks' AND policyname = ANY (ARRAY[
           'tasks_select_own',
           'tasks_insert_own',
           'tasks_update_own',
           'tasks_delete_own'
         ]))
         OR (tablename = 'milestones' AND policyname = ANY (ARRAY[
           'milestones_select_own',
           'milestones_insert_own',
           'milestones_update_own',
           'milestones_delete_own'
         ]))
         OR (tablename = 'task_conditions' AND policyname = ANY (ARRAY[
           'task_conditions_select_own',
           'task_conditions_insert_own',
           'task_conditions_update_own',
           'task_conditions_delete_own'
         ]))
         OR (tablename = 'task_obstacles' AND policyname = ANY (ARRAY[
           'task_obstacles_select_own',
           'task_obstacles_insert_own',
           'task_obstacles_update_own',
           'task_obstacles_delete_own'
         ]))
         OR (tablename = 'acceptance_plans' AND policyname = ANY (ARRAY[
           'acceptance_plans_select_own',
           'acceptance_plans_insert_own',
           'acceptance_plans_update_own',
           'acceptance_plans_delete_own'
         ]))
         OR (tablename = 'wbs_templates' AND policyname = ANY (ARRAY[
           'wbs_templates_select_own',
           'wbs_templates_insert_own',
           'wbs_templates_update_own',
           'wbs_templates_delete_own'
         ]))
         OR (tablename = 'pre_milestones' AND policyname = ANY (ARRAY[
           'pre_milestones_select_own',
           'pre_milestones_insert_own',
           'pre_milestones_update_own',
           'pre_milestones_delete_own'
         ]))
         OR (tablename = 'acceptance_nodes' AND policyname = ANY (ARRAY[
           'acceptance_nodes_select_own',
           'acceptance_nodes_insert_own',
           'acceptance_nodes_update_own',
           'acceptance_nodes_delete_own'
         ]))
         OR (tablename = 'task_delay_history' AND policyname = ANY (ARRAY[
           'task_delay_history_select_own',
           'task_delay_history_insert_own'
         ]))
         OR (tablename = 'pre_milestone_conditions' AND policyname = ANY (ARRAY[
           'pre_milestone_conditions_select_own',
           'pre_milestone_conditions_insert_own',
           'pre_milestone_conditions_update_own',
           'pre_milestone_conditions_delete_own'
         ]))
         OR (tablename = 'task_completion_reports' AND policyname = ANY (ARRAY[
           'task_completion_reports_select_own',
           'task_completion_reports_insert_own',
           'task_completion_reports_update_own'
         ]))
         OR (tablename = 'task_progress_snapshots' AND policyname = 'task_progress_snapshots_select_own')
         OR (tablename = 'wbs_structure' AND policyname = ANY (ARRAY[
           'wbs_structure_select_own',
           'wbs_structure_insert_own',
           'wbs_structure_update_own',
           'wbs_structure_delete_own'
         ]))
         OR (tablename = 'wbs_task_links' AND policyname = ANY (ARRAY[
           'wbs_task_links_select_own',
           'wbs_task_links_insert_own',
           'wbs_task_links_update_own',
           'wbs_task_links_delete_own'
         ]))
         OR (tablename = 'job_execution_logs' AND policyname = 'job_execution_logs_select_own')
         OR (tablename = 'task_locks' AND policyname = ANY (ARRAY[
           'task_locks_select_own',
           'task_locks_insert_own',
           'task_locks_update_own'
         ]))
         OR (tablename = 'phases' AND policyname = ANY (ARRAY[
           'phases_select_policy',
           'phases_insert_policy',
           'phases_update_policy'
         ]))
         OR (tablename = 'wbs_template_nodes' AND policyname = ANY (ARRAY[
           'wbs_template_nodes_select_policy',
           'wbs_template_nodes_insert_policy',
           'wbs_template_nodes_update_policy'
         ]))
         OR (tablename = 'dialog_frequency_control' AND policyname = ANY (ARRAY[
           'dialog_frequency_control_select_policy',
           'dialog_frequency_control_insert_policy',
           'dialog_frequency_control_update_policy'
         ]))
         OR (tablename = 'dialog_frequency_settings' AND policyname = ANY (ARRAY[
           'dialog_frequency_settings_select_policy',
           'dialog_frequency_settings_insert_policy',
           'dialog_frequency_settings_update_policy'
         ]))
       )
  LOOP
    EXECUTE format(
      'COMMENT ON POLICY %I ON %I.%I IS %L',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename,
      v_comment
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.is_project_member(uuid, uuid)') IS NOT NULL THEN
    COMMENT ON FUNCTION public.is_project_member(UUID, UUID) IS
      'v1.4.23.2-D boundary: legacy auth.uid-era helper retained for historical policies; backend tenant isolation uses application-layer company/project membership guards and CI workspace-isolation checks.';
  END IF;

  IF to_regprocedure('public.is_project_owner(uuid, uuid)') IS NOT NULL THEN
    COMMENT ON FUNCTION public.is_project_owner(UUID, UUID) IS
      'v1.4.23.2-D boundary: legacy auth.uid-era helper retained for historical policies; backend tenant isolation uses application-layer company/project membership guards and CI workspace-isolation checks.';
  END IF;

  IF to_regprocedure('public.has_project_edit_permission(uuid, uuid)') IS NOT NULL THEN
    COMMENT ON FUNCTION public.has_project_edit_permission(UUID, UUID) IS
      'v1.4.23.2-D boundary: legacy auth.uid-era helper retained for historical policies; backend tenant isolation uses application-layer company/project membership guards and CI workspace-isolation checks.';
  END IF;
END $$;
