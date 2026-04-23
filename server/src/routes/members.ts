import express from 'express'

import { z } from 'zod'

import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { supabase, updateTask as updateTaskRecord } from '../services/dbService.js'
import { getProjectPermissionLevel, isCompanyAdminRole, normalizeProjectPermissionLevel } from '../auth/access.js'
import { getAuthUserByUsername, mapLegacyRoleToGlobalRole } from '../auth/session.js'
import { query as rawQuery } from '../database.js'

const router = express.Router()

router.use(authenticate)

const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1, 'projectId 不能为空'),
})

const projectUserParamSchema = z.object({
  projectId: z.string().trim().min(1, 'projectId 不能为空'),
  userId: z.string().trim().min(1, 'userId 不能为空'),
})

const addMemberSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  permission_level: z.string().trim().min(1, '缺少权限级别'),
})

const linkAssigneeSchema = z.object({
  assigneeName: z.string().trim().min(1, '责任人姓名不能为空'),
  userId: z.string().trim().min(1, '目标成员不能为空'),
})

const updatePermissionSchema = z.object({
  permission_level: z.string().trim().min(1, '缺少权限级别'),
})

const transferOwnerSchema = z.object({
  targetUserId: z.string().trim().min(1, '请选择目标成员'),
})

type MemberRow = {
  id: string
  user_id: string
  permission_level: string
  joined_at?: string | null
  last_activity?: string | null
  is_active?: boolean | null
  users?: {
    id: string
    username: string
    display_name: string
    email?: string | null
    role?: string | null
    global_role?: string | null
  } | null
}

type MemberListRow = {
  id: string
  user_id: string
  permission_level?: string | null
  joined_at?: string | null
  last_activity?: string | null
  is_active?: boolean | null
  username?: string | null
  display_name?: string | null
  email?: string | null
  role?: string | null
  global_role?: string | null
}

type UserProfileRow = {
  id: string
  username: string
  display_name?: string | null
}

type UnlinkedAssigneeTaskRow = {
  id: string
  title?: string | null
  assignee?: string | null
  assignee_name?: string | null
  assignee_user_id?: string | null
}

type UnlinkedAssigneeGroup = {
  assigneeName: string
  taskCount: number
  taskIds: string[]
  sampleTaskTitles: string[]
}

function normalizeMemberResponse(member: MemberRow) {
  const linkedUser = member.users
  return {
    id: member.id,
    userId: member.user_id,
    username: linkedUser?.username || '',
    displayName: linkedUser?.display_name || linkedUser?.username || '',
    email: linkedUser?.email ?? null,
    globalRole: linkedUser?.global_role || mapLegacyRoleToGlobalRole(linkedUser?.role),
    permissionLevel: normalizeProjectPermissionLevel(member.permission_level),
    joinedAt: member.joined_at ?? null,
    lastActivity: member.last_activity ?? null,
  }
}

function normalizeFlatMemberResponse(member: MemberListRow) {
  return {
    id: member.id,
    userId: member.user_id,
    username: member.username || '',
    displayName: member.display_name || member.username || '',
    email: member.email ?? null,
    globalRole: member.global_role || mapLegacyRoleToGlobalRole(member.role),
    permissionLevel: normalizeProjectPermissionLevel(member.permission_level),
    joinedAt: member.joined_at ?? null,
    lastActivity: member.last_activity ?? null,
  }
}

function normalizePersonName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase()
}

function readAssigneeName(row: UnlinkedAssigneeTaskRow) {
  return String(row.assignee_name ?? row.assignee ?? '').trim()
}

function readUserDisplayName(user: UserProfileRow) {
  return String(user.display_name ?? user.username ?? '').trim()
}

async function listUnlinkedAssigneeTasks(projectId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, assignee, assignee_name, assignee_user_id')
    .eq('project_id', projectId)
    .is('assignee_user_id', null)

  if (error) {
    throw error
  }

  return ((data ?? []) as UnlinkedAssigneeTaskRow[]).filter((row) => Boolean(readAssigneeName(row)))
}

function groupUnlinkedAssignees(rows: UnlinkedAssigneeTaskRow[]): UnlinkedAssigneeGroup[] {
  const grouped = new Map<string, UnlinkedAssigneeGroup>()

  for (const row of rows) {
    const assigneeName = readAssigneeName(row)
    const normalizedName = normalizePersonName(assigneeName)
    if (!normalizedName) continue

    const current = grouped.get(normalizedName) ?? {
      assigneeName,
      taskCount: 0,
      taskIds: [],
      sampleTaskTitles: [],
    }

    current.taskCount += 1
    current.taskIds.push(String(row.id))

    const title = String(row.title ?? '').trim()
    if (title && current.sampleTaskTitles.length < 3) {
      current.sampleTaskTitles.push(title)
    }

    grouped.set(normalizedName, current)
  }

  return [...grouped.values()].sort((left, right) => {
    if (right.taskCount !== left.taskCount) return right.taskCount - left.taskCount
    return left.assigneeName.localeCompare(right.assigneeName, 'zh-CN')
  })
}

async function getUserProfileById(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name')
    .eq('id', userId)
    .single()

  if (error) {
    throw error
  }

  return (data ?? null) as UserProfileRow | null
}

async function findSuggestedAssigneeMatches(projectId: string, user: UserProfileRow) {
  const rows = await listUnlinkedAssigneeTasks(projectId)
  const groups = groupUnlinkedAssignees(rows)
  const candidateNames = new Set(
    [readUserDisplayName(user), user.username]
      .map((value) => normalizePersonName(value))
      .filter(Boolean),
  )

  return groups.filter((group) => candidateNames.has(normalizePersonName(group.assigneeName)))
}

async function linkAssigneeToUser(projectId: string, assigneeName: string, targetUser: UserProfileRow, updatedBy: string) {
  const normalizedAssigneeName = normalizePersonName(assigneeName)
  if (!normalizedAssigneeName) {
    return { linkedTaskCount: 0 }
  }

  const tasks = await listUnlinkedAssigneeTasks(projectId)
  const matchedTasks = tasks.filter((task) => normalizePersonName(readAssigneeName(task)) === normalizedAssigneeName)
  const displayName = readUserDisplayName(targetUser)

  for (const task of matchedTasks) {
    await updateTaskRecord(
      String(task.id),
      {
        assignee_user_id: targetUser.id,
        assignee_name: displayName,
        assignee: displayName,
        updated_by: updatedBy,
      } as never,
      undefined,
    )
  }

  return { linkedTaskCount: matchedTasks.length }
}

async function ensureProjectOwner(userId: string, projectId: string) {
  const permissionLevel = await getProjectPermissionLevel(userId, projectId)
  return permissionLevel === 'owner'
}

async function ensureProjectMember(userId: string, projectId: string) {
  const permissionLevel = await getProjectPermissionLevel(userId, projectId)
  return permissionLevel !== null
}

async function getActiveMemberRecord(projectId: string, userId: string) {
  const { data } = await supabase
    .from('project_members')
    .select('id, user_id, permission_level, joined_at, last_activity, is_active')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  return (data ?? null) as MemberRow | null
}

async function listActiveOwners(projectId: string) {
  const { data, error } = await supabase
    .from('project_members')
    .select('id, user_id, permission_level, is_active')
    .eq('project_id', projectId)
    .eq('is_active', true)

  if (error) {
    throw error
  }

  return ((data ?? []) as MemberRow[]).filter(
    (member) => normalizeProjectPermissionLevel(member.permission_level) === 'owner',
  )
}

router.get('/:projectId/me', validate(projectIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const userId = req.user?.id

  if (!userId) {
    return res.status(401).json({ success: false, message: '未登录' })
  }

  const permissionLevel = await getProjectPermissionLevel(userId, projectId)
  const effectivePermissionLevel = permissionLevel ?? (isCompanyAdminRole(req.user?.globalRole) ? 'viewer' : null)

  if (!effectivePermissionLevel) {
    return res.status(403).json({ success: false, message: '无权访问此项目' })
  }

  return res.json({
    success: true,
    data: {
      projectId,
      permissionLevel: effectivePermissionLevel,
      globalRole: req.user?.globalRole || 'regular',
      canManageTeam: effectivePermissionLevel === 'owner',
      canEdit: effectivePermissionLevel === 'owner' || effectivePermissionLevel === 'editor',
    },
  })
}))

router.get('/:projectId', validate(projectIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const userId = req.user?.id

  if (!userId) {
    return res.status(401).json({ success: false, message: '未登录' })
  }

  const canView = await ensureProjectMember(userId, projectId)
  if (!canView) {
    return res.status(403).json({ success: false, message: '无权访问此项目' })
  }

  let rows: MemberListRow[] = []
  try {
    const result = await rawQuery(
      `SELECT
          pm.id,
          pm.user_id,
          pm.permission_level,
          pm.joined_at,
          pm.last_activity,
          pm.is_active,
          u.username,
          u.display_name,
          u.email,
          u.role,
          u.global_role
        FROM project_members pm
        LEFT JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = $1
          AND COALESCE(pm.is_active, true) = true
        ORDER BY pm.joined_at ASC`,
      [projectId],
    )
    rows = result.rows as MemberListRow[]
  } catch (error) {
    logger.error('Get members error', { error, projectId, userId })
    return res.status(500).json({ success: false, message: '获取成员列表失败' })
  }

  return res.json({
    success: true,
    members: rows.map((item) => normalizeFlatMemberResponse(item)),
  })
}))

router.get(
  '/:projectId/unlinked-assignees',
  validate(projectIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    const isOwner = await ensureProjectOwner(userId, projectId)
    if (!isOwner) {
      return res.status(403).json({ success: false, message: '只有项目负责人可以查看待关联责任人' })
    }

    const groups = groupUnlinkedAssignees(await listUnlinkedAssigneeTasks(projectId))
    return res.json({
      success: true,
      data: groups,
    })
  }),
)

router.post(
  '/:projectId',
  validate(projectIdParamSchema, 'params'),
  validate(addMemberSchema),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params
    const userId = req.user?.id
    const username = String(req.body?.username ?? '').trim()
    const permissionLevel = normalizeProjectPermissionLevel(req.body?.permission_level)

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    const isOwner = await ensureProjectOwner(userId, projectId)
    if (!isOwner) {
      return res.status(403).json({ success: false, message: '只有项目负责人可以添加成员' })
    }

    if (!['editor', 'viewer'].includes(permissionLevel)) {
      return res.status(400).json({ success: false, message: '仅支持添加编辑成员或只读成员' })
    }

    const targetUser = await getAuthUserByUsername(username)
    if (!targetUser) {
      return res.status(404).json({ success: false, message: '目标用户不存在' })
    }

    const { data: existingMember } = await supabase
      .from('project_members')
      .select('id, is_active')
      .eq('project_id', projectId)
      .eq('user_id', targetUser.id)
      .single()

    if (existingMember?.is_active) {
      return res.status(400).json({ success: false, message: '该用户已经是项目成员' })
    }

    if (existingMember) {
      const { error: reactivateError } = await supabase
        .from('project_members')
        .update({
          is_active: true,
          permission_level: permissionLevel,
          joined_at: new Date().toISOString(),
        })
        .eq('id', existingMember.id)

      if (reactivateError) {
        logger.error('Reactivate member error', { error: reactivateError, projectId, targetUserId: targetUser.id, userId })
        return res.status(500).json({ success: false, message: '添加成员失败' })
      }
    } else {
      const { error: insertError } = await supabase
        .from('project_members')
        .insert({
          project_id: projectId,
          user_id: targetUser.id,
          permission_level: permissionLevel,
          joined_at: new Date().toISOString(),
          is_active: true,
        })

      if (insertError) {
        logger.error('Insert member error', { error: insertError, projectId, targetUserId: targetUser.id, userId })
        return res.status(500).json({ success: false, message: '添加成员失败' })
      }
    }

    const member = await getActiveMemberRecord(projectId, targetUser.id)
    const suggestedMatches = await findSuggestedAssigneeMatches(projectId, {
      id: targetUser.id,
      username: targetUser.username,
      display_name: targetUser.display_name,
    })

    return res.json({
      success: true,
      message: '成员已加入项目',
      member: member
        ? normalizeMemberResponse({
            ...member,
            users: {
              id: targetUser.id,
              username: targetUser.username,
              display_name: targetUser.display_name,
              email: targetUser.email,
              role: targetUser.role,
              global_role: targetUser.global_role,
            },
          })
        : null,
      suggestedMatches,
    })
  }),
)

router.post(
  '/:projectId/link-assignee',
  validate(projectIdParamSchema, 'params'),
  validate(linkAssigneeSchema),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params
    const userId = req.user?.id
    const assigneeName = String(req.body?.assigneeName ?? '').trim()
    const targetUserId = String(req.body?.userId ?? '').trim()

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    const isOwner = await ensureProjectOwner(userId, projectId)
    if (!isOwner) {
      return res.status(403).json({ success: false, message: '只有项目负责人可以关联责任人账号' })
    }

    const targetMember = await getActiveMemberRecord(projectId, targetUserId)
    if (!targetMember) {
      return res.status(404).json({ success: false, message: '目标成员不是当前项目成员' })
    }

    const targetUser = await getUserProfileById(targetUserId)
    if (!targetUser) {
      return res.status(404).json({ success: false, message: '目标用户不存在' })
    }

    const result = await linkAssigneeToUser(projectId, assigneeName, targetUser, userId)
    return res.json({
      success: true,
      linkedTaskCount: result.linkedTaskCount,
      message: result.linkedTaskCount > 0 ? '责任人已关联到项目成员账号' : '没有找到待关联的任务',
    })
  }),
)

router.patch(
  '/:projectId/:userId',
  validate(projectUserParamSchema, 'params'),
  validate(updatePermissionSchema),
  asyncHandler(async (req, res) => {
    const { projectId, userId: targetUserId } = req.params
    const userId = req.user?.id
    const permissionLevel = normalizeProjectPermissionLevel(req.body?.permission_level)

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    const isOwner = await ensureProjectOwner(userId, projectId)
    if (!isOwner) {
      return res.status(403).json({ success: false, message: '只有项目负责人可以调整成员权限' })
    }

    if (!['editor', 'viewer'].includes(permissionLevel)) {
      return res.status(400).json({ success: false, message: '仅支持切换为编辑成员或只读成员' })
    }

    if (targetUserId === userId) {
      return res.status(400).json({ success: false, message: '不能直接调整自己的负责人权限，请使用转让负责人' })
    }

    const targetMember = await getActiveMemberRecord(projectId, targetUserId)
    if (!targetMember) {
      return res.status(404).json({ success: false, message: '目标成员不存在' })
    }

    if (normalizeProjectPermissionLevel(targetMember.permission_level) === 'owner') {
      const owners = await listActiveOwners(projectId)
      if (owners.length <= 1) {
        return res.status(422).json({ success: false, message: '项目必须至少保留一个 owner' })
      }
      return res.status(400).json({ success: false, message: '当前负责人仅能通过负责人转让流程调整' })
    }

    const { error } = await supabase
      .from('project_members')
      .update({ permission_level: permissionLevel })
      .eq('id', targetMember.id)

    if (error) {
      logger.error('Update member permission error', { error, projectId, targetUserId, userId })
      return res.status(500).json({ success: false, message: '调整成员权限失败' })
    }

    return res.json({
      success: true,
      message: '成员权限已更新',
    })
  }),
)

router.post(
  '/:projectId/transfer-owner',
  validate(projectIdParamSchema, 'params'),
  validate(transferOwnerSchema),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params
    const userId = req.user?.id
    const targetUserId = String(req.body?.targetUserId ?? '').trim()

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    const isOwner = await ensureProjectOwner(userId, projectId)
    if (!isOwner) {
      return res.status(403).json({ success: false, message: '只有项目负责人可以转让负责人' })
    }

    if (targetUserId === userId) {
      return res.status(400).json({ success: false, message: '不能转让给自己' })
    }

    const targetMember = await getActiveMemberRecord(projectId, targetUserId)
    if (!targetMember) {
      return res.status(404).json({ success: false, message: '目标成员不是当前项目成员' })
    }

    const { error: promoteError } = await supabase
      .from('project_members')
      .update({ permission_level: 'owner' })
      .eq('id', targetMember.id)

    if (promoteError) {
      logger.error('Promote owner error', { error: promoteError, projectId, targetUserId, userId })
      return res.status(500).json({ success: false, message: '转让负责人失败' })
    }

    const { error: updateProjectError } = await supabase
      .from('projects')
      .update({ owner_id: targetUserId })
      .eq('id', projectId)

    if (updateProjectError) {
      logger.error('Transfer owner project error', { error: updateProjectError, projectId, targetUserId, userId })
      return res.status(500).json({ success: false, message: '转让负责人失败' })
    }

    const currentOwnerMember = await getActiveMemberRecord(projectId, userId)
    if (currentOwnerMember) {
      await supabase
        .from('project_members')
        .update({ permission_level: 'editor' })
        .eq('id', currentOwnerMember.id)
    }

    const owners = await listActiveOwners(projectId)
    if (owners.length === 0) {
      return res.status(409).json({ success: false, message: '项目必须至少保留一个 owner' })
    }

    return res.json({
      success: true,
      message: '项目负责人已转让',
    })
  }),
)

router.delete(
  '/:projectId/:userId',
  validate(projectUserParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId, userId: targetUserId } = req.params
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    const isOwner = await ensureProjectOwner(userId, projectId)
    if (!isOwner) {
      return res.status(403).json({ success: false, message: '只有项目负责人可以移除成员' })
    }

    if (targetUserId === userId) {
      return res.status(400).json({ success: false, message: '不能移除自己' })
    }

    const targetMember = await getActiveMemberRecord(projectId, targetUserId)
    if (!targetMember) {
      return res.status(404).json({ success: false, message: '目标成员不存在' })
    }

    if (normalizeProjectPermissionLevel(targetMember.permission_level) === 'owner') {
      const owners = await listActiveOwners(projectId)
      if (owners.length <= 1) {
        return res.status(422).json({ success: false, message: '项目必须至少保留一个 owner' })
      }
      return res.status(400).json({ success: false, message: '当前负责人不能直接移除，请先转让负责人' })
    }

    const { error } = await supabase
      .from('project_members')
      .update({ is_active: false })
      .eq('id', targetMember.id)

    if (error) {
      logger.error('Remove member error', { error, projectId, targetUserId, userId })
      return res.status(500).json({ success: false, message: '移除成员失败' })
    }

    return res.json({
      success: true,
      message: '成员已移除',
    })
  }),
)

export default router
