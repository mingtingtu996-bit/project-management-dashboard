import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { executeSQL, executeSQLOne, supabase } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'
import type { CertificateDependency, CertificateWorkItem } from '../types/db.js'
import {
  buildSyncBatchLimitError,
  REQUEST_TIMEOUT_BUDGETS,
  runWithRequestBudget,
} from '../services/requestBudgetService.js'

const router = Router({ mergeParams: true })
router.use(authenticate)

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

async function replaceWorkItemCertificateIds(projectId: string, workItemId: string, certificateIds: string[]) {
  await executeSQL(
    'DELETE FROM certificate_dependencies WHERE project_id = ? AND predecessor_type = ? AND successor_type = ? AND successor_id = ?',
    [projectId, 'certificate', 'work_item', workItemId],
  )

  const uniqueIds = [...new Set(certificateIds.filter(Boolean))]
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

async function createWorkItemAtomically(projectId: string, input: CertificateWorkItemCreateInput) {
  const id = uuidv4()
  const createdAt = new Date().toISOString()
  const sharedFromBody = typeof input.is_shared === 'boolean'
    ? input.is_shared
    : (input.certificate_ids?.length ?? 0) > 1

  const { data, error } = await supabase.rpc('create_certificate_work_item_atomic', {
    p_id: id,
    p_project_id: projectId,
    p_item_code: input.item_code ?? null,
    p_item_name: input.item_name,
    p_item_stage: input.item_stage,
    p_status: input.status ?? 'pending',
    p_planned_finish_date: input.planned_finish_date ?? null,
    p_actual_finish_date: input.actual_finish_date ?? null,
    p_approving_authority: input.approving_authority ?? null,
    p_is_shared: sharedFromBody,
    p_next_action: input.next_action ?? null,
    p_next_action_due_date: input.next_action_due_date ?? null,
    p_is_blocked: Boolean(input.is_blocked ?? false),
    p_block_reason: input.block_reason ?? null,
    p_sort_order: input.sort_order ?? 0,
    p_notes: input.notes ?? null,
    p_latest_record_at: createdAt,
    p_certificate_ids: input.certificate_ids ?? [],
  })

  if (error) {
    logger.error('Failed to create certificate work item atomically', {
      projectId,
      workItemId: id,
      error,
    })
    throw new Error(error.message)
  }

  const created = data as CertificateWorkItem | null
  if (!created) {
    throw new Error('CREATE_CERTIFICATE_WORK_ITEM_FAILED')
  }

  return created
}

router.get(
  '/',
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

    const created = await createWorkItemAtomically(projectId, payload)

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
          rows.push(await createWorkItemAtomically(projectId, item))
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
      async () => {
        const setClauses = Object.keys(updates).map((key) => `${key} = ?`)
        for (const id of ids) {
          await executeSQL(
            `UPDATE certificate_work_items SET ${setClauses.join(', ')}, updated_at = ? WHERE id = ? AND project_id = ?`,
            [...Object.values(updates), new Date().toISOString(), id, projectId],
          )
        }

        const items: Array<CertificateWorkItem & { certificate_ids: string[] }> = []
        for (const id of ids) {
          const item = await loadWorkItemRow(projectId, id)
          if (item) items.push(item)
        }
        return items
      },
    )

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

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map((key) => `${key} = ?`)
      const params = [...Object.values(updates), new Date().toISOString(), id, projectId]
      await executeSQL(
        `UPDATE certificate_work_items SET ${setClauses.join(', ')}, updated_at = ? WHERE id = ? AND project_id = ?`,
        params
      )
    }

    if (nextCertificateIds) {
      await replaceWorkItemCertificateIds(projectId, id, nextCertificateIds)
    }

    const data = await loadWorkItemRow(projectId, id)
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

    await executeSQL(
      'DELETE FROM certificate_dependencies WHERE project_id = ? AND successor_type = ? AND successor_id = ?',
      [projectId, 'work_item', id]
    )
    await executeSQL('DELETE FROM certificate_work_items WHERE id = ? AND project_id = ?', [id, projectId])

    const response: ApiResponse = {
      success: true,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

export default router
