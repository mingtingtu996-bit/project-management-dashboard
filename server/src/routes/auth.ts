/**
 * 认证API路由
 */

import express from 'express';
import { generateToken } from '../auth/jwt';
import { hashPassword, verifyPassword } from '../auth/password';
import { validatePasswordStrength, validateUsername } from '../auth/password';
import { LoginRequest, LoginResponse } from '../auth/types';
import { query } from '../database';

const router = express.Router();

/**
 * POST /api/auth/login - 用户登录
 */
router.post('/', async (req, res) => {
  try {
    const body: LoginRequest = req.body;
    const { username, password } = body;

    // 参数验证
    if (!username || !password) {
      return res.status(400).json(
        { success: false, message: '请输入用户名和密码' }
      );
    }

    // 查询用户
    const userResult = await query(
      'SELECT * FROM public.users WHERE username = $1',
      [username]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json(
        { success: false, message: '用户名或密码错误' }
      );
    }

    // 验证密码
    const isPasswordValid = await verifyPassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json(
        { success: false, message: '用户名或密码错误' }
      );
    }

    // 生成JWT令牌
    const token = generateToken({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      email: user.email,
      role: user.role || 'member',
    });

    // 更新最后活跃时间（如果表有此字段）
    try {
      await query(
        'UPDATE public.users SET last_active = NOW() WHERE id = $1',
        [user.id]
      );
    } catch (e) {
      // 忽略字段不存在错误
      console.warn('Failed to update last_active:', e);
    }

    // 构建响应
    const response: LoginResponse = {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
        role: user.role || 'member',
      },
    };

    // 设置Cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
      path: '/',
    });

    return res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: '登录失败，请稍后重试'
    });
  }
});

export default router;
