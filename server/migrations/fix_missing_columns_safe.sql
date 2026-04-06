-- 安全修复：只添加缺少的列，不删表不丢数据
-- 直接在 Supabase SQL Editor 运行此脚本

-- 1. 给 projects 表补充缺失的列
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 50 CHECK (health_score >= 0 AND health_score <= 100),
  ADD COLUMN IF NOT EXISTS health_status VARCHAR(20) DEFAULT '亚健康' CHECK (health_status IN ('健康', '亚健康', '预警', '危险')),
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS building_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS structure_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS building_count INTEGER,
  ADD COLUMN IF NOT EXISTS above_ground_floors INTEGER,
  ADD COLUMN IF NOT EXISTS underground_floors INTEGER,
  ADD COLUMN IF NOT EXISTS support_method VARCHAR(100),
  ADD COLUMN IF NOT EXISTS total_area NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS total_investment NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS current_phase VARCHAR(50) DEFAULT 'pre-construction' CHECK (current_phase IN ('pre-construction', 'construction', 'completion', 'delivery')),
  ADD COLUMN IF NOT EXISTS construction_unlock_date DATE,
  ADD COLUMN IF NOT EXISTS construction_unlock_by UUID,
  ADD COLUMN IF NOT EXISTS default_wbs_generated BOOLEAN DEFAULT FALSE;

SELECT 'projects table columns fixed' AS result;
