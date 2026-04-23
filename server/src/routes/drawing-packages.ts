import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'

import { asyncHandler } from '../middleware/errorHandler.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import {
  buildDrawingBoardView,
  buildDrawingLedgerRows,
  buildDrawingPackageDetailView,
  buildDrawingPackageTemplateItems,
  buildPackageTemplateDefaults,
  derivePackagesFromLegacyDrawings,
  evaluateDrawingReviewRule,
  getDrawingPackageGroupKey,
  getDefaultDrawingPackageTemplate,
  isValidReviewModeInput,
  resolveDrawingPackageCurrentVersionTarget,
  type DrawingEscalatedIssueSource,
  type DrawingEscalatedRiskSource,
  type DrawingAcceptancePlanSource,
  type DrawingAcceptanceRecordSource,
  type DrawingAcceptanceRequirementSource,
  type DrawingPackageItemSource,
  type DrawingPackageSource,
  type DrawingRecordSource,
  type DrawingReviewRuleSource,
  type DrawingTaskConditionSource,
  type DrawingTaskSource,
  type DrawingVersionRecordSource,
} from '../services/drawingPackageService.js'
import { syncPackageCurrentDrawingCertificateLink } from '../services/drawingCertificateLinkService.js'
import {
  ACCEPTANCE_PLAN_COLUMNS,
  ACCEPTANCE_RECORD_COLUMNS,
  ACCEPTANCE_REQUIREMENT_COLUMNS,
  CONSTRUCTION_DRAWING_COLUMNS,
  DRAWING_PACKAGE_ITEM_COLUMNS,
  DRAWING_REVIEW_RULE_COLUMNS,
  DRAWING_TASK_COLUMNS,
  DRAWING_TASK_CONDITION_COLUMNS,
  DRAWING_VERSION_COLUMNS,
} from '../services/sqlColumns.js'

const DRAWING_REVIEW_RULE_SELECT = `SELECT ${DRAWING_REVIEW_RULE_COLUMNS} FROM drawing_review_rules`
const DRAWING_PACKAGE_SELECT = `SELECT
  id,
  project_id,
  package_code,
  package_name,
  NULL AS drawing_type,
  discipline_type,
  document_purpose,
  status,
  requires_review,
  review_mode,
  review_basis,
  completeness_ratio,
  missing_required_count,
  current_version_drawing_id,
  has_change,
  schedule_impact_flag,
  is_ready_for_construction,
  is_ready_for_acceptance,
  created_at,
  updated_at
FROM drawing_packages`
const DRAWING_VERSION_SELECT = `SELECT ${DRAWING_VERSION_COLUMNS} FROM drawing_versions`
const CONSTRUCTION_DRAWING_SELECT = `SELECT ${CONSTRUCTION_DRAWING_COLUMNS} FROM construction_drawings`
const DRAWING_PACKAGE_ITEM_SELECT = `SELECT ${DRAWING_PACKAGE_ITEM_COLUMNS} FROM drawing_package_items`
const DRAWING_TASK_SELECT = `SELECT ${DRAWING_TASK_COLUMNS} FROM tasks`
const DRAWING_TASK_CONDITION_SELECT = `SELECT ${DRAWING_TASK_CONDITION_COLUMNS} FROM task_conditions`
const ACCEPTANCE_PLAN_SELECT = `SELECT ${ACCEPTANCE_PLAN_COLUMNS} FROM acceptance_plans`
const ACCEPTANCE_REQUIREMENT_SELECT = `SELECT ${ACCEPTANCE_REQUIREMENT_COLUMNS} FROM acceptance_requirements`
const ACCEPTANCE_RECORD_SELECT = `SELECT ${ACCEPTANCE_RECORD_COLUMNS} FROM acceptance_records`

function normalizeText(value: unknown, fallback: string | null = null): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? fallback : trimmed
  }
  if (value == null) return fallback
  return String(value)
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isMissingTableError(error: unknown, tableName: string): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes(tableName) &&
    (/schema cache/i.test(message) || /does not exist/i.test(message) || /could not find the table/i.test(message))
  )
}

async function loadOptionalRows<T>(sql: string, params: unknown[], tableName: string): Promise<T[]> {
  try {
    return await executeSQL<T>(sql, params)
  } catch (error) {
    if (isMissingTableError(error, tableName)) {
      return []
    }
    throw error
  }
}

function dedupeRowsById<T extends { id?: unknown }>(rows: T[]) {
  return rows.filter((row, index) => {
    const rowId = normalizeText(row.id)
    if (!rowId) return true
    return rows.findIndex((candidate) => normalizeText(candidate.id) === rowId) === index
  })
}

function sortByCreatedAtAsc<T extends { created_at?: unknown }>(rows: T[]) {
  return rows.slice().sort((left, right) => normalizeText(left.created_at).localeCompare(normalizeText(right.created_at)))
}

function sortVersionsDesc(rows: DrawingVersionRecordSource[]) {
  return rows.slice().sort((left, right) => {
    const leftCurrent = normalizeBoolean(left.is_current_version) ? 1 : 0
    const rightCurrent = normalizeBoolean(right.is_current_version) ? 1 : 0
    if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent
    return normalizeText(right.created_at).localeCompare(normalizeText(left.created_at))
  })
}

function attachDrawingNames(
  versions: DrawingVersionRecordSource[],
  drawings: DrawingRecordSource[],
): DrawingVersionRecordSource[] {
  const drawingNameMap = new Map(
    drawings
      .map((drawing) => [normalizeText(drawing.id), normalizeText(drawing.drawing_name)])
      .filter((entry): entry is [string, string | null] => Boolean(entry[0])),
  )

  return versions.map((version) => ({
    ...version,
    drawing_name: normalizeText((version as unknown as Record<string, unknown>).drawing_name) ?? drawingNameMap.get(normalizeText(version.drawing_id)) ?? null,
  }))
}

async function syncPackageItemCurrentDrawing(input: {
  packageId: string | null | undefined
  drawingId: string | null | undefined
  drawingCode?: string | null | undefined
  versionNo?: string | null | undefined
}) {
  const packageId = normalizeText(input.packageId)
  const drawingId = normalizeText(input.drawingId)
  const drawingCode = normalizeText(input.drawingCode)
  if (!packageId || !drawingId || !drawingCode) return

  await executeSQL(
    `UPDATE drawing_package_items
        SET current_drawing_id = ?, current_version = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE package_id = ? AND item_code = ?`,
    [drawingId, normalizeText(input.versionNo), 'available', packageId, drawingCode],
  )
}

async function loadProjectScopedReviewRules(projectId: string | null | undefined) {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) {
    return loadOptionalRows<DrawingReviewRuleSource>(
      `${DRAWING_REVIEW_RULE_SELECT} ORDER BY project_id DESC, created_at ASC`,
      [],
      'drawing_review_rules',
    )
  }

  const [projectRules, globalRules] = await Promise.all([
    loadOptionalRows<DrawingReviewRuleSource>(
      `${DRAWING_REVIEW_RULE_SELECT} WHERE project_id = ? ORDER BY created_at ASC`,
      [normalizedProjectId],
      'drawing_review_rules',
    ),
    loadOptionalRows<DrawingReviewRuleSource>(
      `${DRAWING_REVIEW_RULE_SELECT} WHERE project_id IS NULL ORDER BY created_at ASC`,
      [],
      'drawing_review_rules',
    ),
  ])

  return [...projectRules, ...globalRules]
}

async function findDrawingPackageByIdentifier(packageId: string) {
  const byId = await executeSQLOne<DrawingPackageSource>(
    `${DRAWING_PACKAGE_SELECT} WHERE id = ? LIMIT 1`,
    [packageId],
  )
  if (byId) return byId

  return executeSQLOne<DrawingPackageSource>(
    `${DRAWING_PACKAGE_SELECT} WHERE package_code = ? LIMIT 1`,
    [packageId],
  )
}

function selectPackageScopedDrawings(
  drawings: DrawingRecordSource[],
  packageIdentifier: string,
  packageRow?: DrawingPackageSource | null,
) {
  const normalizedIdentifier = normalizeText(packageIdentifier)
  const normalizedPackageId = normalizeText(packageRow?.id)
  const normalizedPackageCode = normalizeText(packageRow?.package_code)

  return drawings.filter((drawing) => {
    const groupKey = normalizeText(getDrawingPackageGroupKey(drawing))
    if (groupKey && normalizedIdentifier && groupKey === normalizedIdentifier) return true
    if (normalizedPackageId && normalizeText(drawing.package_id) === normalizedPackageId) return true
    if (normalizedPackageCode && normalizeText(drawing.package_code) === normalizedPackageCode) return true
    return false
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
  isCurrentVersion?: boolean
}) {
  const existing = await executeSQLOne<DrawingVersionRecordSource>(
    `${DRAWING_VERSION_SELECT} WHERE drawing_id = ? AND version_no = ? LIMIT 1`,
    [input.drawingId, input.versionNo],
  )
  if (existing) {
    if (input.isCurrentVersion) {
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
        input.parentDrawingId ?? normalizeText((existing as unknown as Record<string, unknown>).parent_drawing_id),
        input.revisionNo ?? normalizeText((existing as unknown as Record<string, unknown>).revision_no),
        input.issuedFor ?? normalizeText((existing as unknown as Record<string, unknown>).issued_for),
        input.effectiveDate ?? normalizeText((existing as unknown as Record<string, unknown>).effective_date),
        input.changeReason ?? null,
        input.createdBy ?? normalizeText((existing as unknown as Record<string, unknown>).created_by),
        input.isCurrentVersion ? 1 : normalizeBoolean(existing.is_current_version) ? 1 : 0,
        input.isCurrentVersion ? null : normalizeText((existing as unknown as Record<string, unknown>).superseded_at),
        updatedAt,
        existing.id,
      ],
    )

    return existing
  }

  if (input.isCurrentVersion) {
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

async function loadProjectPackages(projectId: string, options?: { includeLinkedContext?: boolean }) {
  const packages = await loadOptionalRows<DrawingPackageSource>(
    `${DRAWING_PACKAGE_SELECT} WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId],
    'drawing_packages',
  )
  const drawings = await loadOptionalRows<DrawingRecordSource>(
    `${CONSTRUCTION_DRAWING_SELECT} WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [projectId],
    'construction_drawings',
  )
  const [versionRows, reviewRules] = await Promise.all([
    loadOptionalRows<DrawingVersionRecordSource>(
      `${DRAWING_VERSION_SELECT} WHERE project_id = ? ORDER BY created_at DESC`,
      [projectId],
      'drawing_versions',
    ),
    loadProjectScopedReviewRules(projectId),
  ])
  const versions = attachDrawingNames(versionRows, drawings)
  const packageIds = uniqueNonEmpty(packages.map((item) => normalizeText(item.id)))
  const items = packageIds.length > 0
    ? await loadOptionalRows<DrawingPackageItemSource>(
      `${DRAWING_PACKAGE_ITEM_SELECT} WHERE package_id IN (${buildSqlPlaceholders(packageIds.length)}) ORDER BY sort_order ASC, created_at ASC`,
      packageIds,
      'drawing_package_items',
    )
    : []

  if (!options?.includeLinkedContext) {
    return {
      packages,
      drawings,
      versions,
      items,
      reviewRules,
      tasks: [] as DrawingTaskSource[],
      taskConditions: [] as DrawingTaskConditionSource[],
      acceptancePlans: [] as DrawingAcceptancePlanSource[],
      acceptanceRequirements: [] as DrawingAcceptanceRequirementSource[],
      acceptanceRecords: [] as DrawingAcceptanceRecordSource[],
      issues: [] as DrawingEscalatedIssueSource[],
      risks: [] as DrawingEscalatedRiskSource[],
    }
  }

  const tasks = await loadOptionalRows<DrawingTaskSource>(
    `${DRAWING_TASK_SELECT} WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId],
    'tasks',
  )
  const taskConditions = await loadOptionalRows<DrawingTaskConditionSource>(
    `${DRAWING_TASK_CONDITION_SELECT} WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId],
    'task_conditions',
  )
  const acceptancePlans = await loadOptionalRows<DrawingAcceptancePlanSource>(
    `${ACCEPTANCE_PLAN_SELECT} WHERE project_id = ? ORDER BY planned_date ASC, created_at ASC`,
    [projectId],
    'acceptance_plans',
  )
  const acceptanceRequirements = await loadOptionalRows<DrawingAcceptanceRequirementSource>(
    `${ACCEPTANCE_REQUIREMENT_SELECT} WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId],
    'acceptance_requirements',
  )
  const acceptanceRecords = await loadOptionalRows<DrawingAcceptanceRecordSource>(
    `${ACCEPTANCE_RECORD_SELECT} WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId],
    'acceptance_records',
  )
  const issues = await loadOptionalRows<DrawingEscalatedIssueSource>(
    'SELECT id, project_id, title, description, source_id, created_at FROM issues WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
    'issues',
  )
  const risks = await loadOptionalRows<DrawingEscalatedRiskSource>(
    'SELECT id, project_id, title, description, source_id, created_at FROM risks WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
    'risks',
  )

  return {
    packages,
    drawings,
    versions,
    items,
    reviewRules,
    tasks,
    taskConditions,
    acceptancePlans,
    acceptanceRequirements,
    acceptanceRecords,
    issues,
    risks,
  }
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => normalizeText(value)).filter((value): value is string => Boolean(value)))]
}

function buildSqlPlaceholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ')
}

async function loadDrawingPackageLinkedContext(input: {
  projectId: string
  packageId: string
  packageCode: string | null
  drawingIds: string[]
}) {
  const taskPackageIds = uniqueNonEmpty([input.packageId])
  const taskPackageCodes = uniqueNonEmpty([input.packageCode])
  const requirementPackageIds = uniqueNonEmpty([input.packageId])
  const requirementSourceEntityIds = uniqueNonEmpty([input.packageId, input.packageCode, ...input.drawingIds])
  const [taskConditions, acceptanceRequirements, issues, risks] = await Promise.all([
    taskPackageIds.length > 0 || taskPackageCodes.length > 0
      ? Promise.all([
        taskPackageIds.length > 0
          ? loadOptionalRows<DrawingTaskConditionSource>(
            `${DRAWING_TASK_CONDITION_SELECT}
              WHERE project_id = ? AND drawing_package_id IN (${buildSqlPlaceholders(taskPackageIds.length)})
              ORDER BY created_at ASC`,
            [input.projectId, ...taskPackageIds],
            'task_conditions',
          )
          : Promise.resolve([] as DrawingTaskConditionSource[]),
        taskPackageCodes.length > 0
          ? loadOptionalRows<DrawingTaskConditionSource>(
            `${DRAWING_TASK_CONDITION_SELECT}
              WHERE project_id = ? AND drawing_package_code IN (${buildSqlPlaceholders(taskPackageCodes.length)})
              ORDER BY created_at ASC`,
            [input.projectId, ...taskPackageCodes],
            'task_conditions',
          )
          : Promise.resolve([] as DrawingTaskConditionSource[]),
      ]).then((groups) => sortByCreatedAtAsc(dedupeRowsById(groups.flat())))
      : Promise.resolve([] as DrawingTaskConditionSource[]),
    requirementPackageIds.length > 0 || requirementSourceEntityIds.length > 0
      ? Promise.all([
        requirementPackageIds.length > 0
          ? loadOptionalRows<DrawingAcceptanceRequirementSource>(
            `${ACCEPTANCE_REQUIREMENT_SELECT}
              WHERE project_id = ? AND drawing_package_id IN (${buildSqlPlaceholders(requirementPackageIds.length)})
              ORDER BY created_at ASC`,
            [input.projectId, ...requirementPackageIds],
            'acceptance_requirements',
          )
          : Promise.resolve([] as DrawingAcceptanceRequirementSource[]),
        requirementSourceEntityIds.length > 0
          ? loadOptionalRows<DrawingAcceptanceRequirementSource>(
            `${ACCEPTANCE_REQUIREMENT_SELECT}
              WHERE project_id = ? AND source_entity_id IN (${buildSqlPlaceholders(requirementSourceEntityIds.length)})
              ORDER BY created_at ASC`,
            [input.projectId, ...requirementSourceEntityIds],
            'acceptance_requirements',
          )
          : Promise.resolve([] as DrawingAcceptanceRequirementSource[]),
      ]).then((groups) => sortByCreatedAtAsc(dedupeRowsById(groups.flat())))
      : Promise.resolve([] as DrawingAcceptanceRequirementSource[]),
    Promise.all([
      loadOptionalRows<DrawingEscalatedIssueSource>(
        `SELECT id, project_id, title, description, source_id, source_entity_type, source_entity_id, created_at
           FROM issues
          WHERE project_id = ? AND source_id = ?
          ORDER BY created_at DESC`,
        [input.projectId, input.packageId],
        'issues',
      ),
      loadOptionalRows<DrawingEscalatedIssueSource>(
        `SELECT id, project_id, title, description, source_id, source_entity_type, source_entity_id, created_at
           FROM issues
          WHERE project_id = ? AND source_entity_type = ? AND source_entity_id = ?
          ORDER BY created_at DESC`,
        [input.projectId, 'drawing_package', input.packageId],
        'issues',
      ),
    ]).then((groups) => dedupeRowsById(groups.flat())),
    Promise.all([
      loadOptionalRows<DrawingEscalatedRiskSource>(
        `SELECT id, project_id, title, description, source_id, source_entity_type, source_entity_id, created_at
           FROM risks
          WHERE project_id = ? AND source_id = ?
          ORDER BY created_at DESC`,
        [input.projectId, input.packageId],
        'risks',
      ),
      loadOptionalRows<DrawingEscalatedRiskSource>(
        `SELECT id, project_id, title, description, source_id, source_entity_type, source_entity_id, created_at
           FROM risks
          WHERE project_id = ? AND source_entity_type = ? AND source_entity_id = ?
          ORDER BY created_at DESC`,
        [input.projectId, 'drawing_package', input.packageId],
        'risks',
      ),
    ]).then((groups) => dedupeRowsById(groups.flat())),
  ])

  const taskIds = uniqueNonEmpty(taskConditions.map((condition) => condition.task_id))
  const planIds = uniqueNonEmpty(acceptanceRequirements.map((requirement) => requirement.plan_id))
  const [tasks, acceptancePlans, acceptanceRecords] = await Promise.all([
    taskIds.length > 0
      ? loadOptionalRows<DrawingTaskSource>(
        `${DRAWING_TASK_SELECT} WHERE project_id = ? AND id IN (${buildSqlPlaceholders(taskIds.length)}) ORDER BY created_at ASC`,
        [input.projectId, ...taskIds],
        'tasks',
      )
      : Promise.resolve([] as DrawingTaskSource[]),
    planIds.length > 0
      ? loadOptionalRows<DrawingAcceptancePlanSource>(
        `${ACCEPTANCE_PLAN_SELECT}
          WHERE project_id = ? AND id IN (${buildSqlPlaceholders(planIds.length)})
          ORDER BY planned_date ASC, created_at ASC`,
        [input.projectId, ...planIds],
        'acceptance_plans',
      )
      : Promise.resolve([] as DrawingAcceptancePlanSource[]),
    planIds.length > 0
      ? loadOptionalRows<DrawingAcceptanceRecordSource>(
        `${ACCEPTANCE_RECORD_SELECT}
          WHERE project_id = ? AND plan_id IN (${buildSqlPlaceholders(planIds.length)})
          ORDER BY created_at ASC`,
        [input.projectId, ...planIds],
        'acceptance_records',
      )
      : Promise.resolve([] as DrawingAcceptanceRecordSource[]),
  ])

  return {
    tasks,
    taskConditions,
    acceptancePlans,
    acceptanceRequirements,
    acceptanceRecords,
    issues,
    risks,
  }
}

function resolveLegacyPackageId(packageRow: DrawingPackageSource | null | undefined, packageId: string) {
  return packageRow?.id || packageRow?.package_code || packageId
}

export function registerDrawingPackageRoutes(router: Router) {
  router.get('/board', asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId)
    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '椤圭洰ID涓嶈兘涓虹┖' },
        timestamp: new Date().toISOString(),
      })
    }

    const data = await loadProjectPackages(projectId, { includeLinkedContext: true })
    const derivedPackages = data.packages.length > 0 ? data.packages : derivePackagesFromLegacyDrawings(data.drawings)
    const board = buildDrawingBoardView({
      packages: derivedPackages,
      items: data.items,
      drawings: data.drawings,
      versions: data.versions,
      reviewRules: data.reviewRules,
      tasks: data.tasks,
      taskConditions: data.taskConditions,
      acceptancePlans: data.acceptancePlans,
      acceptanceRequirements: data.acceptanceRequirements,
      acceptanceRecords: data.acceptanceRecords,
    })

    res.json({
      success: true,
      data: board,
      timestamp: new Date().toISOString(),
    })
  }))

  router.get('/ledger', asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId)
    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '椤圭洰ID涓嶈兘涓虹┖' },
        timestamp: new Date().toISOString(),
      })
    }

    const { packages, drawings, reviewRules } = await loadProjectPackages(projectId)
    const ledger = buildDrawingLedgerRows(drawings, packages, reviewRules)

    res.json({
      success: true,
      data: {
        drawings: ledger,
      },
      timestamp: new Date().toISOString(),
    })
  }))

  router.get('/packages/:packageId/detail', asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId)
    const { packageId } = req.params

    const packageRow = await findDrawingPackageByIdentifier(packageId)
    const packageLookup = resolveLegacyPackageId(packageRow, packageId)
    const detailPackageId = packageRow?.id || packageLookup
    const dataProjectId = normalizeText(packageRow?.project_id) || projectId || ''
    const projectData = dataProjectId
      ? await loadProjectPackages(dataProjectId)
      : {
        packages: [] as DrawingPackageSource[],
        drawings: [] as DrawingRecordSource[],
        versions: [] as DrawingVersionRecordSource[],
        items: [] as DrawingPackageItemSource[],
        reviewRules: [] as DrawingReviewRuleSource[],
        tasks: [] as DrawingTaskSource[],
        taskConditions: [] as DrawingTaskConditionSource[],
        acceptancePlans: [] as DrawingAcceptancePlanSource[],
        acceptanceRequirements: [] as DrawingAcceptanceRequirementSource[],
        acceptanceRecords: [] as DrawingAcceptanceRecordSource[],
        issues: [] as DrawingEscalatedIssueSource[],
        risks: [] as DrawingEscalatedRiskSource[],
      }
    const scopedDrawings = packageRow
      ? selectPackageScopedDrawings(projectData.drawings, packageLookup, packageRow).filter((drawing) => (
        projectId ? normalizeText(drawing.project_id) === projectId : true
      ))
      : projectData.drawings.filter((drawing) => getDrawingPackageGroupKey(drawing) === packageLookup)
    const scopedDrawingIds = new Set(scopedDrawings.map((drawing) => normalizeText(drawing.id)).filter(Boolean))
    const scopedVersions = projectData.versions.length > 0
      ? sortVersionsDesc(projectData.versions.filter((version) => (
        scopedDrawingIds.has(normalizeText(version.drawing_id))
        || normalizeText(version.package_id) === normalizeText(detailPackageId)
      )))
      : scopedDrawings.map((drawing) => ({
          id: drawing.id,
          drawing_id: drawing.id,
          package_id: detailPackageId,
          version_no: normalizeText(drawing.version_no ?? drawing.version, '1.0'),
          previous_version_id: null,
          is_current_version: drawing.is_current_version,
          change_reason: normalizeText(drawing.change_reason),
          created_at: normalizeText(drawing.created_at),
          created_by: null,
          drawing_name: normalizeText(drawing.drawing_name),
        }))
    const detailItems = projectData.items.filter((item) => normalizeText(item.package_id) === normalizeText(detailPackageId))
    const resolvedItems = detailItems.length > 0
      ? detailItems
      : scopedDrawings.map((drawing, index) => ({
        id: drawing.id,
        package_id: detailPackageId,
        item_code: normalizeText(drawing.drawing_code, normalizeText(drawing.id)),
        item_name: normalizeText(drawing.drawing_name, 'Unnamed drawing'),
        is_required: true,
        current_drawing_id: drawing.id,
        current_version: normalizeText(drawing.version_no ?? drawing.version, '1.0'),
        status: 'available',
        notes: '旧数据兼容项',
        sort_order: index + 1,
      }))
    const detailVersions = scopedVersions.length > 0
      ? scopedVersions
      : scopedDrawings.map((drawing, index) => ({
        id: drawing.id,
        drawing_id: drawing.id,
        package_id: detailPackageId,
        version_no: normalizeText(drawing.version_no ?? drawing.version, '1.0'),
        previous_version_id: null,
        is_current_version: drawing.is_current_version,
        change_reason: normalizeText(drawing.change_reason),
        created_at: normalizeText(drawing.created_at),
        created_by: null,
      }))

    const resolvedPackage = packageRow ?? derivePackagesFromLegacyDrawings(scopedDrawings)[0]
    if (!resolvedPackage) {
      return res.status(404).json({
        success: false,
        error: { code: 'PACKAGE_NOT_FOUND', message: '鍥剧焊鍖呬笉瀛樺湪' },
        timestamp: new Date().toISOString(),
      })
    }

    const resolvedProjectId = projectId || normalizeText(resolvedPackage.project_id) || ''
    const reviewRules = projectData.reviewRules
    const linkedContext = resolvedProjectId
      ? await loadDrawingPackageLinkedContext({
        projectId: resolvedProjectId,
        packageId: normalizeText(resolvedPackage.id) || packageLookup,
        packageCode: normalizeText(resolvedPackage.package_code),
        drawingIds: scopedDrawings.map((drawing) => normalizeText(drawing.id)).filter(Boolean),
      })
      : {
        tasks: [] as DrawingTaskSource[],
        taskConditions: [] as DrawingTaskConditionSource[],
        acceptancePlans: [] as DrawingAcceptancePlanSource[],
        acceptanceRequirements: [] as DrawingAcceptanceRequirementSource[],
        acceptanceRecords: [] as DrawingAcceptanceRecordSource[],
        issues: [] as DrawingEscalatedIssueSource[],
        risks: [] as DrawingEscalatedRiskSource[],
      }

    const detail = buildDrawingPackageDetailView({
      packageRow: resolvedPackage,
      requiredItems: resolvedItems,
      drawings: scopedDrawings,
      versions: detailVersions,
      reviewRules,
      tasks: linkedContext.tasks,
      taskConditions: linkedContext.taskConditions,
      acceptancePlans: linkedContext.acceptancePlans,
      acceptanceRequirements: linkedContext.acceptanceRequirements,
      acceptanceRecords: linkedContext.acceptanceRecords,
      issues: linkedContext.issues,
      risks: linkedContext.risks,
    })

    res.json({
      success: true,
      data: detail,
      timestamp: new Date().toISOString(),
    })
  }))

  router.get('/packages/:packageId/versions', asyncHandler(async (req, res) => {
    const { packageId } = req.params

    const packageRow = await findDrawingPackageByIdentifier(packageId)
    const packageLookup = resolveLegacyPackageId(packageRow, packageId)
    const dataProjectId = normalizeText(packageRow?.project_id) || normalizeText(req.query.projectId) || ''
    const projectData = dataProjectId
      ? await loadProjectPackages(dataProjectId)
      : {
        packages: [] as DrawingPackageSource[],
        drawings: [] as DrawingRecordSource[],
        versions: [] as DrawingVersionRecordSource[],
        items: [] as DrawingPackageItemSource[],
        reviewRules: [] as DrawingReviewRuleSource[],
        tasks: [] as DrawingTaskSource[],
        taskConditions: [] as DrawingTaskConditionSource[],
        acceptancePlans: [] as DrawingAcceptancePlanSource[],
        acceptanceRequirements: [] as DrawingAcceptanceRequirementSource[],
        acceptanceRecords: [] as DrawingAcceptanceRecordSource[],
        issues: [] as DrawingEscalatedIssueSource[],
        risks: [] as DrawingEscalatedRiskSource[],
      }
    const versions = projectData.versions.filter((version) => normalizeText(version.package_id) === normalizeText(packageRow?.id || packageId))
    const drawings = packageRow
      ? selectPackageScopedDrawings(projectData.drawings, packageLookup, packageRow)
      : projectData.drawings.filter((drawing) => getDrawingPackageGroupKey(drawing) === packageId)
    const scopedDrawings = packageRow
      ? drawings
      : drawings.filter((drawing) => getDrawingPackageGroupKey(drawing) === packageId)
    const detailVersions = versions.length > 0
      ? versions
      : scopedDrawings.map((drawing, index) => ({
        id: drawing.id,
        drawing_id: drawing.id,
        package_id: packageRow?.id || packageId,
        parent_drawing_id: normalizeText(drawing.parent_drawing_id),
        version_no: normalizeText(drawing.version_no ?? drawing.version, '1.0'),
        revision_no: normalizeText(drawing.revision_no ?? drawing.version_no ?? drawing.version),
        issued_for: normalizeText(drawing.issued_for ?? drawing.document_purpose),
        effective_date: normalizeText(drawing.effective_date ?? drawing.actual_pass_date ?? (drawing as DrawingRecordSource & { drawing_date?: string | null }).drawing_date),
        previous_version_id: null,
        is_current_version: drawing.is_current_version,
        superseded_at: null,
        change_reason: normalizeText(drawing.change_reason),
        created_at: normalizeText(drawing.created_at),
        created_by: null,
      }))

    const detail = buildDrawingBoardView({
      packages: packageRow ? [packageRow] : derivePackagesFromLegacyDrawings(scopedDrawings),
      drawings: scopedDrawings,
      versions: detailVersions,
      reviewRules: projectData.reviewRules,
    })

    res.json({
      success: true,
      data: {
        package: detail.packages[0] ?? null,
        versions: detailVersions.map((version) => ({
          versionId: normalizeText(version.id) || '',
          drawingId: normalizeText(version.drawing_id) || '',
          parentDrawingId: normalizeText(version.parent_drawing_id) || null,
          versionNo: normalizeText(version.version_no) || '1.0',
          revisionNo: normalizeText(version.revision_no) || null,
          issuedFor: normalizeText(version.issued_for) || null,
          effectiveDate: normalizeText(version.effective_date) || null,
          previousVersionId: normalizeText(version.previous_version_id) || null,
          isCurrentVersion: normalizeBoolean(version.is_current_version),
          supersededAt: normalizeText(version.superseded_at) || null,
          changeReason: normalizeText(version.change_reason) || '',
          createdAt: normalizeText(version.created_at) || null,
          createdBy: normalizeText(version.created_by) || '系统',
          drawingName: normalizeText(version.drawing_name) || 'Unnamed drawing',
        })),
      },
      timestamp: new Date().toISOString(),
    })
  }))

  router.get('/packages', asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId)
    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      })
    }

    const { packages, drawings } = await loadProjectPackages(projectId)
    const derivedPackages = packages.length > 0 ? packages : derivePackagesFromLegacyDrawings(drawings)

    res.json({
      success: true,
      data: derivedPackages,
      timestamp: new Date().toISOString(),
    })
  }))

  router.post('/packages', asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.body.projectId ?? req.body.project_id)
    const packageCode = normalizeText(req.body.packageCode ?? req.body.package_code)
    const packageName = normalizeText(req.body.packageName ?? req.body.package_name)
    const disciplineType = normalizeText(req.body.disciplineType ?? req.body.discipline_type) || '其他'
    const documentPurpose = normalizeText(req.body.documentPurpose ?? req.body.document_purpose) || '施工执行'
    const templateCode = normalizeText(req.body.templateCode ?? req.body.template_code)
    const reviewMode = normalizeText(req.body.reviewMode ?? req.body.review_mode)
    const reviewBasis = normalizeText(req.body.reviewBasis ?? req.body.review_basis)
    const requestedItems = Array.isArray(req.body.items) ? req.body.items : []

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      })
    }
    if (!packageName) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PACKAGE_NAME', message: 'Package name cannot be empty' },
        timestamp: new Date().toISOString(),
      })
    }
    if (!isValidReviewModeInput(reviewMode)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REVIEW_MODE', message: 'review_mode 非法，必须是 mandatory / optional / none / manual_confirm' },
        timestamp: new Date().toISOString(),
      })
    }

    const template = templateCode
      ? (getDefaultDrawingPackageTemplate(disciplineType, documentPurpose) ?? getDefaultDrawingPackageTemplate('建筑', '施工执行'))
      : getDefaultDrawingPackageTemplate(disciplineType, documentPurpose)
    const templateDefaults = buildPackageTemplateDefaults(template, projectId, packageCode || undefined, packageName)
    const evaluation = evaluateDrawingReviewRule({
      disciplineType,
      documentPurpose,
      packageCode: packageCode || templateDefaults.packageCode,
      packageName,
      defaultReviewMode: reviewMode || templateDefaults.reviewMode,
      reviewBasis,
    })

    const packageId = uuidv4()
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

    await executeSQL(
      `INSERT INTO drawing_packages
         (id, project_id, package_code, package_name, discipline_type, document_purpose,
          status, requires_review, review_mode, review_basis, completeness_ratio,
          missing_required_count, current_version_drawing_id, has_change, schedule_impact_flag,
          is_ready_for_construction, is_ready_for_acceptance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        packageId,
        projectId,
        packageCode || templateDefaults.packageCode,
        packageName,
        disciplineType,
        documentPurpose,
        'pending',
        evaluation.requiresReview ? 1 : 0,
        evaluation.reviewMode,
        evaluation.reviewBasis,
        0,
        0,
        null,
        0,
        0,
        0,
        0,
        now,
        now,
      ],
    )

    const items = requestedItems.length > 0
      ? requestedItems.map((item: Record<string, unknown>, index: number) => ({
        itemCode: normalizeText(item.itemCode ?? item.item_code) || `${template.templateCode}-${index + 1}`,
        itemName: normalizeText(item.itemName ?? item.item_name) || `应有项 ${index + 1}`,
        disciplineType: normalizeText(item.disciplineType ?? item.discipline_type) || disciplineType,
        isRequired: item.isRequired ?? item.is_required ?? true,
        sortOrder: normalizeNumber(item.sortOrder ?? item.sort_order, index + 1),
      }))
      : buildDrawingPackageTemplateItems(template)

    for (const item of items) {
      await executeSQL(
        `INSERT INTO drawing_package_items
           (id, package_id, item_code, item_name, discipline_type, is_required, current_drawing_id,
            current_version, status, notes, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          packageId,
          item.itemCode,
          item.itemName,
          item.disciplineType ?? disciplineType,
          item.isRequired ? 1 : 0,
          null,
          null,
          'missing',
          null,
          item.sortOrder,
          now,
          now,
        ],
      )
    }

    const createdPackage = await executeSQLOne<DrawingPackageSource>(`${DRAWING_PACKAGE_SELECT} WHERE id = ? LIMIT 1`, [packageId])
    const createdItems = await executeSQL<DrawingPackageItemSource>(`${DRAWING_PACKAGE_ITEM_SELECT} WHERE package_id = ? ORDER BY sort_order ASC`, [packageId])

    res.status(201).json({
      success: true,
      data: {
        package: createdPackage,
        items: createdItems,
      },
      timestamp: new Date().toISOString(),
    })
  }))

  router.patch('/packages/:packageId', asyncHandler(async (req, res) => {
    const { packageId } = req.params
    const current = await executeSQLOne<DrawingPackageSource>(`${DRAWING_PACKAGE_SELECT} WHERE id = ? LIMIT 1`, [packageId])
    if (!current) {
      return res.status(404).json({
        success: false,
        error: { code: 'PACKAGE_NOT_FOUND', message: '鍥剧焊鍖呬笉瀛樺湪' },
        timestamp: new Date().toISOString(),
      })
    }

    const incomingReviewMode = req.body.reviewMode ?? req.body.review_mode
    if (!isValidReviewModeInput(incomingReviewMode)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REVIEW_MODE', message: 'review_mode 非法，必须是 mandatory / optional / none / manual_confirm' },
        timestamp: new Date().toISOString(),
      })
    }

    const updates: string[] = []
    const params: unknown[] = []
    const fields: Record<string, unknown> = {
      package_code: normalizeText(req.body.packageCode ?? req.body.package_code),
      package_name: normalizeText(req.body.packageName ?? req.body.package_name),
      discipline_type: normalizeText(req.body.disciplineType ?? req.body.discipline_type),
      document_purpose: normalizeText(req.body.documentPurpose ?? req.body.document_purpose),
      status: normalizeText(req.body.status),
      review_mode: normalizeText(req.body.reviewMode ?? req.body.review_mode),
      review_basis: normalizeText(req.body.reviewBasis ?? req.body.review_basis),
      completeness_ratio: req.body.completenessRatio ?? req.body.completeness_ratio,
      missing_required_count: req.body.missingRequiredCount ?? req.body.missing_required_count,
      current_version_drawing_id: normalizeText(req.body.currentVersionDrawingId ?? req.body.current_version_drawing_id),
      has_change: req.body.hasChange ?? req.body.has_change,
      schedule_impact_flag: req.body.scheduleImpactFlag ?? req.body.schedule_impact_flag,
      is_ready_for_construction: req.body.isReadyForConstruction ?? req.body.is_ready_for_construction,
      is_ready_for_acceptance: req.body.isReadyForAcceptance ?? req.body.is_ready_for_acceptance,
    }

    for (const [column, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates.push(`${column} = ?`)
        params.push(value === null ? null : value)
      }
    }

    if (updates.length > 0) {
      params.push(packageId)
      await executeSQL(`UPDATE drawing_packages SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params)
    }

    const updated = await executeSQLOne<DrawingPackageSource>(`${DRAWING_PACKAGE_SELECT} WHERE id = ? LIMIT 1`, [packageId])
    res.json({
      success: true,
      data: updated,
      timestamp: new Date().toISOString(),
    })
  }))

  router.post('/packages/:packageId/set-current-version', asyncHandler(async (req, res) => {
    const { packageId } = req.params
    const drawingId = normalizeText(req.body.drawingId ?? req.body.drawing_id)
    const versionId = normalizeText(req.body.versionId ?? req.body.version_id)

    const packageRow = await executeSQLOne<DrawingPackageSource>(`${DRAWING_PACKAGE_SELECT} WHERE id = ? LIMIT 1`, [packageId])
    if (!packageRow) {
      return res.status(404).json({
        success: false,
        error: { code: 'PACKAGE_NOT_FOUND', message: '图纸包不存在' },
        timestamp: new Date().toISOString(),
      })
    }

    const [drawingsByPackageId, drawingsByPackageCode, versions] = await Promise.all([
      executeSQL<DrawingRecordSource>(
        `${CONSTRUCTION_DRAWING_SELECT} WHERE package_id = ? ORDER BY created_at ASC`,
        [packageRow.id || packageId],
      ),
      normalizeText(packageRow.package_code)
        ? executeSQL<DrawingRecordSource>(
          `${CONSTRUCTION_DRAWING_SELECT} WHERE package_code = ? ORDER BY created_at ASC`,
          [normalizeText(packageRow.package_code)],
        )
        : Promise.resolve([] as DrawingRecordSource[]),
      executeSQL<DrawingVersionRecordSource>(
        `${DRAWING_VERSION_SELECT} WHERE package_id = ? ORDER BY is_current_version DESC, created_at DESC`,
        [packageRow.id || packageId],
      ),
    ])
    const drawings = dedupeRowsById([...drawingsByPackageId, ...drawingsByPackageCode])

    let target = resolveDrawingPackageCurrentVersionTarget({
      packageId: packageRow.id || packageId,
      versionId,
      drawingId,
      versions,
      drawings,
    })

    if (target.error?.code === 'DRAWING_NOT_IN_PACKAGE' && drawingId) {
      const directDrawing = drawings.find((drawing) => normalizeText(drawing.id) === drawingId)
      if (directDrawing) {
        const directVersion = sortVersionsDesc(
          versions.filter((version) => normalizeText(version.drawing_id) === drawingId),
        )[0] ?? null
        target = {
          targetVersion: directVersion,
          targetDrawingId: normalizeText(directDrawing.id),
          targetDrawing: directDrawing,
          needsSnapshot: !directVersion,
          error: null,
        }
      }
    }

    if (target.error) {
      return res.status(target.error.status).json({
        success: false,
        error: { code: target.error.code, message: target.error.message },
        timestamp: new Date().toISOString(),
      })
    }

    let targetVersion = target.targetVersion
    let targetDrawingId = target.targetDrawingId

    if (!targetVersion && target.needsSnapshot && target.targetDrawing && targetDrawingId) {
      targetVersion = await ensureDrawingVersionSnapshot({
        projectId: normalizeText(packageRow.project_id) || normalizeText(target.targetDrawing.project_id) || '',
        packageId: packageRow.id || packageId,
        drawingId: targetDrawingId,
        versionNo: normalizeText(target.targetDrawing.version_no ?? target.targetDrawing.version, '1.0'),
        parentDrawingId: normalizeText(target.targetDrawing.parent_drawing_id),
        revisionNo: normalizeText(target.targetDrawing.revision_no ?? target.targetDrawing.version_no ?? target.targetDrawing.version),
        issuedFor: normalizeText(target.targetDrawing.issued_for ?? target.targetDrawing.document_purpose),
        effectiveDate: normalizeText(target.targetDrawing.effective_date ?? target.targetDrawing.actual_pass_date ?? ((target.targetDrawing as DrawingRecordSource & { drawing_date?: string | null }).drawing_date)),
        changeReason: normalizeText(target.targetDrawing.change_reason),
        createdBy: null,
        isCurrentVersion: true,
      })
    }

    if (!targetVersion || !targetDrawingId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TARGET_DRAWING', message: '当前有效版不能为空' },
        timestamp: new Date().toISOString(),
      })
    }

    for (const drawing of drawings) {
      await executeSQL('UPDATE construction_drawings SET is_current_version = ? WHERE id = ?', [drawing.id === targetDrawingId ? 1 : 0, drawing.id])
    }
    await executeSQL('UPDATE drawing_versions SET is_current_version = ?, superseded_at = CURRENT_TIMESTAMP WHERE package_id = ?', [0, packageRow.id || packageId])
    await executeSQL('UPDATE drawing_versions SET is_current_version = ?, superseded_at = ? WHERE id = ?', [1, null, targetVersion.id])
    await executeSQL('UPDATE drawing_packages SET current_version_drawing_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [targetDrawingId, packageRow.id || packageId])
    await syncPackageItemCurrentDrawing({
      packageId: packageRow.id || packageId,
      drawingId: targetDrawingId,
      drawingCode: normalizeText(target.targetDrawing?.drawing_code),
      versionNo: normalizeText(targetVersion.version_no),
    })
    await syncPackageCurrentDrawingCertificateLink(
      normalizeText(packageRow.project_id),
      normalizeText(packageRow.id || packageId),
    )

    const updatedPackage = await executeSQLOne<DrawingPackageSource>(`${DRAWING_PACKAGE_SELECT} WHERE id = ? LIMIT 1`, [packageRow.id || packageId])
    res.json({
      success: true,
      data: updatedPackage,
      timestamp: new Date().toISOString(),
    })
  }))
}
