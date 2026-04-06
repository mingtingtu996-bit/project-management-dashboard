-- 风险统计表：用于存储每日风险数据快照，支持趋势分析
CREATE TABLE IF NOT EXISTS risk_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  stat_date date NOT NULL,
  
  -- 新增风险数量
  new_risks int DEFAULT 0,
  new_high_risks int DEFAULT 0,
  new_medium_risks int DEFAULT 0,
  new_low_risks int DEFAULT 0,
  
  -- 已处理风险数量
  resolved_risks int DEFAULT 0,
  resolved_high_risks int DEFAULT 0,
  resolved_medium_risks int DEFAULT 0,
  resolved_low_risks int DEFAULT 0,
  
  -- 当前风险存量（快照）
  total_risks int DEFAULT 0,
  high_risk_count int DEFAULT 0,
  medium_risk_count int DEFAULT 0,
  low_risk_count int DEFAULT 0,
  
  -- 按类型统计
  delay_risks int DEFAULT 0,
  obstacle_risks int DEFAULT 0,
  condition_risks int DEFAULT 0,
  general_risks int DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- 每个项目每天只有一条记录
  UNIQUE(project_id, stat_date)
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_risk_statistics_project_date 
  ON risk_statistics(project_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_risk_statistics_stat_date 
  ON risk_statistics(stat_date);

-- 更新时间戳触发器
CREATE OR REPLACE FUNCTION update_risk_statistics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_risk_statistics_updated_at ON risk_statistics;
CREATE TRIGGER trigger_update_risk_statistics_updated_at
  BEFORE UPDATE ON risk_statistics
  FOR EACH ROW
  EXECUTE FUNCTION update_risk_statistics_updated_at();

-- 启用RLS
ALTER TABLE risk_statistics ENABLE ROW LEVEL SECURITY;

-- RLS策略：用户只能查看自己有权限的项目的数据
CREATE POLICY risk_statistics_select_policy ON risk_statistics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE p.id = risk_statistics.project_id
      AND pm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE risk_statistics IS '每日风险统计快照表，用于趋势分析';
COMMENT ON COLUMN risk_statistics.new_risks IS '当日新增风险总数';
COMMENT ON COLUMN risk_statistics.resolved_risks IS '当日已处理风险总数';
COMMENT ON COLUMN risk_statistics.total_risks IS '当日结束时风险存量';
