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

- `WEB_PORT`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_HOST`
- `SUPABASE_PORT`
- `SUPABASE_DATABASE`
- `SUPABASE_USER`
- `SUPABASE_PASSWORD`
- `CORS_ORIGIN`
- `JWT_SECRET`

`VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 是前端构建参数。部署时统一使用 `--env-file deploy/env/server.production.env`，避免 `docker compose` 读取不到构建变量。

如果宿主机已经有别的 `nginx` 或面板占用了 `80` 端口，先把 `WEB_PORT` 改成 `8080` 之类的空闲端口，等服务验证通过后再决定是否切回 `80`。

```bash
grep -E '^(SUPABASE_URL|SUPABASE_ANON_KEY|VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY|CORS_ORIGIN|JWT_SECRET)=' deploy/env/server.production.env
```

## 5. 启动服务

首次部署：

```bash
mkdir -p deploy/data/logs
chmod 777 deploy/data/logs
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml up -d --build
```

查看状态：

```bash
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml ps
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml logs -f api
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml logs -f web
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
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml up -d --build
```

## 8. 先检查当前部署状态

如果服务器已经反复部署过几次，建议先留一份现状，避免我们清理后丢掉关键线索：

```bash
cd ~/project-management-dashboard
git status --short
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml ps
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml logs --tail=200 api
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml logs --tail=200 web
curl -i http://127.0.0.1/api/health
curl -I http://127.0.0.1
```

补充说明：

- `http://127.0.0.1:3001` 不通并不一定表示后端挂了，当前 compose 只把 `80` 暴露给宿主机，`3001` 只在容器网络内供 `nginx` 反向代理使用。
- 如果 `docker compose` 输出 `VITE_SUPABASE_URL` 或 `VITE_SUPABASE_ANON_KEY` 未设置，说明前端构建参数没有成功注入，需要优先修复环境变量文件。

## 9. 清理后重新部署

如果服务器上已经多次部署失败，先保留环境变量文件，再清理旧容器、旧镜像和旧构建缓存：

```bash
mkdir -p ~/deploy-backups
cp ~/project-management-dashboard/deploy/env/server.production.env ~/deploy-backups/server.production.env.$(date +%Y%m%d%H%M%S)

cd ~/project-management-dashboard
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml down --remove-orphans --rmi local
docker rm -f project-management-api project-management-web 2>/dev/null || true
docker builder prune -f
docker image prune -f

cd ~
rm -rf ~/project-management-dashboard
git clone https://github.com/mingtingtu996-bit/project-management-dashboard.git
cd ~/project-management-dashboard
latest_env_backup="$(ls -t ~/deploy-backups/server.production.env.* | head -n 1)"
cp "$latest_env_backup" deploy/env/server.production.env
mkdir -p deploy/data/logs
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml up -d --build --force-recreate
```

验证：

```bash
docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml ps
curl -i http://127.0.0.1/api/health
curl -I http://127.0.0.1
```

## 10. 运维建议

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
