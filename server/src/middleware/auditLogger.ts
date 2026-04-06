/**
 * 操作日志中间件
 * 记录用户的关键操作到 operation_logs 表
 */

import { Request, Response, NextFunction } from 'express';
import { extractTokenFromRequest, verifyToken } from '../auth/jwt';
import { query } from '../database';

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
  { method: 'POST', pathRegex: /\/api\/risks$/, action: '创建风险' },
  { method: 'PUT', pathRegex: /\/api\/risks\/[^/]+$/, action: '编辑风险' },
  { method: 'POST', pathRegex: /\/api\/milestones$/, action: '创建里程碑' },
  { method: 'PUT', pathRegex: /\/api\/milestones\/[^/]+$/, action: '编辑里程碑' },
];

/**
 * 确保操作日志表存在
 */
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.operation_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      action TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      request_body JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // 创建索引
  await query(`CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON public.operation_logs(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_operation_logs_action ON public.operation_logs(action);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON public.operation_logs(created_at);`);
}

// 初始化表（只执行一次）
let tableEnsured = false;
async function ensureTableOnce() {
  if (!tableEnsured) {
    try {
      await ensureTable();
      tableEnsured = true;
    } catch (e) {
      console.error('Failed to ensure operation_logs table:', e);
    }
  }
}

/**
 * 操作日志中间件
 */
export async function auditLogger(req: Request, res: Response, next: NextFunction) {
  // 异步确保表存在
  ensureTableOnce();

  // 检查是否需要记录
  const matched = LOGGED_PATTERNS.find(
    p => p.method === req.method && p.pathRegex.test(req.path)
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
        const projectIdMatch = req.path.match(/\/api\/(?:members|projects)\/([a-f0-9-]+)/);
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
            req.path,
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
