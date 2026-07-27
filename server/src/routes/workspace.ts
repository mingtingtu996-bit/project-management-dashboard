// v1.4.20: Workspace API — company + project aggregation entry point
import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { supabase } from '../services/dbService.js'
import { query as rawQuery } from '../database.js'
import type { ApiResponse } from '../types/index.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { getCurrentCompanyMembership, getProjectPermissionLevel, normalizeProjectPermissionLevel } from '../auth/access.js'
import {
  acceptDirectProjectInvitation,
  InvitationAcceptanceError,
} from '../services/invitationAcceptanceService.js'

const router = Router()
router.use(authenticate)

function errorResponse(code: string, message: string) {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  }
}

async function requireCompanyAdmin(userId: string, companyId: string) {
  const membership = await getCurrentCompanyMembership(userId, companyId)
  return membership?.companyId === companyId && membership.role === 'company_admin'
}

async function requireProjectOwner(userId: string, projectId: string, companyId?: string | null) {
  const permissionLevel = await getProjectPermissionLevel(userId, projectId, companyId)
  return permissionLevel === 'owner'
}

function normalizeCompanyDiscoverability(value: unknown) {
  const normalized = String(value ?? '').trim()
  return ['public', 'searchable', 'invite_only', 'hidden'].includes(normalized)
    ? normalized
    : 'invite_only'
}

function normalizeCompanyJoinPolicy(value: unknown) {
  const normalized = String(value ?? '').trim()
  return ['open', 'approval_required', 'invite_only'].includes(normalized)
    ? normalized
    : 'approval_required'
}

async function upsertActiveCompanyMember(companyId: string, userId: string, now: string) {
  const existingMember = await (supabase as any)
    .from('company_members')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existingMember?.error) throw existingMember.error

  if (existingMember?.data?.id) {
    const companyMemberUpdate = await (supabase as any)
      .from('company_members')
      .update({
        status: 'active',
        updated_at: now,
      })
      .eq('id', existingMember.data.id)
      .eq('company_id', companyId)
      .eq('user_id', userId)
    if (companyMemberUpdate?.error) throw companyMemberUpdate.error
    return
  }

  const companyMemberInsert = await (supabase as any).from('company_members').insert({
    company_id: companyId,
    user_id: userId,
    role: 'regular',
    status: 'active',
    updated_at: now,
  })
  if (companyMemberInsert?.error) throw companyMemberInsert.error
}

async function upsertActiveProjectMember(projectId: string, userId: string, permissionLevel: string, now: string) {
  const existingMember = await (supabase as any)
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existingMember?.error) throw existingMember.error

  if (existingMember?.data?.id) {
    const projectMemberUpdate = await (supabase as any)
      .from('project_members')
      .update({
        permission_level: permissionLevel,
        is_active: true,
        joined_at: now,
      })
      .eq('id', existingMember.data.id)
      .eq('project_id', projectId)
      .eq('user_id', userId)
    if (projectMemberUpdate?.error) throw projectMemberUpdate.error
    return
  }

  const projectMemberInsert = await (supabase as any).from('project_members').insert({
    project_id: projectId,
    user_id: userId,
    permission_level: permissionLevel,
    is_active: true,
    joined_at: now,
  })
  if (projectMemberInsert?.error) throw projectMemberInsert.error
}

async function loadWorkspaceOverviewFast(userId: string, currentCompanyId: string, currentRole: 'company_admin' | 'regular') {
  const [companyResult, switchableResult, projectsResult, companyProjectsResult, invitationsResult] = await Promise.all([
    rawQuery('SELECT id, name FROM public.companies WHERE id = $1 LIMIT 1', [currentCompanyId]),
    rawQuery(
      `
        SELECT cm.company_id, cm.role, c.name AS company_name
          FROM public.company_members cm
          LEFT JOIN public.companies c ON c.id = cm.company_id
         WHERE cm.user_id = $1
           AND COALESCE(cm.status, 'active') = 'active'
         ORDER BY cm.created_at ASC NULLS LAST
         LIMIT 50
      `,
      [userId],
    ),
    rawQuery(
      `
        SELECT p.id,
               p.name,
               p.project_type,
               p.current_phase,
               p.health_score,
               p.location,
               p.created_at,
               pm.permission_level
          FROM public.project_members pm
          JOIN public.projects p ON p.id = pm.project_id
         WHERE pm.user_id = $1
           AND COALESCE(pm.is_active, true) = true
           AND p.company_id = $2
         ORDER BY p.created_at DESC NULLS LAST
         LIMIT 50
      `,
      [userId, currentCompanyId],
    ),
    currentRole === 'company_admin'
      ? rawQuery(
        `
          SELECT p.id,
                 p.name,
                 p.project_type,
                 p.current_phase,
                 p.health_score,
                 p.location,
                 p.created_at
            FROM public.projects p
           WHERE p.company_id = $1
           ORDER BY p.created_at DESC NULLS LAST
           LIMIT 50
        `,
        [currentCompanyId],
      )
      : Promise.resolve({ rows: [], rowCount: 0 }),
    rawQuery(
      `
        SELECT inv.id,
               inv.project_id,
               inv.company_id,
               inv.created_at,
               inv.role,
               p.name AS project_name,
               u.display_name AS inviter_name
          FROM public.project_direct_invitations inv
          LEFT JOIN public.projects p
            ON p.id = inv.project_id
           AND p.company_id = inv.company_id
          LEFT JOIN public.users u ON u.id = inv.invited_by
         WHERE inv.recipient_user_id = $1
           AND inv.company_id = $2
           AND inv.status = 'pending'
         ORDER BY inv.created_at DESC NULLS LAST
         LIMIT 10
      `,
      [userId, currentCompanyId],
    ),
  ])

  const currentCompany = companyResult.rows[0] ?? null
  const switchableCompanies = (switchableResult.rows ?? []).map((row: any) => ({
    id: row.company_id,
    name: row.company_name ?? '',
    role: row.role ?? 'regular',
    active: row.company_id === currentCompanyId,
  }))

  const myProjects = (projectsResult.rows ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    projectType: p.project_type ?? '',
    stage: p.current_phase ?? '',
    healthScore: p.health_score ?? null,
    progress: null,
    location: p.location ?? null,
    lastActivityAt: p.created_at,
    myRole: p.permission_level ?? 'editor',
  }))

  const companyProjects = currentRole === 'company_admin'
    ? (companyProjectsResult.rows ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      projectType: p.project_type ?? '',
      stage: p.current_phase ?? '',
      healthScore: p.health_score ?? null,
      progress: null,
      location: p.location ?? null,
      lastActivityAt: p.created_at,
      myRole: 'company_admin',
    }))
    : []
  const recentProjects = myProjects.length > 0 ? myProjects.slice(0, 5) : companyProjects.slice(0, 5)

  const pendingInvitations = (invitationsResult.rows ?? []).map((inv: any) => ({
    id: inv.id,
    projectId: inv.project_id,
    projectName: inv.project_name ?? '',
    inviterName: inv.inviter_name ?? '',
    invitedAt: inv.created_at,
    companyId: inv.company_id,
    role: inv.role ?? 'editor',
  }))

  return {
    hasCompany: true,
    currentCompany: currentCompany ? { id: currentCompany.id, name: currentCompany.name, role: currentRole } : null,
    switchableCompanies,
    myProjects,
    recentProjects,
    companyProjects,
    joinableProjects: [],
    pendingInvitations,
    joinRequests: [],
    demoEntry: null,
    emptyStateReason: recentProjects.length === 0 ? 'no_project_membership' : null,
  }
}

// GET /api/workspace — aggregated workspace data for the current user
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '请先登录' }, timestamp: new Date().toISOString() })
  }

  const requestedCompanyId = getRequestCompanyId(req)
  const currentMembership = await getCurrentCompanyMembership(userId, requestedCompanyId)
  const currentCompanyId = currentMembership?.companyId ?? null

  logger.info('Fetching workspace data', { userId, currentCompanyId })

  if (!currentCompanyId) {
    return res.json({
      success: true,
      data: {
        hasCompany: false,
        currentCompany: null,
        switchableCompanies: [],
        myProjects: [],
        recentProjects: [],
        companyProjects: [],
        joinableProjects: [],
        pendingInvitations: [],
        joinRequests: [],
        demoEntry: { available: true, label: '产品预览' },
        emptyStateReason: 'no_company',
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }

  try {
    const data = await loadWorkspaceOverviewFast(userId, currentCompanyId, currentMembership.role)
    return res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  } catch (error) {
    logger.warn('[workspace] fast overview path failed, falling back to Supabase path', {
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const { data: currentCompany } = await (supabase as any)
    .from('companies')
    .select('id, name')
    .eq('id', currentCompanyId)
    .maybeSingle()

  const { data: switchableCompanyRows } = await (supabase as any)
    .from('company_members')
    .select('company_id, role, companies(id, name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(50)

  const switchableCompanies = (switchableCompanyRows ?? []).map((row: any) => ({
    id: row.company_id,
    name: row.companies?.name ?? '',
    role: row.role ?? 'regular',
    active: row.company_id === currentCompanyId,
  }))

  // Get user's projects
  const { data: projectMembers } = await (supabase as any)
    .from('project_members')
    .select('project_id, permission_level')
    .eq('user_id', userId)
    .eq('is_active', true)

  const myProjectIds: string[] = (projectMembers ?? []).map((m: any) => m.project_id)
  const projectRoleMap = new Map((projectMembers ?? []).map((m: any) => [m.project_id, m.permission_level]))

  let myProjects: any[] = []
  if (myProjectIds.length > 0) {
    const { data: projects } = await (supabase as any)
      .from('projects')
      .select('id, name, project_type, current_phase, health_score, overall_progress, location, created_at')
      .in('id', myProjectIds)
      .eq('company_id', currentCompanyId)
      .order('created_at', { ascending: false })
      .limit(50)

    myProjects = (projects ?? []).map((p: any) => ({
      id: p.id, name: p.name, projectType: p.project_type ?? '', stage: p.current_phase ?? '',
      healthScore: p.health_score ?? null, progress: p.overall_progress ?? null, location: p.location ?? null,
      lastActivityAt: p.created_at, myRole: projectRoleMap.get(p.id) ?? 'editor',
    }))
  }

  // v1.4.20: workspace pending only from project_direct_invitations
  const { data: directInvitations } = await (supabase as any)
    .from('project_direct_invitations')
    .select('id, project_id, invited_by, created_at')
    .eq('recipient_user_id', userId)
    .eq('company_id', currentCompanyId)
    .eq('status', 'pending')
    .limit(10)

  const pendingInvitations = await Promise.all((directInvitations ?? []).map(async (inv: any) => {
    const { data: proj } = await (supabase as any)
      .from('projects')
      .select('name')
      .eq('id', inv.project_id)
      .eq('company_id', currentCompanyId)
      .maybeSingle()
    const inviterId = inv.invited_by
    const { data: inviter } = inviterId
      ? await (supabase as any).from('users').select('display_name').eq('id', inviterId).maybeSingle()
      : { data: null }
    return { id: inv.id, projectId: inv.project_id, projectName: proj?.name ?? '', inviterName: inviter?.display_name ?? '', invitedAt: inv.created_at }
  }))

  res.json({
    success: true,
    data: {
      hasCompany: true,
      currentCompany: currentCompany ? { id: currentCompany.id, name: currentCompany.name, role: currentMembership.role } : null,
      switchableCompanies,
      myProjects,
      recentProjects: myProjects.slice(0, 5),
      companyProjects: [],
      joinableProjects: [],
      pendingInvitations,
      joinRequests: [],
      demoEntry: null,
      emptyStateReason: myProjects.length === 0 ? 'no_project_membership' : null,
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

// v1.4.20: Accept project direct invitation
router.post('/invitations/:invitationId/accept', asyncHandler(async (req, res) => {
  const invitationId = String(req.params.invitationId ?? '').trim()
  const userId = req.user?.id
  if (!userId || !invitationId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing invitationId or user' }, timestamp: new Date().toISOString() })
  }

  try {
    const result = await acceptDirectProjectInvitation({ invitationId, userId })
    res.json({
      success: true,
      data: { accepted: true, projectId: result.projectId, companyId: result.companyId, permissionLevel: result.permissionLevel },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof InvitationAcceptanceError) {
      return res.status(error.statusCode).json(errorResponse(error.code, error.message))
    }
    throw error
  }
}))

// v1.4.20: Decline project direct invitation
router.post('/invitations/:invitationId/decline', asyncHandler(async (req, res) => {
  const invitationId = String(req.params.invitationId ?? '').trim()
  const userId = req.user?.id
  if (!userId || !invitationId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing invitationId or user' }, timestamp: new Date().toISOString() })
  }

  const { data: invitation } = await (supabase as any)
    .from('project_direct_invitations')
    .select('project_id, company_id')
    .eq('id', invitationId)
    .eq('recipient_user_id', userId)
    .eq('status', 'pending')
    .maybeSingle()

  if (!invitation) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '邀请不存在或已处理' }, timestamp: new Date().toISOString() })
  }

  await (supabase as any)
    .from('project_direct_invitations')
    .update({ status: 'declined', declined_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('recipient_user_id', userId)
    .eq('project_id', invitation.project_id)
    .eq('company_id', invitation.company_id)
    .eq('status', 'pending')
  res.json({ success: true, data: { declined: true }, timestamp: new Date().toISOString() })
}))

// v1.4.20: Company search
// workspace-isolation-public-directory-approved: only public/searchable active company directory fields are returned.
router.get('/companies/search', asyncHandler(async (req, res) => {
  const query = String(req.query.q ?? '').trim()
  if (!query || query.length < 2) {
    return res.json({ success: true, data: [], timestamp: new Date().toISOString() })
  }
  const { data } = await (supabase as any)
    .from('companies')
    .select('id, name, discoverability, join_policy')
    .ilike('name', `%${query}%`)
    .eq('is_active', true)
    .in('discoverability', ['public', 'searchable'])
    .limit(20)
  res.json({ success: true, data: data ?? [], timestamp: new Date().toISOString() })
}))

// v1.4.20: Join company request
router.post('/companies/:companyId/join', asyncHandler(async (req, res) => {
  const companyId = String(req.params.companyId ?? '').trim()
  const userId = req.user?.id
  if (!userId || !companyId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing companyId or user' }, timestamp: new Date().toISOString() })
  }

  const { data: company } = await (supabase as any)
    .from('companies')
    .select('id, discoverability, join_policy, is_active, status')
    .eq('id', companyId)
    .maybeSingle()

  if (!company || company.is_active === false || company.status === 'inactive') {
    return res.status(404).json(errorResponse('COMPANY_NOT_FOUND', 'Company is not available'))
  }
  if (company.discoverability === 'hidden' || company.join_policy === 'invite_only') {
    return res.status(403).json(errorResponse('INVITE_REQUIRED', 'This company requires an invitation'))
  }

  await (supabase as any).from('company_join_requests').insert({
    company_id: companyId,
    user_id: userId,
    message: req.body?.message ?? null,
    status: 'pending',
    created_at: new Date().toISOString(),
  }).catch(() => {})
  res.json({ success: true, data: { requested: true }, timestamp: new Date().toISOString() })
}))

// v1.4.20: Switch active company
router.post('/companies/switch', asyncHandler(async (req, res) => {
  const userId = req.user?.id
  const targetCompanyId = String(req.body?.companyId ?? '').trim()
  if (!userId || !targetCompanyId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing companyId or user' }, timestamp: new Date().toISOString() })
  }

  // Verify user is a member of the target company
  const { data: membership } = await (supabase as any)
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', userId)
    .eq('company_id', targetCompanyId)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '您不是该公司成员' }, timestamp: new Date().toISOString() })
  }

  await (supabase as any)
    .from('users')
    .update({ last_active_company_id: targetCompanyId })
    .eq('id', userId)

  res.json({ success: true, data: { switched: true, companyId: targetCompanyId, role: membership.role }, timestamp: new Date().toISOString() })
}))

// v1.4.20: Request to join a project
router.post('/projects/:projectId/join-request', asyncHandler(async (req, res) => {
  const projectId = String(req.params.projectId ?? '').trim()
  const userId = req.user?.id
  if (!userId || !projectId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing projectId or user' }, timestamp: new Date().toISOString() })
  }

  // Verify project exists and is company_visible
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('id, company_id, project_visibility')
    .eq('id', projectId)
    .maybeSingle()

  if (!project || project.project_visibility === 'private' || project.project_visibility === 'invite_only') {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '项目不可申请加入' }, timestamp: new Date().toISOString() })
  }

  const companyMembership = await getCurrentCompanyMembership(userId, project.company_id)
  if (!companyMembership) {
    return res.status(403).json(errorResponse('FORBIDDEN', 'User is not a member of the project company'))
  }

  await (supabase as any).from('project_join_requests').insert({
    project_id: projectId,
    company_id: project.company_id,
    user_id: userId,
    message: req.body?.message ?? req.body?.reason ?? null,
    status: 'pending',
    created_at: new Date().toISOString(),
  }).catch(() => {})

  res.json({ success: true, data: { requested: true }, timestamp: new Date().toISOString() })
}))

// v1.4.20: List project join requests (for project owner / company admin)
router.get('/projects/:projectId/join-requests', asyncHandler(async (req, res) => {
  const projectId = String(req.params.projectId ?? '').trim()
  const userId = req.user?.id
  if (!userId || !projectId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing projectId or user' }, timestamp: new Date().toISOString() })
  }

  if (!await requireProjectOwner(userId, projectId, getRequestCompanyId(req))) {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only project owners can view project join requests'))
  }

  const { data: requests } = await (supabase as any)
    .from('project_join_requests')
    .select('id, user_id, message, status, created_at')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .limit(50)

  res.json({ success: true, data: requests ?? [], timestamp: new Date().toISOString() })
}))

// v1.4.20: Approve/reject project join request
router.post('/projects/:projectId/join-requests/:requestId/:action(approve|reject)', asyncHandler(async (req, res) => {
  const projectId = String(req.params.projectId ?? '').trim()
  const requestId = String(req.params.requestId ?? '').trim()
  const action = req.params.action as 'approve' | 'reject'
  const userId = req.user?.id
  if (!userId || !projectId || !requestId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing parameters' }, timestamp: new Date().toISOString() })
  }

  if (!await requireProjectOwner(userId, projectId, getRequestCompanyId(req))) {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only project owners can process project join requests'))
  }

  const { data: joinReq } = await (supabase as any)
    .from('project_join_requests')
    .select('*')
    .eq('id', requestId)
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .maybeSingle()

  if (!joinReq) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '申请不存在或已处理' }, timestamp: new Date().toISOString() })
  }

  const now = new Date().toISOString()
  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  await (supabase as any)
    .from('project_join_requests')
    .update({ status: newStatus, reviewed_by: userId, reviewed_at: now, updated_at: now })
    .eq('id', requestId)
    .eq('project_id', projectId)
    .eq('status', 'pending')

  if (action === 'approve') {
    const requesterMembership = await getCurrentCompanyMembership(String(joinReq.user_id), String(joinReq.company_id))
    if (!requesterMembership) {
      return res.status(409).json(errorResponse('REQUESTER_NOT_IN_COMPANY', 'Requester is no longer an active company member'))
    }

    await (supabase as any).from('project_members').upsert({
      project_id: projectId,
      user_id: joinReq.user_id,
      permission_level: 'editor',
      is_active: true,
      joined_at: now,
    }, { onConflict: 'project_id,user_id' })
  }

  res.json({ success: true, data: { [action === 'approve' ? 'approved' : 'rejected']: true }, timestamp: now })
}))

// v1.4.20: Cancel own project join request
router.post('/projects/:projectId/join-requests/:requestId/cancel', asyncHandler(async (req, res) => {
  const projectId = String(req.params.projectId ?? '').trim()
  const requestId = String(req.params.requestId ?? '').trim()
  const userId = req.user?.id
  if (!userId || !projectId || !requestId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing parameters' }, timestamp: new Date().toISOString() })
  }

  await (supabase as any)
    .from('project_join_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'pending')

  res.json({ success: true, data: { cancelled: true }, timestamp: new Date().toISOString() })
}))

// v1.4.20: Create project direct invitation
router.post('/project-direct-invitations', asyncHandler(async (req, res) => {
  const userId = req.user?.id
  const { projectId, recipientUserId, permissionLevel } = req.body ?? {}
  if (!userId || !projectId || !recipientUserId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing required fields' }, timestamp: new Date().toISOString() })
  }

  // Verify project exists and get company_id
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('id, company_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '项目不存在' }, timestamp: new Date().toISOString() })
  }

  if (!await requireProjectOwner(userId, String(project.id), String(project.company_id))) {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only project owners can create project invitations'))
  }

  const recipientMembership = await getCurrentCompanyMembership(String(recipientUserId), String(project.company_id))
  if (!recipientMembership) {
    return res.status(400).json(errorResponse('RECIPIENT_NOT_IN_COMPANY', 'Recipient is not a member of the project company'))
  }

  const normalizedRole = normalizeProjectPermissionLevel(permissionLevel)
  if (normalizedRole !== 'editor') {
    return res.status(400).json(errorResponse('INVALID_ROLE', 'Project invitations only support the editor role'))
  }

  const { data: existing } = await (supabase as any)
    .from('project_direct_invitations')
    .select('id')
    .eq('project_id', projectId)
    .eq('company_id', project.company_id)
    .eq('recipient_user_id', recipientUserId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: '该用户已有待处理的邀请' }, timestamp: new Date().toISOString() })
  }

  const now = new Date().toISOString()
  const { data: invitation } = await (supabase as any)
    .from('project_direct_invitations')
    .insert({
      project_id: projectId,
      company_id: project.company_id,
      recipient_user_id: recipientUserId,
      invited_by: userId,
      role: normalizedRole,
      status: 'pending',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  res.json({ success: true, data: { id: invitation.id, created: true }, timestamp: now })
}))

// v1.4.20: Revoke project direct invitation
router.post('/project-direct-invitations/:id/revoke', asyncHandler(async (req, res) => {
  const invitationId = String(req.params.id ?? '').trim()
  const userId = req.user?.id
  if (!userId || !invitationId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing invitationId or user' }, timestamp: new Date().toISOString() })
  }

  const { data: invitation } = await (supabase as any)
    .from('project_direct_invitations')
    .select('id, project_id, company_id, invited_by')
    .eq('id', invitationId)
    .eq('status', 'pending')
    .maybeSingle()

  if (!invitation) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '邀请不存在或已处理' }, timestamp: new Date().toISOString() })
  }

  if (!await requireProjectOwner(userId, String(invitation.project_id), String(invitation.company_id))) {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only project owners can revoke project invitations'))
  }

  const revokeWrite = await (supabase as any)
    .from('project_direct_invitations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('project_id', invitation.project_id)
    .eq('company_id', invitation.company_id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (revokeWrite?.error) throw revokeWrite.error
  if (!revokeWrite?.data?.id) {
    return res.status(409).json(errorResponse('INVITATION_ALREADY_HANDLED', '邀请已被处理，请刷新后重试'))
  }

  res.json({ success: true, data: { revoked: true }, timestamp: new Date().toISOString() })
}))

// v1.4.20: List company join requests (for company_admin)
router.get('/company-join-requests', asyncHandler(async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing user' }, timestamp: new Date().toISOString() })
  }

  const membership = await getCurrentCompanyMembership(userId, getRequestCompanyId(req))
  const companyId = membership?.companyId ?? null
  if (!companyId) {
    return res.json({ success: true, data: [], timestamp: new Date().toISOString() })
  }
  if (membership?.role !== 'company_admin') {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only company admins can view company join requests'))
  }

  const { data: requests } = await (supabase as any)
    .from('company_join_requests')
    .select('id, user_id, message, status, created_at')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .limit(50)

  res.json({ success: true, data: requests ?? [], timestamp: new Date().toISOString() })
}))

// v1.4.20: Approve/reject company join request
router.post('/company-join-requests/:id/:action(approve|reject)', asyncHandler(async (req, res) => {
  const requestId = String(req.params.id ?? '').trim()
  const action = req.params.action as 'approve' | 'reject'
  const userId = req.user?.id
  if (!userId || !requestId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing parameters' }, timestamp: new Date().toISOString() })
  }

  const { data: joinReq } = await (supabase as any)
    .from('company_join_requests')
    .select('*')
    .eq('id', requestId)
    .eq('status', 'pending')
    .maybeSingle()

  if (!joinReq) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '申请不存在或已处理' }, timestamp: new Date().toISOString() })
  }

  if (!await requireCompanyAdmin(userId, String(joinReq.company_id))) {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only company admins can process company join requests'))
  }

  const now = new Date().toISOString()
  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  await (supabase as any)
    .from('company_join_requests')
    .update({ status: newStatus, reviewed_by: userId, reviewed_at: now, updated_at: now })
    .eq('id', requestId)
    .eq('company_id', joinReq.company_id)
    .eq('status', 'pending')

  if (action === 'approve') {
    await upsertActiveCompanyMember(String(joinReq.company_id), String(joinReq.user_id), now)
    // Set last_active_company_id for the approved user
    await (supabase as any)
      .from('users')
      .update({ last_active_company_id: joinReq.company_id })
      .eq('id', joinReq.user_id)
  }

  res.json({ success: true, data: { [action === 'approve' ? 'approved' : 'rejected']: true }, timestamp: now })
}))

// v1.4.20: Cancel own company join request
router.post('/company-join-requests/:id/cancel', asyncHandler(async (req, res) => {
  const requestId = String(req.params.id ?? '').trim()
  const userId = req.user?.id
  if (!userId || !requestId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Missing parameters' }, timestamp: new Date().toISOString() })
  }

  await (supabase as any)
    .from('company_join_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('user_id', userId)
    .eq('status', 'pending')

  res.json({ success: true, data: { cancelled: true }, timestamp: new Date().toISOString() })
}))

function readSessionRevocationReason(value: unknown) {
  return typeof value === 'string'
    ? value.trim().slice(0, 500) || null
    : null
}

function readRequestPath(req: any, fallback: string) {
  return typeof req.originalUrl === 'string' && req.originalUrl.length > 0
    ? req.originalUrl.split('?')[0]
    : fallback
}

function readUniqueUserIds(value: unknown) {
  const rawValues = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const userIds: string[] = []
  for (const rawValue of rawValues) {
    const userId = String(rawValue ?? '').trim()
    if (!userId || seen.has(userId)) continue
    seen.add(userId)
    userIds.push(userId)
    if (userIds.length >= 100) break
  }
  return userIds
}

router.post('/company-members/revoke-sessions', asyncHandler(async (req, res) => {
  const actorId = req.user?.id
  if (!actorId) {
    return res.status(400).json(errorResponse('INVALID', 'Missing user parameters'))
  }

  const targetUserIds = readUniqueUserIds(req.body?.userIds ?? req.body?.user_ids)
  if (targetUserIds.length === 0) {
    return res.status(400).json(errorResponse('INVALID_TARGET_USERS', 'At least one target user is required'))
  }

  if (targetUserIds.includes(actorId)) {
    return res.status(400).json(errorResponse('SELF_SESSION_REVOCATION_FORBIDDEN', 'Use the normal logout flow for your own session'))
  }

  const membership = await getCurrentCompanyMembership(actorId, getRequestCompanyId(req))
  const companyId = membership?.companyId ?? null
  if (!companyId || membership?.role !== 'company_admin') {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only company admins can revoke member sessions'))
  }

  const reason = readSessionRevocationReason(req.body?.reason)
  const requestPath = readRequestPath(req, '/api/workspace/company-members/revoke-sessions')

  const result = await rawQuery(
    `
      WITH requested AS (
        SELECT DISTINCT unnest($2::text[]) AS id
      ),
      revoked_member AS (
        UPDATE public.company_members cm
           SET session_revoked_at = NOW(),
               updated_at = NOW()
          FROM requested r
         WHERE cm.user_id = r.id
           AND cm.company_id = $1
           AND COALESCE(cm.status, 'active') = 'active'
         RETURNING cm.user_id AS id, cm.session_revoked_at
      ),
      audit AS (
        INSERT INTO public.operation_logs
          (user_id, action, method, path, resource_type, resource_id, detail)
        SELECT
          $3,
          'workspace.member_sessions_batch_revoked',
          'POST',
          $4,
          'company_member',
          revoked_member.id,
          jsonb_build_object(
            'companyId', $1,
            'targetUserId', revoked_member.id,
            'reason', $5,
            'scope', 'company',
            'sessionRevokedAt', revoked_member.session_revoked_at
          )
        FROM revoked_member
        RETURNING id
      )
      SELECT revoked_member.id, revoked_member.session_revoked_at
        FROM revoked_member
       ORDER BY revoked_member.id
    `,
    [companyId, targetUserIds, actorId, requestPath, reason],
  )

  const sessionRevokedAtByUser: Record<string, string> = {}
  const revokedUserIds = (result.rows ?? []).map((row: any) => {
    const userId = String(row.id)
    sessionRevokedAtByUser[userId] = new Date(row.session_revoked_at).toISOString()
    return userId
  })
  const revokedSet = new Set(revokedUserIds)
  const skippedUserIds = targetUserIds.filter((userId) => !revokedSet.has(userId))

  return res.json({
    success: true,
    data: {
      revoked: revokedUserIds.length > 0,
      revokedCount: revokedUserIds.length,
      revokedUserIds,
      skippedUserIds,
      sessionRevokedAtByUser,
    },
    timestamp: new Date().toISOString(),
  })
}))

router.post('/company-members/:userId/disable', asyncHandler(async (req, res) => {
  const actorId = req.user?.id
  const targetUserId = String(req.params.userId ?? '').trim()
  if (!actorId || !targetUserId) {
    return res.status(400).json(errorResponse('INVALID', 'Missing user parameters'))
  }

  if (actorId === targetUserId) {
    return res.status(400).json(errorResponse('SELF_DISABLE_FORBIDDEN', 'Company admins cannot disable themselves'))
  }

  const membership = await getCurrentCompanyMembership(actorId, getRequestCompanyId(req))
  const companyId = membership?.companyId ?? null
  if (!companyId || membership?.role !== 'company_admin') {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only company admins can disable company members'))
  }

  const reason = readSessionRevocationReason(req.body?.reason)
  const requestPath = readRequestPath(req, `/api/workspace/company-members/${targetUserId}/disable`)

  const result = await rawQuery(
    `
      WITH disabled_member AS (
        UPDATE public.company_members cm
           SET status = 'inactive',
               session_revoked_at = NOW(),
               updated_at = NOW()
         WHERE cm.company_id = $1
           AND cm.user_id = $2
           AND COALESCE(cm.status, 'active') = 'active'
         RETURNING cm.user_id
      ),
      updated_user AS (
        UPDATE public.users u
           SET last_active_company_id = CASE
                 WHEN u.last_active_company_id = $1 THEN NULL
                 ELSE u.last_active_company_id
               END
          FROM disabled_member dm
         WHERE u.id = dm.user_id
         RETURNING u.id
      ),
      audit AS (
        INSERT INTO public.operation_logs
          (user_id, action, method, path, resource_type, resource_id, detail)
        SELECT
          $3,
          'workspace.company_member_disabled',
          'POST',
          $4,
          'company_member',
          disabled_member.user_id,
          jsonb_build_object(
            'companyId', $1,
            'targetUserId', disabled_member.user_id,
            'reason', $5,
            'scope', 'company',
            'sessionRevokedAt', disabled_member.session_revoked_at
          )
        FROM disabled_member
        JOIN updated_user ON updated_user.id = disabled_member.user_id
        RETURNING id
      )
      SELECT disabled_member.user_id AS id, disabled_member.session_revoked_at
        FROM disabled_member
    `,
    [companyId, targetUserId, actorId, requestPath, reason],
  )

  const row = result.rows?.[0]
  if (!row) {
    return res.status(404).json(errorResponse('TARGET_MEMBER_NOT_FOUND', 'Target user is not an active member of this company'))
  }

  return res.json({
    success: true,
    data: {
      disabled: true,
      userId: row.id,
      sessionRevokedAt: new Date(row.session_revoked_at).toISOString(),
    },
    timestamp: new Date().toISOString(),
  })
}))

router.post('/company-members/:userId/revoke-sessions', asyncHandler(async (req, res) => {
  const actorId = req.user?.id
  const targetUserId = String(req.params.userId ?? '').trim()
  if (!actorId || !targetUserId) {
    return res.status(400).json(errorResponse('INVALID', 'Missing user parameters'))
  }

  if (actorId === targetUserId) {
    return res.status(400).json(errorResponse('SELF_SESSION_REVOCATION_FORBIDDEN', 'Use the normal logout flow for your own session'))
  }

  const membership = await getCurrentCompanyMembership(actorId, getRequestCompanyId(req))
  const companyId = membership?.companyId ?? null
  if (!companyId || membership?.role !== 'company_admin') {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only company admins can revoke member sessions'))
  }

  const reason = readSessionRevocationReason(req.body?.reason)
  const requestPath = readRequestPath(req, `/api/workspace/company-members/${targetUserId}/revoke-sessions`)

  const result = await rawQuery(
    `
      WITH revoked_member AS (
        UPDATE public.company_members cm
           SET session_revoked_at = NOW(),
               updated_at = NOW()
         WHERE cm.company_id = $1
           AND cm.user_id = $2
           AND COALESCE(cm.status, 'active') = 'active'
         RETURNING cm.user_id AS id, cm.session_revoked_at
      ),
      audit AS (
        INSERT INTO public.operation_logs
          (user_id, action, method, path, resource_type, resource_id, detail)
        SELECT
          $3,
          'workspace.member_sessions_revoked',
          'POST',
          $4,
          'company_member',
          revoked_member.id,
          jsonb_build_object(
            'companyId', $1,
            'targetUserId', revoked_member.id,
            'reason', $5,
            'scope', 'company',
            'sessionRevokedAt', revoked_member.session_revoked_at
          )
        FROM revoked_member
        RETURNING id
      )
      SELECT revoked_member.id, revoked_member.session_revoked_at
        FROM revoked_member
    `,
    [companyId, targetUserId, actorId, requestPath, reason],
  )

  const row = result.rows?.[0]
  if (!row) {
    return res.status(404).json(errorResponse('TARGET_MEMBER_NOT_FOUND', 'Target user is not an active member of this company'))
  }

  return res.json({
    success: true,
    data: {
      revoked: true,
      userId: row.id,
      sessionRevokedAt: new Date(row.session_revoked_at).toISOString(),
    },
    timestamp: new Date().toISOString(),
  })
}))

// v1.4.20: Create company (with optional first-project guide)
router.post('/companies', asyncHandler(async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '请先登录' }, timestamp: new Date().toISOString() })
  }

  const name = String(req.body?.name ?? '').trim()
  if (!name || name.length < 2) {
    return res.status(400).json({ success: false, error: { code: 'INVALID', message: '公司名称至少2个字符' }, timestamp: new Date().toISOString() })
  }

  const now = new Date().toISOString()
  const result = await rawQuery(
    `
      WITH created_company AS (
        INSERT INTO public.companies (
          name,
          status,
          discoverability,
          join_policy,
          is_active,
          created_at,
          updated_at
        )
        VALUES ($1, 'active', $3, $4, true, NOW(), NOW())
        RETURNING id, name
      ),
      created_member AS (
        INSERT INTO public.company_members (
          company_id,
          user_id,
          role,
          status,
          created_at,
          updated_at
        )
        SELECT id, $2, 'company_admin', 'active', NOW(), NOW()
          FROM created_company
        ON CONFLICT (company_id, user_id)
        DO UPDATE SET
          role = 'company_admin',
          status = 'active',
          updated_at = NOW()
        RETURNING company_id, role
      ),
      updated_user AS (
        UPDATE public.users
           SET last_active_company_id = (SELECT id FROM created_company)
         WHERE id = $2
        RETURNING id, last_active_company_id
      )
      SELECT cc.id AS company_id,
             cc.name AS company_name,
             cm.role AS member_role
        FROM created_company cc
        JOIN created_member cm
          ON cm.company_id = cc.id
        JOIN updated_user uu
          ON uu.last_active_company_id = cc.id
    `,
    [
      name,
      userId,
      normalizeCompanyDiscoverability(req.body?.discoverability),
      normalizeCompanyJoinPolicy(req.body?.join_policy),
    ],
  )

  const company = result.rows?.[0]
  if (!company) {
    return res.status(500).json(errorResponse('COMPANY_CREATE_FAILED', '公司创建未完成，请稍后重试'))
  }

  res.json({
    success: true,
    data: {
      id: company.company_id,
      name: company.company_name,
      role: company.member_role ?? 'company_admin',
      nextStep: 'create_first_project',
    },
    timestamp: now,
  })
}))

export default router
