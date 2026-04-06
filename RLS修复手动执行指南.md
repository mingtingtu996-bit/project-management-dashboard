# RLS修复手动执行指南

## 🚨 重要性说明

**当前P0安全漏洞**: `projects` 表缺少RLS策略
**影响**: 任何登录用户都能访问所有项目数据
**修复时间**: 5分钟
**风险**: 高 - 必须立即修复

---

## 📋 执行步骤

### 步骤1: 打开CloudBase控制台 (30秒)

**控制台地址**:
```
https://tcb.cloud.tencent.com/dev?envId=project-management-8d1l147388982
```

### 步骤2: 进入MySQL数据库页面 (30秒)

1. 左侧菜单选择 **MySQL数据库**
2. 进入数据库管理页面

### 步骤3: 打开SQL编辑器 (30秒)

1. 点击 **SQL编辑器** 按钮
2. 会打开一个SQL编辑窗口

### 步骤4: 执行RLS修复SQL (2分钟)

**复制以下SQL内容到SQL编辑器**:

```sql
-- ================================================
-- 修复projects表RLS策略
-- 目标: 为projects表添加完整的行级安全策略
-- ================================================

-- 启用行级安全
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 1. SELECT策略 - 只能查看自己的项目
CREATE POLICY "projects_select_own" ON projects
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR is_template = true
  );

-- 2. INSERT策略 - 只能插入自己的项目
CREATE POLICY "projects_insert_own" ON projects
  FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
  );

-- 3. UPDATE策略 - 只能更新自己的项目
CREATE POLICY "projects_update_own" ON projects
  FOR UPDATE
  USING (
    owner_id = auth.uid()
  );

-- 4. DELETE策略 - 只能删除自己的项目
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

-- 验证RLS是否启用
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS rls_forced
FROM pg_tables
WHERE tablename = 'projects';
```

3. 点击 **执行** 按钮
4. 等待执行结果

### 步骤5: 验证结果 (1分钟)

**期望的输出**:

```text
-- 验证1: 查看所有策略 (应该有4个策略)
tablename | policyname              | permissive | cmd | operation | has_using | has_check
---------|------------------------|-----------|-----|-----------|-----------|----------
projects | projects_delete_own     | t         | d   | DELETE    | ✓         | ✗
projects | projects_insert_own     | t         | a   | INSERT    | ✗         | ✓
projects | projects_select_own     | t         | r   | SELECT    | ✓         | ✗
projects | projects_update_own     | t         | w   | UPDATE    | ✓         | ✗

-- 验证2: RLS是否启用 (应该是true)
schemaname | tablename | rls_enabled | rls_forced
-----------|-----------|-------------|------------
public     | projects  | true        | f
```

---

## ✅ 验证清单

执行完SQL后,确认以下内容:

- [ ] **4个RLS策略都已创建**
  - [ ] `projects_select_own` (SELECT)
  - [ ] `projects_insert_own` (INSERT)
  - [ ] `projects_update_own` (UPDATE)
  - [ ] `projects_delete_own` (DELETE)

- [ ] **RLS已启用**
  - [ ] `rls_enabled = true`
  - [ ] `rls_forced = false`

- [ ] **没有错误信息**
  - [ ] SQL执行无错误
  - [ ] 策略创建成功

---

## 🎯 RLS策略说明

### SELECT策略
```sql
USING (owner_id = auth.uid() OR is_template = true)
```
- 用户只能看到自己的项目
- 或公开模板项目 (`is_template = true`)

### INSERT策略
```sql
WITH CHECK (owner_id = auth.uid())
```
- 只能插入 `owner_id` 为自己的项目
- 防止为其他用户创建项目

### UPDATE策略
```sql
USING (owner_id = auth.uid())
```
- 只能更新自己的项目
- 防止修改其他用户的项目

### DELETE策略
```sql
USING (owner_id = auth.uid())
```
- 只能删除自己的项目
- 防止删除其他用户的项目

---

## ⚠️ 重要说明

### 当前状态: auth.uid() = null

**没有登录系统**:
- `auth.uid()` 返回 `null`
- 所有查询返回空结果
- 匿名用户无法访问任何数据

**影响**: 在登录系统开发期间,应用可能会显示"无数据"

### 登录系统上线后

**有登录系统**:
- `auth.uid()` 返回实际用户ID
- RLS策略正常工作
- 用户只能访问自己的数据

---

## 🔄 临时测试方案 (可选)

如果需要在登录系统开发期间测试应用,可以临时允许所有用户访问:

**添加临时策略**:
```sql
CREATE POLICY "projects_select_all_for_testing" ON projects
  FOR SELECT
  USING (true)
  WITH CHECK (true);
```

**测试完成后删除**:
```sql
DROP POLICY "projects_select_all_for_testing" ON projects;
```

**⚠️ 警告**: 生产环境绝对不能使用临时策略!

---

## 📝 后续工作

RLS修复完成后,继续登录系统集成:

1. **前端SDK集成** (2小时)
   - 安装 `@cloudbase/js-sdk`
   - 配置认证
   - 实现登录页面

2. **测试多用户隔离** (30分钟)
   - 测试用户A只能看到自己的项目
   - 测试用户B只能看到自己的项目

3. **安全验证** (30分钟)
   - 测试未授权访问被拒绝
   - 测试跨用户操作被拒绝

---

## 🆘 常见问题

### Q1: SQL执行报错 "policy already exists"

**原因**: RLS策略可能已经存在

**解决**: 先删除现有策略,再创建:
```sql
-- 删除现有策略
DROP POLICY IF EXISTS "projects_select_own" ON projects;
DROP POLICY IF EXISTS "projects_insert_own" ON projects;
DROP POLICY IF EXISTS "projects_update_own" ON projects;
DROP POLICY IF EXISTS "projects_delete_own" ON projects;

-- 然后重新创建
-- (复制上面的CREATE POLICY语句)
```

### Q2: SQL执行报错 "relation does not exist"

**原因**: 可能连接了错误的数据库

**解决**: 
1. 确认数据库连接正确
2. 检查 `projects` 表是否存在:
```sql
SELECT * FROM projects LIMIT 1;
```

### Q3: 登录系统开发期间应用显示"无数据"

**原因**: RLS生效,但 `auth.uid()` = null

**解决**: 
- 选项1: 添加临时测试策略 (见上节)
- 选项2: 直接开发登录系统,完成后自然解决

### Q4: 如何查看所有表的RLS状态?

**SQL**:
```sql
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

---

## 📊 对比: 修复前后

| 项目 | 修复前 | 修复后 |
|------|--------|--------|
| **安全性** | ❌ 所有用户能访问所有数据 | ✅ 用户只能访问自己的数据 |
| **RLS策略** | ❌ 无任何RLS策略 | ✅ 4个完整的RLS策略 |
| **数据隔离** | ❌ 无隔离 | ✅ 多租户完全隔离 |
| **合规性** | ❌ 不符合安全规范 | ✅ 符合安全规范 |
| **风险等级** | 🔴 P0严重漏洞 | 🟢 安全 |

---

## ✨ 总结

**修复时间**: 5分钟
**风险**: 从P0降低到低风险
**效果**: 完全防止跨用户数据泄露

**下一步**: 继续登录系统集成 (预计3小时)

---

**执行时间**: _______________
**执行人**: _______________
**验证结果**: ☐ 通过  ☐ 失败
**备注**: _______________________
