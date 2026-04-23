// 施工图纸 API 路由
// 独立于前期证照（pre-milestones），施工图纸有独立的表和管理逻辑

import { Router } from 'express'
import { executeSQL, executeSQLOne, getMembers } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { constructionDrawingSchema, constructionDrawingUpdateSchema } from '../middleware/validation.js'
import type { ApiResponse } from '../types/index.js'
import type { ConstructionDrawing } from '../types/db.js'
import { v4 as uuidv4 } from 'uuid'
import { registerDrawingPackageRoutes } from './drawing-packages.js'
import { registerDrawingReviewRuleRoutes } from './drawing-review-rules.js'
import {
  deriveDrawingScheduleImpactFlag,
  resolveDrawingCurrentVersionPolicy,
  type DrawingVersionRecordSource,
} from '../services/drawingPackageService.js'
import {
  cleanupDrawingCertificateLink,
  syncDrawingCertificateLink,
  syncPackageCurrentDrawingCertificateLink,
} from '../services/drawingCertificateLinkService.js'
import { autoSatisfyDrawingPackageConditions } from '../services/taskConditionLinkageService.js'
import { persistNotification } from '../services/warningChainService.js'
import {
  CONSTRUCTION_DRAWING_COLUMNS,
  DRAWING_VERSION_COLUMNS,
} from '../services/sqlColumns.js'

const router = Router()
router.use(authenticate)
const CONSTRUCTION_DRAWING_SELECT = `SELECT ${CONSTRUCTION_DRAWING_COLUMNS} FROM construction_drawings`
const DRAWING_VERSION_SELECT = `SELECT ${DRAWING_VERSION_COLUMNS} FROM drawing_versions`

registerDrawingPackageRoutes(router)
registerDrawingReviewRuleRoutes(router)

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value)
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeNullableDate(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  return String(value)
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (value == null) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '') return null
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }
  return Boolean(value)
}

function normalizeStoredDrawingReviewStatus(value: unknown): string | null {
  const normalized = normalizeNullableText(value)
  if (!normalized) return null
  if (normalized === '待送审' || normalized === '不适用') return '未提交'
  if (normalized === '已送审' || normalized === '送审中') return '审查中'
  return normalized
}

function isApprovedReviewStatus(value: unknown) {
  const normalized = normalizeStoredDrawingReviewStatus(value)
  return normalized === '已通过' || normalized === '已出图'
}

function normalizeLockVersion(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}

function hasOwn(source: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function readMergedValue(
  payload: Record<string, unknown>,
  current: Record<string, unknown> | null,
  key: string,
) {
  if (hasOwn(payload, key)) return payload[key]
  return current?.[key]
}

function readOptionalNormalizedValue<T>(
  payload: Record<string, unknown>,
  key: string,
  normalize: (value: unknown) => T,
): T | undefined {
  if (!hasOwn(payload, key)) return undefined
  return normalize(payload[key])
}

function uniqueRecipients(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function getCurrentMonthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  return {
    start: start.toISOString().slice(0, 10),
    next: next.toISOString().slice(0, 10),
  }
}

async function notifyDrawingVersionUpdate(input: {
  projectId: string
  drawingId: string
  drawingName: string
  packageId?: string | null
  versionNo: string
  versionRecordId?: string | null
  responsibleUserId?: string | null
}) {
  if (!input.projectId || !input.versionNo) return
  const members = await getMembers(input.projectId)
  const recipients = uniqueRecipients([
    input.responsibleUserId ?? null,
    ...members
      .filter((member) => member.role === 'owner')
      .map((member) => member.user_id),
  ])

  if (recipients.length === 0) return

  await persistNotification({
    project_id: input.projectId,
    type: 'drawing_version_updated',
    notification_type: 'flow-reminder',
    severity: 'info',
    title: '图纸版本已更新',
    content: `${input.drawingName || '图纸'} 已更新至版本 ${input.versionNo}`,
    is_read: false,
    is_broadcast: false,
    source_entity_type: 'drawing_version',
    source_entity_id: input.versionRecordId ?? `${input.drawingId}:${input.versionNo}`,
    category: 'drawing',
    recipients,
    created_at: new Date().toISOString(),
  })
}

async function ensureDrawingVersionSnapshot(input: {
  projectId: string
  packageId: string
  drawingId: string
  versionNo: string
  parentDrawingId?: string | null
  revisionNo?: string | null
  issuedFor?: string | null
  effectiveDate?: string | null
  changeReason?: string | null
  createdBy?: string | null
  isCurrentVersion?: boolean | null
}) {
  const existing = await executeSQLOne<DrawingVersionRecordSource>(
    `${DRAWING_VERSION_SELECT} WHERE drawing_id = ? AND version_no = ? LIMIT 1`,
    [input.drawingId, input.versionNo],
  )
  if (existing) {
    if (input.isCurrentVersion === true) {
      await executeSQL(
        'UPDATE drawing_versions SET is_current_version = ?, superseded_at = CURRENT_TIMESTAMP WHERE drawing_id = ? AND package_id = ? AND id <> ?',
        [0, input.drawingId, input.packageId, existing.id],
      )
    }

    const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    await executeSQL(
      `UPDATE drawing_versions
          SET project_id = ?, package_id = ?, parent_drawing_id = ?, revision_no = ?, issued_for = ?,
              effective_date = ?, change_reason = ?, created_by = ?, is_current_version = ?, superseded_at = ?, updated_at = ?
        WHERE id = ?`,
      [
        input.projectId,
        input.packageId,
        input.parentDrawingId ?? normalizeNullableText((existing as any).parent_drawing_id),
        input.revisionNo ?? normalizeNullableText((existing as any).revision_no),
        input.issuedFor ?? normalizeNullableText((existing as any).issued_for),
        input.effectiveDate ?? normalizeNullableDate((existing as any).effective_date),
        input.changeReason ?? null,
        input.createdBy ?? normalizeNullableText((existing as any).created_by),
        input.isCurrentVersion == null ? normalizeNullableBoolean(existing.is_current_version) ? 1 : 0 : input.isCurrentVersion ? 1 : 0,
        input.isCurrentVersion === true ? null : normalizeNullableDate((existing as any).superseded_at),
        updatedAt,
        existing.id,
      ],
    )

    return existing
  }

  if (input.isCurrentVersion === true) {
    await executeSQL(
      'UPDATE drawing_versions SET is_current_version = ?, superseded_at = CURRENT_TIMESTAMP WHERE drawing_id = ? AND package_id = ?',
      [0, input.drawingId, input.packageId],
    )
  }

  const previous = await executeSQLOne<DrawingVersionRecordSource>(
    `${DRAWING_VERSION_SELECT} WHERE drawing_id = ? AND package_id = ? ORDER BY created_at DESC LIMIT 1`,
    [input.drawingId, input.packageId],
  )

  const versionId = uuidv4()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

  await executeSQL(
    `INSERT INTO drawing_versions
       (id, project_id, package_id, drawing_id, parent_drawing_id, version_no, revision_no, issued_for,
        effective_date, previous_version_id, is_current_version, superseded_at, change_reason, created_by,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      versionId,
      input.projectId,
      input.packageId,
      input.drawingId,
      input.parentDrawingId ?? null,
      input.versionNo,
      input.revisionNo ?? null,
      input.issuedFor ?? null,
      input.effectiveDate ?? null,
      previous?.id ?? null,
      input.isCurrentVersion ? 1 : 0,
      input.isCurrentVersion ? null : now,
      input.changeReason ?? null,
      input.createdBy ?? null,
      now,
      now,
    ],
  )

  return await executeSQLOne<DrawingVersionRecordSource>(
    `${DRAWING_VERSION_SELECT} WHERE id = ? LIMIT 1`,
    [versionId],
  )
}

async function refreshPackageCurrentPointer(packageId: string | null | undefined) {
  const normalizedPackageId = normalizeNullableText(packageId)
  if (!normalizedPackageId) return

  const currentDrawing = await executeSQLOne<{ id: string }>(
    'SELECT id FROM construction_drawings WHERE package_id = ? AND is_current_version = ? ORDER BY created_at DESC, sort_order DESC LIMIT 1',
    [normalizedPackageId, 1],
  )

  await executeSQL(
    'UPDATE drawing_packages SET current_version_drawing_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [currentDrawing?.id ?? null, normalizedPackageId],
  )
}

async function countPackageCurrentDrawings(packageId: string | null | undefined) {
  const normalizedPackageId = normalizeNullableText(packageId)
  if (!normalizedPackageId) return 0

  const row = await executeSQLOne<{ count?: number | string }>(
    'SELECT COUNT(*) AS count FROM construction_drawings WHERE package_id = ? AND is_current_version = ?',
    [normalizedPackageId, 1],
  )

  return Number(row?.count ?? 0) || 0
}

async function syncPackageItemCurrentDrawing(input: {
  packageId: string | null | undefined
  drawingId: string | null | undefined
  drawingCode?: string | null | undefined
  versionNo?: string | null | undefined
  isCurrentVersion?: boolean | null | undefined
}) {
  const packageId = normalizeNullableText(input.packageId)
  const drawingId = normalizeNullableText(input.drawingId)
  const drawingCode = normalizeNullableText(input.drawingCode)
  if (!packageId || !drawingId || input.isCurrentVersion !== true || !drawingCode) return

  await executeSQL(
    `UPDATE drawing_package_items
        SET current_drawing_id = ?, current_version = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE package_id = ? AND item_code = ?`,
    [drawingId, normalizeNullableText(input.versionNo), 'available', packageId, drawingCode],
  )
}

async function applyPackageCurrentVersionSelection(input: {
  packageId: string
  drawingId: string
  versionId?: string | null
  isCurrentVersion?: boolean | null
}) {
  const normalizedPackageId = normalizeNullableText(input.packageId)
  const normalizedDrawingId = normalizeNullableText(input.drawingId)
  const normalizedVersionId = normalizeNullableText(input.versionId)
  if (!normalizedPackageId || !normalizedDrawingId) return

  if (input.isCurrentVersion === true) {
    await executeSQL(
      'UPDATE construction_drawings SET is_current_version = ? WHERE package_id = ? AND id <> ?',
      [0, normalizedPackageId, normalizedDrawingId],
    )
    await executeSQL(
      'UPDATE construction_drawings SET is_current_version = ? WHERE id = ?',
      [1, normalizedDrawingId],
    )
    if (normalizedVersionId) {
    await executeSQL(
      'UPDATE drawing_versions SET is_current_version = ?, superseded_at = CURRENT_TIMESTAMP WHERE package_id = ? AND id <> ?',
      [0, normalizedPackageId, normalizedVersionId],
      )
      await executeSQL(
        'UPDATE drawing_versions SET is_current_version = ?, superseded_at = ? WHERE id = ?',
        [1, null, normalizedVersionId],
      )
    }
  } else if (input.isCurrentVersion === false) {
    await executeSQL(
      'UPDATE construction_drawings SET is_current_version = ? WHERE id = ?',
      [0, normalizedDrawingId],
    )
    if (normalizedVersionId) {
      await executeSQL(
        'UPDATE drawing_versions SET is_current_version = ?, superseded_at = CURRENT_TIMESTAMP WHERE id = ?',
        [0, normalizedVersionId],
      )
    }
  }

  await refreshPackageCurrentPointer(normalizedPackageId)
}

// ─── 获取项目的所有施工图纸 ─────────────────────────────────────
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

  // 支持按类型和状态筛选
  const { drawing_type, status, review_status } = req.query
  let sql = `${CONSTRUCTION_DRAWING_SELECT} WHERE project_id = ?`
  const params: any[] = [projectId]

  if (drawing_type) {
    sql += ' AND drawing_type = ?'
    params.push(drawing_type)
  }
  if (status) {
    sql += ' AND status = ?'
    params.push(status)
  }
  if (review_status) {
    sql += ' AND review_status = ?'
    params.push(review_status)
  }

  sql += ' ORDER BY sort_order ASC, created_at ASC'

  logger.info('Fetching construction drawings', { projectId, drawing_type, status })
  const data = await executeSQL(sql, params)

  const response: ApiResponse<ConstructionDrawing[]> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// ─── 获取图纸统计数据（放在 /:id 之前，避免路由冲突）───────────
// 注意：此路由挂载到 /api/construction-drawings 后，
// 访问路径为 GET /api/construction-drawings/project/:projectId/stats
router.get('/project/:projectId/stats', asyncHandler(async (req, res) => {
  const { projectId } = req.params
  logger.info('Fetching drawing stats', { projectId })
  const monthBounds = getCurrentMonthBounds()

  const [total, byType, byStatus, byReviewStatus, byDisciplineType, byDocumentPurpose, plannedSubmitThisMonth] = await Promise.all([
    executeSQLOne(
      'SELECT COUNT(*) as count FROM construction_drawings WHERE project_id = ?',
      [projectId]
    ),
    executeSQL(
      `SELECT drawing_type, COUNT(*) as count FROM construction_drawings
       WHERE project_id = ? GROUP BY drawing_type`,
      [projectId]
    ),
    executeSQL(
      `SELECT status, COUNT(*) as count FROM construction_drawings
       WHERE project_id = ? GROUP BY status`,
      [projectId]
    ),
    executeSQL(
      `SELECT review_status, COUNT(*) as count FROM construction_drawings
       WHERE project_id = ? GROUP BY review_status`,
      [projectId]
    ),
    executeSQL(
      `SELECT COALESCE(NULLIF(discipline_type, ''), drawing_type, '未分类') as discipline_type,
              COUNT(*) as count
       FROM construction_drawings
       WHERE project_id = ?
       GROUP BY COALESCE(NULLIF(discipline_type, ''), drawing_type, '未分类')`,
      [projectId]
    ),
    executeSQL(
      `SELECT COALESCE(NULLIF(document_purpose, ''), '未分类') as document_purpose,
              COUNT(*) as count
       FROM construction_drawings
       WHERE project_id = ?
       GROUP BY COALESCE(NULLIF(document_purpose, ''), '未分类')`,
      [projectId]
    ),
    executeSQLOne(
      `SELECT COUNT(*) as count
         FROM construction_drawings
        WHERE project_id = ? AND planned_submit_date >= ? AND planned_submit_date < ?`,
      [projectId, monthBounds.start, monthBounds.next],
    ),
  ])

  const response: ApiResponse = {
    success: true,
    data: {
      total: total?.count || 0,
      by_type: byType || [],
      by_status: byStatus || [],
      by_review_status: byReviewStatus || [],
      by_discipline_type: byDisciplineType || [],
      by_document_purpose: byDocumentPurpose || [],
      planned_submit_this_month_count: Number(plannedSubmitThisMonth?.count ?? 0) || 0,
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// ─── 获取单张施工图纸 ───────────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching construction drawing', { id })

  const data = await executeSQLOne(
    `${CONSTRUCTION_DRAWING_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'DRAWING_NOT_FOUND', message: '施工图纸不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<ConstructionDrawing> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// ─── 创建施工图纸 ───────────────────────────────────────────────
router.post('/', requireProjectEditor(req => req.body.project_id), asyncHandler(async (req, res) => {
  logger.info('Creating construction drawing', req.body)
  const parsed = constructionDrawingSchema.safeParse(req.body)
  if (!parsed.success) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: '施工图纸数据校验失败', details: parsed.error.errors },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }
  const payload = parsed.data

  const id = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const explicitCurrentVersion = Object.prototype.hasOwnProperty.call(payload, 'is_current_version')
    ? normalizeNullableBoolean(payload.is_current_version)
    : null
  const packageId = normalizeNullableText(payload.package_id)
  const normalizedReviewStatus = normalizeStoredDrawingReviewStatus(payload.review_status)
  const scheduleImpactFlag = deriveDrawingScheduleImpactFlag({
    status: payload.status,
    reviewStatus: normalizedReviewStatus,
    plannedSubmitDate: payload.planned_submit_date,
    actualSubmitDate: payload.actual_submit_date,
    plannedPassDate: payload.planned_pass_date,
    actualPassDate: payload.actual_pass_date,
    hasChange: payload.has_change,
    scheduleImpactFlag: payload.schedule_impact_flag,
  })
  const currentVersionPolicy = packageId
    ? resolveDrawingCurrentVersionPolicy({
        explicitCurrentVersion,
        targetPackageCurrentCount: await countPackageCurrentDrawings(packageId),
        targetWasCurrent: false,
      })
    : {
        resolvedCurrentVersion: explicitCurrentVersion === true,
        error: null,
      }

  if (currentVersionPolicy.error) {
    const response: ApiResponse = {
      success: false,
      error: currentVersionPolicy.error,
      timestamp: new Date().toISOString(),
    }
    return res.status(currentVersionPolicy.error.status).json(response)
  }

  const insertValues = [
    id,
    payload.project_id,
    normalizeNullableText(payload.drawing_type) ?? '建筑',
    payload.drawing_name,
    normalizeNullableText(payload.version) ?? '1.0',
    normalizeNullableText(payload.description),
    normalizeNullableText(payload.status) ?? '编制中',
    normalizeNullableText(payload.design_unit),
    normalizeNullableText(payload.design_person),
    normalizeNullableDate(payload.drawing_date),
    normalizeNullableText(payload.review_unit),
    normalizedReviewStatus ?? '未提交',
    normalizeNullableDate(payload.review_date),
    normalizeNullableText(payload.review_opinion),
    normalizeNullableText(payload.review_report_no),
    normalizeNullableText(payload.related_license_id),
    normalizeNullableDate(payload.planned_submit_date),
    normalizeNullableDate(payload.planned_pass_date),
    normalizeNullableDate(payload.actual_submit_date),
    normalizeNullableDate(payload.actual_pass_date),
    normalizeNullableText(payload.lead_unit),
    normalizeNullableText(payload.responsible_user_id),
    Number(payload.sort_order ?? 0) || 0,
    normalizeNullableText(payload.notes),
    normalizeNullableText(payload.created_by || payload.user_id),
    ts,
    ts,
    normalizeNullableText(payload.package_id),
    normalizeNullableText(payload.package_code),
    normalizeNullableText(payload.package_name),
    normalizeNullableText(payload.discipline_type),
    normalizeNullableText(payload.document_purpose),
    normalizeNullableText(payload.drawing_code),
    normalizeNullableText(payload.parent_drawing_id),
    normalizeNullableText(payload.version_no ?? payload.version),
    normalizeNullableText(payload.revision_no ?? payload.version_no ?? payload.version),
    normalizeNullableText(payload.issued_for ?? payload.document_purpose),
    normalizeNullableDate(payload.effective_date ?? payload.actual_pass_date ?? payload.drawing_date),
    currentVersionPolicy.resolvedCurrentVersion ? 1 : 0,
    normalizeNullableBoolean(payload.requires_review) ?? false,
    normalizeNullableText(payload.review_mode) ?? 'none',
    normalizeNullableText(payload.review_basis),
    normalizeNullableBoolean(payload.has_change) ?? false,
    normalizeNullableText(payload.change_reason),
    scheduleImpactFlag ? 1 : 0,
    normalizeNullableBoolean(payload.is_ready_for_construction) ?? false,
    normalizeNullableBoolean(payload.is_ready_for_acceptance) ?? false,
  ]

  await executeSQL(
    `INSERT INTO construction_drawings
       (id, project_id, drawing_type, drawing_name, version, description,
        status, design_unit, design_person, drawing_date,
        review_unit, review_status, review_date, review_opinion, review_report_no,
        related_license_id, planned_submit_date, planned_pass_date,
        actual_submit_date, actual_pass_date,
        lead_unit, responsible_user_id, sort_order, notes, created_by, created_at, updated_at,
        package_id, package_code, package_name, discipline_type, document_purpose, drawing_code,
        parent_drawing_id, version_no, revision_no, issued_for, effective_date,
        is_current_version, requires_review, review_mode, review_basis, has_change,
        change_reason, schedule_impact_flag, is_ready_for_construction, is_ready_for_acceptance)
     VALUES (${insertValues.map(() => '?').join(', ')})`,
    insertValues,
  )

  const versionNo = normalizeNullableText(payload.version_no ?? payload.version) ?? '1.0'
  let snapshot: DrawingVersionRecordSource | null = null
  if (packageId) {
    snapshot = await ensureDrawingVersionSnapshot({
      projectId: payload.project_id,
      packageId,
      drawingId: id,
      versionNo,
      parentDrawingId: normalizeNullableText(payload.parent_drawing_id),
      revisionNo: normalizeNullableText(payload.revision_no ?? payload.version_no ?? payload.version),
      issuedFor: normalizeNullableText(payload.issued_for ?? payload.document_purpose),
      effectiveDate: normalizeNullableDate(payload.effective_date ?? payload.actual_pass_date ?? payload.drawing_date),
      changeReason: normalizeNullableText(payload.change_reason),
      createdBy: normalizeNullableText(payload.created_by || payload.user_id),
      isCurrentVersion: currentVersionPolicy.resolvedCurrentVersion,
    })
    await applyPackageCurrentVersionSelection({
      packageId,
      drawingId: id,
      versionId: snapshot?.id ?? null,
      isCurrentVersion: currentVersionPolicy.resolvedCurrentVersion,
    })
    await syncPackageItemCurrentDrawing({
      packageId,
      drawingId: id,
      drawingCode: normalizeNullableText(payload.drawing_code),
      versionNo,
      isCurrentVersion: currentVersionPolicy.resolvedCurrentVersion,
    })
  }

  if (snapshot) {
    await notifyDrawingVersionUpdate({
      projectId: payload.project_id,
      drawingId: id,
      drawingName: payload.drawing_name,
      packageId,
      versionNo,
      versionRecordId: snapshot.id ?? null,
      responsibleUserId: normalizeNullableText(payload.responsible_user_id),
    })
  }

  const data = await executeSQLOne(
    `${CONSTRUCTION_DRAWING_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  if (packageId) {
    await syncPackageCurrentDrawingCertificateLink(payload.project_id, packageId)
  } else {
    await syncDrawingCertificateLink(data as Record<string, unknown>)
  }

  const response: ApiResponse<ConstructionDrawing> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// ─── 更新施工图纸 ───────────────────────────────────────────────
router.put('/:id', requireProjectEditor(async (req) => {
  const row = await executeSQLOne(
    'SELECT project_id FROM construction_drawings WHERE id = ? LIMIT 1',
    [req.params.id]
  ) as any
  return row?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating construction drawing', { id })

  const parsed = constructionDrawingUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '数据验证失败',
        details: parsed.error.errors,
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const payload = parsed.data
  const payloadRecord = payload as Record<string, unknown>
  const expectedLockVersion = normalizeLockVersion(payload.lock_version)

  const current = await executeSQLOne(
    `${CONSTRUCTION_DRAWING_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'DRAWING_NOT_FOUND', message: '施工图纸不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const currentRecord = current as Record<string, unknown>
  const currentLockVersion = normalizeLockVersion(currentRecord.lock_version) ?? 1
  if (expectedLockVersion === null) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'LOCK_VERSION_REQUIRED', message: '更新施工图纸时必须携带 lock_version' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  if (expectedLockVersion !== currentLockVersion) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VERSION_MISMATCH', message: '施工图纸已被其他人更新，请刷新后重试' },
      timestamp: new Date().toISOString(),
    }
    return res.status(409).json(response)
  }

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const setClauses: string[] = ['updated_at = ?', 'lock_version = ?']
  const params: any[] = [ts, currentLockVersion + 1]
  const explicitCurrentVersion = Object.prototype.hasOwnProperty.call(payload, 'is_current_version')
    ? normalizeNullableBoolean(payload.is_current_version)
    : null
  const normalizedMergedReviewStatus = normalizeStoredDrawingReviewStatus(
    readMergedValue(payloadRecord, currentRecord, 'review_status'),
  )
  const scheduleImpactFlag = deriveDrawingScheduleImpactFlag({
    status: readMergedValue(payloadRecord, currentRecord, 'status'),
    drawingStatus: readMergedValue(payloadRecord, currentRecord, 'drawing_status'),
    reviewStatus: normalizedMergedReviewStatus,
    plannedSubmitDate: readMergedValue(payloadRecord, currentRecord, 'planned_submit_date'),
    actualSubmitDate: readMergedValue(payloadRecord, currentRecord, 'actual_submit_date'),
    plannedPassDate: readMergedValue(payloadRecord, currentRecord, 'planned_pass_date'),
    actualPassDate: readMergedValue(payloadRecord, currentRecord, 'actual_pass_date'),
    hasChange: readMergedValue(payloadRecord, currentRecord, 'has_change'),
    scheduleImpactFlag: hasOwn(payloadRecord, 'schedule_impact_flag') ? payloadRecord.schedule_impact_flag : null,
  })

  const fieldMap: Record<string, any> = {
    drawing_type: readOptionalNormalizedValue(payloadRecord, 'drawing_type', normalizeNullableText),
    drawing_name: readOptionalNormalizedValue(payloadRecord, 'drawing_name', normalizeNullableText),
    version: readOptionalNormalizedValue(payloadRecord, 'version', normalizeNullableText),
    description: readOptionalNormalizedValue(payloadRecord, 'description', normalizeNullableText),
    status: readOptionalNormalizedValue(payloadRecord, 'status', normalizeNullableText),
    design_unit: readOptionalNormalizedValue(payloadRecord, 'design_unit', normalizeNullableText),
    design_person: readOptionalNormalizedValue(payloadRecord, 'design_person', normalizeNullableText),
    drawing_date: readOptionalNormalizedValue(payloadRecord, 'drawing_date', normalizeNullableDate),
    review_unit: readOptionalNormalizedValue(payloadRecord, 'review_unit', normalizeNullableText),
    review_status: hasOwn(payloadRecord, 'review_status')
      ? normalizeStoredDrawingReviewStatus(payload.review_status)
      : undefined,
    review_date: readOptionalNormalizedValue(payloadRecord, 'review_date', normalizeNullableDate),
    review_opinion: readOptionalNormalizedValue(payloadRecord, 'review_opinion', normalizeNullableText),
    review_report_no: readOptionalNormalizedValue(payloadRecord, 'review_report_no', normalizeNullableText),
    related_license_id: readOptionalNormalizedValue(payloadRecord, 'related_license_id', normalizeNullableText),
    planned_submit_date: readOptionalNormalizedValue(payloadRecord, 'planned_submit_date', normalizeNullableDate),
    planned_pass_date: readOptionalNormalizedValue(payloadRecord, 'planned_pass_date', normalizeNullableDate),
    actual_submit_date: readOptionalNormalizedValue(payloadRecord, 'actual_submit_date', normalizeNullableDate),
    actual_pass_date: readOptionalNormalizedValue(payloadRecord, 'actual_pass_date', normalizeNullableDate),
    lead_unit: readOptionalNormalizedValue(payloadRecord, 'lead_unit', normalizeNullableText),
    responsible_user_id: readOptionalNormalizedValue(payloadRecord, 'responsible_user_id', normalizeNullableText),
    sort_order: hasOwn(payloadRecord, 'sort_order') ? Number(payload.sort_order) || 0 : undefined,
    notes: readOptionalNormalizedValue(payloadRecord, 'notes', normalizeNullableText),
    package_id: readOptionalNormalizedValue(payloadRecord, 'package_id', normalizeNullableText),
    package_code: readOptionalNormalizedValue(payloadRecord, 'package_code', normalizeNullableText),
    package_name: readOptionalNormalizedValue(payloadRecord, 'package_name', normalizeNullableText),
    discipline_type: readOptionalNormalizedValue(payloadRecord, 'discipline_type', normalizeNullableText),
    document_purpose: readOptionalNormalizedValue(payloadRecord, 'document_purpose', normalizeNullableText),
    drawing_code: readOptionalNormalizedValue(payloadRecord, 'drawing_code', normalizeNullableText),
    parent_drawing_id: readOptionalNormalizedValue(payloadRecord, 'parent_drawing_id', normalizeNullableText),
    version_no: hasOwn(payloadRecord, 'version_no') || hasOwn(payloadRecord, 'version')
      ? normalizeNullableText(payload.version_no ?? payload.version)
      : undefined,
    revision_no: hasOwn(payloadRecord, 'revision_no') || hasOwn(payloadRecord, 'version_no') || hasOwn(payloadRecord, 'version')
      ? normalizeNullableText(payload.revision_no ?? payload.version_no ?? payload.version)
      : undefined,
    issued_for: hasOwn(payloadRecord, 'issued_for') || hasOwn(payloadRecord, 'document_purpose')
      ? normalizeNullableText(payload.issued_for ?? payload.document_purpose)
      : undefined,
    effective_date: normalizeNullableDate(payload.effective_date ?? payload.actual_pass_date ?? payload.drawing_date),
    is_current_version: explicitCurrentVersion ?? undefined,
    requires_review: readOptionalNormalizedValue(payloadRecord, 'requires_review', normalizeNullableBoolean),
    review_mode: readOptionalNormalizedValue(payloadRecord, 'review_mode', normalizeNullableText),
    review_basis: readOptionalNormalizedValue(payloadRecord, 'review_basis', normalizeNullableText),
    has_change: readOptionalNormalizedValue(payloadRecord, 'has_change', normalizeNullableBoolean),
    change_reason: readOptionalNormalizedValue(payloadRecord, 'change_reason', normalizeNullableText),
    schedule_impact_flag: scheduleImpactFlag,
    is_ready_for_construction: readOptionalNormalizedValue(payloadRecord, 'is_ready_for_construction', normalizeNullableBoolean),
    is_ready_for_acceptance: readOptionalNormalizedValue(payloadRecord, 'is_ready_for_acceptance', normalizeNullableBoolean),
  }

  if (!hasOwn(payloadRecord, 'effective_date') && !hasOwn(payloadRecord, 'actual_pass_date') && !hasOwn(payloadRecord, 'drawing_date')) {
    fieldMap.effective_date = undefined
  }

  const currentPackageId = normalizeNullableText(currentRecord.package_id)
  const requestedPackageId = Object.prototype.hasOwnProperty.call(payload, 'package_id')
    ? normalizeNullableText(payload.package_id)
    : currentPackageId
  const packageId = requestedPackageId || currentPackageId
  const packageChanged = Boolean(currentPackageId && packageId && currentPackageId !== packageId)
  const currentPackageCurrentCount = await countPackageCurrentDrawings(currentPackageId)
  const targetPackageCurrentCount = packageChanged && packageId
    ? await countPackageCurrentDrawings(packageId)
    : currentPackageCurrentCount
  const targetWasCurrent = normalizeNullableBoolean(currentRecord.is_current_version) === true

  if (packageChanged && targetWasCurrent && currentPackageCurrentCount <= 1) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_TARGET_DRAWING', message: '当前有效版不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const currentVersionPolicy = packageId
    ? resolveDrawingCurrentVersionPolicy({
        explicitCurrentVersion,
        targetPackageCurrentCount,
        targetWasCurrent,
      })
    : {
        resolvedCurrentVersion: explicitCurrentVersion === true,
        error: null,
      }

  fieldMap.is_current_version = currentVersionPolicy.resolvedCurrentVersion

  if (currentVersionPolicy.error) {
    const response: ApiResponse = {
      success: false,
      error: currentVersionPolicy.error,
      timestamp: new Date().toISOString(),
    }
    return res.status(currentVersionPolicy.error.status).json(response)
  }

  for (const [col, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      setClauses.push(`${col} = ?`)
      params.push(val)
    }
  }

  params.push(id, currentLockVersion)
  await executeSQL(
    `UPDATE construction_drawings SET ${setClauses.join(', ')} WHERE id = ? AND lock_version = ?`,
    params
  )

  const updated = await executeSQLOne(
    `${CONSTRUCTION_DRAWING_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!updated || (normalizeLockVersion((updated as Record<string, unknown>).lock_version) ?? currentLockVersion) === currentLockVersion) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VERSION_MISMATCH', message: '施工图纸已被其他人更新，请刷新后重试' },
      timestamp: new Date().toISOString(),
    }
    return res.status(409).json(response)
  }
  const updatedRecord = updated as Record<string, unknown>
  const previousVersionNo = normalizeNullableText(currentRecord.version_no ?? currentRecord.version)
  const nextVersionNo = normalizeNullableText(updatedRecord.version_no ?? updatedRecord.version)
    ?? normalizeNullableText(payload.version_no ?? payload.version)
  const versionChanged = Boolean(nextVersionNo && nextVersionNo !== previousVersionNo)
  let snapshot: DrawingVersionRecordSource | null = null

  if (packageChanged && packageId) {
    await executeSQL(
      'UPDATE drawing_versions SET package_id = ?, updated_at = CURRENT_TIMESTAMP WHERE drawing_id = ?',
      [packageId, id],
    )
  }

  if (packageId && nextVersionNo) {
    snapshot = await ensureDrawingVersionSnapshot({
      projectId: normalizeNullableText(updatedRecord.project_id ?? currentRecord.project_id) || payload.project_id || '',
      packageId,
      drawingId: id,
      versionNo: nextVersionNo,
      parentDrawingId: normalizeNullableText(updatedRecord.parent_drawing_id ?? currentRecord.parent_drawing_id),
      revisionNo: normalizeNullableText(updatedRecord.revision_no ?? currentRecord.revision_no ?? nextVersionNo),
      issuedFor: normalizeNullableText(updatedRecord.issued_for ?? currentRecord.issued_for ?? updatedRecord.document_purpose ?? currentRecord.document_purpose),
      effectiveDate: normalizeNullableDate(updatedRecord.effective_date ?? currentRecord.effective_date ?? updatedRecord.actual_pass_date ?? updatedRecord.drawing_date),
      changeReason: normalizeNullableText(payload.change_reason),
      createdBy: normalizeNullableText(payload.created_by || payload.user_id),
      isCurrentVersion: currentVersionPolicy.resolvedCurrentVersion,
    })

    await applyPackageCurrentVersionSelection({
      packageId,
      drawingId: id,
      versionId: snapshot?.id ?? null,
      isCurrentVersion: currentVersionPolicy.resolvedCurrentVersion,
    })
    await syncPackageItemCurrentDrawing({
      packageId,
      drawingId: id,
      drawingCode: normalizeNullableText(updatedRecord.drawing_code ?? currentRecord.drawing_code),
      versionNo: nextVersionNo,
      isCurrentVersion: currentVersionPolicy.resolvedCurrentVersion,
    })
  }

  if (packageChanged) {
    await refreshPackageCurrentPointer(currentPackageId)
  }

  if (versionChanged) {
    await notifyDrawingVersionUpdate({
      projectId: normalizeNullableText(updatedRecord.project_id ?? currentRecord.project_id) || '',
      drawingId: id,
      drawingName: normalizeNullableText(updatedRecord.drawing_name ?? currentRecord.drawing_name) || '图纸',
      packageId,
      versionNo: nextVersionNo,
      versionRecordId: snapshot?.id ?? null,
      responsibleUserId: normalizeNullableText(updatedRecord.responsible_user_id ?? currentRecord.responsible_user_id),
    })
  }

  if (!currentPackageId && packageId) {
    await cleanupDrawingCertificateLink(currentRecord)
  }

  if (currentPackageId) {
    await syncPackageCurrentDrawingCertificateLink(
      normalizeNullableText(updatedRecord.project_id ?? currentRecord.project_id) || payload.project_id || '',
      currentPackageId,
    )
  }

  if (packageId) {
    await syncPackageCurrentDrawingCertificateLink(
      normalizeNullableText(updatedRecord.project_id ?? currentRecord.project_id) || payload.project_id || '',
      packageId,
    )
  } else {
    await syncDrawingCertificateLink(updatedRecord)
  }

  const becameApproved = !isApprovedReviewStatus(currentRecord.review_status) && isApprovedReviewStatus(updatedRecord.review_status)
  if (packageId && becameApproved) {
    await autoSatisfyDrawingPackageConditions({
      projectId: normalizeNullableText(updatedRecord.project_id ?? currentRecord.project_id) || payload.project_id || '',
      drawingPackageId: packageId,
      drawingPackageCode: normalizeNullableText(updatedRecord.package_code ?? currentRecord.package_code),
      satisfiedAt: normalizeNullableDate(updatedRecord.actual_pass_date ?? currentRecord.actual_pass_date),
      confirmedBy: normalizeNullableText(payload.created_by || payload.user_id),
    })
  }

  const data = updated

  const response: ApiResponse<ConstructionDrawing> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// ─── 删除施工图纸 ───────────────────────────────────────────────
router.delete('/:id', requireProjectEditor(async (req) => {
  const row = await executeSQLOne(
    'SELECT project_id FROM construction_drawings WHERE id = ? LIMIT 1',
    [req.params.id]
  ) as any
  return row?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting construction drawing', { id })

  const current = await executeSQLOne<ConstructionDrawing>(
    `${CONSTRUCTION_DRAWING_SELECT} WHERE id = ? LIMIT 1`,
    [id],
  )

  await executeSQL('DELETE FROM construction_drawings WHERE id = ?', [id])

  if (current?.package_id) {
    await syncPackageCurrentDrawingCertificateLink(current.project_id, current.package_id)
  } else {
    await cleanupDrawingCertificateLink(current as unknown as Record<string, unknown> | null)
  }

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router

