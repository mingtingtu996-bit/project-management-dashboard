-- 057: 新建 change_logs 表 —— 核心变更记录
-- 前置依赖：056_create_issues_table.sql（issues 表已建立）
-- 字段定义依据：《业务流程优化清单.md》§六 change_logs 行
-- 范围精简：任务排期/状态变更、延期记录、风险/问题状态变更、
--           月度计划修正、强制操作、跨月重开、承接关闭原因、基线修订

CREATE TABLE IF NOT EXISTS change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- 变更对象
  entity_type VARCHAR(60) NOT NULL
    CHECK (entity_type IN (
      'task',
      'risk',
      'issue',
      'delay_request',
      'milestone',
      'monthly_plan',
      'baseline',
      'task_condition',
      'task_obstacle'
    )),
  entity_id UUID NOT NULL,

  -- 变更字段与值
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,

  -- 变更原因与操作信息
  change_reason TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 变更来源标记（system_auto / manual_adjusted / admin_force / approval）
  change_source VARCHAR(40) NOT NULL DEFAULT 'manual_adjusted'
    CHECK (change_source IN (
      'system_auto',
      'manual_adjusted',
      'admin_force',
      'approval',
      'monthly_plan_correction',
      'baseline_revision'
    ))
);

-- ─── 索引 ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_change_logs_entity ON change_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_project ON change_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_changed_at ON change_logs (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_logs_changed_by ON change_logs (changed_by)
  WHERE changed_by IS NOT NULL;
