import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'

import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { supabase } from '../services/dbService.js'
import type { ProjectScopeDimension, ScopeDimension, ScopeDimensionKey } from '../types/db.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
router.use(authenticate)

type ScopeSection = {
  key: ScopeDimensionKey
  label: string
  description: string
  options: string[]
  selected: string[]
}

const SCOPE_KEYS: ScopeDimensionKey[] = ['building', 'specialty', 'phase', 'region']

const SCOPE_DEFINITIONS: Record<
  ScopeDimensionKey,
  { label: string; description: string; fallbackLabels: Record<string, string> }
> = {
  building: {
    label: '建筑维度',
    description: '楼栋 / 建筑类型',
    fallbackLabels: {},
  },
  specialty: {
    label: '专业维度',
    description: '专项工程 / 专业分类',
    fallbackLabels: {},
  },
  phase: {
    label: '阶段维度',
    description: '项目阶段 / 里程碑阶段',
    fallbackLabels: {
      'pre-construction': '前期',
      pre_construction: '前期',
      construction: '施工',
      completion: '验收',
      delivery: '交付',
    },
  },
  region: {
    label: '区域维度',
    description: '片区 / 标段 / 区域分区',
    fallbackLabels: {},
  },
}

const DEFAULT_SCOPE_ROWS: Array<
  Pick<ScopeDimension, 'dimension_key' | 'label' | 'code' | 'is_active' | 'sort_order' | 'version'>
> = [
  { dimension_key: 'building', label: '住宅', code: null, is_active: true, sort_order: 1, version: 1 },
  { dimension_key: 'building', label: '商业', code: null, is_active: true, sort_order: 2, version: 1 },
  { dimension_key: 'building', label: '办公', code: null, is_active: true, sort_order: 3, version: 1 },
  { dimension_key: 'building', label: '工业', code: null, is_active: true, sort_order: 4, version: 1 },
  { dimension_key: 'building', label: '综合体', code: null, is_active: true, sort_order: 5, version: 1 },
  { dimension_key: 'building', label: '其他', code: null, is_active: true, sort_order: 6, version: 1 },
  { dimension_key: 'specialty', label: '土建', code: null, is_active: true, sort_order: 1, version: 1 },
  { dimension_key: 'specialty', label: '机电', code: null, is_active: true, sort_order: 2, version: 1 },
  { dimension_key: 'specialty', label: '装修', code: null, is_active: true, sort_order: 3, version: 1 },
  { dimension_key: 'specialty', label: '幕墙', code: null, is_active: true, sort_order: 4, version: 1 },
  { dimension_key: 'specialty', label: '景观', code: null, is_active: true, sort_order: 5, version: 1 },
  { dimension_key: 'specialty', label: '市政配套', code: null, is_active: true, sort_order: 6, version: 1 },
  { dimension_key: 'phase', label: '前期', code: null, is_active: true, sort_order: 1, version: 1 },
  { dimension_key: 'phase', label: '设计', code: null, is_active: true, sort_order: 2, version: 1 },
  { dimension_key: 'phase', label: '施工', code: null, is_active: true, sort_order: 3, version: 1 },
  { dimension_key: 'phase', label: '验收', code: null, is_active: true, sort_order: 4, version: 1 },
  { dimension_key: 'phase', label: '交付', code: null, is_active: true, sort_order: 5, version: 1 },
  { dimension_key: 'region', label: '一区', code: null, is_active: true, sort_order: 1, version: 1 },
  { dimension_key: 'region', label: '二区', code: null, is_active: true, sort_order: 2, version: 1 },
  { dimension_key: 'region', label: '三区', code: null, is_active: true, sort_order: 3, version: 1 },
  { dimension_key: 'region', label: '四区', code: null, is_active: true, sort_order: 4, version: 1 },
]

function now() {
  return new Date().toISOString()
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeLabels(values: unknown) {
  const items = Array.isArray(values) ? values : []
  return Array.from(new Set(items.map((item) => normalizeText(item)).filter(Boolean)))
}

function normalizeBoolean(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

function normalizeScopeKey(value: unknown): ScopeDimensionKey | null {
  const normalized = normalizeText(value) as ScopeDimensionKey
  return SCOPE_KEYS.includes(normalized) ? normalized : null
}

function normalizePhaseLabel(value?: string | null) {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return ''
  return SCOPE_DEFINITIONS.phase.fallbackLabels[normalized] || normalizeText(value)
}

function validationError(message: string): ApiResponse {
  return {
    success: false,
    error: { code: 'VALIDATION_ERROR', message },
    timestamp: now(),
  }
}

async function ensureDefaultScopeRows() {
  const timestamp = now()
  const { error } = await supabase.from('scope_dimensions').upsert(
    DEFAULT_SCOPE_ROWS.map((row) => ({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
    })),
    { onConflict: 'dimension_key,label', ignoreDuplicates: true },
  )

  if (error) {
    throw new Error(error.message)
  }
}

async function loadScopeDictionary() {
  await ensureDefaultScopeRows()

  const { data, error } = await supabase
    .from('scope_dimensions')
    .select('*')
    .order('dimension_key', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ScopeDimension[]
}

async function loadDictionaryRowById(id: string) {
  const { data, error } = await supabase.from('scope_dimensions').select('*').eq('id', id).maybeSingle()
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? null) as ScopeDimension | null
}

async function loadProjectRow(projectId: string) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle()
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? null) as Record<string, any> | null
}

async function loadProjectBindings(projectId: string) {
  const { data, error } = await supabase
    .from('project_scope_dimensions')
    .select('*')
    .eq('project_id', projectId)
    .order('dimension_key', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ProjectScopeDimension[]
}

function buildSections(
  dictionary: ScopeDimension[],
  bindings: ProjectScopeDimension[],
  projectRow: Record<string, any> | null,
): ScopeSection[] {
  const dictionaryByKey = new Map<ScopeDimensionKey, string[]>()
  const bindingByKey = new Map<ScopeDimensionKey, string[]>()

  for (const key of SCOPE_KEYS) {
    dictionaryByKey.set(
      key,
      dictionary
        .filter((row) => row.dimension_key === key && row.is_active !== false)
        .map((row) => normalizeText(row.label)),
    )
    bindingByKey.set(key, [])
  }

  for (const binding of bindings) {
    const key = normalizeScopeKey(binding.dimension_key)
    if (!key) continue
    bindingByKey.set(key, [...(bindingByKey.get(key) ?? []), normalizeText(binding.scope_dimension_label)])
  }

  const fallbackByKey: Record<ScopeDimensionKey, string[]> = {
    building: normalizeLabels(projectRow?.building_type ? [projectRow.building_type] : []),
    specialty: normalizeLabels(projectRow?.structure_type ? [projectRow.structure_type] : []),
    phase: normalizeLabels([normalizePhaseLabel(projectRow?.current_phase)]),
    region: [],
  }

  return SCOPE_KEYS.map((key) => {
    const selected = normalizeLabels(bindingByKey.get(key) ?? [])
    return {
      key,
      label: SCOPE_DEFINITIONS[key].label,
      description: SCOPE_DEFINITIONS[key].description,
      options: normalizeLabels(dictionaryByKey.get(key) ?? []),
      selected: selected.length > 0 ? selected : fallbackByKey[key],
    }
  })
}

async function ensureDictionaryLabels(key: ScopeDimensionKey, labels: string[]) {
  const normalizedLabels = normalizeLabels(labels)
  if (normalizedLabels.length === 0) {
    return new Map<string, ScopeDimension>()
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('scope_dimensions')
    .select('*')
    .eq('dimension_key', key)
    .in('label', normalizedLabels)

  if (existingError) {
    throw new Error(existingError.message)
  }

  const existingMap = new Map<string, ScopeDimension>(
    (existingRows ?? []).map((row: any) => [normalizeText(row.label), row as ScopeDimension]),
  )

  const missingLabels = normalizedLabels.filter((label) => !existingMap.has(label))
  if (missingLabels.length > 0) {
    const { data: latestRows, error: latestError } = await supabase
      .from('scope_dimensions')
      .select('sort_order')
      .eq('dimension_key', key)
      .order('sort_order', { ascending: false })
      .limit(1)

    if (latestError) {
      throw new Error(latestError.message)
    }

    const baseSortOrder = Number((latestRows?.[0] as any)?.sort_order ?? 0)
    const rowsToInsert = missingLabels.map((label, index) => ({
      id: uuidv4(),
      dimension_key: key,
      label,
      code: null,
      is_active: true,
      sort_order: baseSortOrder + index + 1,
      version: 1,
      created_at: now(),
      updated_at: now(),
    }))

    const { error: insertError } = await supabase.from('scope_dimensions').insert(rowsToInsert)
    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  const { data: mergedRows, error: mergedError } = await supabase
    .from('scope_dimensions')
    .select('*')
    .eq('dimension_key', key)
    .in('label', normalizedLabels)

  if (mergedError) {
    throw new Error(mergedError.message)
  }

  return new Map<string, ScopeDimension>(
    (mergedRows ?? []).map((row: any) => [normalizeText(row.label), row as ScopeDimension]),
  )
}

async function replaceProjectBindings(projectId: string, sections: Record<ScopeDimensionKey, string[]>) {
  for (const key of SCOPE_KEYS) {
    const labels = normalizeLabels(sections[key])
    const dictionaryMap = await ensureDictionaryLabels(key, labels)

    const { data: currentRows, error: currentError } = await supabase
      .from('project_scope_dimensions')
      .select('*')
      .eq('project_id', projectId)
      .eq('dimension_key', key)

    if (currentError) {
      throw new Error(currentError.message)
    }

    const currentBindings = (currentRows ?? []) as ProjectScopeDimension[]

    if (labels.length > 0) {
      const rowsToUpsert = labels.map((label, index) => {
        const dictionaryRow = dictionaryMap.get(label)
        if (!dictionaryRow) {
          throw new Error(`Missing scope dictionary row for label: ${label}`)
        }

        const existing = currentBindings.find((binding) => normalizeText(binding.scope_dimension_label) === label)
        return {
          id: existing?.id ?? uuidv4(),
          project_id: projectId,
          dimension_key: key,
          scope_dimension_id: dictionaryRow.id,
          scope_dimension_label: label,
          sort_order: index + 1,
          version: Number(existing?.version ?? 0) + 1 || 1,
          created_at: existing?.created_at ?? now(),
          updated_at: now(),
        }
      })

      const { error: upsertError } = await supabase
        .from('project_scope_dimensions')
        .upsert(rowsToUpsert, { onConflict: 'project_id,dimension_key,scope_dimension_label' })

      if (upsertError) {
        throw new Error(upsertError.message)
      }
    }

    const staleIds = currentBindings
      .filter((binding) => !labels.includes(normalizeText(binding.scope_dimension_label)))
      .map((binding) => binding.id)

    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase.from('project_scope_dimensions').delete().in('id', staleIds)
      if (deleteError) {
        throw new Error(deleteError.message)
      }
    }
  }
}

async function saveDictionaryRow(input: {
  dimension_key: ScopeDimensionKey
  label: string
  code?: string | null
  is_active?: boolean
  sort_order?: number | null
}) {
  const { data: existingRows, error: existingError } = await supabase
    .from('scope_dimensions')
    .select('*')
    .eq('dimension_key', input.dimension_key)
    .eq('label', input.label)
    .limit(1)

  if (existingError) {
    throw new Error(existingError.message)
  }

  const existing = (existingRows?.[0] ?? null) as ScopeDimension | null

  let sortOrder = input.sort_order ?? null
  if (sortOrder == null) {
    const { data: latestRows, error: latestError } = await supabase
      .from('scope_dimensions')
      .select('sort_order')
      .eq('dimension_key', input.dimension_key)
      .order('sort_order', { ascending: false })
      .limit(1)

    if (latestError) {
      throw new Error(latestError.message)
    }

    sortOrder = existing ? Number(existing.sort_order ?? 0) : Number((latestRows?.[0] as any)?.sort_order ?? 0) + 1
  }

  const payload = {
    id: existing?.id ?? uuidv4(),
    dimension_key: input.dimension_key,
    label: input.label,
    code: input.code ?? existing?.code ?? null,
    is_active: input.is_active ?? existing?.is_active ?? true,
    sort_order: sortOrder,
    version: Number(existing?.version ?? 0) + 1 || 1,
    created_at: existing?.created_at ?? now(),
    updated_at: now(),
  }

  if (existing) {
    const { error } = await supabase.from('scope_dimensions').update(payload).eq('id', existing.id)
    if (error) {
      throw new Error(error.message)
    }
  } else {
    const { error } = await supabase.from('scope_dimensions').insert(payload)
    if (error) {
      throw new Error(error.message)
    }
  }

  const stored = await loadDictionaryRowById(payload.id)
  if (!stored) {
    throw new Error('Failed to persist scope dictionary row')
  }

  return stored
}

async function updateDictionaryRowById(
  id: string,
  input: {
    label?: string
    code?: string | null
    is_active?: boolean
    sort_order?: number | null
  },
) {
  const existing = await loadDictionaryRowById(id)
  if (!existing) {
    throw new Error('Scope dictionary row not found')
  }

  const nextLabel = normalizeText(input.label ?? existing.label)
  if (!nextLabel) {
    throw new Error('label is required')
  }

  const { data: conflictRows, error: conflictError } = await supabase
    .from('scope_dimensions')
    .select('*')
    .eq('dimension_key', existing.dimension_key)
    .eq('label', nextLabel)
    .neq('id', id)
    .limit(1)

  if (conflictError) {
    throw new Error(conflictError.message)
  }

  if ((conflictRows ?? []).length > 0) {
    throw new Error(`Scope dimension label already exists: ${nextLabel}`)
  }

  const payload = {
    ...existing,
    label: nextLabel,
    code: input.code ?? existing.code ?? null,
    is_active: input.is_active ?? existing.is_active ?? true,
    sort_order: input.sort_order ?? existing.sort_order ?? null,
    version: Number(existing.version ?? 0) + 1 || 1,
    updated_at: now(),
  }

  const { error } = await supabase.from('scope_dimensions').update(payload).eq('id', id)
  if (error) {
    throw new Error(error.message)
  }

  const stored = await loadDictionaryRowById(id)
  if (!stored) {
    throw new Error('Failed to persist scope dictionary row')
  }

  return stored
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId)
    logger.info('Fetching scope dimensions', { projectId: projectId || null })

    const [dictionary, bindings, projectRow] = await Promise.all([
      loadScopeDictionary(),
      projectId ? loadProjectBindings(projectId) : Promise.resolve([] as ProjectScopeDimension[]),
      projectId ? loadProjectRow(projectId) : Promise.resolve(null),
    ])

    const sections = buildSections(dictionary, bindings, projectRow)

    const response: ApiResponse<{
      project_id: string | null
      sections: ScopeSection[]
      dictionary: Record<ScopeDimensionKey, string[]>
      rows: ScopeDimension[]
    }> = {
      success: true,
      data: {
        project_id: projectId || null,
        sections,
        // eslint-disable-next-line -- route-level-aggregation-approved
        dictionary: sections.reduce((acc, section) => {
          acc[section.key] = section.options
          return acc
        }, {} as Record<ScopeDimensionKey, string[]>),
        rows: dictionary,
      },
      timestamp: now(),
    }

    res.json(response)
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const dimensionKey = normalizeScopeKey(req.body?.dimension_key)
    const label = normalizeText(req.body?.label)

    if (!dimensionKey) {
      return res.status(400).json(validationError(`dimension_key must be one of: ${SCOPE_KEYS.join(', ')}`))
    }
    if (!label) {
      return res.status(400).json(validationError('label is required'))
    }

    const row = await saveDictionaryRow({
      dimension_key: dimensionKey,
      label,
      code: normalizeNullableText(req.body?.code),
      is_active: normalizeBoolean(req.body?.is_active, true),
      sort_order: typeof req.body?.sort_order === 'number' ? req.body.sort_order : null,
    })

    const response: ApiResponse<ScopeDimension> = {
      success: true,
      data: row,
      timestamp: now(),
    }

    res.status(201).json(response)
  }),
)

router.put(
  '/rows/:id',
  asyncHandler(async (req, res) => {
    const id = normalizeText(req.params.id)
    if (!id) {
      return res.status(400).json(validationError('id is required'))
    }

    const existing = await loadDictionaryRowById(id)
    if (!existing) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scope dictionary row not found' },
        timestamp: now(),
      }
      return res.status(404).json(response)
    }

    const row = await updateDictionaryRowById(id, {
      label: normalizeText(req.body?.label) || existing.label,
      code: normalizeNullableText(req.body?.code),
      is_active: normalizeBoolean(req.body?.is_active, Boolean(existing.is_active)),
      sort_order: typeof req.body?.sort_order === 'number' ? req.body.sort_order : Number(existing.sort_order ?? 0),
    })

    const response: ApiResponse<ScopeDimension> = {
      success: true,
      data: row,
      timestamp: now(),
    }

    res.json(response)
  }),
)

router.put(
  '/:projectId',
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.params.projectId)
    if (!projectId) {
      return res.status(400).json(validationError('projectId is required'))
    }

    const sectionsInput = req.body?.sections ?? req.body ?? {}
    const nextSections: Record<ScopeDimensionKey, string[]> = {
      building: normalizeLabels(sectionsInput.building ?? sectionsInput.buildingLabels ?? []),
      specialty: normalizeLabels(sectionsInput.specialty ?? sectionsInput.specialtyLabels ?? []),
      phase: normalizeLabels(sectionsInput.phase ?? sectionsInput.phaseLabels ?? []),
      region: normalizeLabels(sectionsInput.region ?? sectionsInput.regionLabels ?? []),
    }

    logger.info('Updating scope dimensions', { projectId, nextSections })

    await replaceProjectBindings(projectId, nextSections)

    const [dictionary, bindings, projectRow] = await Promise.all([
      loadScopeDictionary(),
      loadProjectBindings(projectId),
      loadProjectRow(projectId),
    ])

    const sections = buildSections(dictionary, bindings, projectRow)

    const response: ApiResponse<{
      project_id: string
      sections: ScopeSection[]
      dictionary: Record<ScopeDimensionKey, string[]>
      rows: ScopeDimension[]
    }> = {
      success: true,
      data: {
        project_id: projectId,
        sections,
        // eslint-disable-next-line -- route-level-aggregation-approved
        dictionary: sections.reduce((acc, section) => {
          acc[section.key] = section.options
          return acc
        }, {} as Record<ScopeDimensionKey, string[]>),
        rows: dictionary,
      },
      timestamp: now(),
    }

    res.json(response)
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = normalizeText(req.params.id)
    if (!id) {
      return res.status(400).json(validationError('id is required'))
    }

    const existing = await loadDictionaryRowById(id)
    if (!existing) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scope dictionary row not found' },
        timestamp: now(),
      }
      return res.status(404).json(response)
    }

    const { error } = await supabase.from('scope_dimensions').delete().eq('id', id)
    if (error) {
      throw new Error(error.message)
    }

    const response: ApiResponse = {
      success: true,
      timestamp: now(),
    }

    res.json(response)
  }),
)

export default router
