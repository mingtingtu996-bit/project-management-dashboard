# 部署指南 - 多人协作版本

## 概述

本文档说明如何将项目管理系统部署到云端，实现多人协作。

## 架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   用户浏览器   │ ──> │   Vercel    │ ──> │  Supabase   │
│  (前端应用)   │     │  (前端+API)  │     │  (数据库)    │
└─────────────┘     └─────────────┘     └─────────────┘
```

## 部署步骤

### 步骤 1: 创建 Supabase 项目

1. 访问 [supabase.com](https://supabase.com) 注册/登录
2. 点击 "New Project"
3. 填写项目信息:
   - Name: `project-management`
   - Database Password: 设置密码（记住它）
   - Region: 选择亚洲区域（如 Tokyo）
4. 等待项目创建完成

### 步骤 2: 获取 Supabase 凭证

1. 进入 Project Settings → API
2. 复制以下信息:
   - `Project URL` - 类似 `https://xxxxx.supabase.co`
   - `anon public` key - 类似 `eyJhbGciOiJIUzI1NiIs...`

### 步骤 3: 配置数据库表

在 Supabase SQL Editor 中执行以下 SQL:

```sql
-- 创建项目表
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER DEFAULT 1
);

-- 创建任务表
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  progress INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  assignee_name TEXT,
  responsible_unit TEXT,
  dependencies TEXT[],
  is_critical BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER DEFAULT 1
);

-- 创建风险表
CREATE TABLE risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  level TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'identified',
  probability INTEGER DEFAULT 50,
  impact INTEGER DEFAULT 50,
  mitigation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER DEFAULT 1
);

-- 创建里程碑表
CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER DEFAULT 1
);

-- 启用 RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

-- 创建公开读取策略（生产环境应改为认证后读取）
CREATE POLICY "Allow public read projects" ON projects FOR SELECT USING (true);
CREATE POLICY "Allow public read tasks" ON tasks FOR SELECT USING (true);
CREATE POLICY "Allow public read risks" ON risks FOR SELECT USING (true);
CREATE POLICY "Allow public read milestones" ON milestones FOR SELECT USING (true);

-- 创建写入策略
CREATE POLICY "Allow public insert projects" ON projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update projects" ON projects FOR UPDATE USING (true);
CREATE POLICY "Allow public delete projects" ON projects FOR DELETE USING (true);

CREATE POLICY "Allow public insert tasks" ON tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update tasks" ON tasks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete tasks" ON tasks FOR DELETE USING (true);

CREATE POLICY "Allow public insert risks" ON risks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update risks" ON risks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete risks" ON risks FOR DELETE USING (true);

CREATE POLICY "Allow public insert milestones" ON milestones FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update milestones" ON milestones FOR UPDATE USING (true);
CREATE POLICY "Allow public delete milestones" ON milestones FOR DELETE USING (true);
```

### 步骤 4: 部署前端 (Vercel)

1. 安装 Vercel CLI:
```bash
npm i -g vercel
```

2. 登录 Vercel:
```bash
vercel login
```

3. 部署:
```bash
cd client
vercel --prod
```

4. 按提示配置:
   - Which scope? 选择你的 Vercel 账号
   - Want to override settings? No
   - 等待部署完成

5. 获取部署的 URL

### 步骤 5: 配置环境变量

在 Vercel Dashboard 中:
1. 进入项目 → Settings → Environment Variables
2. 添加以下变量:
   - `VITE_STORAGE_MODE` = `supabase`
   - `VITE_SUPABASE_URL` = 你的 Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = 你的 anon key

3. 重新部署使环境变量生效

## 部署完成

部署完成后，用户可以通过以下方式访问:

1. 打开 Vercel 分配的 URL（或自定义域名）
2. 选择 "Supabase" 存储模式
3. 数据会自动同步到云端

## 多人协作

当前部署支持:
- 多用户同时访问同一数据
- 数据实时同步
- 离线操作队列（网络恢复后自动同步）

## 费用

| 服务 | 免费额度 |
|------|----------|
| Supabase | 500MB 数据库，实时 200MAU |
| Vercel | 100GB 流量，100GB 带宽 |

基本可以满足小团队免费使用。

## 故障排除

### 数据不同步
- 检查浏览器控制台网络请求
- 确认 Supabase 凭证正确
- 检查 Supabase 项目状态

### 部署失败
- 确认 Node.js 版本 (18+)
- 查看 Vercel 部署日志
- 检查环境变量配置
