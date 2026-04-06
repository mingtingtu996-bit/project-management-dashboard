import express from 'express';

/**
 * 操作日志工具
 */

/**
 * 记录登出日志
 */
export async function logLogout(
  userId: string,
  username: string,
  req: express.Request
): Promise<void> {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  console.log(`[Logout] User ${username} (${userId}) logged out from ${ip}`);
}
