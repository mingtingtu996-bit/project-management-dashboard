-- Migration 017: 标准工序库表
-- F4: 提供可搜索的标准工序参考数据，供用户在创建WBS模板时参考和引用

CREATE TABLE IF NOT EXISTS standard_processes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,                    -- 工序名称，如"地基开挖"
  category   TEXT NOT NULL DEFAULT 'general',  -- 分类：civil/structure/fitout/mep/general
  phase      TEXT,                             -- 所属阶段：foundation/structure/enclosure/mep/fitout
  reference_days INTEGER,                      -- 参考工期（天）
  description    TEXT,                         -- 工序说明
  tags       TEXT[] DEFAULT '{}',              -- 搜索标签
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_standard_processes_category ON standard_processes(category);
CREATE INDEX IF NOT EXISTS idx_standard_processes_is_active ON standard_processes(is_active);
CREATE INDEX IF NOT EXISTS idx_standard_processes_name ON standard_processes USING gin(to_tsvector('simple', name));

-- 种子数据：常见建筑工序
INSERT INTO standard_processes (name, category, phase, reference_days, description, tags, sort_order) VALUES
  ('场地平整', 'civil', 'preparation', 5,  '建设场地的清理与平整工作',        ARRAY['土方','基础准备'], 10),
  ('基坑开挖', 'civil', 'foundation',  15, '按设计深度开挖基坑',              ARRAY['土方','地基'], 20),
  ('基坑支护', 'civil', 'foundation',  20, '基坑围护结构施工',                ARRAY['支护','安全'], 30),
  ('地基处理', 'civil', 'foundation',  10, '软弱地基的加固处理',              ARRAY['地基','加固'], 40),
  ('桩基施工', 'civil', 'foundation',  25, '钻孔灌注桩或预制桩施工',          ARRAY['桩基','地基'], 50),
  ('基础垫层', 'civil', 'foundation',  3,  '混凝土垫层浇筑',                  ARRAY['混凝土','基础'], 60),
  ('基础施工', 'structure', 'foundation', 20, '独立基础或条形基础施工',         ARRAY['混凝土','基础'], 70),
  ('地下室底板', 'structure', 'foundation', 15, '地下室底板钢筋绑扎及混凝土浇筑', ARRAY['混凝土','防水'], 80),
  ('地下室外墙', 'structure', 'foundation', 20, '地下室外墙施工',               ARRAY['混凝土','防水'], 90),
  ('地下室顶板', 'structure', 'foundation', 15, '地下室顶板施工',               ARRAY['混凝土'], 100),

  ('一层结构施工', 'structure', 'structure', 14, '首层钢筋绑扎、模板、混凝土浇筑', ARRAY['主体','混凝土'], 110),
  ('标准层结构施工', 'structure', 'structure', 10, '标准层流水施工',             ARRAY['主体','混凝土'], 120),
  ('楼板施工', 'structure', 'structure', 8, '楼板钢筋绑扎及混凝土浇筑',       ARRAY['主体','楼板'], 130),
  ('楼梯施工', 'structure', 'structure', 5, '现浇楼梯施工',                    ARRAY['主体','楼梯'], 140),
  ('屋面结构', 'structure', 'structure', 7, '屋面板施工',                      ARRAY['主体','屋面'], 150),

  ('外墙砌筑', 'fitout', 'enclosure', 15, '外围护墙体砌筑',                   ARRAY['砌体','外墙'], 160),
  ('内墙砌筑', 'fitout', 'enclosure', 20, '内隔墙砌筑',                       ARRAY['砌体','内墙'], 170),
  ('外墙保温', 'fitout', 'enclosure', 15, '外墙保温系统施工',                  ARRAY['保温','节能'], 180),
  ('外墙涂料', 'fitout', 'enclosure', 10, '外立面涂料施工',                    ARRAY['外立面','涂料'], 190),
  ('屋面防水', 'fitout', 'enclosure', 8, '屋面防水层施工',                    ARRAY['防水','屋面'], 200),
  ('外窗安装', 'fitout', 'enclosure', 10, '铝合金门窗安装',                    ARRAY['门窗','外立面'], 210),

  ('给排水管道', 'mep', 'mep', 20, '给排水主管道及支管安装',                   ARRAY['水电','给排水'], 220),
  ('强电线管', 'mep', 'mep', 15, '电气线管预埋及桥架安装',                    ARRAY['水电','强电'], 230),
  ('弱电线管', 'mep', 'mep', 12, '弱电系统管线安装',                         ARRAY['水电','弱电'], 240),
  ('通风空调', 'mep', 'mep', 25, '通风空调系统安装',                          ARRAY['机电','空调'], 250),
  ('消防系统', 'mep', 'mep', 20, '消防管道及喷淋系统安装',                    ARRAY['机电','消防'], 260),
  ('电梯安装', 'mep', 'mep', 30, '电梯设备安装及调试',                        ARRAY['机电','电梯'], 270),

  ('地面找平', 'fitout', 'fitout', 5, '地面找平层施工',                       ARRAY['装修','地面'], 280),
  ('内墙抹灰', 'fitout', 'fitout', 10, '内墙抹灰找平',                        ARRAY['装修','抹灰'], 290),
  ('内墙涂料', 'fitout', 'fitout', 8, '内墙乳胶漆施工',                       ARRAY['装修','涂料'], 300),
  ('地砖铺贴', 'fitout', 'fitout', 10, '地砖或木地板铺设',                    ARRAY['装修','地面'], 310),
  ('吊顶施工', 'fitout', 'fitout', 8, '轻钢龙骨吊顶施工',                     ARRAY['装修','吊顶'], 320),
  ('卫生洁具安装', 'fitout', 'fitout', 5, '卫浴设备安装调试',                  ARRAY['装修','洁具'], 330),
  ('门窗套安装', 'fitout', 'fitout', 7, '内门及门套安装',                      ARRAY['装修','门窗'], 340),

  ('竣工清理', 'general', 'completion', 5, '施工垃圾清运及场地清洁',           ARRAY['竣工','清理'], 350),
  ('竣工验收', 'general', 'completion', 7, '组织竣工验收手续',                  ARRAY['竣工','验收'], 360),
  ('质量检测', 'general', 'completion', 5, '各分部分项工程质量检测',            ARRAY['质量','检测'], 370),
  ('档案整理', 'general', 'completion', 3, '工程资料整理归档',                  ARRAY['竣工','档案'], 380)
ON CONFLICT DO NOTHING;
