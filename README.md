# 项目管理系统

面向工程项目场景的协同管理系统，覆盖公司驾驶舱、甘特计划、风险问题、验收流程轴、前期证照、报表分析等核心模块。

## 技术栈

- 前端：React 18、TypeScript、Vite 5、Tailwind CSS、Zustand、Chart.js、D3
- 后端：Express、TypeScript、PostgreSQL/Supabase、Zod
- 测试：Vitest
- 工程化：GitHub Actions、CloudBase、Docker

## 仓库结构

```text
client/   前端应用，使用 pnpm
server/   后端 API，使用 npm
.github/  GitHub Actions 工作流
docs/     运行、发布与工程化文档
```

## 环境要求

- Node.js 20
- pnpm 9+
- npm 10+

## 本地开发

### 1. 安装根目录依赖

```bash
npm install
```

### 2. 安装前后端依赖

```bash
cd client
pnpm install --frozen-lockfile

cd ../server
npm ci --workspaces=false
```

### 3. 配置环境变量

- 前端：`client/.env`
- 后端：`server/.env`

常见变量：

```env
# client/.env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=http://localhost:3001
VITE_STORAGE_MODE=api

# server/.env
PORT=3001
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_MIGRATION_URL=
SUPABASE_HOST=
SUPABASE_PORT=
SUPABASE_DATABASE=
SUPABASE_USER=
SUPABASE_PASSWORD=
JWT_SECRET=
```

### 4. 启动开发环境

```bash
npm run dev
```

- 前端默认地址：`http://localhost:5173`
- 后端默认地址：`http://localhost:3001`

## 质量门禁

### 前端

```bash
cd client
pnpm run lint
pnpm run typecheck
pnpm run test:run
pnpm run build
```

### 后端

```bash
cd server
npm run typecheck
npm test
npm run build
```

### 数据迁移

```bash
cd server
npm run migrate:plan
npm run migrate:pending
```

CI 中的自动迁移优先使用 `SUPABASE_MIGRATION_URL`。它应当配置为 Supabase 提供的可公网访问 pooler/session 连接串；当前直连 `db.<project>.supabase.co` 在 GitHub Hosted Runner 上通常只有 IPv6，不适合作为 CI 迁移入口。

## 发布与工程化说明

- 发布 Runbook：[`docs/release-runbook.md`](docs/release-runbook.md)
- GitHub Actions 工作流：[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
- 当前正式发布链：`CloudBase Hosting + CloudRun`
- `Vercel` 不再作为正式部署目标，不需要维护 `VERCEL_*` secrets

## 当前工程化约定

- Node.js 统一为 `20`
- 前端统一使用 `pnpm`
- 后端统一使用 `npm`
- CI 顺序：`lint/typecheck/test/build`
- 数据迁移通过 `server/src/services/migrationRunner.ts` 自动发现并执行未应用脚本

## 常用命令

```bash
# 根目录并行启动前后端
npm run dev

# 单独构建
npm run build:client
npm run build:server

# 健康检查诊断
npm run diag:health
npm run diag:summary
npm run diag:warning
```
