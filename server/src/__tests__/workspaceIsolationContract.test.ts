import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd().endsWith('server') ? resolve(process.cwd(), '..') : process.cwd()

function readWorkspaceRoute() {
  return readFileSync(resolve(root, 'server/src/routes/workspace.ts'), 'utf8')
}

function readFollowupMigration() {
  return readFileSync(resolve(root, 'server/migrations/144_v1420_multi_company_isolation_followups.sql'), 'utf8')
}

function readDurationMigration() {
  return readFileSync(resolve(root, 'server/migrations/140_v1418_duration_experience_tables.sql'), 'utf8')
}

function readNotificationsRoute() {
  return readFileSync(resolve(root, 'server/src/routes/notifications.ts'), 'utf8')
}

function readTodoTouchpointService() {
  return readFileSync(resolve(root, 'server/src/services/todoTouchpointService.ts'), 'utf8')
}

function readWbsTemplateGovernanceRoute() {
  return readFileSync(resolve(root, 'server/src/routes/wbs-template-governance.ts'), 'utf8')
}

function readWbsTemplatesRoute() {
  return readFileSync(resolve(root, 'server/src/routes/wbs-templates.ts'), 'utf8')
}

function readWbsRoute() {
  return readFileSync(resolve(root, 'server/src/routes/wbs.ts'), 'utf8')
}

function readProjectsRoute() {
  return readFileSync(resolve(root, 'server/src/routes/projects.ts'), 'utf8')
}

function readMembersRoute() {
  return readFileSync(resolve(root, 'server/src/routes/members.ts'), 'utf8')
}

function readInvitationsRoute() {
  return readFileSync(resolve(root, 'server/src/routes/invitations.ts'), 'utf8')
}

function readInvitationAcceptanceService() {
  return readFileSync(resolve(root, 'server/src/services/invitationAcceptanceService.ts'), 'utf8')
}

function readDurationSuggestionsRoute() {
  return readFileSync(resolve(root, 'server/src/routes/duration-suggestions.ts'), 'utf8')
}

function readDurationSuggestionService() {
  return readFileSync(resolve(root, 'server/src/services/durationSuggestionService.ts'), 'utf8')
}

function readTaskDurationForecastService() {
  return readFileSync(resolve(root, 'server/src/services/taskDurationForecastService.ts'), 'utf8')
}

function readTaskObstaclesRoute() {
  return readFileSync(resolve(root, 'server/src/routes/task-obstacles.ts'), 'utf8')
}

function readTasksRoute() {
  return readFileSync(resolve(root, 'server/src/routes/tasks.ts'), 'utf8')
}

function readTaskSummariesRoute() {
  return readFileSync(resolve(root, 'server/src/routes/task-summaries.ts'), 'utf8')
}

function readMaterialReportsService() {
  return readFileSync(resolve(root, 'server/src/services/materialReportsService.ts'), 'utf8')
}

function readAccessHelpers() {
  return readFileSync(resolve(root, 'server/src/auth/access.ts'), 'utf8')
}

function readRealtimeServer() {
  return readFileSync(resolve(root, 'server/src/services/realtimeServer.ts'), 'utf8')
}

function readApiClient() {
  return readFileSync(resolve(root, 'client/src/lib/apiClient.ts'), 'utf8')
}

function readApp() {
  return readFileSync(resolve(root, 'client/src/App.tsx'), 'utf8')
}

function readNotificationStore() {
  return readFileSync(resolve(root, 'server/src/services/notificationStore.ts'), 'utf8')
}

describe('v1.4.20 workspace multi-company isolation contract', () => {
  it('scopes workspace project and invitation reads by current company', () => {
    const source = readWorkspaceRoute()

    expect(source).toContain('getCurrentCompanyMembership(userId, requestedCompanyId)')
    expect(source).toContain(".eq('company_id', currentCompanyId)")
    expect(source).toContain("currentCompany: currentCompany ? { id: currentCompany.id")
  })

  it('guards project join request management with project owner permission', () => {
    const source = readWorkspaceRoute()

    expect(source).toContain('Only project owners can view project join requests')
    expect(source).toContain('Only project owners can process project join requests')
    expect(source).toContain(".select('id, user_id, message, status, created_at')")
    expect(source).not.toContain('requester_id')
    expect(source).not.toContain('decided_by')
  })

  it('guards direct project invitations with project ownership and company membership', () => {
    const source = readWorkspaceRoute()

    expect(source).toContain('Only project owners can create project invitations')
    expect(source).toContain('RECIPIENT_NOT_IN_COMPANY')
    expect(source).toContain('role: normalizedRole')
    expect(source).toContain('Only project owners can revoke project invitations')
    expect(source).toContain("errorResponse('INVITATION_ALREADY_HANDLED', '邀请已被处理，请刷新后重试')")
    expect(source).toContain('async function upsertActiveCompanyMember')
    expect(source).toContain('async function upsertActiveProjectMember')
  })

  it('accepts direct invitations through one locked transaction without downgrading company roles', () => {
    const source = readWorkspaceRoute()
    const service = readInvitationAcceptanceService()

    const acceptStart = source.indexOf("router.post('/invitations/:invitationId/accept'")
    const acceptEnd = source.indexOf("router.post('/invitations/:invitationId/decline'", acceptStart)
    const acceptRoute = source.slice(acceptStart, acceptEnd)
    expect(acceptRoute).toContain('await acceptDirectProjectInvitation({ invitationId, userId })')
    expect(acceptRoute).not.toContain('upsertActiveCompanyMember')
    expect(service).toContain("await client.query('BEGIN')")
    expect(service).toContain('FOR UPDATE OF inv')
    expect(service).toContain('INSERT INTO public.company_members')
    expect(service).toContain("DO UPDATE SET status = 'active', updated_at = NOW()")
    expect(service).not.toMatch(/DO UPDATE SET[\s\S]{0,100}role\s*=/)
    expect(service).toContain('UPDATE public.project_direct_invitations')
    expect(service).toContain("await client.query('COMMIT')")
  })

  it('keeps direct invitation project membership write independent from missing unique constraints', () => {
    const source = readWorkspaceRoute()
    const helperStart = source.indexOf('async function upsertActiveProjectMember')
    const helperEnd = source.indexOf('async function loadWorkspaceOverviewFast', helperStart)
    const projectMemberWriter = source.slice(helperStart, helperEnd)

    expect(projectMemberWriter).toContain(".from('project_members')")
    expect(projectMemberWriter).toContain(".select('id')")
    expect(projectMemberWriter).toContain('.update({')
    expect(projectMemberWriter).toContain('.insert({')
    expect(projectMemberWriter).toContain('permission_level: permissionLevel')
    expect(projectMemberWriter).not.toContain('.upsert(')
    expect(projectMemberWriter).not.toContain('onConflict')
  })

  it('guards company join requests with company admin permission', () => {
    const source = readWorkspaceRoute()

    expect(source).toContain('Only company admins can view company join requests')
    expect(source).toContain('Only company admins can process company join requests')
    expect(source).toContain('reviewed_by: userId')
    expect(source).toContain('reviewed_at: now')
  })

  it('adds company boundary columns for workspace request tables', () => {
    const migration = readFollowupMigration()

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS discoverability')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS join_policy')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS is_active')
    expect(migration).toContain("WHEN status = 'inactive' THEN false")
    expect(migration).toContain('ALTER TABLE project_direct_invitations')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS company_id')
    expect(migration).toContain('ALTER TABLE project_join_requests')
    expect(migration).toContain('idx_project_direct_invite_company')
    expect(migration).toContain('idx_project_join_requests_company')
  })

  it('scopes notification attention summaries to accessible project or current company', () => {
    const route = readNotificationsRoute()
    const service = readTodoTouchpointService()

    expect(route).toContain("if (projectId && userId && !await canAccessProject")
    expect(route).toContain('getCurrentCompanyMembership(userId, getRequestCompanyId(req))')
    expect(service).toContain('.eq(\'company_id\', companyId)')
    expect(service).toContain('.or(`user_id.eq.${userId},is_broadcast.eq.true`)')
  })

  it('requires company membership before exposing company-scoped WBS templates', () => {
    const governance = readWbsTemplateGovernanceRoute()
    const templates = readWbsTemplatesRoute()
    const wbs = readWbsRoute()

    expect(governance).toContain('getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))')
    expect(governance).toContain('membership?.companyId')
    expect(templates).toContain('getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))')
    expect(templates).toContain('currentCompanyId: String(membership?.companyId ?? \'\').trim()')
    expect(templates).toContain('WHERE project_id IS NULL AND company_id IS NULL AND catalog_scope')
    expect(templates).toContain('WHERE project_id IS NULL AND company_id IS NULL AND is_builtin')
    expect(templates).toContain('WHERE project_id IS NULL AND company_id IS NULL AND standard_catalog_code IS NOT NULL')
    expect(templates).toContain('WHERE project_id IS NULL AND company_id = ?')
    expect(templates).toContain('companyId: membership?.companyId ?? null')
    expect(templates).toContain('company_id: companyId')
    expect(templates).toContain('INSERT INTO wbs_templates (id, company_id, project_id')
    expect(templates).not.toContain('INSERT INTO wbs_templates (id, project_id')
    expect(wbs).toContain('getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))')
    expect(wbs).toContain('membership?.companyId')
    expect(wbs).toContain('WHERE project_id IS NULL AND company_id IS NULL AND catalog_scope')
    expect(wbs).toContain('WHERE project_id IS NULL AND company_id IS NULL AND is_builtin')
    expect(wbs).toContain('WHERE project_id IS NULL AND company_id IS NULL AND standard_catalog_code IS NOT NULL')
    expect(wbs).toContain('WHERE project_id IS NULL AND company_id = ?')
    expect(wbs).toContain('getProjectCompanyId(projectId)')
    expect(wbs).toContain('INSERT INTO wbs_templates (id, company_id, project_id')
  })

  it('forces project creation and project membership changes through current company membership', () => {
    const projects = readProjectsRoute()
    const members = readMembersRoute()
    const invitations = readInvitationsRoute()

    expect(projects).toContain('resolveProjectCreationCompanyId(req.user!.id, getRequestCompanyId(req))')
    expect(projects).toContain('getCurrentCompanyMembership(userId, requestedCompanyId)')
    expect(members).toContain('ensureTargetUserInProjectCompany(projectId, targetUser.id)')
    expect(members).toContain('目标用户需先加入当前公司空间')
    expect(invitations).toContain('acceptProjectInvitationCode({ code, userId })')
    expect(readInvitationAcceptanceService()).toContain('resolveCompanyId(invitation)')
    expect(invitations).toContain('company_id: projectCompanyId')
  })

  it('requires project users to belong to the project company before project-level access is granted', () => {
    const access = readAccessHelpers()

    expect(access).toContain('const projectCompanyId = await getProjectCompanyId(projectId)')
    expect(access).toContain('const belongsToProjectCompany = await isActiveCompanyMember(userId, projectCompanyId)')
    expect(access).toContain('if (belongsToProjectCompany === false)')
  })

  it('does not expose hidden or invitation-only companies through company search or join requests', () => {
    const workspace = readWorkspaceRoute()

    expect(workspace).toContain(".in('discoverability', ['public', 'searchable'])")
    expect(workspace).toContain("company.discoverability === 'hidden' || company.join_policy === 'invite_only'")
    expect(workspace).toContain('REQUESTER_NOT_IN_COMPANY')
    expect(workspace).toContain('function normalizeCompanyDiscoverability')
    expect(workspace).toContain('function normalizeCompanyJoinPolicy')
  })

  it('adds company boundary to legacy project invitation codes', () => {
    const migration = readFollowupMigration()

    expect(migration).toContain('ALTER TABLE project_invitations')
    expect(migration).toContain('idx_project_invitations_company')
  })

  it('guards duration suggestions and forecast refreshes by project membership', () => {
    const source = readDurationSuggestionsRoute()

    expect(source).toContain('async function ensureCanReadProject')
    expect(source).toContain('async function ensureCanReadTasks')
    expect(source).toContain("projectId && !await ensureCanReadProject(req, projectId)")
    expect(source).toContain('const visibleProjectIds = await ensureCanReadTasks(req, taskIds)')
    expect(source).toContain('if (!visibleProjectIds)')
  })

  it('keeps duration experience benchmarks and forecasts within company or project scope', () => {
    const migration = readDurationMigration()
    const suggestions = readDurationSuggestionService()
    const forecasts = readTaskDurationForecastService()

    expect(migration).toContain('company_id UUID REFERENCES companies(id) ON DELETE CASCADE')
    expect(migration).toContain('uq_duration_benchmark_current_company')
    expect(migration).toContain('uq_duration_benchmark_current_global')
    expect(migration).toContain('uq_duration_override_active_project')
    expect(migration).toContain('uq_duration_override_active_company')
    expect(migration).toContain('uq_duration_override_active_global')
    expect(migration).toContain('project_id UUID REFERENCES projects(id) ON DELETE CASCADE')
    expect(suggestions).toContain('getProjectCompanyId')
    expect(suggestions).toContain('findDurationOverride')
    expect(suggestions).toContain(".eq('project_id', input.projectId)")
    expect(suggestions).toContain(".eq('company_id', companyId)")
    expect(suggestions).toContain(".is('company_id', null)")
    expect(suggestions).toContain('isTemplateUsableForContext')
    expect(forecasts).toContain('project_id: task?.project_id ?? null')
  })

  it('filters realtime project subscriptions through authenticated project access', () => {
    const source = readRealtimeServer()
    const client = readFileSync(resolve(root, 'client/src/hooks/useRealtimeConnection.ts'), 'utf8')
    const urlBuilder = readFileSync(resolve(root, 'client/src/lib/realtime.ts'), 'utf8')

    expect(source).toContain('async function filterAuthorizedProjectIds')
    expect(source).toContain('await getProjectPermissionLevel(userId, projectId, companyId)')
    expect(source).toContain('await refreshClientProjectSubscription(client)')
    expect(source).toContain('userId: client.subscription.userId ?? null')
    expect(source).toContain('if (!client.subscription.projectIds.has(projectId)) return')
    expect(source).toContain('if (event.companyId && subscription.companyId !== event.companyId)')
    expect(source).toContain('if (event.projectId && !subscription.projectIds.has(event.projectId))')
    expect(client).toContain('currentCompanyId?: string | null')
    expect(client).toContain('companyId,')
    expect(urlBuilder).toContain('companyId?: string | null')
    expect(urlBuilder).toContain("url.searchParams.set('companyId', options.companyId)")
  })

  it('keeps project list caches company-scoped on server and client', () => {
    const projects = readProjectsRoute()
    const apiClient = readApiClient()
    const app = readApp()

    expect(projects).toContain('projectListCacheByCompany')
    expect(projects).toContain('WHERE company_id = ?')
    expect(projects).toContain("`company:${normalizedCompanyId}`")
    expect(existsSync(resolve(root, 'client/src/lib/projectPersistence.ts'))).toBe(false)
    expect(apiClient).toContain('clearApiClientRuntimeCache()')
    expect(apiClient).toContain('COMPANY_CONTEXT_CHANGED_EVENT')
    expect(app).toContain("`user:${user.id}:company:${user.currentCompanyId ?? 'no-company'}`")
  })

  it('scopes realtime notification mutations by company when available', () => {
    const source = readNotificationStore()

    expect(source).toContain('groupNotificationIdsByScope')
    expect(source).toContain('companyId,')
    expect(source).toContain('company_id: current.company_id ?? null')
    expect(source).toContain('company_id: row.company_id ?? null')
  })

  it('does not enable direct client Supabase storage or realtime unless explicitly in legacy mode', () => {
    expect(existsSync(resolve(root, 'client/src/lib/realtimeService.ts'))).toBe(false)
    expect(existsSync(resolve(root, 'client/src/lib/storageService.ts'))).toBe(false)
  })

  it('authenticates task obstacle reads before project permission checks', () => {
    const source = readTaskObstaclesRoute()

    expect(source).toContain('router.use(authenticate)')
    expect(source).toContain('router.get')
    expect(source).toContain('requireProjectMember')
  })

  it('does not resolve participant unit names across project boundaries', () => {
    const tasks = readTasksRoute()
    const summaries = readTaskSummariesRoute()
    const materials = readMaterialReportsService()

    expect(tasks).toContain('SELECT id, unit_name FROM participant_units WHERE id = ? AND project_id = ?')
    expect(tasks).toContain('`${String(row.id)}:${normalizeUnitLabel(row.project_id)}`')
    expect(tasks).toContain('participantUnitNameMap.get(`${task.participant_unit_id}:${taskProjectId}`)')
    expect(summaries).toContain(".eq('project_id', projectId)")
    expect(materials).toContain('FROM participant_units')
    expect(materials).toContain('WHERE project_id = $1')
    expect(materials).toContain('[projectId, participantUnitIds]')
  })
})
