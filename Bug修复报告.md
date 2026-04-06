# Bug 修复报告

## Bug 1：创建项目成功但不显示

### 状态：已修复

### 根因
双重数据源不同步：
1. `createProject()` 调用后端 API 写入 Supabase
2. `loadAll()` 从 localStorage（`projectDb.getAll()`）读取项目列表
3. 新项目没有同步写入 localStorage，导致列表中看不到

### 修复文件
`client/src/pages/CompanyCockpit.tsx`

### 修复内容
1. 创建项目成功后调用 `projectDb.create()` 将新项目同步到 localStorage
2. 将 API URL 从硬编码 `http://localhost:3001/api/projects` 改为相对路径 `/api/projects`

---

## Bug 2：任务列表和证照管理保存失败

### 状态：已定位根因，需执行数据库迁移

### 根因
**数据库表缺少列** — 后端代码引用的列在数据库中不存在。

#### 任务列表（tasks 表）
`mysqlService.createTask()` 函数（第343-400行）向 tasks 表插入数据时使用了以下列，但数据库中不存在：

| 列名 | 用途 | 来源 |
|------|------|------|
| phase_id | 阶段关联 | createTask() 第352行 |
| parent_id | 父任务关联 | createTask() 第353行 |
| task_type | 任务类型 | createTask() 第359行 |
| wbs_code | WBS编码 | createTask() 第360行 |
| wbs_level | WBS层级 | createTask() 第361行 |
| sort_order | 排序 | createTask() 第362行 |
| milestone_level | 里程碑层级 | createTask() 第364行 |
| milestone_order | 里程碑排序 | createTask() 第365行 |
| is_critical | 是否关键 | createTask() 第366行 |
| specialty_type | 专项工程分类 | createTask() 第367行 |
| reference_duration | 参考工期 | createTask() 第368行 |
| ai_duration | AI推荐工期 | createTask() 第369行 |
| first_progress_at | 首次填报时间 | createTask() 第370行 |
| delay_reason | 延期原因 | createTask() 第371行 |
| planned_start_date | 计划开始 | createTask() 第372行 |
| planned_end_date | 计划结束 | createTask() 第373行 |
| actual_start_date | 实际开始 | createTask() 第374行 |
| actual_end_date | 实际结束 | createTask() 第375行 |
| planned_duration | 计划工期 | createTask() 第376行 |
| standard_duration | 标准工期 | createTask() 第377行 |
| ai_adjusted_duration | AI修正工期 | createTask() 第378行 |
| assignee_id | 责任人ID | createTask() 第379行 |
| assignee_name | 责任人姓名 | createTask() 第380行 |
| assignee_type | 责任人类型 | createTask() 第382行 |
| estimated_hours | 预估工时 | createTask() 第383行 |
| actual_hours | 实际工时 | createTask() 第384行 |
| created_by | 创建人 | createTask() 第388行 |

#### 证照管理（pre_milestones 表）
`pre-milestones.ts` 路由的 INSERT 语句（第87-113行）引用了以下数据库中不存在的列：

| 列名 | 状态 |
|------|------|
| issuing_authority | 数据库不存在 |
| description | 数据库不存在 |
| phase_id | 数据库不存在 |
| lead_unit | 数据库不存在 |
| planned_start_date | 数据库不存在 |
| planned_end_date | 数据库不存在 |
| responsible_user_id | 数据库不存在 |
| sort_order | 数据库不存在 |

**额外问题**：`pre_milestones.created_by` 有 `NOT NULL` 约束，无登录模式下前端不传 `created_by`，导致 INSERT 违反约束。

### 修复方案
已创建迁移脚本 `server/migrations/031_fix_bug2_missing_columns.sql`。

**需要在 Supabase SQL Editor 中执行此迁移脚本。**

### 执行步骤
1. 登录 Supabase Dashboard
2. 进入 SQL Editor
3. 粘贴 `031_fix_bug2_missing_columns.sql` 的内容
4. 点击 Run 执行
5. 重启后端服务：`npm run dev`（在 server 目录下）
6. 刷新前端页面，重新测试保存功能

### 排除的误报
- ~~RLS 策略限制~~ → 后端使用 `SUPABASE_SERVICE_KEY` 绕过 RLS，不是根因
- ~~Zod 验证失败~~ → taskSchema 使用 `parse()` 会 strip 未知字段但不会因多余字段报错
- ~~API 路径错误~~ → GanttView 和 PreMilestones 都使用 `API_BASE = ''`（相对路径），正确
