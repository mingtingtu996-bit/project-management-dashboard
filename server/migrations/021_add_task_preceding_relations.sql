-- 021_add_task_preceding_relations.sql
-- 前置工序多选功能：junction 表支持一个条件关联多个前置任务。

CREATE TABLE IF NOT EXISTS task_preceding_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id UUID NOT NULL REFERENCES task_conditions(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_condition_task UNIQUE (condition_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_preceding_relations_condition_id
  ON task_preceding_relations(condition_id);

CREATE INDEX IF NOT EXISTS idx_task_preceding_relations_task_id
  ON task_preceding_relations(task_id);

-- 迁移说明：原有 task_conditions.preceding_task_id 字段保留（兼容旧数据），
-- 但新增条件时使用 junction 表存储多对多关系。
