import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { supabase } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'
import type { EngineeringCategory } from '../types/db.js'

const router = Router()
router.use(authenticate)

const CATEGORY_TYPES = ['division','sub_division','item_work','process','activity_step','custom'] as const
type CategoryType = (typeof CATEGORY_TYPES)[number]

const STANDARD_WORK_CODE_PREFIX: Record<CategoryType, string> = {
  division: 'SW-DIV',
  sub_division: 'SW-SUB',
  item_work: 'SW-ITEM',
  process: 'SW-PROC',
  activity_step: 'SW-ACT',
  custom: 'SW-CUS',
}

function now() { return new Date().toISOString() }
function normalizeText(v: unknown) { return typeof v === 'string' ? v.trim() : '' }

function validationError(msg: string): ApiResponse {
  return { success: false, error: { code: 'VALIDATION_ERROR', message: msg }, timestamp: now() }
}

function buildStandardWorkCode(categoryType: CategoryType, categoryId: string) {
  const suffix = categoryId.replace(/-/g, '').slice(0, 10).toUpperCase()
  return `${STANDARD_WORK_CODE_PREFIX[categoryType]}-${suffix}`
}

async function validateParentCategoryForProject(parentId: string | null, projectId: string) {
  if (!parentId) return null

  const { data: parent, error } = await supabase
    .from('engineering_categories')
    .select('id, project_id, enabled, category_path, category_level')
    .eq('id', parentId)
    .maybeSingle()

  if (error) throw new Error(`Failed to validate parent category: ${error.message}`)
  if (!parent) return validationError('parentId references an engineering category that does not exist')

  const parentProjectId = String((parent as any).project_id ?? '').trim()
  if (parentProjectId && parentProjectId !== projectId) {
    return validationError('parentId must reference a category in the current project or the system standard library')
  }
  if ((parent as any).enabled === false) {
    return validationError('parentId references a disabled engineering category')
  }

  return parent as { category_path?: string | null; category_level?: number | null }
}

// GET /api/engineering-categories
router.get(
  '/',
  requireProjectMember((req) => normalizeText(req.query.projectId)),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId)
    const enabledParam = normalizeText(req.query.enabled)

    let query = supabase.from('engineering_categories').select('*')
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .order('category_type', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('category_name', { ascending: true })

    if (enabledParam === 'false') {
      query = query.eq('enabled', false)
    } else if (!enabledParam || enabledParam === 'true') {
      query = query.eq('enabled', true)
    }

    const { data, error } = await query
    if (error) throw new Error(`Failed to list engineering categories: ${error.message}`)
    res.json({ success: true, data: data ?? [], timestamp: now() } as ApiResponse<EngineeringCategory[]>)
  }),
)

// POST /api/engineering-categories
router.post(
  '/',
  requireProjectEditor((req) => normalizeText(req.body?.projectId)),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.body?.projectId) || null
    const categoryName = normalizeText(req.body?.categoryName)
    const categoryType = normalizeText(req.body?.categoryType)
    const parentId = normalizeText(req.body?.parentId) || null

    if (!categoryName) return res.status(400).json(validationError('categoryName is required'))
    if (!CATEGORY_TYPES.includes(categoryType as any)) {
      return res.status(400).json(validationError(`categoryType must be one of: ${CATEGORY_TYPES.join(', ')}`))
    }

    const parentValidation = await validateParentCategoryForProject(parentId, projectId)
    if (parentValidation && 'success' in parentValidation && parentValidation.success === false) {
      return res.status(400).json(parentValidation)
    }

    const id = uuidv4()
    // Resolve parent path/level recursively
    let parentPath = ''
    let parentLevel = 0
    if (parentId && parentValidation && !('success' in parentValidation)) {
      parentPath = parentValidation.category_path || `/${parentId}`
      parentLevel = parentValidation.category_level || 1
    }
    const path = parentPath ? `${parentPath}/${id}` : `/${id}`
    const level = parentLevel + 1

    const payload = {
      id, project_id: projectId || null, parent_id: parentId || null,
      category_name: categoryName, category_type: categoryType,
      category_level: level, category_path: path,
      standard_work_code: buildStandardWorkCode(categoryType as CategoryType, id),
      standard_work_name: categoryName,
      sort_order: Number(req.body?.sortOrder ?? 0),
      enabled: req.body?.enabled !== false,
      metadata: req.body?.metadata ?? {},
      created_at: now(), updated_at: now(),
    }

    const { error } = await supabase.from('engineering_categories').insert(payload)
    if (error) {
      if (error.message?.includes('unique') || error.code === '23505') {
        return res.status(409).json(validationError('Duplicate category name under same parent'))
      }
      throw new Error(`Failed to create engineering category: ${error.message}`)
    }

    const { data } = await supabase.from('engineering_categories').select('*').eq('id', id).maybeSingle()
    res.status(201).json({ success: true, data: data ?? null, timestamp: now() } as ApiResponse<EngineeringCategory>)
  }),
)

// PATCH /api/engineering-categories/:id
router.patch(
  '/:id',
  requireProjectEditor(async (req) => {
    const { data } = await supabase.from('engineering_categories').select('project_id').eq('id', req.params.id).maybeSingle()
    return (data as any)?.project_id ?? ''
  }),
  asyncHandler(async (req, res) => {
    const id = normalizeText(req.params.id)
    const { data: current, error: currentError } = await supabase
      .from('engineering_categories')
      .select('project_id')
      .eq('id', id)
      .maybeSingle()
    if (currentError) throw new Error(`Failed to load category: ${currentError.message}`)
    const projectId = String((current as any)?.project_id ?? '').trim()
    if (!projectId) {
      return res.status(404).json(validationError('Engineering category not found'))
    }

    const updates: Record<string, unknown> = { updated_at: now() }
    if (req.body?.categoryName !== undefined) updates.category_name = normalizeText(req.body.categoryName)
    if (req.body?.sortOrder !== undefined) updates.sort_order = req.body.sortOrder
    if (req.body?.enabled !== undefined) updates.enabled = req.body.enabled
    if (req.body?.metadata !== undefined) updates.metadata = req.body.metadata

    const { error } = await supabase.from('engineering_categories').update(updates).eq('id', id).eq('project_id', projectId)
    if (error) throw new Error(`Failed to update: ${error.message}`)

    const { data } = await supabase.from('engineering_categories').select('*').eq('id', id).eq('project_id', projectId).maybeSingle()
    res.json({ success: true, data: data ?? null, timestamp: now() } as ApiResponse<EngineeringCategory>)
  }),
)

// DELETE /api/engineering-categories/:id (soft delete → enabled=false)
router.delete(
  '/:id',
  requireProjectEditor(async (req) => {
    const { data } = await supabase.from('engineering_categories').select('project_id').eq('id', req.params.id).maybeSingle()
    return (data as any)?.project_id ?? ''
  }),
  asyncHandler(async (req, res) => {
    const id = normalizeText(req.params.id)
    const { data: current, error: currentError } = await supabase
      .from('engineering_categories')
      .select('project_id')
      .eq('id', id)
      .maybeSingle()
    if (currentError) throw new Error(`Failed to load category: ${currentError.message}`)
    const projectId = String((current as any)?.project_id ?? '').trim()
    if (!projectId) {
      return res.status(404).json(validationError('Engineering category not found'))
    }

    // v1.4.15: record retention decision (soft-delete)
    const { executeRetention } = await import('../services/deletionRetentionGovernanceService.js')
    await executeRetention({ entityType: 'engineering_category', entityId: id, projectId, userId: req.user?.id ?? null, userAction: 'deactivate' })

    const { error } = await supabase.from('engineering_categories').update({ enabled: false, updated_at: now() }).eq('id', id).eq('project_id', projectId)
    if (error) throw new Error(`Failed to delete: ${error.message}`)
    res.json({ success: true, timestamp: now() } as ApiResponse)
  }),
)

// POST /api/engineering-categories/bootstrap
router.post(
  '/bootstrap',
  requireProjectEditor((req) => normalizeText(req.body?.projectId)),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.body?.projectId)
    if (!projectId) return res.status(400).json(validationError('projectId is required'))

    // Check if already bootstrapped
    const { data: existing } = await supabase.from('engineering_categories').select('id').eq('project_id', projectId).limit(1)
    if (existing && existing.length > 0) {
      const { data } = await supabase.from('engineering_categories').select('*').eq('project_id', projectId).order('sort_order')
      return res.json({ success: true, data: data ?? [], timestamp: now() } as ApiResponse<EngineeringCategory[]>)
    }

    // Real WBS 4-level tree (parent_id / category_level / category_path computed)
    const tree: Array<{ name: string; type: string; parentRef: string; sortOrder: number }> = [
      // Division → Sub-division → Item-work → Process
      { name: '地基与基础', type: 'division', parentRef: '', sortOrder: 1 },
      { name: '混凝土结构', type: 'sub_division', parentRef: '地基与基础', sortOrder: 1 },
      { name: '钢筋工程', type: 'item_work', parentRef: '混凝土结构', sortOrder: 1 },
      { name: '钢筋绑扎', type: 'process', parentRef: '钢筋工程', sortOrder: 1 },
      { name: '模板工程', type: 'item_work', parentRef: '混凝土结构', sortOrder: 2 },
      { name: '模板安装', type: 'process', parentRef: '模板工程', sortOrder: 1 },
      { name: '混凝土工程', type: 'item_work', parentRef: '混凝土结构', sortOrder: 3 },
      { name: '混凝土浇筑', type: 'process', parentRef: '混凝土工程', sortOrder: 1 },

      { name: '主体结构', type: 'division', parentRef: '', sortOrder: 2 },
      { name: '砌体结构', type: 'sub_division', parentRef: '主体结构', sortOrder: 1 },
      { name: '砌体工程', type: 'item_work', parentRef: '砌体结构', sortOrder: 1 },
      { name: '砖墙砌筑', type: 'process', parentRef: '砌体工程', sortOrder: 1 },

      { name: '建筑装饰装修', type: 'division', parentRef: '', sortOrder: 3 },
      { name: '地面工程', type: 'sub_division', parentRef: '建筑装饰装修', sortOrder: 1 },
      { name: '水泥砂浆地面', type: 'item_work', parentRef: '地面工程', sortOrder: 1 },
      { name: '地面找平', type: 'process', parentRef: '水泥砂浆地面', sortOrder: 1 },
    ]

    const nameToId = new Map<string, string>()
    const nameToPath = new Map<string, string>() // full category_path of each node
    const created: unknown[] = []

    for (const node of tree) {
      const categoryId = uuidv4()
      nameToId.set(node.name, categoryId)
      const parentId = node.parentRef ? (nameToId.get(node.parentRef) ?? null) : null
      const parentFullPath = parentId ? (nameToPath.get(node.parentRef) ?? '') : ''
      const categoryPath = parentFullPath ? `${parentFullPath}/${categoryId}` : `/${categoryId}`
      const categoryLevel = parentFullPath ? parentFullPath.split('/').filter(Boolean).length + 1 : 1
      nameToPath.set(node.name, categoryPath)

      const payload = {
        id: categoryId, project_id: projectId,
        parent_id: parentId,
        category_name: node.name, category_type: node.type,
        category_level: categoryLevel, category_path: categoryPath,
        sort_order: node.sortOrder, enabled: true,
        standard_work_code: buildStandardWorkCode(node.type as CategoryType, categoryId),
        standard_work_name: node.name,
        metadata: { bootstrapped: true },
        created_at: now(), updated_at: now(),
      }
      const { error } = await supabase.from('engineering_categories').insert(payload)
      if (!error) created.push(payload)
    }

    const { data } = await supabase.from('engineering_categories').select('*').eq('project_id', projectId).order('sort_order')
    res.status(201).json({ success: true, data: data ?? [], timestamp: now() } as ApiResponse<EngineeringCategory[]>)
  }),
)

export default router
