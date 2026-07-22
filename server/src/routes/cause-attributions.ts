import { Router } from 'express'
import { z } from 'zod'

import { getRequestCompanyId } from '../auth/companyContext.js'
import { CANONICAL_STRUCTURED_CAUSE_CODES } from '../domain/structuredCauseTaxonomy.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'
import {
  confirmStructuredCauseAttribution,
  getStructuredCauseAttributionQualityMetrics,
  listStructuredCauseAttributions,
  loadTaskStructuredCauseEvidence,
  persistStructuredCauseCandidates,
  recordUserConfirmedStructuredCauseAttribution,
  rejectStructuredCauseAttribution,
  STRUCTURED_CAUSE_TAXONOMY,
  STRUCTURED_CAUSE_TAXONOMY_VERSION,
} from '../services/structuredCauseAttributionService.js'

const router = Router()
router.use(authenticate)

const projectParamsSchema = z.object({
  projectId: z.string().trim().min(1),
})

const taskInferParamsSchema = projectParamsSchema.extend({
  taskId: z.string().trim().min(1),
})

const commandParamsSchema = projectParamsSchema.extend({
  attributionId: z.string().trim().min(1),
})

const subjectCommandParamsSchema = projectParamsSchema.extend({
  subjectType: z.enum(['task', 'risk', 'issue', 'baseline_change']),
  subjectId: z.string().trim().min(1),
})

const inferBodySchema = z.object({
  eventType: z.enum(['delay', 'completion']).default('delay'),
  impactDays: z.coerce.number().min(0).max(3650).optional().nullable(),
  windowStart: z.string().datetime({ offset: true }).or(z.string().date()).optional().nullable(),
  windowEnd: z.string().datetime({ offset: true }).or(z.string().date()).optional().nullable(),
  rawText: z.string().trim().max(4000).optional().nullable(),
})

const listQuerySchema = z.object({
  subjectType: z.enum(['task', 'risk', 'issue', 'baseline_change']).optional(),
  subjectId: z.string().trim().min(1).optional(),
  status: z.enum(['candidate', 'confirmed', 'rejected', 'superseded']).optional(),
})

const responsibilityClassSchema = z.enum([
  'owner_attributable',
  'contractor_attributable',
  'force_majeure',
  'shared',
  'undetermined',
])

const causeCodeSchema = z.enum(CANONICAL_STRUCTURED_CAUSE_CODES)

const userConfirmedCauseBodySchema = z.object({
  causeCode: causeCodeSchema,
  causeRole: z.enum(['primary', 'contributing', 'transmitted']).default('primary'),
  eventType: z.enum(['delay', 'completion']).optional(),
  rawText: z.string().trim().min(1).max(4000),
  responsibilityClass: responsibilityClassSchema.optional().nullable(),
  responsibilityBasis: z.string().trim().max(1000).optional().nullable(),
})

const confirmBodySchema = z.object({
  causeCode: causeCodeSchema.optional(),
  responsibilityClass: responsibilityClassSchema.optional().nullable(),
  responsibilityBasis: z.string().trim().max(1000).optional().nullable(),
  rawText: z.string().trim().max(4000).optional().nullable(),
})

const rejectBodySchema = z.object({
  rejectionReason: z.string().trim().min(1).max(2000),
})

function requireCompanyId(req: Parameters<typeof getRequestCompanyId>[0]) {
  const companyId = String(getRequestCompanyId(req) ?? '').trim()
  if (!companyId) {
    throw Object.assign(new Error('Company scope is required for structured cause attribution.'), {
      code: 'COMPANY_SCOPE_REQUIRED',
      statusCode: 403,
    })
  }
  return companyId
}

router.get('/taxonomy', (_req, res) => {
  res.json({
    success: true,
    data: {
      version: STRUCTURED_CAUSE_TAXONOMY_VERSION,
      entries: STRUCTURED_CAUSE_TAXONOMY,
    },
    timestamp: new Date().toISOString(),
  })
})

router.post(
  '/projects/:projectId/tasks/:taskId/infer',
  validate(taskInferParamsSchema, 'params'),
  validate(inferBodySchema),
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const companyId = requireCompanyId(req)
    const { projectId, taskId } = req.params
    const evidence = await loadTaskStructuredCauseEvidence({
      companyId,
      projectId,
      taskId,
      windowStart: req.body.windowStart ?? null,
      windowEnd: req.body.windowEnd ?? null,
    })
    const rows = await persistStructuredCauseCandidates({
      companyId,
      projectId,
      subjectType: 'task',
      subjectId: taskId,
      eventType: req.body.eventType,
      impactDays: req.body.impactDays ?? null,
      windowStart: req.body.windowStart ?? null,
      windowEnd: req.body.windowEnd ?? null,
      rawText: req.body.rawText ?? null,
      evidence,
    })

    res.status(201).json({ success: true, data: rows, timestamp: new Date().toISOString() })
  }),
)

router.get(
  '/projects/:projectId/quality-metrics',
  validate(projectParamsSchema, 'params'),
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const companyId = requireCompanyId(req)
    const data = await getStructuredCauseAttributionQualityMetrics({
      companyId,
      projectId: req.params.projectId,
    })
    res.json({ success: true, data, timestamp: new Date().toISOString() })
  }),
)

router.get(
  '/projects/:projectId',
  validate(projectParamsSchema, 'params'),
  validate(listQuerySchema, 'query'),
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const companyId = requireCompanyId(req)
    const rows = await listStructuredCauseAttributions({
      companyId,
      projectId: req.params.projectId,
      subjectType: req.query.subjectType as 'task' | 'risk' | 'issue' | 'baseline_change' | undefined,
      subjectId: String(req.query.subjectId ?? '').trim() || null,
      status: req.query.status as 'candidate' | 'confirmed' | 'rejected' | 'superseded' | undefined,
    })
    res.json({ success: true, data: rows, timestamp: new Date().toISOString() })
  }),
)

router.post(
  '/projects/:projectId/subjects/:subjectType/:subjectId/confirm',
  validate(subjectCommandParamsSchema, 'params'),
  validate(userConfirmedCauseBodySchema),
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const companyId = requireCompanyId(req)
    const subjectType = req.params.subjectType as 'task' | 'risk' | 'issue' | 'baseline_change'
    const eventType = subjectType === 'task'
      ? req.body.eventType ?? 'delay'
      : subjectType === 'baseline_change'
        ? 'baseline_change'
        : 'closure'
    const row = await recordUserConfirmedStructuredCauseAttribution({
      companyId,
      projectId: req.params.projectId,
      subjectType,
      subjectId: req.params.subjectId,
      eventType,
      causeCode: req.body.causeCode,
      causeRole: req.body.causeRole,
      rawText: req.body.rawText,
      actorId: String(req.user?.id ?? ''),
      responsibilityClass: req.body.responsibilityClass ?? null,
      responsibilityBasis: req.body.responsibilityBasis ?? null,
    })
    res.status(201).json({ success: true, data: row, timestamp: new Date().toISOString() })
  }),
)

router.post(
  '/projects/:projectId/:attributionId/confirm',
  validate(commandParamsSchema, 'params'),
  validate(confirmBodySchema),
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const companyId = requireCompanyId(req)
    const row = await confirmStructuredCauseAttribution({
      attributionId: req.params.attributionId,
      companyId,
      projectId: req.params.projectId,
      actorId: String(req.user?.id ?? ''),
      causeCode: req.body.causeCode ?? null,
      responsibilityClass: req.body.responsibilityClass ?? null,
      responsibilityBasis: req.body.responsibilityBasis ?? null,
      rawText: req.body.rawText ?? null,
    })
    res.json({ success: true, data: row, timestamp: new Date().toISOString() })
  }),
)

router.post(
  '/projects/:projectId/:attributionId/reject',
  validate(commandParamsSchema, 'params'),
  validate(rejectBodySchema),
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const companyId = requireCompanyId(req)
    const row = await rejectStructuredCauseAttribution({
      attributionId: req.params.attributionId,
      companyId,
      projectId: req.params.projectId,
      actorId: String(req.user?.id ?? ''),
      rejectionReason: req.body.rejectionReason,
    })
    res.json({ success: true, data: row, timestamp: new Date().toISOString() })
  }),
)

export default router
