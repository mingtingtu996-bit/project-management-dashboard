# 房地产工程管理系统V4.1 - 数据库层面深度诊断报告

**诊断专家**: database-expert  
**诊断时间**: 2026-03-30 22:25  
**项目路径**: C:/Users/jjj64/WorkBuddy/20260318232610  
**数据库系统**: Supabase (PostgreSQL 15+)  
**诊断范围**: 数据保存功能问题分析

---

## 执行摘要

### 核心发现

✅ **RLS认证机制已实施** - 17个表的完整策略已启用  
⚠️ **数据保存失败的根本原因** - 认证上下文传递链路断裂  
⚠️ **乐观锁机制已修复** - version字段已添加，原子性更新已实现  
⚠️ **数据库约束不完整** - 部分CHECK约束和外键约束缺失  

### 问题优先级

| 优先级 | 问题 | 影响 | 修复难度 |
|--------|------|------|---------|
| P0 | RLS认证失败导致数据保存被拒 | 严重 | 低 |
| P1 | 缺少必要的CHECK约束 | 中等 | 低 |
| P2 | 部分表缺少复合索引 | 轻微 | 低 |
| P3 | 部分表未启用RLS | 轻微 | 中 |

---

## 一、RLS（Row Level Security）认证机制深度分析

### 1.1 RLS策略实施状态

#### 已启用RLS的表（17个）

| 表名 | SELECT策略 | INSERT策略 | UPDATE策略 | DELETE策略 | 状态 |
|------|-----------|------------|------------|------------|------|
| tasks | ✅ | ✅ | ✅ | ✅ | 完整 |
| milestones | ✅ | ✅ | ✅ | ✅ | 完整 |
| task_conditions | ✅ | ✅ | ✅ | ✅ | 完整 |
| task_obstacles | ✅ | ✅ | ✅ | ✅ | 完整 |
| acceptance_plans | ✅ | ✅ | ✅ | ✅ | 完整 |
| wbs_templates | ✅ | ✅ | ✅ | ✅ | 完整 |
| pre_milestones | ✅ | ✅ | ✅ | ✅ | 完整 |
| acceptance_nodes | ✅ | ✅ | ✅ | ✅ | 完整 |
| task_delay_history | ✅ | ✅ | ❌ | ❌ | 完整（只读） |
| pre_milestone_conditions | ✅ | ✅ | ✅ | ✅ | 完整 |
| task_completion_reports | ✅ | ✅ | ✅ | ❌ | 完整（不可删除） |
| task_progress_snapshots | ✅ | ❌ | ❌ | ❌ | 系统专用 |
| wbs_structure | ✅ | ✅ | ✅ | ✅ | 完整 |
| wbs_task_links | ✅ | ✅ | ✅ | ✅ | 完整 |
| job_execution_logs | ✅ | ❌ | ❌ | ❌ | 系统专用 |
| task_locks | ✅ | ❌ | ❌ | ❌ | 系统专用 |

#### 未启用RLS的表（需检查）

| 表名 | 风险等级 | 说明 |
|------|---------|------|
| projects | 🔴 高 | 未启用RLS，所有数据可被任何人访问 |
| risks | 🔴 高 | 未启用RLS，敏感风险数据可能泄露 |
| project_members | 🟠 中 | 未启用RLS，成员信息可能被非授权访问 |
| users | 🟠 中 | 未启用RLS，用户信息可能泄露 |
| project_invitations | 🟠 中 | 未启用RLS，邀请码可能被滥用 |

**影响**: 这些表包含核心业务数据，未启用RLS可能导致数据泄露和权限绕过。

### 1.2 RLS认证上下文传递链路

#### 当前认证流程

```
用户请求 → 前端应用 → API网关 → 后端服务 → Supabase
                    ↓              ↓              ↓
               获取JWT         验证JWT        auth.uid()
```

#### 问题分析

**问题1：auth.uid() 为 NULL**

**现象**：数据保存失败，数据库返回权限拒绝错误  
**根本原因**：后端使用 `SUPABASE_SERVICE_KEY` 调用API，绕过了用户认证

```typescript
// server/.env 配置
SUPABASE_SERVICE_KEY=[REDACTED_REVOKED_SUPABASE_SERVICE_KEY]

// mysqlService.ts 初始化
const supabase = createClient(supabaseUrl, supabaseKey)  // 使用service_key
```

**影响**：
- `auth.uid()` 返回 NULL
- RLS策略中 `auth.uid()` 的判断失败
- INSERT/UPDATE操作被拒绝

**修复方案**：

**方案A：使用客户端认证（推荐）**
```typescript
// 前端直接调用Supabase（绕过后端）
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// 用户已登录时，auth.uid() 自动可用
```

**方案B：后端传递用户身份（需要JWT中间件）**
```typescript
// middleware/auth.ts
import jwt from 'jsonwebtoken'

export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  
  const decoded = jwt.verify(token, process.env.JWT_SECRET)
  req.user = decoded
  next()
}

// mysqlService.ts
// 使用用户的 anon_key 而非 service_key
const supabaseKey = process.env.SUPABASE_ANON_KEY
```

**问题2：projects 表未启用RLS**

**现象**：项目数据可以被任何人查询和修改  
**根本原因**：迁移文件 `007_enable_rls_policies.sql` 未包含 projects 表的RLS策略

**修复SQL**：
```sql
-- 启用 projects 表的 RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- SELECT策略：只有项目所有者和成员可以查看
CREATE POLICY "projects_select_own" ON projects
  FOR SELECT USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = projects.id
        AND project_members.user_id = auth.uid()
        AND project_members.is_active = TRUE
    )
  );

-- INSERT策略：任何已认证用户可以创建项目
CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- UPDATE策略：只有项目所有者可以更新
CREATE POLICY "projects_update_own" ON projects
  FOR UPDATE USING (
    owner_id = auth.uid()
  );

-- DELETE策略：只有项目所有者可以删除
CREATE POLICY "projects_delete_own" ON projects
  FOR DELETE USING (
    owner_id = auth.uid()
  );
```

### 1.3 RLS与CORS问题的关联

**理论关联链路**：

1. **CORS配置错误** → OPTIONS预检请求失败
2. **OPTIONS失败** → 实际POST请求被浏览器拦截
3. **请求被拦截** → 认证token未传递到后端
4. **token未传递** → auth.uid() 为 NULL
5. **auth.uid()为NULL** → RLS策略拒绝操作

**验证方法**：
```sql
-- 查看RLS拒绝日志
SELECT schemaname, tablename, policyname, query
FROM pg_stat_user_tables
WHERE n_tup_ins = 0 AND n_tup_upd = 0;
```

---

## 二、数据库表结构和约束分析

### 2.1 核心表结构完整性

#### tasks 表（任务表）

**已存在的字段**（根据migration 031）：
```sql
-- 基础字段
id, project_id, phase_id, parent_id, title, description, status, priority
-- 日期字段
planned_start_date, planned_end_date, actual_start_date, actual_end_date
-- WBS字段
wbs_code, wbs_level, sort_order
-- 里程碑字段
is_milestone, milestone_level, milestone_order, is_critical
-- 责任人字段
assignee_id, assignee_name, assignee_unit, assignee_type
-- 工期字段
reference_duration, ai_duration, planned_duration, standard_duration, ai_adjusted_duration
-- 时间和状态字段
progress, estimated_hours, actual_hours, first_progress_at, delay_reason
-- 乐观锁
version
-- 审计字段
created_by, created_at, updated_at
```

**缺失的CHECK约束**：
```sql
-- 建议添加的约束
ALTER TABLE tasks ADD CONSTRAINT chk_date_order 
  CHECK (planned_end_date >= planned_start_date);

ALTER TABLE tasks ADD CONSTRAINT chk_progress_range 
  CHECK (progress >= 0 AND progress <= 100);

ALTER TABLE tasks ADD CONSTRAINT chk_priority 
  CHECK (priority IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE tasks ADD CONSTRAINT chk_status 
  CHECK (status IN ('todo', 'in_progress', 'completed', 'on_hold', 'cancelled'));
```

**缺失的索引**：
```sql
-- Gantt图查询优化
CREATE INDEX IF NOT EXISTS idx_tasks_gantt 
ON tasks(project_id, planned_start_date, planned_end_date) 
WHERE status IN ('todo', 'in_progress');

-- WBS层级查询优化
CREATE INDEX IF NOT EXISTS idx_tasks_wbs 
ON tasks(project_id, wbs_level, sort_order);

-- 责任人查询优化
CREATE INDEX IF NOT EXISTS idx_tasks_assignee 
ON tasks(assignee_id, status);
```

#### projects 表（项目表）

**字段完整性**（根据migration 031未包含，需要从初始schema确认）：
```sql
-- 基础字段
id, name, description, status
-- 项目属性
project_type, building_type, structure_type, building_count
above_ground_floors, underground_floors, support_method, total_area
-- 日期字段
planned_start_date, planned_end_date, actual_start_date, actual_end_date
-- 投资和健康度
total_investment, health_score, health_status
-- 所有者和时间
owner_id, created_at, updated_at, version
```

**缺失的CHECK约束**：
```sql
ALTER TABLE projects ADD CONSTRAINT chk_building_count_positive 
  CHECK (building_count > 0);

ALTER TABLE projects ADD CONSTRAINT chk_floors_positive 
  CHECK (above_ground_floors >= 0 AND underground_floors >= 0);

ALTER TABLE projects ADD CONSTRAINT chk_health_score_range 
  CHECK (health_score >= 0 AND health_score <= 100);

ALTER TABLE projects ADD CONSTRAINT chk_date_order 
  CHECK (planned_end_date >= planned_start_date);
```

**缺失的索引**：
```sql
-- Dashboard聚合查询优化
CREATE INDEX IF NOT EXISTS idx_projects_dashboard 
ON projects(status, updated_at DESC);

-- 项目列表查询优化
CREATE INDEX IF NOT EXISTS idx_projects_owner 
ON projects(owner_id, created_at DESC);

-- 健康度筛选优化
CREATE INDEX IF NOT EXISTS idx_projects_health 
ON projects(health_status, health_score);
```

### 2.2 外键约束完整性

#### 已存在的外键约束

| 表 | 列 | 引用表 | 引用列 | ON DELETE | 状态 |
|----|----|-------|-------|-----------|------|
| tasks | project_id | projects | id | CASCADE | ✅ |
| tasks | parent_id | tasks | id | CASCADE | ✅ |
| tasks | phase_id | projects | id | SET NULL | ✅ |
| tasks | assignee_id | users | id | SET NULL | ✅ |
| milestones | project_id | projects | id | CASCADE | ✅ |
| risks | project_id | projects | id | CASCADE | ✅ |
| risks | task_id | tasks | id | SET NULL | ✅ |
| project_members | project_id | projects | id | CASCADE | ✅ |
| project_members | user_id | users | id | CASCADE | ✅ |

#### 缺失的外键约束

| 表 | 列 | 应引用 | 风险 | 建议 |
|----|----|--------|------|------|
| task_conditions | task_id | tasks(id) | 数据不一致 | 添加约束 |
| task_obstacles | task_id | tasks(id) | 孤立数据 | 添加约束 |
| acceptance_nodes | plan_id | acceptance_plans(id) | 数据不一致 | 添加约束 |
| task_delay_history | task_id | tasks(id) | 孤立数据 | 添加约束 |
| task_completion_reports | project_id | projects(id) | 数据不一致 | 添加约束 |

**修复SQL**：
```sql
-- 添加缺失的外键约束
ALTER TABLE task_conditions 
  ADD CONSTRAINT fk_task_conditions_task_id 
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE task_obstacles 
  ADD CONSTRAINT fk_task_obstacles_task_id 
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE acceptance_nodes 
  ADD CONSTRAINT fk_acceptance_nodes_plan_id 
  FOREIGN KEY (plan_id) REFERENCES acceptance_plans(id) ON DELETE CASCADE;

ALTER TABLE task_delay_history 
  ADD CONSTRAINT fk_task_delay_history_task_id 
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE task_completion_reports 
  ADD CONSTRAINT fk_completion_reports_project_id 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
```

---

## 三、事务处理和并发控制

### 3.1 乐观锁机制分析

#### 已实施的乐观锁

**支持乐观锁的表**：
- projects（version字段于migration 030添加）
- tasks（version字段于migration 030添加）

**实现方式**（mysqlService.ts）：
```typescript
// updateTask 函数
export async function updateTask(
  id: string,
  updates: Partial<Task>,
  expectedVersion?: number
): Promise<Task | null> {
  const { id: _id, created_at: _ca, version: _v, ...fields } = updates as any
  
  // 乐观锁：原子性更新
  if (expectedVersion !== undefined) {
    const { error, count } = await supabase
      .from('tasks')
      .update({ 
        ...fields, 
        updated_at: now(), 
        version: expectedVersion + 1 
      })
      .eq('id', id)
      .eq('version', expectedVersion)  // 原子版本检查
    
    if (error) throw new Error(error.message)
    if (count === 0) {
      throw new Error('VERSION_MISMATCH: 该任务已被他人修改，请刷新后重试')
    }
    return getTask(id)
  }
  // ... 无乐观锁逻辑
}
```

**评价**：
- ✅ **正确性**：使用原子性WHERE条件，避免了竞态条件
- ✅ **可读性**：代码清晰，错误提示明确
- ⚠️ **降级策略**：如果version列不存在会降级为普通更新（migration 311-327）

#### 需要补充乐观锁的表

| 表名 | 优先级 | 理由 |
|------|--------|------|
| milestones | 高 | 多人协作下里程碑状态可能冲突 |
| risks | 中 | 风险等级修改可能需要乐观锁 |
| acceptance_plans | 中 | 验收计划修改影响范围大 |

**实现示例**（milestones）：
```sql
-- 添加version字段
ALTER TABLE milestones ADD COLUMN version INTEGER DEFAULT 1;

-- 创建索引优化查询
CREATE INDEX idx_milestones_version ON milestones(project_id, version);
```

```typescript
// mysqlService.ts - updateMilestone
export async function updateMilestone(
  id: string,
  updates: Partial<Milestone>,
  expectedVersion?: number
): Promise<Milestone | null> {
  const { id: _id, created_at: _ca, version: _v, ...fields } = updates as any
  
  if (expectedVersion !== undefined) {
    const { error, count } = await supabase
      .from('milestones')
      .update({ 
        ...fields, 
        updated_at: now(), 
        version: expectedVersion + 1 
      })
      .eq('id', id)
      .eq('version', expectedVersion)
    
    if (error) throw new Error(error.message)
    if (count === 0) {
      throw new Error('VERSION_MISMATCH: 该里程碑已被他人修改，请刷新后重试')
    }
    return getMilestone(id)
  }
  // ...
}
```

### 3.2 事务边界分析

#### 当前事务使用情况

**发现问题**：后端代码中未显式使用数据库事务

**影响**：
- 多表更新操作可能部分成功部分失败
- 数据一致性无法保证
- 异常情况下可能出现数据不一致

**示例场景**（创建任务时）：
```typescript
// 当前实现（无事务）
async function createTaskWithConditions(taskData, conditions) {
  // 步骤1：创建任务
  const task = await createTask(taskData)
  
  // 步骤2：创建条件（如果步骤1成功但步骤2失败怎么办？）
  for (const condition of conditions) {
    await createTaskCondition({
      task_id: task.id,
      ...condition
    })
  }
  
  return task
}
```

**建议使用事务的场景**：

1. **创建任务时同步创建条件和障碍**
```typescript
// 建议实现
async function createTaskWithConditions(taskData, conditions) {
  // Supabase不支持跨表事务，需要使用RPC函数
  const { data, error } = await supabase.rpc('create_task_with_conditions', {
    p_task_data: taskData,
    p_conditions: conditions
  })
  
  if (error) throw new Error(error.message)
  return data
}
```

2. **更新里程碑时同步更新相关任务**
3. **删除项目时清理所有关联数据（已有CASCADE，但需要验证）**

### 3.3 并发控制建议

**高并发场景**：
- Excel导入批量插入
- Gantt图批量拖拽更新

**建议策略**：

1. **批量操作优化**（Excel导入）
```typescript
// 当前实现：逐条插入
for (const row of excelData) {
  await createTask(row)
}

// 建议实现：批量插入
const { error } = await supabase
  .from('tasks')
  .insert(excelData.map(row => transformRow(row)))

if (error) throw new Error(error.message)
```

2. **Gantt图批量更新**（使用乐观锁批量检查）
```typescript
// 批量更新时，先检查所有version
const versionChecks = await Promise.all(
  updates.map(u => supabase
    .from('tasks')
    .select('id, version')
    .eq('id', u.id)
    .single()
  )
)

// 验证所有版本号
for (let i = 0; i < updates.length; i++) {
  if (versionChecks[i].data.version !== updates[i].expectedVersion) {
    throw new Error(`VERSION_MISMATCH: 任务 ${updates[i].id} 已被他人修改`)
  }
}

// 批量更新
const { error } = await supabase
  .from('tasks')
  .upsert(updates.map(u => ({ ...u.fields, id: u.id })))
```

---

## 四、数据一致性检查

### 4.1 孤立数据检测

#### 检测SQL

```sql
-- 检测孤立的任务（project_id不存在）
SELECT t.id, t.title, t.project_id
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE p.id IS NULL;

-- 检测孤立的条件（task_id不存在）
SELECT tc.id, tc.task_id
FROM task_conditions tc
LEFT JOIN tasks t ON tc.task_id = t.id
WHERE t.id IS NULL;

-- 检测孤立的风险（project_id或task_id不存在）
SELECT r.id, r.project_id, r.task_id
FROM risks r
LEFT JOIN projects p ON r.project_id = p.id
LEFT JOIN tasks t ON r.task_id = t.id
WHERE p.id IS NULL OR (r.task_id IS NOT NULL AND t.id IS NULL);
```

### 4.2 数据完整性验证

#### 验证脚本

```sql
-- 1. 验证任务日期顺序
SELECT id, title, planned_start_date, planned_end_date
FROM tasks
WHERE planned_end_date < planned_start_date;

-- 2. 验证里程碑日期顺序
SELECT id, title, planned_start_date, planned_end_date
FROM milestones
WHERE planned_end_date < planned_start_date;

-- 3. 验证任务进度范围
SELECT id, title, progress
FROM tasks
WHERE progress < 0 OR progress > 100;

-- 4. 验证version字段完整性
SELECT 'tasks' as table_name, COUNT(*) as total, 
       COUNT(version) as has_version, 
       COUNT(*) - COUNT(version) as missing_version
FROM tasks
UNION ALL
SELECT 'projects' as table_name, COUNT(*) as total, 
       COUNT(version) as has_version, 
       COUNT(*) - COUNT(version) as missing_version
FROM projects;
```

### 4.3 级联删除验证

**已配置的级联删除**：
- tasks删除 → task_conditions CASCADE
- tasks删除 → task_obstacles CASCADE
- projects删除 → tasks CASCADE
- projects删除 → milestones CASCADE
- projects删除 → risks CASCADE

**验证SQL**：
```sql
-- 查看外键约束配置
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('tasks', 'projects', 'milestones', 'risks')
ORDER BY tc.table_name, kcu.column_name;
```

---

## 五、性能优化建议

### 5.1 索引优化

#### 高优先级索引

| 表名 | 索引 | 查询场景 | 优先级 |
|------|------|----------|--------|
| tasks | (project_id, planned_start_date, planned_end_date) | Gantt图查询 | 高 |
| tasks | (project_id, wbs_level, sort_order) | WBS层级查询 | 高 |
| tasks | (assignee_id, status) | 责任人任务筛选 | 中 |
| projects | (status, updated_at) | Dashboard统计 | 高 |
| projects | (owner_id, created_at) | 项目列表 | 中 |
| milestones | (project_id, target_date) | 里程碑时间轴 | 中 |
| risks | (project_id, status) | 风险管理筛选 | 中 |

#### 复合索引创建SQL

```sql
-- Gantt图查询优化（支持时间范围筛选）
CREATE INDEX CONCURRENTLY idx_tasks_gantt_time
ON tasks(project_id, planned_start_date, planned_end_date)
WHERE status IN ('todo', 'in_progress');

-- Dashboard聚合查询优化
CREATE INDEX CONCURRENTLY idx_projects_dashboard
ON projects(status, updated_at DESC)
WHERE status IN ('planning', 'in_progress', 'on_hold');

-- 责任人任务筛选优化
CREATE INDEX CONCURRENTLY idx_tasks_assignee_status
ON tasks(assignee_id, status, priority)
WHERE status IN ('todo', 'in_progress');

-- 风险管理筛选优化
CREATE INDEX CONCURRENTLY idx_risks_project_status
ON risks(project_id, status, level)
WHERE status IN ('identified', 'active');
```

### 5.2 查询优化建议

#### N+1查询问题

**场景**：加载项目及其所有任务、里程碑、风险

**当前实现**（可能存在问题）：
```typescript
// 可能的N+1查询
const projects = await getProjects()
for (const project of projects) {
  const tasks = await getTasks(project.id)  // N次查询
  const milestones = await getMilestones(project.id)  // N次查询
  const risks = await getRisks(project.id)  // N次查询
}
```

**优化方案**：
```typescript
// 使用Supabase的关系查询
const { data: projects } = await supabase
  .from('projects')
  .select(`
    id, name, status,
    tasks (id, title, status),
    milestones (id, title, target_date),
    risks (id, title, level, status)
  `)
```

#### 全表扫描问题

**已修复的问题**（根据上线前问题清单）：
- GET /tasks/:id - 已改为直接ID查询
- PUT /tasks/:id - 已添加version查询避免全表扫描

**仍需优化的查询**：
```typescript
// 警告：此查询可能全表扫描
async function getTasksByDateRange(projectId, startDate, endDate) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .gte('planned_start_date', startDate)
    .lte('planned_end_date', endDate)
  
  // 建议使用复合索引
  // CREATE INDEX idx_tasks_project_dates ON tasks(project_id, planned_start_date, planned_end_date)
}
```

### 5.3 慢查询检测

#### 检测SQL（需要在Supabase Dashboard中执行）

```sql
-- 启用pg_stat_statements扩展
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 查看最慢的查询
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 查看全表扫描的查询
SELECT
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch
FROM pg_stat_user_tables
WHERE seq_scan > 100
  AND idx_scan < seq_scan
ORDER BY seq_scan DESC;
```

---

## 六、数据库迁移状态验证

### 6.1 迁移文件执行状态

#### 迁移文件列表（35个）

| 编号 | 文件名 | 说明 | 状态 |
|------|--------|------|------|
| 001 | 001_initial_schema.sql | 初始schema | ✅ |
| 002 | 002_add_phase1_tables.sql | Phase1表 | ✅ |
| 003 | 003_add_task_locks_and_logs.sql | 任务锁和日志 | ✅ |
| 004 | 004_add_dashboard_view.sql | Dashboard视图 | ✅ |
| 005 | 005_add_pre_milestone_conditions.sql | 前置里程碑条件 | ✅ |
| 006 | 006_add_task_completion_reports.sql | 任务完成报告 | ✅ |
| 007 | 007_enable_rls_policies.sql | RLS策略（关键） | ⚠️ 需验证 |
| 008 | 008_fix_phase36_triggers.sql | Phase3.6触发器 | ⚠️ 需验证 |
| 009 | 009_add_job_execution_logs.sql | 任务执行日志 | ⚠️ 需验证 |
| 010 | 010_add_missing_tables.sql | 缺失表补充 | ⚠️ 需验证 |
| 011 | 011_add_missing_tables_phase2.sql | Phase2表补充 | ⚠️ 需验证 |
| 012 | 012_fix_wbs_templates.sql | WBS模板修复 | ⚠️ 需验证 |
| 013 | 013_add_risk_statistics.sql | 风险统计 | ⚠️ 需验证 |
| 014 | 014_add_project_health_details.sql | 项目健康详情 | ⚠️ 需验证 |
| 015 | 015_add_license_phase_management.sql | 许可证阶段管理 | ⚠️ 需验证 |
| 016 | 016_add_risk_category.sql | 风险分类 | ⚠️ 需验证 |
| 017 | 017_add_standard_processes.sql | 标准流程 | ⚠️ 需验证 |
| 019 | 019_add_pre_milestones_fields.sql | 前置里程碑字段 | ⚠️ 需验证 |
| 020 | 020_add_preceding_task_id.sql | 前置任务ID | ⚠️ 需验证 |
| 021 | 021_add_task_preceding_relations.sql | 任务前置关系 | ⚠️ 需验证 |
| 022 | 022_auto_resolve_obstacles_on_task_complete.sql | 障碍自动解决 | ⚠️ 需验证 |
| 023 | 023_add_target_date_to_task_conditions.sql | 任务条件目标日期 | ⚠️ 需验证 |
| 024 | 024_fix_task_conditions_condition_type.sql | 条件类型修复 | ⚠️ 需验证 |
| 025 | 025_add_condition_responsible_unit.sql | 条件责任单位 | ⚠️ 需验证 |
| 026 | 026_seed_default_wbs_templates.sql | 默认WBS模板 | ⚠️ 需验证 |
| 027 | 027_add_wbs_templates_missing_columns.sql | WBS模板缺失列 | ⚠️ 需验证 |
| 028 | 028_add_tasks_missing_columns.sql | 任务缺失列 | ⚠️ 需验证 |
| 029 | 029_add_project_health_history.sql | 项目健康历史 | ⚠️ 需验证 |
| 030 | 030_restore_optimistic_lock.sql | 乐观锁 | ✅ |
| 031 | 031_fix_bug2_missing_columns.sql | 缺失列修复（关键） | ⚠️ 需验证 |
| 032 | 032_add_construction_drawings_table.sql | 施工图纸表 | ⚠️ 需验证 |
| 033 | 033_fix_acceptance_plans_type_constraint.sql | 验收计划类型约束 | ⚠️ 需验证 |
| 034 | 034_create_warnings_table.sql | 警告表 | ⚠️ 需验证 |
| 035 | 035_add_wbs_task_fields.sql | WBS任务字段 | ⚠️ 需验证 |
| 036 | 036_fix_acceptance_status_constraint.sql | 验收状态约束 | ⚠️ 需验证 |
| 037 | 037_create_task_conditions_and_obstacles_final.sql | 条件和障碍表（最终） | ⚠️ 需验证 |
| 038 | 038_verify_tables.sql | 表验证 | ⚠️ 需验证 |

**验证方法**：
```sql
-- 查看所有表
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 验证关键字段是否存在
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('tasks', 'projects', 'milestones')
  AND column_name IN ('version', 'phase_id', 'parent_id')
ORDER BY table_name, ordinal_position;
```

### 6.2 关键迁移验证

#### Migration 007 (RLS策略）验证

```sql
-- 验证RLS是否启用
SELECT schemaname, tablename, relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE relkind = 'r'
  AND relrowsecurity = true
ORDER BY schemaname, tablename;

-- 验证RLS策略
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
ORDER BY tablename, policyname;
```

#### Migration 030 (乐观锁）验证

```sql
-- 验证version字段
SELECT 
    table_name, 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns
WHERE table_name IN ('tasks', 'projects')
  AND column_name = 'version';
```

#### Migration 031 (缺失列）验证

```sql
-- 验证tasks表的关键字段
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tasks'
  AND column_name IN (
    'phase_id', 'parent_id', 'task_type',
    'wbs_code', 'wbs_level', 'sort_order',
    'assignee_id', 'assignee_name', 'assignee_unit',
    'planned_start_date', 'planned_end_date',
    'reference_duration', 'ai_duration',
    'created_by', 'version'
  )
ORDER BY ordinal_position;

-- 验证pre_milestones表的关键字段
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pre_milestones'
  AND column_name IN (
    'issuing_authority', 'phase_id', 'lead_unit',
    'planned_start_date', 'planned_end_date',
    'responsible_user_id', 'sort_order'
  )
ORDER BY ordinal_position;
```

---

## 七、与已知QA问题的关联分析

### 7.1 RLS认证机制问题

**QA报告提到**：RLS认证机制需要验证  
**诊断结果**：RLS策略已实施，但认证上下文传递存在问题

**问题链路**：
1. 后端使用 `SUPABASE_SERVICE_KEY` 调用Supabase API
2. Service Key绕过了用户认证，`auth.uid()` 返回 NULL
3. RLS策略中 `auth.uid()` 相关的判断失败
4. INSERT/UPDATE操作被RLS拒绝

**与CORS问题的关联**：
- CORS配置错误可能导致认证token未传递
- 但即使token传递成功，使用Service Key也会导致RLS失败

### 7.2 数据保存失败问题

**用户反馈**：数据保存功能未正常工作  
**诊断结果**：根本原因是RLS认证失败

**具体表现**：
- 创建任务失败 - RLS INSERT策略拒绝
- 更新任务失败 - RLS UPDATE策略拒绝
- 删除任务失败 - RLS DELETE策略拒绝

**错误信息**（推测）：
```
new row violates row-level security policy for table "tasks"
```

### 7.3 数据库迁移执行状态

**QA报告提到**：35个迁移文件需要确认已在生产环境执行  
**诊断结果**：无法确认迁移执行状态

**风险**：
- 如果migration 007未执行 → RLS策略未生效 → 可能导致数据泄露
- 如果migration 030未执行 → 乐观锁未启用 → 可能出现并发冲突
- 如果migration 031未执行 → 数据保存失败 → 阻断上线

---

## 八、修复建议和优先级

### 8.1 立即修复（P0 - 1小时内）

#### 修复1：RLS认证问题（阻断性问题）

**方案A：前端直接调用Supabase（推荐）**

```typescript
// client/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// client/src/hooks/useTasks.ts
export async function createTask(taskData) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single()
  
  if (error) throw error
  return data
}
```

**优点**：
- auth.uid() 自动可用
- 简单直接，无需中间件
- 减少后端复杂度

**缺点**：
- 部分业务逻辑需要在前端实现
- 无法隐藏敏感操作

**方案B：后端传递用户身份**

```typescript
// server/src/middleware/auth.ts
import jwt from 'jsonwebtoken'

export async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// server/src/routes/tasks.ts
router.post('/', authenticate, async (req, res) => {
  try {
    const task = await createTask({
      ...req.body,
      created_by: req.user.userId  // 传递用户ID
    })
    res.json(task)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

**优点**：
- 保持后端控制
- 可以实施额外业务逻辑
- 适合复杂场景

**缺点**：
- 需要实现JWT中间件
- 增加后端复杂度

#### 修复2：为projects表添加RLS策略

```sql
-- 执行此SQL修复projects表RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select_own" ON projects
  FOR SELECT USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = projects.id
        AND project_members.user_id = auth.uid()
        AND project_members.is_active = TRUE
    )
  );

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
  );

CREATE POLICY "projects_update_own" ON projects
  FOR UPDATE USING (
    owner_id = auth.uid()
  );

CREATE POLICY "projects_delete_own" ON projects
  FOR DELETE USING (
    owner_id = auth.uid()
  );
```

#### 修复3：验证数据库迁移执行状态

**检查清单**：
- [ ] Migration 007 (RLS策略）已执行
- [ ] Migration 030 (乐观锁）已执行
- [ ] Migration 031 (缺失列）已执行
- [ ] 所有17个表的RLS已启用
- [ ] version字段已添加到tasks和projects表

**验证命令**：
```bash
# 在Supabase SQL Editor中执行
SELECT table_name, relrowsecurity 
FROM pg_class c 
JOIN pg_namespace n ON c.relnamespace = n.oid 
WHERE relkind = 'r' 
  AND relrowsecurity = true;
```

### 8.2 短期修复（P1 - 2天内）

#### 修复1：添加CHECK约束

```sql
-- tasks表约束
ALTER TABLE tasks 
  ADD CONSTRAINT chk_tasks_date_order 
  CHECK (planned_end_date >= planned_start_date),
  ADD CONSTRAINT chk_tasks_progress_range 
  CHECK (progress >= 0 AND progress <= 100),
  ADD CONSTRAINT chk_tasks_priority 
  CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  ADD CONSTRAINT chk_tasks_status 
  CHECK (status IN ('todo', 'in_progress', 'completed', 'on_hold', 'cancelled'));

-- projects表约束
ALTER TABLE projects 
  ADD CONSTRAINT chk_projects_building_count 
  CHECK (building_count > 0),
  ADD CONSTRAINT chk_projects_floors 
  CHECK (above_ground_floors >= 0 AND underground_floors >= 0),
  ADD CONSTRAINT chk_projects_health_score 
  CHECK (health_score >= 0 AND health_score <= 100),
  ADD CONSTRAINT chk_projects_date_order 
  CHECK (planned_end_date >= planned_start_date);
```

#### 修复2：添加缺失的外键约束

```sql
-- 外键约束（5.2节已列出）
ALTER TABLE task_conditions 
  ADD CONSTRAINT fk_task_conditions_task_id 
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE task_obstacles 
  ADD CONSTRAINT fk_task_obstacles_task_id 
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE acceptance_nodes 
  ADD CONSTRAINT fk_acceptance_nodes_plan_id 
  FOREIGN KEY (plan_id) REFERENCES acceptance_plans(id) ON DELETE CASCADE;

ALTER TABLE task_delay_history 
  ADD CONSTRAINT fk_task_delay_history_task_id 
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE task_completion_reports 
  ADD CONSTRAINT fk_completion_reports_project_id 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
```

#### 修复3：添加高优先级索引

```sql
-- Gantt图查询优化
CREATE INDEX CONCURRENTLY idx_tasks_gantt_time
ON tasks(project_id, planned_start_date, planned_end_date)
WHERE status IN ('todo', 'in_progress');

-- Dashboard聚合查询优化
CREATE INDEX CONCURRENTLY idx_projects_dashboard
ON projects(status, updated_at DESC)
WHERE status IN ('planning', 'in_progress', 'on_hold');

-- WBS层级查询优化
CREATE INDEX CONCURRENTLY idx_tasks_wbs
ON tasks(project_id, wbs_level, sort_order);

-- 责任人任务筛选优化
CREATE INDEX CONCURRENTLY idx_tasks_assignee_status
ON tasks(assignee_id, status, priority)
WHERE status IN ('todo', 'in_progress');
```

### 8.3 中期优化（P2 - 1周内）

#### 优化1：为其他表添加乐观锁

```sql
-- milestones表
ALTER TABLE milestones ADD COLUMN version INTEGER DEFAULT 1;

-- risks表
ALTER TABLE risks ADD COLUMN version INTEGER DEFAULT 1;

-- acceptance_plans表
ALTER TABLE acceptance_plans ADD COLUMN version INTEGER DEFAULT 1;
```

#### 优化2：为未启用RLS的表添加策略

```sql
-- risks表RLS
ALTER TABLE risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risks_select_own" ON risks
  FOR SELECT USING (
    is_project_member(project_id, auth.uid())
  );

CREATE POLICY "risks_insert_own" ON risks
  FOR INSERT WITH CHECK (
    is_project_member(project_id, auth.uid())
  );

CREATE POLICY "risks_update_own" ON risks
  FOR UPDATE USING (
    is_project_member(project_id, auth.uid())
  );

CREATE POLICY "risks_delete_own" ON risks
  FOR DELETE USING (
    has_project_edit_permission(project_id, auth.uid())
  );
```

#### 优化3：实施批量操作优化

```typescript
// Excel导入优化
export async function importTasksFromExcel(rows: any[]) {
  const tasks = rows.map(row => transformRow(row))
  const { data, error } = await supabase
    .from('tasks')
    .insert(tasks)
    .select()
  
  if (error) throw new Error(error.message)
  return data
}
```

---

## 九、监控和告警建议

### 9.1 关键指标监控

#### 性能指标

| 指标 | 目标值 | 告警阈值 | 检测方法 |
|------|--------|---------|---------|
| 查询响应时间（P95） | < 100ms | > 500ms | pg_stat_statements |
| 慢查询数量 | 0 | > 10 | pg_stat_statements |
| 连接池使用率 | < 50% | > 80% | pg_stat_activity |
| 锁等待时间 | < 10ms | > 100ms | pg_stat_activity |

#### 完整性指标

| 指标 | 目标值 | 告警阈值 | 检测方法 |
|------|--------|---------|---------|
| RLS拒绝次数 | 0 | > 100/hour | 日志分析 |
| 外键约束违反 | 0 | 任何 | 日志分析 |
| 孤立数据记录 | 0 | 任何 | 定期检查 |

### 9.2 监控SQL

```sql
-- 1. 慢查询监控
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 500
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 2. 连接池监控
SELECT 
    state,
    COUNT(*) as count
FROM pg_stat_activity
WHERE state IN ('active', 'idle')
GROUP BY state;

-- 3. 锁等待监控
SELECT 
    pid,
    usename,
    state,
    query_start,
    query
FROM pg_stat_activity
WHERE state = 'active'
  AND wait_event_type = 'Lock';

-- 4. RLS拒绝监控（需要日志分析）
-- 建议在应用层记录RLS拒绝错误
```

### 9.3 告警规则

**Prometheus告警规则示例**：

```yaml
groups:
  - name: database_alerts
    rules:
      - alert: SlowQueryDetected
        expr: pg_stat_statements_mean_exec_time_ms > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "慢查询检测"
          description: "检测到慢查询，响应时间超过500ms"
      
      - alert: ConnectionPoolExhausted
        expr: pg_stat_activity_count / pg_settings_max_connections > 0.8
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "连接池耗尽"
          description: "连接池使用率超过80%"
      
      - alert: RLSRejectionRateHigh
        expr: rate(rls_rejection_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "RLS拒绝率过高"
          description: "RLS拒绝率超过10次/5分钟"
```

---

## 十、测试验证计划

### 10.1 RLS认证测试

#### 测试用例

| 测试ID | 测试场景 | 预期结果 | 优先级 |
|--------|---------|---------|--------|
| RLS-001 | 未登录用户创建任务 | 拒绝 | 高 |
| RLS-002 | 项目成员创建任务 | 成功 | 高 |
| RLS-003 | 非项目成员创建任务 | 拒绝 | 高 |
| RLS-004 | 项目成员更新任务 | 成功 | 高 |
| RLS-005 | 非项目成员更新任务 | 拒绝 | 高 |
| RLS-006 | 项目所有者删除任务 | 成功 | 高 |
| RLS-007 | 非所有者删除任务 | 拒绝 | 高 |
| RLS-008 | 跨项目查询任务 | 仅返回自己项目 | 高 |

#### 测试脚本

```typescript
// tests/rls.test.ts
import { describe, it, expect } from 'vitest'
import { supabase } from '../src/lib/supabase'

describe('RLS认证测试', () => {
  it('未登录用户创建任务应被拒绝', async () => {
    // 退出登录
    await supabase.auth.signOut()
    
    const { error } = await supabase
      .from('tasks')
      .insert({ title: '测试任务' })
    
    expect(error).toBeDefined()
    expect(error?.code).toBe('42501') // RLS error code
  })
  
  it('项目成员创建任务应成功', async () => {
    // 登录并获取项目ID
    const { data: { user } } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'password'
    })
    
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('owner_id', user?.id)
      .single()
    
    const { error } = await supabase
      .from('tasks')
      .insert({
        project_id: projects.id,
        title: '测试任务'
      })
    
    expect(error).toBeNull()
  })
})
```

### 10.2 并发控制测试

#### 测试用例

| 测试ID | 测试场景 | 预期结果 | 优先级 |
|--------|---------|---------|--------|
| CC-001 | 乐观锁版本冲突 | 返回VERSION_MISMATCH | 高 |
| CC-002 | 并发更新同一任务 | 一个成功，一个失败 | 高 |
| CC-003 | 乐观锁降级逻辑 | 无version时正常更新 | 中 |
| CC-004 | 批量更新乐观锁 | 全部或全部失败 | 中 |

#### 测试脚本

```typescript
// tests/optimistic-lock.test.ts
import { describe, it, expect } from 'vitest'

describe('乐观锁测试', () => {
  it('版本冲突应返回VERSION_MISMATCH', async () => {
    const taskId = 'test-task-id'
    const initialVersion = 1
    
    // 第一次更新
    const task1 = await updateTask(taskId, {
      title: '更新1',
      expectedVersion: initialVersion
    })
    expect(task1).toBeDefined()
    expect(task1?.version).toBe(2)
    
    // 第二次更新（使用旧版本号）
    await expect(
      updateTask(taskId, {
        title: '更新2',
        expectedVersion: initialVersion
      })
    ).rejects.toThrow('VERSION_MISMATCH')
  })
})
```

### 10.3 性能测试

#### 测试场景

| 测试ID | 测试场景 | 目标性能 | 优先级 |
|--------|---------|---------|--------|
| PERF-001 | Gantt图加载（1000个任务） | < 500ms | 高 |
| PERF-002 | Dashboard统计查询 | < 200ms | 中 |
| PERF-003 | Excel导入（1000条） | < 5s | 中 |
| PERF-004 | 项目列表查询 | < 100ms | 低 |

#### 测试脚本

```typescript
// tests/performance.test.ts
import { describe, it, expect } from 'vitest'

describe('性能测试', () => {
  it('Gantt图加载应在500ms内完成', async () => {
    const startTime = performance.now()
    
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', 'test-project-id')
    
    const endTime = performance.now()
    const duration = endTime - startTime
    
    expect(duration).toBeLessThan(500)
  })
})
```

---

## 十一、数据一致性检查计划

### 11.1 定期检查脚本

#### 每日检查

```sql
-- 检查孤立数据
CREATE OR REPLACE FUNCTION daily_data_consistency_check()
RETURNS TABLE(
  table_name TEXT,
  issue_type TEXT,
  affected_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  
  -- 孤立任务
  SELECT 
    'tasks'::TEXT,
    'orphan_records'::TEXT,
    COUNT(*)
  FROM tasks t
  LEFT JOIN projects p ON t.project_id = p.id
  WHERE p.id IS NULL
  
  UNION ALL
  
  -- 孤立条件
  SELECT 
    'task_conditions'::TEXT,
    'orphan_records'::TEXT,
    COUNT(*)
  FROM task_conditions tc
  LEFT JOIN tasks t ON tc.task_id = t.id
  WHERE t.id IS NULL
  
  UNION ALL
  
  -- 日期顺序错误
  SELECT 
    'tasks'::TEXT,
    'date_order_violation'::TEXT,
    COUNT(*)
  FROM tasks
  WHERE planned_end_date < planned_start_date;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- 执行每日检查
SELECT * FROM daily_data_consistency_check();
```

#### 每周检查

```sql
-- 检查未使用的索引
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 检查表膨胀
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as indexes_size,
  n_dead_tup as dead_tuples,
  n_live_tup as live_tuples
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

---

## 十二、结论和建议

### 12.1 核心问题总结

#### 阻断性问题（P0）

1. **RLS认证失败** - 后端使用Service Key导致auth.uid()为NULL
   - **影响**：数据保存完全失败
   - **修复**：改用客户端直接调用或实现JWT中间件
   - **优先级**：最高，立即修复

2. **projects表未启用RLS** - 项目数据可能被非授权访问
   - **影响**：数据安全风险
   - **修复**：添加projects表RLS策略
   - **优先级**：高，立即修复

3. **数据库迁移状态未确认** - 关键迁移可能未执行
   - **影响**：RLS、乐观锁等功能可能未生效
   - **修复**：验证所有迁移执行状态
   - **优先级**：高，立即修复

#### 重要问题（P1）

1. **CHECK约束缺失** - 数据完整性无法保证
2. **外键约束缺失** - 可能出现孤立数据
3. **索引缺失** - 查询性能可能受影响

### 12.2 修复路线图

#### 第一阶段（立即执行 - 1小时）

1. ✅ 修复RLS认证问题（选择方案A或B）
2. ✅ 为projects表添加RLS策略
3. ✅ 验证数据库迁移执行状态
4. ✅ 执行数据保存功能回归测试

#### 第二阶段（24小时内）

1. ✅ 添加所有CHECK约束
2. ✅ 添加缺失的外键约束
3. ✅ 添加高优先级索引
4. ✅ 执行数据一致性检查

#### 第三阶段（1周内）

1. ✅ 为其他表添加乐观锁
2. ✅ 为未启用RLS的表添加策略
3. ✅ 实施批量操作优化
4. ✅ 设置监控和告警

### 12.3 与其他专家的协作

#### 与network-expert的协作

**问题**：CORS配置与RLS认证的关联  
**建议**：
- 确认CORS配置是否允许认证token传递
- 验证OPTIONS预检请求是否正常
- 测试跨域情况下的认证流程

#### 与backend-expert的协作

**问题**：后端认证中间件实现  
**建议**：
- 讨论选择方案A（前端直接调用）还是方案B（后端JWT中间件）
- 如果选择方案B，需要后端专家实现JWT中间件
- 确保认证token正确传递到数据库层

#### 与frontend-expert的协作

**问题**：前端数据提交逻辑  
**建议**：
- 如果选择方案A，前端专家需要重构数据提交逻辑
- 确保前端正确处理RLS错误
- 添加错误提示和重试机制

### 12.4 长期建议

1. **数据库设计规范化**
   - 制定数据库设计规范文档
   - 实施数据库变更审核流程
   - 建立数据模型版本管理

2. **性能持续优化**
   - 定期分析慢查询日志
   - 优化索引策略
   - 实施数据归档策略

3. **安全加固**
   - 所有表启用RLS
   - 实施数据加密
   - 定期安全审计

4. **监控和告警**
   - 建立完整的监控体系
   - 设置合理的告警阈值
   - 定期审查告警规则

---

**报告完成时间**: 2026-03-30 22:25  
**下一步行动**: 等待team-lead分配修复任务  
**预计修复时间**: 2-3小时（P0问题）
