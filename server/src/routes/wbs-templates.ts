// WBS模板 API 路由

import { Router } from 'express'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { WBSTemplate } from '../types/db.js'
import { ValidationService } from '../services/validationService.js'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(authenticate)

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

// 获取所有WBS模板
router.get('/', asyncHandler(async (req, res) => {
  const templateType = req.query.type as string
  const statusFilter = req.query.status as string // 'draft' | 'published' | 'disabled' | undefined

  logger.info('Fetching WBS templates', { templateType, statusFilter })

  let sql = 'SELECT * FROM wbs_templates WHERE 1=1'
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

  // ── 根据关键词匹配预置模板 ────────────────────────────────────────────
  const p = prompt.toLowerCase()

  // 判断项目类型
  const isCommercial = /商业|综合体|商场|写字楼|办公/.test(p)
  const isIndustrial = /工业|厂房|仓库|钢结构/.test(p)
  // const isResidential = /住宅|公寓|小区|residential/.test(p)

  // 判断结构类型
  const isSteel = /钢结构|steel/.test(p)
  const isFrame = /框架|框剪|frame/.test(p)

  // 解析层数/面积（简单正则）
  const floorsMatch = p.match(/(\d+)\s*[层楼]/)
  const floors = floorsMatch ? parseInt(floorsMatch[1]) : 18
  const isHighRise = floors >= 15

  // 解析工期（月）
  const monthsMatch = p.match(/(\d+)\s*个?月/)
  const months = monthsMatch ? parseInt(monthsMatch[1]) : (isCommercial ? 24 : isIndustrial ? 12 : 18)

  let templateType = '住宅'
  let suggestedName = '标准住宅 WBS 模板'
  let nodes: any[]

  if (isCommercial) {
    templateType = '商业'
    suggestedName = '商业综合体 WBS 模板'
    nodes = [
      { name: '前期准备', reference_days: 60, children: [
        { name: '立项报批', reference_days: 20 },
        { name: '规划方案设计', reference_days: 30 },
        { name: '施工图设计', reference_days: 45 },
      ]},
      { name: '基础工程', is_milestone: true, reference_days: Math.round(months * 30 * 0.15), children: [
        { name: '土方开挖', reference_days: Math.round(months * 30 * 0.06) },
        { name: '基础施工（桩基/筏板）', reference_days: Math.round(months * 30 * 0.1) },
        { name: '地下室结构', reference_days: Math.round(months * 30 * 0.12) },
      ]},
      { name: '主体结构', is_milestone: true, reference_days: Math.round(months * 30 * 0.35), children: [
        { name: `地上主体结构（${isSteel ? '钢结构' : '框架'}）`, reference_days: Math.round(months * 30 * 0.3) },
        { name: '幕墙及外立面', reference_days: Math.round(months * 30 * 0.15) },
      ]},
      { name: '机电安装', reference_days: Math.round(months * 30 * 0.25), children: [
        { name: '强电安装', reference_days: Math.round(months * 30 * 0.1) },
        { name: '弱电智能化', reference_days: Math.round(months * 30 * 0.1) },
        { name: '给排水', reference_days: Math.round(months * 30 * 0.08) },
        { name: '暖通空调', reference_days: Math.round(months * 30 * 0.12) },
      ]},
      { name: '装饰装修', reference_days: Math.round(months * 30 * 0.25), children: [
        { name: '公共区域精装', reference_days: Math.round(months * 30 * 0.2) },
        { name: '租户区域装修', reference_days: Math.round(months * 30 * 0.15) },
      ]},
      { name: '室外工程', reference_days: Math.round(months * 30 * 0.1), children: [
        { name: '景观绿化', reference_days: Math.round(months * 30 * 0.08) },
        { name: '停车场', reference_days: Math.round(months * 30 * 0.05) },
      ]},
      { name: '竣工验收', is_milestone: true, reference_days: 30, children: [
        { name: '消防验收', reference_days: 15 },
        { name: '综合验收', reference_days: 20 },
        { name: '竣工备案', reference_days: 10 },
      ]},
    ]
  } else if (isIndustrial) {
    templateType = '工业'
    suggestedName = `工业厂房 WBS 模板${isSteel ? '（钢结构）' : ''}`
    nodes = [
      { name: '前期准备', reference_days: 30, children: [
        { name: '场地勘察', reference_days: 15 },
        { name: '施工图设计', reference_days: 30 },
      ]},
      { name: '基础工程', is_milestone: true, reference_days: Math.round(months * 30 * 0.2), children: [
        { name: '土方平整', reference_days: Math.round(months * 30 * 0.06) },
        { name: '独立基础/条形基础', reference_days: Math.round(months * 30 * 0.12) },
      ]},
      { name: '主体结构', is_milestone: true, reference_days: Math.round(months * 30 * 0.4), children: isSteel ? [
        { name: '钢柱制作与安装', reference_days: Math.round(months * 30 * 0.2) },
        { name: '钢梁及屋架安装', reference_days: Math.round(months * 30 * 0.15) },
        { name: '围护结构（彩钢板）', reference_days: Math.round(months * 30 * 0.1) },
      ] : [
        { name: '混凝土框架施工', reference_days: Math.round(months * 30 * 0.3) },
        { name: '屋面结构', reference_days: Math.round(months * 30 * 0.12) },
      ]},
      { name: '配套设施', reference_days: Math.round(months * 30 * 0.2), children: [
        { name: '水电安装', reference_days: Math.round(months * 30 * 0.12) },
        { name: '消防系统', reference_days: Math.round(months * 30 * 0.08) },
        { name: '地坪工程', reference_days: Math.round(months * 30 * 0.08) },
      ]},
      { name: '竣工验收', is_milestone: true, reference_days: 20, children: [
        { name: '消防验收', reference_days: 10 },
        { name: '竣工验收', reference_days: 15 },
      ]},
    ]
  } else {
    // 默认住宅
    templateType = floors > 10 ? (isHighRise ? '高层住宅' : '小高层住宅') : '多层住宅'
    suggestedName = `${floors}层住宅 WBS 模板${isFrame ? '（框剪）' : ''}`
    nodes = [
      { name: '前期准备', reference_days: 45, children: [
        { name: '地质勘察', reference_days: 15 },
        { name: '施工图设计', reference_days: 30 },
        { name: '开工许可证', reference_days: 20 },
      ]},
      { name: '基础工程', is_milestone: true, reference_days: Math.round(months * 30 * 0.18), children: [
        { name: '土方开挖', reference_days: Math.round(months * 30 * 0.05) },
        { name: '桩基础', reference_days: Math.round(months * 30 * 0.08) },
        { name: '地下室底板', reference_days: Math.round(months * 30 * 0.07) },
        { name: '地下室侧墙', reference_days: Math.round(months * 30 * 0.07) },
      ]},
      { name: '主体结构', is_milestone: true, reference_days: Math.round(months * 30 * 0.35), children: [
        { name: `标准层施工（共${floors}层）`, reference_days: Math.round(months * 30 * 0.3) },
        { name: '屋面层施工', reference_days: Math.round(months * 30 * 0.04) },
      ]},
      { name: '二次结构', reference_days: Math.round(months * 30 * 0.1), children: [
        { name: '砌体工程', reference_days: Math.round(months * 30 * 0.08) },
        { name: '抹灰工程', reference_days: Math.round(months * 30 * 0.07) },
      ]},
      { name: '机电安装', reference_days: Math.round(months * 30 * 0.2), children: [
        { name: '给排水安装', reference_days: Math.round(months * 30 * 0.07) },
        { name: '强弱电安装', reference_days: Math.round(months * 30 * 0.08) },
        { name: '消防系统', reference_days: Math.round(months * 30 * 0.06) },
        { name: '电梯安装', reference_days: Math.round(months * 30 * 0.08) },
      ]},
      { name: '装饰装修', reference_days: Math.round(months * 30 * 0.2), children: [
        { name: '外墙保温及涂料', reference_days: Math.round(months * 30 * 0.12) },
        { name: '公共区域装修', reference_days: Math.round(months * 30 * 0.1) },
        { name: '门窗安装', reference_days: Math.round(months * 30 * 0.06) },
      ]},
      { name: '室外工程', reference_days: Math.round(months * 30 * 0.08), children: [
        { name: '室外管网', reference_days: Math.round(months * 30 * 0.05) },
        { name: '景观绿化', reference_days: Math.round(months * 30 * 0.06) },
        { name: '车库地坪', reference_days: Math.round(months * 30 * 0.04) },
      ]},
      { name: '竣工验收', is_milestone: true, reference_days: 45, children: [
        { name: '分项验收（消防/人防/节能）', reference_days: 30 },
        { name: '综合竣工验收', reference_days: 20 },
        { name: '竣工备案', reference_days: 15 },
      ]},
    ]
  }

  const response: ApiResponse<{ nodes: any[]; suggestedName: string; suggestedType: string }> = {
    success: true,
    data: { nodes, suggestedName, suggestedType: templateType },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个WBS模板
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching WBS template', { id })

  const data = await executeSQLOne('SELECT * FROM wbs_templates WHERE id = ? LIMIT 1', [id])

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
router.post('/', asyncHandler(async (req, res) => {
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

  const data = await executeSQLOne('SELECT * FROM wbs_templates WHERE id = ? LIMIT 1', [id])

  const response: ApiResponse<WBSTemplate> = {
    success: true,
    data: mapTemplateFields(data),
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新WBS模板
router.put('/:id', asyncHandler(async (req, res) => {
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

  const data = await executeSQLOne('SELECT * FROM wbs_templates WHERE id = ? LIMIT 1', [id])
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
router.delete('/:id', asyncHandler(async (req, res) => {
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
router.post('/:id/apply', asyncHandler(async (req, res) => {
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
    'SELECT * FROM wbs_templates WHERE id = ? AND deleted_at IS NULL LIMIT 1',
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
    fallbackPrefix: string
  ): Promise<void> {
    if (!Array.isArray(nodes) || nodes.length === 0) return

    // 逐条插入（确保每条记录都能获取到正确的 ID）
    const insertedIds: string[] = []
    for (let idx = 0; idx < nodes.length; idx++) {
      const node = nodes[idx]
      const newId = uuidv4()
      await executeSQL(
        `INSERT INTO tasks (id, project_id, parent_id, title, description, status, progress,
           sort_order, is_milestone, reference_duration, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        await insertNodesBatch(node.children, newParentId, '子任务')
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
router.post('/:id/set-default', asyncHandler(async (req, res) => {
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

  const data = await executeSQLOne('SELECT * FROM wbs_templates WHERE id = ? LIMIT 1', [id])
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
router.post('/:id/clone', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Cloning WBS template', { id })

  // 获取原模板
  const original = await executeSQLOne(
    'SELECT * FROM wbs_templates WHERE id = ? AND deleted_at IS NULL LIMIT 1',
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

  const cloned = await executeSQLOne('SELECT * FROM wbs_templates WHERE id = ? LIMIT 1', [clonedId])

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

  const data = await executeSQLOne('SELECT * FROM wbs_templates WHERE id = ? LIMIT 1', [id])
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
router.post('/import-excel', upload.single('file'), asyncHandler(async (req: any, res) => {
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

  const data = await executeSQLOne('SELECT * FROM wbs_templates WHERE id = ? LIMIT 1', [newId])

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

// ── F9: JSON 导出 ────────────────────────────────────────────────────────────
router.get('/export-json', asyncHandler(async (req, res) => {
  const { ids } = req.query as { ids?: string }

  let query = 'SELECT * FROM wbs_templates WHERE deleted_at IS NULL ORDER BY created_at DESC'
  const params: string[] = []

  if (ids) {
    const idArr = ids.split(',').map((s: string) => s.trim()).filter(Boolean)
    if (idArr.length > 0) {
      query = 'SELECT * FROM wbs_templates WHERE deleted_at IS NULL AND id IN (?) ORDER BY created_at DESC'
      params.push(idArr.join(','))
    }
  }

  const templates = await executeSQL<WBSTemplate[]>(query, params)

  // 附加节点数据
  const result = await Promise.all((templates as any[]).map(async (t) => {
    const nodes = await executeSQL<Array<{ id: string; parent_id: string | null; title: string; level: number; duration: number; sort_order: number; }>>(
      'SELECT id, parent_id, title, level, duration, sort_order FROM wbs_nodes WHERE template_id = ? ORDER BY sort_order',
      [t.id]
    )
    return { ...mapTemplateFields(t), nodes }
  }))

  const response: ApiResponse<typeof result> = {
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// ── F9: JSON 导入 ────────────────────────────────────────────────────────────
router.post('/import-json', asyncHandler(async (req, res) => {
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
      const [insertResult] = await executeSQL<Array<{ insertId: number }>>(
        `INSERT INTO wbs_templates (name, template_type, structure_type, description, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
        [t.name.trim(), t.template_type || '住宅', t.structure_type || '', t.description || '']
      ) as any[]
      const templateId = String(insertResult?.insertId ?? insertResult?.id ?? '')

      if (Array.isArray(t.nodes) && t.nodes.length > 0) {
        const nodeInserts = t.nodes.map((n, idx) => [
          templateId, n.parent_id || null, n.title || `节点${idx + 1}`,
          n.level || 0, n.duration || 1, idx,
        ])
        await executeSQL(
          `INSERT INTO wbs_nodes (template_id, parent_id, title, level, duration, sort_order) VALUES ?`,
          [nodeInserts]
        )
      }

      results.push({ name: t.name, id: templateId, status: 'created' })
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
