-- Migration 029: 创建项目健康度历史记录表
-- 用于记录每个项目每月的健康度快照，支持“较上月变化”功能
-- 创建时间: 2026-03-29
-- 修订时间: 2026-04-01（补齐缺失执行链路，并统一健康状态为中文）

-- 1. 健康度历史记录表
CREATE TABLE IF NOT EXISTS project_health_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  health_score INTEGER NOT NULL CONSTRAINT project_health_history_health_score_check CHECK (health_score >= 0 AND health_score <= 100),
  health_status VARCHAR(20) NOT NULL,
  -- 记录周期（格式 YYYY-MM，例如 2026-03）
  period VARCHAR(7) NOT NULL,
  -- 分项细节（可选）
  details JSONB,
  recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- 每个项目每月只记录一条（取最后一次）
  UNIQUE(project_id, period)
);

-- 2. 统一健康状态约束（与 projectHealthService.ts 保持一致）
DO $$
BEGIN
  ALTER TABLE project_health_history
    DROP CONSTRAINT IF EXISTS project_health_history_health_status_check;

  ALTER TABLE project_health_history
    ADD CONSTRAINT project_health_history_health_status_check
    CHECK (health_status IN ('健康', '亚健康', '预警', '危险'));
END $$;

-- 3. 索引
CREATE INDEX IF NOT EXISTS idx_health_history_project_id ON project_health_history(project_id);
CREATE INDEX IF NOT EXISTS idx_health_history_period ON project_health_history(period);
CREATE INDEX IF NOT EXISTS idx_health_history_project_period ON project_health_history(project_id, period DESC);

-- 4. RLS 策略（跟随 projects 表权限）
ALTER TABLE project_health_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS health_history_select ON project_health_history;
CREATE POLICY "health_history_select" ON project_health_history
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE id = project_health_history.project_id
    )
  );

DROP POLICY IF EXISTS health_history_insert ON project_health_history;
CREATE POLICY "health_history_insert" ON project_health_history
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS health_history_update ON project_health_history;
CREATE POLICY "health_history_update" ON project_health_history
  FOR UPDATE USING (true);

-- 5. 注释
COMMENT ON TABLE project_health_history IS '项目健康度历史记录表，每月快照，用于趋势分析和较上月变化展示';
COMMENT ON COLUMN project_health_history.period IS '记录周期，格式 YYYY-MM，例如 2026-03';
COMMENT ON COLUMN project_health_history.details IS '健康度分项详情 JSON：{ baseScore, taskCompletionScore, milestoneBonusScore, delayPenaltyScore, riskPenaltyScore, totalScore, healthStatus }';

