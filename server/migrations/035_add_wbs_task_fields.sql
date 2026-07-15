-- Migration 035: Add current WBS and task extended fields to tasks table.
-- Renamed from 019_add_wbs_task_fields.sql to avoid migration number conflicts.
-- Date: 2026-03-29
-- Purpose: add current Gantt task fields without recreating retired duration cache columns.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS wbs_code VARCHAR(100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS wbs_level INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS specialty_type VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS first_progress_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_level INTEGER CHECK (milestone_level IN (1, 2, 3));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_order INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delay_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_specialty_type ON tasks(specialty_type);
CREATE INDEX IF NOT EXISTS idx_tasks_wbs_code ON tasks(wbs_code);
CREATE INDEX IF NOT EXISTS idx_tasks_is_critical ON tasks(is_critical) WHERE is_critical = TRUE;
