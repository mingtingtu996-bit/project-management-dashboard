# 工程化发布 Runbook

本文档对应当前正式发布链，覆盖 `CI/CD`、`Migration`、`Node 版本统一`、`CloudBase 部署`、`Secrets` 和发布操作清单。

## 1. 基线约定

- Node.js：`20`
- 前端包管理器：`pnpm`
- 后端包管理器：`npm`
- 前端锁文件：`client/pnpm-lock.yaml`
- 后端锁文件：`server/package-lock.json`
- 统一工作流文件：`.github/workflows/deploy.yml`

## 2. 发布前本地验证

### 前端门禁

```bash
cd client
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run test:run
pnpm run build
```

### 后端门禁

```bash
cd server
npm ci --workspaces=false
npm run typecheck
npm test
npm run build
```

### 迁移验证

```bash
cd server
npm run migrate:plan
```

`migrate:plan` 只输出待执行 migration，不会真正写库；适合作为发布前检查。

## 3. GitHub Actions 工作流说明

工作流：[`deploy.yml`](../.github/workflows/deploy.yml)

### 触发方式

- `push` 到 `main/master`
- 手动触发 `workflow_dispatch`

### 主要 Job

1. `client-quality`
   - 安装前端依赖
   - 执行 `lint`
   - 执行 `typecheck`
   - 执行 `vitest`

2. `server-quality`
   - 安装后端依赖
   - 执行 `typecheck`
   - 执行 `vitest`
   - 执行 `build`

3. `build-frontend`
   - 在前后端质量门禁通过后构建前端产物
   - 上传 `client/dist` 到 artifact

4. `database-migration`
   - 生产 / staging 级部署前自动执行未应用 migration
   - 调用 `npm run migrate:pending`

5. `deploy-cloudbase`
   - 当前唯一正式部署链
   - 部署前端静态资源到 CloudBase Hosting
   - 通过 `CloudRun + server/Dockerfile` 部署后端服务

## 4. 数据迁移机制

核心文件：

- [`migrationRunner.ts`](../server/src/services/migrationRunner.ts)
- [`run-pending-migrations.ts`](../server/src/scripts/run-pending-migrations.ts)

### 设计说明

- 自动扫描 migration 目录
- 基于版本和 checksum 判断脚本是否已执行
- 支持 `plan` 和 `apply` 两种模式
- 避免继续维护“手写固定 SQL 列表”的方式

### 常用命令

```bash
cd server

# 只看计划
npm run migrate:plan

# 执行待迁移脚本
npm run migrate:pending
```

## 5. Secrets 清单

### 前端构建 / CloudBase Hosting

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### 数据迁移

- `SUPABASE_MIGRATION_URL`

建议将它配置为 Supabase 提供的 pooler/session 连接串。当前直连 `db.<project>.supabase.co` 在 GitHub Hosted Runner 上通常只有 IPv6，CI 迁移不稳定。

如果未配置 `SUPABASE_MIGRATION_URL`，当前工作流会明确记录“migration skipped”并继续部署；此时请确保发布前已经在可连通环境中执行过 `npm run migrate:plan` / `npm run migrate:pending`。

### CloudBase 部署

- `CLOUDBASE_SECRET_ID` 或 `TENCENT_SECRET_ID`
- `CLOUDBASE_SECRET_KEY` 或 `TENCENT_SECRET_KEY`
- `CLOUDBASE_ENV_ID`

这组密钥除了能访问环境本身，还必须具备 CloudRun 相关权限；否则前端能发，后端会在 CloudRun 预检阶段失败。

### 通知

- `SLACK_WEBHOOK`

建议在 GitHub 仓库的 `Actions secrets and variables` 中统一维护，并按环境最小授权。

## 6. CloudBase 后端部署说明

后端当前不再走旧的 `server/functions/api` 云函数目录，而是走 `CloudBase CloudRun`。

核心文件：

- [`server/Dockerfile`](../server/Dockerfile)
- [`scripts/deploy-cloudbase-backend.mjs`](../scripts/deploy-cloudbase-backend.mjs)

### 运行方式

- CloudBase Hosting：托管 `client/dist`
- CloudBase CloudRun：从 `server/` 源码目录构建并部署后端镜像
- 数据库：继续使用 `Supabase`

### CloudRun 服务默认约定

- 服务名：`project-management-api`
- 端口：`3001`

### CloudRun 权限前提

CloudBase 部署后端前，当前使用的腾讯云访问密钥必须至少能完成：

- 查询 CloudRun 服务
- 创建或更新 CloudRun 服务
- 读取 CloudRun 部署结果

如果缺失这类权限，部署脚本会在预检阶段直接失败，并提示当前缺少的 CloudRun 能力。

### CloudRun 运行时环境变量

CloudRun 服务需要预先在 CloudBase 控制台配置运行时环境变量，至少包括：

- `PORT=3001`
- `NODE_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_ANON_KEY`
- `CORS_ORIGIN`
- `JWT_SECRET`
- `SUPABASE_HOST`
- `SUPABASE_PORT`
- `SUPABASE_DATABASE`
- `SUPABASE_USER`
- `SUPABASE_PASSWORD`

可参考 [`server/.env.example`](../server/.env.example) 维护同一套口径。

### 本地手动发布后端

```bash
node scripts/deploy-cloudbase-backend.mjs
```

该脚本只更新 CloudRun 服务镜像，不会替你写入运行时 secrets。

## 7. Docker 构建说明

### 前端镜像

文件：[`client/Dockerfile`](../client/Dockerfile)

特征：

- `node:20-alpine`
- `pnpm install --frozen-lockfile --ignore-scripts`
- 构建产物交由 `nginx:alpine` 托管

本地构建示例：

```bash
docker build \
  -f client/Dockerfile \
  -t workbuddy-client:latest \
  --build-arg VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
  --build-arg VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
  --build-arg VITE_API_BASE_URL=$VITE_API_BASE_URL \
  ./client
```

### 后端镜像

文件：[`server/Dockerfile`](../server/Dockerfile)

特征：

- `node:20-alpine`
- 多阶段构建
- `npm ci` 安装依赖
- 运行时只保留生产依赖和编译产物

本地构建示例：

```bash
docker build -f server/Dockerfile -t workbuddy-server:latest ./server
```

## 8. 标准发布流程

1. 在本地执行完整门禁
2. 执行 `npm run migrate:plan`，确认 migration 列表符合预期
3. 推送到 `main/master`，等待 GitHub Actions 通过
4. 检查 `database-migration` 是否成功
5. 检查 CloudBase Hosting / CloudRun 部署日志
6. 完成线上健康检查

## 9. 发布后检查

### API 健康检查

```bash
curl http://localhost:3001/api/health
```

### 前端静态资源检查

- 访问首页
- 打开核心页面：
  - 公司驾驶舱
  - 甘特图
  - 风险管理
  - 报表

### 数据链路检查

- 项目摘要接口
- 风险统计接口
- 关键路径 / 任务摘要接口
- 迁移记录表是否新增本次执行记录

## 10. 常见问题

### 1. `pnpm install --frozen-lockfile` 失败

通常说明 `client/package.json` 与 `client/pnpm-lock.yaml` 不一致。先在 `client/` 下执行：

```bash
pnpm install --no-frozen-lockfile
```

确认锁文件更新后再重新跑门禁。

### 2. `npm ci --prefix server` 行为不稳定

当前标准做法不是 `--prefix`，而是：

```bash
cd server
npm ci --workspaces=false
```

CI 中也已经采用同样策略。

### 3. 迁移没有执行

先跑：

```bash
cd server
npm run migrate:plan
```

如果 `plan` 无输出，说明 runner 认为当前 migration 已经全部落库；需要进一步检查 migration 目录、版本号或 checksum 是否被人为改写。

### 4. Docker 本地无法验证

如果开发机没有 Docker，可以先用 `build + typecheck + test + migrate:plan` 作为静态放行基线；镜像层验证交给 CI 或具备 Docker 的环境补跑。

### 5. 为什么不再走 Vercel

当前正式发布链已统一为 CloudBase，Vercel 不再作为正式部署目标。这样可以避免维护双平台 secrets、双套工作流和错误的部署认知。

## 11. 相关文件索引

- [`README.md`](../README.md)
- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
- [`client/Dockerfile`](../client/Dockerfile)
- [`server/Dockerfile`](../server/Dockerfile)
- [`server/src/services/migrationRunner.ts`](../server/src/services/migrationRunner.ts)
- [`server/src/scripts/run-pending-migrations.ts`](../server/src/scripts/run-pending-migrations.ts)
