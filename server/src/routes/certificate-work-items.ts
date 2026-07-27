import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { withDatabaseTransaction } from '../database.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'
import type { CertificateDependency, CertificateWorkItem } from '../types/db.js'
import {
  buildSyncBatchLimitError,
  REQUEST_TIMEOUT_BUDGETS,
  runWithRequestBudget,
} from '../services/requestBudgetService.js'
import { listActiveEntityLinksForEntity } from '../services/projectLinkingService.js'
import { markPreMilestoneProjectChanged } from '../services/preMilestoneReadCache.js'
import { getProjectCompanyId } from '../auth/access.js'
import {
  buildAndPersistBusinessCompletionSampleHealthReport,
  buildCertificateMilestoneCompletionSamples,
} from '../services/businessCompletionSampleHealthAdapterService.js'
import { recordChangedExecutionFacts } from '../services/executionFactGovernanceService.js'

const router = Router({ mergeParams: true })
router.use(authenticate)

const COMPLETED_CERTIFICATE_WORK_ITEM_STATUSES = new Set([
  'completed',
  'approved',
  'issued',
  'done',
  'passed',
  'closed',
  '已完成',
  '已取得',
  '已批复',
  '已通过',
])

export const certificateWorkItemContracts = {
  types: ['CertificateWorkItem', 'CertificateDependency'],
  endpoints: [
    {
      method: 'GET',
      path: '/api/projects/:projectId/certificate-work-items',
      requestShape: '{ projectId: string, certificate_id?: string }',
      responseShape: '{ items: CertificateWorkItem[] }',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/projects/:projectId/certificate-work-items',
      requestShape: '{ item_name: string, item_stage: string, certificate_ids?: string[] }',
      responseShape: 'CertificateWorkItem',
      errorCodes: ['VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/projects/:projectId/certificate-work-items/bulk-import',
      requestShape: '{ items: Array<{ item_name: string, item_stage: string, certificate_ids?: string[] }> }',
      responseShape: 'CertificateWorkItem[]',
      errorCodes: ['VALIDATION_ERROR'],
    },
    {
      method: 'PATCH',
      path: '/api/projects/:projectId/certificate-work-items/:id',
      requestShape: '{ status?: string, next_action?: string }',
      responseShape: 'CertificateWorkItem',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'PATCH',
      path: '/api/projects/:projectId/certificate-work-items/batch',
      requestShape: '{ ids: string[], updates: { status?: string, next_action?: string } }',
      responseShape: 'CertificateWorkItem[]',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'DELETE',
      path: '/api/projects/:projectId/certificate-work-items/:id',
      requestShape: '{ id: string }',
      responseShape: '{ success: boolean }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'DELETE',
      path: '/api/projects/:projectId/certificate-work-items/batch',
      requestShape: '{ ids: string[] }',
      responseShape: '{ deleted_ids: string[] }',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR'],
    },
  ],
} as const

function normalizeText(value: unknown, fallback: string | null = null): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? fallback : trimmed
  }
  if (value == null) return fallback
  return String(value)
}

function certificateWorkItemEffectiveAt(value: unknown, observedAt: string) {
  const date = normalizeText(value)
  return date ? new Date(`${date}T00:00:00.000Z`).toISOString() : observedAt
}

async function recordCertificateWorkItemExecutionFacts(input: {
  projectId: string
  id: string
  previous: Record<string, any> | null
  next: Record<string, any>
  sourceMutationId: string
  observedAt: string
  actorUserId?: string | null
  forceInitial?: boolean
}) {
  const forceInitial = input.forceInitial === true
  await recordChangedExecutionFacts({
    projectId: input.projectId,
    entityType: 'certificate_work_item',
    entityId: input.id,
    sourceModule: 'certificate-work-items',
    sourceMutationId: input.sourceMutationId,
    actorUserId: input.actorUserId ?? null,
    observedAt: input.observedAt,
    changes: [
      {
        factType: 'certificate_work_item.status',
        previousValue: input.previous?.status ?? null,
        nextValue: input.next.status ?? null,
        force: forceInitial,
        effectiveAt: input.observedAt,
      },
      {
        factType: 'certificate_work_item.actual_finish_date',
        previousValue: input.previous?.actual_finish_date ?? null,
        nextValue: input.next.actual_finish_date ?? null,
        force: forceInitial,
        effectiveAt: certificateWorkItemEffectiveAt(input.next.actual_finish_date, input.observedAt),
      },
    ],
  })
}

function hasCompletionEvidenceUpdate(updates: Record<string, any>) {
  return Object.prototype.hasOwnProperty.call(updates, 'status')
    || Object.prototype.hasOwnProperty.call(updates, 'actual_finish_date')
}

function hasCertificateWorkItemCompletionEvidence(row: Record<string, any>) {
  if (normalizeText(row.actual_finish_date)) return true
  const normalizedStatus = normalizeText(row.status)?.toLowerCase()
  return Boolean(normalizedStatus && COMPLETED_CERTIFICATE_WORK_ITEM_STATUSES.has(normalizedStatus))
}

async function recordCertificateWorkItemSampleHealthEvidence(input: {
  projectId?: string | null
  items: Array<Record<string, any>>
  sourceRoute: string
}) {
  const projectId = normalizeText(input.projectId)
  if (!projectId) return

  const completedItems = input.items.filter(hasCertificateWorkItemCompletionEvidence)
  if (completedItems.length === 0) return

  try {
    const companyId = await getProjectCompanyId(projectId)
    if (!companyId) {
      logger.warn('[certificateWorkItems] skip certificate work item sample health evidence without company scope', {
        projectId,
        itemIds: completedItems.map((item) => normalizeText(item.id)).filter(Boolean),
      })
      return
    }

    const samples = buildCertificateMilestoneCompletionSamples(
      completedItems.map((item) => {
        const completedAt = normalizeText(item.actual_finish_date)
          ?? normalizeText(item.updated_at)
          ?? new Date().toISOString()
        const milestoneCode = normalizeText(item.item_code)
          ?? normalizeText(item.item_name)
          ?? normalizeText(item.id)
          ?? 'unknown_certificate_work_item'
        return {
          companyId,
          projectId,
          certificateId: normalizeText(item.id) ?? 'unknown_certificate_work_item',
          milestoneCode,
          completedAt,
          startedAt: completedAt,
          updatedAt: normalizeText(item.updated_at),
          qualitySignal: normalizeText(item.actual_finish_date) ? 'verified' : 'low_confidence_match',
          metadata: {
            sourceRoute: input.sourceRoute,
            certificateWorkItemId: normalizeText(item.id),
            itemCode: normalizeText(item.item_code),
            itemName: normalizeText(item.item_name),
            itemStage: normalizeText(item.item_stage),
            status: normalizeText(item.status),
            actualFinishDate: normalizeText(item.actual_finish_date),
          },
        }
      }),
    )

    await buildAndPersistBusinessCompletionSampleHealthReport({
      companyId,
      projectId,
      queryExec: executeSQL,
      samples,
    })
  } catch (error) {
    logger.warn('[certificateWorkItems] failed to record certificate work item sample health evidence', {
      projectId,
      itemIds: completedItems.map((item) => normalizeText(item.id)).filter(Boolean),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function normalizeWorkItemRow(row: Record<string, any>, certificateIds: string[] = []): CertificateWorkItem & {
  certificate_ids: string[]
} {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    item_code: row.item_code ?? null,
    item_name: row.item_name ?? '',
    item_stage: row.item_stage ?? '资料准备',
    status: row.status ?? 'pending',
    planned_finish_date: row.planned_finish_date ?? null,
    actual_finish_date: row.actual_finish_date ?? null,
    approving_authority: row.approving_authority ?? null,
    is_shared: Boolean(row.is_shared ?? certificateIds.length > 1),
    next_action: row.next_action ?? null,
    next_action_due_date: row.next_action_due_date ?? null,
    is_blocked: Boolean(row.is_blocked ?? false),
    block_reason: row.block_reason ?? null,
    sort_order: row.sort_order ?? 0,
    notes: row.notes ?? null,
    latest_record_at: row.latest_record_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    certificate_ids: certificateIds,
  }
}

async function loadWorkItemCertificateIds(projectId: string) {
  const dependencies = (await executeSQL(
    `SELECT * FROM certificate_dependencies WHERE project_id = ? AND predecessor_type = ? AND successor_type = ?`,
    [projectId, 'certificate', 'work_item']
  )) as CertificateDependency[]

  const certificateIdsByWorkItemId = new Map<string, string[]>()
  for (const dependency of dependencies) {
    const ids = certificateIdsByWorkItemId.get(dependency.successor_id) ?? []
    ids.push(dependency.predecessor_id)
    certificateIdsByWorkItemId.set(dependency.successor_id, ids)
  }

  return certificateIdsByWorkItemId
}

async function loadWorkItemRow(projectId: string, id: string) {
  const row = await executeSQLOne(
    'SELECT * FROM certificate_work_items WHERE id = ? AND project_id = ? LIMIT 1',
    [id, projectId],
  ) as Record<string, any> | null

  if (!row) return null

  const certificateIdsByWorkItemId = await loadWorkItemCertificateIds(projectId)
  return normalizeWorkItemRow(row, certificateIdsByWorkItemId.get(id) ?? [])
}

async function validateCertificateIdsBelongToProject(projectId: string, certificateIds: string[]) {
  const uniqueIds = [...new Set(certificateIds.filter(Boolean))]
  if (uniqueIds.length === 0) return null

  const rows = await executeSQL<{ id?: string | null }>(
    `SELECT id FROM pre_milestones WHERE project_id = ? AND id IN (${uniqueIds.map(() => '?').join(', ')})`,
    [projectId, ...uniqueIds],
  )
  const foundIds = new Set(rows.map((row) => String(row.id ?? '')))
  const missingIds = uniqueIds.filter((id) => !foundIds.has(id))
  if (missingIds.length === 0) return null

  return {
    success: false,
    error: {
      code: 'CERTIFICATE_PROJECT_MISMATCH',
      message: '存在不属于当前项目的证照，无法关联办理事项',
      details: { certificate_ids: missingIds },
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse
}

async function replaceWorkItemCertificateIds(projectId: string, workItemId: string, certificateIds: string[]) {
  const uniqueIds = [...new Set(certificateIds.filter(Boolean))]

  await executeSQL(
    'DELETE FROM certificate_dependencies WHERE project_id = ? AND predecessor_type = ? AND successor_type = ? AND successor_id = ?',
    [projectId, 'certificate', 'work_item', workItemId],
  )

  for (const certificateId of uniqueIds) {
    await executeSQL(
      `INSERT INTO certificate_dependencies
         (id, project_id, predecessor_type, predecessor_id, successor_type, successor_id, dependency_kind, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        projectId,
        'certificate',
        certificateId,
        'work_item',
        workItemId,
        'soft',
        '证照台账批量维护',
        new Date().toISOString(),
      ],
    )
  }

  await executeSQL(
    `UPDATE certificate_work_items
       SET certificate_ids = ?,
           is_shared = ?,
           updated_at = ?
     WHERE id = ? AND project_id = ?`,
    [
      uniqueIds,
      uniqueIds.length > 1,
      new Date().toISOString(),
      workItemId,
      projectId,
    ],
  )
}

async function getLinkedCertificateWorkItemDeleteBlockers(projectId: string, ids: string[]) {
  const blockedIds: string[] = []
  let activeLinkCount = 0

  for (const id of ids) {
    const links = await listActiveEntityLinksForEntity({
      projectId,
      entityType: 'certificate_work_item',
      entityId: id,
    })
    if (links.length > 0) {
      blockedIds.push(id)
      activeLinkCount += links.length
    }
  }

  return { blockedIds, activeLinkCount }
}

function buildCertificateWorkItemLinkedResponse(blockedIds: string[], activeLinkCount: number): ApiResponse {
  return {
    success: false,
    error: {
      code: 'CERTIFICATE_WORK_ITEM_LINKED',
      message: 'One or more certificate work items still have active task/certificate links. Deactivate or archive the linkage before deleting.',
      details: { blockedIds, activeLinkCount },
    },
    timestamp: new Date().toISOString(),
  }
}

const allowedWorkItemFields = [
  'item_code',
  'item_name',
  'item_stage',
  'status',
  'planned_finish_date',
  'actual_finish_date',
  'approving_authority',
  'is_shared',
  'next_action',
  'next_action_due_date',
  'is_blocked',
  'block_reason',
  'sort_order',
  'notes',
  'latest_record_at',
] as const

type AllowedWorkItemField = (typeof allowedWorkItemFields)[number]

function pickWorkItemUpdates(body: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(body ?? {}).filter(([key]) => allowedWorkItemFields.includes(key as AllowedWorkItemField)),
  )
}

function mergeCertificateWorkItemUpdate(
  current: Record<string, any>,
  updates: Record<string, any>,
) {
  const next: Record<AllowedWorkItemField, any> = {} as Record<AllowedWorkItemField, any>
  for (const field of allowedWorkItemFields) {
    next[field] = Object.prototype.hasOwnProperty.call(updates, field)
      ? updates[field]
      : current[field]
  }
  return next
}

async function updateCertificateWorkItemFixedColumns(
  projectId: string,
  id: string,
  current: Record<string, any>,
  updates: Record<string, any>,
) {
  const next = mergeCertificateWorkItemUpdate(current, updates)
  await executeSQL(
    `UPDATE certificate_work_items
       SET item_code = ?,
           item_name = ?,
           item_stage = ?,
           status = ?,
           planned_finish_date = ?,
           actual_finish_date = ?,
           approving_authority = ?,
           is_shared = ?,
           next_action = ?,
           next_action_due_date = ?,
           is_blocked = ?,
           block_reason = ?,
           sort_order = ?,
           notes = ?,
           latest_record_at = ?,
           updated_at = ?
     WHERE id = ? AND project_id = ?`,
    [
      next.item_code ?? null,
      next.item_name ?? '',
      next.item_stage ?? '资料准备',
      next.status ?? 'pending',
      next.planned_finish_date ?? null,
      next.actual_finish_date ?? null,
      next.approving_authority ?? null,
      next.is_shared ?? false,
      next.next_action ?? null,
      next.next_action_due_date ?? null,
      next.is_blocked ?? false,
      next.block_reason ?? null,
      next.sort_order ?? 0,
      next.notes ?? null,
      next.latest_record_at ?? null,
      new Date().toISOString(),
      id,
      projectId,
    ],
  )
}

type CertificateWorkItemCreateInput = {
  item_code?: string | null
  item_name: string
  item_stage: string
  status?: string | null
  planned_finish_date?: string | null
  actual_finish_date?: string | null
  approving_authority?: string | null
  is_shared?: boolean | null
  next_action?: string | null
  next_action_due_date?: string | null
  is_blocked?: boolean | null
  block_reason?: string | null
  sort_order?: number | null
  notes?: string | null
  certificate_ids?: string[] | null
}

function normalizeCreatePayload(input: Record<string, any>): CertificateWorkItemCreateInput {
  return {
    item_code: input.item_code ?? null,
    item_name: String(input.item_name ?? '').trim(),
    item_stage: String(input.item_stage ?? '').trim(),
    status: input.status ?? 'pending',
    planned_finish_date: input.planned_finish_date ?? null,
    actual_finish_date: input.actual_finish_date ?? null,
    approving_authority: input.approving_authority ?? null,
    is_shared: typeof input.is_shared === 'boolean' ? input.is_shared : null,
    next_action: input.next_action ?? null,
    next_action_due_date: input.next_action_due_date ?? null,
    is_blocked: input.is_blocked ?? null,
    block_reason: input.block_reason ?? null,
    sort_order: typeof input.sort_order === 'number' ? input.sort_order : Number(input.sort_order ?? 0),
    notes: input.notes ?? null,
    certificate_ids: Array.isArray(input.certificate_ids)
      ? input.certificate_ids.filter(Boolean).map((value: unknown) => String(value))
      : [],
  }
}

async function createWorkItemAtomically(
  projectId: string,
  input: CertificateWorkItemCreateInput,
  actorUserId?: string | null,
) {
  const id = uuidv4()
  const createdAt = new Date().toISOString()
  const sharedFromBody = typeof input.is_shared === 'boolean'
    ? input.is_shared
    : (input.certificate_ids?.length ?? 0) > 1

  const created = await withDatabaseTransaction(async () => {
    const [createdRow] = await executeSQL<CertificateWorkItem>(
      `SELECT * FROM create_certificate_work_item_atomic(
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      [
        id,
        projectId,
        input.item_code ?? null,
        input.item_name,
        input.item_stage,
        input.status ?? 'pending',
        input.planned_finish_date ?? null,
        input.actual_finish_date ?? null,
        input.approving_authority ?? null,
        sharedFromBody,
        input.next_action ?? null,
        input.next_action_due_date ?? null,
        Boolean(input.is_blocked ?? false),
        input.block_reason ?? null,
        input.sort_order ?? 0,
        input.notes ?? null,
        createdAt,
        input.certificate_ids ?? [],
      ],
    )

    if (!createdRow) throw new Error('CREATE_CERTIFICATE_WORK_ITEM_FAILED')

    await recordCertificateWorkItemExecutionFacts({
      projectId,
      id,
      previous: null,
      next: createdRow as Record<string, any>,
      sourceMutationId: `certificate_work_item:${id}:create`,
      observedAt: normalizeText(createdRow.updated_at) ?? createdAt,
      actorUserId,
      forceInitial: true,
    })
    return createdRow
  })

  markPreMilestoneProjectChanged(projectId)
  return created
}

router.get(
  '/',
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string | undefined
    const certificateId = req.query.certificate_id as string | undefined

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    logger.info('Fetching certificate work items', { projectId, certificateId })

    const rows = (await executeSQL(
      'SELECT * FROM certificate_work_items WHERE project_id = ? ORDER BY sort_order ASC',
      [projectId]
    )) as CertificateWorkItem[]

    const certificateIdsByWorkItemId = await loadWorkItemCertificateIds(projectId)
    const items = rows.map((row) => normalizeWorkItemRow(row as any, certificateIdsByWorkItemId.get(row.id) ?? []))
    const filteredItems = certificateId
      ? items.filter((item) => item.certificate_ids.includes(certificateId))
      : items

    const response: ApiResponse<typeof filteredItems> = {
      success: true,
      data: filteredItems,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/',
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string | undefined
    const payload = normalizeCreatePayload(req.body ?? {})

    if (!projectId || !payload.item_name || !payload.item_stage) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId, item_name, item_stage 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const certificateError = await validateCertificateIdsBelongToProject(projectId, payload.certificate_ids ?? [])
    if (certificateError) return res.status(400).json(certificateError)

    const created = await createWorkItemAtomically(projectId, payload, req.user?.id ?? null)

    const response: ApiResponse<CertificateWorkItem> = {
      success: true,
      data: created,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  })
)

router.post(
  '/bulk-import',
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string | undefined
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : []

    if (!projectId || rawItems.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId 和 items 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const items = rawItems.map((item) => normalizeCreatePayload(item ?? {}))
    if (items.some((item) => !item.item_name || !item.item_stage)) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'items 中每条记录都必须包含 item_name 和 item_stage' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const certificateError = await validateCertificateIdsBelongToProject(
      projectId,
      items.flatMap((item) => item.certificate_ids ?? []),
    )
    if (certificateError) return res.status(400).json(certificateError)

    if (items.length > 100) {
      const error = buildSyncBatchLimitError(items.length, { operation: 'certificate_work_items.bulk_import' })
      const response: ApiResponse = {
        success: false,
        error: {
          code: error.code ?? 'BATCH_ASYNC_REQUIRED',
          message: error.message,
          details: error.details,
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(error.statusCode ?? 413).json(response)
    }

    const createdItems = await runWithRequestBudget(
      {
        operation: 'certificate_work_items.bulk_import',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
      },
      async () => {
        const rows: CertificateWorkItem[] = []
        for (const item of items) {
          rows.push(await createWorkItemAtomically(projectId, item, req.user?.id ?? null))
        }
        return rows
      },
    )

    const response: ApiResponse<CertificateWorkItem[]> = {
      success: true,
      data: createdItems,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  }),
)

router.patch(
  '/batch',
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string | undefined
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean).map((value: unknown) => String(value)) : []
    const updates = pickWorkItemUpdates(req.body?.updates ?? {})

    if (!projectId || ids.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId 和 ids 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    if (Object.keys(updates).length === 0) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'updates 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    if (ids.length > 100) {
      const error = buildSyncBatchLimitError(ids.length, { operation: 'certificate_work_items.batch_patch' })
      const response: ApiResponse = {
        success: false,
        error: {
          code: error.code ?? 'BATCH_ASYNC_REQUIRED',
          message: error.message,
          details: error.details,
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(error.statusCode ?? 413).json(response)
    }

    const rows = await executeSQL(
      `SELECT * FROM certificate_work_items WHERE project_id = ? AND id IN (${ids.map(() => '?').join(', ')}) ORDER BY created_at ASC`,
      [projectId, ...ids],
    ) as Array<Record<string, any>>

    if (rows.length !== ids.length) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'WORK_ITEM_NOT_FOUND', message: '存在不存在的办理事项，无法批量更新' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    const updatedItems = await runWithRequestBudget(
      {
        operation: 'certificate_work_items.batch_patch',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
      },
      async () => withDatabaseTransaction(async () => {
        const lockedRows = await executeSQL(
          `SELECT * FROM certificate_work_items WHERE project_id = ? AND id IN (${ids.map(() => '?').join(', ')}) ORDER BY created_at ASC FOR UPDATE`,
          [projectId, ...ids],
        ) as Array<Record<string, any>>
        if (lockedRows.length !== ids.length) throw new Error('WORK_ITEM_NOT_FOUND')

        const currentById = new Map(lockedRows.map((row) => [String(row.id), row]))
        for (const id of ids) {
          const current = currentById.get(id)
          if (current) {
            const previous = { ...current }
            await updateCertificateWorkItemFixedColumns(projectId, id, current, updates)
            if (hasCompletionEvidenceUpdate(updates)) {
              const item = await loadWorkItemRow(projectId, id)
              if (item) {
                const observedAt = normalizeText(item.updated_at) ?? new Date().toISOString()
                await recordCertificateWorkItemExecutionFacts({
                  projectId,
                  id,
                  previous,
                  next: item as Record<string, any>,
                  sourceMutationId: `certificate_work_item:${id}:update:${observedAt}`,
                  observedAt,
                  actorUserId: req.user?.id ?? null,
                })
              }
            }
          }
        }

        const items: Array<CertificateWorkItem & { certificate_ids: string[] }> = []
        for (const id of ids) {
          const item = await loadWorkItemRow(projectId, id)
          if (item) items.push(item)
        }
        return items
      }),
    )
    markPreMilestoneProjectChanged(projectId)
    if (hasCompletionEvidenceUpdate(updates)) {
      await recordCertificateWorkItemSampleHealthEvidence({
        projectId,
        items: updatedItems,
        sourceRoute: 'certificate-work-items.batch-patch',
      })
    }

    const response: ApiResponse<typeof updatedItems> = {
      success: true,
      data: updatedItems,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.patch(
  '/:id',
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string | undefined
    const { id } = req.params

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const current = await executeSQLOne(
      'SELECT * FROM certificate_work_items WHERE id = ? AND project_id = ? LIMIT 1',
      [id, projectId]
    )

    if (!current) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'WORK_ITEM_NOT_FOUND', message: '办理事项不存在' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    const updates = pickWorkItemUpdates(req.body ?? {})
    const nextCertificateIds = Array.isArray(req.body?.certificate_ids)
      ? req.body.certificate_ids.filter(Boolean).map((value: unknown) => String(value))
      : null

    const mutation = await withDatabaseTransaction(async () => {
      const lockedCurrent = await executeSQLOne(
        'SELECT * FROM certificate_work_items WHERE id = ? AND project_id = ? LIMIT 1 FOR UPDATE',
        [id, projectId],
      )
      if (!lockedCurrent) return { kind: 'not_found' as const }

      const previous = { ...(lockedCurrent as Record<string, any>) }
      if (Object.keys(updates).length > 0) {
        await updateCertificateWorkItemFixedColumns(projectId, id, lockedCurrent as Record<string, any>, updates)
      }

      if (nextCertificateIds) {
        const certificateError = await validateCertificateIdsBelongToProject(projectId, nextCertificateIds)
        if (certificateError) return { kind: 'validation_error' as const, response: certificateError }
        await replaceWorkItemCertificateIds(projectId, id, nextCertificateIds)
      }

      const data = await loadWorkItemRow(projectId, id)
      if (data && hasCompletionEvidenceUpdate(updates)) {
        const observedAt = normalizeText(data.updated_at) ?? new Date().toISOString()
        await recordCertificateWorkItemExecutionFacts({
          projectId,
          id,
          previous,
          next: data as Record<string, any>,
          sourceMutationId: `certificate_work_item:${id}:update:${observedAt}`,
          observedAt,
          actorUserId: req.user?.id ?? null,
        })
      }
      return { kind: 'ok' as const, data }
    })

    if (mutation.kind === 'not_found') {
      const response: ApiResponse = {
        success: false,
        error: { code: 'WORK_ITEM_NOT_FOUND', message: 'work item not found' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }
    if (mutation.kind === 'validation_error') return res.status(400).json(mutation.response)

    const data = mutation.data
    markPreMilestoneProjectChanged(projectId)
    if (data && hasCompletionEvidenceUpdate(updates)) {
      await recordCertificateWorkItemSampleHealthEvidence({
        projectId,
        items: [data],
        sourceRoute: 'certificate-work-items.patch',
      })
    }
    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.delete(
  '/batch',
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string | undefined
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean).map((value: unknown) => String(value)) : []

    if (!projectId || ids.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId 和 ids 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    if (ids.length > 100) {
      const error = buildSyncBatchLimitError(ids.length, { operation: 'certificate_work_items.batch_delete' })
      const response: ApiResponse = {
        success: false,
        error: {
          code: error.code ?? 'BATCH_ASYNC_REQUIRED',
          message: error.message,
          details: error.details,
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(error.statusCode ?? 413).json(response)
    }

    const blockers = await getLinkedCertificateWorkItemDeleteBlockers(projectId, ids)
    if (blockers.blockedIds.length > 0) {
      return res.status(422).json(buildCertificateWorkItemLinkedResponse(blockers.blockedIds, blockers.activeLinkCount))
    }

    const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
    for (const id of ids) {
      const retention = await enforceRetentionOrBlock({
        entityType: 'certificate_work_item',
        entityId: id,
        projectId,
        userId: req.user?.id ?? null,
        userAction: 'delete',
      })
      if (retention.blocked) {
        return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({
          success: false,
          error: buildRetentionBlockedApiError(retention.reason, retention.result),
          timestamp: new Date().toISOString(),
        })
      }
    }

    await runWithRequestBudget(
      {
        operation: 'certificate_work_items.batch_delete',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
      },
      async () => {
        for (const id of ids) {
          await executeSQL(
            'DELETE FROM certificate_dependencies WHERE project_id = ? AND successor_type = ? AND successor_id = ?',
            [projectId, 'work_item', id],
          )
          await executeSQL('DELETE FROM certificate_work_items WHERE id = ? AND project_id = ?', [id, projectId])
        }
      },
    )
    markPreMilestoneProjectChanged(projectId)

    const response: ApiResponse<{ deleted_ids: string[] }> = {
      success: true,
      data: { deleted_ids: ids },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.delete(
  '/:id',
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string | undefined
    const { id } = req.params

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const blockers = await getLinkedCertificateWorkItemDeleteBlockers(projectId, [id])
    if (blockers.blockedIds.length > 0) {
      return res.status(422).json(buildCertificateWorkItemLinkedResponse(blockers.blockedIds, blockers.activeLinkCount))
    }

    const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
    const retention = await enforceRetentionOrBlock({
      entityType: 'certificate_work_item',
      entityId: id,
      projectId,
      userId: req.user?.id ?? null,
      userAction: 'delete',
    })
    if (retention.blocked) {
      return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({
        success: false,
        error: buildRetentionBlockedApiError(retention.reason, retention.result),
        timestamp: new Date().toISOString(),
      })
    }

    await executeSQL(
      'DELETE FROM certificate_dependencies WHERE project_id = ? AND successor_type = ? AND successor_id = ?',
      [projectId, 'work_item', id]
    )
    await executeSQL('DELETE FROM certificate_work_items WHERE id = ? AND project_id = ?', [id, projectId])
    markPreMilestoneProjectChanged(projectId)

    const response: ApiResponse = {
      success: true,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

export default router
