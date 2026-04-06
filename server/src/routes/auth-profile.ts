/**
 * 编辑个人信息API路由
 */

import express from 'express';
import { verifyToken, extractTokenFromRequest, generateToken } from '../auth/jwt';
import { query } from '../database';

const router = express.Router();

/**
 * PUT /api/auth/profile - 编辑个人信息
 */
router.put('/', async (req, res) => {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ success: false, message: '登录已过期' });
    }

    const { display_name, email } = req.body;

    if (!display_name && !email) {
      return res.status(400).json({ success: false, message: '请提供要修改的信息' });
    }

    // 构建更新语句
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      params.push(display_name);
    }

    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      params.push(email || null);
    }

    updates.push(`updated_at = NOW()`);
    params.push(payload.userId);

    const result = await query(
      `UPDATE public.users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, username, display_name, email, role`,
      params
    );

    const updatedUser = result.rows[0];
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 生成新token以更新用户信息
    const newToken = generateToken({
      id: updatedUser.id,
      username: updatedUser.username,
      display_name: updatedUser.display_name,
      email: updatedUser.email,
      role: updatedUser.role || 'member',
    });

    // 更新Cookie
    res.cookie('auth_token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      success: true,
      message: '个人信息已更新',
      token: newToken,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        display_name: updatedUser.display_name,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: '更新个人信息失败，请稍后重试' });
  }
});

export default router;
