# 环境配置说明

## 配置文件结构

```
project/
├── client/
│   ├── .env              # 当前使用的配置
│   ├── .env.local        # 本地开发覆盖配置（不提交git）
│   └── .env.example      # 配置示例
└── server/
    ├── .env              # 服务器配置（不提交git）
    └── .env.example      # 配置示例
```

## 存储模式

### 模式1：本地存储（当前使用）
```
VITE_STORAGE_MODE=local
```
- 数据存储在浏览器 LocalStorage
- 无需网络连接
- 适合个人使用

### 模式2：Supabase远程同步
```
VITE_STORAGE_MODE=supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
```
- 数据存储在 Supabase 云端
- 支持多设备同步
- 需要翻墙

## 环境变量优先级

Vite 环境变量加载优先级（从高到低）：
1. `.env.local` - 本地覆盖
2. `.env.production` - 生产环境
3. `.env.development` - 开发环境
4. `.env` - 基础配置
5. `.env.example` - 示例（不自动加载）

## 开发流程

### 1. 首次 setup
```bash
# 客户端
cp client/.env.example client/.env.local

# 服务器端
cp server/.env.example server/.env
```

### 2. 修改配置
根据需要修改 `.env.local` 或 `.env` 中的值

### 3. 不提交到 Git
确保以下文件在 `.gitignore` 中：
```
client/.env
client/.env.local
server/.env
```

## 常用配置项

| 变量 | 说明 | 示例 |
|------|------|------|
| `VITE_STORAGE_MODE` | 存储模式 | `local` / `supabase` |
| `VITE_SUPABASE_URL` | Supabase项目URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase匿名密钥 | `eyJhbGci...` |
| `VITE_DEBUG_MODE` | 调试模式 | `true` / `false` |
| `PORT` | 服务器端口 | `3001` |
| `NODE_ENV` | 运行环境 | `development` / `production` |
