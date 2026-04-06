"""
修复 CLEAN_MIGRATION_V3.sql：
- projects 表缺少 health_score, health_status, start_date, end_date, budget, location 等字段
- 解决方案：替换 projects 建表语句，加入完整字段列表
"""

with open('CLEAN_MIGRATION_V3.sql', 'r', encoding='utf-8') as f:
    content = f.read()

# 原来的 projects 建表语句（简短版）
old_projects = """CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  primary_invitation_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);"""

# 新的完整 projects 建表语句
new_projects = """CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  primary_invitation_code VARCHAR(50),
  
  -- 基本信息
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
  
  -- 时间信息
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  -- 别名字段（兼容旧字段名）
  start_date DATE GENERATED ALWAYS AS (planned_start_date) STORED,
  end_date DATE GENERATED ALWAYS AS (planned_end_date) STORED,
  
  -- 财务信息
  total_investment NUMERIC(15, 2),
  budget NUMERIC(15, 2) GENERATED ALWAYS AS (total_investment) STORED,
  
  -- 位置信息
  location VARCHAR(255),
  
  -- 健康度（动态计算后缓存）
  health_score INTEGER DEFAULT 50 CHECK (health_score >= 0 AND health_score <= 100),
  health_status VARCHAR(20) DEFAULT '亚健康'
    CHECK (health_status IN ('健康', '亚健康', '预警', '危险')),
  
  -- 阶段管理
  current_phase VARCHAR(50) DEFAULT 'pre-construction'
    CHECK (current_phase IN ('pre-construction', 'construction', 'completion', 'delivery')),
  construction_unlock_date DATE,
  construction_unlock_by UUID,
  default_wbs_generated BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);"""

if old_projects in content:
    content = content.replace(old_projects, new_projects)
    print("✅ 已替换 projects 建表语句（加入完整字段）")
else:
    print("❌ 未找到原始 projects 建表语句，检查内容：")
    idx = content.find("CREATE TABLE IF NOT EXISTS projects")
    if idx >= 0:
        print(repr(content[idx:idx+300]))
    else:
        print("完全找不到 projects 表定义")

# 同时删除后面重复的 ALTER TABLE projects 里已经在建表语句中定义的字段
old_alter = """-- 1. 给 projects 表添加阶段管理相关字段
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS current_phase VARCHAR(50) DEFAULT 'pre-construction' 
  CHECK (current_phase IN ('pre-construction', 'construction', 'completion', 'delivery')),
ADD COLUMN IF NOT EXISTS construction_unlock_date DATE,
ADD COLUMN IF NOT EXISTS construction_unlock_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS default_wbs_generated BOOLEAN DEFAULT FALSE;"""

new_alter = """-- 1. projects 表字段已在建表语句中定义，此处仅做兼容性注释
-- (current_phase, construction_unlock_date, construction_unlock_by, default_wbs_generated 已包含)"""

if old_alter in content:
    content = content.replace(old_alter, new_alter)
    print("✅ 已移除重复的 ALTER TABLE projects 语句")
else:
    print("⚠️  未找到 ALTER TABLE projects 语句（可能已处理或不存在）")

# 修复 UPDATE projects SET (health_score, health_status) = ... 语法
# PostgreSQL 不支持 SET (col1, col2) = (subquery) 语法，需要改写
old_update = """  UPDATE projects
  SET (health_score, health_status) = (
    SELECT health_score, health_status 
    FROM calculate_project_health_score(v_project_id)
  )
  WHERE id = v_project_id;"""

new_update = """  UPDATE projects
  SET 
    health_score = (SELECT health_score FROM calculate_project_health_score(v_project_id)),
    health_status = (SELECT health_status FROM calculate_project_health_score(v_project_id))
  WHERE id = v_project_id;"""

if old_update in content:
    content = content.replace(old_update, new_update)
    print("✅ 已修复 UPDATE projects SET (col1,col2) = subquery 语法")
else:
    print("⚠️  未找到需修复的 UPDATE projects SET 语句")

with open('CLEAN_MIGRATION_V4.sql', 'w', encoding='utf-8') as f:
    f.write(content)

print("\n✅ 已生成 CLEAN_MIGRATION_V4.sql")

# 统计行数
lines = content.count('\n')
print(f"   文件行数: {lines}")
