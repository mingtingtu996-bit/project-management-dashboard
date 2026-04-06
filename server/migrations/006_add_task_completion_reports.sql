-- 任务完成总结表
-- 房地产工程管理系统V4.1 Phase 3.6 数据库迁移
-- 执行时间: 2026-03-22

-- 1. task_completion_reports（任务完成总结表）
CREATE TABLE IF NOT EXISTS task_completion_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 基本信息
  report_type TEXT NOT NULL CHECK (report_type IN ('task', 'building', 'sub_project', 'project')),
  title TEXT NOT NULL,
  summary TEXT,
  
  -- 效率统计
  planned_duration INTEGER NOT NULL,      -- 计划工期（天）
  actual_duration INTEGER NOT NULL,       -- 实际工期（天）
  efficiency_ratio NUMERIC(5, 2) NOT NULL, -- 效率比
  efficiency_status TEXT NOT NULL DEFAULT 'normal' CHECK (efficiency_status IN ('fast', 'normal', 'slow')),
  
  -- 延期统计
  total_delay_days INTEGER NOT NULL DEFAULT 0,
  delay_count INTEGER NOT NULL DEFAULT 0,
  delay_details JSONB DEFAULT '[]',
  
  -- 阻碍统计
  obstacle_count INTEGER NOT NULL DEFAULT 0,
  obstacles_summary TEXT,
  
  -- 完成质量
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  quality_notes TEXT,
  
  -- 总结内容
  highlights TEXT,
  issues TEXT,
  lessons_learned TEXT,
  
  -- 元数据
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. task_progress_snapshots（任务进度快照表）- 用于效率计算
CREATE TABLE IF NOT EXISTS task_progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
  snapshot_date DATE NOT NULL,
  is_auto_generated BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 唯一约束：同一任务每天最多一条自动生成的快照
  CONSTRAINT daily_snapshot UNIQUE (task_id, snapshot_date, is_auto_generated)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_task ON task_completion_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_project ON task_completion_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_type ON task_completion_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_date ON task_completion_reports(generated_at);

CREATE INDEX IF NOT EXISTS idx_task_progress_snapshots_task ON task_progress_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_snapshots_date ON task_progress_snapshots(snapshot_date);

-- 创建触发器：自动更新 updated_at 字段
CREATE TRIGGER update_task_completion_reports_updated_at
  BEFORE UPDATE ON task_completion_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 创建触发器：任务进度达到100%时自动生成总结报告
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
      COALESCE(NEW.name, '任务') || ' 完成总结',
      '任务已完成，自动生成总结报告',
      EXTRACT(DAY FROM (NEW.planned_end_date - NEW.start_date)),
      EXTRACT(DAY FROM (CURRENT_DATE - NEW.start_date)),
      -- 效率比暂时设为1，由服务层重新计算
      1.0,
      'normal',
      NEW.updated_by,
      NOW()
    ON CONFLICT DO NOTHING; -- 避免重复插入
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_report
  AFTER UPDATE OF progress ON tasks
  FOR EACH ROW
  WHEN (NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100))
  EXECUTE FUNCTION auto_generate_completion_report();

-- 创建触发器：任务进度更新时记录快照
CREATE OR REPLACE FUNCTION auto_record_progress_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  -- 只有当进度发生变化时才记录快照
  IF NEW.progress IS DISTINCT FROM OLD.progress THEN
    INSERT INTO task_progress_snapshots (task_id, progress, snapshot_date, notes)
    VALUES (
      NEW.id,
      NEW.progress,
      CURRENT_DATE,
      '进度更新: ' || NEW.progress || '%'
    )
    ON CONFLICT (task_id, snapshot_date, is_auto_generated) 
    DO UPDATE SET 
      progress = NEW.progress,
      notes = EXCLUDED.notes;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_record_snapshot
  AFTER UPDATE OF progress ON tasks
  FOR EACH ROW
  WHEN (NEW.progress IS NOT NULL)
  EXECUTE FUNCTION auto_record_progress_snapshot();
