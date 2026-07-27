// WBS模板 API 路由

import { Router } from 'express'
import { executeSQL, executeSQLOne, getTask, supabase } from '../services/dbService.js'
import { getClient } from '../database.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { getCurrentCompanyMembership, getProjectCompanyId, getProjectPermissionLevel, getVisibleProjectIds } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { TaskBaselineItem, WBSTemplate } from '../types/db.js'
import { ValidationService } from '../services/validationService.js'
import { PlanningBootstrapService } from '../services/planningBootstrap.js'
import { sanitizeLegacyScopeObjectFields } from '../services/legacyScopeObjectSanitizer.js'
import { buildSuggestedWbsTemplate } from '../services/wbsTemplatePresets.js'
import { buildTemplateRecommendation } from '../services/projectFactsToTemplateService.js'
import {
  BUSINESS_TYPE_RECOMMENDATIONS,
  getBusinessTypeRecommendation,
  normalizeBusinessSubtypeCode,
  type BusinessSubtypeCode,
  type BusinessTypeCode,
} from '../services/projectTypeRecommendations.js'
import { buildWizardTemplateSelection } from '../services/wizardTemplateSelectionService.js'
import { governTaskPlanDrilldownOperation } from '../services/taskPlanDrilldownPolicyService.js'
import { materializeGeneratedTemplateRowsToBaselineItems } from '../services/wbsTemplateBaselineDraftMaterializer.js'
import { insertRowReturning, insertRows } from '../services/transactionInsertService.js'
import {
  CHINA_GB55032_TEMPLATE_ID,
  CHINA_GB55032_TEMPLATE_CODE,
  CHINA_GB55032_TEMPLATE_NAME,
  CHINA_GB55032_TEMPLATE_SOURCE_STANDARD,
  CHINA_GB55032_TEMPLATE_SOURCE_VERSION,
  buildTemplateGenerateCreateOperations,
  generateWbsTemplatePhaseChainRows,
  generateWbsTemplateRows,
  getWbsTemplateCatalogItem,
  listWbsTemplateCatalog,
  loadWbsTemplateNodes,
  validateChinaGb50300Seed,
  type GeneratedCandidateNetworkEvaluation,
  type GeneratedDurationAssetUtilizationSummary,
  type GeneratedTemplateRow,
  type WbsTemplateGenerationRuntimeArtifactPublication,
} from '../services/wbsTemplateGenerationService.js'
import { persistDurationLearningRuntimeConsumptions } from '../services/durationLearningRuntimeConsumptionService.js'
import type { DurationLearningRuntimePublicationQueryExec } from '../services/durationLearningRuntimePublicationService.js'
import {
  buildWbsCandidateOutboxEvent,
  enqueueDurationLearningRuntimeEvidenceBatch,
} from '../services/durationLearningRuntimeEvidenceOutboxService.js'
import { buildSpecialWorkDurationCandidateNodes } from '../services/wbsTemplateCandidateEventService.js'
import multer from 'multer'
import * as XLSX from '@e965/xlsx'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(authenticate)
const planningBootstrapService = new PlanningBootstrapService()
const WBS_TEMPLATE_IMPORT_MAX_ROWS = Number(process.env.WBS_TEMPLATE_IMPORT_MAX_ROWS ?? 1000)
const WBS_TEMPLATE_IMPORT_MAX_COLUMNS = Number(process.env.WBS_TEMPLATE_IMPORT_MAX_COLUMNS ?? 32)
const WBS_TEMPLATE_IMPORT_MAX_CELLS = Number(process.env.WBS_TEMPLATE_IMPORT_MAX_CELLS ?? 20_000)
const WBS_TEMPLATE_IMPORT_MAX_ARCHIVE_UNCOMPRESSED_BYTES = Number(process.env.WBS_TEMPLATE_IMPORT_MAX_ARCHIVE_UNCOMPRESSED_BYTES ?? 25 * 1024 * 1024)
const WBS_TEMPLATE_IMPORT_MAX_ARCHIVE_COMPRESSION_RATIO = Number(process.env.WBS_TEMPLATE_IMPORT_MAX_ARCHIVE_COMPRESSION_RATIO ?? 100)
const SPREADSHEET_FORMULA_PREFIX_PATTERN = /^[=+\-@]/

async function governAttachedTaskPlanOperation(
  projectId: string,
  operation: Record<string, unknown>,
) {
  const attachUnderRowId = String(
    operation.attachUnderRowId ?? operation.attach_under_row_id ?? '',
  ).trim()
  if (!attachUnderRowId) return operation

  const parentTask = await getTask(attachUnderRowId)
  if (!parentTask) {
    throw Object.assign(new Error('Task-plan drilldown parent task was not found.'), {
      statusCode: 404,
      code: 'TASK_PLAN_DRILLDOWN_PARENT_NOT_FOUND',
      details: { parentTaskId: attachUnderRowId },
    })
  }
  if (String(parentTask.project_id ?? '') !== projectId) {
    throw Object.assign(new Error('Task-plan drilldown parent does not belong to the requested project.'), {
      statusCode: 409,
      code: 'TASK_PLAN_DRILLDOWN_PROJECT_MISMATCH',
      details: { parentTaskId: attachUnderRowId, projectId },
    })
  }
  return governTaskPlanDrilldownOperation(parentTask as unknown as Record<string, unknown>, operation)
}

type PlanningBootstrapNode = {
  title: string
  description?: string | null
  reference_days?: number | null
  is_milestone?: boolean
  source_id?: string | null
  template_id?: string | null
  template_node_id?: string | null
  children?: PlanningBootstrapNode[]
}

function filterGeneratedRowsByScopeIndexes(rows: GeneratedTemplateRow[], scopeIndexes: number[]) {
  const scopeIndexSet = new Set(scopeIndexes)
  const rowIdSet = new Set(
    rows
      .filter((row) => scopeIndexSet.has(Number(row.values.scope_index ?? -1)))
      .map((row) => row.clientRowId),
  )
  return rows
    .filter((row) => rowIdSet.has(row.clientRowId))
    .map((row) => ({
      ...row,
      predecessorClientRowIds: row.predecessorClientRowIds.filter((clientRowId) => rowIdSet.has(clientRowId)),
      predecessorDependencies: row.predecessorDependencies.filter((dependency) => rowIdSet.has(dependency.clientRowId)),
    }))
}

async function requireCurrentCompanyAdmin(req: any, res: any, next: any) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: '请先登录' },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse)
    }

    const membership = await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    if (membership?.role !== 'company_admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '仅公司管理员可以导入或刷新全局标准模板' },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse)
    }

    next()
  } catch (error) {
    next(error)
  }
}

const WBS_TEMPLATE_FIELDS = [
  'id',
  'company_id',
  'project_id',
  'template_name',
  'template_type',
  'description',
  'wbs_nodes',
  'status',
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
  'standard_catalog_code',
  'catalog_scope',
  'created_by',
  'created_at',
  'updated_at',
].join(', ')
const WBS_TEMPLATE_SELECT = `SELECT ${WBS_TEMPLATE_FIELDS} FROM wbs_templates`
const SYSTEM_WBS_TEMPLATE_SCOPES = new Set(['national', 'global', 'system', 'system_seed', 'global_dictionary'])
const EXPLICIT_DEFAULT_MASTER_PLAN_ENTRY_CODES = new Set([
  'residential_master_plan_v2',
  'managed_frontier_default_master_plan',
  ...Object.keys(BUSINESS_TYPE_RECOMMENDATIONS).map((businessType) => `${businessType}_master_plan_entry`),
])

function normalizeOptionalProjectId(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

async function getVisibleWbsTemplateProjectIds(req: any): Promise<string[] | null> {
  if (!req.user?.id) return []
  return getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || String(value ?? '').toLowerCase() === 'true'
}

function normalizeTemplateScope(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function isSystemWbsTemplateScope(scope: { project_id?: unknown; company_id?: unknown; catalog_scope?: unknown; is_builtin?: unknown; standard_catalog_code?: unknown }) {
  const projectId = normalizeOptionalProjectId(scope.project_id)
  if (projectId) return false
  const companyId = String(scope.company_id ?? '').trim()
  if (companyId) return false

  const catalogScope = normalizeTemplateScope(scope.catalog_scope)
  return SYSTEM_WBS_TEMPLATE_SCOPES.has(catalogScope)
    || isTruthy(scope.is_builtin)
    || Boolean(String(scope.standard_catalog_code ?? '').trim())
}

function isPublishedWbsTemplateRow(template: { deleted_at?: unknown; status?: unknown; lifecycle_status?: unknown; is_default?: unknown; is_construction_default?: unknown }): boolean {
  const isActive = template.deleted_at === null || template.deleted_at === undefined
  const status = normalizeTemplateScope(template.status ?? template.lifecycle_status)
  const statusAllowsGeneration = !status || status === 'published' || status === 'active'
  const rawIsDefault = template.is_default ?? template.is_construction_default ?? false
  const isDraft = rawIsDefault === true || rawIsDefault === 1 || rawIsDefault === '1' || String(rawIsDefault).toLowerCase() === 'true'
  return isActive && statusAllowsGeneration && !isDraft
}

function isExplicitDefaultMasterPlanEntryTemplate(template: { project_id?: unknown; company_id?: unknown; catalog_scope?: unknown; is_builtin?: unknown; standard_catalog_code?: unknown; deleted_at?: unknown; status?: unknown; lifecycle_status?: unknown; is_default?: unknown; is_construction_default?: unknown }) {
  if (!isPublishedWbsTemplateRow(template)) return false
  if (!isSystemWbsTemplateScope(template)) return false
  const explicitCode = normalizeBusinessLookupText(template.standard_catalog_code)

  return EXPLICIT_DEFAULT_MASTER_PLAN_ENTRY_CODES.has(explicitCode)
}

function sanitizeWbsTemplatePayload<T>(payload: T): T {
  return sanitizeLegacyScopeObjectFields(payload).payload
}

function sanitizeImportedSpreadsheetText(value: unknown): string {
  const text = String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return ''
  return SPREADSHEET_FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text
}

function inspectZipArchiveInflationRisk(buffer: Buffer): { suspicious: boolean; uncompressedBytes: number; compressedBytes: number; ratio: number } {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    return { suspicious: false, uncompressedBytes: 0, compressedBytes: 0, ratio: 0 }
  }

  let offset = 0
  let centralDirectoryEntries = 0
  let uncompressedBytes = 0
  let compressedBytes = 0

  while (offset + 46 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      offset += 1
      continue
    }

    centralDirectoryEntries += 1
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)

    compressedBytes += compressedSize
    uncompressedBytes += uncompressedSize

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      return {
        suspicious: true,
        uncompressedBytes,
        compressedBytes,
        ratio: Number.POSITIVE_INFINITY,
      }
    }

    offset += 46 + fileNameLength + extraLength + commentLength
  }

  if (centralDirectoryEntries === 0) {
    return { suspicious: false, uncompressedBytes: 0, compressedBytes: 0, ratio: 0 }
  }

  const ratio = compressedBytes > 0 ? uncompressedBytes / compressedBytes : Number.POSITIVE_INFINITY
  return {
    suspicious: uncompressedBytes > WBS_TEMPLATE_IMPORT_MAX_ARCHIVE_UNCOMPRESSED_BYTES
      || ratio > WBS_TEMPLATE_IMPORT_MAX_ARCHIVE_COMPRESSION_RATIO,
    uncompressedBytes,
    compressedBytes,
    ratio,
  }
}

type WbsTemplateVisibilityContext = {
  currentCompanyId: string
  visibleProjectIds: string[] | null
}

async function getWbsTemplateVisibilityContext(req: any): Promise<WbsTemplateVisibilityContext> {
  const visibleProjectIds = await getVisibleWbsTemplateProjectIds(req)
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  return {
    currentCompanyId: String(membership?.companyId ?? '').trim(),
    visibleProjectIds,
  }
}

async function loadAllWbsTemplates(): Promise<WBSTemplate[]> {
  return executeSQL<WBSTemplate>(
    `${WBS_TEMPLATE_SELECT} ORDER BY created_at DESC`,
    [],
  )
}

async function loadSystemCatalogScopeWbsTemplates(): Promise<WBSTemplate[]> {
  const scopeValues = Array.from(SYSTEM_WBS_TEMPLATE_SCOPES)
  return executeSQL<WBSTemplate>(
    `${WBS_TEMPLATE_SELECT} WHERE project_id IS NULL AND company_id IS NULL AND catalog_scope IN (?, ?, ?, ?, ?) ORDER BY created_at DESC`,
    scopeValues,
  )
}

async function loadSystemBuiltinWbsTemplates(): Promise<WBSTemplate[]> {
  return executeSQL<WBSTemplate>(
    `${WBS_TEMPLATE_SELECT} WHERE project_id IS NULL AND company_id IS NULL AND is_builtin = ? ORDER BY created_at DESC`,
    [true],
  )
}

async function loadSystemStandardCodeWbsTemplates(): Promise<WBSTemplate[]> {
  return executeSQL<WBSTemplate>(
    `${WBS_TEMPLATE_SELECT} WHERE project_id IS NULL AND company_id IS NULL AND standard_catalog_code IS NOT NULL ORDER BY created_at DESC`,
    [],
  )
}

async function loadCompanyWbsTemplates(companyId: string): Promise<WBSTemplate[]> {
  return executeSQL<WBSTemplate>(
    `${WBS_TEMPLATE_SELECT} WHERE project_id IS NULL AND company_id = ? ORDER BY created_at DESC`,
    [companyId],
  )
}

async function loadProjectWbsTemplates(projectId: string): Promise<WBSTemplate[]> {
  return executeSQL<WBSTemplate>(
    `${WBS_TEMPLATE_SELECT} WHERE project_id = ? ORDER BY created_at DESC`,
    [projectId],
  )
}

function deriveWbsTemplateStatus(row: any): 'draft' | 'published' | 'disabled' {
  const isActive = row.deleted_at === null || row.deleted_at === undefined
  if (!isActive) return 'disabled'
  const status = normalizeTemplateScope(row.status ?? row.lifecycle_status)
  if (status === 'disabled') return 'disabled'
  if (status === 'draft') return 'draft'
  if (status === 'published' || status === 'active') return 'published'
  const rawIsDefault = row.is_default ?? row.is_construction_default ?? false
  const isDraft = rawIsDefault === true || rawIsDefault === 1
  return isDraft ? 'draft' : 'published'
}

function matchesWbsTemplateStatus(row: WBSTemplate, statusFilter?: string | null) {
  const status = deriveWbsTemplateStatus(row)
  if (statusFilter === 'disabled') return status === 'disabled'
  if (statusFilter === 'draft') return status === 'draft'
  if (statusFilter === 'published') return status === 'published'
  return status !== 'disabled'
}

type VisibleWbsTemplateFilters = {
  templateType?: string | null
  statusFilter?: string | null
  ids?: string[] | null
}

function mergeVisibleWbsTemplateGroups(
  groups: WBSTemplate[][],
  filters: VisibleWbsTemplateFilters = {},
): WBSTemplate[] {
  const seen = new Set<string>()
  const rows: WBSTemplate[] = []
  const templateType = String(filters.templateType ?? '').trim()
  const ids = new Set((filters.ids ?? []).map((id) => String(id).trim()).filter(Boolean))
  const hasIdFilter = ids.size > 0

  for (const group of groups) {
    for (const row of group) {
      const id = String((row as any)?.id ?? '').trim()
      const dedupeKey = id || JSON.stringify(row)
      if (seen.has(dedupeKey)) continue
      if (templateType && String((row as any)?.template_type ?? '') !== templateType) continue
      if (hasIdFilter && !ids.has(id)) continue
      if (!matchesWbsTemplateStatus(row, filters.statusFilter)) continue
      seen.add(dedupeKey)
      rows.push(row)
    }
  }

  return rows.sort((left, right) => {
    const leftTime = Date.parse(String((left as any).created_at ?? '')) || 0
    const rightTime = Date.parse(String((right as any).created_at ?? '')) || 0
    return rightTime - leftTime
  })
}

async function loadVisibleWbsTemplates(
  req: any,
  filters: VisibleWbsTemplateFilters = {},
): Promise<WBSTemplate[]> {
  const { currentCompanyId, visibleProjectIds } = await getWbsTemplateVisibilityContext(req)
  if (visibleProjectIds === null) {
    return mergeVisibleWbsTemplateGroups([await loadAllWbsTemplates()], filters)
  }

  const groups = await Promise.all([
    loadSystemCatalogScopeWbsTemplates(),
    loadSystemBuiltinWbsTemplates(),
    loadSystemStandardCodeWbsTemplates(),
    ...(currentCompanyId ? [loadCompanyWbsTemplates(currentCompanyId)] : []),
    ...visibleProjectIds.map((projectId) => loadProjectWbsTemplates(projectId)),
  ])

  return mergeVisibleWbsTemplateGroups(groups, filters)
}

type WbsTemplateAccessScope = {
  project_id?: string | null
  company_id?: string | null
  catalog_scope?: string | null
  is_builtin?: boolean | number | string | null
  standard_catalog_code?: string | null
}

async function loadWbsTemplateAccessScope(templateId: string): Promise<WbsTemplateAccessScope | null> {
  return executeSQLOne<WbsTemplateAccessScope>(
    'SELECT project_id, company_id, catalog_scope, is_builtin, standard_catalog_code FROM wbs_templates WHERE id = ? LIMIT 1',
    [templateId],
  )
}

function sendWbsTemplateNotFound(res: any) {
  return res.status(404).json({
    success: false,
    error: { code: 'TEMPLATE_NOT_FOUND', message: 'WBS模板不存在' },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}

async function ensureWbsTemplateVisible(req: any, res: any, templateId: string): Promise<boolean> {
  const scope = await loadWbsTemplateAccessScope(templateId)
  if (!scope) {
    sendWbsTemplateNotFound(res)
    return false
  }

  const projectId = normalizeOptionalProjectId(scope.project_id)
  if (!projectId) {
    if (isSystemWbsTemplateScope(scope)) return true
    const membership = req.user?.id
      ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
      : null
    const currentCompanyId = String(membership?.companyId ?? '').trim()
    const templateCompanyId = String(scope.company_id ?? '').trim()
    if (currentCompanyId && templateCompanyId && currentCompanyId === templateCompanyId) return true

    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '您没有权限访问此WBS模板' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
    return false
  }

  const visibleProjectIds = await getVisibleWbsTemplateProjectIds(req)
  if (visibleProjectIds === null || visibleProjectIds.includes(projectId)) {
    return true
  }

  res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: '您没有权限访问此WBS模板' },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
  return false
}

async function ensureWbsTemplateEditable(req: any, res: any, templateId: string): Promise<boolean> {
  const scope = await loadWbsTemplateAccessScope(templateId)
  if (!scope) {
    sendWbsTemplateNotFound(res)
    return false
  }

  const projectId = normalizeOptionalProjectId(scope.project_id)
  if (!projectId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'GLOBAL_TEMPLATE_WRITE_FORBIDDEN',
        message: '全局标准模板不能通过旧模板接口修改，请使用标准库治理流程',
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
    return false
  }

  const permissionLevel = req.user?.id
    ? await getProjectPermissionLevel(req.user.id, projectId, getRequestCompanyId(req))
    : null
  if (permissionLevel === 'owner' || permissionLevel === 'editor') {
    return true
  }

  res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: '您没有编辑此WBS模板的权限' },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
  return false
}

const PROJECT_BOOTSTRAP_FIELDS = [
  'id',
  'company_id',
  'name',
  'status',
  'project_type',
  'building_type',
  'structure_type',
  'building_count',
  'above_ground_floors',
  'underground_floors',
  'total_area',
  'planned_start_date',
  'planned_end_date',
  'start_date',
  'actual_start_date',
  'current_phase',
  'default_wbs_generated',
  'metadata',
].join(', ')
const PROJECT_BOOTSTRAP_SELECT = `SELECT ${PROJECT_BOOTSTRAP_FIELDS} FROM projects`
const BOOTSTRAP_TASK_FIELDS = [
  'id',
  'parent_id',
  'title',
  'description',
  'is_milestone',
  'template_id',
  'template_node_id',
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

function getSpreadsheetImportProjectId(req: any): string | undefined {
  const projectId = String(req.query?.project_id ?? req.query?.projectId ?? '').trim()
  return projectId || undefined
}

// 字段映射：将数据库字段名转换为前端期望的字段名
function mapTemplateFields(row: any) {
  const isActive = row.deleted_at === null || row.deleted_at === undefined
  const companyId = row.company_id ?? row.companyId ?? null
  // is_construction_default 是数据库里实际存在的列，is_default 可能不存在
  const rawIsDefault = row.is_default ?? row.is_construction_default ?? false
  const isDraft = rawIsDefault === true || rawIsDefault === 1
  const dbStatus = normalizeTemplateScope(row.status ?? row.lifecycle_status)
  const status: 'draft' | 'published' | 'disabled' =
    !isActive || dbStatus === 'disabled'
      ? 'disabled'
      : dbStatus === 'draft'
        ? 'draft'
        : dbStatus === 'published' || dbStatus === 'active'
          ? 'published'
          : isDraft
            ? 'draft'
            : 'published'
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
    company_id: companyId,
    companyId,
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
    // eslint-disable-next-line -- route-level-aggregation-approved
    total += 1
    if (Array.isArray(node.children) && node.children.length > 0) {
      total += countPlanningNodes(node.children)
    }
  }
  return total
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return readRecord(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean)
  const text = normalizeText(value)
  return text ? text.split(',').map((item) => normalizeText(item)).filter(Boolean) : []
}

function readProjectGenerationFacts(metadata: Record<string, unknown>): Record<string, unknown> {
  return readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts)
}

function readDefaultMasterPlanProjectFeatures(metadata: Record<string, unknown>, generationFacts: Record<string, unknown>) {
  return {
    ...readRecord(generationFacts.projectFeatures ?? generationFacts.project_features),
    ...readRecord(metadata.projectFeatures ?? metadata.project_features),
  } as Record<string, number | boolean | string | string[] | unknown>
}

function readPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function inferStructureTypeCode(value: unknown) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized.includes('frame_shear') || normalized.includes('框架剪力墙') || normalized.includes('剪力墙')) return 'frame_shear'
  if (normalized.includes('steel') || normalized.includes('钢结构')) return 'steel_frame'
  if (normalized.includes('precast') || normalized.includes('装配')) return 'precast_concrete'
  return normalized || 'frame_shear'
}

const DEFAULT_MASTER_PLAN_BUSINESS_TYPE_CODES = Object.keys(BUSINESS_TYPE_RECOMMENDATIONS) as BusinessTypeCode[]
const DEFAULT_MASTER_PLAN_BUSINESS_TYPE_SET = new Set<string>(DEFAULT_MASTER_PLAN_BUSINESS_TYPE_CODES)
const DEFAULT_MASTER_PLAN_BUSINESS_TYPE_ALIASES: Record<BusinessTypeCode, string[]> = {
  general_civil: ['general_civil', 'civil', 'civil_building', '民用', '民用建筑', '住宅', '住宅开发', 'residential', 'civil_residential', 'commercial_complex', '综合体', '商办'],
  hotel: ['hotel', '酒店', '酒店工程'],
  hospital: ['hospital', '医院', '医院建设', '医疗', '医疗建筑'],
  school: ['school', '学校', '教育', '校园', '教学楼'],
  industrial: ['industrial', '工业', '工业建筑', '厂房', '物流仓储'],
  data_center: ['data_center', 'datacenter', '数据中心', '机房楼'],
  transportation_hub: ['transportation_hub', 'transportation', '交通枢纽', '枢纽', '站房'],
  sports_culture: ['sports_culture', 'sports', 'culture', '体育文化', '场馆', '文体建筑'],
  tod_upper_cover: ['tod_upper_cover', 'tod', 'tod上盖', '上盖', '轨交上盖'],
  renovation: ['renovation', '改造', '修缮', '既有建筑', '加固'],
  modular_building: ['modular_building', 'modular', '模块化', 'mic', '装配式模块'],
}

type DefaultMasterPlanBootstrapProfile = {
  businessType: BusinessTypeCode
  businessSubtype: BusinessSubtypeCode | null
  projectTypeCode: string
  generationMode: 'residential_master_plan_v2' | 'managed_frontier_default_master_plan'
  sourceVersionLabel: 'residential_master_plan_v2' | 'managed_frontier_default_master_plan'
}

function normalizeBusinessLookupText(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function resolveDefaultMasterPlanBusinessType(...values: unknown[]): BusinessTypeCode | null {
  const normalizedValues = values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => normalizeBusinessLookupText(value))
    .filter(Boolean)

  for (const value of normalizedValues) {
    if (DEFAULT_MASTER_PLAN_BUSINESS_TYPE_SET.has(value)) return value as BusinessTypeCode
    if (value === 'civil_residential' || value === 'residential') return 'general_civil'
  }

  for (const businessType of DEFAULT_MASTER_PLAN_BUSINESS_TYPE_CODES) {
    const aliases = DEFAULT_MASTER_PLAN_BUSINESS_TYPE_ALIASES[businessType]
    if (normalizedValues.some((value) => aliases.some((alias) => {
      const normalizedAlias = normalizeBusinessLookupText(alias)
      return value === normalizedAlias || value.includes(normalizedAlias)
    }))) {
      return businessType
    }
  }

  return null
}

function resolveResidentialBusinessSubtype(...values: unknown[]): BusinessSubtypeCode | null {
  const normalizedValues = values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => normalizeBusinessLookupText(value))
    .filter(Boolean)
  return normalizedValues.some((value) => (
    value.includes('residential')
    || value.includes('civil_residential')
    || value.includes('住宅')
  ))
    ? 'civil_residential'
    : null
}

function resolveDefaultMasterPlanBootstrapProfile(project: any, template: any): DefaultMasterPlanBootstrapProfile | null {
  const metadata = readRecord(project?.metadata)
  const generationFacts = readProjectGenerationFacts(metadata)
  const projectFeatures = readDefaultMasterPlanProjectFeatures(metadata, generationFacts)
  const projectValues = [
    project?.project_type,
    project?.building_type,
    metadata.wizard_business_type,
    metadata.wizardBusinessType,
    metadata.businessType,
    metadata.business_type,
    generationFacts.businessType,
    generationFacts.business_type,
    metadata.projectTypeCode,
    metadata.project_type_code,
    generationFacts.projectTypeCode,
    generationFacts.project_type_code,
    metadata.functionalUsageCodes,
    metadata.functional_usage_codes,
    generationFacts.functionalUsageCodes,
    generationFacts.functional_usage_codes,
    generationFacts.functionalCategoryCodes,
    generationFacts.functional_category_codes,
    metadata.functionalCategoryCodes,
    metadata.functional_category_codes,
    projectFeatures.functionalUsageCodes,
    projectFeatures.functional_usage_codes,
    projectFeatures.functionalCategoryCodes,
    projectFeatures.functional_category_codes,
  ]
  const templateValues = [
    template?.template_type,
    template?.category,
    template?.template_name,
    template?.name,
  ]
  const projectBusinessType = resolveDefaultMasterPlanBusinessType(...projectValues)
  if (!projectBusinessType) return null

  if (!isExplicitDefaultMasterPlanEntryTemplate(template)) return null

  const templateBusinessType = resolveDefaultMasterPlanBusinessType(...templateValues)
  if (!templateBusinessType || templateBusinessType !== projectBusinessType) {
    return null
  }

  const explicitSubtype = normalizeBusinessSubtypeCode(
    metadata.businessSubtype
      ?? metadata.business_subtype
      ?? metadata.wizard_business_subtype
      ?? metadata.wizardBusinessSubtype
      ?? generationFacts.businessSubtype
      ?? generationFacts.business_subtype,
  )
  const residentialSubtype = resolveResidentialBusinessSubtype(...projectValues, ...templateValues)
  const businessSubtype = explicitSubtype ?? (
    projectBusinessType === 'general_civil' ? residentialSubtype : null
  )
  const rawProjectTypeCode = normalizeBusinessLookupText(
    metadata.projectTypeCode
      ?? metadata.project_type_code
      ?? generationFacts.projectTypeCode
      ?? generationFacts.project_type_code,
  )
  const projectTypeCode = rawProjectTypeCode
    || (businessSubtype === 'civil_residential' ? 'residential' : projectBusinessType)
  const isResidentialV2 = projectBusinessType === 'general_civil'
    && (
      businessSubtype === 'civil_residential'
      || projectTypeCode === 'residential'
      || Boolean(residentialSubtype)
    )
  const generationMode = isResidentialV2
    ? 'residential_master_plan_v2'
    : 'managed_frontier_default_master_plan'

  return {
    businessType: projectBusinessType,
    businessSubtype,
    projectTypeCode,
    generationMode,
    sourceVersionLabel: generationMode,
  }
}

function uniqueNormalizedStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values.map((item) => normalizeText(item)).filter(Boolean)) {
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function readProjectStringArray(metadata: Record<string, unknown>, projectFeatures: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return uniqueNormalizedStrings([
    ...readStringArray(metadata[camelKey] ?? metadata[snakeKey]),
    ...readStringArray(projectFeatures[camelKey] ?? projectFeatures[snakeKey]),
  ])
}

function buildDefaultMasterPlanFacts(project: any, profile: DefaultMasterPlanBootstrapProfile) {
  const metadata = readRecord(project?.metadata)
  const generationFacts = readProjectGenerationFacts(metadata)
  const projectFeatures = readDefaultMasterPlanProjectFeatures(metadata, generationFacts)
  const recommendation = getBusinessTypeRecommendation(profile.businessType)
  const selectedMethodVariantCodes = readStringArray(
    metadata.methodVariantCodes
      ?? metadata.method_variant_codes
      ?? generationFacts.methodVariantCodes
      ?? generationFacts.method_variant_codes,
  )
  const foundationFormCodes = uniqueNormalizedStrings([
    ...readStringArray(metadata.foundationFormCodes ?? metadata.foundation_form_codes),
    ...readStringArray(generationFacts.foundationFormCodes ?? generationFacts.foundation_form_codes),
    ...readStringArray(projectFeatures.foundationFormCodes ?? projectFeatures.foundation_form_codes),
  ])
  if (foundationFormCodes.length > 0) {
    projectFeatures.foundationFormCodes = foundationFormCodes
  }
  const methodVariantCodes = uniqueNormalizedStrings([
    ...(selectedMethodVariantCodes.length > 0 ? selectedMethodVariantCodes : recommendation.defaultMethods),
    ...foundationFormCodes,
  ])
  const buildingCount = Math.max(1, Math.round(readPositiveNumber(
    metadata.buildingCount,
    metadata.building_count,
    generationFacts.buildingCount,
    generationFacts.building_count,
    project?.building_count,
  ) ?? 1))
  const standardFloorCount = Math.round(readPositiveNumber(
    metadata.standardFloorCount,
    metadata.standard_floor_count,
    generationFacts.standardFloorCount,
    generationFacts.standard_floor_count,
    project?.above_ground_floors,
  ) ?? 26)
  const basementLevelCount = Math.round(readPositiveNumber(
    metadata.basementLevelCount,
    metadata.basement_level_count,
    generationFacts.basementLevelCount,
    generationFacts.basement_level_count,
    project?.underground_floors,
  ) ?? 1)

  return {
    businessType: profile.businessType,
    businessSubtype: profile.businessSubtype,
    projectTypeCode: profile.projectTypeCode,
    structureTypeCode: inferStructureTypeCode(
      metadata.structureTypeCode
        ?? metadata.structure_type_code
        ?? generationFacts.structureTypeCode
        ?? generationFacts.structure_type_code
        ?? project?.structure_type,
    ),
    methodVariantCodes,
    planScopeCaliber: normalizeText(metadata.planScopeCaliber ?? metadata.plan_scope_caliber ?? generationFacts.planScopeCaliber ?? generationFacts.plan_scope_caliber) || 'full_project_master',
    deliveryStandard: normalizeText(metadata.deliveryStandard ?? metadata.delivery_standard ?? generationFacts.deliveryStandard ?? generationFacts.delivery_standard) || 'full_fitout',
    terminalEvent: normalizeText(metadata.terminalEvent ?? metadata.terminal_event ?? generationFacts.terminalEvent ?? generationFacts.terminal_event) || 'completion_acceptance',
    prefabSystemCodes: readProjectStringArray(metadata, projectFeatures, 'prefabSystemCodes', 'prefab_system_codes'),
    elementVariantCodes: readProjectStringArray(metadata, projectFeatures, 'elementVariantCodes', 'element_variant_codes'),
    externalInterfaceCodes: readProjectStringArray(metadata, projectFeatures, 'externalInterfaceCodes', 'external_interface_codes'),
    hardConstraintCodes: readProjectStringArray(metadata, projectFeatures, 'hardConstraintCodes', 'hard_constraint_codes'),
    projectFeatures,
    detailLevel: 'standard',
    plannedEndDate: normalizeText(project?.planned_end_date) || null,
    buildingCount,
    standardFloorCount,
    highestBuildingFloorCount: Math.round(readPositiveNumber(
      metadata.highestBuildingFloorCount,
      metadata.highest_building_floor_count,
      generationFacts.highestBuildingFloorCount,
      generationFacts.highest_building_floor_count,
      project?.above_ground_floors,
    ) ?? standardFloorCount),
    basementLevelCount,
    totalAreaM2: readPositiveNumber(metadata.totalAreaM2, metadata.total_area_m2, generationFacts.totalAreaM2, generationFacts.total_area_m2, project?.total_area),
    aboveGroundAreaM2: readPositiveNumber(metadata.aboveGroundAreaM2, metadata.above_ground_area_m2, generationFacts.aboveGroundAreaM2, generationFacts.above_ground_area_m2),
    basementAreaM2: readPositiveNumber(metadata.basementAreaM2, metadata.basement_area_m2, generationFacts.basementAreaM2, generationFacts.basement_area_m2),
    siteAreaM2: readPositiveNumber(metadata.siteAreaM2, metadata.site_area_m2, generationFacts.siteAreaM2, generationFacts.site_area_m2),
    foundationDepthM: readPositiveNumber(metadata.foundationDepthM, metadata.foundation_depth_m, generationFacts.foundationDepthM, generationFacts.foundation_depth_m),
    prefabRate: readPositiveNumber(metadata.prefabRate, metadata.prefab_rate, generationFacts.prefabRate, generationFacts.prefab_rate),
    maxSpanM: readPositiveNumber(metadata.maxSpanM, metadata.max_span_m, generationFacts.maxSpanM, generationFacts.max_span_m),
    supportHeightM: readPositiveNumber(metadata.supportHeightM, metadata.support_height_m, generationFacts.supportHeightM, generationFacts.support_height_m),
    hasCivilDefense: typeof metadata.hasCivilDefense === 'boolean'
      ? metadata.hasCivilDefense
      : typeof metadata.has_civil_defense === 'boolean'
        ? metadata.has_civil_defense
        : typeof generationFacts.hasCivilDefense === 'boolean'
          ? generationFacts.hasCivilDefense
          : typeof generationFacts.has_civil_defense === 'boolean'
            ? generationFacts.has_civil_defense
            : null,
    towerCraneCount: readPositiveNumber(metadata.towerCraneCount, metadata.tower_crane_count, generationFacts.towerCraneCount, generationFacts.tower_crane_count),
    constructionHoistCount: readPositiveNumber(metadata.constructionHoistCount, metadata.construction_hoist_count, generationFacts.constructionHoistCount, generationFacts.construction_hoist_count),
    buildingPatternCodes: readProjectStringArray(metadata, projectFeatures, 'buildingPatternCodes', 'building_pattern_codes'),
    functionalUsageCodes: readProjectStringArray(metadata, projectFeatures, 'functionalUsageCodes', 'functional_usage_codes'),
    floorUsageCodes: readProjectStringArray(metadata, projectFeatures, 'floorUsageCodes', 'floor_usage_codes'),
    functionalCategoryCodes: readProjectStringArray(metadata, projectFeatures, 'functionalCategoryCodes', 'functional_category_codes'),
    specialRoomTypeCodes: readProjectStringArray(metadata, projectFeatures, 'specialRoomTypeCodes', 'special_room_type_codes'),
    physicalZoneTypeCodes: readProjectStringArray(metadata, projectFeatures, 'physicalZoneTypeCodes', 'physical_zone_type_codes'),
  }
}

async function getProjectBootstrapBundle(projectId: string) {
  const [project, tasksResponse] = await Promise.all([
    executeSQLOne(`${PROJECT_BOOTSTRAP_SELECT} WHERE id = ? LIMIT 1`, [projectId]),
    supabase.from('tasks').select(BOOTSTRAP_TASK_FIELDS).eq('project_id', projectId),
  ])

  if (!project) {
    return null
  }

  if (tasksResponse.error) throw new Error(tasksResponse.error.message)

  const tasks = (tasksResponse.data ?? []) as any[]
  const milestones = tasks.filter((task) => task.is_milestone === true)

  const context = planningBootstrapService.buildContext({
    project: project as any,
    tasks,
    milestones,
  })

  return {
    project: project as any,
    tasks,
    milestones,
    context,
  }
}

async function insertBaselineDraftFromGeneratedRows(params: {
  projectId: string
  title: string
  description?: string | null
  sourceType: 'manual' | 'current_schedule' | 'imported_file' | 'carryover'
  sourceVersionLabel?: string | null
  governanceMetadata?: Record<string, unknown> | null
  rows: GeneratedTemplateRow[]
  beforeCommit?: (context: {
    queryExec: DurationLearningRuntimePublicationQueryExec
    baselineId: string
    items: TaskBaselineItem[]
  }) => Promise<void>
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const version = null
    const baselineId = uuidv4()
    const now = new Date().toISOString()
    const persistStartedAt = Date.now()
    let beginElapsedMs: number | null = null
    let baselineElapsedMs: number | null = null
    let itemElapsedMs: number | null = null
    let itemCount: number | null = null
    let itemPayloadBytes: number | null = null

    const client = await getClient()
    try {
      const beginStartedAt = Date.now()
      await client.query('BEGIN')
      beginElapsedMs = Date.now() - beginStartedAt

      const baselineStartedAt = Date.now()
      const baselineRow = await insertRowReturning<any>(client, 'task_baselines', {
        id: baselineId,
        project_id: params.projectId,
        version,
        status: 'draft',
        title: params.title,
        description: params.description ?? null,
        source_type: params.sourceType,
        source_version_label: params.sourceVersionLabel ?? null,
        governance_metadata: params.governanceMetadata ?? {},
        created_at: now,
        updated_at: now,
      }, { jsonColumns: ['governance_metadata'] })
      baselineElapsedMs = Date.now() - baselineStartedAt

      const items = materializeGeneratedTemplateRowsToBaselineItems({
        rows: params.rows,
        projectId: params.projectId,
        baselineVersionId: baselineId,
        capturedAt: now,
      })
      itemCount = items.length
      itemPayloadBytes = Buffer.byteLength(JSON.stringify(items), 'utf8')
      const itemStartedAt = Date.now()
      if (items.length > 0) {
        await insertRows(client, 'task_baseline_items', items)
      }
      itemElapsedMs = Date.now() - itemStartedAt

      if (params.beforeCommit) {
        const queryExec: DurationLearningRuntimePublicationQueryExec = async <T = Record<string, unknown>>(
          sql: string,
          queryParams: unknown[] = [],
        ) => {
          // database-query-dynamic-approved: canonical 315 consumption and 323 outbox writers own fixed parameterized SQL; this adapter binds them to baseline materialization.
          const result = await client.query(sql, queryParams)
          return (result.rows ?? []) as T[]
        }
        await params.beforeCommit({ queryExec, baselineId, items })
      }

      const commitStartedAt = Date.now()
      await client.query('COMMIT')
      logger.info('Default master plan baseline draft persisted', {
        projectId: params.projectId,
        baselineId,
        itemCount: items.length,
        itemPayloadBytes,
        beginElapsedMs,
        baselineElapsedMs,
        itemElapsedMs,
        commitElapsedMs: Date.now() - commitStartedAt,
        totalElapsedMs: Date.now() - persistStartedAt,
      })

      return {
        baseline: baselineRow ?? {
          id: baselineId,
          project_id: params.projectId,
          version,
          status: 'draft',
          title: params.title,
          description: params.description ?? null,
          source_type: params.sourceType,
          source_version_label: params.sourceVersionLabel ?? null,
          governance_metadata: params.governanceMetadata ?? {},
          created_at: now,
          updated_at: now,
        },
        items,
      }
    } catch (error: any) {
      logger.warn('Default master plan baseline draft persistence failed', {
        projectId: params.projectId,
        baselineId,
        attempt,
        errorCode: error?.code ?? null,
        errorMessage: error instanceof Error ? error.message : String(error),
        itemCount,
        itemPayloadBytes,
        beginElapsedMs,
        baselineElapsedMs,
        itemElapsedMs,
        totalElapsedMs: Date.now() - persistStartedAt,
      })
      await client.query('ROLLBACK').catch(() => undefined)
      if (error?.code === '23505' && attempt < 2) continue
      throw error
    } finally {
      client.release()
    }
  }

  throw new Error('创建项目基线失败，请稍后重试')
}

function isDefaultMasterPlanPrimaryScheduleRow(row: GeneratedTemplateRow) {
  const metadata = readRecord(row.values.standard_task_metadata)
  const projectionMode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode)
  const participation = normalizeText(row.scheduleParticipation ?? row.values.schedule_participation ?? metadata.scheduleParticipation)
  return projectionMode === 'schedule_row'
    && (!participation || participation === 'normal' || participation === 'primary_schedule')
}

function tagGeneratedRowsForBaselineDraft(rows: GeneratedTemplateRow[], source: DefaultMasterPlanBootstrapProfile['sourceVersionLabel']) {
  return rows.map((row) => {
    const metadata = readRecord(row.values.standard_task_metadata)
    const rowSource = normalizeText(row.values.source_type ?? metadata.source) || source
    const projectionMode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode)
    const participation = normalizeText(row.scheduleParticipation ?? row.values.schedule_participation ?? metadata.scheduleParticipation)
    const scheduleParticipation = projectionMode === 'schedule_row' && (!participation || participation === 'normal')
      ? 'primary_schedule'
      : participation
    return {
      ...row,
      ...(scheduleParticipation ? { scheduleParticipation } : {}),
      values: {
        ...row.values,
        source_type: rowSource,
        ...(scheduleParticipation ? { schedule_participation: scheduleParticipation } : {}),
        standard_task_metadata: {
          ...metadata,
          source: rowSource,
          baselineSourceVersionLabel: source,
          ...(scheduleParticipation ? {
            scheduleParticipation,
            schedule_participation: scheduleParticipation,
          } : {}),
        },
      },
    }
  })
}

const DEFAULT_MASTER_PLAN_CANDIDATE_DURATION_CALIBRATION_SOURCES = new Set([
  'cold_start_baseline',
  'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
])

function summarizeDefaultMasterPlanGenerationQuality(
  rows: GeneratedTemplateRow[],
  durationAssetUtilizationSummary?: GeneratedDurationAssetUtilizationSummary | null,
  candidateNetworkEvaluation?: GeneratedCandidateNetworkEvaluation | null,
) {
  const scheduleRows = rows.filter(isDefaultMasterPlanPrimaryScheduleRow)
  const durationEvidenceRows = scheduleRows.filter((row) => (
    normalizeText(row.values.duration_evidence_source) === 'candidate_default_master_plan_baseline'
    && DEFAULT_MASTER_PLAN_CANDIDATE_DURATION_CALIBRATION_SOURCES.has(normalizeText(row.values.duration_calibration_source))
  ))
  const durationCalibrationSources = uniqueNormalizedStrings(durationEvidenceRows
    .map((row) => normalizeText(row.values.duration_calibration_source))
    .filter(Boolean))
  const primaryDurationCalibrationSource = durationCalibrationSources.includes('standard_work_duration_seed+t2_rhythm_template+real_plan_evidence')
    ? 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence'
    : durationCalibrationSources[0] ?? 'cold_start_baseline'
  const usesAssetBackedDurationEvidence = primaryDurationCalibrationSource === 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence'
  const durationReviewGateRows = scheduleRows.filter((row) => (
    normalizeText(row.values.duration_review_gate).toLowerCase() === 'generation_depth_trust_review_required'
      || readStringArray(readRecord(row.values.duration_suggestion).dataUpgradeBlockedBy)
        .map((code) => code.toLowerCase())
        .includes('generation_depth_trust_review_required')
  ))
  const profilePhaseAnchorRows = scheduleRows.filter((row) => (
    Boolean(row.values.profile_phase_anchor_dependency)
      || row.predecessorDependencies.some((dependency) => dependency.intentCode === 'business_type_profile_phase_anchor')
  ))

  const unresolvedDependencyCount = candidateNetworkEvaluation?.unresolvedEdgeCount ?? 0
  const generationReady = scheduleRows.length > 0 && unresolvedDependencyCount === 0

  return {
    status: generationReady ? 'initial_plan_ready' : 'initial_plan_requires_plan_fix',
    ready_for_user_confirmation: generationReady,
    runtime_approval_required: false,
    schedule_row_count: scheduleRows.length,
    generation_quality_review: {
      mode: 'offline_development_calibration',
      blocks_plan_generation: false,
      blocks_baseline_publication: false,
      unresolved_dependency_count: unresolvedDependencyCount,
      legacy_runtime_review_marker_row_count: durationReviewGateRows.length,
    },
    duration_evidence: {
      source: 'candidate_default_master_plan_baseline',
      calibration_source: primaryDurationCalibrationSource,
      calibration_sources: durationCalibrationSources,
      maturity: usesAssetBackedDurationEvidence ? 'asset_backed_cold_start' : 'built_in_cold_start',
      generation_source: usesAssetBackedDurationEvidence ? 'real_plan_evidence_asset_backed_master_plan_v1' : 'cold_start_baseline',
      covered_row_count: durationEvidenceRows.length,
      runtime_approval_required: false,
    },
    ...(durationAssetUtilizationSummary
      ? { duration_asset_utilization_summary: durationAssetUtilizationSummary }
      : {}),
    ...(candidateNetworkEvaluation
      ? { candidate_network_evaluation: candidateNetworkEvaluation }
      : {}),
    dependency_anchors: {
      source: 'business_type_profile_phase_anchor',
      projection_only: true,
      anchored_row_count: profilePhaseAnchorRows.length,
      writes_task_dependencies: false,
    },
    mutation_boundary: {
      writesTasks: false,
      writesTaskDependencies: false,
      writesCriticalPathFacts: false,
      writesRuntimePublication: false,
    },
  }
}

async function buildDefaultMasterPlanBaselineDraft(params: {
  project: any
  projectId: string
  template: any
  profile: DefaultMasterPlanBootstrapProfile
}) {
  const facts = buildDefaultMasterPlanFacts(params.project, params.profile)
  const recommendation = buildTemplateRecommendation(facts as never)
  const templateSelection = buildWizardTemplateSelection(recommendation)
  const masterPlanProfile = recommendation.masterPlanProfile
  const generationBatchId = `baseline-${params.profile.sourceVersionLabel}-${uuidv4()}`
  const plannedStartDate = normalizeText(
    params.project.planned_start_date
      ?? params.project.start_date
      ?? params.project.actual_start_date,
  ) || new Date().toISOString().slice(0, 10)
  const operation = {
    type: 'template_generate',
    generationBatchId,
    templateIds: templateSelection.templateIds,
    selectedNodesByTemplate: templateSelection.selectedNodesByTemplate,
    selectedNodeIds: [],
    plannedStartDate,
    detailLevel: 'planning_skeleton',
    generationDepth: 'managed_frontier',
    includeActivitySteps: false,
    projectFacts: {
      ...facts,
      defaultPlanOutput: 'master_plan',
      masterPlanProfile,
      foundationMethodCandidates: recommendation.foundationMethodCandidates,
    },
    clientContext: {
      source: 'wbs_template_bootstrap_from_template',
      defaultPlanOutput: 'master_plan',
      planOutputLayer: 'master_plan',
      masterPlanProfile,
      requestedTemplateId: params.template.id ?? null,
      generationMode: params.profile.generationMode,
    },
    scope: {
      scopeExpansionMode: 'project',
      business_type: facts.businessType,
      business_subtype: facts.businessSubtype,
      project_type_code: facts.projectTypeCode,
      structure_type_code: facts.structureTypeCode,
      method_variant_codes: facts.methodVariantCodes,
      plan_scope_caliber: facts.planScopeCaliber,
      delivery_standard: facts.deliveryStandard,
      terminal_event: facts.terminalEvent,
      building_count: facts.buildingCount,
      standard_floor_count: facts.standardFloorCount,
      highest_building_floor_count: facts.highestBuildingFloorCount,
      basement_level_count: facts.basementLevelCount,
      total_area_m2: facts.totalAreaM2,
      foundation_depth_m: facts.foundationDepthM,
      buildingPatternCodes: facts.buildingPatternCodes,
      functionalUsageCodes: facts.functionalUsageCodes,
      functionalCategoryCodes: facts.functionalCategoryCodes,
      specialRoomTypeCodes: facts.specialRoomTypeCodes,
      physicalZoneTypeCodes: facts.physicalZoneTypeCodes,
      hardConstraintCodes: facts.hardConstraintCodes,
      foundationMethodCandidates: recommendation.foundationMethodCandidates,
      project_features: {
        ...facts.projectFeatures,
        foundationMethodCandidates: recommendation.foundationMethodCandidates,
      },
    },
  }

  const runtimeArtifactPublications: WbsTemplateGenerationRuntimeArtifactPublication[] = []
  const generated = await generateWbsTemplateRows({
    projectId: params.projectId,
    surface: 'baseline',
    runtimeEvidenceMode: 'no_write',
    detailLevel: 'planning_skeleton' as never,
    diagnosticDurationSuggestionMode: 'benchmark_plan_reference',
    operation: operation as never,
    runtimeArtifactPublications,
  })
  const scheduleRows = tagGeneratedRowsForBaselineDraft(
    generated.rows.filter(isDefaultMasterPlanPrimaryScheduleRow),
    params.profile.sourceVersionLabel,
  )

  if (scheduleRows.length === 0) {
    throw Object.assign(new Error('默认主计划生成器没有返回可落草稿的主计划行'), {
      statusCode: 422,
      code: 'DEFAULT_MASTER_PLAN_EMPTY',
    })
  }

  const generationQuality = summarizeDefaultMasterPlanGenerationQuality(
    scheduleRows,
    generated.durationAssetUtilizationSummary,
    generated.candidateNetworkEvaluation,
  )
  const baselineGovernanceMetadata = {
    source: 'generated_initial_plan_draft',
    planLifecycleStatus: 'draft_ready_for_user_confirmation',
    runtimeApprovalRequired: false,
    generationQuality,
    durationAssetUtilizationSummary: generated.durationAssetUtilizationSummary ?? null,
    candidateNetworkEvaluation: generated.candidateNetworkEvaluation ?? null,
    mutationBoundary: generationQuality.mutation_boundary,
    draftWritePolicy: 'baseline_draft_only_no_task_dependency_write',
    writesTasks: false,
    writesTaskDependencies: false,
    writesCriticalPathFacts: false,
    writesRuntimePublication: false,
  }

  const baseline = await insertBaselineDraftFromGeneratedRows({
    projectId: params.projectId,
    title: `${String(params.project.name ?? '项目')} 项目基线`,
    description: params.profile.generationMode === 'residential_master_plan_v2'
      ? '由住宅资产驱动默认主计划入口生成的项目基线草稿；可预览、编辑并按普通基线流程发布。'
      : '由业态默认主计划生成器生成的项目基线草稿；可预览、编辑并按普通基线流程发布。',
    sourceType: 'manual',
    sourceVersionLabel: params.profile.sourceVersionLabel,
    governanceMetadata: baselineGovernanceMetadata,
    rows: scheduleRows,
    beforeCommit: async ({ queryExec, items }) => {
      const companyId = normalizeText(params.project.company_id)
      if (!companyId) throw new Error('default_master_plan_duration_learning_company_scope_required')
      const subjectIdByClientRowId = new Map(items.flatMap((item) => {
        const clientRowId = normalizeText(readRecord(item.generation_metadata).clientRowId)
        return clientRowId && item.id ? [[clientRowId, String(item.id)] as const] : []
      }))
      const generatedItemIds = Array.from(subjectIdByClientRowId.values())
      await persistDurationLearningRuntimeConsumptions({
        queryExec,
        build: {
          companyId,
          projectId: params.projectId,
          consumerKey: 'wbsTemplateGenerationService',
          consumerSurface: 'default_master_plan_baseline_draft',
          generationBatchId: generated.generationBatchId,
          templateIds: generated.templateIds,
          rows: scheduleRows,
          runtimeArtifactPublications,
          subjectType: 'baseline_item',
          subjectIdByClientRowId,
        },
      })
      const anchorItemId = generatedItemIds[0]
      await enqueueDurationLearningRuntimeEvidenceBatch({
        queryExec,
        events: anchorItemId
          ? [buildWbsCandidateOutboxEvent({
              companyId,
              projectId: params.projectId,
              subjectType: 'baseline_item',
              subjectId: anchorItemId,
              runtimeArtifactPublications,
              candidate: {
                companyId,
                projectId: params.projectId,
                surface: 'baseline',
                generationBatchId,
                templateId: generated.templateId,
                selectedNodeIds: [],
                scope: operation.scope,
                generatedRowCount: generated.rows.length,
                retainedRowCount: scheduleRows.length,
                rejectedRowCount: Math.max(0, generated.rows.length - scheduleRows.length),
                generatedEntityIds: generatedItemIds,
                durationCandidateNodes: buildSpecialWorkDurationCandidateNodes(scheduleRows),
                metadata: {
                  source: 'wbs_template_bootstrap_from_template',
                  sourceAssetLineage: {
                    assetKind: 'builtin_default_master_plan',
                    templateId: generated.templateId,
                    sourceVersionLabel: params.profile.sourceVersionLabel,
                    canonicalPublicationCount: runtimeArtifactPublications.length,
                  },
                },
                scheduleTrustGate: generated.scheduleTrustGate,
              },
            })]
          : [],
      })
    },
  })

  return {
    baseline,
    generated,
    facts,
    generationQuality,
    generationMode: params.profile.generationMode,
  }
}

// 获取所有WBS模板
router.get('/', asyncHandler(async (req, res) => {
  const templateType = req.query.type as string
  const statusFilter = req.query.status as string // 'draft' | 'published' | 'disabled' | undefined

  logger.info('Fetching WBS templates', { templateType, statusFilter })

  const data = await loadVisibleWbsTemplates(req, {
    templateType: templateType && templateType !== 'all' ? templateType : null,
    statusFilter,
  })

  const response: ApiResponse<WBSTemplate[]> = {
    success: true,
    data: (data || []).map(mapTemplateFields),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// Rule-based WBS template suggestion endpoint.
router.post('/generate-suggestion', asyncHandler(async (req, res) => {
  const { prompt } = req.body

  if (!prompt || typeof prompt !== 'string') {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: '请提供项目描述 (prompt)' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Generate WBS template suggestion', { prompt })
  const { suggestedName, suggestedType, nodes } = buildSuggestedWbsTemplate(prompt)

  const response: ApiResponse<{ nodes: any[]; suggestedName: string; suggestedType: string }> = {
    success: true,
    data: { nodes, suggestedName, suggestedType },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/bootstrap/context',
  requireProjectMember((req) => String(req.query.project_id ?? req.query.projectId ?? '').trim() || undefined),
  asyncHandler(async (req, res) => {
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

  const defaultMasterPlanProfile = resolveDefaultMasterPlanBootstrapProfile(project, template)
  if (defaultMasterPlanProfile) {
    const result = await buildDefaultMasterPlanBaselineDraft({
      project,
      projectId,
      template,
      profile: defaultMasterPlanProfile,
    })

    const response: ApiResponse = {
      success: true,
      data: {
        path: 'template_to_baseline',
        generation_mode: result.generationMode,
        generation_depth: result.generated.generationDepth,
        default_plan_output: result.generated.defaultPlanOutput ?? 'master_plan',
        mutation_boundary: result.generated.masterPlanProfile?.mutationBoundary ?? {
          writesProductionDependencies: false,
          writesProductionDates: false,
          writesCriticalPathFacts: false,
        },
        duration_asset_utilization_summary: result.generated.durationAssetUtilizationSummary ?? null,
        candidate_network_evaluation: result.generated.candidateNetworkEvaluation ?? null,
        generation_quality: result.generationQuality,
        governance_warnings: result.generated.governanceWarnings ?? [],
        baseline: result.baseline.baseline,
        created_item_count: result.baseline.items.length,
        template_id: templateId,
        project_id: projectId,
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(201).json(response)
  }

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'DEFAULT_MASTER_PLAN_PROFILE_REQUIRED',
      message: '旧串行 WBS 模板生成路径已删除；请先补齐项目业态事实，或选择与项目业态匹配的默认主计划入口模板后重新生成。',
      details: {
        project_id: projectId,
        template_id: templateId,
        requiredGenerationPath: 'explicit_default_master_plan_template',
        directFailure: true,
        legacyFallbackRemoved: true,
        managedFallbackRemoved: true,
      },
    },
    timestamp: new Date().toISOString(),
  }
  res.status(422).json(response)
}))

// ── F9: JSON 导出 ────────────────────────────────────────────────────────────
router.get('/export-json', asyncHandler(async (req, res) => {
  const { ids } = req.query as { ids?: string }

  const idArr = ids ? ids.split(',').map((s: string) => s.trim()).filter(Boolean) : []
  const templates = await loadVisibleWbsTemplates(req, {
    ids: idArr,
  })

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
// v1.4.7.2: canonical standard library catalog. This is read-only and does not write project data.
router.get('/catalog', asyncHandler(async (req, res) => {
  const includeNodes = String(req.query.includeNodes ?? req.query.include_nodes ?? '').toLowerCase() === 'true'
  const visibleProjectIds = await getVisibleWbsTemplateProjectIds(req)
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  const response: ApiResponse = {
    success: true,
    data: await listWbsTemplateCatalog({
      includeNodes,
      projectIds: visibleProjectIds,
      companyId: membership?.companyId ?? null,
    }),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// v1.4.7.2: lazy-load a single seed catalog tree so the catalog list stays lightweight.
router.get('/catalog/:templateId', asyncHandler(async (req, res) => {
  const templateId = String(req.params.templateId ?? '').trim()
  if (!templateId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TEMPLATE_ID_REQUIRED', message: 'templateId 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const response: ApiResponse = {
    success: true,
    data: await getWbsTemplateCatalogItem(templateId),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// v1.4.7.2: preview template expansion before it enters the shared planning-tree edit buffer.
router.post(
  '/generate-preview',
  requireProjectEditor((req) => req.body?.projectId ?? req.body?.project_id),
  asyncHandler(async (req, res) => {
    const body = sanitizeWbsTemplatePayload(req.body ?? {}) as Record<string, any>
    const projectId = String(body?.projectId ?? body?.project_id ?? '').trim()
    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'PROJECT_ID_REQUIRED', message: 'projectId 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const projectFacts = body?.projectFacts && typeof body.projectFacts === 'object' && !Array.isArray(body.projectFacts)
      ? body.projectFacts
      : {}

    const operation = {
      type: 'template_generate',
      generationBatchId: body?.generationBatchId ?? body?.generation_batch_id ?? uuidv4(),
      primaryCatalogId: body?.primaryCatalogId ?? body?.primary_catalog_id,
      groupSelections: body?.groupSelections ?? body?.group_selections,
      specialtyCatalogIds: body?.specialtyCatalogIds ?? body?.specialty_catalog_ids,
      templateId: body?.templateId ?? body?.template_id ?? CHINA_GB55032_TEMPLATE_ID,
      templateIds: body?.templateIds ?? body?.template_ids,
      selectedNodeIds: body?.selectedNodeIds ?? body?.selected_node_ids ?? [],
      selectedNodesByTemplate: body?.selectedNodesByTemplate ?? body?.selected_nodes_by_template ?? {},
      projectFacts,
      scope: {
        ...(body?.scope ?? {}),
        projectTypeCode: body?.projectTypeCode ?? projectFacts.projectTypeCode,
        structureTypeCode: body?.structureTypeCode ?? projectFacts.structureTypeCode,
        methodVariantCodes: body?.methodVariantCodes ?? projectFacts.methodVariantCodes,
        elementVariantCodes: body?.elementVariantCodes ?? projectFacts.elementVariantCodes,
      },
      attachUnderRowId: body?.attachUnderRowId ?? body?.attach_under_row_id ?? null,
      duplicatePolicy: body?.duplicatePolicy ?? body?.duplicate_policy ?? 'skip',
      plannedStartDate: body?.plannedStartDate ?? body?.planned_start_date ?? body?.startDate,
      projectPlannedEndDate: body?.projectPlannedEndDate ?? body?.project_planned_end_date ?? body?.targetEndDate ?? body?.target_end_date,
      targetConstraintMode: body?.targetConstraintMode ?? body?.target_constraint_mode,
      detailLevel: body?.detailLevel ?? body?.detail_level,
      generationDepth: body?.generationDepth ?? body?.generation_depth,
      includeActivitySteps: body?.includeActivitySteps ?? body?.include_activity_steps,
      drilldownMode: body?.drilldownMode ?? body?.drilldown_mode,
      drilldownGenerationLevel: body?.drilldownGenerationLevel ?? body?.drilldown_generation_level,
      sourceParentTaskId: body?.sourceParentTaskId ?? body?.source_parent_task_id,
      sortOrder: body?.sortOrder ?? body?.sort_order ?? 0,
      clientContext: {
        ...(body?.clientContext ?? body?.client_context ?? {}),
        projectPlannedEndDate: body?.projectPlannedEndDate ?? body?.project_planned_end_date ?? body?.targetEndDate ?? body?.target_end_date ?? body?.clientContext?.projectPlannedEndDate ?? body?.client_context?.project_planned_end_date,
        targetConstraintMode: body?.targetConstraintMode ?? body?.target_constraint_mode ?? body?.clientContext?.targetConstraintMode ?? body?.client_context?.target_constraint_mode ?? 'compare_only',
      },
    }

    try {
      const phaseOperations = Array.isArray(body?.operations)
        ? body.operations
        : Array.isArray(body?.phaseOperations)
          ? body.phaseOperations
          : Array.isArray(body?.phase_operations)
            ? body.phase_operations
            : null
      const targetContext = {
        projectPlannedEndDate: body?.projectPlannedEndDate ?? body?.project_planned_end_date ?? body?.targetEndDate ?? body?.target_end_date,
        targetConstraintMode: body?.targetConstraintMode ?? body?.target_constraint_mode ?? 'compare_only',
      }
      const phaseOperationsForGeneration = phaseOperations
        ? await Promise.all(phaseOperations.map(async (phaseOperation: Record<string, unknown>) => {
        const phaseProjectFacts = phaseOperation.projectFacts && typeof phaseOperation.projectFacts === 'object' && !Array.isArray(phaseOperation.projectFacts)
          ? phaseOperation.projectFacts
          : projectFacts
        const sortOrder = phaseOperation.sortOrder
        return governAttachedTaskPlanOperation(projectId, {
          type: String(phaseOperation.type ?? phaseOperation.op ?? 'template_generate'),
          generationBatchId: phaseOperation.generationBatchId,
          primaryCatalogId: phaseOperation.primaryCatalogId,
          groupSelections: phaseOperation.groupSelections,
          specialtyCatalogIds: phaseOperation.specialtyCatalogIds,
          templateId: phaseOperation.templateId,
          templateIds: phaseOperation.templateIds,
          selectedNodeIds: phaseOperation.selectedNodeIds,
          selectedNodesByTemplate: phaseOperation.selectedNodesByTemplate,
          projectFacts: phaseProjectFacts,
          scope: phaseOperation.scope,
          attachUnderRowId: phaseOperation.attachUnderRowId,
          duplicatePolicy: phaseOperation.duplicatePolicy,
          plannedStartDate: phaseOperation.plannedStartDate,
          targetConstraintMode: phaseOperation.targetConstraintMode,
          detailLevel: phaseOperation.detailLevel,
          generationDepth: phaseOperation.generationDepth,
          includeActivitySteps: phaseOperation.includeActivitySteps,
          drilldownMode: phaseOperation.drilldownMode,
          drilldownGenerationLevel: phaseOperation.drilldownGenerationLevel,
          sourceParentTaskId: phaseOperation.sourceParentTaskId,
          sortOrder: typeof sortOrder === 'number' || typeof sortOrder === 'string' ? sortOrder : undefined,
          clientContext: {
            ...(phaseOperation.clientContext && typeof phaseOperation.clientContext === 'object' && !Array.isArray(phaseOperation.clientContext) ? phaseOperation.clientContext : {}),
            ...targetContext,
          },
        })
      }))
        : undefined
      const operationForGeneration = await governAttachedTaskPlanOperation(projectId, operation)
      const surface = String(body?.surface ?? 'task_list') as any
      const generated = phaseOperationsForGeneration && phaseOperationsForGeneration.length > 0
        ? await generateWbsTemplatePhaseChainRows({
          projectId,
          surface,
          runtimeEvidenceMode: 'no_write',
          operations: phaseOperationsForGeneration,
          chainMode: body?.phaseChainMode === 'none' || body?.phase_chain_mode === 'none' ? 'none' : 'sequential',
          detailLevel: body?.detailLevel ?? body?.detail_level,
          phaseReleasePolicies: body?.phaseReleasePolicies ?? body?.phase_release_policies,
        })
        : await generateWbsTemplateRows({
          projectId,
          surface,
          runtimeEvidenceMode: 'no_write',
          operation: operationForGeneration as any,
        })
      const response: ApiResponse = {
        success: true,
        data: {
          ...generated,
          operations: buildTemplateGenerateCreateOperations(generated.rows),
          batchOperations: generated.generationBatches.map((batch) => ({
            ...batch,
            operations: buildTemplateGenerateCreateOperations(filterGeneratedRowsByScopeIndexes(generated.rows, batch.scopeIndexes)),
          })),
          previewRows: generated.rows,
          writeMode: 'preview_only',
        },
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error: any) {
      const statusCode = Number(error?.statusCode ?? 500)
      const response: ApiResponse = {
        success: false,
        error: {
          code: error?.code ?? 'TEMPLATE_GENERATE_PREVIEW_FAILED',
          message: error?.message ?? '模板生成预览失败',
          details: error?.details,
        },
        timestamp: new Date().toISOString(),
      }
      res.status(statusCode).json(response)
    }
  }),
)

router.get('/validate-seed', asyncHandler(async (req, res) => {
  const strict = String(req.query.strict ?? '').toLowerCase() === 'true'
  const response: ApiResponse = {
    success: true,
    data: validateChinaGb50300Seed({ strict }),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

async function persistSeedTemplateNodes(templateId: string, nodes: any[], parentNodeId: string | null = null): Promise<number> {
  let count = 0
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const nodeId = uuidv4()
    const metadata = {
      ...(node.metadata ?? {}),
      reviewNeeded: Boolean(node.reviewNeeded),
      webVerified: Boolean(node.webVerified),
      sourceClauseRef: node.sourceClauseRef ?? null,
    }
    const { error } = await supabase.from('wbs_template_nodes').insert({
      id: nodeId,
      template_id: templateId,
      parent_node_id: parentNodeId,
      stable_code: node.stableCode,
      wbs_level: node.categoryType,
      wbs_code: node.stableCode,
      node_name: node.name,
      node_description: null,
      sequence: index,
      standard_duration: null,
      default_duration_days: null,
      category_type: node.categoryType,
      engineering_category_id: node.engineeringCategoryId ?? null,
      standard_work_code: node.standardWorkCode ?? null,
      standard_work_name: node.standardWorkName ?? node.name,
      source_standard: node.sourceStandard ?? null,
      source_version: node.sourceVersion ?? null,
      source_clause_ref: node.sourceClauseRef ?? null,
      default_responsible_unit_role: node.defaultResponsibleUnitRole ?? null,
      default_dependency_mode: null,
      default_milestone: false,
      is_milestone: false,
      review_needed: Boolean(node.reviewNeeded),
      web_verified: Boolean(node.webVerified),
      metadata,
    })
    if (error) throw error
    // eslint-disable-next-line -- route-level-aggregation-approved
    count += 1
    count += await persistSeedTemplateNodes(templateId, node.children ?? [], nodeId)
  }
  return count
}

router.post(
  '/import-seed',
  requireCurrentCompanyAdmin,
  asyncHandler(async (req, res) => {
    const strict = Boolean(req.body?.strict)

    const validation = validateChinaGb50300Seed({ strict })
    if (!validation.ok) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'SEED_VALIDATION_FAILED', message: '中国分部分项 seed 校验未通过', details: validation },
        timestamp: new Date().toISOString(),
      }
      return res.status(422).json(response)
    }

    const existing = await executeSQLOne<{ id: string }>(
      'SELECT id FROM wbs_templates WHERE standard_catalog_code = ? AND deleted_at IS NULL LIMIT 1',
      [CHINA_GB55032_TEMPLATE_CODE],
    )
    const templateId = existing?.id ?? uuidv4()
    const now = new Date().toISOString()
    const seedNodes = await loadWbsTemplateNodes(CHINA_GB55032_TEMPLATE_ID)

    if (existing?.id) {
      await executeSQL('DELETE FROM wbs_template_nodes WHERE template_id = ?', [templateId])
      await supabase.from('wbs_templates').update({
        template_name: CHINA_GB55032_TEMPLATE_NAME,
        template_type: 'construction_standard',
        description: `v1.4.7.2 ${CHINA_GB55032_TEMPLATE_NAME} seed 导入结果`,
        is_builtin: true,
        is_public: true,
        standard_catalog_code: CHINA_GB55032_TEMPLATE_CODE,
        source_standard: CHINA_GB55032_TEMPLATE_SOURCE_STANDARD,
        source_version: CHINA_GB55032_TEMPLATE_SOURCE_VERSION,
        catalog_scope: 'national',
        updated_at: now,
      }).eq('id', templateId)
    } else {
      const { error } = await supabase.from('wbs_templates').insert({
        id: templateId,
        template_name: CHINA_GB55032_TEMPLATE_NAME,
        template_type: 'construction_standard',
        description: `v1.4.7.2 ${CHINA_GB55032_TEMPLATE_NAME} seed 导入结果`,
        wbs_nodes: [],
        template_data: [],
        is_default: false,
        is_public: true,
        is_builtin: true,
        standard_catalog_code: CHINA_GB55032_TEMPLATE_CODE,
        catalog_scope: 'national',
        source_standard: CHINA_GB55032_TEMPLATE_SOURCE_STANDARD,
        source_version: CHINA_GB55032_TEMPLATE_SOURCE_VERSION,
        created_by: req.user?.id ?? null,
        created_at: now,
        updated_at: now,
      })
      if (error) throw error
    }

    const nodeCount = await persistSeedTemplateNodes(templateId, seedNodes)
    await executeSQL('UPDATE wbs_templates SET node_count = ?, updated_at = ? WHERE id = ?', [nodeCount, now, templateId])

    const response: ApiResponse = {
      success: true,
      data: {
        templateId,
        nodeCount,
        validation,
      },
      timestamp: now,
    }
    res.status(existing?.id ? 200 : 201).json(response)
  }),
)

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching WBS template', { id })

  if (!await ensureWbsTemplateVisible(req, res, id)) return

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? LIMIT 1`, [id])

  if (!data) {
    return sendWbsTemplateNotFound(res)
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
  const wbsNodes = sanitizeWbsTemplatePayload(req.body.template_data || req.body.wbs_nodes || [])
  const projectId = String(req.body?.project_id ?? req.body?.projectId ?? '').trim()
  const companyId = await getProjectCompanyId(projectId)

  await executeSQL(
    `INSERT INTO wbs_templates (id, company_id, project_id, template_name, template_type, description, wbs_nodes, is_default, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      projectId,
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

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`, [id, projectId])

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
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating WBS template', { id })

  if (!await ensureWbsTemplateEditable(req, res, id)) return
  const scope = await loadWbsTemplateAccessScope(id)
  const projectId = normalizeOptionalProjectId(scope?.project_id)
  if (!projectId) return

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
  const currentTemplate = await executeSQLOne(
    `${WBS_TEMPLATE_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [id, projectId],
  )
  if (!currentTemplate) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND', message: 'WBS模板不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const nextNodesSource = req.body.wbs_nodes !== undefined || req.body.template_data !== undefined
    ? sanitizeWbsTemplatePayload(req.body.wbs_nodes ?? req.body.template_data)
    : (currentTemplate.wbs_nodes ?? currentTemplate.template_data ?? [])
  const nextNodesJson = typeof nextNodesSource === 'string'
    ? nextNodesSource
    : JSON.stringify(nextNodesSource)

  await executeSQL(
    'UPDATE wbs_templates SET template_name = ?, template_type = ?, description = ?, wbs_nodes = ?, is_default = ?, updated_at = ? WHERE id = ? AND project_id = ?',
    [
      req.body.template_name !== undefined || req.body.name !== undefined
        ? (req.body.template_name || req.body.name)
        : (currentTemplate.template_name ?? currentTemplate.name),
      req.body.template_type !== undefined ? req.body.template_type : currentTemplate.template_type,
      req.body.description !== undefined ? req.body.description : currentTemplate.description,
      nextNodesJson,
      req.body.is_default !== undefined
        ? (req.body.is_default ? 1 : 0)
        : (currentTemplate.is_default ? 1 : 0),
      ts,
      id,
      projectId,
    ],
  )

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`, [id, projectId])
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
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting WBS template', { id })

  if (!await ensureWbsTemplateEditable(req, res, id)) return
  const scope = await loadWbsTemplateAccessScope(id)
  const projectId = normalizeOptionalProjectId(scope?.project_id)
  if (!projectId) return

  // v1.4.15: retention decision must block unsafe physical deletes.
  const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
  const retention = await enforceRetentionOrBlock({
    entityType: 'wbs_template',
    entityId: id,
    projectId,
    userId: req.user?.id ?? null,
    userAction: 'delete',
  })
  if (retention.blocked) {
    return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({ success: false, error: buildRetentionBlockedApiError(retention.reason, retention.result), timestamp: new Date().toISOString() })
  }

  await executeSQL('DELETE FROM wbs_templates WHERE id = ? AND project_id = ?', [id, projectId])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 设置默认模板
router.post(
  '/:id/set-default',
  asyncHandler(async (req, res) => {
  const { id } = req.params
  const templateType = req.body.template_type

  logger.info('Setting default WBS template', { id, templateType })
  if (!await ensureWbsTemplateEditable(req, res, id)) return
  const scope = await loadWbsTemplateAccessScope(id)
  const projectId = normalizeOptionalProjectId(scope?.project_id)
  if (!projectId) return

  // 取消同类型的其他默认模板
  await executeSQL(
    'UPDATE wbs_templates SET is_default = 0 WHERE project_id = ? AND template_type = ? AND is_default = 1',
    [projectId, templateType]
  )

  // 设置新默认模板
  await executeSQL(
    'UPDATE wbs_templates SET is_default = 1 WHERE id = ? AND project_id = ?',
    [id, projectId]
  )

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`, [id, projectId])
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
  if (!await ensureWbsTemplateVisible(req, res, id)) return
  const projectId = String(req.body?.project_id ?? req.body?.projectId ?? '').trim()

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
  const companyId = await getProjectCompanyId(projectId)

  // 解析原模板的 wbs_nodes
  let wbsNodes = original.wbs_nodes || original.template_data || []
  if (typeof wbsNodes === 'string') {
    try { wbsNodes = JSON.parse(wbsNodes) } catch { wbsNodes = [] }
  }
  wbsNodes = sanitizeWbsTemplatePayload(wbsNodes)

  await executeSQL(
    `INSERT INTO wbs_templates (id, company_id, project_id, template_name, template_type, description, wbs_nodes, is_default, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      clonedId,
      companyId,
      projectId,
      clonedName,
      original.template_type,
      original.description,
      JSON.stringify(wbsNodes),
      req.body.created_by ?? null,
      ts,
      ts,
    ]
  )

  const cloned = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`, [clonedId, projectId])

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
  if (!await ensureWbsTemplateEditable(req, res, id)) return
  const scope = await loadWbsTemplateAccessScope(id)
  const projectId = normalizeOptionalProjectId(scope?.project_id)
  if (!projectId) return

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  if (status === 'draft') {
    await executeSQL(
      'UPDATE wbs_templates SET is_default = 1, deleted_at = NULL, updated_at = ? WHERE id = ? AND project_id = ?',
      [ts, id, projectId],
    )
  } else if (status === 'published') {
    await executeSQL(
      'UPDATE wbs_templates SET is_default = 0, deleted_at = NULL, updated_at = ? WHERE id = ? AND project_id = ?',
      [ts, id, projectId],
    )
  } else {
    // disabled: 软删除
    await executeSQL(
      'UPDATE wbs_templates SET is_default = 0, deleted_at = ?, updated_at = ? WHERE id = ? AND project_id = ?',
      [ts, ts, id, projectId],
    )
  }

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`, [id, projectId])
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
  requireProjectEditor(getSpreadsheetImportProjectId),
  upload.single('file'),
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
  const archiveRisk = inspectZipArchiveInflationRisk(req.file.buffer)
  if (archiveRisk.suspicious) {
    logger.warn('Rejected suspicious WBS template spreadsheet archive', {
      filename: req.file.originalname,
      uncompressedBytes: archiveRisk.uncompressedBytes,
      compressedBytes: archiveRisk.compressedBytes,
      ratio: archiveRisk.ratio,
    })
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'WBS_TEMPLATE_IMPORT_ARCHIVE_TOO_LARGE',
        message: '导入文件压缩包风险过高，请压缩为更小的普通工作簿后重试',
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(413).json(response)
  }
  try {
    const workbook = XLSX.read(req.file.buffer, {
      type: 'buffer',
      sheetRows: WBS_TEMPLATE_IMPORT_MAX_ROWS + 1,
      cellHTML: false,
      cellFormula: false,
      cellStyles: false,
      cellNF: false,
      cellText: false,
    })
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

  // eslint-disable-next-line -- route-level-aggregation-approved
  const maxColumnCount = rows.reduce((max, row) => Math.max(max, row.length), 0)
  // eslint-disable-next-line -- route-level-aggregation-approved
  const cellCount = rows.reduce((sum, row) => sum + row.length, 0)
  if (rows.length > WBS_TEMPLATE_IMPORT_MAX_ROWS || maxColumnCount > WBS_TEMPLATE_IMPORT_MAX_COLUMNS || cellCount > WBS_TEMPLATE_IMPORT_MAX_CELLS) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'WBS_TEMPLATE_IMPORT_TOO_LARGE',
        message: `导入文件超出限制：最多 ${WBS_TEMPLATE_IMPORT_MAX_ROWS} 行、${WBS_TEMPLATE_IMPORT_MAX_COLUMNS} 列、${WBS_TEMPLATE_IMPORT_MAX_CELLS} 个单元格`,
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(413).json(response)
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
    const rawName = sanitizeImportedSpreadsheetText(row[colIdx.title])
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
  const sanitizedWbsNodes = sanitizeWbsTemplatePayload(wbsNodes)

  if (wbsNodes.length === 0) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'EMPTY_NODES', message: '未能从文件中识别出任何任务节点，请检查文件格式' },
      timestamp: new Date().toISOString(),
    }
    return res.status(422).json(response)
  }

  function countNodes(nodes: ParsedNode[]): number {
    // eslint-disable-next-line -- route-level-aggregation-approved
    return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0)
  }
  function sumDays(nodes: ParsedNode[]): number {
    // eslint-disable-next-line -- route-level-aggregation-approved
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
  const projectId = getSpreadsheetImportProjectId(req) as string
  const companyId = await getProjectCompanyId(projectId)

  await executeSQL(
    `INSERT INTO wbs_templates (id, company_id, project_id, template_name, template_type, description, wbs_nodes, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId,
      companyId,
      projectId,
      name,
      templateType,
      `从 ${req.file.originalname} 导入，共 ${nodeCount} 个节点`,
      JSON.stringify(sanitizedWbsNodes),
      true,
      ts,
      ts,
    ]
  )

  const data = await executeSQLOne(`${WBS_TEMPLATE_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`, [newId, projectId])

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
  const body = sanitizeWbsTemplatePayload(req.body ?? {}) as {
    project_id?: unknown
    projectId?: unknown
    templates?: Array<{
    name: string
    template_type?: string
    structure_type?: string
    description?: string
    nodes?: Array<{ title: string; level: number; duration: number; parent_id: string | null; sort_order: number }>
    }>
  }
  const { templates } = body

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
      const projectId = String(body?.project_id ?? body?.projectId ?? '').trim()
      const companyId = await getProjectCompanyId(projectId)

      await executeSQL(
        `INSERT INTO wbs_templates (id, company_id, project_id, template_name, template_type, description, wbs_nodes, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, true, ?, ?)`,
        [id, companyId, projectId, t.name.trim(), t.template_type || '住宅', t.description || '', nodesJson, ts, ts]
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
