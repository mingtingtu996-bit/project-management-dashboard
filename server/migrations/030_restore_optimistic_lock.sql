-- ============================================================
-- Migration: 030_restore_optimistic_lock.sql
-- Date: 2026-03-30
-- Purpose: 恢复乐观锁机制，为 projects 和 tasks 表添加 version 字段
-- ============================================================

BEGIN;

-- 1. 为 projects 表添加 version 字段
ALTER TABLE projects ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE projects ALTER COLUMN version SET DEFAULT 1;

-- 2. 为 tasks 表添加 version 字段
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE tasks ALTER COLUMN version SET DEFAULT 1;

-- 3. 为现有数据设置初始版本号
UPDATE projects SET version = 1 WHERE version IS NULL;
UPDATE tasks SET version = 1 WHERE version IS NULL;

-- 4. 添加注释
COMMENT ON COLUMN projects.version IS '乐观锁版本号：每次更新时自动递增';
COMMENT ON COLUMN tasks.version IS '乐观锁版本号：每次更新时自动递增';

-- 5. 创建乐观锁检查函数（可选，用于应用层验证）
-- CREATE OR REPLACE FUNCTION check_version(
--   table_name TEXT,
--   record_id UUID,
--   expected_version INTEGER
-- ) RETURNS BOOLEAN AS $$
-- BEGIN
--   RETURN EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_name = table_name
--     AND EXISTS (
--       SELECT 1 FROM unnest(ARRAY['projects', 'tasks']) AS t
--       WHERE t = table_name
--     )
--   );
-- END;
-- $$ LANGUAGE plpgsql;

COMMIT;

-- 验证：检查version字段是否添加成功
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('projects', 'tasks')
-- AND column_name = 'version';
