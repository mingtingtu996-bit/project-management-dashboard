# 工程化发布 Runbook

本文档对应当前正式发布链，覆盖 `CI/CD`、`Migration`、`Node 版本统一`、`自有服务器部署`、`Secrets` 和发布操作清单。

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
   - 先调用 `npm run migrate:pending` 执行普通迁移；migration 322 始终由专用备份、授权和 readback 链处理

5. `deploy-server`
   - 当前唯一正式部署链
   - 通过 SSH 登录自有服务器
   - 在服务器仓库目录执行 `scripts/deploy-lighthouse-server.sh`
   - 使用 `deploy/docker-compose.lighthouse.yml` 重新构建并启动前后端容器

## 4. 数据迁移机制

核心文件：

- [`migrationRunner.ts`](../server/src/services/migrationRunner.ts)
- [`run-pending-migrations.ts`](../server/src/scripts/run-pending-migrations.ts)

### 设计说明

- 自动扫描 migration 目录
- 基于版本和 checksum 判断脚本是否已执行
- 支持 `plan` 和 `apply` 两种模式
- 避免继续维护“手写固定 SQL 列表”的方式

### 阻塞式索引变更约定

历史 migration 中仍存在 non-concurrent `CREATE INDEX`。已登记 migration 的字节和 checksum 不得为改写历史而变化，因此 staging / production 只允许在受控低流量窗口执行迁移，并在 workflow dispatch 中显式确认 `MIGRATION_MAINTENANCE_WINDOW_CONFIRMED=true`。执行前需检查活跃流量、长事务与锁等待；任一项不满足即停止发布。新增大表索引应使用独立在线迁移方案，不能继续追加普通阻塞式索引。

### 常用命令

```bash
cd server

# 只看计划
npm run migrate:plan

# 执行待迁移脚本
npm run migrate:pending
```

### Migration 322 专用退役链

`322_duration_learning_legacy_runtime_retirement.sql` 会删除旧工期学习 runtime 表，普通 `migrate:pending` 只会把它列为 deferred，不会执行。工作流检测到该 migration pending 时，必须在任何 migration write 前满足以下条件：

1. workflow dispatch 输入 `duration_learning_legacy_runtime_retirement_confirmation` 精确填写 `RETIRE_DURATION_LEARNING_LEGACY_RUNTIME_322`。
2. 普通 `migrate:pending` 先完成 migration 315 及其他安全迁移，使归档和 mapping readback 达到可备份状态。
3. `backup:duration-learning-legacy-runtime-retirement` 生成绑定目标环境、Supabase project ref、源数据 fingerprint 和 manifest fingerprint 的 JSON 与 SHA-256 文件。
4. 备份文件成功上传为受保护的 GitHub Actions artifact 后，工作流才调用 `migrate:duration-learning-legacy-runtime-retirement`。
5. 专用命令必须输出 `DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_READBACK_COMPLETE`，随后通用 pending-zero、schema-drift 与 migration governance gate 仍需全部通过。

未填写确认、备份或 checksum 缺失、目标身份不匹配、归档状态漂移、artifact 上传失败或 readback 不完整时都必须终止发布。不得改用普通 `migrate:pending -- --only=322` 绕过专用链。

## 5. Secrets 清单

### 前端构建

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### 数据迁移

- `SUPABASE_MIGRATION_URL`

建议将它配置为 Supabase 提供的 pooler/session 连接串。当前直连 `db.<project>.supabase.co` 在 GitHub Hosted Runner 上通常只有 IPv6，CI 迁移不稳定。

如果未配置 `SUPABASE_MIGRATION_URL`，工作流默认阻断发布。只有手动 dispatch 同时提供完整 break-glass 原因、外部证据引用、pending-zero 与 blocking-drift-zero 确认时，才允许跳过 CI 直连迁移；该路径也不能以普通 pending 证据替代 migration 322 的专用备份和授权记录。

官方年度工作日历导入也依赖可写库连接。生产环境应配置 `DB_CONNECTION_STRING` 或复用 `SUPABASE_MIGRATION_URL`，并执行：

```bash
cd server
npm run calendar:refresh-official -- --year=2026
```

该命令会抓取 gov.cn 官方节假日通知、解析年度日历，并用 PostgreSQL 事务发布新的 `work_calendar` seed 版本。

### 自有服务器部署

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_KNOWN_HOSTS`
- `DEPLOY_HEALTH_URL`，必须为可从部署环境访问的外部 `https://` 健康检查地址

可选：

- `DEPLOY_PORT`，默认 `22`

部署会同时校验外部 HTTPS、HSTS、HTTP 到 HTTPS 重定向，以及通过 SSH 隧道访问的内部 `/api/readyz`；内部只读检查不能替代外部 TLS 门禁。

`DEPLOY_PATH` 建议使用服务器上的绝对路径，例如 `/home/deploy/project-management-dashboard`。服务器目录内必须已经存在仓库和 `deploy/env/server.production.env`。

### 通知

- `SLACK_WEBHOOK`

建议在 GitHub 仓库的 `Actions secrets and variables` 中统一维护，并按环境最小授权。

## 6. 自有服务器部署说明

正式部署不再走 CloudBase Hosting / CloudRun。前后端统一由自有服务器上的 Docker Compose 编排。

核心文件：

- [`deploy/docker-compose.lighthouse.yml`](../deploy/docker-compose.lighthouse.yml)
- [`deploy/nginx/lighthouse.conf`](../deploy/nginx/lighthouse.conf)
- [`deploy/env/server.production.example`](../deploy/env/server.production.example)
- [`scripts/deploy-lighthouse-server.sh`](../scripts/deploy-lighthouse-server.sh)
- [`server/Dockerfile`](../server/Dockerfile)
- [`client/Dockerfile`](../client/Dockerfile)

### 运行方式

- Web 容器：构建 `client/Dockerfile`，由 nginx 提供静态站点，并代理 `/api`、`/ws`
- API 容器：构建 `server/Dockerfile`，运行 Express 服务
- 数据库：继续使用 `Supabase`

### 服务默认约定

- API 容器名：`project-management-api`
- Web 容器名：`project-management-web`
- API 端口：`3001`
- Web 端口：由 `WEB_PORT` 控制，默认 `80`

### 服务器前提

- 已安装 `Docker` 与 `docker compose`
- 服务器仓库目录能从 GitHub 拉取代码
- `deploy/env/server.production.env` 已配置并保留在服务器上
- 部署用户具备运行 `docker compose` 的权限

### 运行时环境变量

服务器上的 `deploy/env/server.production.env` 至少包括：

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

### 手动发布

```bash
git pull
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml up -d --build
```

完整服务器初始化与故障处理见 [`docs/lighthouse-server-runbook.md`](./lighthouse-server-runbook.md)。

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
5. 检查 `Deploy To Self-hosted Server` 部署日志
6. 完成线上健康检查

## 9. 发布后检查

### API 健康检查

```bash
curl http://127.0.0.1/api/health
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

### 5. 为什么不再走 Vercel / CloudBase

当前正式发布链已统一为自有服务器 Docker Compose。Vercel 和 CloudBase 不再作为正式部署目标，这样可以避免维护多平台 secrets、双套工作流和错误的部署认知。

## 11. 相关文件索引

- [`README.md`](../README.md)
- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
- [`client/Dockerfile`](../client/Dockerfile)
- [`server/Dockerfile`](../server/Dockerfile)
- [`deploy/docker-compose.lighthouse.yml`](../deploy/docker-compose.lighthouse.yml)
- [`scripts/deploy-lighthouse-server.sh`](../scripts/deploy-lighthouse-server.sh)
- [`server/src/services/migrationRunner.ts`](../server/src/services/migrationRunner.ts)
- [`server/src/scripts/run-pending-migrations.ts`](../server/src/scripts/run-pending-migrations.ts)
