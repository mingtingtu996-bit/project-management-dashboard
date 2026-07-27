-- 124_create_status_dictionary_system.sql
-- v1.4.5 Status and lifecycle dictionary system.

BEGIN;

-- ============================================================
-- 1. status_dictionary_versions (created first for FK references)
-- ============================================================
CREATE TABLE IF NOT EXISTS status_dictionary_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key TEXT NOT NULL UNIQUE,
  version_name TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  content_hash TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Bootstrap the current version
INSERT INTO status_dictionary_versions (version_key, version_name, change_reason)
VALUES ('v1.4.5', 'v1.4.5 Initial Status Dictionary', 'System bootstrap')
ON CONFLICT (version_key) DO NOTHING;

-- ============================================================
-- 2. status_domains
-- ============================================================
CREATE TABLE IF NOT EXISTS status_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL UNIQUE,
  domain_name TEXT NOT NULL,
  domain_group TEXT NOT NULL,
  status_kind TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status_kind IN ('lifecycle','derived','stage','activation','adjacent','technical'))
);

-- Bootstrap core domains
INSERT INTO status_domains (domain_key, domain_name, domain_group, status_kind) VALUES
  ('task.lifecycle', '任务生命周期', 'task', 'lifecycle'),
  ('task.business_status', '任务业务状态', 'task', 'derived'),
  ('task.lag_status', '任务滞后状态', 'task', 'derived'),
  ('task.due_status', '任务到期状态', 'task', 'derived'),
  ('baseline.lifecycle', '项目基线生命周期', 'planning', 'lifecycle'),
  ('monthly_plan.lifecycle', '月度计划生命周期', 'planning', 'lifecycle'),
  ('milestone.lifecycle', '里程碑生命周期', 'milestone', 'lifecycle'),
  ('condition.lifecycle', '条件生命周期', 'condition', 'lifecycle'),
  ('obstacle.lifecycle', '阻碍生命周期', 'obstacle', 'lifecycle'),
  ('risk.lifecycle', '风险生命周期', 'risk', 'lifecycle'),
  ('issue.lifecycle', '问题生命周期', 'issue', 'lifecycle'),
  ('warning.lifecycle', '预警生命周期', 'warning', 'lifecycle'),
  ('notification.lifecycle', '通知生命周期', 'notification', 'lifecycle'),
  ('acceptance.lifecycle', '验收生命周期', 'acceptance', 'lifecycle'),
  ('certificate.lifecycle', '证照生命周期', 'certificate', 'lifecycle'),
  ('certificate.stage', '证照阶段', 'certificate', 'stage'),
  ('drawing.lifecycle', '图纸生命周期', 'drawing', 'lifecycle'),
  ('drawing.review_status', '图纸审查状态', 'drawing', 'derived'),
  ('project.lifecycle', '项目生命周期', 'project', 'lifecycle'),
  ('project.phase', '项目阶段', 'project', 'stage'),
  ('project.health', '项目健康状态', 'project', 'derived'),
  ('material.derived_status', '材料派生状态', 'material', 'derived'),
  ('wbs_template.lifecycle', 'WBS模板生命周期', 'template', 'lifecycle'),
  ('engineering_object.activation', '工程对象启停', 'master_data', 'activation'),
  ('engineering_category.activation', '工程分类启停', 'master_data', 'activation'),
  ('invitation.lifecycle', '邀请生命周期', 'collaboration', 'lifecycle'),
  ('data_quality.finding_status', '数据质量发现状态', 'governance', 'lifecycle'),
  ('data_quality.confidence_flag', '数据可信度', 'governance', 'adjacent'),
  ('task_completion.efficiency_status', '任务完成效率', 'task', 'derived'),
  ('progress_deviation.row_status', '进度偏差行状态', 'report', 'derived'),
  ('delay_signal.derived_status', '延期信号派生', 'task', 'derived')
ON CONFLICT (domain_key) DO NOTHING;

-- ============================================================
-- 3. status_values
-- ============================================================
CREATE TABLE IF NOT EXISTS status_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  status_key TEXT NOT NULL,
  status_label TEXT NOT NULL,
  status_label_short TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_initial BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  visual_tone TEXT,
  semantic_tone TEXT,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, status_key)
);

-- Bootstrap core status values
INSERT INTO status_values (domain_key, status_key, status_label, sort_order, is_initial, is_terminal, visual_tone, semantic_tone) VALUES
  ('task.lifecycle', 'todo', '待办', 1, false, false, 'slate', 'open'),
  ('task.lifecycle', 'pending', '待定', 2, true, false, 'slate', 'open'),
  ('task.lifecycle', 'in_progress', '进行中', 3, false, false, 'blue', 'active'),
  ('task.lifecycle', 'blocked', '受阻', 4, false, false, 'amber', 'blocked'),
  ('task.lifecycle', 'completed', '已完成', 5, false, true, 'green', 'closed'),
  ('task.lifecycle', 'cancelled', '已取消', 6, false, true, 'slate', 'closed'),
  ('risk.lifecycle', 'identified', '已识别', 1, true, false, 'amber', 'open'),
  ('risk.lifecycle', 'mitigating', '缓解中', 2, false, false, 'blue', 'active'),
  ('risk.lifecycle', 'closed', '已关闭', 3, false, true, 'green', 'closed'),
  ('issue.lifecycle', 'open', '未解决', 1, true, false, 'red', 'open'),
  ('issue.lifecycle', 'investigating', '调查中', 2, false, false, 'amber', 'active'),
  ('issue.lifecycle', 'resolved', '已解决', 3, false, false, 'blue', 'active'),
  ('issue.lifecycle', 'closed', '已关闭', 4, false, true, 'green', 'closed'),
  ('condition.lifecycle', 'open', '待满足', 1, true, false, 'slate', 'open'),
  ('condition.lifecycle', 'met', '已满足', 2, false, false, 'blue', 'active'),
  ('condition.lifecycle', 'confirmed', '已确认', 3, false, true, 'green', 'closed'),
  ('condition.lifecycle', 'blocked', '受阻', 4, false, false, 'amber', 'blocked'),
  ('condition.lifecycle', 'closed', '已关闭', 5, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'open', '待处理', 1, true, false, 'amber', 'open'),
  ('obstacle.lifecycle', 'resolving', '处理中', 2, false, false, 'blue', 'active'),
  ('obstacle.lifecycle', 'resolved', '已解决', 3, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'closed', '已关闭', 4, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'unresolvable', '无法解决', 5, false, true, 'red', 'blocked'),
  ('acceptance.lifecycle', 'draft', '草稿', 1, true, false, 'slate', 'open'),
  ('acceptance.lifecycle', 'preparing', '准备中', 2, false, false, 'blue', 'active'),
  ('acceptance.lifecycle', 'ready_to_submit', '待报验', 3, false, false, 'amber', 'active'),
  ('acceptance.lifecycle', 'submitted', '已报验', 4, false, false, 'amber', 'active'),
  ('acceptance.lifecycle', 'inspecting', '验收中', 5, false, false, 'blue', 'active'),
  ('acceptance.lifecycle', 'rectifying', '整改中', 6, false, false, 'red', 'blocked'),
  ('acceptance.lifecycle', 'passed', '已通过', 7, false, true, 'green', 'closed'),
  ('acceptance.lifecycle', 'archived', '已归档', 8, false, true, 'green', 'closed'),
  ('project.lifecycle', 'not_started', '未开始', 1, true, false, 'slate', 'open'),
  ('project.lifecycle', 'in_progress', '进行中', 2, false, false, 'blue', 'active'),
  ('project.lifecycle', 'completed', '已完成', 3, false, true, 'green', 'closed'),
  ('project.lifecycle', 'paused', '已暂停', 4, false, false, 'amber', 'blocked'),
  ('project.health', 'healthy', '健康', 1, false, false, 'green', 'positive'),
  ('project.health', 'warning', '亚健康', 2, false, false, 'amber', 'caution'),
  ('project.health', 'critical', '预警', 3, false, false, 'red', 'negative'),
  ('project.health', 'danger', '危险', 4, false, false, 'red', 'negative'),
  ('certificate.lifecycle', 'pending', '待办理', 1, true, false, 'slate', 'open'),
  ('certificate.lifecycle', 'preparing_documents', '资料准备中', 2, false, false, 'blue', 'active'),
  ('certificate.lifecycle', 'internal_review', '内部报审', 3, false, false, 'amber', 'active'),
  ('certificate.lifecycle', 'external_submission', '外部报批', 4, false, false, 'amber', 'active'),
  ('certificate.lifecycle', 'supplement_required', '需补正', 5, false, false, 'red', 'blocked'),
  ('certificate.lifecycle', 'approved', '已批复', 6, false, false, 'blue', 'active'),
  ('certificate.lifecycle', 'issued', '已取得', 7, false, true, 'green', 'closed'),
  ('certificate.lifecycle', 'expired', '已过期', 8, false, true, 'red', 'closed'),
  ('certificate.lifecycle', 'voided', '已作废', 9, false, true, 'slate', 'closed'),
  ('drawing.lifecycle', 'preparing', '编制中', 1, true, false, 'slate', 'open'),
  ('drawing.lifecycle', 'reviewing', '审图中', 2, false, false, 'blue', 'active'),
  ('drawing.lifecycle', 'revising', '修改中', 3, false, false, 'amber', 'blocked'),
  ('drawing.lifecycle', 'issued', '已出图', 4, false, false, 'blue', 'active'),
  ('drawing.lifecycle', 'completed', '已完成', 5, false, true, 'green', 'closed'),
  ('drawing.lifecycle', 'voided', '已作废', 6, false, true, 'slate', 'closed'),
  ('drawing.review_status', 'not_submitted', '未提交', 1, true, false, 'slate', 'open'),
  ('drawing.review_status', 'reviewing', '审查中', 2, false, false, 'blue', 'active'),
  ('drawing.review_status', 'approved', '已通过', 3, false, false, 'green', 'closed'),
  ('drawing.review_status', 'rejected', '已驳回', 4, false, false, 'red', 'blocked'),
  ('drawing.review_status', 'revision_required', '需修改', 5, false, false, 'amber', 'blocked'),
  ('baseline.lifecycle', 'draft', '草稿', 1, true, false, 'slate', 'open'),
  ('baseline.lifecycle', 'confirmed', '已确认', 2, false, false, 'green', 'closed'),
  ('baseline.lifecycle', 'closed', '已关闭', 3, false, true, 'slate', 'closed'),
  ('baseline.lifecycle', 'revising', '修订中', 4, false, false, 'amber', 'active'),
  ('baseline.lifecycle', 'pending_realign', '待重整', 5, false, false, 'amber', 'active'),
  ('baseline.lifecycle', 'archived', '已归档', 6, false, true, 'slate', 'closed'),
  ('monthly_plan.lifecycle', 'draft', '草稿', 1, true, false, 'slate', 'open'),
  ('monthly_plan.lifecycle', 'confirmed', '已确认', 2, false, false, 'green', 'closed'),
  ('monthly_plan.lifecycle', 'closed', '已关闭', 3, false, true, 'slate', 'closed'),
  ('monthly_plan.lifecycle', 'revising', '修订中', 4, false, false, 'amber', 'active'),
  ('monthly_plan.lifecycle', 'pending_realign', '待重整', 5, false, false, 'amber', 'active'),
  ('milestone.lifecycle', 'pending', '待完成', 1, true, false, 'slate', 'open'),
  ('milestone.lifecycle', 'in_progress', '进行中', 2, false, false, 'blue', 'active'),
  ('milestone.lifecycle', 'completed', '已完成', 3, false, true, 'green', 'closed'),
  ('milestone.lifecycle', 'overdue', '已逾期', 4, false, false, 'red', 'blocked'),
  ('warning.lifecycle', 'unread', '未读', 1, true, false, 'amber', 'open'),
  ('warning.lifecycle', 'acknowledged', '已确认', 2, false, false, 'blue', 'active'),
  ('warning.lifecycle', 'muted', '已静默', 3, false, false, 'slate', 'closed'),
  ('warning.lifecycle', 'escalated', '已升级', 4, false, false, 'red', 'active'),
  ('warning.lifecycle', 'resolved', '已解决', 5, false, false, 'green', 'closed'),
  ('warning.lifecycle', 'archived', '已归档', 6, false, true, 'slate', 'closed'),
  ('warning.lifecycle', 'closed', '已关闭', 7, false, true, 'green', 'closed'),
  ('notification.lifecycle', 'unread', '未读', 1, true, false, 'slate', 'open'),
  ('notification.lifecycle', 'read', '已读', 2, false, false, 'slate', 'closed'),
  ('notification.lifecycle', 'archived', '已归档', 3, false, true, 'slate', 'closed'),
  ('wbs_template.lifecycle', 'draft', '草稿', 1, true, false, 'slate', 'open'),
  ('wbs_template.lifecycle', 'published', '已发布', 2, false, false, 'green', 'closed'),
  ('wbs_template.lifecycle', 'disabled', '已禁用', 3, false, true, 'slate', 'closed'),
  ('engineering_object.activation', 'active', '启用', 1, true, false, 'green', 'active'),
  ('engineering_object.activation', 'inactive', '停用', 2, false, true, 'slate', 'closed'),
  ('engineering_category.activation', 'enabled', '启用', 1, true, false, 'green', 'active'),
  ('engineering_category.activation', 'disabled', '禁用', 2, false, true, 'slate', 'closed'),
  ('invitation.lifecycle', 'active', '有效', 1, true, false, 'green', 'active'),
  ('invitation.lifecycle', 'used', '已使用', 2, false, true, 'blue', 'closed'),
  ('invitation.lifecycle', 'revoked', '已撤销', 3, false, true, 'red', 'closed'),
  ('invitation.lifecycle', 'expired', '已过期', 4, false, true, 'slate', 'closed'),
  ('data_quality.finding_status', 'active', '活跃', 1, true, false, 'amber', 'open'),
  ('data_quality.finding_status', 'resolved', '已解决', 2, false, false, 'green', 'closed'),
  ('data_quality.finding_status', 'ignored', '已忽略', 3, false, true, 'slate', 'closed')
ON CONFLICT (domain_key, status_key) DO NOTHING;

-- ============================================================
-- 4. status_aliases
-- ============================================================
CREATE TABLE IF NOT EXISTS status_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  alias_value TEXT NOT NULL,
  status_key TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'legacy',
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, alias_value)
);

-- Add FK to status_values
ALTER TABLE status_aliases DROP CONSTRAINT IF EXISTS status_aliases_status_key_fkey;
ALTER TABLE status_aliases ADD CONSTRAINT status_aliases_status_key_fkey
  FOREIGN KEY (domain_key, status_key) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

-- Bootstrap legacy aliases
INSERT INTO status_aliases (domain_key, alias_value, status_key, source_type) VALUES
  ('task.lifecycle', 'not_started', 'todo', 'legacy'),
  ('task.lifecycle', '未开始', 'todo', 'legacy'),
  ('task.lifecycle', '进行中', 'in_progress', 'legacy'),
  ('task.lifecycle', '已完成', 'completed', 'legacy'),
  ('task.lifecycle', 'done', 'completed', 'legacy'),
  ('task.lifecycle', 'delayed', 'blocked', 'legacy'),
  ('task.lifecycle', 'on_hold', 'blocked', 'legacy'),
  ('task.lifecycle', '已取消', 'cancelled', 'legacy'),
  ('task.lifecycle', 'voided', 'cancelled', 'legacy'),
  ('task.lifecycle', 'archived', 'cancelled', 'legacy'),
  ('task.lifecycle', 'deleted', 'cancelled', 'legacy'),
  ('project.lifecycle', '未开始', 'not_started', 'legacy'),
  ('project.lifecycle', '进行中', 'in_progress', 'legacy'),
  ('project.lifecycle', '已完成', 'completed', 'legacy'),
  ('project.lifecycle', '已暂停', 'paused', 'legacy')
ON CONFLICT (domain_key, alias_value) DO NOTHING;

-- ============================================================
-- 5. status_transitions
-- ============================================================
CREATE TABLE IF NOT EXISTS status_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  event_key TEXT,
  actor_scope TEXT NOT NULL DEFAULT 'system_or_user',
  guard_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK to status_values
ALTER TABLE status_transitions DROP CONSTRAINT IF EXISTS status_transitions_from_status_fkey;
ALTER TABLE status_transitions ADD CONSTRAINT status_transitions_from_status_fkey
  FOREIGN KEY (domain_key, from_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;
ALTER TABLE status_transitions DROP CONSTRAINT IF EXISTS status_transitions_to_status_fkey;
ALTER TABLE status_transitions ADD CONSTRAINT status_transitions_to_status_fkey
  FOREIGN KEY (domain_key, to_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_status_transitions_domain_from_to_event
  ON status_transitions(domain_key, from_status, to_status, COALESCE(event_key, ''));

-- Bootstrap task transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('task.lifecycle', 'pending', 'todo'),
  ('task.lifecycle', 'todo', 'in_progress'),
  ('task.lifecycle', 'pending', 'in_progress'),
  ('task.lifecycle', 'in_progress', 'blocked'),
  ('task.lifecycle', 'in_progress', 'completed'),
  ('task.lifecycle', 'blocked', 'in_progress'),
  ('task.lifecycle', 'todo', 'cancelled'),
  ('task.lifecycle', 'pending', 'cancelled'),
  ('task.lifecycle', 'in_progress', 'cancelled'),
  ('task.lifecycle', 'blocked', 'cancelled')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- Bootstrap risk transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('risk.lifecycle', 'identified', 'mitigating'),
  ('risk.lifecycle', 'mitigating', 'closed'),
  ('risk.lifecycle', 'closed', 'identified')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- Bootstrap issue transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('issue.lifecycle', 'open', 'investigating'),
  ('issue.lifecycle', 'investigating', 'resolved'),
  ('issue.lifecycle', 'resolved', 'closed'),
  ('issue.lifecycle', 'resolved', 'investigating')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- v1.4.7: Bootstrap baseline transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('baseline.lifecycle', 'draft', 'confirmed'),
  ('baseline.lifecycle', 'confirmed', 'closed'),
  ('baseline.lifecycle', 'confirmed', 'revising'),
  ('baseline.lifecycle', 'revising', 'confirmed'),
  ('baseline.lifecycle', 'closed', 'archived'),
  ('baseline.lifecycle', 'draft', 'archived'),
  ('baseline.lifecycle', 'revising', 'archived'),
  ('baseline.lifecycle', 'confirmed', 'archived'),
  ('baseline.lifecycle', 'confirmed', 'pending_realign'),
  ('baseline.lifecycle', 'pending_realign', 'revising'),
  ('baseline.lifecycle', 'pending_realign', 'confirmed')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- v1.4.7: Bootstrap monthly plan transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('monthly_plan.lifecycle', 'draft', 'confirmed'),
  ('monthly_plan.lifecycle', 'confirmed', 'closed'),
  ('monthly_plan.lifecycle', 'confirmed', 'revising'),
  ('monthly_plan.lifecycle', 'revising', 'confirmed'),
  ('monthly_plan.lifecycle', 'draft', 'closed'),
  ('monthly_plan.lifecycle', 'revising', 'closed'),
  ('monthly_plan.lifecycle', 'confirmed', 'pending_realign'),
  ('monthly_plan.lifecycle', 'pending_realign', 'revising'),
  ('monthly_plan.lifecycle', 'pending_realign', 'confirmed')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- v1.4.8: Bootstrap condition transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('condition.lifecycle', 'open', 'met'),
  ('condition.lifecycle', 'met', 'confirmed'),
  ('condition.lifecycle', 'open', 'blocked'),
  ('condition.lifecycle', 'blocked', 'open'),
  ('condition.lifecycle', 'met', 'closed'),
  ('condition.lifecycle', 'confirmed', 'closed'),
  ('condition.lifecycle', 'blocked', 'closed')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- v1.4.8: Bootstrap obstacle transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('obstacle.lifecycle', 'open', 'resolving'),
  ('obstacle.lifecycle', 'resolving', 'resolved'),
  ('obstacle.lifecycle', 'resolved', 'closed'),
  ('obstacle.lifecycle', 'open', 'unresolvable'),
  ('obstacle.lifecycle', 'unresolvable', 'open'),
  ('obstacle.lifecycle', 'closed', 'open')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- ============================================================
-- 6. status_derivation_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS status_derivation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_order INTEGER NOT NULL DEFAULT 0,
  output_status TEXT NOT NULL,
  rule_description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, rule_key)
);

ALTER TABLE status_derivation_rules DROP CONSTRAINT IF EXISTS status_derivation_rules_output_status_fkey;
ALTER TABLE status_derivation_rules ADD CONSTRAINT status_derivation_rules_output_status_fkey
  FOREIGN KEY (domain_key, output_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

-- ============================================================
-- 7. RLS on all status dictionary tables
-- ============================================================
ALTER TABLE status_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_derivation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_dictionary_versions ENABLE ROW LEVEL SECURITY;

-- All status tables: read for anyone, write for service_role only
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['status_domains','status_values','status_transitions','status_aliases','status_derivation_rules','status_dictionary_versions'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_read_policy ON %I FOR SELECT USING (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_write_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_write_policy ON %I FOR ALL USING ((SELECT current_setting(''role'', true) = ''service_role'')) WITH CHECK ((SELECT current_setting(''role'', true) = ''service_role''))', tbl, tbl);
  END LOOP;
END $$;

COMMIT;
