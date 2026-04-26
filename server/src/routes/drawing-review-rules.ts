import { Router, type Request, type Router as ExpressRouter } from 'express'
import { v4 as uuidv4 } from 'uuid'

import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import {
  DEFAULT_DRAWING_PACKAGE_TEMPLATES,
  evaluateDrawingReviewRule,
  getReviewModeLabel,
  isValidReviewModeInput,
  normalizeReviewMode,
  type DrawingReviewRuleEvaluationInput,
  type DrawingReviewRuleSource,
} from '../services/drawingPackageService.js'
import { DRAWING_REVIEW_RULE_COLUMNS } from '../services/sqlColumns.js'

const DRAWING_REVIEW_RULE_SELECT = `SELECT ${DRAWING_REVIEW_RULE_COLUMNS} FROM drawing_review_rules`

type RequestBody = Record<string, unknown>

function asRecord(value: unknown): RequestBody {
  return typeof value === 'object' && value !== null ? (value as RequestBody) : {}
}

function normalizeText(value: unknown, fallback: string | null = null): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? fallback : trimmed
  }
  if (value == null) return fallback
  return String(value)
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (value == null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '') return fallback
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  }
  return Boolean(value)
}

function pickField(body: RequestBody, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return body[key]
    }
  }
  return undefined
}

function readProjectId(req: Pick<Request, 'body' | 'query'>) {
  const body = asRecord(req.body)
  const query = asRecord(req.query)
  const value = pickField(body, ['project_id', 'projectId'])
    ?? pickField(query, ['projectId', 'project_id'])
  return normalizeText(value, null) ?? undefined
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

async function loadRuleById(id: string): Promise<DrawingReviewRuleSource | null> {
  return executeSQLOne<DrawingReviewRuleSource>(`${DRAWING_REVIEW_RULE_SELECT} WHERE id = ? LIMIT 1`, [id])
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

function buildTemplateViews() {
  return DEFAULT_DRAWING_PACKAGE_TEMPLATES.map((template) => ({
    templateCode: template.templateCode,
    templateName: template.templateName,
    disciplineType: template.disciplineType,
    documentPurpose: template.documentPurpose,
    defaultReviewMode: template.defaultReviewMode,
    defaultReviewModeLabel: getReviewModeLabel(template.defaultReviewMode),
    items: template.items,
  }))
}

function buildRulePayload(body: RequestBody, existingRule?: DrawingReviewRuleSource | null) {
  const rawProjectId = pickField(body, ['project_id', 'projectId'])
  const rawPackageCode = pickField(body, ['package_code', 'packageCode'])
  const rawDisciplineType = pickField(body, ['discipline_type', 'disciplineType'])
  const rawDocumentPurpose = pickField(body, ['document_purpose', 'documentPurpose'])
  const rawDefaultReviewMode = pickField(body, [
    'default_review_mode',
    'defaultReviewMode',
    'review_mode',
    'reviewMode',
  ])
  const rawReviewBasis = pickField(body, ['review_basis', 'reviewBasis'])
  const rawReviewerId = pickField(body, ['reviewer_id', 'reviewerId', 'reviewer_user_id', 'reviewerUserId'])
  const rawIsActive = pickField(body, ['is_active', 'isActive'])

  if (!isValidReviewModeInput(rawDefaultReviewMode)) {
    return {
      error: {
        code: 'INVALID_REVIEW_MODE',
        message: 'review_mode 非法，必须是 mandatory / optional / none / manual_confirm',
      },
    }
  }

  const projectId = existingRule
    ? normalizeText(existingRule.project_id, null)
    : rawProjectId === undefined
      ? null
      : normalizeText(rawProjectId, null)

  const existingActive = normalizeBoolean(existingRule?.is_active, true)

  return {
    project_id: projectId,
    package_code: rawPackageCode === undefined ? normalizeText(existingRule?.package_code, null) : normalizeText(rawPackageCode, null),
    discipline_type: rawDisciplineType === undefined ? normalizeText(existingRule?.discipline_type, null) : normalizeText(rawDisciplineType, null),
    document_purpose:
      rawDocumentPurpose === undefined ? normalizeText(existingRule?.document_purpose, null) : normalizeText(rawDocumentPurpose, null),
    default_review_mode: rawDefaultReviewMode === undefined
      ? normalizeReviewMode(existingRule?.default_review_mode)
      : normalizeReviewMode(rawDefaultReviewMode as string | null | undefined),
    review_basis: rawReviewBasis === undefined ? normalizeText(existingRule?.review_basis, null) : normalizeText(rawReviewBasis, null),
    reviewer_id: rawReviewerId === undefined
      ? normalizeText((existingRule as { reviewer_id?: string | null } | null | undefined)?.reviewer_id, null)
      : normalizeText(rawReviewerId, null),
    is_active: rawIsActive === undefined ? existingActive : normalizeBoolean(rawIsActive, existingActive),
  }
}

function buildEvaluationInput(body: RequestBody): DrawingReviewRuleEvaluationInput {
  return {
    disciplineType: normalizeText(pickField(body, ['disciplineType', 'discipline_type'])),
    documentPurpose: normalizeText(pickField(body, ['documentPurpose', 'document_purpose'])),
    packageCode: normalizeText(pickField(body, ['packageCode', 'package_code'])),
    packageName: normalizeText(pickField(body, ['packageName', 'package_name'])),
    defaultReviewMode: pickField(body, ['defaultReviewMode', 'default_review_mode']) as DrawingReviewRuleEvaluationInput['defaultReviewMode'],
    overrideReviewMode: pickField(body, ['overrideReviewMode', 'override_review_mode']) as DrawingReviewRuleEvaluationInput['overrideReviewMode'],
    reviewBasis: normalizeText(pickField(body, ['reviewBasis', 'review_basis'])),
  }
}

function routePath(basePath: string, suffix = '') {
  const normalizedBase = basePath === '/' ? '' : basePath
  return `${normalizedBase}${suffix}` || '/'
}

function validateRulePayload(payload: ReturnType<typeof buildRulePayload>) {
  if ('error' in payload) return payload.error
  if (payload.default_review_mode === 'mandatory' && !payload.reviewer_id) {
    return {
      code: 'MISSING_REVIEWER_FOR_MANDATORY',
      message: 'mandatory 模式必须关联审图人',
    }
  }
  return null
}

export function registerDrawingReviewRuleRoutes(router: ExpressRouter, basePath = '/review-rules') {
  router.get(routePath(basePath), asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId ?? req.query.project_id)
    const rules = await loadProjectScopedReviewRules(projectId)

    res.json({
      success: true,
      data: {
        templates: buildTemplateViews(),
        rules,
      },
      timestamp: new Date().toISOString(),
    })
  }))

  router.post(
    routePath(basePath),
    requireProjectEditor((req) => readProjectId(req)),
    asyncHandler(async (req, res) => {
      const body = asRecord(req.body)
      const payload = buildRulePayload(body)

      const validationError = validateRulePayload(payload)
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError,
          timestamp: new Date().toISOString(),
        })
      }

      if (!payload.project_id) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
          timestamp: new Date().toISOString(),
        })
      }

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
      const id = uuidv4()
      await executeSQL(
        `INSERT INTO drawing_review_rules
           (id, project_id, package_code, discipline_type, document_purpose, default_review_mode, review_basis, reviewer_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          payload.project_id,
          payload.package_code,
          payload.discipline_type,
          payload.document_purpose,
          payload.default_review_mode,
          payload.review_basis ?? '',
          payload.reviewer_id,
          payload.is_active ? 1 : 0,
          now,
          now,
        ],
      )

      const rule = await loadRuleById(id)

      res.status(201).json({
        success: true,
        data: rule,
        timestamp: new Date().toISOString(),
      })
    }),
  )

  router.put(
    routePath(basePath, '/:id'),
    requireProjectEditor(async (req) => {
      const rule = await loadRuleById(req.params.id)
      return rule?.project_id ?? readProjectId(req)
    }),
    asyncHandler(async (req, res) => {
      const { id } = req.params
      const existingRule = await loadRuleById(id)
      if (!existingRule) {
        return res.status(404).json({
          success: false,
          error: { code: 'RULE_NOT_FOUND', message: '审图规则不存在' },
          timestamp: new Date().toISOString(),
        })
      }

      const body = asRecord(req.body)
      const payload = buildRulePayload(body, existingRule)
      const validationError = validateRulePayload(payload)
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError,
          timestamp: new Date().toISOString(),
        })
      }

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
      await executeSQL(
        `UPDATE drawing_review_rules
            SET package_code = ?, discipline_type = ?, document_purpose = ?, default_review_mode = ?,
                review_basis = ?, reviewer_id = ?, is_active = ?, updated_at = ?
          WHERE id = ?`,
        [
          payload.package_code,
          payload.discipline_type,
          payload.document_purpose,
          payload.default_review_mode,
          payload.review_basis ?? '',
          payload.reviewer_id,
          payload.is_active ? 1 : 0,
          now,
          id,
        ],
      )

      const rule = await loadRuleById(id)

      res.json({
        success: true,
        data: rule,
        timestamp: new Date().toISOString(),
      })
    }),
  )

  router.delete(
    routePath(basePath, '/:id'),
    requireProjectEditor(async (req) => {
      const rule = await loadRuleById(req.params.id)
      return rule?.project_id ?? readProjectId(req)
    }),
    asyncHandler(async (req, res) => {
      const { id } = req.params
      const existingRule = await loadRuleById(id)
      if (!existingRule) {
        return res.status(404).json({
          success: false,
          error: { code: 'RULE_NOT_FOUND', message: '审图规则不存在' },
          timestamp: new Date().toISOString(),
        })
      }

      await executeSQL('DELETE FROM drawing_review_rules WHERE id = ?', [id])

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
      })
    }),
  )

  router.post(routePath(basePath, '/evaluate'), asyncHandler(async (req, res) => {
    const body = asRecord(req.body)
    const evaluationInput = buildEvaluationInput(body)

    if (!isValidReviewModeInput(evaluationInput.defaultReviewMode) || !isValidReviewModeInput(evaluationInput.overrideReviewMode)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REVIEW_MODE', message: 'review_mode 非法，必须是 mandatory / optional / none / manual_confirm' },
        timestamp: new Date().toISOString(),
      })
    }

    const evaluation = evaluateDrawingReviewRule(evaluationInput)

    res.json({
      success: true,
      data: evaluation,
      timestamp: new Date().toISOString(),
    })
  }))
}

const drawingReviewRulesRouter = Router()
drawingReviewRulesRouter.use(authenticate)
registerDrawingReviewRuleRoutes(drawingReviewRulesRouter, '')

export default drawingReviewRulesRouter
