import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validation.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { collectWbsTemplateFeedback } from '../services/wbsTemplateFeedback.js'
import { inferWbsReferenceDays, sumSuggestedReferenceDays } from '../services/wbsReferenceDaysInference.js'
import type { ApiResponse } from '../types/index.js'
import type {
  WbsReferenceDaysConfirmRequest,
  WbsReferenceDaysConfirmResponse,
  WbsReferenceDaysInferenceReport,
  WbsTemplateFeedbackReport,
  WbsTemplateReferenceDayFeedbackNode,
} from '../types/planning.js'

const router = Router()

router.use(authenticate)

const templateIdParamSchema = z.object({
  id: z.string().trim().min(1),
})

const confirmReferenceDaysBodySchema = z.object({
  apply_all: z.boolean().optional(),
  selected_paths: z.array(z.string().trim().min(1)).optional(),
}).passthrough()

function normalizeTemplateData(template: any): any[] {
  const source = template?.wbs_nodes ?? template?.template_data ?? []
  if (typeof source === 'string') {
    try {
      return normalizeTemplateData({ wbs_nodes: JSON.parse(source) })
    } catch {
      return []
    }
  }
  return Array.isArray(source) ? source : []
}

async function loadTemplate(templateId: string) {
  const template = await executeSQLOne<any>('SELECT * FROM wbs_templates WHERE id = ? LIMIT 1', [templateId])
  if (!template) {
    const error: ApiResponse = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'WBS 模板不存在' },
      timestamp: new Date().toISOString(),
    }
    return { error }
  }

  return { template }
}

function buildActionableFeedbackNodes(nodes: WbsTemplateReferenceDayFeedbackNode[]) {
  return nodes.filter((node) =>
    node.is_leaf
    && node.suggested_reference_days !== null
    && node.suggested_reference_days !== undefined
    && node.current_reference_days !== node.suggested_reference_days,
  )
}

router.get('/:id/feedback', validate(templateIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { error, template } = await loadTemplate(id)
  if (error) {
    return res.status(404).json(error)
  }

  const feedback = await collectWbsTemplateFeedback(template.id)
  const response: ApiResponse<WbsTemplateFeedbackReport> = {
    success: true,
    data: feedback,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/:id/reference-days', validate(templateIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { error, template } = await loadTemplate(id)
  if (error) {
    return res.status(404).json(error)
  }

  const feedback = await collectWbsTemplateFeedback(template.id)
  const actionableFeedbackNodes = buildActionableFeedbackNodes(feedback.nodes)
  const inference = inferWbsReferenceDays({
    templateId: template.id,
    templateName: String(template.template_name ?? template.name ?? 'WBS 模板'),
    feedbackNodes: actionableFeedbackNodes,
    templateData: normalizeTemplateData(template),
  })

  const response: ApiResponse<WbsReferenceDaysInferenceReport & { feedback: WbsTemplateFeedbackReport }> = {
    success: true,
    data: {
      ...inference,
      feedback,
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/reference-days/confirm', validate(templateIdParamSchema, 'params'), validate(confirmReferenceDaysBodySchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const body = (req.body ?? {}) as WbsReferenceDaysConfirmRequest

  const { error, template } = await loadTemplate(id)
  if (error) {
    return res.status(404).json(error)
  }

  const feedback = await collectWbsTemplateFeedback(template.id)
  const actionableFeedbackNodes = buildActionableFeedbackNodes(feedback.nodes)
  const selectedPaths = Array.isArray(body.selected_paths) ? body.selected_paths.filter((path) => Boolean(String(path).trim())) : []
  const filteredFeedback = body.apply_all === false && selectedPaths.length > 0
    ? actionableFeedbackNodes.filter((node) => selectedPaths.includes(node.path))
    : actionableFeedbackNodes

  const inference = inferWbsReferenceDays({
    templateId: template.id,
    templateName: String(template.template_name ?? template.name ?? 'WBS 模板'),
    feedbackNodes: filteredFeedback,
    templateData: normalizeTemplateData(template),
  })

  const nextTemplateData = inference.inferred_template_data
  const nextReferenceDays = sumSuggestedReferenceDays(nextTemplateData)
  const now = new Date().toISOString()

  await executeSQL(
    `UPDATE wbs_templates
     SET wbs_nodes = ?, template_data = ?, reference_days = ?, updated_at = ?
     WHERE id = ?`,
    [
      JSON.stringify(nextTemplateData),
      JSON.stringify(nextTemplateData),
      nextReferenceDays,
      now,
      template.id,
    ],
  )

  const response: ApiResponse<WbsReferenceDaysConfirmResponse> = {
    success: true,
    data: {
      template_id: template.id,
      template_name: String(template.template_name ?? template.name ?? 'WBS 模板'),
      updated_count: inference.updated_count,
      reference_days: nextReferenceDays,
      template_data: nextTemplateData,
    },
    timestamp: now,
  }

  res.json(response)
}))

export default router
