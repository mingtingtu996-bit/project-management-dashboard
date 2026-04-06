/**
 * JWT工具函数
 */

import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { JWT_CONFIG } from './config';
import { JWTPayload, AuthUser } from './types';

/**
 * 生成JWT令牌
 */
export function generateToken(user: AuthUser): string {
  const payload: JWTPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };

  return jwt.sign(payload, JWT_CONFIG.secret, {
    expiresIn: JWT_CONFIG.accessTokenExpiresIn as jwt.SignOptions['expiresIn'],
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
  } as jwt.SignOptions);
}

/**
 * 验证JWT令牌
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.secret, {
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    }) as JWTPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.error('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.error('Invalid token');
    } else {
      console.error('Token verification error:', error);
    }
    return null;
  }
}

/**
 * 从请求中提取令牌
 */
export function extractTokenFromRequest(req: Request): string | null {
  // 1. 尝试从Authorization header获取
  const authHeader = req.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 2. 尝试从Cookie获取
  const cookieHeader = req.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const authCookie = cookies.find(c => c.startsWith(`${JWT_CONFIG.cookie.name}=`));
    if (authCookie) {
      return authCookie.substring(JWT_CONFIG.cookie.name.length + 1);
    }
  }

  return null;
}
