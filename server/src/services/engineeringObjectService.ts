import { v4 as uuidv4 } from 'uuid'
import { supabase } from './dbService.js'
import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import {
  ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES,
  ENGINEERING_OBJECT_PERSISTED_DECOMPOSITION_PARENT_TYPES,
  ENGINEERING_OBJECT_TYPE_PREFIXES,
  ENGINEERING_OBJECT_TYPES,
  ENGINEERING_OBJECT_VALID_CHILDREN,
  getEngineeringObjectDefaultAreaAccountingMode,
  getEngineeringObjectDefaultCoverageRole,
  type EngineeringObject,
  type EngineeringObjectType,
} from '../types/db.js'

type TransactionClientLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>
}

// ============================================================
// Constants
// ============================================================

const SUPPORTED_TYPE_VALUES = ENGINEERING_OBJECT_TYPES as readonly string[]

const DECOMPOSITION_PARENT_TYPES = new Set<EngineeringObjectType>(ENGINEERING_OBJECT_PERSISTED_DECOMPOSITION_PARENT_TYPES)

const OBJECT_TYPE_TO_DIMENSION = Object.fromEntries(
  ENGINEERING_OBJECT_TYPES.map((type) => [type, type]),
) as Record<EngineeringObjectType, EngineeringObjectType>

const DIMENSION_TO_OBJECT_TYPE: Record<string, EngineeringObjectType> = { ...OBJECT_TYPE_TO_DIMENSION }

const ENGINEERING_OBJECT_CACHE_TTL_MS = 30_000

const engineeringObjectReadCache = new Map<string, {
  expiresAt: number
  promise: Promise<EngineeringObject[]>
}>()

function now() {
  return new Date().toISOString()
}

type SupabaseLikeError = {
  code?: string
  message?: string
  details?: string
  constraint?: string
}

function uniqueErrorText(error: SupabaseLikeError): string {
  return [
    error.constraint,
    error.message,
    error.details,
  ].filter(Boolean).join(' ')
}

function isUniqueViolation(error: SupabaseLikeError): boolean {
  const text = uniqueErrorText(error).toLowerCase()
  return error.code === '23505' || text.includes('unique constraint') || text.includes('duplicate key')
}

function isObjectCodeUniqueConflict(error: SupabaseLikeError): boolean {
  const text = uniqueErrorText(error).toLowerCase()
  return text.includes('object_code')
    || text.includes('engineering_objects_project_id_object_type_object_code_key')
}

function isObjectNameUniqueConflict(error: SupabaseLikeError): boolean {
  const text = uniqueErrorText(error).toLowerCase()
  return text.includes('object_name')
    || text.includes('uq_engineering_objects_root_active_name')
    || text.includes('uq_engineering_objects_child_active_name')
}

function normalizeDirectRows<T>(rows: Array<Record<string, unknown>>): T[] {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  ) as T)
}

export function clearEngineeringObjectReadCache(projectId?: string | null) {
  if (!projectId) {
    engineeringObjectReadCache.clear()
    return
  }

  for (const key of [...engineeringObjectReadCache.keys()]) {
    if (key.startsWith(`${projectId}:`)) {
      engineeringObjectReadCache.delete(key)
    }
  }
}

function buildEngineeringObjectCacheKey(filters: EngineeringObjectFilters): string {
  return [
    filters.projectId,
    filters.type ?? 'all-types',
    filters.parentId ?? 'any-parent',
    filters.status ?? 'active',
  ].join(':')
}

function isEngineeringObjectType(value: unknown): value is EngineeringObjectType {
  return typeof value === 'string' && SUPPORTED_TYPE_VALUES.includes(value)
}

function objectTypeToDimensionKey(objectType: EngineeringObjectType): string | null {
  return OBJECT_TYPE_TO_DIMENSION[objectType] ?? null
}

function dimensionKeyToObjectType(dimensionKey: string): EngineeringObjectType | null {
  return DIMENSION_TO_OBJECT_TYPE[dimensionKey] ?? null
}

function buildPath(parentPath: string | null, id: string): string {
  if (!parentPath) {
    return `/${id}`
  }
  return `${parentPath}/${id}`
}

function computeLevel(path: string): number {
  return path.split('/').filter(Boolean).length
}

// ============================================================
// Validation
// ============================================================

function validateParentChild(
  parentType: EngineeringObjectType,
  childType: EngineeringObjectType,
): void {
  const allowed = (ENGINEERING_OBJECT_VALID_CHILDREN[parentType] ?? []) as readonly EngineeringObjectType[]
  if (!allowed.includes(childType)) {
    throw new Error(
      `${parentType} cannot contain ${childType}. ` +
      `Allowed child types: ${allowed.join(', ') || '(leaf only)'}`
    )
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeMetadataForChild(
  parent: EngineeringObject | null,
  childType: EngineeringObjectType,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    coverageRole: getEngineeringObjectDefaultCoverageRole(childType),
    areaAccountingMode: getEngineeringObjectDefaultAreaAccountingMode(childType),
    ...metadata,
  }
  if (['basement', 'physical_zone'].includes(childType) && next.childrenComplete === undefined) {
    next.childrenComplete = true
  }
  return next
}

async function validateDecompositionAxis(params: {
  parent: EngineeringObject | null
  projectId: string
  childType: EngineeringObjectType
  excludingObjectId?: string
  transactionClient?: TransactionClientLike | null
}): Promise<void> {
  const childMode = ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES[params.childType]
  if (!params.parent || !childMode || !DECOMPOSITION_PARENT_TYPES.has(params.parent.object_type)) return

  const parentMetadata = readRecord(params.parent.metadata)
  const explicitMode = String(parentMetadata.decompositionMode ?? '')
  if ((explicitMode === 'by_floor' || explicitMode === 'by_physical_zone') && explicitMode !== childMode) {
    throw new Error(`Parent scope is decomposed as ${explicitMode}; cannot add ${params.childType}`)
  }

  let existingRows: Array<{ object_type: EngineeringObjectType }> = []
  if (params.transactionClient) {
    const clauses = ['project_id = $1', 'parent_id = $2', "status = 'active'"]
    const queryParams: unknown[] = [params.projectId, params.parent.id]
    if (params.excludingObjectId) {
      queryParams.push(params.excludingObjectId)
      clauses.push(`id <> $${queryParams.length}`)
    }
    const result = await params.transactionClient.query(
      `SELECT id, object_type FROM engineering_objects WHERE ${clauses.join(' AND ')}`,
      queryParams,
    )
    existingRows = (result.rows ?? []) as Array<{ object_type: EngineeringObjectType }>
  } else {
    let query = supabase
      .from('engineering_objects')
      .select('id, object_type')
      .eq('project_id', params.projectId)
      .eq('parent_id', params.parent.id)
      .eq('status', 'active')

    if (params.excludingObjectId) {
      query = query.neq('id', params.excludingObjectId)
    }

    const { data, error } = await query
    if (error) throw new Error(`Failed to validate decomposition axis: ${error.message}`)
    existingRows = (data ?? []) as Array<{ object_type: EngineeringObjectType }>
  }

  const existingModes = new Set(
    existingRows
      .map((item) => ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES[item.object_type])
      .filter(Boolean),
  )
  if (existingModes.size > 0 && !existingModes.has(childMode)) {
    throw new Error(`Parent scope already uses another decomposition axis; cannot add ${params.childType}`)
  }
}

// ============================================================
// Code generation
// ============================================================

async function generateObjectCode(
  projectId: string,
  objectType: EngineeringObjectType,
): Promise<string> {
  const prefix = ENGINEERING_OBJECT_TYPE_PREFIXES[objectType]

  const { data: existing, error } = await supabase
    .from('engineering_objects')
    .select('object_code')
    .eq('project_id', projectId)
    .eq('object_type', objectType)
    .order('object_code', { ascending: false })
    .limit(1)

  if (error) {
    logger.error('Failed to generate object code', { error: error.message, projectId, objectType })
    throw new Error(`Failed to generate object code: ${error.message}`)
  }

  const existingCodes = (existing ?? []) as { object_code: string }[]
  if (existingCodes.length === 0) {
    return `${prefix}-001`
  }

  const lastCode = existingCodes[0].object_code
  const match = lastCode.match(/(\d+)$/)
  const nextNum = match ? parseInt(match[1], 10) + 1 : 1
  return `${prefix}-${String(nextNum).padStart(3, '0')}`
}

// ============================================================
// Reference checking
// ============================================================

async function isObjectReferenced(projectId: string, objectId: string): Promise<boolean> {
  const checks = await Promise.all([
    supabase.from('tasks').select('id').eq('project_id', projectId).eq('engineering_object_id', objectId).limit(1),
    supabase.from('tasks').select('id').eq('project_id', projectId).eq('phase_object_id', objectId).limit(1),
    supabase.from('tasks').select('id').eq('project_id', projectId).eq('section_object_id', objectId).limit(1),
    supabase.from('tasks').select('id').eq('project_id', projectId).eq('building_object_id', objectId).limit(1),
    supabase.from('tasks').select('id').eq('project_id', projectId).eq('basement_object_id', objectId).limit(1),
    supabase.from('tasks').select('id').eq('project_id', projectId).eq('floor_object_id', objectId).limit(1),
    supabase.from('tasks').select('id').eq('project_id', projectId).eq('physical_zone_object_id', objectId).limit(1),
    supabase.from('tasks').select('id').eq('project_id', projectId).eq('functional_area_object_id', objectId).limit(1),
    supabase.from('acceptance_plans').select('id').eq('project_id', projectId).eq('building_object_id', objectId).limit(1),
  ])

  for (const check of checks) {
    if (check.error) {
      logger.warn('Reference check query error', { objectId, error: check.error.message })
    }
    if ((check.data ?? []).length > 0) return true
  }

  const { data: children } = await supabase
    .from('engineering_objects')
    .select('id')
    .eq('project_id', projectId)
    .eq('parent_id', objectId)
    .limit(1)

  if ((children ?? []).length > 0) return true

  return false
}

// ============================================================
// Path cascade (v1.4.1 fix — no double-id bug)
// ============================================================

async function cascadeChildrenPathUpdate(parentId: string, projectId: string): Promise<void> {
  // Fetch the parent's current (already-updated) path
  const { data: self } = await supabase
    .from('engineering_objects')
    .select('path')
    .eq('id', parentId)
    .eq('project_id', projectId)
    .maybeSingle()

  const selfPath = (self as any)?.path || `/${parentId}`

  const { data: children } = await supabase
    .from('engineering_objects')
    .select('id')
    .eq('parent_id', parentId)
    .eq('project_id', projectId)

  for (const child of (children ?? []) as { id: string }[]) {
    const childPath = buildPath(selfPath, child.id)
    const childLevel = computeLevel(childPath)

    await supabase
      .from('engineering_objects')
      .update({ path: childPath, level: childLevel, updated_at: now() })
      .eq('id', child.id)
      .eq('project_id', projectId)

    // Recurse
    await cascadeChildrenPathUpdate(child.id, projectId)
  }
}

// ============================================================
// Bootstrap
// ============================================================

export async function bootstrapEngineeringObjects(projectId: string): Promise<EngineeringObject[]> {
  const { data: existing } = await supabase
    .from('engineering_objects')
    .select('*')
    .eq('project_id', projectId)
    .in('object_type', [...SUPPORTED_TYPE_VALUES])
    .order('object_type', { ascending: true })
    .order('sort_order', { ascending: true })

  if ((existing ?? []).length > 0) {
    return (existing ?? []) as EngineeringObject[]
  }

  logger.info('Bootstrap completed with empty engineering object tree', { projectId, count: 0 })
  clearEngineeringObjectReadCache(projectId)
  return []
}

// ============================================================
// CRUD
// ============================================================

export interface EngineeringObjectFilters {
  projectId: string
  type?: EngineeringObjectType
  parentId?: string | null
  status?: 'active' | 'inactive' | 'all'
}

export interface CreateEngineeringObjectInput {
  projectId: string
  objectType: EngineeringObjectType
  objectName: string
  parentId?: string | null
  sortOrder?: number
  metadata?: Record<string, unknown>
  transactionClient?: TransactionClientLike | null
}

export interface UpdateEngineeringObjectInput {
  projectId: string
  objectName?: string
  parentId?: string | null
  sortOrder?: number
  status?: 'active' | 'inactive'
  metadata?: Record<string, unknown>
  transactionClient?: TransactionClientLike | null
}

export async function listEngineeringObjects(
  filters: EngineeringObjectFilters,
): Promise<EngineeringObject[]> {
  const cacheKey = buildEngineeringObjectCacheKey(filters)
  const cached = engineeringObjectReadCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }

  const promise = (async () => {
    try {
      const params: unknown[] = [filters.projectId]
      const clauses = [
        'project_id::text = $1',
        "object_type = ANY(ARRAY['phase','section','building','basement','floor','physical_zone','functional_area'])",
      ]

      if (filters.type) {
        params.push(filters.type)
        clauses.push(`object_type = $${params.length}`)
      }

      if (filters.parentId === '__root__' || filters.parentId === '') {
        clauses.push('parent_id IS NULL')
      } else if (filters.parentId !== undefined && filters.parentId !== null) {
        params.push(filters.parentId)
        clauses.push(`parent_id::text = $${params.length}`)
      }

      if (filters.status && filters.status !== 'all') {
        params.push(filters.status)
        clauses.push(`status = $${params.length}`)
      } else if (!filters.status || filters.status !== 'all') {
        clauses.push("status = 'active'")
      }

      const { rows } = await rawQuery(
        `
          SELECT *
          FROM public.engineering_objects
          WHERE ${clauses.join(' AND ')}
          ORDER BY parent_id ASC NULLS FIRST, sort_order ASC, object_name ASC
        `,
        params,
      )

      return normalizeDirectRows<EngineeringObject>(rows as Array<Record<string, unknown>>)
    } catch (error) {
      logger.warn('Direct engineering object list query failed, falling back to Supabase REST', {
        projectId: filters.projectId,
        error: error instanceof Error ? error.message : String(error),
      })

      let query = supabase
        .from('engineering_objects')
        .select('*')
        .eq('project_id', filters.projectId)
        .in('object_type', [...SUPPORTED_TYPE_VALUES])

      if (filters.type) {
        query = query.eq('object_type', filters.type)
      }

      if (filters.parentId === '__root__' || filters.parentId === '') {
        query = query.is('parent_id', null)
      } else if (filters.parentId !== undefined && filters.parentId !== null) {
        query = query.eq('parent_id', filters.parentId)
      }

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      } else if (!filters.status || filters.status !== 'all') {
        query = query.eq('status', 'active')
      }

      const { data, error: fallbackError } = await query
        .order('parent_id', { ascending: true, nullsFirst: true })
        .order('sort_order', { ascending: true })
        .order('object_name', { ascending: true })

      if (fallbackError) {
        throw new Error(`Failed to list engineering objects: ${fallbackError.message}`)
      }

      return (data ?? []) as EngineeringObject[]
    }
  })()

  engineeringObjectReadCache.set(cacheKey, {
    expiresAt: Date.now() + ENGINEERING_OBJECT_CACHE_TTL_MS,
    promise,
  })

  promise.catch(() => {
    const current = engineeringObjectReadCache.get(cacheKey)
    if (current?.promise === promise) {
      engineeringObjectReadCache.delete(cacheKey)
    }
  })

  return promise
}

async function getParent(projectId: string, objectId: string): Promise<EngineeringObject | null> {
  if (!objectId) return null
  const { data } = await supabase
    .from('engineering_objects')
    .select('*')
    .eq('id', objectId)
    .eq('project_id', projectId)
    .maybeSingle()
  return (data ?? null) as EngineeringObject | null
}

async function getParentInTransaction(
  projectId: string,
  objectId: string,
  transactionClient?: TransactionClientLike | null,
): Promise<EngineeringObject | null> {
  if (!objectId) return null
  if (!transactionClient) return getParent(projectId, objectId)
  const result = await transactionClient.query(
    'SELECT * FROM engineering_objects WHERE id = $1 AND project_id = $2 LIMIT 1',
    [objectId, projectId],
  )
  return ((result.rows ?? [])[0] ?? null) as EngineeringObject | null
}

export async function createEngineeringObject(
  input: CreateEngineeringObjectInput,
): Promise<EngineeringObject> {
  const name = input.objectName.trim()
  if (!name) throw new Error('objectName is required')
  if (!isEngineeringObjectType(input.objectType)) {
    throw new Error(`Invalid objectType: ${input.objectType}`)
  }

  let parentPath: string | null = null
  let parentObject: EngineeringObject | null = null
  if (input.parentId) {
    const parent = await getParentInTransaction(input.projectId, input.parentId, input.transactionClient)
    if (!parent) throw new Error(`Parent object not found: ${input.parentId}`)
    if (parent.project_id !== input.projectId) {
      throw new Error('Parent object belongs to a different project')
    }
    validateParentChild(parent.object_type, input.objectType)
    await validateDecompositionAxis({
      parent,
      projectId: input.projectId,
      childType: input.objectType,
      transactionClient: input.transactionClient,
    })

    parentPath = parent.path
    parentObject = parent
  }

  const id = uuidv4()
  const path = buildPath(parentPath, id)

  if (input.transactionClient) {
    const codeResult = await input.transactionClient.query(
      `SELECT object_code
       FROM engineering_objects
       WHERE project_id = $1 AND object_type = $2
       ORDER BY object_code DESC
       LIMIT 1`,
      [input.projectId, input.objectType],
    )
    const existingCodes = (codeResult.rows ?? []) as Array<{ object_code?: string | null }>
    const prefix = ENGINEERING_OBJECT_TYPE_PREFIXES[input.objectType]
    const lastCode = String(existingCodes[0]?.object_code ?? '').trim()
    const match = lastCode.match(/(\d+)$/)
    const nextNum = match ? Number.parseInt(match[1], 10) + 1 : 1
    const payload = {
      id,
      project_id: input.projectId,
      object_type: input.objectType,
      object_code: `${prefix}-${String(nextNum).padStart(3, '0')}`,
      object_name: name,
      parent_id: input.parentId ?? null,
      path,
      level: parentPath ? computeLevel(parentPath) + 1 : 1,
      sort_order: input.sortOrder ?? 0,
      status: 'active' as const,
      source_type: 'manual' as const,
      metadata: normalizeMetadataForChild(parentObject, input.objectType, input.metadata ?? {}),
      created_at: now(),
      updated_at: now(),
    }
    const columns = Object.keys(payload)
    const values = Object.values(payload)
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
    await input.transactionClient.query(
      `INSERT INTO engineering_objects (${columns.join(', ')}) VALUES (${placeholders})`,
      values,
    )
    clearEngineeringObjectReadCache(input.projectId)
    return payload as EngineeringObject
  }

  // Retry up to 3 times on unique code conflicts.
  let lastError: any = null
  let created = false
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await generateObjectCode(input.projectId, input.objectType)

    const payload = {
      id,
      project_id: input.projectId,
      object_type: input.objectType,
      object_code: code,
      object_name: name,
      parent_id: input.parentId ?? null,
      path,
      level: parentPath ? computeLevel(parentPath) + 1 : 1,
      sort_order: input.sortOrder ?? 0,
      status: 'active' as const,
      source_type: 'manual' as const,
      metadata: normalizeMetadataForChild(parentObject, input.objectType, input.metadata ?? {}),
      created_at: now(),
      updated_at: now(),
    }

    const { error } = await supabase.from('engineering_objects').insert(payload)
    if (!error) {
      created = true
      lastError = null
      break
    }

    if (isUniqueViolation(error) && isObjectNameUniqueConflict(error)) {
      throw new Error(`Duplicate object name: ${error.details ?? error.message}`)
    }
    if (isUniqueViolation(error) && isObjectCodeUniqueConflict(error)) {
      lastError = error
      continue // retry with next code
    }
    if (isUniqueViolation(error)) {
      throw new Error(`Duplicate object: ${error.details ?? error.message}`)
    }
    throw new Error(`Failed to create engineering object: ${error.message}`)
  }

  if (!created && lastError) {
    throw new Error(`Duplicate object after retries: ${lastError.details ?? lastError.message}`)
  }

  clearEngineeringObjectReadCache(input.projectId)
  const { data } = await supabase.from('engineering_objects').select('*').eq('id', id).eq('project_id', input.projectId).maybeSingle()
  return (data ?? null) as EngineeringObject
}

export async function updateEngineeringObject(
  id: string,
  input: UpdateEngineeringObjectInput,
): Promise<EngineeringObject> {
  const { data: existing } = await supabase
    .from('engineering_objects')
    .select('*')
    .eq('id', id)
    .eq('project_id', input.projectId)
    .maybeSingle()

  if (!existing) throw new Error('Engineering object not found')
  const obj = existing as EngineeringObject

  const updates: Record<string, unknown> = {}
  updates.updated_at = now()

  if (input.objectName !== undefined) {
    const name = input.objectName.trim()
    if (!name) throw new Error('objectName cannot be empty')
    updates.object_name = name
  }

  if (input.sortOrder !== undefined) {
    updates.sort_order = input.sortOrder
  }

  if (input.status !== undefined) {
    updates.status = input.status
  }

  if (input.metadata !== undefined) {
    updates.metadata = normalizeMetadataForChild(null, obj.object_type, input.metadata)
  }

  // Parent change requires path cascade for children
  if (input.parentId !== undefined) {
    const oldParentId = obj.parent_id
    const newParentId = input.parentId || null

    if (newParentId !== oldParentId) {
      if (newParentId) {
        const parent = await getParent(input.projectId, newParentId)
        if (!parent) throw new Error(`Parent object not found: ${newParentId}`)
        if (parent.project_id !== obj.project_id) {
          throw new Error('Parent object belongs to a different project')
        }
        validateParentChild(parent.object_type, obj.object_type)
        await validateDecompositionAxis({
          parent,
          projectId: obj.project_id,
          childType: obj.object_type,
          excludingObjectId: id,
        })
        updates.parent_id = newParentId
        updates.path = buildPath(parent.path, id)
        updates.level = computeLevel(String(updates.path))
      } else {
        updates.parent_id = null
        updates.path = buildPath(null, id)
        updates.level = 1
      }

      const { error: updateError } = await supabase
        .from('engineering_objects')
        .update(updates)
        .eq('id', id)
        .eq('project_id', obj.project_id)

      if (updateError) {
        if (updateError.message?.includes('unique') || updateError.code === '23505') {
          throw new Error(`Duplicate object: ${updateError.details ?? updateError.message}`)
        }
        throw new Error(`Failed to update engineering object: ${updateError.message}`)
      }

      // Cascade path to children (v1.4.1 fix: use self's new path as parent, no double-id)
      await cascadeChildrenPathUpdate(id, obj.project_id)
      clearEngineeringObjectReadCache(obj.project_id)

      const { data: updated } = await supabase
        .from('engineering_objects')
        .select('*')
        .eq('id', id)
        .eq('project_id', obj.project_id)
        .maybeSingle()

      return (updated ?? null) as EngineeringObject
    }
  }

  const { error } = await supabase
    .from('engineering_objects')
    .update(updates)
    .eq('id', id)
    .eq('project_id', obj.project_id)

  if (error) {
    if (error.message?.includes('unique') || error.code === '23505') {
      throw new Error(`Duplicate object: ${error.details ?? error.message}`)
    }
    throw new Error(`Failed to update engineering object: ${error.message}`)
  }

  clearEngineeringObjectReadCache(obj.project_id)
  const { data: updated } = await supabase
    .from('engineering_objects')
    .select('*')
    .eq('id', id)
    .eq('project_id', obj.project_id)
    .maybeSingle()

  return (updated ?? null) as EngineeringObject
}

export async function deleteEngineeringObject(projectId: string, id: string): Promise<void> {
  const { data: existing } = await supabase
    .from('engineering_objects')
    .select('*')
    .eq('id', id)
    .eq('project_id', projectId)
    .maybeSingle()

  if (!existing) throw new Error('Engineering object not found')

  const referenced = await isObjectReferenced(projectId, id)
  if (referenced) {
    throw new Error('Cannot delete: object is referenced by tasks, materials, or acceptance plans')
  }

  const { error } = await supabase
    .from('engineering_objects')
    .update({ status: 'inactive', updated_at: now() })
    .eq('id', id)
    .eq('project_id', (existing as EngineeringObject).project_id)

  if (error) {
    throw new Error(`Failed to delete engineering object: ${error.message}`)
  }

  clearEngineeringObjectReadCache((existing as EngineeringObject).project_id)
}

/**
 * Check if at least one range-tree scope object ID is present.
 * v1.4.1 rule: tasks must have at least one scope attribution.
 */
export function hasAnyScopeObjectId(task: Record<string, unknown>): boolean {
  const fields = [
    'engineering_object_id', 'engineeringObjectId',
    'phase_object_id', 'phaseObjectId',
    'section_object_id', 'sectionObjectId',
    'building_object_id', 'buildingObjectId',
    'basement_object_id', 'basementObjectId',
    'floor_object_id', 'floorObjectId',
    'physical_zone_object_id', 'physicalZoneObjectId',
    'functional_area_object_id', 'functionalAreaObjectId',
  ]
  return fields.some((f) => {
    const v = task[f]
    return v !== undefined && v !== null && String(v).trim() !== ''
  })
}

export const SCOPE_OBJECT_ID_SNAKE_FIELDS = [
  'engineering_object_id',
  'phase_object_id',
  'section_object_id',
  'building_object_id',
  'basement_object_id',
  'floor_object_id',
  'physical_zone_object_id',
  'functional_area_object_id',
] as const

/**
 * Resolve camelCase or snake_case object ID from a task payload,
 * returning the first non-null value found.
 */
export function resolveScopeObjectIds(payload: Record<string, unknown>): Record<string, string | null> {
  const result: Record<string, string | null> = {}

  const mappings: Array<[string, string, string]> = [
    ['engineering_object_id', 'engineering_object_id', 'engineeringObjectId'],
    ['phase_object_id', 'phase_object_id', 'phaseObjectId'],
    ['section_object_id', 'section_object_id', 'sectionObjectId'],
    ['building_object_id', 'building_object_id', 'buildingObjectId'],
    ['basement_object_id', 'basement_object_id', 'basementObjectId'],
    ['floor_object_id', 'floor_object_id', 'floorObjectId'],
    ['physical_zone_object_id', 'physical_zone_object_id', 'physicalZoneObjectId'],
    ['functional_area_object_id', 'functional_area_object_id', 'functionalAreaObjectId'],
  ]

  for (const [key, snake, camel] of mappings) {
    const val = (payload as any)[snake] ?? (payload as any)[camel] ?? null
    result[key] = val ? String(val).trim() || null : null
  }

  return result
}

/**
 * Validate that each object_id references the correct object_type.
 * Returns 400-worthy error message or null if all pass.
 */
export async function validateScopeObjectTypes(
  projectId: string,
  ids: Record<string, string | null | undefined>,
): Promise<string | null> {
  const checks: Array<[string, string | null]> = [
    ['building_object_id', 'building'],
    ['basement_object_id', 'basement'],
    ['physical_zone_object_id', 'physical_zone'],
    ['functional_area_object_id', 'functional_area'],
    ['phase_object_id', 'phase'],
    ['section_object_id', 'section'],
    ['floor_object_id', 'floor'],
    ['engineering_object_id', null], // any type OK but must exist and be active
  ]

  for (const [field, expectedType] of checks) {
    const id = ids[field]
    if (!id) continue

    const { data } = await supabase
      .from('engineering_objects')
      .select('object_type, status')
      .eq('id', id)
      .eq('project_id', projectId)
      .maybeSingle()

    if (!data) {
      return `${field} 引用的工程对象不存在: ${id}`
    }
    const obj = data as any

    if (obj.status !== 'active') {
      return `${field} 引用的工程对象已停用: ${id}`
    }

    if (expectedType && obj.object_type !== expectedType) {
      return `${field} 必须是 ${expectedType} 类型的工程对象，实际类型为 ${obj.object_type}`
    }
  }

  return null
}

// ============================================================
// Scope consistency validation (v1.4.1 batch check)
// ============================================================

/**
 * Validate all scope object IDs in a single batch:
 * - All belong to the same project
 * - All are active
 * - Each matches its expected type
 * - Spatial dimensions share a common parent chain via path
 * Returns null if valid, or an error message string if invalid.
 */
export async function validateTaskScopeConsistency(
  projectId: string,
  ids: Record<string, string | null | undefined>,
): Promise<string | null> {
  // Only read the 7 named scope fields, de-duplicate before query
  const FIELD_NAMES: Array<[string, string | null]> = [
    ['engineering_object_id', null],
    ['phase_object_id', 'phase'],
    ['section_object_id', 'section'],
    ['building_object_id', 'building'],
    ['basement_object_id', 'basement'],
    ['floor_object_id', 'floor'],
    ['physical_zone_object_id', 'physical_zone'],
    ['functional_area_object_id', 'functional_area'],
  ]

  const allIds = [...new Set(FIELD_NAMES.map(([f]) => (ids as any)[f]).filter((v): v is string => !!v))]
  if (allIds.length === 0) return null

  // Fetch all objects in one query
  const { data: objects } = await supabase
    .from('engineering_objects')
    .select('id, project_id, object_type, status, path')
    .in('id', allIds)
    .eq('project_id', projectId)

  if (!objects || objects.length !== allIds.length) {
    return '一个或多个范围对象 ID 不存在'
  }

  const objMap = new Map((objects as any[]).map((o) => [o.id, o]))

  // Validate each field: same project, active, type match
  for (const [field, expectedType] of FIELD_NAMES) {
    const id = (ids as any)[field]
    if (!id) continue
    const obj = objMap.get(id) as any
    if (!obj) continue

    if (obj.project_id !== projectId) {
      return `${field} 引用的对象属于其他项目: ${id}`
    }
    if (obj.status !== 'active') {
      return `${field} 引用的对象已停用: ${id}`
    }
    // engineering_object_id skips type check — any type is OK
    if (expectedType && obj.object_type !== expectedType) {
      return `${field} 期望 ${expectedType} 类型，实际为 ${obj.object_type}: ${id}`
    }
  }

  // Spatial chain check across all range-tree anchors.
  // For any two spatial objects, one's path segment array MUST be a prefix of the other.
  const spatialFields = [
    'phase_object_id',
    'section_object_id',
    'building_object_id',
    'basement_object_id',
    'floor_object_id',
    'physical_zone_object_id',
    'functional_area_object_id',
  ]
  const spatialObjs: Array<{ id: string; path: string }> = []
  for (const f of spatialFields) {
    const sid = (ids as any)[f]
    if (!sid) continue
    const o = objMap.get(sid) as any
    if (o?.path) spatialObjs.push({ id: sid, path: o.path })
  }

  if (spatialObjs.length >= 2) {
    const pathSegments = spatialObjs.map((so) => ({
      id: so.id,
      segments: so.path.split('/').filter(Boolean),
    }))

    for (let i = 0; i < pathSegments.length; i++) {
      for (let j = i + 1; j < pathSegments.length; j++) {
        const a = pathSegments[i]
        const b = pathSegments[j]

        const aPrefixOfB = a.segments.length <= b.segments.length &&
          a.segments.every((seg, idx) => b.segments[idx] === seg)
        const bPrefixOfA = b.segments.length <= a.segments.length &&
          b.segments.every((seg, idx) => a.segments[idx] === seg)

        if (!aPrefixOfB && !bPrefixOfA) {
          return `空间维度对象不在同一祖先链下（一个 path 段数组必须是另一个的前缀）: ${a.id} (${a.segments.join('/')}) 与 ${b.id} (${b.segments.join('/')})`
        }
      }
    }
  }

  return null
}
