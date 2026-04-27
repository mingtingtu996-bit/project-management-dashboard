// 前期证照 API 路由

import { Router, type Request } from 'express'
import { createRisk, createTask, executeSQL, executeSQLOne, getIssues, getRisks } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { isActiveIssue } from '../utils/issueStatus.js'
import { isActiveRisk } from '../utils/riskStatus.js'
import type { ApiResponse } from '../types/index.js'
import type { PreMilestone } from '../types/db.js'
import { ValidationService } from '../services/validationService.js'
import { WarningService } from '../services/warningService.js'
import { createIssueInMainChain } from '../services/issueWriteChainService.js'
import { v4 as uuidv4 } from 'uuid'
import {
  buildLicenseBoardReadModel,
  buildLicenseDetailReadModel,
  buildLicenseLedgerReadModel,
  getCertificateTypeLabel,
  normalizeCertificateStage,
  normalizeCertificateStatus,
  normalizeDate,
  normalizeCertificateType,
} from '../services/preMilestoneBoardService.js'
import { syncAcceptanceRequirementsBySource } from '../services/acceptanceFlowService.js'
import {
  CERTIFICATE_DEPENDENCY_COLUMNS,
  CERTIFICATE_WORK_ITEM_COLUMNS,
  PRE_MILESTONE_COLUMNS,
  PRE_MILESTONE_CONDITION_COLUMNS,
  WBS_TEMPLATE_DEFAULT_COLUMNS,
} from '../services/sqlColumns.js'
import type {
  CertificateBoardResponse,
  CertificateDependency,
  CertificateDetailResponse,
  CertificateLedgerResponse,
  CertificateWorkItem,
  Issue,
  PreMilestoneCondition,
  Risk,
} from '../types/db.js'
import { CERTIFICATE_STATUS_TRANSITIONS } from '../types/db.js'

const router = Router({ mergeParams: true })
router.use(authenticate)
const warningService = new WarningService()
const PRE_MILESTONE_SELECT = `SELECT ${PRE_MILESTONE_COLUMNS} FROM pre_milestones`
const CERTIFICATE_WORK_ITEM_SELECT = `SELECT ${CERTIFICATE_WORK_ITEM_COLUMNS} FROM certificate_work_items`
const CERTIFICATE_DEPENDENCY_SELECT = `SELECT ${CERTIFICATE_DEPENDENCY_COLUMNS} FROM certificate_dependencies`
const PRE_MILESTONE_CONDITION_SELECT = `SELECT ${PRE_MILESTONE_CONDITION_COLUMNS} FROM pre_milestone_conditions`
const WBS_TEMPLATE_DEFAULT_SELECT = `SELECT ${WBS_TEMPLATE_DEFAULT_COLUMNS} FROM wbs_templates`

type ProjectIdRow = {
  project_id?: string | null
}

type ProjectLookupRow = {
  id: string
  name?: string | null
  current_phase?: string | null
  default_wbs_generated?: boolean | number | string | null
}

type WbsTemplateRow = {
  template_name?: string | null
  wbs_nodes?: unknown
}

type WbsTemplateNode = {
  node_name?: string | null
  name?: string | null
  level?: number | null
  sort_order?: number | null
  description?: string | null
  wbs_code?: string | null
  wbs_path?: string | null
}

type GeneratedWbsNode = {
  title: string
  level: number
  sort_order: number
  description?: string | null
  wbs_code: string
  wbs_path: string
}

type PreMilestoneRouteRecord = Partial<PreMilestone> & {
  id?: string
  project_id?: string
  certificate_type?: string | null
  certificate_name?: string | null
  milestone_name?: string | null
  milestone_type?: string | null
  description?: string | null
  status?: string | null
  updated_at?: string | null
  created_by?: string | null
  current_stage?: string | null
  planned_finish_date?: string | null
  planned_end_date?: string | null
  planned_date?: string | null
  actual_finish_date?: string | null
  actual_end_date?: string | null
  actual_date?: string | null
  approving_authority?: string | null
  issuing_authority?: string | null
  next_action?: string | null
  next_action_due_date?: string | null
  is_blocked?: boolean | number | string | null
  block_reason?: string | null
  latest_record_at?: string | null
  issue_date?: string | null
  expiry_date?: string | null
  phase_id?: string | null
  lead_unit?: string | null
  planned_start_date?: string | null
  responsible_user_id?: string | null
  sort_order?: number | null
  user_id?: string | null
  proj_id?: string | null
  proj_name?: string | null
  current_phase?: string | null
  default_wbs_generated?: boolean | number | string | null
  document_no?: string | null
  certificate_no?: string | null
  name?: string | null
}

function readProjectId(req: Request) {
  return String(req.params.projectId ?? req.query.projectId ?? '').trim()
}

function isTruthyLike(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function getCertificateRecordId(record: PreMilestoneRouteRecord | null | undefined, fallback = '') {
  return String(record?.id ?? fallback).trim()
}

function normalizeTemplateNodes(rawNodes: unknown): WbsTemplateNode[] {
  let candidate: unknown = rawNodes

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate)
    } catch {
      return []
    }
  }

  if (!Array.isArray(candidate)) {
    return []
  }

  return candidate.filter((node): node is WbsTemplateNode => typeof node === 'object' && node !== null)
}

function buildGeneratedWbsNodes(rawNodes: WbsTemplateNode[]): GeneratedWbsNode[] {
  return rawNodes.map((node, index) => {
    const sortOrder = Number.isFinite(Number(node.sort_order)) ? Number(node.sort_order) : index + 1
    const level = Math.max(1, Number.isFinite(Number(node.level)) ? Number(node.level) : 1)
    return {
      title: String(node.node_name || node.name || `WBS节点-${index + 1}`).trim(),
      level,
      sort_order: sortOrder,
      description: node.description ?? null,
      wbs_code: String(node.wbs_code || `WBS-${(index + 1).toString().padStart(3, '0')}`),
      wbs_path: String(node.wbs_path || sortOrder),
    }
  })
}

async function seedProjectWbsArtifacts(params: {
  projectId: string
  nodes: GeneratedWbsNode[]
  createdBy?: string | null
  ts: string
}) {
  const taskParentIdsByLevel = new Map<number, string>()
  let structureCount = 0
  let taskCount = 0

  const resetTaskLineageFromLevel = (level: number) => {
    for (const key of [...taskParentIdsByLevel.keys()]) {
      if (key >= level) taskParentIdsByLevel.delete(key)
    }
  }

  for (const node of params.nodes) {
    try {
      const nodeId = uuidv4()
      await executeSQL(
        `INSERT INTO wbs_structure (id, project_id, node_name, level, sort_order, status, description, wbs_code, wbs_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '待开始', ?, ?, ?, ?, ?)`,
        [
          nodeId,
          params.projectId,
          node.title,
          node.level,
          node.sort_order,
          node.description ?? null,
          node.wbs_code,
          node.wbs_path,
          params.ts,
          params.ts,
        ]
      )
      structureCount += 1
    } catch (error) {
      logger.warn('Failed to insert WBS structure node', { node, error })
    }

    try {
      const parentId = node.level > 1 ? taskParentIdsByLevel.get(node.level - 1) ?? null : null
      const createdTask = await createTask({
        project_id: params.projectId,
        parent_id: parentId,
        title: node.title,
        description: node.description ?? null,
        status: 'pending',
        priority: 'medium',
        progress: 0,
        wbs_level: node.level,
        wbs_code: node.wbs_code,
        sort_order: node.sort_order,
        created_by: params.createdBy ?? null,
      } as any, { skipSnapshotWrite: true })
      if (createdTask?.id) {
        taskParentIdsByLevel.set(node.level, createdTask.id)
        for (const key of [...taskParentIdsByLevel.keys()]) {
          if (key > node.level) taskParentIdsByLevel.delete(key)
        }
      } else {
        resetTaskLineageFromLevel(node.level)
      }
      taskCount += 1
    } catch (error) {
      resetTaskLineageFromLevel(node.level)
      logger.warn('Failed to create WBS task node', { node, error })
    }
  }

  return { structureCount, taskCount }
}

async function loadProjectCertificates(projectId: string) {
  const rows = await executeSQL<PreMilestoneRouteRecord>(
    `${PRE_MILESTONE_SELECT} WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId],
  )
  return rows.map((row) => normalizePreMilestoneRecord(row))
}

async function loadProjectWorkItems(projectId: string) {
  return await executeSQL<CertificateWorkItem>(
    `${CERTIFICATE_WORK_ITEM_SELECT} WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [projectId],
  )
}

async function loadProjectDependencies(projectId: string) {
  return await executeSQL<CertificateDependency>(
    `${CERTIFICATE_DEPENDENCY_SELECT} WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId],
  )
}

async function loadCertificateConditions(certificateId: string) {
  return await executeSQL<PreMilestoneCondition>(
    `${PRE_MILESTONE_CONDITION_SELECT} WHERE pre_milestone_id = ? ORDER BY created_at ASC`,
    [certificateId],
  )
}

function resolveCertificateTypeFromParam(certificateId: string) {
  const rawType = certificateId.startsWith('certificate-')
    ? certificateId.slice('certificate-'.length)
    : certificateId
  return normalizeCertificateType(rawType, 0)
}

function findCertificateByRequestId(
  certificates: PreMilestoneRouteRecord[],
  certificateId: string,
) {
  const directMatch = certificates.find((item) => String(item.id ?? '') === certificateId)
  if (directMatch) {
    return directMatch
  }

  const requestedType = resolveCertificateTypeFromParam(certificateId)
  return (
    certificates.find(
      (item) =>
        normalizeCertificateType(
          item.certificate_type ?? item.milestone_type ?? item.milestone_name,
          0,
        ) === requestedType,
    ) ?? null
  )
}

function normalizeLookupKey(value: unknown) {
  return String(value ?? '').trim()
}

function resolvePersistedCertificateNo(source: PreMilestoneRouteRecord | null | undefined) {
  if (!source) return null
  const certificateNo = normalizeLookupKey(source.certificate_no)
  if (certificateNo) return certificateNo
  const documentNo = normalizeLookupKey(source.document_no)
  return documentNo || null
}

function resolveIncomingCertificateNo(source: PreMilestoneRouteRecord | null | undefined) {
  if (!source) return null
  const certificateNo = normalizeLookupKey(source.certificate_no)
  return certificateNo || null
}

function normalizeIncomingCertificateStatus(value: unknown) {
  if (value == null || String(value).trim() === '') return null
  return normalizeCertificateStatus(String(value))
}

function normalizeIncomingCertificateStage(value: unknown, fallback: unknown = null) {
  const candidate = value == null || String(value).trim() === '' ? fallback : value
  if (candidate == null || String(candidate).trim() === '') return null
  return normalizeCertificateStage(String(candidate))
}

function normalizePreMilestoneRecord<T extends PreMilestoneRouteRecord | null | undefined>(record: T): T {
  if (!record) return record
  const { document_no: _legacyDocumentNo, ...rest } = record
  const certificateNo = resolvePersistedCertificateNo(record)
  const certificateType = normalizeCertificateType(
    record.certificate_type ?? record.milestone_type ?? record.milestone_name,
    0,
  )
  const certificateName =
    normalizeLookupKey(record.certificate_name) ||
    normalizeLookupKey(record.milestone_name) ||
    getCertificateTypeLabel(certificateType)
  return {
    ...rest,
    certificate_type: certificateType,
    certificate_name: certificateName,
    milestone_type: normalizeLookupKey(record.milestone_type) || certificateType,
    milestone_name: normalizeLookupKey(record.milestone_name) || certificateName,
    status: normalizeCertificateStatus(record.status),
    current_stage: normalizeIncomingCertificateStage(record.current_stage, record.milestone_type),
    planned_finish_date: normalizeDate(record.planned_finish_date ?? record.planned_end_date ?? record.planned_date),
    actual_finish_date: normalizeDate(record.actual_finish_date ?? record.actual_end_date ?? record.actual_date),
    approving_authority:
      normalizeLookupKey(record.approving_authority) ||
      normalizeLookupKey(record.issuing_authority) ||
      null,
    next_action: normalizeLookupKey(record.next_action) || normalizeLookupKey(record.description) || null,
    next_action_due_date: normalizeDate(record.next_action_due_date),
    latest_record_at: normalizeDate(record.latest_record_at ?? record.updated_at),
    certificate_no: certificateNo,
  } as unknown as T
}

async function findDuplicateEscalatedIssue(input: {
  projectId: string
  title: string
  sourceEntityType: string
  sourceEntityId: string
}) {
  const issues = await getIssues(input.projectId).catch(() => [])
  return (
    issues.find((issue) =>
      isActiveIssue(issue) &&
      normalizeLookupKey(issue.source_type) === 'manual' &&
      normalizeLookupKey(issue.title).toLowerCase() === normalizeLookupKey(input.title).toLowerCase() &&
      normalizeLookupKey(issue.source_entity_type) === normalizeLookupKey(input.sourceEntityType) &&
      normalizeLookupKey(issue.source_entity_id) === normalizeLookupKey(input.sourceEntityId)
    ) ?? null
  )
}

async function findDuplicateEscalatedRisk(input: {
  projectId: string
  title: string
  sourceEntityType: string
  sourceEntityId: string
}) {
  const risks = await getRisks(input.projectId).catch(() => [])
  return (
    risks.find((risk) =>
      isActiveRisk(risk) &&
      normalizeLookupKey(risk.source_type) === 'manual' &&
      normalizeLookupKey(risk.title).toLowerCase() === normalizeLookupKey(input.title).toLowerCase() &&
      normalizeLookupKey(risk.source_entity_type) === normalizeLookupKey(input.sourceEntityType) &&
      normalizeLookupKey(risk.source_entity_id) === normalizeLookupKey(input.sourceEntityId)
    ) ?? null
  )
}

function resolveCertificateDisplay(input: PreMilestoneRouteRecord | null, certificateId: string) {
  const certificateType = resolveCertificateTypeFromParam(certificateId)
  return {
    certificateType,
    certificateName:
      normalizeLookupKey(input?.certificate_name) ||
      normalizeLookupKey(input?.milestone_name) ||
      getCertificateTypeLabel(certificateType),
    certificateStatus: normalizeIncomingCertificateStatus(input?.status) || 'pending',
  }
}

function resolveEscalationTarget(params: {
  certificateId: string
  certificate: PreMilestoneRouteRecord | null
  workItems: CertificateWorkItem[]
  dependencies: CertificateDependency[]
  requestedWorkItemId?: string
}) {
  const requestedWorkItemId = normalizeLookupKey(params.requestedWorkItemId)
  const certificateDisplay = resolveCertificateDisplay(params.certificate, params.certificateId)

  if (!requestedWorkItemId) {
    return {
      sourceEntityType: 'pre_milestone',
      sourceEntityId: certificateDisplay.certificateType,
      targetLabel: certificateDisplay.certificateName,
      descriptionFragment: `证照：${certificateDisplay.certificateName}，当前状态：${certificateDisplay.certificateStatus}`,
    }
  }

  const workItem = params.workItems.find((item) => normalizeLookupKey(item.id) === requestedWorkItemId)
  if (!workItem) {
    return null
  }

  const certificateRowId = normalizeLookupKey(params.certificate?.id)
  const linkedToCertificate = params.dependencies.some(
    (dependency) =>
      dependency.predecessor_type === 'certificate' &&
      dependency.successor_type === 'work_item' &&
      normalizeLookupKey(dependency.predecessor_id) === certificateRowId &&
      normalizeLookupKey(dependency.successor_id) === requestedWorkItemId
  )

  if (certificateRowId && !linkedToCertificate) {
    return null
  }

  return {
    sourceEntityType: 'certificate_work_item',
    sourceEntityId: requestedWorkItemId,
    targetLabel: workItem.item_name,
    descriptionFragment: `证照：${certificateDisplay.certificateName}，事项：${workItem.item_name}，当前状态：${workItem.status}`,
  }
}

router.get('/board', asyncHandler(async (req, res) => {
  const projectId = readProjectId(req)
  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const certificates = await loadProjectCertificates(projectId)
  const workItems = await loadProjectWorkItems(projectId)
  const dependencies = await loadProjectDependencies(projectId)
  const data = buildLicenseBoardReadModel({ certificates, workItems, dependencies })

  const response: ApiResponse<CertificateBoardResponse> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/ledger', asyncHandler(async (req, res) => {
  const projectId = readProjectId(req)
  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const certificateId = req.query.certificateId as string | undefined
  const [workItems, dependencies, issues, risks] = await Promise.all([
    loadProjectWorkItems(projectId),
    loadProjectDependencies(projectId),
    getIssues(projectId).catch(() => []),
    getRisks(projectId).catch(() => []),
  ])
  const data = buildLicenseLedgerReadModel({ workItems, dependencies, issues, risks, certificateId: certificateId || null })

  const response: ApiResponse<CertificateLedgerResponse> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/:certificateId/detail', asyncHandler(async (req, res) => {
  const projectId = readProjectId(req)
  const { certificateId } = req.params

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const certificates = await loadProjectCertificates(projectId)
  const matchedCertificate = findCertificateByRequestId(certificates, certificateId)
  const certificate =
    matchedCertificate ??
    (certificateId.startsWith('certificate-')
      ? {
          id: certificateId,
          project_id: projectId,
          certificate_type: resolveCertificateTypeFromParam(certificateId),
          milestone_type: resolveCertificateTypeFromParam(certificateId),
          milestone_name: getCertificateTypeLabel(resolveCertificateTypeFromParam(certificateId)),
          status: 'pending',
          updated_at: new Date().toISOString(),
        }
      : null)

  if (!certificate) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PRE_MILESTONE_NOT_FOUND', message: '前期证照不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const resolvedCertificateId = getCertificateRecordId(certificate, certificateId)
  const orderedCertificates = [
    certificate,
    ...certificates.filter((item) => String(item.id ?? '') !== resolvedCertificateId),
  ]
  const [workItems, dependencies, conditions, warnings, issues, risks] = await Promise.all([
    loadProjectWorkItems(projectId),
    loadProjectDependencies(projectId),
    matchedCertificate && getCertificateRecordId(certificate)
      ? loadCertificateConditions(getCertificateRecordId(certificate))
      : Promise.resolve([] as PreMilestoneCondition[]),
    warningService.scanPreMilestoneWarnings(projectId).catch(() => []),
    getIssues(projectId).catch(() => []),
    getRisks(projectId).catch(() => []),
  ])
  const records = [
    {
      id: `${certificateId}-current`,
      project_id: projectId,
      target_type: 'certificate' as const,
      target_id: resolvedCertificateId,
      record_type: 'status_change' as const,
      from_status: null,
      to_status: certificate.status ?? null,
      content: certificate.description ?? null,
      recorded_at: normalizeDate(certificate.updated_at) ?? new Date().toISOString(),
      recorded_by: certificate.created_by ?? null,
    },
    ...conditions.map((condition) => ({
      id: condition.id,
      project_id: projectId,
      target_type: 'certificate' as const,
      target_id: resolvedCertificateId,
      record_type: condition.status === '未满足'
        ? 'blocked' as const
        : condition.status === '已满足'
          ? 'condition_satisfied' as const
          : condition.status === '已确认'
            ? 'status_change' as const
            : 'note' as const,
      from_status: null,
      to_status: condition.status,
      content: condition.condition_name,
      recorded_at: condition.updated_at,
      recorded_by: condition.completed_by ?? null,
    })),
  ]

  const data = buildLicenseDetailReadModel({
    certificates: orderedCertificates,
    certificate,
    workItems,
    dependencies,
    conditions,
    warnings,
    issues,
    risks,
    records,
  })

  const response: ApiResponse<CertificateDetailResponse> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post(
  '/:certificateId/escalate-issue',
  requireProjectEditor((req) => readProjectId(req)),
  asyncHandler(async (req, res) => {
  const projectId = readProjectId(req)
  const { certificateId } = req.params

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const certificates = await loadProjectCertificates(projectId)
  const certificate = findCertificateByRequestId(certificates, certificateId)
  const workItems = await loadProjectWorkItems(projectId)
  const dependencies = await loadProjectDependencies(projectId)
  const target = resolveEscalationTarget({
    certificateId,
    certificate,
    workItems,
    dependencies,
    requestedWorkItemId: req.body?.work_item_id,
  })

  if (!target) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_WORK_ITEM', message: '办理事项不存在或未关联到当前证照' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const title = normalizeLookupKey(req.body?.title) || `前期证照卡点问题：${target.targetLabel}`
  const description =
    normalizeLookupKey(req.body?.description) ||
    `由前期证照工作台手动升级到问题主链。${target.descriptionFragment}`

  const duplicate = await findDuplicateEscalatedIssue({
    projectId,
    title,
    sourceEntityType: target.sourceEntityType,
    sourceEntityId: target.sourceEntityId,
  })

  const issue =
    duplicate ??
    await createIssueInMainChain({
      project_id: projectId,
      task_id: null,
      title,
      description,
      source_type: 'manual',
      source_id: null,
      source_entity_type: target.sourceEntityType,
      source_entity_id: target.sourceEntityId,
      chain_id: null,
      severity: 'high',
      priority: 70,
      pending_manual_close: false,
      status: 'open',
      closed_reason: null,
      closed_at: null,
      version: 1,
    } as Omit<Issue, 'id' | 'created_at' | 'updated_at'>)

  const response: ApiResponse<Issue> = {
    success: true,
    data: issue,
    timestamp: new Date().toISOString(),
  }
  res.status(duplicate ? 200 : 201).json(response)
  }),
)

router.post(
  '/:certificateId/escalate-risk',
  requireProjectEditor((req) => readProjectId(req)),
  asyncHandler(async (req, res) => {
  const projectId = readProjectId(req)
  const { certificateId } = req.params

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const certificates = await loadProjectCertificates(projectId)
  const certificate = findCertificateByRequestId(certificates, certificateId)
  const workItems = await loadProjectWorkItems(projectId)
  const dependencies = await loadProjectDependencies(projectId)
  const target = resolveEscalationTarget({
    certificateId,
    certificate,
    workItems,
    dependencies,
    requestedWorkItemId: req.body?.work_item_id,
  })

  if (!target) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_WORK_ITEM', message: '办理事项不存在或未关联到当前证照' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const title = normalizeLookupKey(req.body?.title) || `前期证照长期卡点风险：${target.targetLabel}`
  const description =
    normalizeLookupKey(req.body?.description) ||
    `由前期证照工作台手动升级到风险主链。${target.descriptionFragment}`

  const duplicate = await findDuplicateEscalatedRisk({
    projectId,
    title,
    sourceEntityType: target.sourceEntityType,
    sourceEntityId: target.sourceEntityId,
  })

  const risk =
    duplicate ??
    await createRisk({
      project_id: projectId,
      task_id: null,
      title,
      description,
      probability: 50,
      impact: 70,
      level: 'high',
      status: 'identified',
      source_type: 'manual',
      source_id: null,
      source_entity_type: target.sourceEntityType,
      source_entity_id: target.sourceEntityId,
      chain_id: null,
      pending_manual_close: false,
      linked_issue_id: null,
      closed_reason: null,
      closed_at: null,
      version: 1,
    } as Omit<Risk, 'id' | 'created_at' | 'updated_at'>)

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.status(duplicate ? 200 : 201).json(response)
  }),
)

// 获取项目的所有前期证照
router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching pre-milestones', { projectId })

  const data = (await executeSQL(
    `${PRE_MILESTONE_SELECT} WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId]
  )).map((row) => normalizePreMilestoneRecord(row))

  const response: ApiResponse<PreMilestone[]> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个前期证照
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching pre-milestone', { id })

  const data = normalizePreMilestoneRecord(
    await executeSQLOne(`${PRE_MILESTONE_SELECT} WHERE id = ? LIMIT 1`, [id]),
  )

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PRE_MILESTONE_NOT_FOUND', message: '前期证照不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<PreMilestone> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建前期证照
router.post(
  '/',
  requireProjectEditor((req) => String(req.body?.project_id ?? req.params.projectId ?? '').trim()),
  asyncHandler(async (req, res) => {
  logger.info('Creating pre-milestone', req.body)

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'document_no')) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'document_no 已下线，请改用 certificate_no' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const certificateType = normalizeCertificateType(
    req.body.certificate_type ?? req.body.milestone_type ?? req.body.milestone_name,
    0,
  )
  const certificateName =
    normalizeLookupKey(req.body.certificate_name) ||
    normalizeLookupKey(req.body.milestone_name) ||
    normalizeLookupKey(req.body.name) ||
    getCertificateTypeLabel(certificateType)
  const certificateNo = resolveIncomingCertificateNo(req.body)
  const normalizedCreatePayload = {
    ...req.body,
    milestone_type: certificateType,
    milestone_name: certificateName,
    certificate_type: certificateType,
    certificate_name: certificateName,
    status: normalizeIncomingCertificateStatus(req.body.status) ?? 'pending',
    current_stage: normalizeIncomingCertificateStage(req.body.current_stage, certificateType),
    certificate_no: certificateNo,
    planned_finish_date: normalizeDate(req.body.planned_finish_date ?? req.body.planned_end_date ?? req.body.planned_date),
    actual_finish_date: normalizeDate(req.body.actual_finish_date ?? req.body.actual_end_date ?? req.body.actual_date),
    approving_authority: normalizeLookupKey(req.body.approving_authority) || normalizeLookupKey(req.body.issuing_authority) || null,
    next_action: normalizeLookupKey(req.body.next_action) || normalizeLookupKey(req.body.description) || null,
    next_action_due_date: normalizeDate(req.body.next_action_due_date),
    is_blocked: Boolean(req.body.is_blocked),
    block_reason: normalizeLookupKey(req.body.block_reason) || null,
    latest_record_at: normalizeDate(req.body.latest_record_at),
  }

  // 验证数据
  const validation = ValidationService.validatePreMilestone(normalizedCreatePayload)
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

  await executeSQL(
    `INSERT INTO pre_milestones
       (id, project_id, milestone_type, milestone_name, certificate_type, certificate_name,
        status, certificate_no, issue_date, expiry_date,
        current_stage, planned_finish_date, actual_finish_date,
        approving_authority, issuing_authority, next_action, next_action_due_date,
        is_blocked, block_reason, latest_record_at,
        description, phase_id, lead_unit, planned_start_date, planned_end_date,
        responsible_user_id, sort_order, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      normalizedCreatePayload.project_id,
      normalizedCreatePayload.milestone_type,
      normalizedCreatePayload.milestone_name,
      normalizedCreatePayload.certificate_type,
      normalizedCreatePayload.certificate_name,
      normalizedCreatePayload.status,
      normalizedCreatePayload.certificate_no,
      normalizedCreatePayload.issue_date ?? null,
      normalizedCreatePayload.expiry_date ?? null,
      normalizedCreatePayload.current_stage ?? null,
      normalizedCreatePayload.planned_finish_date ?? null,
      normalizedCreatePayload.actual_finish_date ?? null,
      normalizedCreatePayload.approving_authority ?? null,
      normalizedCreatePayload.approving_authority ?? null,
      normalizedCreatePayload.next_action ?? null,
      normalizedCreatePayload.next_action_due_date ?? null,
      normalizedCreatePayload.is_blocked ? 1 : 0,
      normalizedCreatePayload.block_reason ?? null,
      normalizedCreatePayload.latest_record_at ?? ts,
      normalizedCreatePayload.description ?? null,
      normalizedCreatePayload.phase_id ?? null,
      normalizedCreatePayload.lead_unit ?? null,
      normalizedCreatePayload.planned_start_date ?? null,
      normalizedCreatePayload.planned_end_date ?? null,
      normalizedCreatePayload.responsible_user_id ?? null,
      normalizedCreatePayload.sort_order ?? 0,
      (normalizedCreatePayload.created_by || normalizedCreatePayload.user_id) || null,
      ts,
      ts,
    ]
  )

  const data = normalizePreMilestoneRecord(
    await executeSQLOne(`${PRE_MILESTONE_SELECT} WHERE id = ? LIMIT 1`, [id]),
  )

  const response: ApiResponse<PreMilestone> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
  }),
)

// 更新前期证照
router.put(
  '/:id',
  requireProjectEditor(async (req) => {
    const row = await executeSQLOne<ProjectIdRow>(
      'SELECT project_id FROM pre_milestones WHERE id = ? LIMIT 1',
      [req.params.id],
    )
    return row?.project_id
  }),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating pre-milestone', { id })

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'document_no')) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'document_no 已下线，请改用 certificate_no' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 获取当前状态
  const current = normalizePreMilestoneRecord(await executeSQLOne(
    `${PRE_MILESTONE_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  ))

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PRE_MILESTONE_NOT_FOUND', message: '前期证照不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const normalizedStatus = Object.prototype.hasOwnProperty.call(req.body, 'status')
    ? normalizeIncomingCertificateStatus(req.body.status)
    : null

  if (normalizedStatus !== null && normalizedStatus !== current.status) {
    const currentStatus = normalizeCertificateStatus(current.status)
    const allowedNext = CERTIFICATE_STATUS_TRANSITIONS[currentStatus] ?? []
    if (!allowedNext.includes(normalizedStatus)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `不允许从"${currentStatus}"变更为"${normalizedStatus}"`,
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }
  }
  const normalizedStage = Object.prototype.hasOwnProperty.call(req.body, 'current_stage')
    ? normalizeIncomingCertificateStage(req.body.current_stage, current.current_stage ?? current.milestone_type)
    : null
  const nextCertificateType = normalizeLookupKey(req.body.certificate_type)
    || normalizeLookupKey(req.body.milestone_type)
    || normalizeLookupKey(current.certificate_type)
    || normalizeLookupKey(current.milestone_type)
  const nextCertificateName =
    normalizeLookupKey(req.body.certificate_name)
    || normalizeLookupKey(req.body.milestone_name)
    || normalizeLookupKey(req.body.name)
    || normalizeLookupKey(current.certificate_name)
    || normalizeLookupKey(current.milestone_name)
    || getCertificateTypeLabel(nextCertificateType)
  const nextCertificateNo = resolveIncomingCertificateNo(req.body) ?? resolvePersistedCertificateNo(current)
  const normalizedUpdatePayload = {
    ...current,
    ...req.body,
    milestone_type: nextCertificateType,
    milestone_name: nextCertificateName,
    certificate_type: nextCertificateType,
    certificate_name: nextCertificateName,
    status: normalizedStatus ?? current.status,
    current_stage: normalizedStage ?? current.current_stage,
    certificate_no: nextCertificateNo,
    planned_finish_date: normalizeDate(req.body.planned_finish_date ?? req.body.planned_end_date ?? req.body.planned_date ?? current.planned_finish_date ?? current.planned_end_date ?? current.planned_date),
    actual_finish_date: normalizeDate(req.body.actual_finish_date ?? req.body.actual_end_date ?? req.body.actual_date ?? current.actual_finish_date ?? current.actual_end_date ?? current.actual_date),
    approving_authority:
      normalizeLookupKey(req.body.approving_authority)
      || normalizeLookupKey(req.body.issuing_authority)
      || normalizeLookupKey(current.approving_authority)
      || normalizeLookupKey(current.issuing_authority)
      || null,
    next_action: normalizeLookupKey(req.body.next_action) || normalizeLookupKey(req.body.description) || normalizeLookupKey(current.next_action) || normalizeLookupKey(current.description) || null,
    next_action_due_date: normalizeDate(req.body.next_action_due_date ?? current.next_action_due_date),
    is_blocked: Object.prototype.hasOwnProperty.call(req.body, 'is_blocked') ? Boolean(req.body.is_blocked) : Boolean(current.is_blocked),
    block_reason: normalizeLookupKey(req.body.block_reason) || normalizeLookupKey(current.block_reason) || null,
    latest_record_at: normalizeDate(req.body.latest_record_at ?? current.latest_record_at ?? current.updated_at),
  }

  // 如果更新状态，验证状态转换
  if (normalizedStatus && normalizedStatus !== current.status) {
    const statusValidation = ValidationService.validatePreMilestoneStatusUpdate(
      current.status,
      normalizedStatus,
      nextCertificateNo ?? undefined,
      req.body.issue_date ?? current.issue_date,
    )
    if (!statusValidation.valid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'STATUS_TRANSITION_ERROR',
          message: statusValidation.errors.join('; ')
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }
  }

  // 验证其他数据
  const validation = ValidationService.validatePreMilestone(normalizedUpdatePayload)
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

  const fieldMap: Record<string, any> = {
    milestone_type: Object.prototype.hasOwnProperty.call(req.body, 'certificate_type') || Object.prototype.hasOwnProperty.call(req.body, 'milestone_type')
      ? normalizedUpdatePayload.milestone_type
      : undefined,
    milestone_name: Object.prototype.hasOwnProperty.call(req.body, 'certificate_name') || Object.prototype.hasOwnProperty.call(req.body, 'milestone_name') || Object.prototype.hasOwnProperty.call(req.body, 'name')
      ? normalizedUpdatePayload.milestone_name
      : undefined,
    certificate_type: Object.prototype.hasOwnProperty.call(req.body, 'certificate_type') || Object.prototype.hasOwnProperty.call(req.body, 'milestone_type')
      ? normalizedUpdatePayload.certificate_type
      : undefined,
    certificate_name: Object.prototype.hasOwnProperty.call(req.body, 'certificate_name') || Object.prototype.hasOwnProperty.call(req.body, 'milestone_name') || Object.prototype.hasOwnProperty.call(req.body, 'name')
      ? normalizedUpdatePayload.certificate_name
      : undefined,
    status: normalizedStatus ?? undefined,
    certificate_no: req.body.certificate_no !== undefined ? normalizedUpdatePayload.certificate_no : undefined,
    issue_date: req.body.issue_date,
    expiry_date: req.body.expiry_date,
    current_stage: Object.prototype.hasOwnProperty.call(req.body, 'current_stage') ? normalizedUpdatePayload.current_stage : undefined,
    planned_finish_date: req.body.planned_finish_date !== undefined || req.body.planned_end_date !== undefined || req.body.planned_date !== undefined
      ? normalizedUpdatePayload.planned_finish_date
      : undefined,
    actual_finish_date: req.body.actual_finish_date !== undefined || req.body.actual_end_date !== undefined || req.body.actual_date !== undefined
      ? normalizedUpdatePayload.actual_finish_date
      : undefined,
    approving_authority: req.body.approving_authority !== undefined || req.body.issuing_authority !== undefined
      ? normalizedUpdatePayload.approving_authority
      : undefined,
    issuing_authority: req.body.approving_authority !== undefined || req.body.issuing_authority !== undefined
      ? normalizedUpdatePayload.approving_authority
      : undefined,
    next_action: req.body.next_action !== undefined || req.body.description !== undefined
      ? normalizedUpdatePayload.next_action
      : undefined,
    next_action_due_date: req.body.next_action_due_date !== undefined
      ? normalizedUpdatePayload.next_action_due_date
      : undefined,
    is_blocked: Object.prototype.hasOwnProperty.call(req.body, 'is_blocked') ? (normalizedUpdatePayload.is_blocked ? 1 : 0) : undefined,
    block_reason: req.body.block_reason !== undefined ? normalizedUpdatePayload.block_reason : undefined,
    latest_record_at: req.body.latest_record_at !== undefined ? normalizedUpdatePayload.latest_record_at : undefined,
    description: req.body.description,
    phase_id: req.body.phase_id,
    lead_unit: req.body.lead_unit,
    planned_start_date: req.body.planned_start_date,
    planned_end_date: req.body.planned_end_date,
    responsible_user_id: req.body.responsible_user_id,
    sort_order: req.body.sort_order,
  }

  for (const [col, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      setClauses.push(`${col} = ?`)
      params.push(val)
    }
  }

  params.push(id)
  await executeSQL(`UPDATE pre_milestones SET ${setClauses.join(', ')} WHERE id = ?`, params)

  await syncAcceptanceRequirementsBySource({
    projectId: String(current.project_id ?? ''),
    sourceEntityTypes: ['pre_milestone', 'certificate'],
    sourceEntityId: id,
    isSatisfied: normalizeCertificateStatus(normalizedUpdatePayload.status) === 'issued',
  })

  const data = normalizePreMilestoneRecord(
    await executeSQLOne(`${PRE_MILESTONE_SELECT} WHERE id = ? LIMIT 1`, [id]),
  )

  const response: ApiResponse<PreMilestone> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
  }),
)

// 删除前期证照
router.delete(
  '/:id',
  requireProjectEditor(async (req) => {
    const row = await executeSQLOne<ProjectIdRow>(
      'SELECT project_id FROM pre_milestones WHERE id = ? LIMIT 1',
      [req.params.id],
    )
    return row?.project_id
  }),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting pre-milestone', { id })

  await executeSQL('DELETE FROM pre_milestones WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
  }),
)

// 解锁施工阶段 - 当施工证完成后调用
router.put(
  '/:id/unlock-construction',
  requireProjectEditor(async (req) => {
    const row = await executeSQLOne<ProjectIdRow>(
      'SELECT project_id FROM pre_milestones WHERE id = ? LIMIT 1',
      [req.params.id],
    )
    return row?.project_id
  }),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  const { user_id } = req.body
  logger.info('Unlocking construction phase', { id, user_id })

  // 获取证照信息（两步查询避免 JOIN 正则截断）
  const milestone = await executeSQLOne<PreMilestoneRouteRecord>(
    `${PRE_MILESTONE_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )
  let projName: string | undefined
  if (milestone?.project_id) {
    const proj = await executeSQLOne<ProjectLookupRow>('SELECT id, name FROM projects WHERE id = ? LIMIT 1', [milestone.project_id])
    projName = proj?.name ?? undefined
    if (proj) {
      milestone.proj_id = proj.id
      milestone.proj_name = proj.name
    }
  }

  if (!milestone) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PRE_MILESTONE_NOT_FOUND', message: '前期证照不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 验证是否为施工证类型
  if (normalizeCertificateType(milestone.certificate_type ?? milestone.milestone_type, 0) !== 'construction_permit') {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_MILESTONE_TYPE', message: '只有施工证才能解锁施工阶段' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 验证状态为已取得（数据库存储的是DB值，不是Display值）
  if (normalizeCertificateStatus(milestone.status) !== 'issued') {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_STATUS', message: '施工证必须为已领证状态才能解锁施工阶段' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 更新项目阶段为施工中
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const unlockDate = new Date().toISOString().split('T')[0]
  await executeSQL(
    'UPDATE projects SET current_phase = ?, construction_unlock_date = ?, construction_unlock_by = ?, updated_at = ? WHERE id = ?',
    ['construction', unlockDate, user_id ?? null, ts, milestone.project_id]
  )

  const response: ApiResponse = {
    success: true,
    data: {
      project_id: milestone.project_id,
      current_phase: 'construction',
      message: '已成功解锁施工阶段'
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
  }),
)

// 生成默认WBS结构 - 从模板生成施工阶段WBS
router.post(
  '/:id/generate-wbs',
  requireProjectEditor(async (req) => {
    const row = await executeSQLOne<ProjectIdRow>(
      'SELECT project_id FROM pre_milestones WHERE id = ? LIMIT 1',
      [req.params.id],
    )
    return row?.project_id
  }),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  const { user_id } = req.body
  logger.info('Generating default WBS from pre-milestone', { id, user_id })

  // 获取证照信息 + 项目（两步查询避免 JOIN 正则截断）
  const milestone = await executeSQLOne<PreMilestoneRouteRecord>(
    `${PRE_MILESTONE_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )
  if (milestone?.project_id) {
    const proj = await executeSQLOne<ProjectLookupRow>(
      'SELECT id, name, current_phase, default_wbs_generated FROM projects WHERE id = ? LIMIT 1',
      [milestone.project_id]
    )
    if (proj) {
      milestone.proj_id = proj.id
      milestone.proj_name = proj.name
      milestone.current_phase = proj.current_phase
      milestone.default_wbs_generated = proj.default_wbs_generated ?? null
    }
  }

  if (!milestone) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PRE_MILESTONE_NOT_FOUND', message: '前期证照不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 检查项目是否已生成过WBS
  if (isTruthyLike(milestone.default_wbs_generated)) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'WBS_ALREADY_GENERATED', message: '该项目已生成过WBS结构' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 获取默认施工阶段WBS模板
  const template = await executeSQLOne<WbsTemplateRow>(
    `${WBS_TEMPLATE_DEFAULT_SELECT} WHERE is_construction_default = 1 LIMIT 1`,
    []
  )

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  if (!template) {
    // 如果没有默认模板，创建一个基本的WBS结构
    const defaultNodes = buildGeneratedWbsNodes([
      { node_name: '地基与基础', level: 1, sort_order: 1 },
      { node_name: '主体结构', level: 1, sort_order: 2 },
      { node_name: '装饰装修', level: 1, sort_order: 3 },
      { node_name: '机电安装', level: 1, sort_order: 4 },
      { node_name: '竣工验收', level: 1, sort_order: 5 },
    ])
    const generated = await seedProjectWbsArtifacts({
      projectId: milestone.project_id,
      nodes: defaultNodes,
      createdBy: req.user?.id ?? null,
      ts,
    })

    // 标记项目已生成WBS
    await executeSQL(
      'UPDATE projects SET default_wbs_generated = 1, updated_at = ? WHERE id = ?',
      [ts, milestone.project_id]
    )

    const response: ApiResponse = {
      success: true,
      data: {
        project_id: milestone.project_id,
        nodes_generated: generated.structureCount,
        task_nodes_generated: generated.taskCount,
        message: '已生成默认施工阶段WBS结构'
      },
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

  // 使用模板生成WBS
  const templateNodes = buildGeneratedWbsNodes(normalizeTemplateNodes(template.wbs_nodes))
  const generated = await seedProjectWbsArtifacts({
    projectId: milestone.project_id,
    nodes: templateNodes,
    createdBy: req.user?.id ?? null,
    ts,
  })

  // 标记项目已生成WBS
  await executeSQL(
    'UPDATE projects SET default_wbs_generated = 1, updated_at = ? WHERE id = ?',
    [ts, milestone.project_id]
  )

  const response: ApiResponse = {
    success: true,
    data: {
      project_id: milestone.project_id,
      nodes_generated: generated.structureCount,
      task_nodes_generated: generated.taskCount,
      template_name: template.template_name,
      message: '已根据模板生成施工阶段WBS结构'
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
  }),
)

export default router
