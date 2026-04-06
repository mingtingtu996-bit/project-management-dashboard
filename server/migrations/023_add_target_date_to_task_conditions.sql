-- 迁移 023: task_conditions 表新增 target_date 列
-- 原因: warningService.ts 查询 tc.target_date，task-conditions.ts INSERT tc.target_date
--       但原始迁移文件未包含此列，导致运行时 SQL 错误
-- 时间: 2026-03-29

-- 1. 添加 target_date 列（TIMESTAMPTZ 类型，兼容 task-conditions.ts 的 INSERT）
ALTER TABLE task_conditions ADD COLUMN IF NOT EXISTS target_date TIMESTAMPTZ;

-- 2. 为已有数据填充 target_date（从 related milestone 的 target_date 推算，无则用 tasks.planned_end_date）
UPDATE task_conditions tc
SET target_date = (
  SELECT m.target_date::TIMESTAMPTZ
  FROM tasks t
  JOIN milestones m ON m.id = t.milestone_id
  WHERE t.id = tc.task_id
  LIMIT 1
)
WHERE tc.target_date IS NULL;

-- 3. 再次填充（兜底：用任务计划完成日）
UPDATE task_conditions tc
SET target_date = t.planned_end_date::TIMESTAMPTZ
FROM tasks t
WHERE tc.task_id = t.id AND tc.target_date IS NULL;

-- 4. 添加注释
COMMENT ON COLUMN task_conditions.target_date IS '条件截止日期，用于预警系统扫描即将到期的条件';

-- 5. 添加索引，加速 warningService 的 WHERE tc.is_satisfied = 0 AND tc.target_date > ? 查询
CREATE INDEX IF NOT EXISTS idx_task_conditions_satisfied_target
  ON task_conditions(is_satisfied, target_date)
  WHERE target_date IS NOT NULL;
