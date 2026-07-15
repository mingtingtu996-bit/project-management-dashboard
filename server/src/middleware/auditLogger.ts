/**
 * 操作日志中间件
 * 记录用户的关键操作到 operation_logs 表
 */

import { Request, Response, NextFunction } from 'express';
import { extractTokenFromRequest, verifyToken } from '../auth/jwt.js';
import { query } from '../database.js';

// v1.4.14: whitelist replaced by default-all-writes + exclusion list
// ALL POST/PATCH/PUT/DELETE on /api/* are logged by default
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// Read-only paths excluded from operation logging (GET is already excluded by method filter)
const EXCLUDED_PATTERNS: RegExp[] = [
  /\/api\/jobs\/status$/,
]

function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase())
}

function isApiPath(path: string): boolean {
  return path.startsWith('/api/') && !EXCLUDED_PATTERNS.some((p) => p.test(path))
}

// Human-readable action labels for known endpoints.
const KNOWN_ACTIONS: Array<{ method: string; pathRegex: RegExp; action: string }> = [
  { method: 'POST', pathRegex: /\/api\/auth\/login$/, action: '用户登录' },
  { method: 'POST', pathRegex: /\/api\/auth\/register$/, action: '用户注册' },
  { method: 'POST', pathRegex: /\/api\/auth\/logout$/, action: '用户登出' },
  { method: 'POST', pathRegex: /\/api\/members\/[^/]+$/, action: '添加项目成员' },
  { method: 'DELETE', pathRegex: /\/api\/members\/[^/]+\/[^/]+$/, action: '移除项目成员' },
  { method: 'POST', pathRegex: /\/api\/projects$/, action: '创建项目' },
  { method: 'DELETE', pathRegex: /\/api\/projects\/[^/]+$/, action: '删除项目' },
  { method: 'POST', pathRegex: /\/api\/tasks$/, action: '创建任务' },
  { method: 'PUT', pathRegex: /\/api\/tasks\/[^/]+$/, action: '编辑任务' },
  { method: 'DELETE', pathRegex: /\/api\/tasks\/[^/]+$/, action: '删除任务' },
]

function getActionLabel(method: string, path: string): string {
  for (const known of KNOWN_ACTIONS) {
    if (known.method === method && known.pathRegex.test(path)) return known.action
  }
  return `${method} ${path.replace(/\/[0-9a-f-]{36}/g, '/:id')}`
}

function shouldBypassAuditLoggingForTests() {
  return process.env.NODE_ENV === 'test' && process.env.ENABLE_AUDIT_LOGGER_IN_TESTS !== 'true';
}

function getRequestPath(req: Request) {
  const rawPath =
    (typeof req.originalUrl === 'string' && req.originalUrl.length > 0 ? req.originalUrl : null)
    ?? (typeof req.url === 'string' && req.url.length > 0 ? req.url : null)
    ?? req.path

  const [pathname] = rawPath.split('?')
  return pathname || '/'
}

/**
 * 操作日志中间件
 */
export async function auditLogger(req: Request, res: Response, next: NextFunction) {
  if (shouldBypassAuditLoggingForTests()) {
    return next();
  }

  const requestPath = getRequestPath(req)

  // v1.4.14: default-log all write methods to /api/*
  if (!isWriteMethod(req.method) || !isApiPath(requestPath)) {
    return next()
  }

  const actionLabel = getActionLabel(req.method, requestPath)

  // 提取用户信息
  const token = extractTokenFromRequest(req);
  const payload = token ? verifyToken(token) : null;

  // 在响应结束后记录日志
  res.on('finish', () => {
    // 异步写入，不阻塞响应
    setImmediate(async () => {
      try {
        const requestSummary = req.body && typeof req.body === 'object'
          ? Array.isArray(req.body)
            ? { fields: [], itemCount: req.body.length }
            : { fields: Object.keys(req.body).sort().slice(0, 100) }
          : undefined

        // 从路径中提取项目ID
        const projectIdMatch = requestPath.match(/\/api\/(?:members|projects)\/([a-f0-9-]+)/);
        const projectId = projectIdMatch ? projectIdMatch[1] : null;

        await query(
          `INSERT INTO public.operation_logs
            (user_id, username, action, method, path, status_code, ip_address, user_agent, request_body, project_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            payload?.userId || null,
            payload?.username || null,
            actionLabel,
            req.method,
            requestPath,
            res.statusCode,
            req.ip || req.socket?.remoteAddress || null,
            req.get('user-agent') || null,
            requestSummary ? JSON.stringify(requestSummary) : null,
            projectId,
          ]
        );
      } catch (e) {
        // 日志写入失败不应影响主流程
        console.error('Audit log write error', {
          code: String((e as { code?: unknown } | null)?.code ?? 'UNKNOWN'),
          message: e instanceof Error ? e.message : 'audit log write failed',
        });
      }
    });
  });

  next();
}
