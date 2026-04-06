-- 创建任务执行日志表
-- 记录所有定时任务的执行历史，便于监控和排查问题

CREATE TABLE IF NOT EXISTS job_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  result JSONB,
  error_message TEXT,
  job_id TEXT,
  triggered_by TEXT CHECK (triggered_by IN ('scheduler', 'manual', 'api')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX idx_job_execution_logs_job_name ON job_execution_logs(job_name);
CREATE INDEX idx_job_execution_logs_status ON job_execution_logs(status);
CREATE INDEX idx_job_execution_logs_started_at ON job_execution_logs(started_at DESC);
CREATE INDEX idx_job_execution_logs_job_id ON job_execution_logs(job_id);

-- 添加注释
COMMENT ON TABLE job_execution_logs IS '定时任务执行日志表，记录所有定时任务的执行历史';
COMMENT ON COLUMN job_execution_logs.job_name IS '任务名称（如: riskStatisticsJob, autoAlertService.daily）';
COMMENT ON COLUMN job_execution_logs.status IS '执行状态: success=成功, error=失败, timeout=超时';
COMMENT ON COLUMN job_execution_logs.started_at IS '任务开始时间';
COMMENT ON COLUMN job_execution_logs.completed_at IS '任务完成时间';
COMMENT ON COLUMN job_execution_logs.duration_ms IS '任务执行时长（毫秒）';
COMMENT ON COLUMN job_execution_logs.result IS '任务执行结果（JSON格式）';
COMMENT ON COLUMN job_execution_logs.error_message IS '错误消息（仅当status=error时有值）';
COMMENT ON COLUMN job_execution_logs.job_id IS '任务执行ID（用于追踪手动触发的任务）';
COMMENT ON COLUMN job_execution_logs.triggered_by IS '触发方式: scheduler=定时调度, manual=手动触发, api=API调用';

-- 创建清理旧日志的函数（保留最近90天）
CREATE OR REPLACE FUNCTION cleanup_old_job_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM job_execution_logs
  WHERE started_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 添加注释
COMMENT ON FUNCTION cleanup_old_job_logs IS '清理90天前的旧任务执行日志';
