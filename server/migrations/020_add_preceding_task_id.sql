-- ============================================================
-- Migration 020: Add preceding_task_id to tasks table
-- Date: 2026-03-29
-- Purpose: 支持"前置工序自动联动"功能
--           当某任务被标记为完成时，自动将所有以前置任务为前置工序的条件标记为已满足
-- Usage: Supabase SQL Editor 中执行
-- ============================================================

-- 1. 添加 preceding_task_id 字段（前置任务/前置工序）
-- 该字段记录当前任务的"上一道工序"的 UUID
-- 用于：当上一道工序完成时，自动满足当前任务的所有开工条件
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS preceding_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- 2. 为 preceding_task_id 创建索引（加快 JOIN 查询）
CREATE INDEX IF NOT EXISTS idx_tasks_preceding_task_id ON tasks(preceding_task_id);

-- 3. 为 task_conditions 添加 preceding_task_id 字段（可选，用于条件级别的细粒度关联）
-- 如果需要区分"任务级前置"和"条件级前置"，可以取消注释
-- ALTER TABLE task_conditions ADD COLUMN IF NOT EXISTS preceding_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

COMMENT ON COLUMN tasks.preceding_task_id IS '当前任务的前置任务UUID，用于前置工序自动联动逻辑';
