import { Router } from 'express'

import { asyncHandler } from '../middleware/errorHandler.js'
import { executeSQL } from '../services/dbService.js'
import {
  DEFAULT_DRAWING_PACKAGE_TEMPLATES,
  evaluateDrawingReviewRule,
  getReviewModeLabel,
  isValidReviewModeInput,
  type DrawingReviewRuleEvaluationInput,
} from '../services/drawingPackageService.js'

function normalizeText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  if (value == null) return null
  return String(value)
}

export function registerDrawingReviewRuleRoutes(router: Router) {
  router.get('/review-rules', asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId)
    const rules = projectId
      ? [
        ...await executeSQL(
          'SELECT * FROM drawing_review_rules WHERE project_id = ? ORDER BY created_at ASC',
          [projectId],
        ),
        ...await executeSQL(
          'SELECT * FROM drawing_review_rules WHERE project_id IS NULL ORDER BY created_at ASC',
        ),
      ]
      : await executeSQL('SELECT * FROM drawing_review_rules ORDER BY project_id DESC, created_at ASC')

    res.json({
      success: true,
      data: {
        templates: DEFAULT_DRAWING_PACKAGE_TEMPLATES.map((template) => ({
          templateCode: template.templateCode,
          templateName: template.templateName,
          disciplineType: template.disciplineType,
          documentPurpose: template.documentPurpose,
          defaultReviewMode: template.defaultReviewMode,
          defaultReviewModeLabel: getReviewModeLabel(template.defaultReviewMode),
          items: template.items,
        })),
        rules,
      },
      timestamp: new Date().toISOString(),
    })
  }))

  router.post('/review-rules/evaluate', asyncHandler(async (req, res) => {
    const body = req.body as DrawingReviewRuleEvaluationInput
    if (!isValidReviewModeInput(body.defaultReviewMode) || !isValidReviewModeInput(body.overrideReviewMode)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REVIEW_MODE', message: 'review_mode 非法，必须是 mandatory / optional / none / manual_confirm' },
        timestamp: new Date().toISOString(),
      })
    }
    const evaluation = evaluateDrawingReviewRule({
      disciplineType: normalizeText(body.disciplineType),
      documentPurpose: normalizeText(body.documentPurpose),
      packageCode: normalizeText(body.packageCode),
      packageName: normalizeText(body.packageName),
      defaultReviewMode: body.defaultReviewMode,
      overrideReviewMode: body.overrideReviewMode,
      reviewBasis: normalizeText(body.reviewBasis),
    })

    res.json({
      success: true,
      data: evaluation,
      timestamp: new Date().toISOString(),
    })
  }))
}
