# ============================================
# 前端构建 Dockerfile
# 多阶段构建：构建 → Nginx 托管
# ============================================

# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖文件（利用缓存）
COPY package.json package-lock.json* ./
RUN npm ci

# 复制源代码
COPY vite.config.ts index.html tsconfig*.json ./
COPY public/ ./public/
COPY src/ ./src/

# 构建参数
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_STORAGE_MODE=api
ARG VITE_API_BASE_URL

# 设置构建时环境变量
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_STORAGE_MODE=$VITE_STORAGE_MODE
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# 构建
RUN npm run build

# 托管阶段 - Nginx
FROM nginx:alpine AS runtime

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
