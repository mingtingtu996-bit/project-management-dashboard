-- 051: 操作日志表
-- 记录用户在系统中的关键操作，用于审计追溯

CREATE TABLE IF NOT EXISTS public.operation_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT,
    username TEXT,
    project_id TEXT,
    action TEXT NOT NULL,           -- 操作类型: login, logout, create_task, update_task, delete_task, add_member, remove_member, transfer_owner, change_password 等
    resource_type TEXT,              -- 资源类型: project, task, milestone, risk, member 等
    resource_id TEXT,                -- 资源 ID
    detail JSONB DEFAULT '{}',      -- 操作详情
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引：按用户查询
CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON public.operation_logs(user_id);
-- 索引：按项目查询
CREATE INDEX IF NOT EXISTS idx_operation_logs_project_id ON public.operation_logs(project_id);
-- 索引：按时间查询（倒序）
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON public.operation_logs(created_at DESC);
-- 索引：按操作类型查询
CREATE INDEX IF NOT EXISTS idx_operation_logs_action ON public.operation_logs(action);
