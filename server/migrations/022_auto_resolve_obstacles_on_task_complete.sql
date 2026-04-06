-- Migration 022: Auto-resolve obstacles when task is completed
-- Date: 2026-03-29
-- Purpose: 当任务标记为"已完成"时，自动将该任务的所有"待处理"/"处理中"阻碍标记为"已解决"
--          resolution 字段设为"任务已完成，自动关闭"，resolved_by/resolved_at 自动填充
-- Usage: 在 Supabase SQL Editor 中执行，或由 run-migration.cjs 自动执行

-- ============================================================
-- 1. 创建触发器函数
-- ============================================================
CREATE OR REPLACE FUNCTION auto_resolve_obstacles_on_task_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- 仅当状态从非已完成变为已完成时才触发
  IF NEW.status = '已完成' AND OLD.status != '已完成' THEN
    UPDATE task_obstacles
    SET
      status = '已解决',
      resolution = '任务已完成，自动关闭',
      resolved_at = NOW()
    WHERE task_id = NEW.id
      AND status IN ('待处理', '处理中');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. 在 tasks 表上创建触发器
-- ============================================================
DROP TRIGGER IF EXISTS trigger_auto_resolve_obstacles ON tasks;

CREATE TRIGGER trigger_auto_resolve_obstacles
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_resolve_obstacles_on_task_complete();

-- ============================================================
-- 注释
-- ============================================================
COMMENT ON FUNCTION auto_resolve_obstacles_on_task_complete() IS
  '任务状态变为"已完成"时，自动将该任务的所有未解决阻碍标记为"已解决"';
COMMENT ON TRIGGER trigger_auto_resolve_obstacles ON tasks IS
  '任务完成时自动解决所有相关阻碍';
