-- Migration 012: Fix wbs_templates table issues
-- Date: 2026-03-24
-- Problems:
--   1. created_by NOT NULL constraint prevents template creation (no-login system)
--   2. wbs_template_nodes RLS policy references wbs_templates.deleted_at which doesn't exist
--   3. Add deleted_at to wbs_templates for soft delete support
--   4. Add seed data for common WBS templates

-- 1. Fix created_by: Change NOT NULL to nullable
ALTER TABLE wbs_templates 
  ALTER COLUMN created_by DROP NOT NULL;

-- 2. Add deleted_at column to wbs_templates (needed by wbs_template_nodes RLS policy)
ALTER TABLE wbs_templates 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Fix RLS policies on wbs_templates to work without auth
DROP POLICY IF EXISTS "wbs_templates_select_policy" ON wbs_templates;
CREATE POLICY "wbs_templates_select_policy" ON wbs_templates FOR SELECT
    USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "wbs_templates_insert_policy" ON wbs_templates;
CREATE POLICY "wbs_templates_insert_policy" ON wbs_templates FOR INSERT
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "wbs_templates_update_policy" ON wbs_templates;
CREATE POLICY "wbs_templates_update_policy" ON wbs_templates FOR UPDATE
    USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "wbs_templates_delete_policy" ON wbs_templates;
CREATE POLICY "wbs_templates_delete_policy" ON wbs_templates FOR DELETE
    USING (TRUE);

-- 4. Fix wbs_template_nodes RLS (referenced wbs_templates.deleted_at which now exists)
-- Already defined correctly in 011, just ensure it's applied
DROP POLICY IF EXISTS "wbs_template_nodes_select_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_select_policy" ON wbs_template_nodes FOR SELECT
    USING (EXISTS (SELECT 1 FROM wbs_templates wt WHERE wt.id = wbs_template_nodes.template_id AND wt.deleted_at IS NULL));

DROP POLICY IF EXISTS "wbs_template_nodes_insert_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_insert_policy" ON wbs_template_nodes FOR INSERT
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "wbs_template_nodes_update_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_update_policy" ON wbs_template_nodes FOR UPDATE
    USING (TRUE);

DROP POLICY IF EXISTS "wbs_template_nodes_delete_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_delete_policy" ON wbs_template_nodes FOR DELETE
    USING (TRUE);

-- 5. Seed data: Insert default WBS templates for common project types
INSERT INTO wbs_templates (template_name, template_type, description, wbs_nodes, is_default)
VALUES 
(
  '住宅标准WBS模板',
  '住宅',
  '适用于普通住宅项目的标准WBS任务分解模板，包含从前期准备到竣工验收的完整流程',
  '[
    {"id":"1","name":"前期准备","level":1,"duration":30,"children":[
      {"id":"1-1","name":"可行性研究","level":2,"duration":15},
      {"id":"1-2","name":"立项审批","level":2,"duration":10},
      {"id":"1-3","name":"规划许可证办理","level":2,"duration":20}
    ]},
    {"id":"2","name":"勘察设计","level":1,"duration":90,"children":[
      {"id":"2-1","name":"地质勘察","level":2,"duration":20},
      {"id":"2-2","name":"方案设计","level":2,"duration":30},
      {"id":"2-3","name":"施工图设计","level":2,"duration":45}
    ]},
    {"id":"3","name":"施工准备","level":1,"duration":30,"children":[
      {"id":"3-1","name":"施工图审查","level":2,"duration":15},
      {"id":"3-2","name":"招标采购","level":2,"duration":20},
      {"id":"3-3","name":"施工许可证","level":2,"duration":10}
    ]},
    {"id":"4","name":"地基与基础","level":1,"duration":60,"children":[
      {"id":"4-1","name":"土方开挖","level":2,"duration":15},
      {"id":"4-2","name":"基础施工","level":2,"duration":30},
      {"id":"4-3","name":"地下室施工","level":2,"duration":20}
    ]},
    {"id":"5","name":"主体结构","level":1,"duration":120,"children":[
      {"id":"5-1","name":"钢筋工程","level":2,"duration":60},
      {"id":"5-2","name":"模板工程","level":2,"duration":60},
      {"id":"5-3","name":"混凝土浇筑","level":2,"duration":45}
    ]},
    {"id":"6","name":"二次结构与装修","level":1,"duration":90,"children":[
      {"id":"6-1","name":"砌体工程","level":2,"duration":30},
      {"id":"6-2","name":"抹灰工程","level":2,"duration":25},
      {"id":"6-3","name":"门窗安装","level":2,"duration":15},
      {"id":"6-4","name":"涂料工程","level":2,"duration":20}
    ]},
    {"id":"7","name":"机电安装","level":1,"duration":60,"children":[
      {"id":"7-1","name":"给排水安装","level":2,"duration":30},
      {"id":"7-2","name":"强弱电安装","level":2,"duration":30},
      {"id":"7-3","name":"暖通安装","level":2,"duration":20}
    ]},
    {"id":"8","name":"竣工验收","level":1,"duration":30,"children":[
      {"id":"8-1","name":"分项工程验收","level":2,"duration":15},
      {"id":"8-2","name":"竣工验收申请","level":2,"duration":5},
      {"id":"8-3","name":"竣工备案","level":2,"duration":10}
    ]}
  ]'::jsonb,
  TRUE
),
(
  '商业综合体WBS模板',
  '商业',
  '适用于商业综合体、写字楼、购物中心等商业项目的WBS任务分解模板',
  '[
    {"id":"1","name":"项目策划","level":1,"duration":45,"children":[
      {"id":"1-1","name":"市场调研","level":2,"duration":20},
      {"id":"1-2","name":"业态规划","level":2,"duration":15},
      {"id":"1-3","name":"投资分析","level":2,"duration":15}
    ]},
    {"id":"2","name":"前期手续","level":1,"duration":60,"children":[
      {"id":"2-1","name":"土地获取","level":2,"duration":30},
      {"id":"2-2","name":"规划审批","level":2,"duration":20},
      {"id":"2-3","name":"建设工程许可","level":2,"duration":15}
    ]},
    {"id":"3","name":"设计阶段","level":1,"duration":120,"children":[
      {"id":"3-1","name":"概念设计","level":2,"duration":30},
      {"id":"3-2","name":"方案深化","level":2,"duration":45},
      {"id":"3-3","name":"施工图出图","level":2,"duration":60}
    ]},
    {"id":"4","name":"施工阶段","level":1,"duration":540,"children":[
      {"id":"4-1","name":"基坑工程","level":2,"duration":60},
      {"id":"4-2","name":"地下结构","level":2,"duration":90},
      {"id":"4-3","name":"地上主体结构","level":2,"duration":180},
      {"id":"4-4","name":"幕墙工程","level":2,"duration":90},
      {"id":"4-5","name":"机电安装","level":2,"duration":120},
      {"id":"4-6","name":"精装修工程","level":2,"duration":120}
    ]},
    {"id":"5","name":"招商运营准备","level":1,"duration":90,"children":[
      {"id":"5-1","name":"招商策划","level":2,"duration":30},
      {"id":"5-2","name":"主力店签约","level":2,"duration":45},
      {"id":"5-3","name":"开业筹备","level":2,"duration":30}
    ]},
    {"id":"6","name":"竣工交付","level":1,"duration":30,"children":[
      {"id":"6-1","name":"竣工验收","level":2,"duration":15},
      {"id":"6-2","name":"消防验收","level":2,"duration":10},
      {"id":"6-3","name":"产权登记","level":2,"duration":10}
    ]}
  ]'::jsonb,
  TRUE
),
(
  '工业厂房WBS模板',
  '工业',
  '适用于工业厂房、仓储物流等工业项目的WBS任务分解模板',
  '[
    {"id":"1","name":"前期工作","level":1,"duration":30,"children":[
      {"id":"1-1","name":"工艺方案确定","level":2,"duration":15},
      {"id":"1-2","name":"环评报告","level":2,"duration":20},
      {"id":"1-3","name":"用地许可","level":2,"duration":15}
    ]},
    {"id":"2","name":"设计工作","level":1,"duration":60,"children":[
      {"id":"2-1","name":"工艺设计","level":2,"duration":30},
      {"id":"2-2","name":"建筑结构设计","level":2,"duration":35},
      {"id":"2-3","name":"设备基础设计","level":2,"duration":20}
    ]},
    {"id":"3","name":"主体施工","level":1,"duration":180,"children":[
      {"id":"3-1","name":"地基处理","level":2,"duration":30},
      {"id":"3-2","name":"钢结构安装","level":2,"duration":60},
      {"id":"3-3","name":"围护系统","level":2,"duration":30},
      {"id":"3-4","name":"地坪工程","level":2,"duration":20}
    ]},
    {"id":"4","name":"设备安装","level":1,"duration":90,"children":[
      {"id":"4-1","name":"工艺设备安装","level":2,"duration":45},
      {"id":"4-2","name":"管道安装","level":2,"duration":30},
      {"id":"4-3","name":"电气安装","level":2,"duration":25}
    ]},
    {"id":"5","name":"调试验收","level":1,"duration":30,"children":[
      {"id":"5-1","name":"单机调试","level":2,"duration":15},
      {"id":"5-2","name":"联动调试","level":2,"duration":10},
      {"id":"5-3","name":"试生产验收","level":2,"duration":10}
    ]}
  ]'::jsonb,
  TRUE
),
(
  '市政道路WBS模板',
  '市政',
  '适用于市政道路、管网、桥梁等市政项目的WBS任务分解模板',
  '[
    {"id":"1","name":"勘察设计","level":1,"duration":90,"children":[
      {"id":"1-1","name":"测量勘察","level":2,"duration":20},
      {"id":"1-2","name":"初步设计","level":2,"duration":30},
      {"id":"1-3","name":"施工图设计","level":2,"duration":45}
    ]},
    {"id":"2","name":"征地拆迁","level":1,"duration":60,"children":[
      {"id":"2-1","name":"征地范围确定","level":2,"duration":15},
      {"id":"2-2","name":"房屋拆迁","level":2,"duration":30},
      {"id":"2-3","name":"管线迁改","level":2,"duration":20}
    ]},
    {"id":"3","name":"路基工程","level":1,"duration":90,"children":[
      {"id":"3-1","name":"清表换填","level":2,"duration":20},
      {"id":"3-2","name":"路基填筑压实","level":2,"duration">45},
      {"id":"3-3","name":"边坡防护","level":2,"duration":20}
    ]},
    {"id":"4","name":"路面工程","level":1,"duration":60,"children":[
      {"id":"4-1","name":"基层铺设","level":2,"duration":20},
      {"id":"4-2","name":"沥青面层","level":2,"duration":30},
      {"id":"4-3","name":"人行道铺装","level":2,"duration":15}
    ]},
    {"id":"5","name":"附属工程","level":1,"duration":45,"children":[
      {"id":"5-1","name":"雨污水管网","level":2,"duration":25},
      {"id":"5-2","name":"路灯照明","level":2,"duration":15},
      {"id":"5-3","name":"交通标志标线","level":2,"duration":10}
    ]},
    {"id":"6","name":"竣工验收","level":1,"duration":20,"children":[
      {"id":"6-1","name":"交工检测","level":2,"duration":10},
      {"id":"6-2","name":"竣工验收","level":2,"duration":7},
      {"id":"6-3","name":"移交管养","level":2,"duration":5}
    ]}
  ]'::jsonb,
  TRUE
)
ON CONFLICT (template_name, template_type) DO NOTHING;
