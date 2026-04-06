/**
 * 用户注册API路由
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { generateToken } from '../auth/jwt';
import { hashPassword, validatePasswordStrength, validateUsername } from '../auth/password';

const router = express.Router();

// 初始化Supabase客户端
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * POST /api/auth/register - 用户注册
 */
router.post('/', async (req, res) => {
  try {
    const { username, password, display_name, email } = req.body;

    // 参数验证
    if (!username || !password) {
      return res.status(400).json(
        { success: false, message: '请输入用户名和密码' }
      );
    }

    // 验证用户名格式
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json(
        { success: false, message: usernameValidation.errors.join(', ') }
      );
    }

    // 验证密码强度
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json(
        { success: false, message: passwordValidation.errors.join(', ') }
      );
    }

    // 检查用户名是否已存在
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existingUser) {
      return res.status(400).json(
        { success: false, message: '用户名已存在' }
      );
    }

    // 如果提供了email，检查email是否已存在
    if (email) {
      const { data: existingEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existingEmail) {
        return res.status(400).json(
          { success: false, message: '邮箱已被注册' }
        );
      }
    }

    // 哈希密码
    const passwordHash = await hashPassword(password);

    // 创建用户
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        username,
        password_hash: passwordHash,
        display_name: display_name || username,
        email: email || null,
        role: 'member',
        device_id: `user-${username}`, // 生成唯一device_id
      })
      .select()
      .single();

    if (createError || !newUser) {
      console.error('Create user error:', createError);
      return res.status(500).json(
        { success: false, message: '注册失败，请稍后重试' }
      );
    }

    // 生成JWT令牌
    const token = generateToken({
      id: newUser.id,
      username: newUser.username,
      display_name: newUser.display_name,
      email: newUser.email,
      role: newUser.role || 'member',
    });

    // 构建响应
    const response = {
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        display_name: newUser.display_name,
        email: newUser.email,
        role: newUser.role || 'member',
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
    console.error('Register error:', error);
    res.status(500).json(
      { success: false, message: '注册失败，请稍后重试' }
    );
  }
});

export default router;
