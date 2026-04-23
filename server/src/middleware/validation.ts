import { z } from 'zod'
import type { Request, Response, NextFunction } from 'express'
import type { ApiResponse } from '../types/index.js'
import { DRAWING_REVIEW_MODE_VALUES } from '../services/drawingPackageService.js'

export const uuidSchema = z.string().uuid()

const PROJECT_STATUS_VALUES = [
  '\u672a\u5f00\u59cb',
  '\u8fdb\u884c\u4e2d',
  '\u5df2\u5b8c\u6210',
  '\u5df2\u6682\u505c',
] as const

const HEALTH_STATUS_VALUES = [
  '\u5065\u5eb7',
  '\u4e9a\u5065\u5eb7',
  '\u9884\u8b66',
  '\u5371\u9669',
] as const

const CONDITION_TYPE_VALUES = [
  'material',
  'personnel',
  'weather',
  'design-change',
  'preceding',
  'other',
  '\u56fe\u7eb8',
  '\u6750\u6599',
  '\u4eba\u5458',
  '\u8bbe\u5907',
  '\u624b\u7eed',
  '\u5176\u4ed6',
] as const

const OBSTACLE_TYPE_VALUES = [
  'personnel',
  'material',
  'equipment',
  'environment',
  'design',
  'procedure',
  'funds',
  'other',
  '\u4eba\u5458',
  '\u6750\u6599',
  '\u8bbe\u5907',
  '\u73af\u5883',
  '\u8bbe\u8ba1',
  '\u624b\u7eed',
  '\u8d44\u91d1',
  '\u5176\u4ed6',
] as const

const OBSTACLE_SEVERITY_VALUES = [
  '\u4f4e',
  '\u4e2d',
  '\u9ad8',
  '\u4e25\u91cd',
] as const

const OBSTACLE_STATUS_VALUES = [
  'pending',
  'active',
  'resolving',
  'resolved',
  'closed',
  'blocked',
  '\u5f85\u5904\u7406',
  '\u5904\u7406\u4e2d',
  '\u5df2\u89e3\u51b3',
] as const

export const projectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  status: z.enum(PROJECT_STATUS_VALUES).default('\u672a\u5f00\u59cb'),
  project_type: z.string().optional().nullable(),
  building_type: z.string().optional().nullable(),
  structure_type: z.string().optional().nullable(),
  building_count: z.number().int().optional().nullable(),
  above_ground_floors: z.number().int().optional().nullable(),
  underground_floors: z.number().int().optional().nullable(),
  support_method: z.string().optional().nullable(),
  total_area: z.number().optional().nullable(),
  planned_start_date: z.string().optional().nullable(),
  planned_end_date: z.string().optional().nullable(),
  actual_start_date: z.string().optional().nullable(),
  actual_end_date: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  total_investment: z.number().optional().nullable(),
  budget: z.number().optional().nullable(),
  location: z.string().optional().nullable(),
  health_score: z.number().int().min(0).max(100).optional(),
  health_status: z.enum(HEALTH_STATUS_VALUES).optional(),
  current_phase: z.enum(['pre-construction', 'construction', 'completion', 'delivery']).optional(),
  construction_unlock_date: z.string().optional().nullable(),
  construction_unlock_by: z.string().uuid().optional().nullable(),
  default_wbs_generated: z.boolean().optional(),
  version: z.number().int().optional(),
})

export const projectUpdateSchema = projectSchema.partial()

const taskBaseSchema = z.object({
  project_id: uuidSchema,
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  status: z.enum(['todo', 'pending', 'in_progress', 'completed', 'blocked']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent', 'critical']).default('medium'),
  start_date: z.string({ required_error: 'start_date 不能为空' }).min(1, 'start_date 不能为空'),
  end_date: z.string({ required_error: 'end_date 不能为空' }).min(1, 'end_date 不能为空'),
  progress: z.number().int().min(0).max(100).default(0),
  assignee: z.string().optional().nullable(),
  assignee_user_id: uuidSchema.optional().nullable(),
  assignee_unit: z.string().optional().nullable(),
  responsible_unit: z.string().optional().nullable(),
  participant_unit_id: uuidSchema.optional().nullable(),
  assignee_name: z.string().optional().nullable(),
  parent_id: uuidSchema.optional().nullable(),
  parent_task_id: uuidSchema.optional().nullable(),
  dependencies: z.array(z.string()).optional().nullable(),
  milestone_id: uuidSchema.optional().nullable(),
  specialty_type: z.string().optional().nullable(),
  reference_duration: z.number().optional().nullable(),
  first_progress_at: z.string().optional().nullable(),
  is_critical: z.boolean().optional().nullable(),
  is_milestone: z.boolean().optional().nullable(),
  milestone_level: z.number().int().min(1).max(3).optional().nullable(),
  sort_order: z.number().int().optional().nullable(),
  wbs_code: z.string().optional().nullable(),
  wbs_level: z.number().int().min(0).max(10).optional().nullable(),
  ai_duration: z.number().optional().nullable(),
  delay_reason: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
  planned_start_date: z.string().optional().nullable(),
  planned_end_date: z.string().optional().nullable(),
  actual_start_date: z.string().optional().nullable(),
  actual_end_date: z.string().optional().nullable(),
  planned_duration: z.number().optional().nullable(),
  standard_duration: z.number().optional().nullable(),
  ai_adjusted_duration: z.number().optional().nullable(),
})

type TaskDateWindowInput = Partial<{
  planned_start_date: string | null
  start_date: string | null
  planned_end_date: string | null
  end_date: string | null
}>

export interface TaskDateValidationIssue {
  path: 'planned_start_date' | 'planned_end_date'
  message: string
}

export interface TaskDateValidationResult {
  plannedStartDate: string
  plannedEndDate: string
  issues: TaskDateValidationIssue[]
  valid: boolean
}

function normalizeTaskDateText(value: unknown) {
  return String(value ?? '').trim()
}

function hasTaskDateField(value: TaskDateWindowInput) {
  return (
    'planned_start_date' in value
    || 'start_date' in value
    || 'planned_end_date' in value
    || 'end_date' in value
  )
}

export function validateTaskDateWindow(
  value: TaskDateWindowInput,
  options: { requireBothDates?: boolean } = {},
): TaskDateValidationResult {
  const plannedStartDate = normalizeTaskDateText(value.planned_start_date ?? value.start_date)
  const plannedEndDate = normalizeTaskDateText(value.planned_end_date ?? value.end_date)
  const requireBothDates = options.requireBothDates ?? true
  const issues: TaskDateValidationIssue[] = []

  if (requireBothDates || hasTaskDateField(value)) {
    if (!plannedStartDate) {
      issues.push({
        path: 'planned_start_date',
        message: 'planned_start_date 不能为空',
      })
    }

    if (!plannedEndDate) {
      issues.push({
        path: 'planned_end_date',
        message: 'planned_end_date 不能为空',
      })
    }
  }

  if (
    plannedStartDate
    && plannedEndDate
    && new Date(plannedStartDate) > new Date(plannedEndDate)
  ) {
    issues.push({
      path: 'planned_end_date',
      message: 'planned_end_date 不能早于 planned_start_date',
    })
  }

  return {
    plannedStartDate,
    plannedEndDate,
    issues,
    valid: issues.length === 0,
  }
}

function applyTaskDateValidation(
  data: TaskDateWindowInput,
  ctx: z.RefinementCtx,
  options: { requireBothDates?: boolean } = {},
) {
  const result = validateTaskDateWindow(data, options)
  for (const issue of result.issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: issue.message,
      path: [issue.path],
    })
  }
}

export const taskSchema = taskBaseSchema.superRefine((data, ctx) => {
  applyTaskDateValidation(data, ctx, { requireBothDates: true })
})

export const taskUpdateSchema = taskBaseSchema.partial().extend({
  version: z.number().int().positive().optional(),
}).superRefine((data, ctx) => {
  applyTaskDateValidation(data, ctx, { requireBothDates: false })
})

export const riskSchema = z.object({
  project_id: uuidSchema,
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  level: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  // occurred 已废弃（§1.2），状态简化为 identified / mitigating / closed
  status: z.enum(['identified', 'mitigating', 'closed']).default('identified'),
  probability: z.number().min(0).max(100).default(50),
  impact: z.number().min(0).max(100).default(50),
  mitigation: z.string().optional(),
  risk_category: z.enum(['progress', 'quality', 'cost', 'safety', 'contract', 'external', 'other']).default('other'),
  task_id: uuidSchema.optional().nullable(),
  // 来源追踪字段（10.1 前置迁移）
  source_type: z.enum(['manual', 'warning_converted', 'warning_auto_escalated', 'source_deleted']).optional(),
  source_id: uuidSchema.optional().nullable(),
  source_entity_type: z.string().max(50).optional().nullable(),
  source_entity_id: z.string().max(255).optional().nullable(),
  chain_id: uuidSchema.optional().nullable(),
  pending_manual_close: z.boolean().optional(),
  linked_issue_id: uuidSchema.optional().nullable(),
  closed_reason: z.string().max(100).optional().nullable(),
  closed_at: z.string().datetime().optional().nullable(),
})

export const riskUpdateSchema = riskSchema.partial().extend({
  version: z.number().int().positive(),
})

// ─── Issues（10.1 基础模型）────────────────────────────────────────────────────
export const issueSchema = z.object({
  project_id: uuidSchema,
  task_id: uuidSchema.optional().nullable(),
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  source_type: z.enum([
    'manual',
    'risk_converted',
    'risk_auto_escalated',
    'obstacle_escalated',
    'condition_expired',
    'source_deleted',
  ]).default('manual'),
  source_id: uuidSchema.optional().nullable(),
  source_entity_type: z.string().max(50).optional().nullable(),
  source_entity_id: z.string().max(255).optional().nullable(),
  chain_id: uuidSchema.optional().nullable(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  priority: z.number().int().min(1).max(100).default(50),
  pending_manual_close: z.boolean().default(false),
  status: z.enum(['open', 'investigating', 'resolved', 'closed']).default('open'),
  closed_reason: z.string().max(100).optional().nullable(),
  closed_at: z.string().datetime().optional().nullable(),
})

export const issueUpdateSchema = issueSchema.partial().extend({
  version: z.number().int().positive(),
})

export const milestoneSchema = z.object({
  project_id: uuidSchema,
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  target_date: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).default('pending'),
  completion_rate: z.number().min(0).max(100).default(0),
})

export const milestoneUpdateSchema = milestoneSchema.partial().extend({
  version: z.number().int().positive(),
})

export const memberSchema = z.object({
  project_id: uuidSchema,
  user_id: uuidSchema,
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
  display_name: z.string().optional(),
})

export const invitationSchema = z.object({
  project_id: uuidSchema,
  code: z.string().length(8),
  role: z.enum(['editor', 'viewer']),
  status: z.enum(['active', 'used', 'revoked', 'expired']).default('active'),
  expires_at: z.string().datetime().optional(),
  created_by: uuidSchema,
})

export const invitationCreateSchema = z.object({
  project_id: uuidSchema,
  role: z.enum(['editor', 'viewer']),
  expires_at: z.string().datetime().optional(),
})

export const conditionSchema = z.object({
  task_id: uuidSchema,
  condition_name: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  condition_type: z.enum(CONDITION_TYPE_VALUES).default('\u5176\u4ed6'),
  description: z.string().optional().nullable(),
  drawing_package_id: uuidSchema.optional().nullable(),
  drawing_package_code: z.string().max(100).optional().nullable(),
  is_satisfied: z.boolean().default(false),
  responsible_person: z.string().optional().nullable(),
  responsible_unit: z.string().optional().nullable(),
  target_date: z.string().min(1),
  notes: z.string().optional().nullable(),
  project_id: uuidSchema.optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  sub_type: z.string().optional(),
  assigned_to: z.string().optional(),
  satisfied_reason: z.string().max(40).optional().nullable(),
  satisfied_reason_note: z.string().max(2000).optional().nullable(),
  change_source: z.enum(['system_auto', 'manual_adjusted', 'admin_force', 'approval']).optional(),
  change_reason: z.string().max(2000).optional().nullable(),
})

export const conditionUpdateSchema = conditionSchema.partial().extend({
  id: uuidSchema.optional(),
  target_date: z.string().min(1),
})

export const obstacleSchema = z.object({
  task_id: uuidSchema,
  description: z.string().min(1).max(1000).optional().nullable(),
  title: z.string().min(1).max(1000).optional().nullable(),
  is_resolved: z.boolean().optional(),
  obstacle_type: z.enum(OBSTACLE_TYPE_VALUES).optional().default('\u5176\u4ed6'),
  severity: z.enum(OBSTACLE_SEVERITY_VALUES).optional().default('\u4e2d'),
  status: z.enum(OBSTACLE_STATUS_VALUES).optional().default('\u5f85\u5904\u7406'),
  responsible_person: z.string().optional().nullable(),
  responsible_unit: z.string().optional().nullable(),
  expected_resolution_date: z.string().optional().nullable(),
  resolution_notes: z.string().optional().nullable(),
  resolution: z.string().optional().nullable(),
  project_id: uuidSchema.optional(),
}).refine(
  (data) => !!(data.description?.trim() || data.title?.trim()),
  { message: 'description or title is required' }
)

export const obstacleUpdateSchema = z.object({
  description: z.string().min(1).max(1000).optional().nullable(),
  title: z.string().min(1).max(1000).optional().nullable(),
  is_resolved: z.boolean().optional(),
  obstacle_type: z.enum(OBSTACLE_TYPE_VALUES).optional(),
  severity: z.enum(OBSTACLE_SEVERITY_VALUES).optional(),
  status: z.enum(OBSTACLE_STATUS_VALUES).optional(),
  responsible_person: z.string().optional().nullable(),
  responsible_unit: z.string().optional().nullable(),
  expected_resolution_date: z.string().optional().nullable(),
  resolution_notes: z.string().optional().nullable(),
  resolution: z.string().optional().nullable(),
  project_id: uuidSchema.optional(),
  id: uuidSchema.optional(),
})

const drawingBooleanSchema = z.union([z.boolean(), z.string(), z.number()]).optional().nullable()
const drawingNumberSchema = z.union([z.number(), z.string()]).optional().nullable()
const drawingReviewModeSchema = z.enum(DRAWING_REVIEW_MODE_VALUES).optional().nullable()

export const constructionDrawingSchema = z.object({
  project_id: uuidSchema,
  drawing_type: z.string().min(1).max(100).optional().nullable(),
  drawing_name: z.string().min(1).max(200),
  version: z.string().min(1).max(100).optional().nullable(),
  lock_version: z.coerce.number().int().positive().optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.string().max(100).optional().nullable(),
  design_unit: z.string().max(200).optional().nullable(),
  design_person: z.string().max(100).optional().nullable(),
  drawing_date: z.string().optional().nullable(),
  review_unit: z.string().max(200).optional().nullable(),
  review_status: z.string().max(100).optional().nullable(),
  review_date: z.string().optional().nullable(),
  review_opinion: z.string().max(2000).optional().nullable(),
  review_report_no: z.string().max(100).optional().nullable(),
  related_license_id: z.string().max(100).optional().nullable(),
  planned_submit_date: z.string().optional().nullable(),
  planned_pass_date: z.string().optional().nullable(),
  actual_submit_date: z.string().optional().nullable(),
  actual_pass_date: z.string().optional().nullable(),
  lead_unit: z.string().max(200).optional().nullable(),
  responsible_user_id: z.string().max(100).optional().nullable(),
  sort_order: drawingNumberSchema,
  notes: z.string().max(2000).optional().nullable(),
  created_by: z.string().max(100).optional().nullable(),
  user_id: z.string().max(100).optional().nullable(),
  package_id: uuidSchema.optional().nullable(),
  package_code: z.string().max(100).optional().nullable(),
  package_name: z.string().max(200).optional().nullable(),
  discipline_type: z.string().max(100).optional().nullable(),
  document_purpose: z.string().max(100).optional().nullable(),
  drawing_code: z.string().max(100).optional().nullable(),
  parent_drawing_id: uuidSchema.optional().nullable(),
  version_no: z.string().max(100).optional().nullable(),
  revision_no: z.string().max(100).optional().nullable(),
  issued_for: z.string().max(100).optional().nullable(),
  effective_date: z.string().optional().nullable(),
  is_current_version: drawingBooleanSchema,
  requires_review: drawingBooleanSchema,
  review_mode: drawingReviewModeSchema,
  review_basis: z.string().max(500).optional().nullable(),
  has_change: drawingBooleanSchema,
  change_reason: z.string().max(2000).optional().nullable(),
  schedule_impact_flag: drawingBooleanSchema,
  is_ready_for_construction: drawingBooleanSchema,
  is_ready_for_acceptance: drawingBooleanSchema,
})

export const constructionDrawingUpdateSchema = constructionDrawingSchema
  .omit({ project_id: true, drawing_name: true })
  .extend({
    project_id: uuidSchema.optional().nullable(),
    drawing_name: z.string().min(1).max(200).optional().nullable(),
  })
  .partial()

export function validate<T extends z.ZodType>(schema: T, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req[source])
      next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '\u6570\u636e\u9a8c\u8bc1\u5931\u8d25',
            details: error.errors,
          },
          timestamp: new Date().toISOString(),
        }
        return res.status(400).json(response)
      }
      next(error)
    }
  }
}

export const validateIdParam = validate(z.object({ id: uuidSchema }), 'params')
