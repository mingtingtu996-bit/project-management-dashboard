-- 证照管理模块字段扩展迁移
-- 添加缺失字段：lead_unit, planned_start_date, planned_end_date, responsible_user_id, sort_order

ALTER TABLE pre_milestones ADD COLUMN lead_unit TEXT;
ALTER TABLE pre_milestones ADD COLUMN planned_start_date DATE;
ALTER TABLE pre_milestones ADD COLUMN planned_end_date DATE;
ALTER TABLE pre_milestones ADD COLUMN responsible_user_id UUID;
ALTER TABLE pre_milestones ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE pre_milestones ADD COLUMN description TEXT;

-- 添加外键约束
ALTER TABLE pre_milestones ADD CONSTRAINT fk_pre_milestones_user 
  FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 添加索引
CREATE INDEX idx_pre_milestones_lead_unit ON pre_milestones(lead_unit);
CREATE INDEX idx_pre_milestones_planned_dates ON pre_milestones(planned_start_date, planned_end_date);
CREATE INDEX idx_pre_milestones_sort_order ON pre_milestones(sort_order);
