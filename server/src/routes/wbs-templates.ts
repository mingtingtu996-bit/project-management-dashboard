// WBS模板 API 路由

import { Router } from 'express'
import { executeSQL, executeSQLOne, supabase } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { WBSTemplate } from '../types/db.js'
import { ValidationService } from '../services/validationService.js'
import {
  PlanningBootstrapService,
  buildBaselineItemsFromTemplateNodes,
  type PlanningBootstrapNode,
} from '../services/planningBootstrap.js'
import { buildSuggestedWbsTemplate } from '../services/wbsTemplatePresets.js'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(authenticate)
const planningBootstrapService = new PlanningBootstrapService()
const WBS_TEMPLATE_FIELDS = [
  'id',
  'template_name',
  'template_type',
  'description',
  'wbs_nodes',
  'is_default',
  'is_construction_default',
  'is_public',
  'is_builtin',
  'category',
  'tags',
  'node_count',
  'reference_days',
  'usage_count',
  'deleted_at',
  'created_by',
  'created_at',
  'updated_at',
].join(', ')
const WBS_TEMPLATE_SELECT = `SELECT ${WBS_TEMPLATE_FIELDS} FROM wbs_templates`
const PROJECT_BOOTSTRAP_FIELDS = [
  'id',
  'name',
  'status',
  'project_type',
  'building_type',
  'planned_start_date',
  'start_date',
  'actual_start_date',
  'current_phase',
  'default_wbs_generated',
].join(', ')
const PROJECT_BOOTSTRAP_SELECT = `SELECT ${PROJECT_BOOTSTRAP_FIELDS} FROM projects`
const BOOTSTRAP_TASK_FIELDS = [
  'id',
  'parent_id',
  'title',
  'description',
  'reference_duration',
  'ai_duration',
  'is_milestone',
  'template_id',
  'template_node_id',
].join(', ')
const BOOTSTRAP_MILESTONE_FIELDS = [
  'id',
  'title',
  'description',
].join(', ')
const TASK_BASELINE_DRAFT_FIELDS = [
  'id',
  'project_id',
  'version',
  'status',
  'title',
  'description',
  'source_type',
  'source_version_label',
  'created_at',
  'updated_at',
].join(', ')

// multer 内存存储（不写磁盘，解析完即丢弃）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv']
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('仅支持 .xlsx / .xls / .csv 格式'))
  },
})

// 字段映射：将数据库字段名转换为前端期望的字段名
function mapTemplateFields(row: any) {
  const isActive = row.deleted_at === null || row.deleted_at === undefined
  // is_construction_default 是数据库里实际存在的列，is_default 可能不存在
  const rawIsDefault = row.is_default ?? row.is_construction_default ?? false
  const isDraft = rawIsDefault === true || rawIsDefault === 1
  // B3: 派生 status 三态（永远基于 is_default/deleted_at，不依赖数据库 status 列）
  const status: 'draft' | 'published' | 'disabled' = !isActive ? 'disabled' : (isDraft ? 'draft' : 'published')
  // Supabase 返回的 wbs_nodes 可能是字符串，需要解析
  let wbsNodes = row.wbs_nodes || row.template_data
  if (typeof wbsNodes === 'string') {
    try { wbsNodes = JSON.parse(wbsNodes) } catch { wbsNodes = [] }
  }
  // 计算 node_count（节点总数，含子节点）
  const nodeCount = row.node_count ?? countNodes(wbsNodes)
  return {
    ...row,
    name: row.template_name || row.name,
    template_data: wbsNodes,
    wbs_nodes: wbsNodes,
    usage_count: row.usage_count ?? 0,
    is_public: row.is_public ?? true,
    is_builtin: row.is_builtin ?? false,
    is_active: isActive,
    is_default: isDraft,
    category: row.category ?? null,
    tags: row.tags ?? [],
    node_count: nodeCount,
    reference_days: row.reference_days ?? null,
    status,
  }
}

// 递归计算 WBS 节点总数（含 children 子节点）
function countNodes(nodes: any[]): number {
  if (!Array.isArray(nodes)) return 0
  let count = nodes.length
  for (const n of nodes) {
    if (n.children && Array.isArray(n.children)) {
      count += countNodes(n.children)
    }
  }
  return count
}

function parsePlanningNodes(raw: any, templateId?: string | null): PlanningBootstrapNode[] {
  const source = raw?.wbs_nodes ?? raw?.template_data ?? raw?.nodes ?? raw ?? []
  if (typeof source === 'string') {
    try {
      return parsePlanningNodes(JSON.parse(source), templateId)
    } catch {
      return []
    }
  }

  if (!Array.isArray(source)) return []

  return source.map((node: any) => ({
    title: String(node.title ?? node.name ?? '未命名节点'),
    description: node.description ?? null,
    reference_days: node.reference_days ?? node.duration ?? null,
    is_milestone: Boolean(node.is_milestone),
    source_id: node.source_id ?? node.id ?? null,
    template_id: templateId ?? node.template_id ?? null,
    template_node_id: node.template_node_id ?? node.id ?? null,
    children: parsePlanningNodes(node.children ?? [], templateId),
  }))
}

function countPlanningNodes(nodes: PlanningBootstrapNode[]): number {
  let total = 0
  for (const node of nodes) {
    total += 1
    if (Array.isArray(node.children) && node.children.length > 0) {
      total += countPlanningNodes(node.children)
    }
  }
  return total
}

async function getProjectBootstrapBundle(projectId: string) {
  const [project, tasksResponse, milestonesResponse] = await Promise.all([
    executeSQLOne(`${PROJECT_BOOTSTRAP_SELECT} WHERE id = ? LIMIT 1`, [projectId]),
    supabase.from('tasks').select(BOOTSTRAP_TASK_FIELDS).eq('project_id', projectId),
    supabase.from('milestones').select(BOOTSTRAP_MILESTONE_FIELDS).eq('project_id', projectId),
  ])

  if (!project) {
    return null
  }

  if (tasksResponse.error) throw new Error(tasksResponse.error.message)
  if (milestonesResponse.error) throw new Error(milestonesResponse.error.message)

  const tasks = (tasksResponse.data ?? []) as any[]
  const milestones = (milestonesResponse.data ?? []) as any[]

  const context = planningBootstrapService.buildContext({
    project: project as any,
    tasks,
    milestones,
  })
  const nodes = planningBootstrapService.buildProjectNodes({
    project: project as any,
    tasks,
    milestones,
  })

  return {
    project: project as any,
    tasks,
    milestones,
    context,
    nodes,
  }
}

async function getLatestVersion(tableName: 'task_baselines', projectId: string) {
  const { data, error } = await supabase
    .from(tableName)
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)
  return Number((data?.[0] as any)?.version ?? 0)
}

async function insertBaselineDraft(params: {
  projectId: string
  title: string
  description?: string | null
  sourceType: 'manual' | 'current_schedule' | 'imported_file' | 'carryover'
  sourceVersionLabel?: string | null
  anchorDate?: string | null
  nodes: PlanningBootstrapNode[]
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const version = (await getLatestVersion('task_baselines', params.projectId)) + 1
    const baselineId = uuidv4()
    const now = new Date().toISOString()
    const { error: insertError } = await supabase.from('task_baselines').insert({
      id: baselineId,
      project_id: params.projectId,
      version,
      status: 'draft',
      title: params.title,
      description: params.description ?? null,
      source_type: params.sourceType,
      source_version_label: params.sourceVersionLabel ?? null,
      created_at: now,
      updated_at: now,
    })

    if (insertError) {
      if (insertError.code === '23505' && attempt < 2) continue
      throw new Error(insertError.message)
    }

    const items = buildBaselineItemsFromTemplateNodes(params.nodes, {
      projectId: params.projectId,
      baselineVersionId: baselineId,
      anchorDate: params.anchorDate,
    })
    if (items.length > 0) {
      const { error: itemError } = await supabase.from('task_baseline_items').insert(items)
      if (itemError) {
        await Promise.all([
          supabase.from('task_baseline_items').delete().eq('baseline_version_id', baselineId),
          supabase.from('task_baselines').delete().eq('id', baselineId),
        ])
        throw new Error(itemError.message)
      }
    }

    const { data } = await supabase.from('task_baselines').select(TASK_BASELINE_DRAFT_FIELDS).eq('id', baselineId).single()
    return {
      baseline: data ?? {
        id: baselineId,
        project_id: params.projectId,
        version,
        status: 'draft',
        title: params.title,
        description: params.description ?? null,
        source_type: params.sourceType,
        source_version_label: params.sourceVersionLabel ?? null,
        created_at: now,
        updated_at: now,
      },
      items,
    }
  }

  throw new Error('创建项目基线失败，请稍后重试')
}

async function insertTemplateDraft(params: {
  projectId: string
  createdBy?: string | null
  templateName: string
  templateType: string
  description?: string | null
  nodes: PlanningBootstrapNode[]
}) {
  const templateId = uuidv4()
  const now = new Date().toISOString()
  const payload = {
    id: templateId,
    template_name: params.templateName,
    template_type: params.templateType,
    description: params.description ?? null,
    wbs_nodes: params.nodes,
    is_default: 0,
    is_public: 1,
    is_builtin: 0,
    category: params.templateType,
    tags: ['计划编制', '冷启动'],
    node_count: countPlanningNodes(params.nodes),
    reference_days: null,
    created_by: params.createdBy ?? null,
    created_at: now,
    updated_at: now,
  }

  const { error } = await supabase.from('wbs_templates').insert(payload)
  if (error) throw new Error(error.message)

  const { data } = await supabase.from('wbs_templates').select(WBS_TEMPLATE_FIELDS).eq('id', templateId).single()
  return data ?? payload
}

// 获取所有WBS模板
router.get('/', asyncHandler(async (req, res) => {
  const templateType = req.query.type as string
  const statusFilter = req.query.status as string // 'draft' | 'published' | 'disabled' | undefined

  logger.info('Fetching WBS templates', { templateType, statusFilter })

  let sql = `${WBS_TEMPLATE_SELECT} WHERE 1=1`
  const params: any[] = []

  // 状态筛选：默认只返回未停用（deleted_at is null）的模板
  if (statusFilter === 'disabled') {
    sql += ' AND deleted_at IS NOT NULL'
  } else if (statusFilter === 'draft') {
    sql += ' AND deleted_at IS NULL AND is_default = 1'
  } else if (statusFilter === 'published') {
    sql += ' AND deleted_at IS NULL AND is_default = 0'
  } else {
    // 默认：只显示未停用（草稿 + 已发布）
    sql += ' AND deleted_at IS NULL'
  }

  if (templateType && templateType !== 'all') {
    sql += ' AND template_type = ?'
    params.push(templateType)
  }

  sql += ' ORDER BY created_at DESC'

  const data = await executeSQL(sql, params)

  const response: ApiResponse<WBSTemplate[]> = {
    success: true,
    data: (data || []).map(mapTemplateFields),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// AI智能生成WBS模板节点（规则引擎版，无需外部AI服务）
router.post('/generate-ai', asyncHandler(async (req, res) => {
  const { prompt } = req.body

  if (!prompt || typeof prompt !== 'string') {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: '请提供项目描述 (prompt)' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('AI generate WBS template', { prompt })
  const { suggestedName, suggestedType, nodes } = buildSuggestedWbsTemplate(prompt)

  const response: ApiResponse<{ nodes: any[]; suggestedName: string; suggestedType: string }> = {
    success: true,
    data: { nodes, suggestedName, suggestedType },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/bootstrap/context', asyncHandler(async (req, res) => {
  const projectId = String(req.query.project_id ?? req.query.projectId ?? '').trim()
  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'project_id 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const bundle = await getProjectBootstrapBundle(projectId)
  if (!bundle) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse = {
    success: true,
    data: {
      guide: bundle.context.guide,
      project_id: projectId,
      task_count: bundle.tasks.length,
      milestone_count: bundle.milestones.length,
      available_paths: [
        { key: 'template_to_baseline', label: 'WBS 模板 -> 项目基线' },
        { key: 'completed_project_to_template', label: '已完成项目 -> WBS 模板' },
        { key: 'ongoing_project_to_baseline', label: '在建项目 -> 初始化基线' },
      ],
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/bootstrap/from-template',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
  const projectId = String(req.body?.project_id ?? req.body?.projectId ?? '').trim()
  const templateId = String(req.body?.template_id ?? req.body?.templateId ?? '').trim()

  if (!projectId || !templateId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'project_id 和 template_id 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const [project, templateResult] = await Promise.all([
    executeSQLOne(`${PROJECT_BOOTSTRAP_SELECT} WHERE id = ? LIMIT 1`, [projectId]),
    supabase.from('wbs_templates').select(WBS_TEMPLATE_FIELDS).eq('id', templateId).limit(1),
  ])

  if (!project) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  if (templateResult.error) throw new Error(templateResult.error.message)
  const template = templateResult.data?.[0] as any
  if (!template) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND', message: 'WBS 模板不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const nodes = parsePlanningNodes(template, String(template.id ?? null) || null)
  const baseline = await insertBaselineDraft({
    projectId,
    title: `${String(project.name ?? '项目')} 项目基线`,
    description: '由 WBS 模板直接生成的项目基线。',
    sourceType: 'manual',
    sourceVersionLabel: String(template.template_name ?? template.name ?? 'WBS 模板'),
    anchorDate: String(
      project.planned_start_date
        ?? project.start_date
        ?? project.actual_start_date
        ?? '',
    ).trim() || null,
    nodes,
  })

  const response: ApiResponse = {
    success: true,
    data: {
      path: 'template_to_baseline',
      baseline: baseline.baseline,
      created_item_count: baseline.items.length,
      template_id: templateId,
      project_id: projectId,
    },
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

router.post('/bootstrap/from-completed-project',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
  const projectId = String(req.body?.project_id ?? req.body?.projectId ?? '').trim()
  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'project_id 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const bundle = await getProjectBootstrapBundle(projectId)
  if (!bundle) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const template = await insertTemplateDraft({
    projectId,
    createdBy: req.user?.id ?? null,
    templateName: `${String(bundle.project.name ?? '项目')} 沉淀模板`,
    templateType: String(bundle.project.project_type ?? bundle.project.building_type ?? '通用').trim() || '通用',
    description: '由已完成项目沉淀出来的模板，可直接复用到新项目。',
    nodes: bundle.nodes,
  })

  const response: ApiResponse = {
    success: true,
    data: {
      path: 'completed_project_to_template',
      template,
      project_id: projectId,
      node_count: countPlanningNodes(bundle.nodes),
    },
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

router.post('/bootstrap/from-ongoing-project',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
  const projectId = String(req.body?.project_id ?? req.body?.projectId ?? '').trim()
  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'project_id 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const bundle = await getProjectBootstrapBundle(projectId)
  if (!bundle) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const baseline = await insertBaselineDraft({
    projectId,
    title: `${String(bundle.project.name ?? '项目')} 项目基线`,
    description: '由在建项目当前执行现状自动补建的初始基线。',
    sourceType: 'current_schedule',
    sourceVersionLabel: String(bundle.project.status ?? '进行中'),
    nodes: bundle.nodes,
  })

  const response: ApiResponse = {
    success: true,
    data: {
      path: 'ongoing_project_to_baseline',
      baseline: baseline.baseline,
      created_item_count: baseline.items.length,
      project_id: projectId,
      needs_mapping_review: true,
    },
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// ── F9: JSON 导出 ────────────────────────────────────────────────────────────
router.get('/export-json', asyncHandler(async (req, res) => {
  const { ids } = req.query as { ids?: string }

  let query = `${WBS_TEMPLATE_SELECT} WHERE deleted_at IS NULL ORDER BY created_at DESC`
  const params: string[] = []

  if (ids) {
    const idArr = ids.split(',').map((s: string) => s.trim()).filter(Boolean)
    if (idArr.length > 0) {
      query = `${WBS_TEMPLATE_SELECT} WHERE deleted_at IS NULL AND id IN (?) ORDER BY created_at DESC`
      params.push(idArr.join(','))
    }
  }

  const templates = await executeSQL<WBSTemplate[]>(query, params)

  const result = (templates as any[]).map((t) => {
    const mapped = mapTemplateFields(t)
    const rawNodes = mapped.wbs_nodes || mapped.template_data || []
    const nodes = (Array.isArray(rawNodes) ? rawNodes : []).map((n: any) => ({
      id: n.id ?? null,
      parent_id: n.parent_id ?? null,
      title: n.title ?? n.name ?? '',
      level: n.level ?? 0,
      duration: n.duration ?? 0,
      sort_order: n.sort_order ?? n.sortOrder ?? 0,
    }))
    return { ...mapped, nodes }
  })

  const response: ApiResponse<typeof result> = {
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个WBS模板
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching WBS template', { id })

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? LIMIT 1`, [id])

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND', message: 'WBS模板不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<WBSTemplate> = {
    success: true,
    data: mapTemplateFields(data),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建WBS模板
router.post(
  '/',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
  logger.info('Creating WBS template', req.body)

  // 验证数据
  const validation = ValidationService.validateWbsTemplate(req.body)
  if (!validation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: validation.errors.join('; ')
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const id = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const wbsNodes = req.body.template_data || req.body.wbs_nodes || []

  await executeSQL(
    `INSERT INTO wbs_templates (id, template_name, template_type, description, wbs_nodes, is_default, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.body.name || req.body.template_name,
      req.body.template_type,
      req.body.description ?? null,
      JSON.stringify(wbsNodes),
      req.body.is_default ? 1 : 0,
      (req.body.created_by || req.body.user_id) || null,  // 修复：确保 NULL 值不传空字符串
      ts,
      ts,
    ]
  )

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? LIMIT 1`, [id])

  const response: ApiResponse<WBSTemplate> = {
    success: true,
    data: mapTemplateFields(data),
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新WBS模板
router.put(
  '/:id',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating WBS template', { id })

  // 验证数据
  const validation = ValidationService.validateWbsTemplate(req.body)
  if (!validation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: validation.errors.join('; ')
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const setClauses: string[] = ['updated_at = ?']
  const params: any[] = [ts]

  if (req.body.template_name !== undefined || req.body.name !== undefined) {
    setClauses.push('template_name = ?')
    params.push(req.body.template_name || req.body.name)
  }
  if (req.body.template_type !== undefined) {
    setClauses.push('template_type = ?')
    params.push(req.body.template_type)
  }
  if (req.body.description !== undefined) {
    setClauses.push('description = ?')
    params.push(req.body.description)
  }
  if (req.body.wbs_nodes !== undefined || req.body.template_data !== undefined) {
    setClauses.push('wbs_nodes = ?')
    params.push(JSON.stringify(req.body.wbs_nodes ?? req.body.template_data))
  }
  if (req.body.is_default !== undefined) {
    setClauses.push('is_default = ?')
    params.push(req.body.is_default ? 1 : 0)
  }

  params.push(id)
  await executeSQL(`UPDATE wbs_templates SET ${setClauses.join(', ')} WHERE id = ?`, params)

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? LIMIT 1`, [id])
  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND', message: 'WBS模板不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<WBSTemplate> = {
    success: true,
    data: mapTemplateFields(data),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 删除WBS模板
router.delete(
  '/:id',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting WBS template', { id })

  await executeSQL('DELETE FROM wbs_templates WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 应用WBS模板到项目（批量创建任务）
router.post('/:id/apply',
  requireProjectEditor((req) => req.body?.projectId),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  const { projectId, overwrite } = req.body

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: '缺少目标项目ID (projectId)' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Applying WBS template to project', { templateId: id, projectId, overwrite: !!overwrite })

  // 1. 获取模板
  const template = await executeSQLOne(
    `${WBS_TEMPLATE_SELECT} WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  )

  if (!template) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND', message: 'WBS模板不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 2. 验证目标项目存在
  const project = await executeSQLOne('SELECT id FROM projects WHERE id = ? LIMIT 1', [projectId])

  if (!project) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: '目标项目不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 3. 解析模板节点 (兼容 wbs_nodes / template_data 两种字段，返回可能是字符串)
  let rawNodes: any = template.wbs_nodes || template.template_data || []
  if (typeof rawNodes === 'string') {
    try { rawNodes = JSON.parse(rawNodes) } catch { rawNodes = [] }
  }
  if (!Array.isArray(rawNodes) && Array.isArray(rawNodes?.nodes)) {
    rawNodes = rawNodes.nodes
  }

  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    // 模板中没有节点，直接返回成功（0条任务创建）
    const nextUsageCount = Number(template.usage_count ?? 0) + 1
    const updateTs = new Date().toISOString().slice(0, 19).replace('T', ' ')
    await executeSQL(
      'UPDATE wbs_templates SET usage_count = ?, updated_at = ? WHERE id = ?',
      [nextUsageCount, updateTs, id]
    )

    const response: ApiResponse = {
      success: true,
      data: { createdCount: 0, projectId },
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

  // F2: 覆盖模式 —— 先删除项目现有所有任务
  let deletedCount = 0
  if (overwrite) {
    const existingTasks = await executeSQL<Array<{ id: string }>>(
      'SELECT id FROM tasks WHERE project_id = ?',
      [projectId]
    )
    deletedCount = Array.isArray(existingTasks) ? existingTasks.length : 0
    if (deletedCount > 0) {
      await executeSQL('DELETE FROM tasks WHERE project_id = ?', [projectId])
    }
    logger.info('Overwrite mode: deleted existing tasks', { projectId, deletedCount })
  }

  // 4. 递归创建任意深度的 WBS 节点树
  const nowTs = new Date().toISOString().slice(0, 19).replace('T', ' ')
  let totalCreated = 0

  /**
   * 递归插入一批节点，并对每个有 children 的节点继续递归。
   * @param nodes   当前层级的模板节点数组
   * @param parentTaskId  父任务 ID（顶层传 null）
   * @param fallbackPrefix  任务默认名称前缀（用于无 name/title 时）
   */
  async function insertNodesBatch(
    nodes: any[],
    parentTaskId: string | null,
    fallbackPrefix: string,
    parentWbsCode = '',
    level = 1
  ): Promise<void> {
    if (!Array.isArray(nodes) || nodes.length === 0) return

    // 逐条插入（确保每条记录都能获取到正确的 ID）
    const insertedIds: string[] = []
    for (let idx = 0; idx < nodes.length; idx++) {
      const node = nodes[idx]
      const newId = uuidv4()
      const generatedWbsCode = parentWbsCode ? `${parentWbsCode}.${idx + 1}` : `${idx + 1}`
      const wbsCode = String(node.wbs_code || generatedWbsCode)
      const templateNodeId = node.template_node_id ?? node.id ?? node.source_id ?? null
      await executeSQL(
        `INSERT INTO tasks (id, project_id, parent_id, title, description, status, progress,
           sort_order, is_milestone, reference_duration, wbs_code, wbs_level, template_id, template_node_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          projectId,
          parentTaskId,
          node.name || node.title || `${fallbackPrefix} ${idx + 1}`,
          node.description ?? null,
          'todo',
          0,
          idx,
          node.is_milestone ? 1 : 0,
          node.reference_days || node.duration || null,
          wbsCode,
          level,
          id,
          templateNodeId ? String(templateNodeId) : null,
          nowTs,
          nowTs,
        ]
      )
      insertedIds.push(newId)
      totalCreated++
    }

    // 对有 children 的节点递归处理
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const newParentId = insertedIds[i]
      if (newParentId && Array.isArray(node.children) && node.children.length > 0) {
        const childParentWbsCode = String(node.wbs_code || (parentWbsCode ? `${parentWbsCode}.${i + 1}` : `${i + 1}`))
        await insertNodesBatch(node.children, newParentId, '子任务', childParentWbsCode, level + 1)
      }
    }
  }

  await insertNodesBatch(rawNodes, null, '任务')

  // 5. 更新模板使用次数
  const nextUsageCount = Number(template.usage_count ?? 0) + 1
  await executeSQL(
    'UPDATE wbs_templates SET usage_count = ?, updated_at = ? WHERE id = ?',
    [nextUsageCount, nowTs, id]
  )

  const response: ApiResponse = {
    success: true,
    data: {
      createdCount: totalCreated,
      projectId,
      templateName: template.template_name || template.name,
      overwrite: !!overwrite,
      deletedCount,
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 设置默认模板
router.post(
  '/:id/set-default',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  const templateType = req.body.template_type

  logger.info('Setting default WBS template', { id, templateType })

  // 取消同类型的其他默认模板
  await executeSQL(
    'UPDATE wbs_templates SET is_default = 0 WHERE template_type = ? AND is_default = 1',
    [templateType]
  )

  // 设置新默认模板
  await executeSQL(
    'UPDATE wbs_templates SET is_default = 1 WHERE id = ?',
    [id]
  )

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? LIMIT 1`, [id])
  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND', message: 'WBS模板不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse = {
    success: true,
    data: mapTemplateFields(data),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// B6/U1: 克隆 WBS 模板
router.post(
  '/:id/clone',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Cloning WBS template', { id })

  // 获取原模板
  const original = await executeSQLOne(
    `${WBS_TEMPLATE_SELECT} WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  )

  if (!original) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND', message: 'WBS模板不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const clonedName = `${original.template_name || original.name || '模板'} (副本)`
  const clonedId = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  // 解析原模板的 wbs_nodes
  let wbsNodes = original.wbs_nodes || original.template_data || []
  if (typeof wbsNodes === 'string') {
    try { wbsNodes = JSON.parse(wbsNodes) } catch { wbsNodes = [] }
  }

  await executeSQL(
    `INSERT INTO wbs_templates (id, template_name, template_type, description, wbs_nodes, is_default, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      clonedId,
      clonedName,
      original.template_type,
      original.description,
      JSON.stringify(wbsNodes),
      req.body.created_by ?? null,
      ts,
      ts,
    ]
  )

  const cloned = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? LIMIT 1`, [clonedId])

  const response: ApiResponse<WBSTemplate> = {
    success: true,
    data: mapTemplateFields(cloned),
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// U1: 更新模板状态 (published / disabled / draft)
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  if (!['draft', 'published', 'disabled'].includes(status)) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'status 必须是 draft / published / disabled' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Updating WBS template status', { id, status })

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  let sql: string
  let params: any[]

  if (status === 'draft') {
    sql = 'UPDATE wbs_templates SET is_default = 1, deleted_at = NULL, updated_at = ? WHERE id = ?'
    params = [ts, id]
  } else if (status === 'published') {
    sql = 'UPDATE wbs_templates SET is_default = 0, deleted_at = NULL, updated_at = ? WHERE id = ?'
    params = [ts, id]
  } else {
    // disabled: 软删除
    sql = 'UPDATE wbs_templates SET is_default = 0, deleted_at = ?, updated_at = ? WHERE id = ?'
    params = [ts, ts, id]
  }

  await executeSQL(sql, params)

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? LIMIT 1`, [id])
  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND', message: 'WBS模板不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<WBSTemplate> = {
    success: true,
    data: mapTemplateFields(data),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// F1: 从 Excel/CSV 导入 WBS 模板
router.post(
  '/import-excel',
  upload.single('file'),
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req: any, res) => {
  if (!req.file) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: '请上传文件（.xlsx / .xls / .csv）' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const name = (req.body?.name as string)?.trim()
  const templateType = (req.body?.template_type as string)?.trim() || '住宅'

  if (!name) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: '请提供模板名称 (name)' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Importing WBS template from Excel', { name, templateType, filename: req.file.originalname })

  // ── 解析 Excel/CSV ───────────────────────────────────────────────────
  let rows: string[][]
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  } catch {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PARSE_ERROR', message: '文件解析失败，请检查文件格式是否正确' },
      timestamp: new Date().toISOString(),
    }
    return res.status(422).json(response)
  }

  if (!rows || rows.length < 2) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'EMPTY_FILE', message: '文件内容为空，至少需要一行标题和一行数据' },
      timestamp: new Date().toISOString(),
    }
    return res.status(422).json(response)
  }

  // ── 自动识别列结构 ────────────────────────────────────────────────────
  const header = rows[0].map(v => String(v).trim().toLowerCase())
  const colIdx = {
    title: header.findIndex(h => /任务|工序|name|title/.test(h)),
    days: header.findIndex(h => /工期|duration|days/.test(h)),
    level: header.findIndex(h => /层级|level/.test(h)),
    milestone: header.findIndex(h => /里程碑|milestone/.test(h)),
  }
  if (colIdx.title < 0) colIdx.title = 0

  // ── 将扁平行转为带层级的树 ────────────────────────────────────────────
  interface ParsedNode {
    name: string
    reference_days?: number
    is_milestone?: boolean
    level: number
    children: ParsedNode[]
  }

  const dataRows = rows.slice(1).filter(r => r.some(v => String(v).trim()))
  const flatNodes: { node: ParsedNode; level: number }[] = []

  for (const row of dataRows) {
    const rawName = String(row[colIdx.title] ?? '').trim()
    if (!rawName) continue

    let level = 0
    if (colIdx.level >= 0 && row[colIdx.level] !== '') {
      level = Math.max(0, parseInt(String(row[colIdx.level])) - 1)
    } else {
      const leadingSpaces = rawName.length - rawName.trimStart().length
      level = Math.floor(leadingSpaces / 2)
    }

    const days = colIdx.days >= 0 ? parseInt(String(row[colIdx.days])) : NaN
    const isMilestone = colIdx.milestone >= 0
      ? /是|true|1|yes/.test(String(row[colIdx.milestone]).toLowerCase())
      : false

    flatNodes.push({
      node: {
        name: rawName.trimStart(),
        reference_days: isNaN(days) ? undefined : days,
        is_milestone: isMilestone || undefined,
        level,
        children: [],
      },
      level,
    })
  }

  function buildTreeFromFlat(items: typeof flatNodes): ParsedNode[] {
    const roots: ParsedNode[] = []
    const stack: ParsedNode[] = []

    for (const { node, level } of items) {
      while (stack.length > level) stack.pop()
      if (stack.length === 0) {
        roots.push(node)
      } else {
        stack[stack.length - 1].children.push(node)
      }
      stack.push(node)
    }
    return roots
  }

  const wbsNodes = buildTreeFromFlat(flatNodes)

  if (wbsNodes.length === 0) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'EMPTY_NODES', message: '未能从文件中识别出任何任务节点，请检查文件格式' },
      timestamp: new Date().toISOString(),
    }
    return res.status(422).json(response)
  }

  function countNodes(nodes: ParsedNode[]): number {
    return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0)
  }
  function sumDays(nodes: ParsedNode[]): number {
    return nodes.reduce((sum, n) => {
      if (n.children.length > 0) return sum + sumDays(n.children)
      return sum + (n.reference_days ?? 0)
    }, 0)
  }
  const nodeCount = countNodes(wbsNodes)
  const totalDays = sumDays(wbsNodes)

  // ── 写入数据库 ────────────────────────────────────────────────────────
  const newId = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  await executeSQL(
    `INSERT INTO wbs_templates (id, template_name, template_type, description, wbs_nodes, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      newId,
      name,
      templateType,
      `从 ${req.file.originalname} 导入，共 ${nodeCount} 个节点`,
      JSON.stringify(wbsNodes),
      ts,
      ts,
    ]
  )

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? LIMIT 1`, [newId])

  const response: ApiResponse<WBSTemplate & { nodeCount: number; totalDays: number }> = {
    success: true,
    data: {
      ...mapTemplateFields(data),
      nodeCount,
      totalDays,
    },
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// ── F9: JSON 导入 ────────────────────────────────────────────────────────────
router.post(
  '/import-json',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
  const { templates } = req.body as { templates?: Array<{
    name: string
    template_type?: string
    structure_type?: string
    description?: string
    nodes?: Array<{ title: string; level: number; duration: number; parent_id: string | null; sort_order: number }>
  }> }

  if (!Array.isArray(templates) || templates.length === 0) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: '请提供 templates 数组' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Importing WBS templates from JSON', { count: templates.length })

  const results: Array<{ name: string; id: string; status: 'created' | 'error'; error?: string }> = []

  for (const t of templates) {
    if (!t.name?.trim()) {
      results.push({ name: t.name ?? '(无名称)', id: '', status: 'error', error: '模板名称不能为空' })
      continue
    }
    try {
      const id = uuidv4()
      const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
      const nodesJson = JSON.stringify(Array.isArray(t.nodes) ? t.nodes : [])

      await executeSQL(
        `INSERT INTO wbs_templates (id, template_name, template_type, description, wbs_nodes, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, true, ?, ?)`,
        [id, t.name.trim(), t.template_type || '住宅', t.description || '', nodesJson, ts, ts]
      )

      results.push({ name: t.name, id, status: 'created' })
    } catch (err) {
      logger.error('JSON import failed', { name: t.name, error: String(err) })
      results.push({ name: t.name, id: '', status: 'error', error: String(err) })
    }
  }

  const response: ApiResponse<typeof results> = {
    success: true,
    data: results,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

export default router
