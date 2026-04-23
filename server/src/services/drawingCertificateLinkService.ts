import { v4 as uuidv4 } from 'uuid'

import { executeSQL, executeSQLOne } from './dbService.js'
import type { CertificateWorkItem, ConstructionDrawing } from '../types/db.js'

type DrawingCertificateLinkSource = Partial<ConstructionDrawing> & Record<string, unknown>

function normalizeText(value: unknown, fallback: string | null = null): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? fallback : trimmed
  }
  if (value == null) return fallback
  return String(value)
}

function normalizeDate(value: unknown): string | null {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    return ['true', '1', 'yes', 'y'].includes(lowered)
  }
  return false
}

function buildAutoWorkItemCode(source: DrawingCertificateLinkSource) {
  const packageId = normalizeText(source.package_id)
  if (packageId) return `drawing-package:${packageId}`

  const drawingId = normalizeText(source.id)
  if (drawingId) return `drawing:${drawingId}`

  return null
}

function buildAutoWorkItemName(source: DrawingCertificateLinkSource) {
  const packageName = normalizeText(source.package_name)
  if (packageName) return `图纸资料联动 · ${packageName}`

  const drawingName = normalizeText(source.drawing_name)
  if (drawingName) return `图纸资料联动 · ${drawingName}`

  return '图纸资料联动'
}

function deriveStage(source: DrawingCertificateLinkSource): CertificateWorkItem['item_stage'] {
  const reviewStatus = normalizeText(source.review_status, '') ?? ''
  const drawingStatus = normalizeText(source.status, '') ?? ''

  if (
    normalizeDate(source.actual_pass_date) ||
    reviewStatus === '已通过' ||
    ['已通过', '已出图'].includes(drawingStatus)
  ) {
    return '批复领证'
  }

  if (
    normalizeDate(source.actual_submit_date) ||
    reviewStatus === '审查中' ||
    drawingStatus === '审图中' ||
    normalizeDate(source.planned_submit_date)
  ) {
    return '外部报批'
  }

  return '资料准备'
}

function deriveStatus(source: DrawingCertificateLinkSource): CertificateWorkItem['status'] {
  const reviewStatus = normalizeText(source.review_status, '') ?? ''
  const drawingStatus = normalizeText(source.status, '') ?? ''

  if (
    normalizeDate(source.actual_pass_date) ||
    reviewStatus === '已通过' ||
    ['已通过', '已出图'].includes(drawingStatus)
  ) {
    return 'approved'
  }

  if (['已驳回', '需修改'].includes(reviewStatus) || drawingStatus === '已驳回') {
    return 'supplement_required'
  }

  if (
    normalizeDate(source.actual_submit_date) ||
    reviewStatus === '审查中' ||
    drawingStatus === '审图中'
  ) {
    return 'external_submission'
  }

  if (
    normalizeDate(source.planned_submit_date) ||
    normalizeText(source.review_mode) === 'mandatory' ||
    normalizeText(source.review_mode) === 'optional' ||
    normalizeText(source.document_purpose, '')?.includes('报批')
  ) {
    return 'internal_review'
  }

  return 'preparing_documents'
}

function deriveNextAction(status: CertificateWorkItem['status']) {
  if (status === 'supplement_required') return '补齐审图资料并重新送审'
  if (status === 'external_submission') return '持续跟进送审与审图反馈'
  if (status === 'internal_review') return '准备送审资料并发起报批'
  if (status === 'approved') return '同步通过版本到证照与报批链路'
  return '补齐图纸资料并确认送审计划'
}

function buildNotes(source: DrawingCertificateLinkSource) {
  const fragments = [
    normalizeText(source.package_name) ? `图纸包：${normalizeText(source.package_name)}` : null,
    normalizeText(source.drawing_name) ? `图纸：${normalizeText(source.drawing_name)}` : null,
    normalizeText(source.package_code) ? `包号：${normalizeText(source.package_code)}` : null,
    normalizeText(source.version_no ?? source.version) ? `版本：${normalizeText(source.version_no ?? source.version)}` : null,
    normalizeText(source.document_purpose) ? `用途：${normalizeText(source.document_purpose)}` : null,
  ].filter(Boolean)

  return `图纸/证照联动自动生成${fragments.length > 0 ? `；${fragments.join('；')}` : ''}`
}

async function loadAutoWorkItem(projectId: string, itemCode: string) {
  return await executeSQLOne<CertificateWorkItem>(
    'SELECT * FROM certificate_work_items WHERE project_id = ? AND item_code = ? LIMIT 1',
    [projectId, itemCode],
  )
}

async function replaceCertificateDependency(input: {
  projectId: string
  workItemId: string
  certificateId: string
}) {
  await executeSQL(
    'DELETE FROM certificate_dependencies WHERE project_id = ? AND predecessor_type = ? AND successor_type = ? AND successor_id = ?',
    [input.projectId, 'certificate', 'work_item', input.workItemId],
  )

  await executeSQL(
    `INSERT INTO certificate_dependencies
       (id, project_id, predecessor_type, predecessor_id, successor_type, successor_id, dependency_kind, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      input.projectId,
      'certificate',
      input.certificateId,
      'work_item',
      input.workItemId,
      'soft',
      '图纸/证照自动联动',
      new Date().toISOString(),
    ],
  )
}

async function removeAutoWorkItemByCode(projectId: string, itemCode: string) {
  const existing = await loadAutoWorkItem(projectId, itemCode)
  if (!existing?.id) return

  await executeSQL(
    'DELETE FROM certificate_dependencies WHERE project_id = ? AND successor_type = ? AND successor_id = ?',
    [projectId, 'work_item', existing.id],
  )
  await executeSQL(
    'DELETE FROM certificate_work_items WHERE id = ? AND project_id = ?',
    [existing.id, projectId],
  )
}

function shouldKeepLinkedWorkItem(source: DrawingCertificateLinkSource) {
  const certificateId = normalizeText(source.related_license_id)
  if (!certificateId) return false

  const packageId = normalizeText(source.package_id)
  if (!packageId) return true

  return normalizeBoolean(source.is_current_version)
}

export async function syncDrawingCertificateLink(source: DrawingCertificateLinkSource | null | undefined) {
  if (!source) return

  const projectId = normalizeText(source.project_id)
  const certificateId = normalizeText(source.related_license_id)
  const itemCode = buildAutoWorkItemCode(source)
  if (!projectId || !itemCode) return

  if (!certificateId || !shouldKeepLinkedWorkItem(source)) {
    await removeAutoWorkItemByCode(projectId, itemCode)
    return
  }

  const now = new Date().toISOString()
  const payload = {
    item_code: itemCode,
    item_name: buildAutoWorkItemName(source),
    item_stage: deriveStage(source),
    status: deriveStatus(source),
    planned_finish_date: normalizeDate(source.planned_pass_date ?? source.planned_submit_date),
    actual_finish_date: normalizeDate(source.actual_pass_date ?? source.actual_submit_date),
    approving_authority: null,
    is_shared: false,
    next_action: deriveNextAction(deriveStatus(source)),
    next_action_due_date: normalizeDate(source.planned_submit_date ?? source.planned_pass_date),
    is_blocked: deriveStatus(source) === 'supplement_required',
    block_reason: deriveStatus(source) === 'supplement_required' ? '审图退回或要求修改，需补正后再继续推进证照链路' : null,
    sort_order: 0,
    notes: buildNotes(source),
    latest_record_at: now,
  } satisfies Partial<CertificateWorkItem>

  const existing = await loadAutoWorkItem(projectId, itemCode)
  if (existing?.id) {
    await executeSQL(
      `UPDATE certificate_work_items
          SET item_name = ?, item_stage = ?, status = ?, planned_finish_date = ?, actual_finish_date = ?,
              approving_authority = ?, is_shared = ?, next_action = ?, next_action_due_date = ?, is_blocked = ?,
              block_reason = ?, sort_order = ?, notes = ?, latest_record_at = ?, updated_at = ?
        WHERE id = ? AND project_id = ?`,
      [
        payload.item_name,
        payload.item_stage,
        payload.status,
        payload.planned_finish_date,
        payload.actual_finish_date,
        payload.approving_authority,
        payload.is_shared ? 1 : 0,
        payload.next_action,
        payload.next_action_due_date,
        payload.is_blocked ? 1 : 0,
        payload.block_reason,
        payload.sort_order,
        payload.notes,
        payload.latest_record_at,
        now,
        existing.id,
        projectId,
      ],
    )
    await replaceCertificateDependency({ projectId, workItemId: existing.id, certificateId })
    return
  }

  const workItemId = uuidv4()
  await executeSQL(
    `INSERT INTO certificate_work_items
       (id, project_id, item_code, item_name, item_stage, status, planned_finish_date, actual_finish_date,
        approving_authority, is_shared, next_action, next_action_due_date, is_blocked, block_reason,
        sort_order, notes, latest_record_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      workItemId,
      projectId,
      payload.item_code,
      payload.item_name,
      payload.item_stage,
      payload.status,
      payload.planned_finish_date,
      payload.actual_finish_date,
      payload.approving_authority,
      payload.is_shared ? 1 : 0,
      payload.next_action,
      payload.next_action_due_date,
      payload.is_blocked ? 1 : 0,
      payload.block_reason,
      payload.sort_order,
      payload.notes,
      payload.latest_record_at,
      now,
      now,
    ],
  )
  await replaceCertificateDependency({ projectId, workItemId, certificateId })
}

export async function cleanupDrawingCertificateLink(source: DrawingCertificateLinkSource | null | undefined) {
  if (!source) return

  const projectId = normalizeText(source.project_id)
  const itemCode = buildAutoWorkItemCode(source)
  if (!projectId || !itemCode) return

  await removeAutoWorkItemByCode(projectId, itemCode)
}

export async function syncPackageCurrentDrawingCertificateLink(projectId: string | null | undefined, packageId: string | null | undefined) {
  const normalizedProjectId = normalizeText(projectId)
  const normalizedPackageId = normalizeText(packageId)
  if (!normalizedProjectId || !normalizedPackageId) return

  const currentDrawing = await executeSQLOne<ConstructionDrawing>(
    `SELECT * FROM construction_drawings
      WHERE project_id = ? AND package_id = ? AND is_current_version = ?
      ORDER BY created_at DESC, sort_order DESC
      LIMIT 1`,
    [normalizedProjectId, normalizedPackageId, 1],
  )

  if (!currentDrawing) {
    await removeAutoWorkItemByCode(normalizedProjectId, `drawing-package:${normalizedPackageId}`)
    return
  }

  await syncDrawingCertificateLink({
    ...currentDrawing,
    project_id: normalizedProjectId,
    package_id: normalizedPackageId,
    is_current_version: true,
  })
}
