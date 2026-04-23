import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = join(__dirname, '..')
const outputDir = join(repoRoot, '.tmp', 'full-app-test-env')

function loadEnv(filePath) {
  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

loadEnv(join(repoRoot, 'server', '.env'))

const WEB_BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const FIXTURE_DATE = '20260419'
const FIXTURE_PASSWORD = 'StrongPass123!'

const SERVICE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SERVICE_URL || !SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
}

const supabase = createClient(SERVICE_URL, SERVICE_KEY)

const ACCOUNTS = {
  admin: {
    username: `fullapp_admin_${FIXTURE_DATE}`,
    displayName: '全应用测试-公司管理员',
    email: `fullapp_admin_${FIXTURE_DATE}@example.com`,
    globalRole: 'company_admin',
  },
  owner: {
    username: `fullapp_owner_${FIXTURE_DATE}`,
    displayName: '全应用测试-项目负责人',
    email: `fullapp_owner_${FIXTURE_DATE}@example.com`,
    globalRole: 'regular',
  },
  editor: {
    username: `fullapp_editor_${FIXTURE_DATE}`,
    displayName: '全应用测试-编辑成员',
    email: `fullapp_editor_${FIXTURE_DATE}@example.com`,
    globalRole: 'regular',
  },
  viewer: {
    username: `fullapp_viewer_${FIXTURE_DATE}`,
    displayName: '全应用测试-只读成员',
    email: `fullapp_viewer_${FIXTURE_DATE}@example.com`,
    globalRole: 'regular',
  },
}

const PROJECTS = {
  empty: {
    name: `FULLAPP-EMPTY-${FIXTURE_DATE}`,
    description: '全应用测试空项目样本',
    status: '未开始',
  },
  standard: {
    name: `FULLAPP-STANDARD-${FIXTURE_DATE}`,
    description: '全应用测试标准项目样本',
    status: '进行中',
  },
  large: {
    name: `FULLAPP-LARGE-${FIXTURE_DATE}`,
    description: '全应用测试大项目样本（1000+任务）',
    status: '进行中',
  },
}

function log(step, details = '') {
  const suffix = details ? ` ${details}` : ''
  console.log(`[prepare-full-app-test-env] ${step}${suffix}`)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true })
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { response, json }
}

function authHeaders(token, body) {
  return {
    Authorization: `Bearer ${token}`,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  }
}

function unwrapApiData(json) {
  if (!json) return null
  if (json.success === false) {
    throw new Error(json.error?.message || json.message || 'API request failed')
  }
  return json.data ?? json
}

async function apiRequest(pathname, { method = 'GET', token, body, allowFailure = false } = {}) {
  const { response, json } = await fetchJson(`${API_BASE}${pathname}`, {
    method,
    headers: token ? authHeaders(token, body) : body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!allowFailure && (!response.ok || json?.success === false)) {
    throw new Error(
      json?.error?.message
      || json?.message
      || `API ${method} ${pathname} failed with ${response.status}`,
    )
  }

  return { response, json, data: response.ok ? unwrapApiData(json) : null }
}

async function ensureHealth() {
  const [{ response: web }, { response: api }] = await Promise.all([
    fetchJson(WEB_BASE),
    fetchJson(`${API_BASE}/api/health`),
  ])

  assert(web.ok, `Frontend unavailable: ${WEB_BASE}`)
  assert(api.ok, `Backend unavailable: ${API_BASE}/api/health`)
}

async function login(username, password) {
  const { response, data } = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username, password },
    allowFailure: true,
  })

  if (!response.ok || !data?.token || !data?.user) {
    return null
  }

  return {
    token: data.token,
    user: data.user,
  }
}

async function register(account) {
  const { data } = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      username: account.username,
      password: FIXTURE_PASSWORD,
      display_name: account.displayName,
      email: account.email,
    },
  })

  return {
    token: data.token,
    user: data.user,
  }
}

async function ensureAccount(account) {
  const existing = await login(account.username, FIXTURE_PASSWORD)
  if (existing) return existing

  const created = await register(account)
  assert(created?.token, `Failed to register ${account.username}`)
  return created
}

async function setGlobalRole(userId, globalRole) {
  const { error } = await supabase
    .from('users')
    .update({ global_role: globalRole })
    .eq('id', userId)

  if (error) {
    throw error
  }
}

async function getProjectByName(name) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('name', name)
    .limit(1)

  if (error) {
    throw error
  }

  return data?.[0] ?? null
}

async function ensureProject(ownerToken, projectSpec) {
  const existing = await getProjectByName(projectSpec.name)
  if (existing) return existing

  const { data } = await apiRequest('/api/projects', {
    method: 'POST',
    token: ownerToken,
    body: {
      name: projectSpec.name,
      description: projectSpec.description,
      status: projectSpec.status,
    },
  })

  return data
}

async function ensureParticipantUnit(projectId, unitName, unitType = '分包') {
  const { data, error } = await supabase
    .from('participant_units')
    .select('id, unit_name, unit_type')
    .eq('project_id', projectId)
    .eq('unit_name', unitName)
    .limit(1)

  if (error) throw error
  if (data?.[0]) return data[0]

  const insertResult = await supabase
    .from('participant_units')
    .insert({
      id: randomUUID(),
      project_id: projectId,
      unit_name: unitName,
      unit_type: unitType,
    })
    .select('id, unit_name, unit_type')
    .single()

  if (insertResult.error || !insertResult.data) {
    throw insertResult.error || new Error(`Failed to create participant unit ${unitName}`)
  }

  return insertResult.data
}

async function ensureMember(projectId, session, permissionLevel, ownerToken) {
  const existingMember = await supabase
    .from('project_members')
    .select('id, permission_level, is_active')
    .eq('project_id', projectId)
    .eq('user_id', session.user.id)
    .limit(1)
    .maybeSingle()

  if (existingMember.error) {
    throw existingMember.error
  }

  if (existingMember.data?.permission_level === permissionLevel && existingMember.data?.is_active !== false) {
    return
  }

  const invitation = await apiRequest('/api/invitations', {
    method: 'POST',
    token: ownerToken,
    body: {
      project_id: projectId,
      permission_level: permissionLevel,
      max_uses: 1,
    },
  })

  const code = invitation.data?.invitationCode
  assert(code, `Failed to create ${permissionLevel} invitation`)

  await apiRequest(`/api/invitations/accept/${code}`, {
    method: 'POST',
    token: session.token,
  })
}

async function createTask(ownerToken, projectId, input) {
  const { data } = await apiRequest('/api/tasks', {
    method: 'POST',
    token: ownerToken,
    body: {
      project_id: projectId,
      title: input.title,
      status: input.status,
      progress: input.progress,
      priority: input.priority ?? 'medium',
      start_date: input.startDate,
      end_date: input.endDate,
      planned_start_date: input.startDate,
      planned_end_date: input.endDate,
      assignee_name: input.assigneeName ?? null,
      assignee_unit: input.assigneeUnit ?? null,
      specialty_type: input.specialtyType ?? null,
      participant_unit_id: input.participantUnitId ?? null,
      is_milestone: input.isMilestone ?? false,
      milestone_level: input.milestoneLevel ?? null,
      is_critical: input.isCritical ?? false,
    },
  })

  return data
}

async function ensureStandardTasks(ownerToken, projectId, participantUnitId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, planned_start_date, planned_end_date')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) throw error
  if ((data?.length ?? 0) >= 8) return data

  const seedTasks = [
    { title: '总平面方案确认', status: 'completed', progress: 100, startDate: '2026-04-01', endDate: '2026-04-05', assigneeName: '标准项目负责人', specialtyType: '设计', isCritical: true },
    { title: '地下室结构施工', status: 'in_progress', progress: 55, startDate: '2026-04-06', endDate: '2026-04-28', assigneeUnit: '土建分包', specialtyType: '土建', participantUnitId, isCritical: true },
    { title: '机电深化出图', status: 'in_progress', progress: 35, startDate: '2026-04-10', endDate: '2026-05-02', assigneeUnit: '机电分包', specialtyType: '机电', participantUnitId },
    { title: '钢筋材料进场', status: 'todo', progress: 0, startDate: '2026-04-22', endDate: '2026-04-24', assigneeUnit: '机电分包', specialtyType: '材料', participantUnitId },
    { title: '主体结构封顶', status: 'todo', progress: 0, startDate: '2026-05-03', endDate: '2026-06-15', assigneeName: '标准项目负责人', specialtyType: '土建', isMilestone: true, milestoneLevel: 1, isCritical: true },
    { title: '幕墙样板确认', status: 'todo', progress: 0, startDate: '2026-05-10', endDate: '2026-05-18', assigneeUnit: '幕墙分包', specialtyType: '幕墙' },
    { title: '精装样板间施工', status: 'todo', progress: 0, startDate: '2026-05-20', endDate: '2026-06-08', assigneeUnit: '精装分包', specialtyType: '装饰' },
    { title: '专项验收准备', status: 'todo', progress: 0, startDate: '2026-06-01', endDate: '2026-06-20', assigneeName: '标准项目负责人', specialtyType: '验收' },
  ]

  const created = []
  for (const task of seedTasks) {
    created.push(await createTask(ownerToken, projectId, task))
  }
  return created
}

async function ensureStandardRisks(projectId) {
  const existing = await supabase
    .from('risks')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)

  if (existing.error) throw existing.error
  if ((existing.data?.length ?? 0) > 0) return

  const rows = [
    {
      id: randomUUID(),
      project_id: projectId,
      title: '标准项目-材料供应风险',
      description: '用于全应用测试的标准项目风险样本',
      level: 'high',
      status: 'identified',
      probability: 60,
      impact: 70,
      mitigation: '提前锁定供应商',
    },
    {
      id: randomUUID(),
      project_id: projectId,
      title: '标准项目-机电协调风险',
      description: '用于全应用测试的标准项目风险样本',
      level: 'medium',
      status: 'monitoring',
      probability: 45,
      impact: 55,
      mitigation: '组织周例会复盘',
    },
  ]

  const { error } = await supabase.from('risks').insert(rows)
  if (error) throw error
}

async function ensureStandardMaterials(ownerToken, projectId, participantUnitId) {
  const existing = await supabase
    .from('project_materials')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)

  if (existing.error) throw existing.error
  if ((existing.data?.length ?? 0) > 0) return

  await apiRequest(`/api/projects/${projectId}/materials`, {
    method: 'POST',
    token: ownerToken,
    body: {
      participant_unit_id: participantUnitId,
      material_name: '标准项目-机电桥架',
      specialty_type: '机电',
      requires_sample_confirmation: true,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-26',
      actual_arrival_date: null,
      requires_inspection: true,
      inspection_done: false,
    },
  })

  await apiRequest(`/api/projects/${projectId}/materials`, {
    method: 'POST',
    token: ownerToken,
    body: {
      participant_unit_id: participantUnitId,
      material_name: '标准项目-钢筋',
      specialty_type: '土建',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-18',
      actual_arrival_date: null,
      requires_inspection: true,
      inspection_done: false,
    },
  })
}

async function ensureStandardObstacle(ownerToken, projectId, taskId) {
  const existing = await supabase
    .from('task_obstacles')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)

  if (existing.error) throw existing.error
  if ((existing.data?.length ?? 0) > 0) return

  await apiRequest('/api/task-obstacles', {
    method: 'POST',
    token: ownerToken,
    body: {
      project_id: projectId,
      task_id: taskId,
      title: '标准项目-材料未按期到场',
      severity: '高',
      obstacle_type: '材料',
    },
  })
}

async function ensureStandardAcceptance(ownerToken, projectId, taskId) {
  const existing = await supabase
    .from('acceptance_plans')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)

  if (existing.error) throw existing.error
  if ((existing.data?.length ?? 0) > 0) return

  await apiRequest('/api/acceptance-plans', {
    method: 'POST',
    token: ownerToken,
    body: {
      project_id: projectId,
      task_id: taskId,
      name: '标准项目-机电专项验收',
      acceptance_type: '专项验收',
      planned_date: '2026-06-18',
      status: 'draft',
      scope_level: 'specialty',
      type_name: '专项验收',
      phase: '施工验收',
    },
  })
}

async function ensureBaselineAndMonthly(ownerToken, projectId, tasks) {
  const obstacleSnapshot = await supabase
    .from('task_obstacles')
    .select('id, status')
    .eq('project_id', projectId)

  if (obstacleSnapshot.error) throw obstacleSnapshot.error

  const activeObstacles = (obstacleSnapshot.data ?? []).filter((row) => {
    const status = String(row.status ?? '').trim().toLowerCase()
    return status && !['resolved', 'closed', '已解决'].includes(status)
  })

  if (activeObstacles.length > 0) {
    for (const obstacle of activeObstacles) {
      const { error } = await supabase
        .from('task_obstacles')
        .update({ status: '已解决' })
        .eq('id', obstacle.id)

      if (error) throw error
    }
  }

  try {
  const baselineExisting = await supabase
    .from('task_baselines')
    .select('id, version, status')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  if (baselineExisting.error) throw baselineExisting.error
  let baseline = baselineExisting.data?.[0] ?? null

  if (!baseline) {
    const created = await apiRequest('/api/task-baselines', {
      method: 'POST',
      token: ownerToken,
      body: {
        project_id: projectId,
        title: '标准项目测试基线 V1',
        items: tasks.map((task, index) => ({
          source_task_id: task.id,
          title: task.title,
          planned_start_date: task.planned_start_date ?? task.start_date,
          planned_end_date: task.planned_end_date ?? task.end_date,
          sort_order: index,
          mapping_status: 'mapped',
          is_critical: Boolean(task.is_critical),
          is_baseline_critical: Boolean(task.is_critical),
        })),
      },
    })
    baseline = created.data
  }

  if (baseline?.status === 'draft') {
    await apiRequest(`/api/task-baselines/${baseline.id}/confirm`, {
      method: 'POST',
      token: ownerToken,
      body: { version: baseline.version },
    })
  }

  const month = new Date().toISOString().slice(0, 7)
  const monthlyExisting = await supabase
    .from('monthly_plans')
    .select('id, version, status, month')
    .eq('project_id', projectId)
    .eq('month', month)
    .order('version', { ascending: false })
    .limit(1)

  if (monthlyExisting.error) throw monthlyExisting.error
  let monthly = monthlyExisting.data?.[0] ?? null

  if (!monthly) {
    const created = await apiRequest('/api/monthly-plans', {
      method: 'POST',
      token: ownerToken,
      body: {
        project_id: projectId,
        month,
        title: `${month} 标准项目月计划`,
      },
    })
    monthly = created.data
  }

  if (monthly?.status === 'draft') {
    await apiRequest(`/api/monthly-plans/${monthly.id}/confirm`, {
      method: 'POST',
      token: ownerToken,
      body: {
        version: monthly.version,
        month,
      },
      allowFailure: true,
    })
  }
  } finally {
    if (activeObstacles.length > 0) {
      for (const obstacle of activeObstacles) {
        const { error } = await supabase
          .from('task_obstacles')
          .update({ status: obstacle.status })
          .eq('id', obstacle.id)

        if (error) throw error
      }
    }
  }
}

async function ensureLargeProjectData(projectId, ownerUserId) {
  const taskCountResult = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (taskCountResult.error) throw taskCountResult.error
  const currentCount = taskCountResult.count ?? 0
  if (currentCount >= 1000) return currentCount

  const targetCount = 1200
  const rows = []
  for (let index = currentCount; index < targetCount; index += 1) {
    const offset = index % 120
    const startDay = 1 + offset
    const endDay = startDay + 5 + (index % 7)
    const overdue = index % 25 === 0
    const completed = index % 17 === 0
    const progress = completed ? 100 : overdue ? 70 : index % 5 === 0 ? 45 : 0
    rows.push({
      id: randomUUID(),
      project_id: projectId,
      title: `大项目任务 ${String(index + 1).padStart(4, '0')}`,
      description: '全应用测试大项目任务样本',
      status: completed ? 'completed' : progress > 0 ? 'in_progress' : 'todo',
      priority: index % 9 === 0 ? 'high' : 'medium',
      progress,
      planned_start_date: `2026-03-${String(Math.min(startDay, 28)).padStart(2, '0')}`,
      planned_end_date: `2026-07-${String(Math.min(endDay, 28)).padStart(2, '0')}`,
      start_date: `2026-03-${String(Math.min(startDay, 28)).padStart(2, '0')}`,
      end_date: overdue ? `2026-04-${String(Math.min(startDay, 28)).padStart(2, '0')}` : `2026-07-${String(Math.min(endDay, 28)).padStart(2, '0')}`,
      is_milestone: false,
      is_critical: index % 20 === 0,
      specialty_type: ['土建', '机电', '装饰', '幕墙'][index % 4],
      assignee_name: ['大项目负责人', '工程一部', '工程二部'][index % 3],
      created_by: ownerUserId,
      sort_order: index,
      wbs_level: (index % 5) + 1,
      wbs_code: `L${(index % 5) + 1}-${index + 1}`,
    })
  }

  while (rows.length > 0) {
    const batch = rows.splice(0, 200)
    const { error } = await supabase.from('tasks').insert(batch)
    if (error) throw error
  }

  const riskExisting = await supabase
    .from('risks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (riskExisting.error) throw riskExisting.error
  if ((riskExisting.count ?? 0) === 0) {
    const risks = Array.from({ length: 12 }, (_, index) => ({
      id: randomUUID(),
      project_id: projectId,
      title: `大项目风险 ${index + 1}`,
      description: '全应用测试大项目风险样本',
      level: index < 3 ? 'high' : 'medium',
      status: index % 2 === 0 ? 'identified' : 'monitoring',
      probability: 40 + (index % 4) * 10,
      impact: 50 + (index % 5) * 10,
      mitigation: '持续跟踪',
    }))
    const { error } = await supabase.from('risks').insert(risks)
    if (error) throw error
  }

  return targetCount
}

async function runApiSmoke() {
  const commandUrl = `${API_BASE}/api/health`
  const { response } = await fetchJson(commandUrl)
  assert(response.ok, 'API smoke failed after preparing environment')
}

async function main() {
  await ensureDir(outputDir)
  await ensureHealth()

  log('accounts', 'ensuring login users')
  const adminSession = await ensureAccount(ACCOUNTS.admin)
  const ownerSession = await ensureAccount(ACCOUNTS.owner)
  const editorSession = await ensureAccount(ACCOUNTS.editor)
  const viewerSession = await ensureAccount(ACCOUNTS.viewer)

  await setGlobalRole(adminSession.user.id, ACCOUNTS.admin.globalRole)
  await setGlobalRole(ownerSession.user.id, ACCOUNTS.owner.globalRole)
  await setGlobalRole(editorSession.user.id, ACCOUNTS.editor.globalRole)
  await setGlobalRole(viewerSession.user.id, ACCOUNTS.viewer.globalRole)

  log('projects', 'ensuring empty / standard / large fixtures')
  const emptyProject = await ensureProject(ownerSession.token, PROJECTS.empty)
  const standardProject = await ensureProject(ownerSession.token, PROJECTS.standard)
  const largeProject = await ensureProject(ownerSession.token, PROJECTS.large)

  await ensureMember(standardProject.id, editorSession, 'editor', ownerSession.token)
  await ensureMember(standardProject.id, viewerSession, 'viewer', ownerSession.token)
  await ensureMember(largeProject.id, editorSession, 'editor', ownerSession.token)
  await ensureMember(largeProject.id, viewerSession, 'viewer', ownerSession.token)

  log('standard', 'seeding standard project feature data')
  const participantUnit = await ensureParticipantUnit(standardProject.id, '全应用测试-机电分包')
  const standardTasks = await ensureStandardTasks(ownerSession.token, standardProject.id, participantUnit.id)
  await ensureStandardRisks(standardProject.id)
  await ensureStandardMaterials(ownerSession.token, standardProject.id, participantUnit.id)
  await ensureStandardObstacle(ownerSession.token, standardProject.id, standardTasks[1]?.id ?? standardTasks[0]?.id)
  await ensureStandardAcceptance(ownerSession.token, standardProject.id, standardTasks[0]?.id)
  await ensureBaselineAndMonthly(ownerSession.token, standardProject.id, standardTasks)

  log('large', 'seeding 1000+ task fixture')
  const largeTaskCount = await ensureLargeProjectData(largeProject.id, ownerSession.user.id)

  await runApiSmoke()

  const manifest = {
    preparedAt: new Date().toISOString(),
    baseUrl: WEB_BASE,
    apiBaseUrl: API_BASE,
    accounts: {
      companyAdmin: {
        username: ACCOUNTS.admin.username,
        password: FIXTURE_PASSWORD,
        globalRole: 'company_admin',
      },
      owner: {
        username: ACCOUNTS.owner.username,
        password: FIXTURE_PASSWORD,
        projectRole: 'owner',
      },
      editor: {
        username: ACCOUNTS.editor.username,
        password: FIXTURE_PASSWORD,
        projectRole: 'editor',
      },
      viewer: {
        username: ACCOUNTS.viewer.username,
        password: FIXTURE_PASSWORD,
        projectRole: 'viewer',
      },
    },
    projects: {
      empty: {
        id: emptyProject.id,
        name: emptyProject.name,
      },
      standard: {
        id: standardProject.id,
        name: standardProject.name,
      },
      large: {
        id: largeProject.id,
        name: largeProject.name,
        taskCount: largeTaskCount,
      },
    },
    notes: [
      'standard 项目已补 owner/editor/viewer 三类成员',
      'standard 项目已包含任务、风险、材料、阻碍、验收、基线、月计划样本',
      'large 项目已补 1000+ 任务，用于性能与列表极限验证',
    ],
  }

  const manifestPath = join(outputDir, 'manifest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  log('done', manifestPath)
}

main().catch((error) => {
  console.error('[prepare-full-app-test-env] failed', error)
  process.exitCode = 1
})
