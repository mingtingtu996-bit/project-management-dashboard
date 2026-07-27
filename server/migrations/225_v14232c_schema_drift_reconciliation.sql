-- 225_v14232c_schema_drift_reconciliation.sql
-- Forward-only reconciliation for v1.4.23.2-C. This migration makes the
-- migration-derived expected schema match the live canonical schema without
-- mutating historical migration files or schema_migrations checksums.

BEGIN;

-- Missing columns from the declared canonical migration chain.
ALTER TABLE public.acceptance_requirements
  ADD COLUMN IF NOT EXISTS drawing_package_id UUID;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS preceding_task_id UUID;

ALTER TABLE public.wbs_templates
  ADD COLUMN IF NOT EXISTS template_data JSONB;

UPDATE public.wbs_templates
SET template_data = wbs_nodes
WHERE template_data IS NULL
  AND wbs_nodes IS NOT NULL;

-- Live canonical columns that existed in production but were not represented
-- by the static migration-derived schema.
ALTER TABLE public.job_execution_logs
  ADD COLUMN IF NOT EXISTS job_id TEXT,
  ADD COLUMN IF NOT EXISTS triggered_by TEXT;

ALTER TABLE public.project_daily_snapshot
  ADD COLUMN IF NOT EXISTS active_delayed_tasks INTEGER DEFAULT 0;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_id UUID,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT '未开始',
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS building_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS structure_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS building_count INTEGER,
  ADD COLUMN IF NOT EXISTS above_ground_floors INTEGER,
  ADD COLUMN IF NOT EXISTS underground_floors INTEGER,
  ADD COLUMN IF NOT EXISTS support_method VARCHAR(100),
  ADD COLUMN IF NOT EXISTS total_area NUMERIC,
  ADD COLUMN IF NOT EXISTS total_investment NUMERIC,
  ADD COLUMN IF NOT EXISTS budget NUMERIC,
  ADD COLUMN IF NOT EXISTS location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS planned_start_date DATE,
  ADD COLUMN IF NOT EXISTS planned_end_date DATE,
  ADD COLUMN IF NOT EXISTS actual_start_date DATE,
  ADD COLUMN IF NOT EXISTS actual_end_date DATE,
  ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS health_status VARCHAR(50) DEFAULT '亚健康';

ALTER TABLE public.task_conditions
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS responsible_person VARCHAR(255),
  ADD COLUMN IF NOT EXISTS satisfied_at TIMESTAMPTZ;

ALTER TABLE public.task_obstacles
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_resolve_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS project_id UUID;

-- Preserve the one live document_no value before retiring the legacy column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pre_milestones'
      AND column_name = 'document_no'
  ) THEN
    EXECUTE 'UPDATE public.pre_milestones SET certificate_no = COALESCE(certificate_no, document_no) WHERE certificate_no IS NULL AND document_no IS NOT NULL';
  END IF;
END
$$;

-- Align one historical critical-path override row with the canonical
-- manual_attention/manual_insert model used by current code.
UPDATE public.task_critical_overrides
SET mode = 'manual_attention',
    anchor_type = NULL
WHERE mode = 'force_critical';

-- Retire empty legacy scope-object columns that are no longer part of the
-- v1.4 engineering-object boundary.
DROP INDEX IF EXISTS public.idx_tasks_zone_object_id;
DROP INDEX IF EXISTS public.idx_tasks_professional_object_id;
DROP INDEX IF EXISTS public.idx_materials_professional;
DROP INDEX IF EXISTS public.idx_project_materials_professional_object_id;
DROP INDEX IF EXISTS public.idx_eng_cat_professional;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_zone_object_id_fkey,
  DROP CONSTRAINT IF EXISTS tasks_professional_object_id_fkey,
  DROP COLUMN IF EXISTS zone_object_id,
  DROP COLUMN IF EXISTS professional_object_id;

ALTER TABLE public.project_materials
  DROP CONSTRAINT IF EXISTS project_materials_professional_object_id_fkey,
  DROP COLUMN IF EXISTS professional_object_id;

ALTER TABLE public.engineering_categories
  DROP CONSTRAINT IF EXISTS engineering_categories_professional_object_id_fkey,
  DROP COLUMN IF EXISTS professional_object_id;

ALTER TABLE public.pre_milestones
  DROP COLUMN IF EXISTS document_no;

-- Defaults, nullability and type reconciliations.
ALTER TABLE public.issues
  ALTER COLUMN source_type SET DEFAULT 'manual';

ALTER TABLE public.job_failures
  ALTER COLUMN id SET DEFAULT nextval('job_failures_id_seq'::regclass);

ALTER TABLE public.operation_logs
  ALTER COLUMN id SET DEFAULT nextval('operation_logs_id_seq'::regclass),
  ALTER COLUMN method SET NOT NULL,
  ALTER COLUMN path SET NOT NULL;

ALTER TABLE public.project_materials
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.task_conditions
  ALTER COLUMN condition_type SET DEFAULT '其他',
  ALTER COLUMN target_date TYPE DATE USING target_date::date,
  ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.task_obstacles
  ALTER COLUMN obstacle_type SET DEFAULT '其他',
  ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.task_preceding_relations
  ALTER COLUMN id TYPE UUID USING id::uuid,
  ALTER COLUMN condition_id TYPE UUID USING condition_id::uuid,
  ALTER COLUMN task_id TYPE UUID USING task_id::uuid,
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.wbs_templates
  ALTER COLUMN status SET DEFAULT 'published';

-- Constraints: use current runtime value domains where the old migration
-- domain is known stale, and keep live ON DELETE semantics where they already
-- protect production data.
ALTER TABLE public.acceptance_nodes
  DROP CONSTRAINT IF EXISTS acceptance_nodes_status_check,
  ADD CONSTRAINT acceptance_nodes_status_check
    CHECK (status IN ('draft', 'preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying', 'passed', 'archived', '待验收', '验收中', '已通过', '未通过', '需补充'));

ALTER TABLE public.acceptance_plans
  DROP CONSTRAINT IF EXISTS acceptance_plans_acceptance_type_check,
  DROP CONSTRAINT IF EXISTS acceptance_plans_status_check,
  ADD CONSTRAINT acceptance_plans_status_check
    CHECK (status IN ('draft', 'preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying', 'passed', 'archived', '待验收', '验收中', '已通过', '未通过'));

ALTER TABLE public.acceptance_requirements
  DROP CONSTRAINT IF EXISTS fk_acceptance_requirements_drawing_package_id,
  ADD CONSTRAINT fk_acceptance_requirements_drawing_package_id
    FOREIGN KEY (drawing_package_id) REFERENCES public.drawing_packages(id) ON DELETE SET NULL;

ALTER TABLE public.certificate_dependencies
  DROP CONSTRAINT IF EXISTS certificate_dependencies_dependency_kind_check,
  DROP CONSTRAINT IF EXISTS certificate_dependencies_predecessor_type_check,
  DROP CONSTRAINT IF EXISTS certificate_dependencies_successor_type_check,
  ADD CONSTRAINT certificate_dependencies_dependency_kind_check
    CHECK (dependency_kind IN ('hard', 'soft')),
  ADD CONSTRAINT certificate_dependencies_predecessor_type_check
    CHECK (predecessor_type IN ('certificate', 'work_item')),
  ADD CONSTRAINT certificate_dependencies_successor_type_check
    CHECK (successor_type IN ('certificate', 'work_item'));

ALTER TABLE public.certificate_work_items
  DROP CONSTRAINT IF EXISTS certificate_work_items_item_stage_check,
  DROP CONSTRAINT IF EXISTS certificate_work_items_status_check,
  ADD CONSTRAINT certificate_work_items_item_stage_check
    CHECK (item_stage IN ('资料准备', '内部报审', '外部报批', '批复领证')),
  ADD CONSTRAINT certificate_work_items_status_check
    CHECK (status IN ('pending', 'in_progress', 'submitted', 'supplement_required', 'completed', 'blocked', 'cancelled', 'preparing_documents', 'internal_review', 'external_submission', 'approved', 'issued', 'expired', 'voided'));

ALTER TABLE public.engineering_objects
  DROP CONSTRAINT IF EXISTS engineering_objects_object_type_check,
  ADD CONSTRAINT engineering_objects_object_type_check
    CHECK (object_type IN ('phase', 'section', 'building', 'floor', 'zone', 'professional', 'subproject', 'custom', 'basement', 'physical_zone', 'functional_area'));

ALTER TABLE public.issues
  DROP CONSTRAINT IF EXISTS issues_severity_check,
  DROP CONSTRAINT IF EXISTS issues_source_type_check,
  DROP CONSTRAINT IF EXISTS issues_status_check,
  ADD CONSTRAINT issues_severity_check
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  ADD CONSTRAINT issues_source_type_check
    CHECK (source_type IN ('manual', 'risk_converted', 'risk_auto_escalated', 'obstacle_escalated', 'condition_expired', 'source_deleted')),
  ADD CONSTRAINT issues_status_check
    CHECK (status IN ('open', 'investigating', 'resolved', 'closed'));

ALTER TABLE public.job_execution_logs
  DROP CONSTRAINT IF EXISTS job_execution_logs_triggered_by_check,
  ADD CONSTRAINT job_execution_logs_triggered_by_check
    CHECK (triggered_by IN ('scheduler', 'manual', 'api'));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_company_id_fkey,
  ADD CONSTRAINT notifications_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.project_health_history
  DROP CONSTRAINT IF EXISTS project_health_history_health_status_check,
  ADD CONSTRAINT project_health_history_health_status_check
    CHECK (health_status IN ('健康', '亚健康', '预警', '危险', '待完善'));

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_construction_unlock_by_fkey,
  DROP CONSTRAINT IF EXISTS projects_health_score_check,
  DROP CONSTRAINT IF EXISTS projects_health_status_check,
  DROP CONSTRAINT IF EXISTS projects_owner_id_fkey,
  ADD CONSTRAINT projects_construction_unlock_by_fkey
    FOREIGN KEY (construction_unlock_by) REFERENCES public.users(id),
  ADD CONSTRAINT projects_health_score_check
    CHECK (health_score >= 0 AND health_score <= 100),
  ADD CONSTRAINT projects_health_status_check
    CHECK (health_status IN ('健康', '亚健康', '预警', '危险', '待完善')),
  ADD CONSTRAINT projects_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.users(id);

ALTER TABLE public.risks
  DROP CONSTRAINT IF EXISTS risks_source_type_check,
  DROP CONSTRAINT IF EXISTS risks_status_check,
  ADD CONSTRAINT risks_source_type_check
    CHECK (source_type IN ('manual', 'warning_converted', 'warning_auto_escalated', 'source_deleted', 'task_obstacle')),
  ADD CONSTRAINT risks_status_check
    CHECK (status IN ('identified', 'mitigating', 'monitoring', 'closed'));

ALTER TABLE public.task_baselines
  DROP CONSTRAINT IF EXISTS task_baselines_project_id_key,
  ADD CONSTRAINT task_baselines_project_id_key UNIQUE (project_id, version);

ALTER TABLE public.task_conditions
  DROP CONSTRAINT IF EXISTS fk_task_conditions_drawing_package_id,
  DROP CONSTRAINT IF EXISTS fk_task_conditions_project,
  DROP CONSTRAINT IF EXISTS task_conditions_condition_type_check,
  DROP CONSTRAINT IF EXISTS task_conditions_project_id_fkey,
  ADD CONSTRAINT fk_task_conditions_drawing_package_id
    FOREIGN KEY (drawing_package_id) REFERENCES public.drawing_packages(id) ON DELETE SET NULL,
  ADD CONSTRAINT task_conditions_condition_type_check
    CHECK (condition_type IN ('material', 'personnel', 'weather', 'design-change', 'preceding', 'other', '图纸', '材料', '人员', '设备', '手续', '其他')),
  ADD CONSTRAINT task_conditions_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.task_critical_overrides
  DROP CONSTRAINT IF EXISTS task_critical_overrides_anchor_type_check,
  DROP CONSTRAINT IF EXISTS task_critical_overrides_manual_insert_anchor_check,
  DROP CONSTRAINT IF EXISTS task_critical_overrides_manual_insert_anchor_ref_check,
  DROP CONSTRAINT IF EXISTS task_critical_overrides_mode_check,
  ADD CONSTRAINT task_critical_overrides_anchor_type_check
    CHECK (anchor_type IN ('before', 'after', 'between')),
  ADD CONSTRAINT task_critical_overrides_manual_insert_anchor_check
    CHECK (mode <> 'manual_insert' OR anchor_type IS NOT NULL),
  ADD CONSTRAINT task_critical_overrides_manual_insert_anchor_ref_check
    CHECK (mode <> 'manual_insert' OR left_task_id IS NOT NULL OR right_task_id IS NOT NULL),
  ADD CONSTRAINT task_critical_overrides_mode_check
    CHECK (mode IN ('manual_attention', 'manual_insert'));

ALTER TABLE public.task_obstacles
  DROP CONSTRAINT IF EXISTS task_obstacles_obstacle_type_check,
  DROP CONSTRAINT IF EXISTS task_obstacles_project_id_fkey,
  DROP CONSTRAINT IF EXISTS task_obstacles_status_check,
  DROP CONSTRAINT IF EXISTS task_obstacles_status_check_p7,
  ADD CONSTRAINT task_obstacles_obstacle_type_check
    CHECK (obstacle_type IN ('personnel', 'material', 'equipment', 'environment', 'design', 'procedure', 'funds', 'other', '人员', '材料', '设备', '环境', '设计', '手续', '资金', '其他')),
  ADD CONSTRAINT task_obstacles_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD CONSTRAINT task_obstacles_status_check_p7
    CHECK (status IN ('pending', 'active', 'resolving', 'resolved', 'closed', 'blocked', '待处理', '处理中', '已解决'));

ALTER TABLE public.task_preceding_relations
  DROP CONSTRAINT IF EXISTS uk_condition_task;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_parent_id_fkey,
  DROP CONSTRAINT IF EXISTS tasks_preceding_task_id_fkey,
  ADD CONSTRAINT tasks_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD CONSTRAINT tasks_preceding_task_id_fkey
    FOREIGN KEY (preceding_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

ALTER TABLE public.warnings
  DROP CONSTRAINT IF EXISTS warnings_project_id_fkey,
  DROP CONSTRAINT IF EXISTS warnings_task_id_fkey,
  ADD CONSTRAINT warnings_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD CONSTRAINT warnings_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE public.wbs_templates
  DROP CONSTRAINT IF EXISTS wbs_templates_status_check,
  ADD CONSTRAINT wbs_templates_status_check
    CHECK (status IN ('draft', 'published', 'disabled'));

-- Index reconciliation. Prefer IF NOT EXISTS for idempotence; drop/recreate
-- only where the existing live definition is the chosen canonical form.
DROP INDEX IF EXISTS public.idx_operation_logs_created_at;
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at
  ON public.operation_logs USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_catalog_id
  ON public.acceptance_plans (catalog_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_drawing_package_id
  ON public.acceptance_requirements (drawing_package_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_name
  ON public.job_execution_logs (job_name);
CREATE INDEX IF NOT EXISTS idx_job_logs_started
  ON public.job_execution_logs (started_at);
CREATE INDEX IF NOT EXISTS idx_job_logs_status
  ON public.job_execution_logs (status);
CREATE INDEX IF NOT EXISTS idx_task_conditions_project_id
  ON public.task_conditions (project_id);
CREATE INDEX IF NOT EXISTS idx_task_conditions_satisfied_target
  ON public.task_conditions (is_satisfied, target_date)
  WHERE target_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_preceding_task_id
  ON public.tasks (preceding_task_id);

CREATE INDEX IF NOT EXISTS idx_construction_drawings_project_created_at
  ON public.construction_drawings USING btree (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_construction_drawings_project_status_review
  ON public.construction_drawings USING btree (project_id, status, review_status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_lineage_batches_idempotent
  ON public.data_lineage_batches USING btree (project_id, batch_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_lineage_links_active_pair
  ON public.data_lineage_links USING btree (source_entity_type, source_entity_id, relation_type, target_entity_type, target_entity_id)
  WHERE mapping_status = 'active'::text;
CREATE INDEX IF NOT EXISTS idx_drawing_versions_package_created_at
  ON public.drawing_versions USING btree (package_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_company
  ON public.duration_benchmarks USING btree (company_id, benchmark_key)
  WHERE company_id IS NOT NULL AND project_id IS NULL AND is_current = true AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_global
  ON public.duration_benchmarks USING btree (benchmark_key)
  WHERE company_id IS NULL AND project_id IS NULL AND is_current = true AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_project
  ON public.duration_benchmarks USING btree (project_id, benchmark_key)
  WHERE project_id IS NOT NULL AND is_current = true AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_context_policy_parameters_current_key
  ON public.duration_context_policy_parameters USING btree (
    model_family,
    model_version,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    parameter_status,
    state_bucket,
    action_key
  );
CREATE INDEX IF NOT EXISTS idx_project_materials_project_expected
  ON public.project_materials USING btree (project_id, expected_arrival_date);
CREATE INDEX IF NOT EXISTS idx_task_preceding_relations_condition_id
  ON public.task_preceding_relations USING btree (condition_id);
CREATE INDEX IF NOT EXISTS idx_task_preceding_relations_task_id
  ON public.task_preceding_relations USING btree (task_id);
CREATE UNIQUE INDEX IF NOT EXISTS uk_task_preceding_relations_condition_task
  ON public.task_preceding_relations USING btree (condition_id, task_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_progress_snapshots_daily_event
  ON public.task_progress_snapshots USING btree (task_id, snapshot_date, event_type, event_source);

-- Retire old browser-side RLS policy expectations. Current app access is
-- backend service-role mediated; reintroducing these as live grants would
-- widen direct table access.
DROP POLICY IF EXISTS "acceptance_nodes_delete_own" ON public.acceptance_nodes;
DROP POLICY IF EXISTS "acceptance_nodes_insert_own" ON public.acceptance_nodes;
DROP POLICY IF EXISTS "acceptance_nodes_select_own" ON public.acceptance_nodes;
DROP POLICY IF EXISTS "acceptance_nodes_update_own" ON public.acceptance_nodes;
DROP POLICY IF EXISTS "acceptance_plans_delete_own" ON public.acceptance_plans;
DROP POLICY IF EXISTS "acceptance_plans_insert_own" ON public.acceptance_plans;
DROP POLICY IF EXISTS "acceptance_plans_select_own" ON public.acceptance_plans;
DROP POLICY IF EXISTS "acceptance_plans_update_own" ON public.acceptance_plans;
DROP POLICY IF EXISTS "job_execution_logs_select_own" ON public.job_execution_logs;
DROP POLICY IF EXISTS "milestones_delete_own" ON public.milestones;
DROP POLICY IF EXISTS "milestones_insert_own" ON public.milestones;
DROP POLICY IF EXISTS "milestones_select_own" ON public.milestones;
DROP POLICY IF EXISTS "milestones_update_own" ON public.milestones;
DROP POLICY IF EXISTS "pre_milestone_conditions_delete_own" ON public.pre_milestone_conditions;
DROP POLICY IF EXISTS "pre_milestone_conditions_insert_own" ON public.pre_milestone_conditions;
DROP POLICY IF EXISTS "pre_milestone_conditions_select_own" ON public.pre_milestone_conditions;
DROP POLICY IF EXISTS "pre_milestone_conditions_update_own" ON public.pre_milestone_conditions;
DROP POLICY IF EXISTS "pre_milestones_delete_own" ON public.pre_milestones;
DROP POLICY IF EXISTS "pre_milestones_insert_own" ON public.pre_milestones;
DROP POLICY IF EXISTS "pre_milestones_select_own" ON public.pre_milestones;
DROP POLICY IF EXISTS "pre_milestones_update_own" ON public.pre_milestones;
DROP POLICY IF EXISTS "projects_delete_own" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_own" ON public.projects;
DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
DROP POLICY IF EXISTS "projects_update_own" ON public.projects;
DROP POLICY IF EXISTS "task_completion_reports_insert_own" ON public.task_completion_reports;
DROP POLICY IF EXISTS "task_completion_reports_select_own" ON public.task_completion_reports;
DROP POLICY IF EXISTS "task_completion_reports_update_own" ON public.task_completion_reports;
DROP POLICY IF EXISTS "task_conditions_delete_own" ON public.task_conditions;
DROP POLICY IF EXISTS "task_conditions_insert_own" ON public.task_conditions;
DROP POLICY IF EXISTS "task_conditions_select_own" ON public.task_conditions;
DROP POLICY IF EXISTS "task_conditions_update_own" ON public.task_conditions;
DROP POLICY IF EXISTS "task_locks_select_own" ON public.task_locks;
DROP POLICY IF EXISTS "task_obstacles_delete_own" ON public.task_obstacles;
DROP POLICY IF EXISTS "task_obstacles_insert_own" ON public.task_obstacles;
DROP POLICY IF EXISTS "task_obstacles_select_own" ON public.task_obstacles;
DROP POLICY IF EXISTS "task_obstacles_update_own" ON public.task_obstacles;
DROP POLICY IF EXISTS "task_progress_snapshots_select_own" ON public.task_progress_snapshots;
DROP POLICY IF EXISTS "tasks_delete_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_own" ON public.tasks;
DROP POLICY IF EXISTS "允许读取项目预警" ON public.warnings;
DROP POLICY IF EXISTS "允许确认项目预警" ON public.warnings;
DROP POLICY IF EXISTS "允许删除已解决预警" ON public.warnings;
DROP POLICY IF EXISTS "wbs_structure_delete_own" ON public.wbs_structure;
DROP POLICY IF EXISTS "wbs_structure_insert_own" ON public.wbs_structure;
DROP POLICY IF EXISTS "wbs_structure_select_own" ON public.wbs_structure;
DROP POLICY IF EXISTS "wbs_structure_update_own" ON public.wbs_structure;
DROP POLICY IF EXISTS "wbs_task_links_delete_own" ON public.wbs_task_links;
DROP POLICY IF EXISTS "wbs_task_links_insert_own" ON public.wbs_task_links;
DROP POLICY IF EXISTS "wbs_task_links_select_own" ON public.wbs_task_links;
DROP POLICY IF EXISTS "wbs_task_links_update_own" ON public.wbs_task_links;
DROP POLICY IF EXISTS "wbs_templates_delete_own" ON public.wbs_templates;
DROP POLICY IF EXISTS "wbs_templates_insert_own" ON public.wbs_templates;
DROP POLICY IF EXISTS "wbs_templates_select" ON public.wbs_templates;
DROP POLICY IF EXISTS "wbs_templates_update_own" ON public.wbs_templates;

-- Keep current live dictionary/data-lineage policies as canonical.
DROP POLICY IF EXISTS "data_import_batches_read_policy" ON public.data_import_batches;
CREATE POLICY "data_import_batches_read_policy" ON public.data_import_batches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = data_import_batches.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS "data_import_batches_write_policy" ON public.data_import_batches;
CREATE POLICY "data_import_batches_write_policy" ON public.data_import_batches
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "data_import_rows_read_policy" ON public.data_import_rows;
CREATE POLICY "data_import_rows_read_policy" ON public.data_import_rows
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = data_import_rows.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS "data_import_rows_write_policy" ON public.data_import_rows;
CREATE POLICY "data_import_rows_write_policy" ON public.data_import_rows
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "data_lineage_batches_read_policy" ON public.data_lineage_batches;
CREATE POLICY "data_lineage_batches_read_policy" ON public.data_lineage_batches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = data_lineage_batches.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS "data_lineage_batches_write_policy" ON public.data_lineage_batches;
CREATE POLICY "data_lineage_batches_write_policy" ON public.data_lineage_batches
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "data_lineage_events_read_policy" ON public.data_lineage_events;
CREATE POLICY "data_lineage_events_read_policy" ON public.data_lineage_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = data_lineage_events.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS "data_lineage_events_write_policy" ON public.data_lineage_events;
CREATE POLICY "data_lineage_events_write_policy" ON public.data_lineage_events
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "status_aliases_read_policy" ON public.status_aliases;
CREATE POLICY "status_aliases_read_policy" ON public.status_aliases
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "status_aliases_write_policy" ON public.status_aliases;
CREATE POLICY "status_aliases_write_policy" ON public.status_aliases
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "status_derivation_rules_read_policy" ON public.status_derivation_rules;
CREATE POLICY "status_derivation_rules_read_policy" ON public.status_derivation_rules
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "status_derivation_rules_write_policy" ON public.status_derivation_rules;
CREATE POLICY "status_derivation_rules_write_policy" ON public.status_derivation_rules
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "status_dictionary_versions_read_policy" ON public.status_dictionary_versions;
CREATE POLICY "status_dictionary_versions_read_policy" ON public.status_dictionary_versions
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "status_dictionary_versions_write_policy" ON public.status_dictionary_versions;
CREATE POLICY "status_dictionary_versions_write_policy" ON public.status_dictionary_versions
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "status_domains_read_policy" ON public.status_domains;
CREATE POLICY "status_domains_read_policy" ON public.status_domains
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "status_domains_write_policy" ON public.status_domains;
CREATE POLICY "status_domains_write_policy" ON public.status_domains
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "status_transitions_read_policy" ON public.status_transitions;
CREATE POLICY "status_transitions_read_policy" ON public.status_transitions
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "status_transitions_write_policy" ON public.status_transitions;
CREATE POLICY "status_transitions_write_policy" ON public.status_transitions
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "status_values_read_policy" ON public.status_values;
CREATE POLICY "status_values_read_policy" ON public.status_values
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "status_values_write_policy" ON public.status_values;
CREATE POLICY "status_values_write_policy" ON public.status_values
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- Strengthen existing live policies where the migration-derived expected
-- semantics are stricter or product-correct.
DROP POLICY IF EXISTS "acceptance_records_select_policy" ON public.acceptance_records;
CREATE POLICY "acceptance_records_select_policy" ON public.acceptance_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.acceptance_plans ap
      WHERE ap.id = acceptance_records.acceptance_plan_id
    )
  );

DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
CREATE POLICY "notifications_select_policy" ON public.notifications
  FOR SELECT USING (user_id = auth.uid() OR is_system = TRUE);

DROP POLICY IF EXISTS "phases_select_policy" ON public.phases;
CREATE POLICY "phases_select_policy" ON public.phases
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = phases.project_id
    )
  );

DROP POLICY IF EXISTS "health_history_select" ON public.project_health_history;
CREATE POLICY "health_history_select" ON public.project_health_history
  FOR SELECT USING (
    project_id IN (
      SELECT projects.id FROM public.projects
      WHERE projects.id = project_health_history.project_id
    )
  );

DROP POLICY IF EXISTS "task_progress_history_select_policy" ON public.task_progress_history;
CREATE POLICY "task_progress_history_select_policy" ON public.task_progress_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_progress_history.task_id
        AND t.deleted_at IS NULL
    )
  );

COMMIT;
