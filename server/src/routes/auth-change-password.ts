/**
 * 修改密码API路由
 */

import express from 'express';
import { verifyToken, extractTokenFromRequest } from '../auth/jwt';
import { verifyPassword, hashPassword } from '../auth/password';
import { query } from '../database';

const router = express.Router();

/**
 * POST /api/auth/change-password - 修改密码
 */
router.post('/', async (req, res) => {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ success: false, message: '登录已过期' });
    }

    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: '请输入旧密码和新密码' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: '新密码长度至少6位' });
    }

    if (newPassword.length > 50) {
      return res.status(400).json({ success: false, message: '新密码长度不能超过50位' });
    }

    // 查询当前用户
    const userResult = await query(
      'SELECT password_hash FROM public.users WHERE id = $1',
      [payload.userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 验证旧密码
    const isValid = await verifyPassword(oldPassword, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ success: false, message: '旧密码错误' });
    }

    // 哈希新密码并更新
    const newHash = await hashPassword(newPassword);
    await query(
      'UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, payload.userId]
    );

    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: '修改密码失败，请稍后重试' });
  }
});

export default router;
