import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/apiClient'
import { ENGINEERING_OBJECT_TYPES, type EngineeringObject, type EngineeringObjectType } from '@/types'

export type { EngineeringObject, EngineeringObjectType }

type EngineeringObjectApiRow = Partial<EngineeringObject> & {
  project_id?: string
  object_type?: string
  object_code?: string
  object_name?: string
  parent_id?: string | null
  sort_order?: number | string | null
}

const ALLOWED_ENGINEERING_OBJECT_TYPES = new Set<string>(ENGINEERING_OBJECT_TYPES)

export interface EngineeringObjectFilters {
  projectId: string
  type?: EngineeringObjectType
  parentId?: string | null
  status?: 'active' | 'inactive' | 'all'
}

export interface CreateEngineeringObjectPayload {
  projectId: string
  objectType: EngineeringObjectType
  objectName: string
  parentId?: string | null
  sortOrder?: number
  metadata?: Record<string, unknown>
}

export interface UpdateEngineeringObjectPayload {
  objectName?: string
  parentId?: string | null
  sortOrder?: number
  status?: 'active' | 'inactive'
  metadata?: Record<string, unknown>
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function isEngineeringObjectType(value: unknown): value is EngineeringObjectType {
  return typeof value === 'string' && ALLOWED_ENGINEERING_OBJECT_TYPES.has(value)
}

function normalizeEngineeringObject(row: EngineeringObjectApiRow): EngineeringObject | null {
  const objectType = row.objectType ?? row.object_type
  if (!isEngineeringObjectType(objectType)) return null

  return {
    id: String(row.id ?? ''),
    projectId: String(row.projectId ?? row.project_id ?? ''),
    objectType,
    objectCode: String(row.objectCode ?? row.object_code ?? ''),
    objectName: String(row.objectName ?? row.object_name ?? ''),
    parentId: row.parentId ?? row.parent_id ?? null,
    path: String(row.path ?? ''),
    level: normalizeNumber(row.level, 1),
    sortOrder: normalizeNumber(row.sortOrder ?? row.sort_order, 0),
    status: (row.status ?? 'active') as 'active' | 'inactive',
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  }
}

export async function listEngineeringObjects(
  projectId: string,
  filters?: Partial<Omit<EngineeringObjectFilters, 'projectId'>>,
): Promise<EngineeringObject[]> {
  const params = new URLSearchParams({ projectId })
  if (filters?.type) params.set('type', filters.type)
  if (filters?.parentId !== undefined) params.set('parentId', filters.parentId ?? '__root__')
  if (filters?.status) params.set('status', filters.status)
  // apiClient already unwraps data.data ?? data
  const data = await apiGet<EngineeringObjectApiRow[]>(`/api/engineering-objects?${params.toString()}`, {
    runtimeCache: 'off',
  })
  return (data ?? []).map(normalizeEngineeringObject).filter((object): object is EngineeringObject => Boolean(object))
}

export async function createEngineeringObject(
  payload: CreateEngineeringObjectPayload,
): Promise<EngineeringObject> {
  const data = await apiPost<EngineeringObjectApiRow>('/api/engineering-objects', payload)
  const object = normalizeEngineeringObject(data ?? {})
  if (!object) throw new Error('工程对象类型必须是分期、标段、单体、地下室、楼层、工程区域或功能区')
  return object
}

export async function updateEngineeringObject(
  id: string,
  payload: UpdateEngineeringObjectPayload,
): Promise<EngineeringObject> {
  const data = await apiPatch<EngineeringObjectApiRow>(`/api/engineering-objects/${id}`, payload)
  const object = normalizeEngineeringObject(data ?? {})
  if (!object) throw new Error('工程对象类型必须是分期、标段、单体、地下室、楼层、工程区域或功能区')
  return object
}

export async function deleteEngineeringObject(id: string): Promise<void> {
  await apiDelete(`/api/engineering-objects/${id}`)
}

export async function bootstrapEngineeringObjects(projectId: string): Promise<EngineeringObject[]> {
  const data = await apiPost<EngineeringObjectApiRow[]>('/api/engineering-objects/bootstrap', { projectId })
  return (data ?? []).map(normalizeEngineeringObject).filter((object): object is EngineeringObject => Boolean(object))
}
