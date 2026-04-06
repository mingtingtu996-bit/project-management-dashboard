-- 修复 projects 表缺少字段的问题
-- 先删除表（如果存在）然后重新创建
DROP TABLE IF EXISTS projects CASCADE;

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  primary_invitation_code VARCHAR(50),
  status VARCHAR(50) DEFAULT '未开始'
    CHECK (status IN ('未开始', '进行中', '已完成', '已暂停')),
  project_type VARCHAR(50),
  building_type VARCHAR(50),
  structure_type VARCHAR(50),
  building_count INTEGER,
  above_ground_floors INTEGER,
  underground_floors INTEGER,
  support_method VARCHAR(100),
  total_area NUMERIC(12, 2),
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  start_date DATE,
  end_date DATE,
  total_investment NUMERIC(15, 2),
  budget NUMERIC(15, 2),
  location VARCHAR(255),
  health_score INTEGER DEFAULT 50 CHECK (health_score >= 0 AND health_score <= 100),
  health_status VARCHAR(20) DEFAULT '亚健康'
    CHECK (health_status IN ('健康', '亚健康', '预警', '危险')),
  current_phase VARCHAR(50) DEFAULT 'pre-construction'
    CHECK (current_phase IN ('pre-construction', 'construction', 'completion', 'delivery')),
  construction_unlock_date DATE,
  construction_unlock_by UUID,
  default_wbs_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 添加注释
COMMENT ON TABLE projects IS '项目主表';
COMMENT ON COLUMN projects.status IS '项目状态：未开始、进行中、已完成、已暂停';
COMMENT ON COLUMN projects.health_score IS '健康度评分 0-100';
COMMENT ON COLUMN projects.health_status IS '健康状态：健康、亚健康、预警、危险';
COMMENT ON COLUMN projects.current_phase IS '当前阶段：pre-construction、construction、completion、delivery';

SELECT 'projects table fixed successfully' as result;
