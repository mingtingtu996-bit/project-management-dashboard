/**
 * 认证中间件
 */

import { NextResponse } from 'next/server';
import { verifyToken, extractTokenFromRequest } from './jwt';
import { AuthRequest, JWTPayload } from './types';

/**
 * 检查请求是否已认证的中间件
 */
export function requireAuth(handler: (req: AuthRequest, ...args: any[]) => Promise<Response>) {
  return async (req: AuthRequest, ...args: any[]): Promise<Response> => {
    const token = extractTokenFromRequest(req);

    if (!token) {
      return NextResponse.json(
        { success: false, message: '未登录，请先登录' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { success: false, message: '登录已过期，请重新登录' },
        { status: 401 }
      );
    }

    // 将用户信息附加到请求对象
    req.user = payload;

    // 调用原始handler
    return handler(req, ...args);
  };
}

/**
 * 可选认证中间件（允许匿名访问）
 */
export function optionalAuth(handler: (req: AuthRequest, ...args: any[]) => Promise<Response>) {
  return async (req: AuthRequest, ...args: any[]): Promise<Response> => {
    const token = extractTokenFromRequest(req);

    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        req.user = payload;
      }
    }

    return handler(req, ...args);
  };
}

/**
 * 检查是否是项目所有者
 */
export function requireProjectOwner(handler: (req: AuthRequest, ...args: any[]) => Promise<Response>) {
  return requireAuth(async (req: AuthRequest, ...args: any[]): Promise<Response> => {
    if (req.user?.role !== 'owner') {
      return NextResponse.json(
        { success: false, message: '权限不足' },
        { status: 403 }
      );
    }

    return handler(req, ...args);
  });
}

/**
 * 获取当前用户ID（从请求中提取）
 */
export function getCurrentUserId(req: AuthRequest): string {
  return req.user?.userId || '';
}

/**
 * 获取当前用户角色（从请求中提取）
 */
export function getCurrentUserRole(req: AuthRequest): 'owner' | 'member' | null {
  return req.user?.role || null;
}
