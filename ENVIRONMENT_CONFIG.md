# 环境配置说明

## 现在怎么切环境

这个项目已经改成“脚本切换，不再手改多份文件”的模式。

常用命令：

```bash
npm run env:local
npm run env:prod -- --origin=https://app.example.com --api=/api
npm run env:status
```

其中：
- `env:local`：切回本地联调模式
- `env:prod`：切到上线模式；`--origin` 必填，用来写入后端 `CORS_ORIGIN`
- `env:status`：查看当前激活的关键环境值

## 脚本会改哪些文件

```text
project/
├── client/
│   ├── .env
│   ├── .env.local
│   └── .env.example
├── server/
│   ├── .env
│   └── .env.example
└── scripts/
    └── switch-env.mjs
```

脚本只会改“非敏感字段”，包括：
- 前端：`VITE_STORAGE_MODE`、`VITE_API_BASE_URL`、`VITE_APP_ENV`、`VITE_DEBUG_MODE`
- 后端：`NODE_ENV`、`CORS_ORIGIN`

脚本不会碰这些敏感值：
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_ANON_KEY`
- `DB_PASSWORD`
- `JWT_SECRET`

## 推荐链路

推荐开发和上线都统一走 `backend` 模式：

```text
浏览器 -> 前端 -> /api 或正式 API 域名 -> 后端 -> Supabase
```

这样做的好处是：
- 浏览器不再直连 Supabase，跨域问题更少
- 本地/线上链路更一致
- 排查问题时不会出现“页面一部分走后端，一部分直连云端”的分叉

## 两套环境的目标值

### 本地联调模式

前端：

```env
VITE_STORAGE_MODE=backend
VITE_API_BASE_URL=/api
VITE_APP_ENV=development
VITE_DEBUG_MODE=true
```

后端：

```env
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

### 上线模式

前端：

```env
VITE_STORAGE_MODE=backend
VITE_API_BASE_URL=/api
VITE_APP_ENV=production
VITE_DEBUG_MODE=false
```

如果线上不是同域反代，可把 `--api` 改成完整地址，例如：

```bash
npm run env:prod -- --origin=https://app.example.com --api=https://api.example.com/api
```

后端：

```env
NODE_ENV=production
CORS_ORIGIN=https://app.example.com
```

## 首次初始化建议

1. 先按 `.env.example` 补齐 `client/.env.local` 与 `server/.env` 的敏感配置。
2. 本地开发前执行一次：

```bash
npm run env:local
```

3. 上线或预发前执行一次：

```bash
npm run env:prod -- --origin=https://你的前端域名 --api=/api
```

4. 切完后用下面命令自检：

```bash
npm run env:status
```

## 健康度历史相关补充

这次还顺手补了健康度历史表的执行链路，相关命令如下：

```bash
npm run migrate:health-history
npm run health:snapshot
```

含义：
- `migrate:health-history`：把 `project_health_history` 表真正建到数据库里
- `health:snapshot`：迁移后立即补录当月健康度快照，避免公司驾驶舱“较上月变化”接口继续为空或报表缺失

## 建议的日常使用顺序

本地开发时：先 `npm run env:local`，再 `npm run dev`。

准备上线时：先 `npm run env:prod -- --origin=... --api=...`，再做构建、预发验证和正式部署。

这样以后切环境就是命令级操作，不用再来回翻 `.env` 手改。