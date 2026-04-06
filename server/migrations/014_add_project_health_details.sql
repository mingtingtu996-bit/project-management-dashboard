-- Migration 014: Add project_health_details table
-- Date: 2026-03-24
-- Purpose: 存储项目健康度分项得分，支持健康度分析和历史趋势（P2-02修复）

-- 1. 在 tasks 表增加 milestone_level 和 milestone_order 字段（如未创建）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_level INTEGER CHECK (milestone_level IN (1, 2, 3));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_order INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_milestone_level ON tasks(milestone_level) WHERE is_milestone = TRUE;
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_order ON tasks(milestone_order) WHERE is_milestone = TRUE;

COMMENT ON COLUMN tasks.milestone_level IS '里程碑层级：1=一级(amber)，2=二级(blue)，3=三级(gray)';
COMMENT ON COLUMN tasks.milestone_order IS '同级里程碑排序序号';

-- 2. 创建 project_health_details 表（方案B：存储分项分数）
CREATE TABLE IF NOT EXISTS project_health_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- 健康度总分
    health_score INTEGER NOT NULL DEFAULT 50 CHECK (health_score >= 0 AND health_score <= 100),
    health_status VARCHAR(20) NOT NULL DEFAULT '良好'
        CHECK (health_status IN ('优秀', '良好', '警告', '危险')),

    -- 分项得分（调试和分析用）
    base_score INTEGER NOT NULL DEFAULT 50 COMMENT '基础分（固定50分）',
    task_completion_score INTEGER NOT NULL DEFAULT 0 COMMENT '任务完成加分（+2/任务）',
    milestone_bonus INTEGER NOT NULL DEFAULT 0 COMMENT '里程碑完成奖励（+5/里程碑）',
    delay_penalty INTEGER NOT NULL DEFAULT 0 COMMENT '延期惩罚（-1/天）',
    risk_penalty INTEGER NOT NULL DEFAULT 0 COMMENT '风险惩罚（高=-10，中=-5，低=-2）',

    -- 计算依据（快照）
    completed_task_count INTEGER DEFAULT 0 COMMENT '计算时已完成任务数',
    total_task_count INTEGER DEFAULT 0 COMMENT '计算时总任务数',
    completed_milestone_count INTEGER DEFAULT 0 COMMENT '计算时已完成里程碑数',
    total_delay_days INTEGER DEFAULT 0 COMMENT '累计延期天数',
    high_risk_count INTEGER DEFAULT 0 COMMENT '高风险数量',
    medium_risk_count INTEGER DEFAULT 0 COMMENT '中风险数量',
    low_risk_count INTEGER DEFAULT 0 COMMENT '低风险数量',

    -- 时间戳
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() COMMENT '计算时间',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- 每个项目保留最新一条（可查历史）
    UNIQUE (project_id, calculated_at)
);

-- 索引：按项目+时间查询
CREATE INDEX IF NOT EXISTS idx_project_health_details_project_id
    ON project_health_details(project_id);
CREATE INDEX IF NOT EXISTS idx_project_health_details_calculated_at
    ON project_health_details(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_health_details_project_latest
    ON project_health_details(project_id, calculated_at DESC);

-- 更新时间戳触发器
CREATE OR REPLACE FUNCTION update_project_health_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_health_details_updated_at ON project_health_details;
CREATE TRIGGER trigger_project_health_details_updated_at
    BEFORE UPDATE ON project_health_details
    FOR EACH ROW
    EXECUTE FUNCTION update_project_health_details_updated_at();

-- 启用RLS
ALTER TABLE project_health_details ENABLE ROW LEVEL SECURITY;

-- RLS策略：项目成员可查询
CREATE POLICY project_health_details_select_policy ON project_health_details
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE p.id = project_health_details.project_id
            AND pm.user_id = auth.uid()
        )
    );

-- RLS策略：系统可写入（后端服务）
CREATE POLICY project_health_details_insert_policy ON project_health_details
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE p.id = project_health_details.project_id
            AND pm.user_id = auth.uid()
        )
    );

COMMENT ON TABLE project_health_details IS '项目健康度分项分数表，支持历史趋势分析和分项诊断';
COMMENT ON COLUMN project_health_details.health_score IS '综合健康度得分（0-100）';
COMMENT ON COLUMN project_health_details.health_status IS '健康度等级：优秀(90+)/良好(70-89)/警告(50-69)/危险(0-49)';
