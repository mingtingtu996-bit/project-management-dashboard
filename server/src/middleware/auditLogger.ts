/**
 * 操作日志中间件
 * 记录用户的关键操作到 operation_logs 表
 */

import { Request, Response, NextFunction } from 'express';
import { extractTokenFromRequest, verifyToken } from '../auth/jwt.js';
import { query } from '../database.js';

// 需要记录日志的接口模式
const LOGGED_PATTERNS: Array<{ method: string; pathRegex: RegExp; action: string }> = [
  { method: 'POST', pathRegex: /\/api\/auth\/login$/, action: '用户登录' },
  { method: 'POST', pathRegex: /\/api\/auth\/register$/, action: '用户注册' },
  { method: 'POST', pathRegex: /\/api\/auth\/logout$/, action: '用户登出' },
  { method: 'POST', pathRegex: /\/api\/auth\/change-password$/, action: '修改密码' },
  { method: 'PUT', pathRegex: /\/api\/auth\/profile$/, action: '编辑个人信息' },
  { method: 'POST', pathRegex: /\/api\/members\/[^/]+$/, action: '添加项目成员' },
  { method: 'DELETE', pathRegex: /\/api\/members\/[^/]+\/[^/]+$/, action: '移除项目成员' },
  { method: 'POST', pathRegex: /\/api\/members\/[^/]+\/transfer-owner$/, action: '转让项目负责人' },
  { method: 'POST', pathRegex: /\/api\/projects$/, action: '创建项目' },
  { method: 'PUT', pathRegex: /\/api\/projects\/[^/]+$/, action: '编辑项目' },
  { method: 'DELETE', pathRegex: /\/api\/projects\/[^/]+$/, action: '删除项目' },
  { method: 'POST', pathRegex: /\/api\/tasks$/, action: '创建任务' },
  { method: 'PUT', pathRegex: /\/api\/tasks\/[^/]+$/, action: '编辑任务' },
  { method: 'DELETE', pathRegex: /\/api\/tasks\/[^/]+$/, action: '删除任务' },
  { method: 'POST', pathRegex: /\/api\/delay-requests$/, action: '提交延期申请' },
  { method: 'POST', pathRegex: /\/api\/delay-requests\/[^/]+\/approve$/, action: '审批延期申请' },
  { method: 'POST', pathRegex: /\/api\/delay-requests\/[^/]+\/reject$/, action: '驳回延期申请' },
  { method: 'POST', pathRegex: /\/api\/delay-requests\/[^/]+\/withdraw$/, action: '撤回延期申请' },
  { method: 'POST', pathRegex: /\/api\/risks$/, action: '创建风险' },
  { method: 'PUT', pathRegex: /\/api\/risks\/[^/]+$/, action: '编辑风险' },
  { method: 'POST', pathRegex: /\/api\/milestones$/, action: '创建里程碑' },
  { method: 'PUT', pathRegex: /\/api\/milestones\/[^/]+$/, action: '编辑里程碑' },
];

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

  // 检查是否需要记录
  const matched = LOGGED_PATTERNS.find(
    p => p.method === req.method && p.pathRegex.test(requestPath)
  );

  if (!matched) {
    return next();
  }

  // 提取用户信息
  const token = extractTokenFromRequest(req);
  const payload = token ? verifyToken(token) : null;

  // 记录原始 end 方法
  const originalEnd = res.end;
  let bodyChunks: Buffer[] = [];

  // 捕获响应体（用于记录状态码）
  res.on('pipe', (src: any) => {
    src.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
  });

  // 在响应结束后记录日志
  res.on('finish', () => {
    // 异步写入，不阻塞响应
    setImmediate(async () => {
      try {
        // 脱敏请求体
        let safeBody: any = undefined;
        if (req.body && typeof req.body === 'object') {
          safeBody = { ...req.body };
          // 脱敏密码字段
          if ('password' in safeBody) safeBody.password = '***';
          if ('oldPassword' in safeBody) safeBody.oldPassword = '***';
          if ('newPassword' in safeBody) safeBody.newPassword = '***';
        }

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
            matched.action,
            req.method,
            requestPath,
            res.statusCode,
            req.ip || req.socket?.remoteAddress || null,
            req.get('user-agent') || null,
            safeBody ? JSON.stringify(safeBody) : null,
            projectId,
          ]
        );
      } catch (e) {
        // 日志写入失败不应影响主流程
        console.error('Audit log write error:', e);
      }
    });
  });

  next();
}
