// Projects API routes

import { Router } from 'express'
import { z } from 'zod'
import { SupabaseService } from '../services/supabaseService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate, validateIdParam, projectPatchSchema, projectSchema, projectUpdateSchema } from '../middleware/validation.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate, requireProjectMember, requireProjectOwner } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Project } from '../types/db.js'
import { clearProjectCompanyIdCache, ensureDefaultCompanyForUser, getCurrentCompanyMembership, getVisibleProjectIds } from '../auth/access.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { dataQualityService } from '../services/dataQualityService.js'
import { getProjectBootstrap } from '../services/projectBootstrapService.js'
import { bootstrapEngineeringObjects } from '../services/engineeringObjectService.js'
import { refreshLiveProjectGenerationFactsFromProjectState } from '../services/projectGenerationFactsStoreService.js'
import {
  CommercialOperationError,
  createProjectUnderCommercialGuard,
} from '../services/commercialTransactionService.js'
import { BoundedStaleCache } from '../services/boundedStaleCache.js'

const router = Router()
const supabase = new SupabaseService()
const PROJECT_LIST_CACHE_TTL_MS = Number(process.env.PROJECT_LIST_CACHE_TTL_MS ?? 300_000)
const PROJECT_LIST_STALE_TTL_MS = Number(process.env.PROJECT_LIST_STALE_TTL_MS ?? 600_000)
const PROJECT_LIST_COMPANY_CACHE_MAX_ENTRIES = Number(process.env.PROJECT_LIST_COMPANY_CACHE_MAX_ENTRIES ?? 100)
const PROJECT_LIST_USER_CACHE_MAX_ENTRIES = Number(process.env.PROJECT_LIST_USER_CACHE_MAX_ENTRIES ?? 500)
const PROJECT_DELETE_CONFIRMATION_HEADER = 'x-workbuddy-confirm-action'

const projectLinkedTasksParamsSchema = z.object({
  id: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
})

type LinkedTaskItem = {
  id: string
  title: string
  status: string | null
  progress: number | null
  assignee_name: string | null
  planned_end_date: string | null
}

let projectListCacheByCompany = new BoundedStaleCache<Project[]>(PROJECT_LIST_COMPANY_CACHE_MAX_ENTRIES)
let projectListCacheByUser = new BoundedStaleCache<Project[]>(PROJECT_LIST_USER_CACHE_MAX_ENTRIES)

type LinkedTaskRow = Omit<LinkedTaskItem, 'assignee_name' | 'planned_end_date'> & {
  assignee?: string | null
  assignee_name?: string | null
  end_date?: string | null
  planned_end_date?: string | null
  updated_at?: string | null
}

async function bootstrapProjectDefaults(projectId: string) {
  try {
    const objects = await bootstrapEngineeringObjects(projectId)
    logger.info('Project engineering objects bootstrapped', { projectId, count: objects.length })
  } catch (error) {
    logger.warn('Project engineering objects bootstrap skipped', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function refreshProjectGenerationFacts(projectId: string, source: string) {
  await refreshLiveProjectGenerationFactsFromProjectState({ projectId, source }).catch((error) => {
    logger.warn('Project generation facts refresh skipped', {
      projectId,
      source,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

async function resolveProjectCreationCompanyId(userId: string, requestedCompanyId?: string | null) {
  const membership = await getCurrentCompanyMembership(userId, requestedCompanyId)
  if (membership?.companyId) {
    return membership.companyId
  }
  return ensureDefaultCompanyForUser(userId)
}

function commercialCreationError(error: unknown): ApiResponse['error'] | null {
  if (!(error instanceof CommercialOperationError)) return null
  return {
    code: error.code,
    message: error.message,
    details: {
      ...(error.details ?? {}),
      upgradePath: '/settings/billing',
    },
  }
}

function normalizeLinkedTask(row: LinkedTaskRow): LinkedTaskItem {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    status: row.status ?? null,
    progress: row.progress ?? null,
    assignee_name: row.assignee_name ?? row.assignee ?? null,
    planned_end_date: row.planned_end_date ?? row.end_date ?? null,
  }
}

function sortLinkedTasks(rows: LinkedTaskRow[]) {
  return [...rows].sort((left, right) => {
    const leftDate = left.planned_end_date ?? left.end_date ?? ''
    const rightDate = right.planned_end_date ?? right.end_date ?? ''
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)

    const leftUpdated = left.updated_at ?? ''
    const rightUpdated = right.updated_at ?? ''
    if (leftUpdated !== rightUpdated) return rightUpdated.localeCompare(leftUpdated)

    return String(left.title ?? '').localeCompare(String(right.title ?? ''), 'zh-Hans-CN')
  })
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean)
  const text = String(value ?? '').trim()
  return text ? text.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean) : []
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))]
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return null
}

function readFloorLevelNumber(object: Record<string, unknown>, metadata: Record<string, unknown>) {
  const raw = firstText(
    metadata.levelNumber,
    metadata.level_number,
    metadata.floorNumber,
    metadata.floor_number,
    metadata.floorIndex,
    metadata.floor_index,
    object.object_code,
    object.object_name,
  )
  if (!raw) return null
  const upper = raw.toUpperCase()
  const basementMatch = upper.match(/(?:^|[^A-Z0-9])B(\d{1,2})(?:$|[^A-Z0-9])/)
    ?? upper.match(/地下\s*(\d{1,2})/)
  if (basementMatch) return -Number(basementMatch[1])
  const floorMatch = upper.match(/(?:^|[^A-Z0-9])(\d{1,3})\s*F(?:$|[^A-Z0-9])/)
    ?? upper.match(/(\d{1,3})\s*层/)
  if (floorMatch) return Number(floorMatch[1])
  const number = Number(raw)
  return Number.isFinite(number) ? number : null
}

function normalizeFeatureCode(value: unknown, aliases: Record<string, string>) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  return aliases[lower] ?? aliases[raw] ?? lower.replace(/\s+/g, '_')
}

function normalizeProjectTypeCode(value: unknown) {
  return normalizeFeatureCode(value, {
    residential: 'residential',
    housing: 'residential',
    commercial: 'commercial',
    office: 'commercial',
    hospital: 'hospital',
    medical: 'hospital',
    industrial: 'industrial',
    factory: 'industrial',
    public: 'public_building',
  })
}

function normalizeStructureTypeCode(value: unknown) {
  return normalizeFeatureCode(value, {
    shear_wall: 'shear_wall',
    frame: 'frame',
    frame_shear_wall: 'frame_shear_wall',
    steel: 'steel_structure',
    steel_structure: 'steel_structure',
    prefab: 'prefab',
  })
}

function readNumberFromRecords(records: Record<string, unknown>[], keys: string[]) {
  const values = records.flatMap((record) => keys.map((key) => Number(record[key]))).filter(Number.isFinite)
  return values.length > 0 ? Math.max(...values) : null
}

function readBooleanFromRecords(records: Record<string, unknown>[], keys: string[]) {
  return records.some((record) => keys.some((key) => {
    const value = record[key]
    return value === true || value === 1 || value === '1' || String(value ?? '').toLowerCase() === 'true'
  }))
}

function readPositiveInteger(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return Math.floor(number)
  }
  return 0
}

function voteFeatureCode(values: Array<string | null>) {
  const counts = new Map<string, number>()
  values.filter(Boolean).forEach((value) => counts.set(value!, (counts.get(value!) ?? 0) + 1))
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
}

function buildInferredFloorSequence(project: Record<string, unknown> | null | undefined, floorObjects: Array<Record<string, unknown>>) {
  if (floorObjects.length > 0) {
    const sortedFloorObjects = floorObjects
      .map((object, index) => {
        const metadata = readRecord(object.metadata)
        const levelNumber = readFloorLevelNumber(object, metadata)
        return {
          object,
          index,
          levelNumber,
          isBasement: levelNumber !== null && levelNumber < 0,
        }
      })
      .sort((left, right) => {
        const leftLevel = left.levelNumber
        const rightLevel = right.levelNumber
        if (leftLevel !== null && rightLevel !== null && leftLevel !== rightLevel) return leftLevel - rightLevel
        if (leftLevel !== null && rightLevel === null) return -1
        if (leftLevel === null && rightLevel !== null) return 1
        return left.index - right.index
      })
    return {
      source: 'engineering_objects.floor',
      aboveGroundFloors: null,
      undergroundFloors: null,
      totalFloors: sortedFloorObjects.length,
      floors: sortedFloorObjects.map(({ object, levelNumber, isBasement }, index) => ({
        sequenceIndex: index,
        sequenceNumber: index + 1,
        floorObjectId: String(object.id),
        label: firstText(object.object_name, object.object_code) ?? `Floor ${index + 1}`,
        levelNumber,
        isBasement,
      })),
    }
  }

  const aboveGroundFloors = readPositiveInteger((project as any)?.above_ground_floors, (project as any)?.aboveGroundFloors)
  const undergroundFloors = readPositiveInteger((project as any)?.underground_floors, (project as any)?.undergroundFloors)
  const floors: Array<{
    sequenceIndex: number
    sequenceNumber: number
    floorObjectId: null
    label: string
    levelNumber: number
    isBasement: boolean
  }> = []

  for (let index = undergroundFloors; index >= 1; index -= 1) {
    floors.push({
      sequenceIndex: floors.length,
      sequenceNumber: floors.length + 1,
      floorObjectId: null,
      label: `B${index}`,
      levelNumber: -index,
      isBasement: true,
    })
  }

  for (let index = 1; index <= aboveGroundFloors; index += 1) {
    floors.push({
      sequenceIndex: floors.length,
      sequenceNumber: floors.length + 1,
      floorObjectId: null,
      label: `${index}F`,
      levelNumber: index,
      isBasement: false,
    })
  }

  return {
    source: floors.length > 0 ? 'projects.floor_count' : 'none',
    aboveGroundFloors,
    undergroundFloors,
    totalFloors: floors.length,
    floors,
  }
}

function buildDangerTriggerFacts(profile: Record<string, unknown>) {
  const facts: Array<{
    key: string
    label: string
    value: unknown
    threshold?: number | boolean
    unit?: string
    triggered: boolean
    source: string
  }> = []
  const addNumber = (key: string, label: string, value: unknown, threshold: number, unit: string) => {
    if (value == null) return
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return
    facts.push({ key, label, value: numeric, threshold, unit, triggered: numeric >= threshold, source: 'engineering_objects.metadata' })
  }
  const addBoolean = (key: string, label: string, value: unknown) => {
    const boolValue = value === true
    if (!boolValue) return
    facts.push({ key, label, value: true, threshold: true, triggered: true, source: 'engineering_objects.metadata' })
  }

  addNumber('foundationDepthM', 'foundation depth', profile.foundationDepthM, 3, 'm')
  addNumber('deepFoundationExpertReviewM', 'deep foundation expert review', profile.foundationDepthM, 5, 'm')
  addNumber('supportHeightM', 'formwork support height', profile.supportHeightM, 8, 'm')
  addNumber('supportLoadKnPerM2', 'formwork support load', profile.supportLoadKnPerM2, 15, 'kN/m2')
  addNumber('lineLoadKnPerM', 'formwork line load', profile.lineLoadKnPerM, 20, 'kN/m')
  addNumber('scaffoldHeightM', 'scaffold height', profile.scaffoldHeightM, 24, 'm')
  addNumber('temporaryPowerVoltageKv', 'temporary power voltage', profile.temporaryPowerVoltageKv, 10, 'kV')
  addBoolean('hasTowerCrane', 'tower crane / lifting', profile.hasTowerCrane)
  addBoolean('hasConstructionHoist', 'construction hoist', profile.hasConstructionHoist)
  addBoolean('hasCurtainWallHighWork', 'curtain wall high work', profile.hasCurtainWallHighWork)
  addBoolean('hasDemolitionWork', 'demolition work', profile.hasDemolitionWork)
  addBoolean('hasManualDugPile', 'manual dug pile', profile.hasManualDugPile)
  addBoolean('hasLargeSpanSteelHoisting', 'large span steel hoisting', profile.hasLargeSpanSteelHoisting)
  return facts.filter((fact) => fact.triggered)
}

async function inferWbsTemplateFeatures(projectId: string) {
  const [project, objects] = await Promise.all([
    executeSQLOne<Record<string, unknown>>('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]),
    executeSQL<Record<string, unknown>>(
      `SELECT id, object_type, object_code, object_name, metadata
         FROM engineering_objects
        WHERE project_id = ? AND status = 'active'
        ORDER BY object_type ASC, sort_order ASC, object_name ASC`,
      [projectId],
    ).catch(() => []),
  ])
  const projectMetadata = readRecord(project?.metadata)
  const objectMetadata = objects.map((object) => readRecord(object.metadata))
  const allMetadata = [projectMetadata, ...objectMetadata]

  const projectTypeCode = normalizeProjectTypeCode(firstText(
    projectMetadata.projectTypeCode,
    projectMetadata.project_type_code,
    (project as any)?.project_category,
    (project as any)?.project_type,
    (project as any)?.building_type,
  ))
  const structureTypeCode = voteFeatureCode(allMetadata.map((metadata) => normalizeStructureTypeCode(firstText(
    metadata.structureTypeCode,
    metadata.structure_type_code,
    metadata.structureSystem,
    metadata.structure_system,
  ))))
  const methodVariantCodes = uniqueStrings(allMetadata.flatMap((metadata) => [
    ...readStringArray(metadata.methodVariantCodes),
    ...readStringArray(metadata.method_variant_codes),
    ...readStringArray(metadata.mainMethodCodes),
    ...readStringArray(metadata.main_method_codes),
  ]))
  const elementVariantCodes = uniqueStrings(allMetadata.flatMap((metadata) => [
    ...readStringArray(metadata.elementVariantCodes),
    ...readStringArray(metadata.element_variant_codes),
    ...readStringArray(metadata.componentTypeCodes),
    ...readStringArray(metadata.component_type_codes),
  ]))
  const floorObjects = objects.filter((object) => object.object_type === 'floor')
  const floorSequence = buildInferredFloorSequence(project, floorObjects)
  const dangerProfile = {
    foundationDepthM: readNumberFromRecords(allMetadata, ['foundationDepthM', 'foundation_depth_m', 'foundationDepth', 'foundation_depth']),
    supportHeightM: readNumberFromRecords(allMetadata, ['supportHeightM', 'support_height_m', 'templateSupportHeightM', 'template_support_height_m']),
    supportLoadKnPerM2: readNumberFromRecords(allMetadata, ['supportLoadKnPerM2', 'support_load_kn_per_m2']),
    lineLoadKnPerM: readNumberFromRecords(allMetadata, ['lineLoadKnPerM', 'line_load_kn_per_m']),
    scaffoldHeightM: readNumberFromRecords(allMetadata, ['scaffoldHeightM', 'scaffold_height_m']),
    temporaryPowerVoltageKv: readNumberFromRecords(allMetadata, ['temporaryPowerVoltageKv', 'temporary_power_voltage_kv']),
    hasTowerCrane: readBooleanFromRecords(allMetadata, ['hasTowerCrane', 'has_tower_crane']),
    hasConstructionHoist: readBooleanFromRecords(allMetadata, ['hasConstructionHoist', 'has_construction_hoist']),
    hasCurtainWallHighWork: readBooleanFromRecords(allMetadata, ['hasCurtainWallHighWork', 'has_curtain_wall_high_work']),
    hasDemolitionWork: readBooleanFromRecords(allMetadata, ['hasDemolitionWork', 'has_demolition_work']),
    hasManualDugPile: readBooleanFromRecords(allMetadata, ['hasManualDugPile', 'has_manual_dug_pile']),
    hasLargeSpanSteelHoisting: readBooleanFromRecords(allMetadata, ['hasLargeSpanSteelHoisting', 'has_large_span_steel_hoisting']),
  }

  return {
    projectTypeCode,
    structureTypeCode,
    methodVariantCodes,
    elementVariantCodes,
    plannedStartDate: firstText((project as any)?.planned_start_date, (project as any)?.start_date),
    dangerTriggerFacts: buildDangerTriggerFacts(dangerProfile),
    dangerProfile,
    scopeCandidates: {
      buildingIds: objects.filter((object) => object.object_type === 'building').map((object) => String(object.id)),
      floorIds: floorObjects.map((object) => String(object.id)),
      zoneIds: objects
        .filter((object) => object.object_type === 'physical_zone' || object.object_type === 'functional_area')
        .map((object) => String(object.id)),
      phaseIds: objects.filter((object) => object.object_type === 'phase').map((object) => String(object.id)),
      floorSequence,
    },
    explanationSources: [
      projectTypeCode ? 'projects.project_type/building_type' : null,
      structureTypeCode ? 'engineering_objects.metadata.structureSystem' : null,
      methodVariantCodes.length > 0 ? 'engineering_objects.metadata.methodVariantCodes' : null,
      floorSequence.source !== 'none' ? floorSequence.source : null,
      buildDangerTriggerFacts(dangerProfile).length > 0 ? 'engineering_objects.metadata.triggerConditions' : null,
    ].filter(Boolean),
  }
}

async function getMilestoneLinkedTasks(projectId: string, milestoneTaskId: string) {
  const byParent = await executeSQL<LinkedTaskRow>(
    'SELECT * FROM tasks WHERE project_id = ? AND parent_id = ?',
    [projectId, milestoneTaskId],
  )

  const byMilestone = await executeSQL<LinkedTaskRow>(
    'SELECT * FROM tasks WHERE project_id = ? AND milestone_id = ?',
    [projectId, milestoneTaskId],
  )

  const uniqueRows = new Map<string, LinkedTaskRow>()
  for (const row of [...byParent, ...byMilestone]) {
    uniqueRows.set(String(row.id), row)
  }

  return sortLinkedTasks(Array.from(uniqueRows.values())).map(normalizeLinkedTask)
}

function normalizeCacheCompanyId(companyId?: string | null) {
  const normalized = String(companyId ?? '').trim()
  return normalized || null
}

function readPositiveDuration(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getProjectListCacheTtl() {
  const freshTtl = readPositiveDuration(PROJECT_LIST_CACHE_TTL_MS, 300_000)
  const staleTtl = readPositiveDuration(PROJECT_LIST_STALE_TTL_MS, 600_000)
  return {
    freshTtlMs: freshTtl,
    staleTtlMs: staleTtl,
  }
}

async function getCachedProjects(companyId?: string | null) {
  const now = Date.now()
  const normalizedCompanyId = normalizeCacheCompanyId(companyId)
  const cacheKey = normalizedCompanyId ? `company:${normalizedCompanyId}` : 'all'
  const cached = projectListCacheByCompany.getFresh(cacheKey, now)
  if (cached) {
    return cached
  }

  let projects: Project[]
  try {
    if (normalizedCompanyId) {
      projects = await executeSQL<Project>(
        `SELECT *
           FROM projects
          WHERE company_id = ?
          ORDER BY created_at DESC`,
        [normalizedCompanyId],
      )
    } else {
      projects = await supabase.getProjects()
    }
  } catch (error) {
    const stale = projectListCacheByCompany.getStale(cacheKey, now)
    if (!stale) throw error
    logger.warn('Project list fell back to stale company-scoped cache after read failure', {
      cacheKey,
      companyId: normalizedCompanyId,
      error: error instanceof Error ? error.message : String(error),
    })
    return stale
  }

  projectListCacheByCompany.set(cacheKey, projects, getProjectListCacheTtl(), now)
  return projects
}

async function getProjectsByIds(projectIds: string[]): Promise<Project[]> {
  const ids = Array.from(new Set(projectIds.map((id) => String(id ?? '').trim()).filter(Boolean)))
  if (ids.length === 0) return []

  return await executeSQL<Project>(
    `SELECT *
       FROM projects
      WHERE id IN (${ids.map(() => '?').join(', ')})
      ORDER BY created_at DESC`,
    ids,
  )
}

function clearProjectListCache() {
  projectListCacheByCompany.clear()
  projectListCacheByUser.clear()
}

function upsertProjectListCache(project: Project | null) {
  if (!project) return
  clearProjectListCache()
}

function removeProjectFromListCache(projectId: string) {
  if (!projectId) return
  clearProjectListCache()
}

function buildProjectListUserCacheKey(input: {
  userId?: string | null
  globalRole?: string | null
  requestedCompanyId?: string | null
  currentCompanyId?: string | null
}) {
  return [
    input.userId ?? '',
    input.globalRole ?? '',
    input.requestedCompanyId ?? '',
    input.currentCompanyId ?? '',
  ].join(':')
}

async function loadProjectListForUser(input: {
  userId?: string | null
  globalRole?: string | null
  requestedCompanyId?: string | null
  currentCompanyId?: string | null
}) {
  const visibleProjectIds = input.userId
    ? await getVisibleProjectIds(input.userId, input.globalRole, input.requestedCompanyId)
    : []
  const visibilityCacheKey = visibleProjectIds === null
    ? 'permission-bypass'
    : `visible:${Array.from(new Set(visibleProjectIds)).sort().join(',')}`
  const cacheKey = `${buildProjectListUserCacheKey(input)}:${visibilityCacheKey}`
  const now = Date.now()
  const cached = projectListCacheByUser.getFresh(cacheKey, now)
  if (cached) {
    return cached
  }

  let projects: Project[]
  try {
    projects = visibleProjectIds === null
      ? await getCachedProjects(input.requestedCompanyId ?? input.currentCompanyId ?? null)
      : await getProjectsByIds(visibleProjectIds)
  } catch (error) {
    const stale = projectListCacheByUser.getStale(cacheKey, now)
    if (!stale) throw error
    logger.warn('Project list fell back to stale user-scoped cache after read failure', {
      cacheKey,
      userId: input.userId,
      requestedCompanyId: input.requestedCompanyId,
      currentCompanyId: input.currentCompanyId,
      error: error instanceof Error ? error.message : String(error),
    })
    return stale
  }

  projectListCacheByUser.set(cacheKey, projects, getProjectListCacheTtl(), now)
  return projects
}

export async function warmProjectListCache(input: {
  userId?: string | null
  globalRole?: string | null
  requestedCompanyId?: string | null
  currentCompanyId?: string | null
}) {
  return loadProjectListForUser(input)
}

// All routes require authentication.
router.use(authenticate)

// Get all projects.
router.get('/', asyncHandler(async (req, res) => {
  logger.info('Fetching all projects')
  const requestCompanyId = getRequestCompanyId(req)
  const projects = await loadProjectListForUser({
    userId: req.user?.id,
    globalRole: req.user?.globalRole,
    requestedCompanyId: requestCompanyId,
    currentCompanyId: req.user?.currentCompanyId,
  })
  
  const response: ApiResponse<Project[]> = {
    success: true,
    data: projects,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// Export a single project's aggregate data.
router.get('/:id/export', validateIdParam, requireProjectMember(req => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Exporting project aggregate data', { id })

  const [project, tasks, risks, milestones, members, invitations] = await Promise.all([
    supabase.getProject(id),
    supabase.getTasks(id),
    supabase.getRisks(id),
    supabase.getMilestones(id),
    supabase.getMembers(id),
    supabase.getInvitations(id),
  ])

  if (!project) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const sanitizedInvitations = invitations.map((invitation) => {
    const safeInvitation = { ...invitation } as Omit<typeof invitation, 'invitation_code' | 'code'> & {
      invitation_code?: never
      code?: never
    }
    delete safeInvitation.invitation_code
    delete safeInvitation.code
    return safeInvitation
  })

  const response: ApiResponse<{
    version: string
    exportedAt: string
    projects: Project[]
    tasks: typeof tasks
    risks: typeof risks
    milestones: typeof milestones
    members: typeof members
    invitations: typeof sanitizedInvitations
  }> = {
    success: true,
    data: {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      projects: [project],
      tasks,
      risks,
      milestones,
      members,
      invitations: sanitizedInvitations,
    },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

// Project page bootstrap payload. v1.2.2 performance cleanup: merge shell init GETs into one bootstrap call.
router.get('/:id/bootstrap', validateIdParam, requireProjectMember(req => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  const changeLogLimit = Number(req.query.changeLogLimit ?? req.query.change_log_limit ?? 100)
  logger.info('Fetching project bootstrap payload', { id, changeLogLimit })

  const payload = await getProjectBootstrap(id, req.user!.id, { changeLogLimit })

  if (!payload) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<typeof payload> = {
    success: true,
    data: payload,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// Project data quality summary. Keep /api/data-quality/project-summary and add the v1.1 project-level alias.
router.get('/:id/data-quality-summary', validateIdParam, requireProjectMember(req => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  const month = String(req.query.month ?? '').trim() || undefined
  const summary = await dataQualityService.buildProjectSummary(id, month)
  const response: ApiResponse<typeof summary> = {
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/:id/inferred-features', validateIdParam, requireProjectMember(req => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Inferring WBS template generation features', { projectId: id })
  const inferred = await inferWbsTemplateFeatures(id)
  const response: ApiResponse<typeof inferred> = {
    success: true,
    data: inferred,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// Get a single project.
router.get('/:id', validateIdParam, requireProjectMember(req => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching project', { id })
  
  const project = await supabase.getProject(id)
  
  if (!project) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  
  const response: ApiResponse<Project> = {
    success: true,
    data: project,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get(
  '/:id/milestones/:taskId/linked-tasks',
  validate(projectLinkedTasksParamsSchema, 'params'),
  requireProjectMember((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const { id: projectId, taskId } = req.params
    logger.info('Fetching milestone linked tasks', { projectId, taskId })

    const task = await supabase.getTask(taskId)
    if (!task || task.project_id !== projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    const linkedTasks = await getMilestoneLinkedTasks(projectId, taskId)

    const response: ApiResponse<LinkedTaskItem[]> = {
      success: true,
      data: linkedTasks ?? [],
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

// Create project.
router.post('/', validate(projectSchema), asyncHandler(async (req, res) => {
  logger.info('Creating project', req.body)
  const companyId = await resolveProjectCreationCompanyId(req.user!.id, getRequestCompanyId(req))
  let project
  try {
    project = await createProjectUnderCommercialGuard({
      project: {
        ...req.body,
        company_id: companyId,
        owner_id: req.user?.id,
        created_by: req.user?.id,
      },
      actorUserId: req.user?.id,
    })
  } catch (error) {
    const apiError = commercialCreationError(error)
    if (!apiError) throw error
    return res.status((error as CommercialOperationError).statusCode).json({
      success: false,
      error: apiError,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  await bootstrapProjectDefaults(project.id)
  await refreshProjectGenerationFacts(project.id, 'project_create')
  clearProjectCompanyIdCache(project.id)
  upsertProjectListCache(project)
  
  const response: ApiResponse<Project> = {
    success: true,
    data: project,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// Create project with explicit ID for seed data and tests.
router.post('/with-id', validate(projectSchema), asyncHandler(async (req, res) => {
  logger.info('Creating project with specified ID', req.body)
  const companyId = await resolveProjectCreationCompanyId(req.user!.id, getRequestCompanyId(req))
  let project
  try {
    project = await createProjectUnderCommercialGuard({
      project: {
        ...req.body,
        company_id: companyId,
        owner_id: req.user?.id,
        created_by: req.user?.id,
      },
      actorUserId: req.user?.id,
    })
  } catch (error) {
    const apiError = commercialCreationError(error)
    if (!apiError) throw error
    return res.status((error as CommercialOperationError).statusCode).json({
      success: false,
      error: apiError,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  await bootstrapProjectDefaults(project.id)
  await refreshProjectGenerationFacts(project.id, 'project_create_with_id')
  clearProjectCompanyIdCache(project.id)
  upsertProjectListCache(project)
  
  const response: ApiResponse<Project> = {
    success: true,
    data: project,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// Update project.
router.put('/:id', validateIdParam, requireProjectOwner(req => req.params.id), validate(projectUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const updates = req.body
  const expectedVersion = updates.version

  logger.info('Updating project', { id, updates, expectedVersion })

  try {
    const project = await supabase.updateProject(id, updates, expectedVersion)
    clearProjectCompanyIdCache(id)
    upsertProjectListCache(project)
    
    if (!project) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    await refreshProjectGenerationFacts(id, 'project_update')
    
    const response: ApiResponse<Project> = {
      success: true,
      data: project,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    if (error.message && error.message.includes('VERSION_MISMATCH')) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VERSION_MISMATCH', message: error.message },
        timestamp: new Date().toISOString(),
      }
      return res.status(409).json(response)
    }
    throw error
  }
}))

// Patch project metadata and partial fields for non-wizard flows.
router.patch('/:id', validateIdParam, requireProjectOwner(req => req.params.id), validate(projectPatchSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const updates = req.body
  const expectedVersion = updates.version

  logger.info('Patching project', { id, updates, expectedVersion })

  try {
    const project = await supabase.updateProject(id, updates, expectedVersion)
    clearProjectCompanyIdCache(id)
    upsertProjectListCache(project)

    if (!project) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    await refreshProjectGenerationFacts(id, 'project_patch')

    const response: ApiResponse<Project> = {
      success: true,
      data: project,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    if (error.message && error.message.includes('VERSION_MISMATCH')) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VERSION_MISMATCH', message: error.message },
        timestamp: new Date().toISOString(),
      }
      return res.status(409).json(response)
    }
    throw error
  }
}))

// Delete project.
router.delete('/:id', validateIdParam, requireProjectOwner(req => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  const expectedConfirmation = `delete-project:${id}`
  if (req.get(PROJECT_DELETE_CONFIRMATION_HEADER) !== expectedConfirmation) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'PROJECT_DELETE_CONFIRMATION_REQUIRED',
        message: '删除项目需要在确认弹窗后提交与当前项目绑定的高危操作确认',
        details: {
          confirmationHeader: 'X-WorkBuddy-Confirm-Action',
          confirmationAction: 'delete-project',
        },
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  logger.info('Deleting project', { id })

  // v1.4.15: enforce retention and reject if protected.
  const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
  const retention = await enforceRetentionOrBlock({ entityType: 'project', entityId: id, projectId: id, userId: req.user?.id ?? null, userAction: 'delete' })
  if (retention.blocked) {
    return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({ success: false, error: buildRetentionBlockedApiError(retention.reason, retention.result), timestamp: new Date().toISOString() })
  }

  await supabase.deleteProject(id, {
    actorUserId: req.user!.id,
    actorUsername: req.user!.username,
    companyId: getRequestCompanyId(req),
    confirmation: {
      action: 'delete-project',
      resourceId: id,
      source: 'explicit_request_header',
    },
    requestPath: req.originalUrl.split('?')[0],
  })
  clearProjectCompanyIdCache(id)
  removeProjectFromListCache(id)
  
  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
