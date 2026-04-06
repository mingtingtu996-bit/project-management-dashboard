-- ============================================================
-- 迁移 032: 新建 construction_drawings 表
-- 目的: 将施工图纸从 pre_milestones 中独立出来
-- 原因: 前期证照和施工图纸是完全不同的业务领域，
--       不应共用一张表、用 milestone_type 字段区分
-- 日期: 2026-03-30
-- ============================================================

CREATE TABLE IF NOT EXISTS construction_drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 基本信息
  drawing_type TEXT NOT NULL DEFAULT '建筑',
  drawing_name TEXT NOT NULL,
  version TEXT DEFAULT '1.0',
  description TEXT,

  -- 状态管理
  status TEXT NOT NULL DEFAULT '编制中'
    CHECK (status IN ('编制中', '审图中', '已通过', '已驳回', '已出图', '已作废')),

  -- 设计信息
  design_unit TEXT,          -- 设计单位
  design_person TEXT,        -- 设计负责人
  drawing_date DATE,         -- 出图日期

  -- 审图信息
  review_unit TEXT,          -- 审图机构
  review_status TEXT DEFAULT '未提交'
    CHECK (review_status IN ('未提交', '审查中', '已通过', '已驳回', '需修改')),
  review_date DATE,          -- 审图完成日期
  review_opinion TEXT,       -- 审图意见
  review_report_no TEXT,     -- 审图报告编号

  -- 关联
  related_license_id UUID REFERENCES pre_milestones(id) ON DELETE SET NULL, -- 关联施工许可证

  -- 计划与执行
  planned_submit_date DATE,   -- 计划提交审图日期
  planned_pass_date DATE,     -- 计划通过审图日期
  actual_submit_date DATE,    -- 实际提交审图日期
  actual_pass_date DATE,      -- 实际通过审图日期

  -- 责任人
  lead_unit TEXT,             -- 牵头单位
  responsible_user_id UUID,

  -- 排序与备注
  sort_order INT DEFAULT 0,
  notes TEXT,

  -- 元数据
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_construction_drawings_project
  ON construction_drawings(project_id);
CREATE INDEX IF NOT EXISTS idx_construction_drawings_type
  ON construction_drawings(drawing_type);
CREATE INDEX IF NOT EXISTS idx_construction_drawings_status
  ON construction_drawings(status);
CREATE INDEX IF NOT EXISTS idx_construction_drawings_review_status
  ON construction_drawings(review_status);

-- 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_construction_drawings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_construction_drawings_updated_at
  ON construction_drawings;
CREATE TRIGGER update_construction_drawings_updated_at
  BEFORE UPDATE ON construction_drawings
  FOR EACH ROW
  EXECUTE FUNCTION update_construction_drawings_updated_at();

-- 注释
COMMENT ON TABLE construction_drawings IS '施工图纸管理表，独立于前期证照表';
COMMENT ON COLUMN construction_drawings.drawing_type IS '图纸分类：建筑/结构/机电/给排水/暖通/幕墙/景观/其他';
COMMENT ON COLUMN construction_drawings.status IS '图纸状态：编制中/审图中/已通过/已驳回/已出图/已作废';
COMMENT ON COLUMN construction_drawings.review_status IS '审图状态：未提交/审查中/已通过/已驳回/需修改';
COMMENT ON COLUMN construction_drawings.related_license_id IS '关联的施工许可证（pre_milestones表）';
