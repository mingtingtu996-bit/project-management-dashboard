# RLS修复快速清单 (5分钟)

## 📋 步骤清单

- [ ] **步骤1**: 打开 [CloudBase控制台](https://tcb.cloud.tencent.com/dev?envId=project-management-8d1l147388982)
- [ ] **步骤2**: 左侧菜单 → MySQL数据库
- [ ] **步骤3**: 点击 "SQL编辑器"
- [ ] **步骤4**: 粘贴下面的SQL并执行
- [ ] **步骤5**: 确认输出有4个策略和 `rls_enabled=true`

---

## 📝 SQL代码

```sql
-- 启用RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- SELECT策略
CREATE POLICY "projects_select_own" ON projects
  FOR SELECT USING (owner_id = auth.uid() OR is_template = true);

-- INSERT策略
CREATE POLICY "projects_insert_own" ON projects
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- UPDATE策略
CREATE POLICY "projects_update_own" ON projects
  FOR UPDATE USING (owner_id = auth.uid());

-- DELETE策略
CREATE POLICY "projects_delete_own" ON projects
  FOR DELETE USING (owner_id = auth.uid());

-- 验证
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename='projects';
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename='projects';
```

---

## ✅ 验证结果

期望看到:
- 4个策略: `projects_select_own`, `projects_insert_own`, `projects_update_own`, `projects_delete_own`
- `rls_enabled = true`

---

## 🎯 完成后

修复完成后,可以:
1. ✅ 告诉我 "RLS修复完成"
2. ✅ 继续开发登录系统
3. ✅ 两者可以并行进行

---

## ⏱️ 预计时间

- 步骤1-3: 1分钟
- 步骤4: 2分钟 (SQL执行)
- 步骤5: 2分钟 (验证)
- **总计**: 5分钟
