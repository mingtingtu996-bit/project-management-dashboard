/**
 * 用户登出API路由
 */

import express from 'express';
import { verifyToken, extractTokenFromRequest } from '../auth/jwt';
import { logLogout } from '../utils/operationLog.js';

const router = express.Router();

/**
 * POST /api/auth/logout - 用户登出
 */
router.post('/', (req, res) => {
  try {
    // 记录日志（尝试从token获取用户信息）
    const token = extractTokenFromRequest(req);
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        logLogout(payload.userId, payload.username, req).catch(() => {});
      }
    }

    // 清除Cookie
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return res.json({ success: true, message: '已登出' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json(
      { success: false, message: '登出失败' }
    );
  }
});

export default router;
