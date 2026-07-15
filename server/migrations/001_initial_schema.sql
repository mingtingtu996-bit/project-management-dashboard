-- 项目管理系统数据库初始化脚本
-- 执行前请在 Supabase SQL Editor 中运行

-- 用户表（无注册模式，使用device_id）
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  joined_at TIMESTAMP DEFAULT NOW(),
  last_active TIMESTAMP DEFAULT NOW()
);

-- 项目表
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  primary_invitation_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'todo',
  priority VARCHAR(20) DEFAULT 'medium',
  start_date DATE,
  end_date DATE,
  progress INTEGER DEFAULT 0,
  assignee VARCHAR(100),
  assignee_unit VARCHAR(100),
  dependencies UUID[],
  is_milestone BOOLEAN DEFAULT FALSE,
  version INTEGER DEFAULT 1,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 风险表
CREATE TABLE IF NOT EXISTS risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  level VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'identified',
  probability INTEGER DEFAULT 50,
  impact INTEGER DEFAULT 50,
  mitigation TEXT,
  task_id UUID REFERENCES tasks(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 里程碑表
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 邀请码表
CREATE TABLE IF NOT EXISTS project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  invitation_code VARCHAR(50) UNIQUE NOT NULL,
  permission_level VARCHAR(20) DEFAULT 'editor',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  is_revoked BOOLEAN DEFAULT FALSE,
  used_count INTEGER DEFAULT 0,
  max_uses INTEGER
);

-- 项目成员表
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  invitation_code_id UUID REFERENCES project_invitations(id),
  permission_level VARCHAR(20) DEFAULT 'editor',
  joined_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_invitations_project ON project_invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_members_project ON project_members(project_id);

-- 启用RLS策略（可选，生产环境建议启用）
-- 注意: 启用RLS后需要配置相应的策略
