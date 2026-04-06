/**
 * 获取当前用户信息API路由
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { verifyToken, extractTokenFromRequest } from '../auth/jwt';

const router = express.Router();

// 初始化Supabase客户端
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/auth/me - 获取当前登录用户信息
 */
router.get('/', async (req, res) => {
  try {
    // 提取并验证token
    const token = extractTokenFromRequest(req);

    if (!token) {
      return res.status(401).json(
        { success: false, message: '未登录' }
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json(
        { success: false, message: '登录已过期' }
      );
    }

    // 从数据库获取用户完整信息
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, display_name, email, role, joined_at, last_active')
      .eq('id', payload.userId)
      .single();

    if (error || !user) {
      return res.status(404).json(
        { success: false, message: '用户不存在' }
      );
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
        role: user.role || 'member',
        joined_at: user.joined_at,
        last_active: user.last_active,
      },
    });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json(
      { success: false, message: '获取用户信息失败' }
    );
  }
});

export default router;
