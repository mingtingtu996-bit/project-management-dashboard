-- ============================================================
-- Migration: 031_fix_bug2_missing_columns.sql
-- Date: 2026-03-30
-- Problem: 任务列表和证照管理保存失败（服务器内部错误）
-- Root Cause:
--   1. tasks 表缺少 mysqlService.createTask() 引用的多个列
--   2. pre_milestones 表缺少后端 INSERT 引用的列（issuing_authority 等）
--   3. pre_milestones.created_by 有 NOT NULL 约束，无登录模式下无法提供 user_id
-- Fix: 补充所有缺失列 + 修复 NOT NULL 约束
-- ============================================================

BEGIN;

-- ============================================================
-- Part 1: tasks 表 — 补充 createTask() 引用的所有缺失列
-- ============================================================

-- 1. 阶段关联
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- 2. 父任务关联（WBS层级）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

-- 3. 任务类型
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(50) DEFAULT 'task';

-- 4. WBS编码和层级
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS wbs_code VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS wbs_level INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 5. 里程碑相关
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_level INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_order INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT FALSE;

-- 6. 专项工程分类
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS specialty_type VARCHAR(50);

-- 7. 计划/参考工期
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reference_duration INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_duration INTEGER;

-- 8. 首次填报时间
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS first_progress_at TIMESTAMPTZ;

-- 9. 延期原因
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delay_reason TEXT;

-- 10. 计划/实际日期
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_end_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_end_date DATE;

-- 11. 工期字段
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_duration INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS standard_duration INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_adjusted_duration INTEGER;

-- 12. 责任人字段
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name VARCHAR(100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_type VARCHAR(20) DEFAULT 'person';

-- 13. 工时
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(10, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(10, 2);

-- 14. 创建人（允许 NULL）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================
-- Part 2: pre_milestones 表 — 补充后端 INSERT 引用的缺失列
-- ============================================================

-- 1. 补充后端代码引用的列
ALTER TABLE pre_milestones ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE pre_milestones ADD COLUMN IF NOT EXISTS issuing_authority TEXT;
ALTER TABLE pre_milestones ADD COLUMN IF NOT EXISTS phase_id UUID;
ALTER TABLE pre_milestones ADD COLUMN IF NOT EXISTS lead_unit TEXT;
ALTER TABLE pre_milestones ADD COLUMN IF NOT EXISTS planned_start_date DATE;
ALTER TABLE pre_milestones ADD COLUMN IF NOT EXISTS planned_end_date DATE;
ALTER TABLE pre_milestones ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pre_milestones ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 2. 修复 created_by NOT NULL 约束（无登录模式下无法提供 user_id）
ALTER TABLE pre_milestones ALTER COLUMN created_by DROP NOT NULL;

-- ============================================================
-- Part 3: task_delay_history 表 — 修复 approved_by NOT NULL
-- ============================================================
ALTER TABLE task_delay_history ALTER COLUMN approved_by DROP NOT NULL;

COMMIT;

-- 验证：列出 tasks 表所有列（取消注释以验证）
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'tasks' ORDER BY ordinal_position;

-- 验证：列出 pre_milestones 表所有列（取消注释以验证）
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'pre_milestones' ORDER BY ordinal_position;
