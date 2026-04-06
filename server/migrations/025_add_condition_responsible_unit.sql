-- 025_add_condition_responsible_unit.sql
-- G3/G5 (P1): 为 task_conditions 表添加 responsible_unit 和 project_id 字段
-- 执行时间: 2026-03-29

-- G5: 添加 project_id 字段（可从 tasks.project_id 反查，避免 JOIN）
ALTER TABLE task_conditions ADD COLUMN IF NOT EXISTS project_id UUID;

-- 为已有记录填充 project_id（基于 task_id 反查）
UPDATE task_conditions
SET project_id = t.project_id
FROM tasks t
WHERE task_conditions.task_id = t.id
  AND task_conditions.project_id IS NULL;

-- 添加外键约束（如果 project_id 不为空）
ALTER TABLE task_conditions
  ADD CONSTRAINT fk_task_conditions_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- 添加索引（按项目查询条件）
CREATE INDEX IF NOT EXISTS idx_task_conditions_project_id ON task_conditions(project_id);

-- G3: 添加 responsible_unit 字段
ALTER TABLE task_conditions ADD COLUMN IF NOT EXISTS responsible_unit TEXT;

-- G3: 添加 target_date 字段（如果 CLEAN_MIGRATION_V4 未包含）
-- 已在 023_add_target_date_to_task_conditions.sql 中添加，此处防止重复执行报错
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_conditions' AND column_name = 'target_date'
  ) THEN
    ALTER TABLE task_conditions ADD COLUMN target_date TIMESTAMPTZ;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
