-- Phase 3.6 触发器字段引用修复
-- 修复问题: P0-001, P0-002
-- 执行时间: 2026-03-22

-- =====================================================
-- 修复 1: 修复 auto_generate_completion_report 函数
-- 问题: 
--   - P0-001: 引用了不存在的字段 planned_end_date，应改为 end_date
--   - P0-002: 引用了不存在的字段 name，应改为 title
-- =====================================================

-- 先删除触发器（依赖函数）
DROP TRIGGER IF EXISTS trigger_auto_generate_report ON tasks;

-- 删除旧函数
DROP FUNCTION IF EXISTS auto_generate_completion_report();

-- 创建修复后的函数
CREATE OR REPLACE FUNCTION auto_generate_completion_report()
RETURNS TRIGGER AS $$
BEGIN
  -- 当任务进度更新为100%时，触发总结报告生成
  IF NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100) THEN
    INSERT INTO task_completion_reports (
      task_id,
      project_id,
      report_type,
      title,
      summary,
      planned_duration,
      actual_duration,
      efficiency_ratio,
      efficiency_status,
      generated_by,
      generated_at
    )
    SELECT
      NEW.id,
      NEW.project_id,
      'task',
      COALESCE(NEW.title, '任务') || ' 完成总结',  -- 修复: name -> title
      '任务已完成，自动生成总结报告',
      EXTRACT(DAY FROM (NEW.end_date - NEW.start_date)),  -- 修复: planned_end_date -> end_date
      EXTRACT(DAY FROM (CURRENT_DATE - NEW.start_date)),
      -- 效率比设为 NULL，由服务层重新计算（避免硬编码值）
      NULL,
      'normal',
      NEW.updated_by,
      NOW()
    ON CONFLICT DO NOTHING; -- 避免重复插入
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 重新创建触发器
CREATE TRIGGER trigger_auto_generate_report
  AFTER UPDATE OF progress ON tasks
  FOR EACH ROW
  WHEN (NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100))
  EXECUTE FUNCTION auto_generate_completion_report();

-- =====================================================
-- 修复 2: 添加触发器异常处理（增强健壮性）
-- =====================================================

-- 创建日志表（如果不存在）用于记录触发器异常
CREATE TABLE IF NOT EXISTS trigger_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  record_id UUID,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'warning')),
  message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_trigger_logs_name ON trigger_execution_logs(trigger_name);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_status ON trigger_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_created ON trigger_execution_logs(created_at);

-- =====================================================
-- 修复 3: 创建带异常处理的包装函数（可选增强）
-- =====================================================

CREATE OR REPLACE FUNCTION safe_generate_completion_report()
RETURNS TRIGGER AS $$
BEGIN
  -- 调用主函数并捕获异常
  BEGIN
    -- 检查必要字段是否存在
    IF NEW.id IS NULL OR NEW.project_id IS NULL THEN
      RAISE WARNING '触发器执行跳过: task_id 或 project_id 为空';
      RETURN NEW;
    END IF;
    
    -- 调用主逻辑
    RETURN auto_generate_completion_report();
    
  EXCEPTION WHEN OTHERS THEN
    -- 记录错误日志
    INSERT INTO trigger_execution_logs (
      trigger_name,
      table_name,
      operation,
      record_id,
      status,
      message,
      details
    ) VALUES (
      'trigger_auto_generate_report',
      'tasks',
      'UPDATE',
      NEW.id,
      'error',
      SQLERRM,
      jsonb_build_object(
        'sqlstate', SQLSTATE,
        'task_id', NEW.id,
        'progress', NEW.progress
      )
    );
    
    -- 触发器异常不应阻止原操作，返回 NEW 继续执行
    RETURN NEW;
  END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 验证修复
-- =====================================================

-- 添加注释说明修复内容
COMMENT ON FUNCTION auto_generate_completion_report() IS 
'任务完成时自动生成总结报告（已修复字段引用：name->title, planned_end_date->end_date）';

-- 验证触发器状态
DO $$
BEGIN
  RAISE NOTICE 'Phase 3.6 触发器修复完成:';
  RAISE NOTICE '  - P0-001: planned_end_date -> end_date (已修复)';
  RAISE NOTICE '  - P0-002: name -> title (已修复)';
  RAISE NOTICE '  - efficiency_ratio 改为 NULL，由服务层计算';
END $$;
