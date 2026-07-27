import http from 'node:http'

const port = Number(process.env.PORT || 3192)
const companyId = 'company-v14221'
const projectId = 'project-v14221'
const now = new Date().toISOString()

const user = {
  id: 'user-v14221',
  username: 'v14221',
  display_name: 'v1.4.22.1 verifier',
  email: 'v14221@example.com',
  role: 'owner',
  globalRole: 'company_admin',
  currentCompanyId: companyId,
  metadata: {},
}

const project = {
  id: projectId,
  name: 'v1.4.22.1 manual browser project',
  description: 'Manual browser verification fixture',
  status: 'active',
  metadata: {
    wizard_payload_snapshot: {
      step: 6,
      mode: 'new',
      businessType: 'hospital',
      methodVariantCodes: ['cast_in_situ'],
      detailLevel: 'standard',
    },
  },
  created_at: now,
  updated_at: now,
}

const templates = [
  {
    id: 'tmpl-hospital-standard',
    name: 'Hospital standard template',
    description: 'Reusable hospital starter template',
    business_type: 'hospital',
    business_subtype: null,
    default_detail_level: 'standard',
    usage_count: 7,
    is_default: true,
    updated_at: now,
    snapshot: {
      step: 1,
      mode: 'new',
      businessType: 'hospital',
      methodVariantCodes: ['cast_in_situ'],
      detailLevel: 'standard',
      projectFeatures: { has_or: 6 },
    },
  },
]

const drafts = [
  {
    id: 'draft-v14221',
    name: 'Draft hospital project',
    status: 'wizard_drafting',
    wizard_draft_payload: {
      step: 3,
      mode: 'starting_line',
      projectName: 'Draft hospital project',
      location: 'Tianjin',
      totalAreaM2: 120000,
      businessType: 'hospital',
      methodVariantCodes: ['cast_in_situ'],
      detailLevel: 'standard',
    },
    draft_step: 3,
    draft_updated_at: now,
    updated_at: now,
  },
]

const tasks = Array.from({ length: 20 }, (_, index) => ({
  id: `task-${index + 1}`,
  project_id: projectId,
  title: index === 0 ? 'Manual task 001' : `Manual task ${String(index + 1).padStart(3, '0')}`,
  status: index < 6 ? 'in_progress' : 'todo',
  priority: index < 3 ? 'high' : 'medium',
  progress: index < 6 ? 40 : 0,
  start_date: '2026-05-01',
  end_date: '2026-05-10',
  planned_start_date: '2026-05-01',
  planned_end_date: '2026-05-10',
  assignee_name: 'Verifier',
  participant_unit_name: 'General contractor',
  wbs_code: `1.${index + 1}`,
  wbs_node_type: 'task',
  sort_order: index,
  building_object_id: index < 10 ? 'building-1' : null,
  floor_object_id: null,
  zone_object_id: null,
  created_at: now,
  updated_at: now,
}))

const engineeringObjects = [
  {
    id: 'phase-1',
    project_id: projectId,
    object_type: 'phase',
    object_code: 'P1',
    object_name: 'Phase 1',
    parent_id: null,
    path: 'Phase 1',
    level: 1,
    sort_order: 1,
    status: 'active',
    metadata: {},
  },
  {
    id: 'section-1',
    project_id: projectId,
    object_type: 'section',
    object_code: 'S1',
    object_name: 'Section A',
    parent_id: 'phase-1',
    path: 'Phase 1/Section A',
    level: 2,
    sort_order: 1,
    status: 'active',
    metadata: {},
  },
  {
    id: 'building-1',
    project_id: projectId,
    object_type: 'building',
    object_code: 'B1',
    object_name: 'Building 1',
    parent_id: 'section-1',
    path: 'Phase 1/Section A/Building 1',
    level: 3,
    sort_order: 1,
    status: 'active',
    metadata: { functionalUsage: 'Hospital' },
  },
  {
    id: 'floor-1',
    project_id: projectId,
    object_type: 'floor',
    object_code: 'F1',
    object_name: 'L1',
    parent_id: 'building-1',
    path: 'Phase 1/Section A/Building 1/L1',
    level: 4,
    sort_order: 1,
    status: 'active',
    metadata: { floorOrder: 1 },
  },
  {
    id: 'zone-1',
    project_id: projectId,
    object_type: 'zone',
    object_code: 'Z1',
    object_name: 'Clean zone',
    parent_id: 'floor-1',
    path: 'Phase 1/Section A/Building 1/L1/Clean zone',
    level: 5,
    sort_order: 1,
    status: 'active',
    metadata: { functionalCategory: 'clean' },
  },
]

const engineeringObjectTypeConfig = {
  phase: { prefix: 'P', label: '分期' },
  section: { prefix: 'S', label: '标段' },
  building: { prefix: 'B', label: '单体' },
  floor: { prefix: 'F', label: '楼层' },
  zone: { prefix: 'Z', label: '区域' },
}

function normalizeRootParentId(parentId) {
  return parentId === undefined || parentId === null || parentId === '' || parentId === '__root__'
    ? null
    : String(parentId)
}

function findEngineeringObject(id) {
  return engineeringObjects.find((item) => item.id === id)
}

function buildEngineeringObjectPath(object) {
  const parent = object.parent_id ? findEngineeringObject(object.parent_id) : null
  const parentPath = parent?.path ? `${parent.path}/` : ''
  return `${parentPath}${object.object_name}`
}

function buildEngineeringObjectLevel(parentId) {
  const parent = parentId ? findEngineeringObject(parentId) : null
  return parent ? Number(parent.level ?? 0) + 1 : 1
}

function nextEngineeringObjectCode(type) {
  const config = engineeringObjectTypeConfig[type]
  const count = engineeringObjects.filter((item) => item.object_type === type).length + 1
  return `${config.prefix}${count}`
}

function rebuildDescendantEngineeringObjectPaths(parentId) {
  for (const object of engineeringObjects.filter((item) => item.parent_id === parentId)) {
    object.level = buildEngineeringObjectLevel(object.parent_id)
    object.path = buildEngineeringObjectPath(object)
    rebuildDescendantEngineeringObjectPaths(object.id)
  }
}

function validateEngineeringObjectPayload(body) {
  const objectType = body?.objectType ?? body?.object_type
  const objectName = body?.objectName ?? body?.object_name
  if (!body?.projectId && !body?.project_id) return 'projectId is required'
  if (!engineeringObjectTypeConfig[objectType]) return '工程对象类型必须是分期、标段、单体、楼层或区域'
  if (!String(objectName ?? '').trim()) return 'objectName is required'
  return null
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function result(data) {
  return { success: true, data }
}

function wizardResult(body, projectIdOverride = 'wizard-project-v14221') {
  const detailLevel = body?.wizardPayload?.detailLevel ?? body?.detailLevel ?? 'standard'
  const generatedRowCount = detailLevel === 'overview' ? 150 : detailLevel === 'detailed' ? 1800 : 500
  return {
    id: projectIdOverride,
    projectId: projectIdOverride,
    status: body?.commit === false ? 'wizard_drafting' : 'active',
    generation: body?.commit === false ? null : {
      generationBatchId: `batch-${detailLevel}`,
      generatedRowCount,
      createdTaskCount: generatedRowCount,
      passedMilestoneCount: body?.wizardPayload?.onboardingPassedMilestones?.length ?? 0,
    },
  }
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function dashboardSummary() {
  return {
    id: projectId,
    name: project.name,
    status: 'active',
    statusLabel: 'in_progress',
    totalTasks: 20,
    leafTaskCount: 20,
    completedTaskCount: 4,
    inProgressTaskCount: 6,
    delayedTaskCount: 0,
    overdueTaskCount: 0,
    laggedTaskCount: 0,
    delayDays: 0,
    delayCount: 0,
    overallProgress: 35,
    taskProgress: 35,
    totalMilestones: 5,
    completedMilestones: 1,
    milestoneProgress: 20,
    riskCount: 0,
    activeRiskCount: 0,
    activeIssueCount: 0,
    pendingConditionCount: 0,
    pendingConditionTaskCount: 0,
    activeObstacleCount: 0,
    activeObstacleTaskCount: 0,
    preMilestoneCount: 0,
    completedPreMilestoneCount: 0,
    activePreMilestoneCount: 0,
    overduePreMilestoneCount: 0,
    acceptancePlanCount: 0,
    passedAcceptancePlanCount: 0,
    inProgressAcceptancePlanCount: 0,
    failedAcceptancePlanCount: 0,
    constructionDrawingCount: 0,
    issuedConstructionDrawingCount: 0,
    reviewingConstructionDrawingCount: 0,
    healthScore: 88,
    healthStatus: 'healthy',
    plannedEndDate: '2026-12-30',
    daysUntilPlannedEnd: 220,
    nextMilestone: null,
    milestoneOverview: { total: 0, completed: 0, overdue: 0, upcoming: 0 },
    planningGovernance: { governancePhase: 'formal_execution', hasActiveGovernanceSignal: false },
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) return sendJson(res, { success: false, error: 'missing url' }, 400)
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  const path = url.pathname
  const method = req.method?.toUpperCase() ?? 'GET'
  const body = method === 'GET' || method === 'HEAD' ? null : await readBody(req)

  if (method === 'OPTIONS') return sendJson(res, result({ ok: true }))
  if (path === '/api/livez') return sendJson(res, result({ status: 'live' }))
  if (path === '/api/readyz') return sendJson(res, result({ status: 'ready' }))
  if (path === '/api/auth/me') return sendJson(res, { success: true, authenticated: true, user })
  if (path === '/api/workspace') {
    return sendJson(res, result({
      hasCompany: true,
      currentCompany: { id: companyId, name: 'Verification Company', role: 'company_admin', isCurrent: true },
      myProjects: [project],
    }))
  }
  if (path === '/api/projects') return sendJson(res, result([project]))
  if (path === `/api/projects/${projectId}` || path === '/api/projects/wizard-project-v14221') return sendJson(res, result(project))
  if (path === `/api/projects/${projectId}/bootstrap` || path === '/api/projects/wizard-project-v14221/bootstrap') {
    return sendJson(res, result({ project, tasks, conditions: [], obstacles: [], baselines: [] }))
  }
  if (path === `/api/companies/${companyId}/project-templates` || path === '/api/companies/default/project-templates') {
    if (method === 'POST') return sendJson(res, result({ ...templates[0], id: 'tmpl-created', name: body?.name ?? 'Saved template' }), 201)
    return sendJson(res, result(templates))
  }
  if (path.startsWith(`/api/companies/${companyId}/project-templates/`) || path.startsWith('/api/companies/default/project-templates/')) {
    return sendJson(res, result({ ok: true }))
  }
  if (path === `/api/companies/${companyId}/project-drafts`) return sendJson(res, result(drafts))
  if (path === '/api/projects/wizard') return sendJson(res, result(wizardResult(body, body?.projectId ?? 'wizard-project-v14221')), body?.projectId ? 200 : 201)
  if (path === `/api/projects/${projectId}/wizard/draft` || path === '/api/projects/wizard-project-v14221/wizard/draft') {
    return sendJson(res, result({ id: projectId, lastSaved: now, step: body?.step ?? 1 }))
  }
  if (path === `/api/projects/${projectId}/wizard/preview` || path === '/api/projects/wizard/preview') {
    const detailLevel = body?.detailLevel ?? body?.wizardPayload?.detailLevel ?? 'standard'
    return sendJson(res, result({ detailLevel, generatedRowCount: detailLevel === 'overview' ? 150 : detailLevel === 'detailed' ? 1800 : 500 }))
  }
  if (path === `/api/projects/${projectId}/wizard/rollback`) return sendJson(res, result({ id: projectId, rolledBack: true }))
  if (path === '/api/projects/import/excel' || path === '/api/projects/wizard/import') {
    return sendJson(res, result({
      projectId: body?.projectId ?? null,
      fileType: body?.fileType ?? 'xlsx',
      totalRows: body?.rows?.length ?? 1,
      validRows: body?.rows?.length ?? 1,
      invalidRows: [],
      unmappedColumns: ['business type', 'building'],
      warnings: ['Please complete business type, method, and project features in the wizard.'],
      nextStep: 'wizard_required',
    }))
  }
  if (path === '/api/milestone-presets') {
    return sendJson(res, result([
      { code: 'foundation_acceptance', label: 'Foundation acceptance', required: true },
      { code: 'main_structure_acceptance', label: 'Main structure acceptance', required: true },
      { code: 'energy_acceptance', label: 'Energy acceptance', required: false },
    ]))
  }
  if (path === `/api/projects/${projectId}/reconcile/preview`) {
    return sendJson(res, result({
      reconcileBatchId: 'reconcile-batch-v14221',
      entries: [
        { taskId: 'task-1', title: 'Manual task 001', phase: 'rename_suggest', suggestedTitle: 'Standard structure task', reason: 'Similar task found' },
        { taskId: 'task-101', title: 'Recommended new task', phase: 'add', reason: 'Recommended package item' },
        { taskId: 'task-2', title: 'Manual task 002', phase: 'match', reason: 'Matched' },
        { taskId: 'task-3', title: 'Manual task 003', phase: 'orphan', reason: 'Keep manual task' },
      ],
    }))
  }
  if (path === `/api/projects/${projectId}/reconcile/apply`) return sendJson(res, result({ backupId: 'backup-v14221', applied: body?.acceptedEntries?.length ?? 0 }))
  if (path === `/api/projects/${projectId}/reconcile/reconcile-batch-v14221/rollback`) return sendJson(res, result({ backedUpAt: now, message: 'rollback ready' }))
  if (path === '/api/admin/custom-business-types') return sendJson(res, result([{ name: 'Care complex', parent_type: 'general_civil', usage_count: 3 }]))
  if (path.startsWith('/api/admin/custom-business-types/') && path.endsWith('/promote')) return sendJson(res, result({ promoted: true }))
  if (path === '/api/system/example-projects') return sendJson(res, result([{ id: 'example-1', name: 'System hospital sample', business_type: 'hospital', total_area: 120000, location: 'Tianjin', description: 'Example project' }]))
  if (path === '/api/tasks') return sendJson(res, result(tasks))
  if (path === '/api/tasks/bulk-scope') return sendJson(res, result({ updated: body?.taskIds?.length ?? 0 }))
  if (path === '/api/engineering-objects') {
    if (method === 'POST') {
      const validationMessage = validateEngineeringObjectPayload(body)
      if (validationMessage) return sendJson(res, { success: false, error: validationMessage }, 400)

      const objectType = body.objectType ?? body.object_type
      const objectName = String(body.objectName ?? body.object_name).trim()
      const parentId = normalizeRootParentId(body.parentId ?? body.parent_id)
      if (parentId && !findEngineeringObject(parentId)) {
        return sendJson(res, { success: false, error: 'parentId not found' }, 400)
      }

      const created = {
        id: `${objectType}-${Date.now()}-${engineeringObjects.length + 1}`,
        project_id: body.projectId ?? body.project_id,
        object_type: objectType,
        object_code: nextEngineeringObjectCode(objectType),
        object_name: objectName,
        parent_id: parentId,
        path: objectName,
        level: buildEngineeringObjectLevel(parentId),
        sort_order: Number(body.sortOrder ?? body.sort_order ?? engineeringObjects.length + 1),
        status: 'active',
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      }
      created.path = buildEngineeringObjectPath(created)
      engineeringObjects.push(created)
      return sendJson(res, result(created), 201)
    }

    const type = url.searchParams.get('type') ?? url.searchParams.get('objectType')
    const parentIdParam = url.searchParams.get('parentId')
    const status = url.searchParams.get('status') ?? 'active'
    const parentId = parentIdParam === null ? undefined : normalizeRootParentId(parentIdParam)
    const filtered = engineeringObjects.filter((item) => {
      if (type && item.object_type !== type) return false
      if (parentId !== undefined && normalizeRootParentId(item.parent_id) !== parentId) return false
      if (status !== 'all' && item.status !== status) return false
      return true
    })
    return sendJson(res, result(filtered))
  }
  if (path === '/api/engineering-objects/bootstrap') return sendJson(res, result(engineeringObjects))
  if (path.startsWith('/api/engineering-objects/')) {
    const objectId = decodeURIComponent(path.replace('/api/engineering-objects/', ''))
    const target = findEngineeringObject(objectId)
    if (!target) return sendJson(res, { success: false, error: 'engineering object not found' }, 404)

    if (method === 'PATCH') {
      if (body?.objectName !== undefined || body?.object_name !== undefined) {
        target.object_name = String(body.objectName ?? body.object_name).trim()
      }
      if (body?.parentId !== undefined || body?.parent_id !== undefined) {
        target.parent_id = normalizeRootParentId(body.parentId ?? body.parent_id)
      }
      if (body?.sortOrder !== undefined || body?.sort_order !== undefined) {
        target.sort_order = Number(body.sortOrder ?? body.sort_order ?? target.sort_order)
      }
      if (body?.status !== undefined) target.status = body.status
      if (body?.metadata && typeof body.metadata === 'object') target.metadata = body.metadata
      target.level = buildEngineeringObjectLevel(target.parent_id)
      target.path = buildEngineeringObjectPath(target)
      rebuildDescendantEngineeringObjectPaths(target.id)
      return sendJson(res, result(target))
    }

    if (method === 'DELETE') {
      const index = engineeringObjects.findIndex((item) => item.id === objectId)
      engineeringObjects.splice(index, 1)
      return sendJson(res, result({ deleted: true, id: objectId }))
    }

    return sendJson(res, result(target))
  }
  if (path === '/api/dashboard/project-summary') return sendJson(res, result(dashboardSummary()))
  if (path === '/api/dashboard/projects-summary') return sendJson(res, result([dashboardSummary()]))
  if (path === '/api/dashboard/company-summary') {
    return sendJson(res, result({
      projectCount: 1,
      statusCounts: { total: 1, inProgress: 1, completed: 0, paused: 0, notStarted: 0 },
      averageHealth: 88,
      averageProgress: 35,
      attentionProjectCount: 0,
      lowHealthProjectCount: 0,
      overdueMilestoneProjectCount: 0,
      healthHistory: { thisMonth: 88, lastMonth: 86, change: 2, thisMonthPeriod: '2026-05', lastMonthPeriod: '2026-04', periods: [] },
      ranking: [dashboardSummary()],
    }))
  }
  if (
    path === '/api/task-conditions'
    || path === '/api/task-obstacles'
    || path === '/api/warnings'
    || path === '/api/issues'
    || path === '/api/risks'
    || path === '/api/task-baselines'
    || path === '/api/change-logs'
    || path === '/api/tasks/progress-snapshots'
    || path === '/api/data-quality/project-summary'
    || path === '/api/data-quality/live-check'
    || path.includes('/task-summary/trend')
    || path.includes('/fulfillment-trend')
    || path.includes('/weekly-digest')
    || path.includes('/dashboard/today-progress')
  ) {
    return sendJson(res, result([]))
  }
  if (path === `/api/members/${projectId}` || path === '/api/members/wizard-project-v14221') {
    return sendJson(res, { success: true, members: [{ userId: user.id, displayName: user.display_name, permissionLevel: 'owner' }] })
  }
  if (path.includes('/critical-path')) {
    return sendJson(res, result({
      projectId,
      autoTaskIds: [],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: [],
      edges: [],
      tasks: [],
      projectDurationDays: 0,
      calculatedAt: now,
    }))
  }
  if (path === '/api/planning/field-registry') return sendJson(res, result({ registryVersion: 'v14221-manual', fields: [], groups: [] }))

  return sendJson(res, result([]))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`v1.4.22.1 manual mock API listening at http://127.0.0.1:${port}`)
})
