# 轻量应用服务器部署 Runbook

本文档用于把当前项目以“前后端同机”的方式部署到腾讯云轻量应用服务器。

## 1. 部署结构

- 前端：`client` 通过 Docker 构建后由 `nginx` 容器提供静态站点
- 后端：`server` 通过 Docker 构建后以 `Node/Express` 容器运行
- 数据库：继续使用 `Supabase`
- 反向代理：`nginx` 容器统一代理 `/api` 和 `/ws`

核心文件：

- [`deploy/docker-compose.lighthouse.yml`](../deploy/docker-compose.lighthouse.yml)
- [`deploy/nginx/lighthouse.conf`](../deploy/nginx/lighthouse.conf)
- [`deploy/env/server.production.example`](../deploy/env/server.production.example)

## 2. 服务器初始化

推荐镜像：`Ubuntu 22.04 LTS`

### 安装 Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
sudo usermod -aG docker $USER
```

重新登录 SSH 后执行：

```bash
docker version
docker compose version
```

## 3. 拉取项目

```bash
git clone https://github.com/mingtingtu996-bit/project-management-dashboard.git
cd project-management-dashboard
```

## 4. 准备环境变量

```bash
cp deploy/env/server.production.example deploy/env/server.production.env
```

至少修改：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_HOST`
- `SUPABASE_PORT`
- `SUPABASE_DATABASE`
- `SUPABASE_USER`
- `SUPABASE_PASSWORD`
- `CORS_ORIGIN`
- `JWT_SECRET`

前端构建时还需要把 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 暴露给 `docker compose`。推荐在运行命令前导出：

```bash
export VITE_SUPABASE_URL="https://your-project.supabase.co"
export VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY_HERE"
```

## 5. 启动服务

首次部署：

```bash
mkdir -p deploy/data/logs
docker compose -f deploy/docker-compose.lighthouse.yml up -d --build
```

查看状态：

```bash
docker compose -f deploy/docker-compose.lighthouse.yml ps
docker compose -f deploy/docker-compose.lighthouse.yml logs -f api
docker compose -f deploy/docker-compose.lighthouse.yml logs -f web
```

## 6. 验证

```bash
curl http://127.0.0.1/api/health
```

浏览器访问：

```text
http://服务器公网IP
```

## 7. 更新发布

```bash
git pull
docker compose -f deploy/docker-compose.lighthouse.yml up -d --build
```

## 8. 运维建议

- 日志目录位于 `deploy/data/logs`
- Docker 镜像定期清理：

```bash
docker image prune -f
```

- 关注内存：

```bash
docker stats
free -h
```
