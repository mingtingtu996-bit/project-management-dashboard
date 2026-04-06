# ============================================
# 后端服务 Dockerfile
# 多阶段构建：构建 → 运行
# ============================================

# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖文件（利用缓存）
COPY package.json package-lock.json* ./
RUN npm ci --only=production && \
    cp -R node_modules prod_modules && \
    npm ci

# 复制源代码
COPY tsconfig.json ./
COPY src/ ./src/

# 构建 TypeScript
RUN npx tsc --outDir dist

# 运行阶段
FROM node:20-alpine AS runtime

WORKDIR /app

# 从构建阶段复制依赖和编译产物
COPY --from=builder /app/prod_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

# 切换用户
USER appuser

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# 启动服务
CMD ["node", "dist/index.js"]
