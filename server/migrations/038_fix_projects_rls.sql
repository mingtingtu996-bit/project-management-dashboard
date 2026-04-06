-- ================================================
-- 修复projects表RLS策略
-- 目标: 为projects表添加完整的行级安全策略
-- 影响: 防止跨用户数据泄露
-- ================================================

-- 启用行级安全
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ================================================
-- RLS策略定义
-- ================================================

-- 1. SELECT策略 - 只能查看自己的项目
-- 允许查看自己的项目或公开模板
CREATE POLICY "projects_select_own" ON projects
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR is_template = true
  );

-- 2. INSERT策略 - 只能插入自己的项目
-- 确保创建的项目owner_id为当前用户
CREATE POLICY "projects_insert_own" ON projects
  FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
  );

-- 3. UPDATE策略 - 只能更新自己的项目
-- 防止修改其他用户的项目
CREATE POLICY "projects_update_own" ON projects
  FOR UPDATE
  USING (
    owner_id = auth.uid()
  );

-- 4. DELETE策略 - 只能删除自己的项目
-- 防止删除其他用户的项目
CREATE POLICY "projects_delete_own" ON projects
  FOR DELETE
  USING (
    owner_id = auth.uid()
  );

-- ================================================
-- 验证策略是否创建成功
-- ================================================

-- 查看所有策略
SELECT
  tablename,
  policyname,
  permissive,
  cmd,
  CASE
    WHEN cmd = 'r' THEN 'SELECT'
    WHEN cmd = 'a' THEN 'INSERT'
    WHEN cmd = 'w' THEN 'UPDATE'
    WHEN cmd = 'd' THEN 'DELETE'
    WHEN cmd = '*' THEN 'ALL'
  END AS operation,
  CASE
    WHEN qual IS NOT NULL THEN '✓'
    ELSE '✗'
  END AS has_using,
  CASE
    WHEN with_check IS NOT NULL THEN '✓'
    ELSE '✗'
  END AS has_check
FROM pg_policies
WHERE tablename = 'projects'
ORDER BY policyname;

-- ================================================
-- 验证RLS是否启用
-- ================================================

SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS rls_forced
FROM pg_tables
WHERE tablename = 'projects';

-- ================================================
-- 注意事项
-- ================================================

-- 1. RLS策略依赖 auth.uid() 获取当前用户ID
-- 2. 如果没有登录系统,auth.uid() 返回 null
-- 3. 登录系统上线后,auth.uid() 返回实际用户ID
-- 4. 建议在登录系统开发期间,允许匿名访问用于测试
--    可以临时修改SELECT策略为:
--    USING (owner_id = auth.uid() OR is_template = true OR auth.uid() IS NULL)

-- 临时测试策略 (可选,仅开发环境使用)
-- CREATE POLICY "projects_select_all_for_testing" ON projects
--   FOR SELECT
--   USING (true)
--   WITH CHECK (true);
-- DROP POLICY "projects_select_all_for_testing" ON projects;
