# 生产环境部署指南

> 房地产工程管理系统 V4.1 部署手册
> 最后更新：2026-03-30

---

## 1. 环境变量配置

### 1.1 后端环境变量 (`server/.env`)

```bash
# 必填项（生产环境必须修改）

PORT=3001
NODE_ENV=production

# Supabase - 使用生产环境凭据
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-production-service-key
SUPABASE_ANON_KEY=your-production-anon-key

# CORS - 改为实际前端域名
CORS_ORIGIN=https://your-domain.com,https://admin.your-domain.com

# JWT - 使用强随机密钥（已生成）
JWT_SECRET=<部署时填入生成的密钥>

LOG_LEVEL=warn
```

### 1.2 前端环境变量 (`client/.env.local`)

```bash
VITE_STORAGE_MODE=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-anon-key
VITE_APP_ENV=production
VITE_ENABLE_ANALYTICS=false
VITE_DEBUG_MODE=false
VITE_ENABLE_REALTIME=true
```

### 1.3 生成 JWT 密钥

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 2. 腾讯云 CloudBase 部署

### 2.1 运行时配置

已更新为 `Nodejs18.13`（`cloudbaserc.json`）：

```json
{
  "runtime": "Nodejs18.13",
  "memorySize": 512,
  "timeout": 30
}
```

### 2.2 部署步骤

```bash
# 1. 安装 CloudBase CLI
npm install -g @cloudbase/cli

# 2. 登录
tcb login

# 3. 部署云函数
cd server/functions/api
tcb fn deploy api

# 4. 部署静态网站（前端）
cd client
npm run build
# 上传 dist/ 到 CloudBase 静态托管
```

---

## 3. 数据库迁移

迁移文件位于 `server/migrations/`，编号 001-035。

生产环境执行迁移：

```bash
# 使用 Supabase Dashboard SQL Editor 执行
# 按编号顺序执行所有迁移文件
```

---

## 4. 安全清单

| 项目 | 状态 |
|------|------|
| API 认证中间件 | ✅ 6个核心路由已添加 authenticate |
| JWT 强密钥 | ✅ 32字节 Base64 |
| 环境变量隔离 | ✅ .gitignore 已排除 .env |
| CORS 白名单 | ✅ 从环境变量读取 |
| XSS 防护 | ✅ xssProtection 中间件 |
| SQL 注入防护 | ✅ 参数化查询 |
| 速率限制 | ✅ 15分钟/1000次 |
| Helmet 安全头 | ✅ 已启用 |
| RLS 策略 | ✅ 17个表已配置 |

---

## 5. 上线前验证

```bash
# 1. TypeScript 编译检查
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit

# 2. 构建检查
cd client && npm run build

# 3. API 健康检查
curl https://your-domain.com/api/health

# 4. 认证检查（应返回 401）
curl https://your-domain.com/api/projects
```
