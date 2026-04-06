-- ============================================================
-- Migration: 028_add_tasks_missing_columns.sql
-- Date: 2026-03-29
-- Problem: mysqlService.ts createTask() inserts columns that don't exist in tasks table
-- Fix: Add all missing columns referenced by the service layer
-- ============================================================

BEGIN;

-- 1. 阶段关联（支持多阶段任务）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- 2. 父任务关联（支持WBS层级嵌套）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

-- 3. 任务类型
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(50) DEFAULT 'task'
  CHECK (task_type IN ('task', 'milestone', 'phase', 'subtask', 'design-change'));

-- 4. WBS编码和层级
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS wbs_code VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS wbs_level INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 5. 里程碑相关
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_level INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_order INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT FALSE;

-- 6. 专项工程分类（#12）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS specialty_type VARCHAR(50);

-- 7. 计划/参考工期（#7）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reference_duration INTEGER;  -- 参考工期（天）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_duration INTEGER;           -- AI推荐工期（天）

-- 8. 首次填报时间（#11）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS first_progress_at TIMESTAMPTZ;

-- 9. 延期原因
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delay_reason TEXT;

-- 10. 计划时间（区分计划 vs 实际）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_end_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_end_date DATE;

-- 11. 工期字段
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_duration INTEGER;       -- 计划工期（天）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS standard_duration INTEGER;      -- 标准工期（天）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_adjusted_duration INTEGER;  -- AI修正工期（天）

-- 12. 责任人字段（补充assignee，区分person/unit）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name VARCHAR(100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_unit VARCHAR(100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_type VARCHAR(20) DEFAULT 'person'
  CHECK (assignee_type IN ('person', 'unit'));

-- 13. 工时
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(10, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(10, 2);

-- 14. 创建人（支持NOT NULL追溯）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 15. 更新updated_by（已有，但确认一下）
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 16. 解决 task_delay_history.approved_by NOT NULL 问题
-- 允许 null（表示"系统自动记录，无需人工审批"）
ALTER TABLE task_delay_history ALTER COLUMN approved_by DROP NOT NULL;

-- 17. 解决 pre_milestones.created_by NOT NULL 问题
-- 无登录模式下无法提供 user_id，改为允许 null
ALTER TABLE pre_milestones ALTER COLUMN created_by DROP NOT NULL;

COMMIT;

-- 验证：列出tasks表所有列
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tasks' ORDER BY ordinal_position;
