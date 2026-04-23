-- 关键路径 overrides 表
-- 说明：
-- 1. manual_attention 只做高亮/摘要提示
-- 2. manual_insert 需要由服务层校验锚点
-- 3. 历史 tasks.is_critical 作为兼容数据回填到 manual_attention

CREATE TABLE IF NOT EXISTS task_critical_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  mode VARCHAR(32) NOT NULL CHECK (mode IN ('manual_attention', 'manual_insert')),
  anchor_type VARCHAR(16) CHECK (anchor_type IN ('before', 'after', 'between')),
  left_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  right_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT task_critical_overrides_unique_task_mode UNIQUE (project_id, task_id, mode),
  CONSTRAINT task_critical_overrides_manual_insert_anchor_check CHECK (
    mode <> 'manual_insert'
    OR anchor_type IS NOT NULL
  ),
  CONSTRAINT task_critical_overrides_manual_insert_anchor_ref_check CHECK (
    mode <> 'manual_insert'
    OR left_task_id IS NOT NULL
    OR right_task_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_task_critical_overrides_project_id
  ON task_critical_overrides(project_id);

CREATE INDEX IF NOT EXISTS idx_task_critical_overrides_task_id
  ON task_critical_overrides(task_id);

-- 兼容回填：将历史 is_critical 标记迁移为 manual_attention
INSERT INTO task_critical_overrides (
  id,
  project_id,
  task_id,
  mode,
  anchor_type,
  left_task_id,
  right_task_id,
  reason,
  created_by,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  t.project_id,
  t.id,
  'manual_attention',
  NULL,
  NULL,
  NULL,
  'migrated from tasks.is_critical',
  NULL,
  NOW(),
  NOW()
FROM tasks t
WHERE t.is_critical = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM task_critical_overrides o
    WHERE o.project_id = t.project_id
      AND o.task_id = t.id
      AND o.mode = 'manual_attention'
  );
