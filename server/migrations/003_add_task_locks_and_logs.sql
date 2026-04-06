-- ============================================================
-- Phase 1 补充数据库迁移
-- 房地产工程管理系统V4.1 Phase 1 补充
-- 执行时间: 2026-03-22
-- ============================================================

-- 1. task_locks（定时任务锁表）
CREATE TABLE IF NOT EXISTS task_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 任务标识
    job_name VARCHAR(100) NOT NULL UNIQUE,
    
    -- 锁状态
    is_locked BOOLEAN DEFAULT FALSE,
    
    -- 锁信息
    locked_by VARCHAR(100),
    locked_at TIMESTAMP,
    lock_expires_at TIMESTAMP,
    
    -- 锁配置
    lock_duration_seconds INTEGER DEFAULT 300,
    max_retries INTEGER DEFAULT 3,
    
    -- 元数据
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. job_execution_logs（定时任务执行日志表）
CREATE TABLE IF NOT EXISTS job_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 任务信息
    job_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50),
    
    -- 执行状态
    status VARCHAR(20) NOT NULL
      CHECK (status IN ('pending', 'running', 'success', 'failed', 'timeout', 'cancelled')),
    
    -- 执行时间
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- 输入输出
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error_message TEXT,
    error_stack TEXT,
    
    -- 执行环境
    executed_by VARCHAR(100),
    hostname VARCHAR(100),
    process_id INTEGER,
    
    -- 重试信息
    retry_count INTEGER DEFAULT 0,
    original_log_id UUID REFERENCES job_execution_logs(id),
    
    -- 元数据
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 为task_locks表添加updated_at触发器
CREATE TRIGGER update_task_locks_updated_at
  BEFORE UPDATE ON task_locks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_task_locks_job ON task_locks(job_name);
CREATE INDEX IF NOT EXISTS idx_task_locks_locked ON task_locks(is_locked, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_job_logs_name ON job_execution_logs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON job_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_job_logs_started ON job_execution_logs(started_at);

-- 5. task_locks表注释
COMMENT ON TABLE task_locks IS '定时任务锁表，防止分布式环境下的任务重复执行';
COMMENT ON TABLE job_execution_logs IS '定时任务执行日志表，记录任务执行历史';
