-- 125_create_data_lineage_mapping_system.sql
-- v1.4.6 Data lineage and mapping system.

BEGIN;

-- ============================================================
-- 1. data_lineage_entity_types
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_entity_types (
  entity_type TEXT PRIMARY KEY,
  entity_name TEXT NOT NULL,
  entity_group TEXT NOT NULL,
  table_name TEXT,
  id_column TEXT NOT NULL DEFAULT 'id',
  project_id_column TEXT DEFAULT 'project_id',
  is_project_scoped BOOLEAN NOT NULL DEFAULT true,
  is_global_reference BOOLEAN NOT NULL DEFAULT false,
  is_business_lineage_allowed BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT (is_project_scoped AND is_global_reference))
);

-- Bootstrap entity types
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, table_name, is_project_scoped, is_global_reference) VALUES
  ('wbs_template', 'WBS模板', 'planning', 'wbs_templates', false, true),
  ('wbs_template_node', 'WBS模板节点', 'planning', null, false, true),
  ('task_baseline', '项目基线', 'planning', 'task_baselines', true, false),
  ('task_baseline_item', '项目基线行', 'planning', 'task_baseline_items', true, false),
  ('monthly_plan', '月度计划', 'planning', 'monthly_plans', true, false),
  ('monthly_plan_item', '月度计划行', 'planning', 'monthly_plan_items', true, false),
  ('task', '施工任务', 'task', 'tasks', true, false),
  ('task_dependency', '任务依赖', 'task', 'task_dependencies', true, false),
  ('task_condition', '前置条件', 'task', 'task_conditions', true, false),
  ('task_obstacle', '阻碍事项', 'task', 'task_obstacles', true, false),
  ('milestone', '里程碑', 'milestone', 'milestones', true, false),
  ('risk', '风险', 'risk', 'risks', true, false),
  ('issue', '问题', 'issue', 'issues', true, false),
  ('warning', '预警', 'warning', 'warnings', true, false),
  ('notification', '通知', 'notification', 'notifications', true, false),
  ('acceptance_plan', '验收计划', 'acceptance', 'acceptance_plans', true, false),
  ('acceptance_dependency', '验收依赖', 'acceptance', 'acceptance_dependencies', true, false),
  ('acceptance_requirement', '验收条件', 'acceptance', 'acceptance_requirements', true, false),
  ('construction_drawing', '施工图纸', 'drawing', 'construction_drawings', true, false),
  ('drawing_package', '图纸包', 'drawing', 'drawing_packages', true, false),
  ('drawing_version', '图纸版本', 'drawing', 'drawing_versions', true, false),
  ('certificate', '证照', 'certificate', 'pre_milestones', true, false),
  ('certificate_work_item', '证照工作项', 'certificate', 'certificate_work_items', true, false),
  ('certificate_dependency', '证照依赖', 'certificate', 'certificate_dependencies', true, false),
  ('pre_milestone', '前置里程碑', 'certificate', 'pre_milestones', true, false),
  ('engineering_object', '工程对象', 'master_data', 'engineering_objects', true, false),
  ('engineering_category', '工程分类', 'master_data', 'engineering_categories', true, false),
  ('project_material', '材料', 'material', 'project_materials', true, false),
  ('change_log', '变更日志', 'governance', 'change_logs', true, false),
  ('data_quality_finding', '数据质量发现', 'governance', 'data_quality_findings', true, false),
  ('project_daily_snapshot', '项目日报', 'bi', 'project_daily_snapshot', true, false),
  ('task_progress_snapshot', '进度快照', 'task', 'task_progress_snapshots', true, false),
  ('standard_process', '标准工序', 'reference', 'standard_processes', false, true),
  ('acceptance_catalog', '验收目录', 'reference', 'acceptance_catalog', false, true),
  ('import_batch', '导入批次', 'import', null, true, false),
  ('external_record', '外部记录', 'external', null, false, true),
  ('task_progress_snapshot', '进度快照', 'task', 'task_progress_snapshots', true, false),
  ('task_timeline_event', '任务时间轴事件', 'task', 'task_timeline_events', true, false),
  ('task_milestone', '任务里程碑关联', 'task', 'task_milestones', true, false),
  ('task_critical_override', '关键路径人工干预', 'task', 'task_critical_overrides', true, false),
  ('task_preceding_relation', '任务前置关系', 'task', 'task_preceding_relations', true, false),
  ('acceptance_record', '验收记录', 'acceptance', 'acceptance_records', true, false),
  ('acceptance_catalog', '验收目录参考', 'reference', 'acceptance_catalog', false, true),
  ('drawing_review_rule', '图纸审查规则', 'drawing', 'drawing_review_rules', true, false),
  ('drawing_package_item', '图纸包明细', 'drawing', 'drawing_package_items', true, false),
  ('pre_milestone_condition', '前置里程碑条件', 'certificate', 'pre_milestone_conditions', true, false),
  ('pre_milestone_dependency', '前置里程碑依赖', 'certificate', 'pre_milestone_dependencies', true, false),
  ('certificate_approval', '证照审批历史', 'certificate', 'certificate_approvals', true, false),
  ('responsibility_watchlist', '责任预警清单', 'governance', 'responsibility_watchlist', true, false),
  ('weekly_digest', '周报', 'report', 'weekly_digests', true, false),
  ('risk_statistics', '风险统计快照', 'risk', 'risk_statistics', true, false),
  ('planning_governance_signal', '计划治理信号', 'planning', 'planning_governance', true, false),
  ('data_confidence_snapshot', '数据可信度快照', 'governance', 'data_confidence_snapshots', true, false),
  ('wbs_structure', '历史WBS结构', 'compat', 'wbs_structure', true, false),
  ('wbs_task_link', '历史WBS任务关联', 'compat', 'wbs_task_links', true, false),
  ('standard_process', '标准工序参考', 'reference', 'standard_processes', false, true)
ON CONFLICT (entity_type) DO NOTHING;

-- Technical objects: lineage not allowed
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, is_business_lineage_allowed, is_project_scoped) VALUES
  ('operation_log', '操作日志', 'technical', false, false),
  ('task_lock', '任务锁', 'technical', false, false),
  ('planning_draft_lock', '计划草稿锁', 'technical', false, false),
  ('job_execution_log', '任务执行日志', 'technical', false, false),
  ('trigger_execution_log', '触发器执行日志', 'technical', false, false)
ON CONFLICT (entity_type) DO NOTHING;

-- ============================================================
-- 2. data_lineage_relation_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_relation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_type TEXT NOT NULL REFERENCES data_lineage_entity_types(entity_type),
  relation_type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL REFERENCES data_lineage_entity_types(entity_type),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_entity_type, relation_type, target_entity_type)
);

-- Bootstrap core relation rules
INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type) VALUES
  ('wbs_template_node', 'generates', 'task_baseline_item'),
  ('wbs_template_node', 'generates', 'task'),
  ('task_baseline_item', 'derives', 'monthly_plan_item'),
  ('monthly_plan_item', 'derives', 'task'),
  ('monthly_plan_item', 'carries_over_to', 'monthly_plan_item'),
  ('task', 'splits_into', 'task'),
  ('task', 'merged_from', 'task'),
  ('task', 'replaced_by', 'task'),
  ('import_batch', 'contains', 'task'),
  ('task', 'generates', 'task_baseline_item'),
  ('task', 'carries_over_to', 'monthly_plan_item'),
  ('risk', 'escalates_to', 'issue'),
  ('warning', 'escalates_to', 'risk'),
  ('task_obstacle', 'escalates_to', 'issue'),
  ('task_condition', 'blocks', 'task'),
  ('task_dependency', 'depends_on', 'task'),
  ('acceptance_plan', 'validates', 'task'),
  ('acceptance_dependency', 'depends_on', 'acceptance_plan'),
  ('construction_drawing', 'supports', 'task'),
  ('drawing_version', 'versions', 'construction_drawing'),
  ('project_material', 'supplies', 'task'),
  ('certificate', 'validates', 'milestone'),
  ('certificate_dependency', 'depends_on', 'certificate')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;

-- ============================================================
-- 3. data_lineage_links
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  batch_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lineage_links_project ON data_lineage_links(project_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_source ON data_lineage_links(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_target ON data_lineage_links(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_batch ON data_lineage_links(batch_ref) WHERE batch_ref IS NOT NULL;

ALTER TABLE data_lineage_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_lineage_links_read_policy ON data_lineage_links;
CREATE POLICY data_lineage_links_read_policy ON data_lineage_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = data_lineage_links.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role')
  );
DROP POLICY IF EXISTS data_lineage_links_write_policy ON data_lineage_links;
CREATE POLICY data_lineage_links_write_policy ON data_lineage_links
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 4. AI Governance boundary (v1.4.6 §11)
-- AI tools may READ lineage for context, but must NOT directly write
-- lineage_links, tasks, or any production data. AI output is limited to
-- explanation, suggestion, and repair drafts only.
-- ============================================================
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, is_business_lineage_allowed, is_project_scoped) VALUES
  ('ai_suggestion', 'AI建议草案', 'governance', false, false),
  ('ai_repair_draft', 'AI修复草案', 'governance', false, false),
  ('ai_context_query', 'AI上下文查询', 'governance', false, false)
ON CONFLICT (entity_type) DO NOTHING;

INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type) VALUES
  ('ai_context_query', 'reads', 'task'),
  ('ai_suggestion', 'suggests', 'task'),
  ('ai_repair_draft', 'drafts_fix_for', 'task')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;

COMMIT;
