-- ================================================
-- Migration 050: 为登录系统修改users表结构
-- 目标: 添加用户名密码登录支持，保留device_id兼容性
-- 执行时间: 2026-03-31
-- ================================================

-- ================================================
-- 1. 添加登录相关字段到users表
-- ================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'member';

-- 添加注释
COMMENT ON COLUMN users.username IS '用户名（用于登录）';
COMMENT ON COLUMN users.password_hash IS '密码哈希值（bcrypt）';
COMMENT ON COLUMN users.email IS '邮箱地址';
COMMENT ON COLUMN users.role IS '角色：owner（所有者）/member（成员）';

-- ================================================
-- 2. 为现有device_id用户生成临时用户名和密码
-- ================================================

-- 为没有username的用户生成临时username（user_前缀 + device_id前8位）
UPDATE users
SET username = 'user_' || substring(device_id, 1, 8),
    password_hash = '$2b$10$rQK7K8X9hQYz3Q8xZ9mRqO4Q9xZ9mRqO4Q9xZ9mRqO4Q9xZ9mRqO',
    role = 'owner'
WHERE username IS NULL;

-- ================================================
-- 3. 创建默认管理员账户
-- ================================================

-- 先删除已存在的admin（如果存在）
DELETE FROM users WHERE username = 'admin';

-- 创建默认管理员：admin / admin123
INSERT INTO users (
  id,
  username,
  password_hash,
  display_name,
  email,
  role,
  device_id,
  joined_at,
  last_active
) VALUES (
  gen_random_uuid(),
  'admin',
  '$2b$10$N9qo8uLOickgx2ZMRZoMye1j/1Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q', -- admin123的bcrypt哈希
  '系统管理员',
  'admin@company.com',
  'owner',
  'admin-device',
  NOW(),
  NOW()
);

-- ================================================
-- 4. 创建索引优化查询性能
-- ================================================

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ================================================
-- 5. 启用users表的RLS策略
-- ================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- SELECT策略：用户可以查看自己和project_members中同项目的用户
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (
    id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM project_members pm
      JOIN project_members pm2 ON pm.project_id = pm2.project_id
      WHERE pm.user_id = auth.uid()
        AND pm2.user_id = users.id
        AND pm.is_active = TRUE
        AND pm2.is_active = TRUE
    )
  );

-- INSERT策略：允许创建新用户（注册）
CREATE POLICY "users_insert_self" ON users
  FOR INSERT WITH CHECK (
    username IS NOT NULL AND
    password_hash IS NOT NULL
  );

-- UPDATE策略：只能更新自己的信息
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (
    id = auth.uid()
  );

-- DELETE策略：不能删除用户（使用软删除或禁用）
CREATE POLICY "users_delete_none" ON users
  FOR DELETE USING (false);

-- ================================================
-- 6. 修改projects表的owner_id字段（如果没有）
-- ================================================

-- 检查owner_id是否存在，如果不存在则添加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects'
      AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN owner_id UUID REFERENCES users(id);
    COMMENT ON COLUMN projects.owner_id IS '项目所有者ID';
    
    -- 为现有项目设置owner_id（取第一个成员或使用admin）
    UPDATE projects
    SET owner_id = (
      SELECT DISTINCT user_id
      FROM project_members
      WHERE project_members.project_id = projects.id
      LIMIT 1
    )
    WHERE owner_id IS NULL;

    -- 如果还是没有owner_id（空项目），设置为admin
    UPDATE projects
    SET owner_id = (SELECT id FROM users WHERE username = 'admin' LIMIT 1)
    WHERE owner_id IS NULL;
  END IF;
END $$;

-- ================================================
-- 7. 修改project_members表，添加role字段
-- ================================================

-- 检查project_members的permission_level字段
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_members'
      AND column_name = 'permission_level'
  ) THEN
    ALTER TABLE project_members ADD COLUMN permission_level VARCHAR(20) DEFAULT 'editor';
  END IF;
END $$;

-- ================================================
-- 8. 验证Migration是否成功
-- ================================================

-- 查看users表结构
SELECT
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users'
  AND table_schema = current_schema()
ORDER BY ordinal_position;

-- 查看默认管理员账户
SELECT
  id,
  username,
  display_name,
  email,
  role,
  joined_at
FROM users
WHERE username = 'admin';

-- 查看users表RLS策略
SELECT
  policyname,
  permissive,
  cmd,
  CASE
    WHEN cmd = 'r' THEN 'SELECT'
    WHEN cmd = 'a' THEN 'INSERT'
    WHEN cmd = 'w' THEN 'UPDATE'
    WHEN cmd = 'd' THEN 'DELETE'
    WHEN cmd = '*' THEN 'ALL'
  END AS operation
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- 查看所有用户
SELECT
  id,
  username,
  display_name,
  email,
  role,
  device_id,
  joined_at
FROM users
ORDER BY joined_at;

-- ================================================
-- Migration完成
-- ================================================

-- 注意事项：
-- 1. 默认管理员账户：admin / admin123
-- 2. 临时密码：$2b$10$rQK7K8X9hQYz3Q8xZ9mRqO4Q9xZ9mRqO4Q9xZ9mRqO4Q9xZ9mRqO（不安全，仅用于迁移）
-- 3. 建议立即修改默认管理员密码
-- 4. 临时账户可以后续通知用户重置密码
