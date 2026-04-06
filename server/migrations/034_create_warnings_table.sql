-- =============================================
-- 创建 warnings 表
-- 用途: 存储所有预警记录
-- 风险等级: info | warning | critical
-- 预警类型: task_expiry | permit_expiry | risk_detected | milestone_delay | dependency_blocked | resource_conflict
-- 重命名自 009_create_warnings_table.sql（解决编号冲突）
-- =============================================

-- 创建 warnings 表
CREATE TABLE IF NOT EXISTS public.warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  warning_type VARCHAR(50) NOT NULL,
  warning_level VARCHAR(20) NOT NULL CHECK (warning_level IN ('info', 'warning', 'critical')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  is_acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 约束
  CONSTRAINT valid_warning_level CHECK (warning_level IN ('info', 'warning', 'critical'))
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_warnings_project_id ON public.warnings(project_id);
CREATE INDEX IF NOT EXISTS idx_warnings_task_id ON public.warnings(task_id);
CREATE INDEX IF NOT EXISTS idx_warnings_warning_type ON public.warnings(warning_type);
CREATE INDEX IF NOT EXISTS idx_warnings_warning_level ON public.warnings(warning_level);
CREATE INDEX IF NOT EXISTS idx_warnings_is_acknowledged ON public.warnings(is_acknowledged);
CREATE INDEX IF NOT EXISTS idx_warnings_resolved ON public.warnings(resolved);
CREATE INDEX IF NOT EXISTS idx_warnings_created_at ON public.warnings(created_at DESC);

-- 创建复合索引（常见查询）
CREATE INDEX IF NOT EXISTS idx_warnings_project_level ON public.warnings(project_id, warning_level, is_acknowledged);
CREATE INDEX IF NOT EXISTS idx_warnings_project_created ON public.warnings(project_id, created_at DESC);

-- 启用 RLS（Row Level Security）
ALTER TABLE public.warnings ENABLE ROW LEVEL SECURITY;

-- 创建策略：允许认证用户读取自己项目的预警
CREATE POLICY "允许读取项目预警" ON public.warnings
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects 
      WHERE created_by = auth.uid()
      OR id IN (
        SELECT project_id FROM public.project_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- 创建策略：允许系统用户（通过 service role）插入预警
CREATE POLICY "允许服务角色插入预警" ON public.warnings
  FOR INSERT
  WITH CHECK (true);

-- 创建策略：允许认证用户确认预警
CREATE POLICY "允许确认项目预警" ON public.warnings
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects 
      WHERE created_by = auth.uid()
      OR id IN (
        SELECT project_id FROM public.project_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- 创建策略：允许删除已解决的预警
CREATE POLICY "允许删除已解决预警" ON public.warnings
  FOR DELETE
  USING (
    resolved = true
    AND project_id IN (
      SELECT id FROM public.projects 
      WHERE created_by = auth.uid()
      OR id IN (
        SELECT project_id FROM public.project_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- 创建触发器：自动更新 updated_at 字段
CREATE OR REPLACE FUNCTION public.update_warnings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_warnings_updated_at
  BEFORE UPDATE ON public.warnings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_warnings_updated_at();

-- 添加注释
COMMENT ON TABLE public.warnings IS '预警记录表：存储项目相关的所有预警信息';
COMMENT ON COLUMN public.warnings.warning_type IS '预警类型：task_expiry | permit_expiry | risk_detected | milestone_delay | dependency_blocked | resource_conflict';
COMMENT ON COLUMN public.warnings.warning_level IS '风险等级：info | warning | critical';
COMMENT ON COLUMN public.warnings.is_acknowledged IS '是否已确认';
COMMENT ON COLUMN public.warnings.resolved IS '是否已解决';
