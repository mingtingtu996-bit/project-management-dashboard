/**
 * 项目成员管理API路由
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
 * 验证用户是否是项目所有者
 */
async function verifyProjectOwner(userId: string, projectId: string): Promise<boolean> {
  const { data } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .eq('owner_id', userId)
    .single();

  return !!data;
}

/**
 * GET /api/members/:projectId - 获取项目成员列表
 */
router.get('/:projectId', async (req, res) => {
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

    const { projectId } = req.params;

    // 验证用户是否是项目成员
    const { data: member, error: memberError } = await supabase
      .from('project_members')
      .select('permission_level')
      .eq('project_id', projectId)
      .eq('user_id', payload.userId)
      .eq('is_active', true)
      .single();

    if (memberError || !member) {
      return res.status(403).json(
        { success: false, message: '无权访问此项目' }
      );
    }

    // 获取项目成员列表
    const { data: members, error: membersError } = await supabase
      .from('project_members')
      .select(`
        id,
        user_id,
        permission_level,
        joined_at,
        last_activity,
        is_active,
        users (
          id,
          username,
          display_name,
          email,
          role
        )
      `)
      .eq('project_id', projectId)
      .eq('is_active', true);

    if (membersError) {
      console.error('Get members error:', membersError);
      return res.status(500).json(
        { success: false, message: '获取成员列表失败' }
      );
    }

    res.json({
      success: true,
      members: members?.map(m => ({
        id: m.id,
        userId: m.user_id,
        username: (m.users as any)?.username,
        displayName: (m.users as any)?.display_name,
        email: (m.users as any)?.email,
        role: (m.users as any)?.role,
        permissionLevel: m.permission_level,
        joinedAt: m.joined_at,
        lastActivity: m.last_activity,
      })),
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json(
      { success: false, message: '获取成员列表失败' }
    );
  }
});

/**
 * POST /api/members/:projectId - 添加项目成员
 */
router.post('/:projectId', async (req, res) => {
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

    const { projectId } = req.params;
    const { username, permission_level } = req.body;

    // 验证参数
    if (!username || !permission_level) {
      return res.status(400).json(
        { success: false, message: '请提供用户名和权限级别' }
      );
    }

    // 验证权限级别
    if (!['owner', 'editor', 'viewer'].includes(permission_level)) {
      return res.status(400).json(
        { success: false, message: '无效的权限级别' }
      );
    }

    // 验证用户是否是项目所有者
    const isOwner = await verifyProjectOwner(payload.userId, projectId);
    if (!isOwner) {
      return res.status(403).json(
        { success: false, message: '只有项目所有者可以添加成员' }
      );
    }

    // 查找用户
    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, username, display_name')
      .eq('username', username)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json(
        { success: false, message: '用户不存在' }
      );
    }

    // 检查用户是否已经是项目成员
    const { data: existingMember } = await supabase
      .from('project_members')
      .select('id, is_active')
      .eq('project_id', projectId)
      .eq('user_id', targetUser.id)
      .single();

    if (existingMember) {
      if (existingMember.is_active) {
        return res.status(400).json(
          { success: false, message: '用户已经是项目成员' }
        );
      } else {
        // 重新激活成员
        const { error: updateError } = await supabase
          .from('project_members')
          .update({
            is_active: true,
            permission_level,
            joined_at: new Date().toISOString(),
          })
          .eq('id', existingMember.id);

        if (updateError) {
          console.error('Reactivate member error:', updateError);
          return res.status(500).json(
            { success: false, message: '添加成员失败' }
          );
        }

        return res.json({
          success: true,
          message: '成员已添加到项目',
          member: {
            userId: targetUser.id,
            username: targetUser.username,
            displayName: targetUser.display_name,
            permissionLevel: permission_level,
          },
        });
      }
    }

    // 添加新成员
    const { data: newMember, error: addError } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        user_id: targetUser.id,
        permission_level,
        joined_at: new Date().toISOString(),
        is_active: true,
      })
      .select()
      .single();

    if (addError || !newMember) {
      console.error('Add member error:', addError);
      return res.status(500).json(
        { success: false, message: '添加成员失败' }
      );
    }

    res.json({
      success: true,
      message: '成员已添加到项目',
      member: {
        userId: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.display_name,
        permissionLevel: permission_level,
      },
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json(
      { success: false, message: '添加成员失败' }
    );
  }
});

/**
 * DELETE /api/members/:projectId/:userId - 移除项目成员
 */
router.delete('/:projectId/:userId', async (req, res) => {
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

    const { projectId, userId } = req.params;

    // 验证用户是否是项目所有者
    const isOwner = await verifyProjectOwner(payload.userId, projectId);
    if (!isOwner) {
      return res.status(403).json(
        { success: false, message: '只有项目所有者可以移除成员' }
      );
    }

    // 不能移除自己
    if (userId === payload.userId) {
      return res.status(400).json(
        { success: false, message: '不能移除自己' }
      );
    }

    // 软删除成员（设置is_active=false）
    const { error } = await supabase
      .from('project_members')
      .update({ is_active: false })
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Remove member error:', error);
      return res.status(500).json(
        { success: false, message: '移除成员失败' }
      );
    }

    res.json({
      success: true,
      message: '成员已移除',
    });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json(
      { success: false, message: '移除成员失败' }
    );
  }
});

/**
 * POST /api/members/:projectId/transfer-owner - 转让项目负责人
 */
router.post('/:projectId/transfer-owner', async (req, res) => {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ success: false, message: '登录已过期' });
    }

    const { projectId } = req.params;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: '请指定目标用户' });
    }

    // 验证当前用户是否是项目所有者
    const isOwner = await verifyProjectOwner(payload.userId, projectId);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: '只有项目所有者可以转让' });
    }

    // 不能转让给自己
    if (targetUserId === payload.userId) {
      return res.status(400).json({ success: false, message: '不能转让给自己' });
    }

    // 验证目标用户是否是活跃的项目成员
    const { data: targetMember, error: memberError } = await supabase
      .from('project_members')
      .select('id, user_id, permission_level')
      .eq('project_id', projectId)
      .eq('user_id', targetUserId)
      .eq('is_active', true)
      .single();

    if (memberError || !targetMember) {
      return res.status(404).json({ success: false, message: '目标用户不是项目成员' });
    }

    // 更新项目表 owner_id
    const { error: projectError } = await supabase
      .from('projects')
      .update({ owner_id: targetUserId })
      .eq('id', projectId);

    if (projectError) {
      console.error('Transfer owner project error:', projectError);
      return res.status(500).json({ success: false, message: '转让失败' });
    }

    // 更新成员权限：新 owner → owner，旧 owner → editor
    const { error: newOwnerError } = await supabase
      .from('project_members')
      .update({ permission_level: 'owner' })
      .eq('id', targetMember.id);

    if (newOwnerError) {
      console.error('Update new owner error:', newOwnerError);
    }

    // 旧 owner 降为 editor
    const { data: oldMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', payload.userId)
      .eq('is_active', true)
      .single();

    if (oldMember) {
      await supabase
        .from('project_members')
        .update({ permission_level: 'editor' })
        .eq('id', oldMember.id);
    }

    res.json({ success: true, message: '项目负责人已转让' });
  } catch (error) {
    console.error('Transfer owner error:', error);
    res.status(500).json({ success: false, message: '转让失败，请稍后重试' });
  }
});

export default router;
