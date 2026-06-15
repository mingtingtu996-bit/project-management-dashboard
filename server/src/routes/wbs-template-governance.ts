import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { getCurrentCompanyMembership, getProjectPermissionLevel, getVisibleProjectIds, isCompanyAdminRole } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { validate } from '../middleware/validation.js'
import { collectStandardInternalFlowGovernanceReport } from '../seeds/chinaGb50300TemplateCatalog.js'
import { collectConstructionDependencyRuleSystemReport } from '../services/constructionDependencyRuleSystemService.js'
import { collectWbsSeedSemanticGovernanceReport } from '../services/wbsSeedSemanticGovernanceService.js'
import { collectWbsTemplateSeedArchitectureGovernanceReport } from '../services/wbsTemplateSeedArchitectureGovernanceService.js'
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
const SYSTEM_WBS_TEMPLATE_SCOPES = new Set(['national', 'global', 'system', 'system_seed', 'global_dictionary'])

const templateIdParamSchema = z.object({
  id: z.string().trim().min(1),
})

const confirmReferenceDaysBodySchema = z.object({
  apply_all: z.boolean().optional(),
  selected_paths: z.array(z.string().trim().min(1)).optional(),
}).passthrough()

const internalFlowReportQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sample_limit: z.coerce.number().int().min(1).max(50).optional(),
})

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

function normalizeTemplateProjectId(template: any): string | null {
  const projectId = String(template?.project_id ?? '').trim()
  return projectId.length > 0 ? projectId : null
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || String(value ?? '').toLowerCase() === 'true'
}

function isSystemTemplate(template: any): boolean {
  if (normalizeTemplateProjectId(template)) return false
  const scope = String(template?.catalog_scope ?? '').trim().toLowerCase()
  return SYSTEM_WBS_TEMPLATE_SCOPES.has(scope)
    || isTruthy(template?.is_builtin)
    || Boolean(String(template?.standard_catalog_code ?? '').trim())
}

async function ensureTemplateVisible(req: any, res: any, template: any): Promise<boolean> {
  const projectId = normalizeTemplateProjectId(template)
  if (!projectId) {
    if (isSystemTemplate(template)) return true
    const membership = req.user?.id
      ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
      : null
    const currentCompanyId = String(membership?.companyId ?? '').trim()
    const templateCompanyId = String(template?.company_id ?? '').trim()
    if (currentCompanyId && templateCompanyId && currentCompanyId === templateCompanyId) return true

    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '您没有权限访问此WBS模板' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
    return false
  }

  const visibleProjectIds = req.user?.id
    ? await getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
    : []
  if (visibleProjectIds === null || visibleProjectIds.includes(projectId)) return true
  res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: '您没有权限访问此WBS模板' },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
  return false
}

async function ensureTemplateEditable(req: any, res: any, template: any): Promise<boolean> {
  const projectId = normalizeTemplateProjectId(template)
  if (!projectId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'GLOBAL_TEMPLATE_WRITE_FORBIDDEN',
        message: '全局标准模板不能通过普通经验工期接口写回，请使用后台标准库治理流程',
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
    return false
  }

  const permissionLevel = req.user?.id
    ? await getProjectPermissionLevel(req.user.id, projectId, getRequestCompanyId(req))
    : null
  if (permissionLevel === 'owner' || permissionLevel === 'editor') return true
  res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: '您没有编辑此WBS模板的权限' },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
  return false
}

async function getFeedbackProjectScope(req: any) {
  if (!req.user?.id) return []
  return await getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
}

async function ensureCompanyGovernanceVisible(req: any, res: any): Promise<boolean> {
  if (isCompanyAdminRole(req.user?.globalRole)) return true
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  if (membership?.role === 'company_admin') return true
  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: '同父级内部流规则治理报告仅面向公司管理员或后台治理流程开放',
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
  return false
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

router.get('/internal-flow-rules/report', validate(internalFlowReportQuerySchema, 'query'), asyncHandler(async (req, res) => {
  if (!await ensureCompanyGovernanceVisible(req, res)) return
  const report = collectStandardInternalFlowGovernanceReport(Number(req.query.limit ?? 50))
  const response: ApiResponse<typeof report> = {
    success: true,
    data: report,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/dependency-rule-system/report', validate(internalFlowReportQuerySchema, 'query'), asyncHandler(async (req, res) => {
  if (!await ensureCompanyGovernanceVisible(req, res)) return
  const report = collectConstructionDependencyRuleSystemReport(Number(req.query.limit ?? 50))
  const response: ApiResponse<typeof report> = {
    success: true,
    data: report,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/semantic-precision/report', validate(internalFlowReportQuerySchema, 'query'), asyncHandler(async (req, res) => {
  if (!await ensureCompanyGovernanceVisible(req, res)) return
  const report = collectWbsSeedSemanticGovernanceReport({
    limit: Number(req.query.limit ?? 50),
    sampleLimit: Number(req.query.sample_limit ?? 5),
  })
  const response: ApiResponse<typeof report> = {
    success: true,
    data: report,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/seed-architecture/report', asyncHandler(async (req, res) => {
  if (!await ensureCompanyGovernanceVisible(req, res)) return
  const report = await collectWbsTemplateSeedArchitectureGovernanceReport()
  const response: ApiResponse<typeof report> = {
    success: true,
    data: report,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/:id/feedback', validate(templateIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { error, template } = await loadTemplate(id)
  if (error) {
    return res.status(404).json(error)
  }
  if (!await ensureTemplateVisible(req, res, template)) return

  const feedback = await collectWbsTemplateFeedback(template.id, {
    projectIds: await getFeedbackProjectScope(req),
    companyId: getRequestCompanyId(req),
  })
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
  if (!await ensureTemplateVisible(req, res, template)) return

  const feedback = await collectWbsTemplateFeedback(template.id, {
    projectIds: await getFeedbackProjectScope(req),
    companyId: getRequestCompanyId(req),
  })
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
  if (!await ensureTemplateEditable(req, res, template)) return

  const feedback = await collectWbsTemplateFeedback(template.id, {
    projectIds: await getFeedbackProjectScope(req),
    companyId: getRequestCompanyId(req),
  })
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
     WHERE id = ? AND project_id = ?`,
    [
      JSON.stringify(nextTemplateData),
      JSON.stringify(nextTemplateData),
      nextReferenceDays,
      now,
      template.id,
      normalizeTemplateProjectId(template),
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
