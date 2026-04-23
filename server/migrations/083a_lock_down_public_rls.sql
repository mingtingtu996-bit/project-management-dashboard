-- 083a_lock_down_public_rls.sql
-- Purpose:
--   1. Enable RLS on all public business tables that are still exposed through disabled RLS.
--   2. Remove legacy browser-side policies that would stay overly permissive after RLS is enabled.
--
-- Notes:
--   - The current application runs in backend storage mode for business data.
--   - Server-side service-role access continues to work because service_role bypasses RLS.
--   - We intentionally do not add new browser-side policies here; direct table access should remain denied
--     until explicit Supabase Auth based policies are designed and verified.

BEGIN;

-- Retire permissive legacy policies before activating RLS where needed.
DROP POLICY IF EXISTS "允许服务角色插入预警" ON public.warnings;

DROP POLICY IF EXISTS "wbs_templates_select_policy" ON public.wbs_templates;
DROP POLICY IF EXISTS "wbs_templates_insert_policy" ON public.wbs_templates;
DROP POLICY IF EXISTS "wbs_templates_update_policy" ON public.wbs_templates;
DROP POLICY IF EXISTS "wbs_templates_delete_policy" ON public.wbs_templates;

DROP POLICY IF EXISTS "wbs_template_nodes_select_policy" ON public.wbs_template_nodes;
DROP POLICY IF EXISTS "wbs_template_nodes_insert_policy" ON public.wbs_template_nodes;
DROP POLICY IF EXISTS "wbs_template_nodes_update_policy" ON public.wbs_template_nodes;
DROP POLICY IF EXISTS "wbs_template_nodes_delete_policy" ON public.wbs_template_nodes;

-- Enable RLS on every currently exposed public business table.
ALTER TABLE IF EXISTS public.acceptance_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.acceptance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.certificate_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.construction_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.delay_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.monthly_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.monthly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.planning_draft_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.planning_governance_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pre_milestone_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pre_milestone_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pre_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.standard_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_baseline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_completion_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_progress_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trigger_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_templates ENABLE ROW LEVEL SECURITY;

COMMIT;
