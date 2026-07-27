// v1.4.15: Unified deletion/close/archive/retention governance service.
// Shared planning commit routes call this service before task physical deletion.

import { createHash, randomUUID } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { logger } from '../middleware/logger.js'
import { isDatabaseTransactionActive, query } from '../database.js'
import { supabase } from './dbService.js'
import { writeChangeLog } from './changeAuditService.js'
import { buildIssueRetentionClosePatch, buildRiskRetentionClosePatch } from '../domain/riskIssueWorkflowPolicy.js'

export type RetentionRequestedAction =
  | 'delete'
  | 'close'
  | 'archive'
  | 'deactivate'
  | 'void'
  | 'hide'
  | 'cancel'
  | 'restore'
  | 'overwrite'

export type RetentionResolvedAction =
  | 'physical_delete'
  | 'soft_delete'
  | 'cancel'
  | 'close'
  | 'archive'
  | 'deactivate'
  | 'void'
  | 'hide'
  | 'source_deleted'
  | 'replace_draft_row'
  | 'merge_into_existing'
  | 'supersede'
  | 'reject'

export type RetentionExecutionMode = 'auto_execute' | 'require_user_confirm' | 'reject'

export type RetentionExecutionStatus =
  | 'decided'
  | 'pending_confirmation'
  | 'confirming'
  | 'executed'
  | 'cancelled_by_user'
  | 'expired'
  | 'failed'
  | 'rejected'

export interface RetentionCheckInput {
  entityType: string
  entityId: string
  projectId?: string | null
  projectNameSnapshot?: string | null
  entityNameSnapshot?: string | null
  userId?: string | null
  actorId?: string | null
  userAction: RetentionRequestedAction
  requestId?: string | null
  affectedEntityIds?: string[]
  suggestedAction?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface RetentionCheckResult {
  requestedAction: RetentionRequestedAction
  resolvedAction: RetentionResolvedAction
  decision: RetentionResolvedAction
  requestedAllowed: boolean
  resolvedAllowed: boolean
  executionMode: RetentionExecutionMode
  executionStatus: RetentionExecutionStatus
  requiresUserConfirmation: boolean
  decisionToken?: string
  expiresAt?: string
  reasonCode: string
  reason: string
  canPhysicalDelete: boolean
  referenceSummary: Record<string, number>
  affectedEntityIds: string[]
  suggestedAction: Record<string, unknown>
  changeSummary: Record<string, unknown>
}

export interface BatchRetentionDecision {
  requestedAction: RetentionRequestedAction
  totalCount: number
  autoExecutableCount: number
  requiresConfirmationCount: number
  rejectedCount: number
  decisions: RetentionCheckResult[]
  summaryMessage: string
}

export interface ConfirmRetentionDecisionInput {
  projectId: string
  decisionToken: string
  actorId?: string | null
}

export interface ConfirmRetentionDecisionResult {
  eventId: string
  projectId: string | null
  entityType: string
  entityId: string
  requestedAction: RetentionRequestedAction
  resolvedAction: RetentionResolvedAction
  executionStatus: RetentionExecutionStatus
  confirmedAt: string
  expiresAt: string | null
  actionResult?: Record<string, unknown>
}

export interface RetentionCoverageMatrixEntry {
  entityType: string
  deletePolicy: string
  closePolicy: string
  archivePolicy: string
  referenceChecks: string[]
  supportsConfirmation: boolean
  sourceDeletedPolicy: string
  primaryConsumers: string[]
}

export interface RetentionExecutorRegistryEntry {
  entityType: string
  supportedResolvedActions: RetentionResolvedAction[]
  effect: string
  idempotent: boolean
  transactionMode: 'single_table_update' | 'service_call' | 'planned_transaction_boundary'
  transactionReady: boolean
  dryRunSupported: boolean
}

export interface RetentionDiagnosticEventRow {
  id?: string | null
  project_id?: string | null
  entity_type?: string | null
  execution_status?: string | null
  reason_code?: string | null
  resolved_action?: string | null
  requested_action?: string | null
  expires_at?: string | null
  confirmation_metadata?: Record<string, unknown> | null
}

export interface RetentionRouteContract {
  routeFile: string
  entityTypes: string[]
  guardMarkers: string[]
  errorBuilderMarker: string
}

export interface RetentionFrontendConsumerContract {
  consumerFile: string
  requiredMarkers: string[]
}

export interface RetentionGovernanceDiagnosticsOptions {
  eventRows?: RetentionDiagnosticEventRow[]
  limit?: number
  now?: Date
  companyId?: string | null
  visibleProjectIds?: string[] | null
  routeContracts?: RetentionRouteContract[]
  routeSourceByFile?: Record<string, string>
  frontendConsumerContracts?: RetentionFrontendConsumerContract[]
  frontendSourceByFile?: Record<string, string>
}

export interface RetentionGovernanceDiagnosticsSyncOptions {
  eventRows?: RetentionDiagnosticEventRow[]
  now?: Date
  companyId?: string | null
  visibleProjectIds?: string[] | null
  coverageEntries?: RetentionCoverageMatrixEntry[]
  executorEntries?: RetentionExecutorRegistryEntry[]
  routeContracts?: RetentionRouteContract[]
  routeSourceByFile?: Record<string, string>
  frontendConsumerContracts?: RetentionFrontendConsumerContract[]
  frontendSourceByFile?: Record<string, string>
}

export interface RetentionConfirmationTransactionPlanInput {
  eventId: string
  projectId?: string | null
  entityType: string
  entityId: string
  resolvedAction: RetentionResolvedAction | string
}

export interface PreviewRetentionConfirmedActionInput {
  projectId?: string | null
  entityType: string
  entityId: string
  resolvedAction: RetentionResolvedAction | string
  actorId?: string | null
}

export interface ResolveRetentionOperatorAttentionInput {
  projectId: string
  eventId: string
  action: 'mark_handled' | 'retry_requested'
  note?: string | null
  actorId?: string | null
}

export interface RetentionConfirmationTransactionClient {
  reserveDecisionEvent: (input: RetentionConfirmationTransactionPlanInput) => Promise<unknown>
  executeDomainLifecycleAction: (input: RetentionConfirmationTransactionPlanInput) => Promise<unknown>
  persistConfirmationAudit: (input: RetentionConfirmationTransactionPlanInput & { actionResult?: unknown }) => Promise<unknown>
}

export interface ExecuteRetentionConfirmationTransactionBoundaryInput extends RetentionConfirmationTransactionPlanInput {
  transactionClient?: RetentionConfirmationTransactionClient | null
}

const RETENTION_GOVERNANCE_VERSION = 'v1.4.15-retention-governance'
const RETENTION_EXECUTOR_REGISTRY_VERSION = 'v1.4.15-retention-executors'
const RETENTION_TOKEN_HASH_VERSION = 'sha256'
const RETENTION_CONFIRMING_RECOVERY_AFTER_MS = 10 * 60 * 1000
const RETENTION_CONFIRMING_MAX_RECOVERY_ATTEMPTS = 3

const PROTECTED_TASK_SOURCES = [
  'warning_converted',
  'warning_auto_escalated',
  'risk_converted',
  'risk_auto_escalated',
  'obstacle_escalated',
  'condition_expired',
]

const RETENTION_COVERAGE_MATRIX: RetentionCoverageMatrixEntry[] = [
  {
    entityType: 'task',
    deletePolicy: 'physical_delete_when_unreferenced_else_close_or_soft_delete',
    closePolicy: 'close_retained',
    archivePolicy: 'archive_retained',
    referenceChecks: [
      'child_tasks',
      'task_conditions',
      'task_obstacles',
      'task_dependencies',
      'acceptance_plans',
      'task_progress_snapshots',
      'data_lineage_links',
      'monthly_plan_items',
      'task_baseline_items',
      'risks',
      'issues',
      'warnings',
      'notifications',
      'change_logs',
    ],
    supportsConfirmation: true,
    sourceDeletedPolicy: 'mark_downstream_source_deleted',
    primaryConsumers: ['tasks route', 'task list commit', 'Gantt delete guard'],
  },
  {
    entityType: 'risk',
    deletePolicy: 'physical_delete_when_unlinked_else_close_or_reject_upgrade_chain',
    closePolicy: 'close_retained',
    archivePolicy: 'archive_retained',
    referenceChecks: ['upgrade_chain', 'linked_issue', 'notifications', 'change_logs'],
    supportsConfirmation: true,
    sourceDeletedPolicy: 'set_source_type_source_deleted',
    primaryConsumers: ['RiskManagement', 'risks route', 'upgrade chain'],
  },
  {
    entityType: 'issue',
    deletePolicy: 'physical_delete_when_unlinked_else_close_or_reject_upgrade_chain',
    closePolicy: 'close_retained',
    archivePolicy: 'archive_retained',
    referenceChecks: ['upgrade_chain', 'notifications', 'change_logs'],
    supportsConfirmation: true,
    sourceDeletedPolicy: 'set_source_type_source_deleted',
    primaryConsumers: ['RiskManagement', 'issues route', 'upgrade chain'],
  },
  {
    entityType: 'acceptance_plan',
    deletePolicy: 'physical_delete_when_unreferenced_else_close',
    closePolicy: 'close_retained',
    archivePolicy: 'archive_retained',
    referenceChecks: ['acceptance_records', 'acceptance_dependencies', 'project_entity_links', 'change_logs'],
    supportsConfirmation: true,
    sourceDeletedPolicy: 'retain_acceptance_evidence',
    primaryConsumers: ['acceptance plans route', 'acceptance timeline'],
  },
  {
    entityType: 'task_obstacle',
    deletePolicy: 'physical_delete_when_unreferenced_else_resolve',
    closePolicy: 'resolve_retained',
    archivePolicy: 'archive_retained',
    referenceChecks: ['project_entity_links', 'data_lineage_links', 'change_logs'],
    supportsConfirmation: true,
    sourceDeletedPolicy: 'resolve_or_mark_source_deleted',
    primaryConsumers: ['task obstacles route', 'Gantt delete guard'],
  },
  {
    entityType: 'notification',
    deletePolicy: 'hide_or_archive_not_physical_delete_for_users',
    closePolicy: 'resolve_retained',
    archivePolicy: 'archive_retained',
    referenceChecks: ['change_logs', 'source_entity', 'user_states'],
    supportsConfirmation: false,
    sourceDeletedPolicy: 'resolved_source_source_deleted',
    primaryConsumers: ['notifications route', 'notification lifecycle job'],
  },
  {
    entityType: 'project',
    deletePolicy: 'physical_delete_when_retention_allows_else_reject',
    closePolicy: 'archive_or_deactivate_project',
    archivePolicy: 'archive_retained',
    referenceChecks: ['project_entity_links', 'data_lineage_links', 'change_logs'],
    supportsConfirmation: true,
    sourceDeletedPolicy: 'not_applicable_project_root',
    primaryConsumers: ['projects route', 'CompanyCockpit'],
  },
  {
    entityType: 'project_material',
    deletePolicy: 'archive_material_record',
    closePolicy: 'deactivate_retained',
    archivePolicy: 'archive_retained',
    referenceChecks: ['project_entity_links', 'data_lineage_links', 'change_logs'],
    supportsConfirmation: true,
    sourceDeletedPolicy: 'archive_material_and_reconcile_notifications',
    primaryConsumers: ['materials route', 'material arrival rules'],
  },
  {
    entityType: 'construction_drawing',
    deletePolicy: 'block_when_active_task_or_certificate_links_else_archive',
    closePolicy: 'deactivate_retained',
    archivePolicy: 'archive_retained',
    referenceChecks: ['task_links', 'certificate_links', 'project_entity_links', 'change_logs'],
    supportsConfirmation: true,
    sourceDeletedPolicy: 'archive_drawing_links',
    primaryConsumers: ['construction drawings route', 'drawing packages'],
  },
  {
    entityType: 'certificate_work_item',
    deletePolicy: 'block_when_active_task_or_certificate_links_else_deactivate',
    closePolicy: 'deactivate_retained',
    archivePolicy: 'archive_retained',
    referenceChecks: ['task_links', 'certificate_links', 'project_entity_links', 'change_logs'],
    supportsConfirmation: true,
    sourceDeletedPolicy: 'deactivate_certificate_links',
    primaryConsumers: ['certificate work items route', 'pre-milestones'],
  },
  {
    entityType: 'participant_unit',
    deletePolicy: 'physical_delete_when_unreferenced_else_archive',
    closePolicy: 'archive_retained',
    archivePolicy: 'archive_retained',
    referenceChecks: [
      'tasks',
      'task_conditions',
      'acceptance_plans',
      'project_materials',
      'responsibility_watchlist',
      'responsibility_alert_states',
      'task_baseline_items',
      'monthly_plan_items',
      'task_progress_snapshots',
      'project_entity_links',
      'data_lineage_links',
      'change_logs',
    ],
    supportsConfirmation: true,
    sourceDeletedPolicy: 'archive_unit_and_keep_history',
    primaryConsumers: ['participant units route', 'responsibility attribution', 'project daily snapshots'],
  },
]

const RETENTION_EXECUTOR_REGISTRY: RetentionExecutorRegistryEntry[] = [
  { entityType: 'task', supportedResolvedActions: ['close', 'soft_delete'], effect: 'closeTaskInMainChain', idempotent: true, transactionMode: 'service_call', transactionReady: false, dryRunSupported: false },
  { entityType: 'risk', supportedResolvedActions: ['close', 'soft_delete'], effect: 'closeRiskByRetention', idempotent: true, transactionMode: 'service_call', transactionReady: false, dryRunSupported: false },
  { entityType: 'issue', supportedResolvedActions: ['close', 'soft_delete'], effect: 'closeIssueByRetentionInMainChain', idempotent: true, transactionMode: 'service_call', transactionReady: false, dryRunSupported: false },
  { entityType: 'task_obstacle', supportedResolvedActions: ['close', 'soft_delete'], effect: 'update task_obstacles.status=resolved', idempotent: true, transactionMode: 'single_table_update', transactionReady: false, dryRunSupported: false },
  { entityType: 'acceptance_plan', supportedResolvedActions: ['close', 'archive', 'soft_delete'], effect: 'update acceptance_plans.status=archived', idempotent: true, transactionMode: 'single_table_update', transactionReady: false, dryRunSupported: true },
  { entityType: 'project', supportedResolvedActions: ['archive', 'deactivate', 'soft_delete'], effect: 'update projects.status=archived', idempotent: true, transactionMode: 'single_table_update', transactionReady: false, dryRunSupported: true },
  { entityType: 'project_material', supportedResolvedActions: ['archive', 'soft_delete', 'deactivate'], effect: 'update project_materials.record_status=inactive,lifecycle_status=archived', idempotent: true, transactionMode: 'single_table_update', transactionReady: false, dryRunSupported: true },
  { entityType: 'construction_drawing', supportedResolvedActions: ['archive', 'deactivate', 'soft_delete'], effect: 'update construction_drawings.status=archived', idempotent: true, transactionMode: 'single_table_update', transactionReady: false, dryRunSupported: true },
  { entityType: 'certificate_work_item', supportedResolvedActions: ['archive', 'deactivate', 'soft_delete'], effect: 'update certificate_work_items.status=voided', idempotent: true, transactionMode: 'single_table_update', transactionReady: false, dryRunSupported: true },
  { entityType: 'participant_unit', supportedResolvedActions: ['archive', 'soft_delete', 'deactivate'], effect: 'update participant_units.unit_status=archived', idempotent: true, transactionMode: 'single_table_update', transactionReady: false, dryRunSupported: true },
]

const RETENTION_ROUTE_CONTRACTS: RetentionRouteContract[] = [
  { routeFile: 'acceptance-catalog.ts', entityTypes: ['acceptance_catalog'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'acceptance-dependencies.ts', entityTypes: ['acceptance_dependency'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'acceptance-plans.ts', entityTypes: ['acceptance_plan'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'acceptance-records.ts', entityTypes: ['acceptance_record'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'acceptance-requirements.ts', entityTypes: ['acceptance_requirement'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'certificate-dependencies.ts', entityTypes: ['certificate_dependency'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'certificate-work-items.ts', entityTypes: ['certificate_work_item'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'construction-drawings.ts', entityTypes: ['construction_drawing'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'critical-paths.ts', entityTypes: ['critical_path'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'drawing-review-rules.ts', entityTypes: ['drawing_review_rule'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'engineering-objects.ts', entityTypes: ['engineering_object'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'issues.ts', entityTypes: ['issue'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'notifications.ts', entityTypes: ['notification'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'participant-units.ts', entityTypes: ['participant_unit'], guardMarkers: ['executeRetention('], errorBuilderMarker: 'participant_unit_reference_aware_delete_or_archive' },
  { routeFile: 'pre-milestone-conditions.ts', entityTypes: ['pre_milestone_condition'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'pre-milestone-dependencies.ts', entityTypes: ['pre_milestone_dependency'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'pre-milestones.ts', entityTypes: ['pre_milestone'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'project-materials.ts', entityTypes: ['project_material'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'projects.ts', entityTypes: ['project'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'risks.ts', entityTypes: ['risk'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'task-baselines.ts', entityTypes: ['task_baseline'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'task-conditions.ts', entityTypes: ['task_condition'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'task-obstacles.ts', entityTypes: ['task_obstacle'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
  { routeFile: 'tasks.ts', entityTypes: ['task'], guardMarkers: ['executeTaskDeleteRetention', 'executeRetention('], errorBuilderMarker: 'buildTaskDeleteRetentionReasonCode' },
  { routeFile: 'wbs-templates.ts', entityTypes: ['wbs_template'], guardMarkers: ['enforceRetentionOrBlock('], errorBuilderMarker: 'buildRetentionBlockedApiError' },
]

const RETENTION_FRONTEND_CONSUMER_CONTRACTS: RetentionFrontendConsumerContract[] = [
  {
    consumerFile: 'RiskManagement.tsx',
    requiredMarkers: ["from '@/lib/retentionError'", "apiPost('/api/deletion-retention/confirm'", 'retentionDecisionToken'],
  },
  {
    consumerFile: 'GanttView/GanttDeleteProtectionDialog.tsx',
    requiredMarkers: ["from '@/lib/retentionError'", 'buildRetentionDecisionDialogModel'],
  },
  {
    consumerFile: 'GanttView/useGanttDeleteGuardActions.ts',
    requiredMarkers: ["from '@/lib/retentionError'", "apiPost('/api/deletion-retention/confirm'"],
  },
  {
    consumerFile: 'Materials.tsx',
    requiredMarkers: ["from '@/lib/retentionError'", "apiPost('/api/deletion-retention/confirm'", 'retentionDecisionToken'],
  },
]

function isPositiveCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

async function countRows(table: string, filters: Record<string, unknown>) {
  let query = (supabase as any).from(table).select('id', { count: 'exact', head: true })
  for (const [field, value] of Object.entries(filters)) {
    query = query.eq(field, value)
  }
  const { count, error } = await query
  if (error) throw error
  return Number(count ?? 0)
}

async function addCount(
  refs: Record<string, number>,
  label: string,
  table: string,
  filters: Record<string, unknown>,
) {
  const count = await countRows(table, filters)
  if (count > 0) refs[label] = count
}

async function addAcceptanceDependencyCount(refs: Record<string, number>, projectId: string, planId: string) {
  const { count, error } = await (supabase as any)
    .from('acceptance_dependencies')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .or(`source_plan_id.eq.${planId},target_plan_id.eq.${planId}`)

  if (error) throw error
  const dependencyCount = Number(count ?? 0)
  if (dependencyCount > 0) refs.acceptance_dependencies = dependencyCount
}

async function checkTaskReferences(projectId: string, taskId: string): Promise<Record<string, number>> {
  const refs: Record<string, number> = {}
  const counts = await Promise.all([
    addCount(refs, 'child_tasks', 'tasks', { project_id: projectId, parent_id: taskId }),
    addCount(refs, 'task_conditions', 'task_conditions', { project_id: projectId, task_id: taskId }),
    addCount(refs, 'task_obstacles', 'task_obstacles', { project_id: projectId, task_id: taskId }),
    addCount(refs, 'task_dependencies', 'task_dependencies', { project_id: projectId, task_id: taskId }),
    addCount(refs, 'dependent_tasks', 'task_dependencies', { project_id: projectId, dependency_task_id: taskId }),
    addCount(refs, 'acceptance_plans', 'project_entity_links', {
      project_id: projectId,
      source_entity_type: 'acceptance_plan',
      target_entity_type: 'task',
      target_entity_id: taskId,
      relation_type: 'covers_task',
      status: 'active',
    }),
    addCount(refs, 'task_progress_snapshots', 'task_progress_snapshots', { project_id: projectId, task_id: taskId }),
    addCount(refs, 'data_lineage_links', 'data_lineage_links', {
      project_id: projectId,
      source_entity_type: 'task',
      source_entity_id: taskId,
    }),
    addCount(refs, 'project_entity_links', 'project_entity_links', {
      project_id: projectId,
      source_entity_type: 'task',
      source_entity_id: taskId,
    }),
    addCount(refs, 'monthly_plan_items', 'monthly_plan_items', { project_id: projectId, source_task_id: taskId }),
    addCount(refs, 'task_baseline_items', 'task_baseline_items', { project_id: projectId, source_task_id: taskId }),
    addCount(refs, 'risks', 'risks', { project_id: projectId, source_entity_type: 'task', source_entity_id: taskId }),
    addCount(refs, 'issues', 'issues', { project_id: projectId, source_entity_type: 'task', source_entity_id: taskId }),
    addCount(refs, 'warning_notifications', 'notifications', {
      project_id: projectId,
      task_id: taskId,
      source_entity_type: 'warning',
    }),
    addCount(refs, 'notifications', 'notifications', { project_id: projectId, target_type: 'task', target_id: taskId }),
    addCount(refs, 'change_logs', 'change_logs', { project_id: projectId, entity_type: 'task', entity_id: taskId }),
  ])
  void counts
  return refs
}

async function checkRiskReferences(projectId: string, riskId: string): Promise<Record<string, number>> {
  const refs: Record<string, number> = {}
  const { data: risk, error } = await (supabase as any)
    .from('risks')
    .select('source_type, linked_issue_id')
    .eq('id', riskId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw error
  if (risk?.linked_issue_id) refs.linked_issue = 1
  if (risk?.source_type && PROTECTED_TASK_SOURCES.includes(String(risk.source_type))) refs.upgrade_chain = 1
  await addCount(refs, 'notifications', 'notifications', { project_id: projectId, target_type: 'risk', target_id: riskId })
  await addCount(refs, 'change_logs', 'change_logs', { project_id: projectId, entity_type: 'risk', entity_id: riskId })
  return refs
}

async function addJsonbContainsCount(
  refs: Record<string, number>,
  label: string,
  table: string,
  projectId: string,
  field: string,
  value: Record<string, unknown>,
) {
  const { count, error } = await (supabase as any)
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .contains(field, value)
  if (error) throw error
  const normalizedCount = Number(count ?? 0)
  if (normalizedCount > 0) refs[label] = normalizedCount
}

async function checkParticipantUnitReferences(projectId: string, unitId: string): Promise<Record<string, number>> {
  const refs: Record<string, number> = {}
  await Promise.all([
    addCount(refs, 'tasks', 'tasks', { project_id: projectId, participant_unit_id: unitId }),
    addCount(refs, 'task_conditions', 'task_conditions', { project_id: projectId, participant_unit_id: unitId }),
    addCount(refs, 'acceptance_plans', 'acceptance_plans', { project_id: projectId, participant_unit_id: unitId }),
    addCount(refs, 'project_materials', 'project_materials', { project_id: projectId, participant_unit_id: unitId }),
    addCount(refs, 'responsibility_watchlist', 'responsibility_watchlist', { project_id: projectId, participant_unit_id: unitId }),
    addCount(refs, 'responsibility_alert_states', 'responsibility_alert_states', { project_id: projectId, participant_unit_id: unitId }),
    addJsonbContainsCount(refs, 'task_baseline_items', 'task_baseline_items', projectId, 'task_fact_snapshot', { participant_unit_id: unitId }),
    addJsonbContainsCount(refs, 'monthly_plan_items', 'monthly_plan_items', projectId, 'task_fact_snapshot', { participant_unit_id: unitId }),
    addJsonbContainsCount(refs, 'task_progress_snapshots', 'task_progress_snapshots', projectId, 'snapshot_data', { participant_unit_id: unitId }),
    addCount(refs, 'project_entity_links', 'project_entity_links', {
      project_id: projectId,
      source_entity_type: 'participant_unit',
      source_entity_id: unitId,
    }),
    addCount(refs, 'data_lineage_links', 'data_lineage_links', {
      project_id: projectId,
      source_entity_type: 'participant_unit',
      source_entity_id: unitId,
    }),
    addCount(refs, 'change_logs', 'change_logs', { project_id: projectId, entity_type: 'participant_unit', entity_id: unitId }),
  ])
  return refs
}

async function checkIssueReferences(projectId: string, issueId: string): Promise<Record<string, number>> {
  const refs: Record<string, number> = {}
  const { data: issue, error } = await (supabase as any)
    .from('issues')
    .select('source_type')
    .eq('id', issueId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw error
  if (issue?.source_type && PROTECTED_TASK_SOURCES.includes(String(issue.source_type))) refs.upgrade_chain = 1
  await addCount(refs, 'notifications', 'notifications', { project_id: projectId, target_type: 'issue', target_id: issueId })
  await addCount(refs, 'change_logs', 'change_logs', { project_id: projectId, entity_type: 'issue', entity_id: issueId })
  return refs
}

async function checkAcceptanceReferences(projectId: string, planId: string): Promise<Record<string, number>> {
  const refs: Record<string, number> = {}
  await Promise.all([
    addCount(refs, 'acceptance_records', 'acceptance_records', { project_id: projectId, plan_id: planId }),
    addAcceptanceDependencyCount(refs, projectId, planId),
    addCount(refs, 'project_entity_links', 'project_entity_links', {
      project_id: projectId,
      source_entity_type: 'acceptance_plan',
      source_entity_id: planId,
    }),
    addCount(refs, 'change_logs', 'change_logs', { project_id: projectId, entity_type: 'acceptance_plan', entity_id: planId }),
  ])
  return refs
}

function hasAnyReference(refs: Record<string, number>) {
  return Object.values(refs).some(isPositiveCount)
}

function hasHistoryConsumer(refs: Record<string, number>) {
  return Boolean(
    refs.task_progress_snapshots ||
    refs.data_lineage_links ||
    refs.task_baseline_items ||
    refs.monthly_plan_items ||
    refs.change_logs ||
    refs.warnings ||
    refs.notifications,
  )
}

function stableReferenceSignature(refs: Record<string, number>) {
  return Object.keys(refs)
    .sort()
    .map((key) => `${key}:${Number(refs[key] ?? 0)}`)
    .join('|')
}

export function hashRetentionDecisionToken(decisionToken: string) {
  const normalized = String(decisionToken ?? '').trim()
  if (!normalized) return ''
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

function getObjectRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function getRecoveryAttemptCount(metadata: Record<string, unknown>) {
  const attempts = Number(metadata.recovery_attempts ?? 0)
  return Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0
}

function isFreshConfirmingRetentionEvent(event: Record<string, any>, nowMs = Date.now()) {
  if (event.execution_status !== 'confirming') return false
  const metadata = getObjectRecord(event.confirmation_metadata)
  const reservedAt = new Date(String(metadata.reserved_at ?? '')).getTime()
  return Number.isFinite(reservedAt) && nowMs - reservedAt < RETENTION_CONFIRMING_RECOVERY_AFTER_MS
}

function isStaleConfirmingRetentionEvent(row: RetentionDiagnosticEventRow, nowMs = Date.now()) {
  if (row.execution_status !== 'confirming') return false
  const metadata = getObjectRecord(row.confirmation_metadata)
  const reservedAt = new Date(String(metadata.reserved_at ?? '')).getTime()
  return Number.isFinite(reservedAt) && nowMs - reservedAt >= RETENTION_CONFIRMING_RECOVERY_AFTER_MS
}

function buildRetentionOperatorAttention(rows: RetentionDiagnosticEventRow[], nowMs: number) {
  return rows
    .map((row) => {
      const metadata = getObjectRecord(row.confirmation_metadata)
      const executionStatus = String(row.execution_status ?? '').trim()
      if (executionStatus !== 'failed' && !isStaleConfirmingRetentionEvent(row, nowMs)) return null
      return {
        entityType: String(row.entity_type ?? 'unknown'),
        executionStatus,
        stale: executionStatus === 'confirming',
        recoveryAttempts: getRecoveryAttemptCount(metadata),
        lastErrorCode: String(metadata.last_error_code ?? '').trim() || null,
        lastErrorMessage: String(metadata.last_error_message ?? '').trim() || null,
      }
    })
    .filter((item): item is {
      entityType: string
      executionStatus: string
      stale: boolean
      recoveryAttempts: number
      lastErrorCode: string | null
      lastErrorMessage: string | null
    } => item !== null)
}

function toRetentionRequestedAction(value: unknown): RetentionRequestedAction {
  const normalized = String(value ?? '').trim() as RetentionRequestedAction
  const allowed: RetentionRequestedAction[] = [
    'delete',
    'close',
    'archive',
    'deactivate',
    'void',
    'hide',
    'cancel',
    'restore',
    'overwrite',
  ]
  return allowed.includes(normalized) ? normalized : 'delete'
}

function shouldApplyConfirmedRetentionAction(resolvedAction: unknown) {
  return [
    'soft_delete',
    'close',
    'cancel',
    'archive',
    'deactivate',
    'void',
    'hide',
  ].includes(String(resolvedAction ?? '').trim())
}

function normalizeProjectIdList(projectIds?: string[] | null) {
  if (!Array.isArray(projectIds)) return null
  return Array.from(new Set(
    projectIds
      .map((projectId) => String(projectId ?? '').trim())
      .filter(Boolean),
  ))
}

function filterRowsByVisibleProjects(
  rows: RetentionDiagnosticEventRow[],
  visibleProjectIds?: string[] | null,
) {
  const normalized = normalizeProjectIdList(visibleProjectIds)
  if (normalized === null) return rows
  if (normalized.length === 0) return []
  const visible = new Set(normalized)
  return rows.filter((row) => visible.has(String(row.project_id ?? '').trim()))
}

function getExecutorEntry(entityType: string) {
  return RETENTION_EXECUTOR_REGISTRY.find((entry) => entry.entityType === entityType) ?? null
}

function buildConfirmedRetentionMutationPreview(input: PreviewRetentionConfirmedActionInput, now = new Date().toISOString()) {
  const entityType = String(input.entityType ?? '').trim()
  const entityId = String(input.entityId ?? '').trim()
  const projectId = String(input.projectId ?? '').trim()
  const actorId = String(input.actorId ?? '').trim() || null
  const resolvedAction = String(input.resolvedAction ?? '').trim()

  if (!entityType || !entityId || !shouldApplyConfirmedRetentionAction(resolvedAction)) {
    return []
  }

  const projectScopedFilters = { id: entityId, project_id: projectId }
  switch (entityType) {
    case 'risk':
      return [{
        table: 'risks',
        filters: projectScopedFilters,
        patch: buildRiskRetentionClosePatch({ actorId, recordedAt: now }),
      }]
    case 'issue':
      return [{
        table: 'issues',
        filters: projectScopedFilters,
        patch: buildIssueRetentionClosePatch({ actorId, recordedAt: now }),
      }]
    case 'task_obstacle':
      return [{ table: 'task_obstacles', filters: projectScopedFilters, patch: { status: 'resolved', is_resolved: true, updated_at: now } }]
    case 'acceptance_plan':
      return [{ table: 'acceptance_plans', filters: projectScopedFilters, patch: { status: 'archived', updated_at: now } }]
    case 'project':
      return [{ table: 'projects', filters: { id: entityId }, patch: { status: 'archived', updated_at: now } }]
    case 'project_material':
      return [{
        table: 'project_materials',
        filters: projectScopedFilters,
        patch: {
          record_status: 'inactive',
          lifecycle_status: 'archived',
          deleted_at: now,
          deleted_by: actorId,
          updated_at: now,
        },
      }]
    case 'construction_drawing':
      return [{ table: 'construction_drawings', filters: projectScopedFilters, patch: { status: 'archived', updated_at: now } }]
    case 'certificate_work_item':
      return [{ table: 'certificate_work_items', filters: projectScopedFilters, patch: { status: 'voided', updated_at: now } }]
    case 'participant_unit':
      return [{ table: 'participant_units', filters: projectScopedFilters, patch: { unit_status: 'archived', updated_at: now } }]
    default:
      return []
  }
}

export async function previewRetentionConfirmedAction(input: PreviewRetentionConfirmedActionInput) {
  const entityType = String(input.entityType ?? '').trim()
  const entityId = String(input.entityId ?? '').trim()
  const projectId = String(input.projectId ?? '').trim() || null
  const resolvedAction = String(input.resolvedAction ?? '').trim()
  const executor = getExecutorEntry(entityType)
  const supported = Boolean(executor?.supportedResolvedActions.includes(resolvedAction as RetentionResolvedAction))
  const mutations = supported
    ? buildConfirmedRetentionMutationPreview(input)
    : []
  return {
    previewOnly: true,
    applied: false,
    supported,
    entityType,
    entityId,
    projectId,
    resolvedAction,
    executor: executor
      ? {
          entityType: executor.entityType,
          idempotent: executor.idempotent,
          transactionMode: executor.transactionMode,
          transactionReady: executor.transactionReady,
          dryRunSupported: executor.dryRunSupported,
        }
      : null,
    mutations,
    transactionBoundary: createRetentionConfirmationTransactionBoundary({
      eventId: 'preview',
      projectId,
      entityType,
      entityId,
      resolvedAction,
    }),
  }
}

async function executeConfirmedRetentionAction(
  event: Record<string, any>,
  actorId?: string | null,
): Promise<Record<string, unknown>> {
  const entityType = String(event.entity_type ?? '').trim()
  const entityId = String(event.entity_id ?? '').trim()
  const projectId = String(event.project_id ?? '').trim()
  const resolvedAction = String(event.resolved_action ?? '').trim()

  if (!entityType || !entityId || !shouldApplyConfirmedRetentionAction(resolvedAction)) {
    return { applied: false, reason: 'no_business_action_required' }
  }

  const now = new Date().toISOString()

  if (entityType === 'task') {
    const { closeTaskInMainChain } = await import('./taskWriteChainService.js')
    const result = await closeTaskInMainChain(entityId, undefined, actorId ?? null)
    return { applied: true, entityType, entityId, action: 'close', task: result?.task ?? null }
  }

  if (entityType === 'risk') {
    const { closeRiskByRetention } = await import('./dbService.js')
    const risk = await closeRiskByRetention(entityId, projectId, {
      actorId: actorId ?? null,
      evidenceRefs: event.id ? [`retention_event:${event.id}`] : [],
      recordedAt: now,
    })
    return { applied: true, entityType, entityId, action: 'close', risk }
  }

  if (entityType === 'issue') {
    const { closeIssueByRetentionInMainChain } = await import('./issueWriteChainService.js')
    const issue = await closeIssueByRetentionInMainChain(entityId, projectId, {
      actorId: actorId ?? null,
      evidenceRefs: event.id ? [`retention_event:${event.id}`] : [],
      recordedAt: now,
    })
    return { applied: true, entityType, entityId, action: 'close', issue }
  }

  if (entityType === 'task_obstacle') {
    const { data, error } = await (supabase as any)
      .from('task_obstacles')
      .update({ status: 'resolved', is_resolved: true, updated_at: now })
      .eq('id', entityId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return { applied: true, entityType, entityId, action: 'resolve', obstacle: data ?? null }
  }

  if (entityType === 'acceptance_plan') {
    const { data, error } = await (supabase as any)
      .from('acceptance_plans')
      .update({ status: 'archived', updated_at: now })
      .eq('id', entityId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return { applied: true, entityType, entityId, action: 'archive', acceptancePlan: data ?? null }
  }

  if (entityType === 'project') {
    const { data, error } = await (supabase as any)
      .from('projects')
      .update({ status: 'archived', updated_at: now })
      .eq('id', entityId)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return { applied: true, entityType, entityId, action: 'archive', project: data ?? null }
  }

  if (entityType === 'project_material') {
    const { data, error } = await (supabase as any)
      .from('project_materials')
      .update({
        record_status: 'inactive',
        lifecycle_status: 'archived',
        deleted_at: now,
        deleted_by: actorId ?? null,
        updated_at: now,
      })
      .eq('id', entityId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return { applied: true, entityType, entityId, action: 'archive', material: data ?? null }
  }

  if (entityType === 'construction_drawing') {
    const { data, error } = await (supabase as any)
      .from('construction_drawings')
      .update({ status: 'archived', updated_at: now })
      .eq('id', entityId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return { applied: true, entityType, entityId, action: 'archive', constructionDrawing: data ?? null }
  }

  if (entityType === 'certificate_work_item') {
    const { data, error } = await (supabase as any)
      .from('certificate_work_items')
      .update({ status: 'voided', updated_at: now })
      .eq('id', entityId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return { applied: true, entityType, entityId, action: 'void', certificateWorkItem: data ?? null }
  }

  if (entityType === 'participant_unit') {
    const { data, error } = await (supabase as any)
      .from('participant_units')
      .update({ unit_status: 'archived', updated_at: now })
      .eq('id', entityId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return { applied: true, entityType, entityId, action: 'archive', participantUnit: data ?? null }
  }

  return { applied: false, reason: 'unsupported_entity_type', entityType, entityId }
}

function buildResult(
  input: RetentionCheckInput,
  refs: Record<string, number>,
  resolvedAction: RetentionResolvedAction,
  reasonCode: string,
  reason: string,
  executionMode: RetentionExecutionMode,
  suggestedAction: Record<string, unknown> = {},
): RetentionCheckResult {
  const requiresUserConfirmation = executionMode === 'require_user_confirm'
  const resolvedAllowed = executionMode !== 'reject'
  const executionStatus: RetentionExecutionStatus = executionMode === 'reject'
    ? 'rejected'
    : executionMode === 'require_user_confirm'
      ? 'pending_confirmation'
      : 'decided'

  return {
    requestedAction: input.userAction,
    resolvedAction,
    decision: resolvedAction,
    requestedAllowed: input.userAction !== 'delete' || resolvedAction === 'physical_delete',
    resolvedAllowed,
    executionMode,
    executionStatus,
    requiresUserConfirmation,
    reasonCode,
    reason,
    canPhysicalDelete: resolvedAction === 'physical_delete',
    referenceSummary: refs,
    affectedEntityIds: input.affectedEntityIds ?? [input.entityId],
    suggestedAction,
    changeSummary: {
      entity_type: input.entityType,
      entity_id: input.entityId,
      requested_action: input.userAction,
      resolved_action: resolvedAction,
      execution_mode: executionMode,
    },
  }
}

async function loadReferences(input: RetentionCheckInput) {
  const projectId = String(input.projectId ?? '').trim()
  if (!projectId) {
    throw new Error('projectId is required for retention reference checks')
  }

  switch (input.entityType) {
    case 'task':
      return checkTaskReferences(projectId, input.entityId)
    case 'risk':
      return checkRiskReferences(projectId, input.entityId)
    case 'issue':
      return checkIssueReferences(projectId, input.entityId)
    case 'acceptance_plan':
      return checkAcceptanceReferences(projectId, input.entityId)
    case 'participant_unit':
      return checkParticipantUnitReferences(projectId, input.entityId)
    default: {
      const refs: Record<string, number> = {}
      await Promise.all([
        addCount(refs, 'project_entity_links', 'project_entity_links', {
          project_id: projectId,
          source_entity_type: input.entityType,
          source_entity_id: input.entityId,
        }),
        addCount(refs, 'data_lineage_links', 'data_lineage_links', {
          project_id: projectId,
          source_entity_type: input.entityType,
          source_entity_id: input.entityId,
        }),
        addCount(refs, 'change_logs', 'change_logs', {
          project_id: projectId,
          entity_type: input.entityType,
          entity_id: input.entityId,
        }),
      ])
      return refs
    }
  }
}

export async function evaluateRetention(input: RetentionCheckInput): Promise<RetentionCheckResult> {
  if (input.userAction === 'restore') {
    return buildResult(input, {}, 'reject', 'restore_requires_domain_action', 'Restore must use a domain reopen or reactivate action.', 'reject')
  }

  const refs = await loadReferences(input)
  const anyReference = hasAnyReference(refs)
  const historyConsumer = hasHistoryConsumer(refs)
  const upgradeChain = Boolean(refs.upgrade_chain || refs.linked_issue)

  if (input.userAction === 'hide') {
    return buildResult(input, refs, 'hide', 'user_requested_hide', 'The record will be hidden for the current user.', 'auto_execute')
  }

  if (input.userAction === 'close') {
    return buildResult(input, refs, 'close', 'user_requested_close', 'The record will be closed and retained.', 'auto_execute')
  }

  if (input.userAction === 'archive') {
    return buildResult(input, refs, 'archive', 'user_requested_archive', 'The record will be archived and retained.', 'auto_execute')
  }

  if (input.userAction === 'deactivate') {
    return buildResult(input, refs, 'deactivate', 'user_requested_deactivate', 'The record will be deactivated for future use.', 'require_user_confirm')
  }

  if (input.userAction === 'void') {
    return buildResult(input, refs, 'void', 'user_requested_void', 'The record will be voided and retained.', 'require_user_confirm')
  }

  if (input.userAction === 'cancel') {
    return buildResult(input, refs, 'cancel', 'user_requested_cancel', 'The record will be cancelled and retained.', 'require_user_confirm')
  }

  if (input.userAction === 'overwrite') {
    if (!anyReference) {
      return buildResult(
        input,
        refs,
        'replace_draft_row',
        'overwrite_unconsumed_draft',
        'The unconsumed draft row can be replaced by the generated row.',
        'auto_execute',
      )
    }
    if (!historyConsumer && !upgradeChain) {
      return buildResult(
        input,
        refs,
        'merge_into_existing',
        'overwrite_safe_merge',
        'The generated row can be merged into the existing row without changing history.',
        'require_user_confirm',
      )
    }
    return buildResult(
      input,
      refs,
      'supersede',
      'overwrite_history_consumer',
      'The existing row has history; keep it and supersede with a new row.',
      'require_user_confirm',
    )
  }

  if (input.userAction === 'delete' && input.entityType === 'participant_unit') {
    if (anyReference) {
      return buildResult(input, refs, 'archive', 'participant_unit_reference_archive', 'Participant units with task, material, responsibility, snapshot, or audit references are archived instead of physically deleted.', 'auto_execute')
    }
    return buildResult(input, refs, 'physical_delete', 'participant_unit_no_reference_physical_delete', 'The participant unit has no known references and can be physically deleted.', 'auto_execute')
  }

  if (upgradeChain) {
    return buildResult(input, refs, 'reject', 'upgrade_chain_protected', 'The record is part of an escalation chain and cannot be deleted.', 'reject')
  }

  if (historyConsumer) {
    return buildResult(input, refs, 'soft_delete', 'history_consumer_retained', 'The record has history consumers and will be retained.', 'require_user_confirm')
  }

  if (anyReference) {
    return buildResult(input, refs, 'close', 'active_reference_close', 'The record has active references and will be closed instead of deleted.', 'require_user_confirm')
  }

  return buildResult(input, refs, 'physical_delete', 'no_reference_physical_delete', 'The record has no references and can be deleted.', 'auto_execute')
}

export function summarizeBatchRetentionDecision(
  requestedAction: RetentionRequestedAction,
  decisions: RetentionCheckResult[],
): BatchRetentionDecision {
  const autoExecutableCount = decisions.filter((item) => item.executionMode === 'auto_execute').length
  const requiresConfirmationCount = decisions.filter((item) => item.requiresUserConfirmation).length
  const rejectedCount = decisions.filter((item) => item.executionMode === 'reject').length
  return {
    requestedAction,
    totalCount: decisions.length,
    autoExecutableCount,
    requiresConfirmationCount,
    rejectedCount,
    decisions,
    summaryMessage: `${decisions.length} retention decisions: ${autoExecutableCount} auto, ${requiresConfirmationCount} confirm, ${rejectedCount} rejected.`,
  }
}

function countBy(rows: RetentionDiagnosticEventRow[], field: keyof RetentionDiagnosticEventRow) {
  const result: Record<string, number> = {}
  for (const row of rows) {
    const key = String(row[field] ?? '').trim() || 'unknown'
    result[key] = (result[key] ?? 0) + 1
  }
  return result
}

function isExpiredEvent(row: RetentionDiagnosticEventRow) {
  if (!row.expires_at) return false
  const expiresAt = new Date(row.expires_at).getTime()
  return Number.isFinite(expiresAt) && expiresAt < Date.now()
}

async function loadRetentionDiagnosticRows(
  limit: number,
  visibleProjectIds?: string[] | null,
): Promise<RetentionDiagnosticEventRow[]> {
  const normalizedProjectIds = normalizeProjectIdList(visibleProjectIds)
  if (normalizedProjectIds?.length === 0) return []

  let query = (supabase as any)
    .from('deletion_retention_events')
    .select('id, project_id, entity_type, execution_status, reason_code, resolved_action, requested_action, expires_at, confirmation_metadata')

  if (normalizedProjectIds) {
    query = query.in('project_id', normalizedProjectIds)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return Array.isArray(data) ? data as RetentionDiagnosticEventRow[] : []
}

export function getRetentionCoverageMatrix() {
  return buildRetentionCoverageMatrix(RETENTION_COVERAGE_MATRIX)
}

function cloneCoverageEntries(entries: RetentionCoverageMatrixEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    referenceChecks: [...entry.referenceChecks],
    primaryConsumers: [...entry.primaryConsumers],
  }))
}

function cloneExecutorEntries(entries: RetentionExecutorRegistryEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    supportedResolvedActions: [...entry.supportedResolvedActions],
  }))
}

function buildRetentionCoverageMatrix(entries: RetentionCoverageMatrixEntry[]) {
  const clonedEntries = cloneCoverageEntries(entries)
  return {
    version: RETENTION_GOVERNANCE_VERSION,
    policy: 'dangerous_actions_must_resolve_to_retained_lifecycle_or_explicit_physical_delete',
    coveredEntityTypes: clonedEntries.map((entry) => entry.entityType),
    entries: clonedEntries,
  }
}

export function getRetentionExecutorRegistry() {
  return buildRetentionExecutorRegistry(RETENTION_EXECUTOR_REGISTRY)
}

function buildRetentionExecutorRegistry(entries: RetentionExecutorRegistryEntry[]) {
  return {
    version: RETENTION_EXECUTOR_REGISTRY_VERSION,
    entries: cloneExecutorEntries(entries),
    summary: {
      totalExecutorCount: entries.length,
      idempotentExecutorCount: entries.filter((entry) => entry.idempotent).length,
      transactionReadyExecutorCount: entries.filter((entry) => entry.transactionReady).length,
      dryRunSupportedCount: entries.filter((entry) => entry.dryRunSupported).length,
    },
  }
}

function buildRetentionGovernanceGaps(
  coverageEntries: RetentionCoverageMatrixEntry[],
  executorEntries: RetentionExecutorRegistryEntry[],
  options: Pick<
    RetentionGovernanceDiagnosticsSyncOptions,
    'routeContracts' | 'routeSourceByFile' | 'frontendConsumerContracts' | 'frontendSourceByFile'
  > = {},
) {
  const executableEntityTypes = new Set(executorEntries.map((entry) => entry.entityType))
  const missingExecutorEntityTypes = coverageEntries
    .filter((entry) => entry.supportsConfirmation && !executableEntityTypes.has(entry.entityType))
    .map((entry) => entry.entityType)
  const routeSourceByFile = options.routeSourceByFile ?? loadDefaultRouteSourceByFile()
  const frontendSourceByFile = options.frontendSourceByFile ?? loadDefaultFrontendSourceByFile()
  const routeContracts = options.routeContracts ?? RETENTION_ROUTE_CONTRACTS
  const frontendConsumerContracts = options.frontendConsumerContracts ?? RETENTION_FRONTEND_CONSUMER_CONTRACTS
  const routeCoverageGaps = routeContracts
    .map((contract) => {
      const source = routeSourceByFile[contract.routeFile] ?? ''
      const missingMarkers = contract.guardMarkers.filter((marker) => !source.includes(marker))
      return missingMarkers.length > 0
        ? { routeFile: contract.routeFile, entityTypes: contract.entityTypes, missingMarkers }
        : null
    })
    .filter((item): item is { routeFile: string; entityTypes: string[]; missingMarkers: string[] } => item !== null)
  const unifiedErrorResponseRouteGaps = routeContracts
    .map((contract) => {
      const source = routeSourceByFile[contract.routeFile] ?? ''
      const hasGuard = contract.guardMarkers.some((marker) => source.includes(marker))
      const missingMarkers = hasGuard && !source.includes(contract.errorBuilderMarker)
        ? [contract.errorBuilderMarker]
        : []
      return missingMarkers.length > 0
        ? { routeFile: contract.routeFile, entityTypes: contract.entityTypes, missingMarkers }
        : null
    })
    .filter((item): item is { routeFile: string; entityTypes: string[]; missingMarkers: string[] } => item !== null)
  const frontendConsumerGaps = frontendConsumerContracts
    .map((contract) => {
      const source = frontendSourceByFile[contract.consumerFile] ?? ''
      const missingMarkers = contract.requiredMarkers.filter((marker) => !source.includes(marker))
      return missingMarkers.length > 0
        ? { consumerFile: contract.consumerFile, missingMarkers }
        : null
    })
    .filter((item): item is { consumerFile: string; missingMarkers: string[] } => item !== null)

  return {
    missingExecutorEntityTypes,
    routeCoverageGaps,
    unifiedErrorResponseRouteGaps,
    frontendConsumerGaps,
  }
}

function readOptionalTextFile(...parts: string[]) {
  const candidates = [
    join(process.cwd(), ...parts),
    join(process.cwd(), '..', ...parts),
  ]
  const filePath = candidates.find(existsSync)
  return filePath ? readFileSync(filePath, 'utf8') : ''
}

function loadDefaultRouteSourceByFile() {
  return Object.fromEntries(
    RETENTION_ROUTE_CONTRACTS.map((contract) => [
      contract.routeFile,
      readOptionalTextFile('src', 'routes', contract.routeFile) ||
        readOptionalTextFile('server', 'src', 'routes', contract.routeFile),
    ]),
  )
}

function loadDefaultFrontendSourceByFile() {
  return Object.fromEntries(
    RETENTION_FRONTEND_CONSUMER_CONTRACTS.map((contract) => [
      contract.consumerFile,
      readOptionalTextFile('client', 'src', 'pages', contract.consumerFile),
    ]),
  )
}

export function getRetentionGovernanceDiagnosticsSync(
  options: RetentionGovernanceDiagnosticsSyncOptions = {},
) {
  const rows = filterRowsByVisibleProjects(options.eventRows ?? [], options.visibleProjectIds)
  const coverageEntries = options.coverageEntries ?? RETENTION_COVERAGE_MATRIX
  const executorEntries = options.executorEntries ?? RETENTION_EXECUTOR_REGISTRY
  const pendingConfirmationCount = rows.filter((row) => row.execution_status === 'pending_confirmation').length
  const rejectedCount = rows.filter((row) => row.execution_status === 'rejected').length
  const executedCount = rows.filter((row) => row.execution_status === 'executed').length
  const confirmingCount = rows.filter((row) => row.execution_status === 'confirming').length
  const failedCount = rows.filter((row) => row.execution_status === 'failed').length
  const nowMs = options.now instanceof Date ? options.now.getTime() : Date.now()
  const staleConfirmingCount = rows.filter((row) => isStaleConfirmingRetentionEvent(row, nowMs)).length
  const expiredCount = rows.filter((row) => row.execution_status === 'expired' || isExpiredEvent(row)).length
  const gaps = buildRetentionGovernanceGaps(coverageEntries, executorEntries, options)
  const operatorAttention = buildRetentionOperatorAttention(rows, nowMs)

  return {
    version: RETENTION_GOVERNANCE_VERSION,
    summary: {
      totalEvents: rows.length,
      pendingConfirmationCount,
      rejectedCount,
      executedCount,
      confirmingCount,
      staleConfirmingCount,
      failedCount,
      expiredCount,
      missingExecutorCount: gaps.missingExecutorEntityTypes.length,
      routeCoverageGapCount: gaps.routeCoverageGaps.length,
      unifiedErrorResponseGapCount: gaps.unifiedErrorResponseRouteGaps.length,
      frontendConsumerGapCount: gaps.frontendConsumerGaps.length,
    },
    byEntityType: countBy(rows, 'entity_type'),
    byReasonCode: countBy(rows, 'reason_code'),
    byResolvedAction: countBy(rows, 'resolved_action'),
    byRequestedAction: countBy(rows, 'requested_action'),
    scope: {
      companyId: options.companyId ?? null,
      visibleProjectScoped: Array.isArray(options.visibleProjectIds),
      visibleProjectCount: normalizeProjectIdList(options.visibleProjectIds)?.length ?? null,
    },
    gaps,
    operatorAttention,
    coverage: buildRetentionCoverageMatrix(coverageEntries),
    executorRegistry: buildRetentionExecutorRegistry(executorEntries),
  }
}

export async function getRetentionGovernanceDiagnostics(
  options: RetentionGovernanceDiagnosticsOptions = {},
) {
  const limit = Math.min(Math.max(Number(options.limit ?? 1000), 1), 10000)
  const rows = options.eventRows ?? await loadRetentionDiagnosticRows(limit, options.visibleProjectIds)
  return getRetentionGovernanceDiagnosticsSync({
    eventRows: rows,
    companyId: options.companyId,
    visibleProjectIds: options.visibleProjectIds,
    routeContracts: options.routeContracts,
    routeSourceByFile: options.routeSourceByFile,
    frontendConsumerContracts: options.frontendConsumerContracts,
    frontendSourceByFile: options.frontendSourceByFile,
    now: options.now,
  })
}

export async function runRetentionGovernedAction(input: RetentionCheckInput) {
  const result = await enforceRetentionOrBlock(input)
  if (result.blocked) {
    return {
      action: input.userAction,
      blocked: true,
      result: result.result,
      error: buildRetentionBlockedApiError(result.reason, result.result),
    }
  }

  return {
    action: input.userAction,
    blocked: false,
    result: result.result,
    error: null,
  }
}

export async function executeRetention(input: RetentionCheckInput): Promise<RetentionCheckResult> {
  const result = await evaluateRetention(input)
  const eventId = randomUUID()
  const now = new Date().toISOString()
  const actorId = input.actorId ?? input.userId ?? null

  const changeLogId = input.projectId
    ? await writeChangeLog({
      projectId: input.projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      actionType: 'retention_decision',
      actionGroup: 'delete',
      changeSource: actorId ? 'user_save' : 'system_auto',
      changedBy: actorId,
      metadata: result.changeSummary,
      requestId: input.requestId ?? undefined,
      visibility: 'internal',
    })
    : null
  if (input.projectId && !changeLogId) {
    throw Object.assign(new Error('RETENTION_CHANGE_AUDIT_WRITE_FAILED'), {
      code: 'RETENTION_CHANGE_AUDIT_WRITE_FAILED',
      statusCode: 503,
    })
  }

  // v1.4.15: generate decisionToken for confirmable decisions
  const decisionToken = result.requiresUserConfirmation ? `${eventId}.${randomUUID().slice(0, 8)}` : null
  const decisionTokenHash = decisionToken ? hashRetentionDecisionToken(decisionToken) : null
  const expiresAt = result.requiresUserConfirmation ? new Date(Date.now() + 7 * 86400000).toISOString() : null // 7 days

  const eventRow = {
    id: eventId,
    project_id: input.projectId ?? null,
    project_name_snapshot: input.projectNameSnapshot ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_name_snapshot: input.entityNameSnapshot ?? null,
    requested_action: result.requestedAction,
    resolved_action: result.resolvedAction,
    requested_allowed: result.requestedAllowed,
    resolved_allowed: result.resolvedAllowed,
    execution_mode: result.executionMode,
    execution_status: result.executionStatus,
    requires_user_confirmation: result.requiresUserConfirmation,
    reason_code: result.reasonCode,
    reference_summary: result.referenceSummary,
    decision_token_hash: decisionTokenHash,
    token_hash_version: decisionTokenHash ? RETENTION_TOKEN_HASH_VERSION : null,
    expires_at: expiresAt,
    affected_entity_ids: result.affectedEntityIds,
    suggested_action: input.suggestedAction ?? result.suggestedAction,
    actor_id: actorId,
    change_log_id: changeLogId,
    operation_log_id: null,
    request_id: input.requestId ?? null,
    confirmed_by: null,
    confirmed_at: null,
    confirmed_action_result: null,
    confirmation_metadata: {},
    executed_at: result.executionStatus === 'executed' ? now : null,
    created_at: now,
  }

  try {
    await query(
      `INSERT INTO public.deletion_retention_events (
         id, project_id, project_name_snapshot, entity_type, entity_id,
         entity_name_snapshot, requested_action, resolved_action,
         requested_allowed, resolved_allowed, execution_mode, execution_status,
         requires_user_confirmation, reason_code, reference_summary,
         decision_token_hash, token_hash_version, expires_at, affected_entity_ids,
         suggested_action, actor_id, change_log_id, operation_log_id, request_id,
         confirmed_by, confirmed_at, confirmed_action_result, confirmation_metadata,
         executed_at, created_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10, $11, $12,
         $13, $14, $15::jsonb,
         $16, $17, $18, $19::jsonb,
         $20::jsonb, $21, $22, $23, $24,
         $25, $26, $27::jsonb, $28::jsonb,
         $29, $30
       )`,
      [
        eventRow.id,
        eventRow.project_id,
        eventRow.project_name_snapshot,
        eventRow.entity_type,
        eventRow.entity_id,
        eventRow.entity_name_snapshot,
        eventRow.requested_action,
        eventRow.resolved_action,
        eventRow.requested_allowed,
        eventRow.resolved_allowed,
        eventRow.execution_mode,
        eventRow.execution_status,
        eventRow.requires_user_confirmation,
        eventRow.reason_code,
        JSON.stringify(eventRow.reference_summary),
        eventRow.decision_token_hash,
        eventRow.token_hash_version,
        eventRow.expires_at,
        JSON.stringify(eventRow.affected_entity_ids),
        JSON.stringify(eventRow.suggested_action),
        eventRow.actor_id,
        eventRow.change_log_id,
        eventRow.operation_log_id,
        eventRow.request_id,
        eventRow.confirmed_by,
        eventRow.confirmed_at,
        JSON.stringify(eventRow.confirmed_action_result),
        JSON.stringify(eventRow.confirmation_metadata),
        eventRow.executed_at,
        eventRow.created_at,
      ],
    )
  } catch (error) {
    logger.error('Failed to write retention event', { error, input, result })
    throw error
  }

  logger.info('Retention decision', {
    entityType: input.entityType,
    entityId: input.entityId,
    requestedAction: result.requestedAction,
    resolvedAction: result.resolvedAction,
    executionMode: result.executionMode,
  })

  return {
    ...result,
    decisionToken: decisionToken ?? undefined,
    expiresAt: expiresAt ?? undefined,
  }
}

export async function confirmRetentionDecision(
  input: ConfirmRetentionDecisionInput,
): Promise<ConfirmRetentionDecisionResult> {
  const projectId = String(input.projectId ?? '').trim()
  const decisionToken = String(input.decisionToken ?? '').trim()
  if (!projectId || !decisionToken) {
    throw new Error('RETENTION_DECISION_TOKEN_REQUIRED')
  }

  const decisionTokenHash = hashRetentionDecisionToken(decisionToken)
  const { data: event, error } = await (supabase as any)
    .from('deletion_retention_events')
    .select('*')
    .eq('project_id', projectId)
    .eq('decision_token_hash', decisionTokenHash)
    .maybeSingle()

  if (error) throw error
  if (!event) throw new Error('RETENTION_DECISION_NOT_FOUND')

  const eventActorId = String(event.actor_id ?? '').trim()
  const confirmingActorId = String(input.actorId ?? '').trim()
  if (eventActorId && confirmingActorId && eventActorId !== confirmingActorId) {
    throw new Error('RETENTION_DECISION_ACTOR_MISMATCH')
  }

  if (event.execution_status === 'executed' && event.requires_user_confirmation === true) {
    return {
      eventId: event.id,
      projectId: event.project_id ?? null,
      entityType: event.entity_type,
      entityId: event.entity_id,
      requestedAction: event.requested_action,
      resolvedAction: event.resolved_action,
      executionStatus: event.execution_status,
      confirmedAt: event.confirmed_at,
      expiresAt: event.expires_at ?? null,
      actionResult: {
        ...(event.confirmed_action_result ?? {}),
        idempotent: true,
      },
    }
  }

  if (
    !['pending_confirmation', 'confirming'].includes(String(event.execution_status ?? '')) ||
    event.requires_user_confirmation !== true
  ) {
    throw new Error('RETENTION_DECISION_NOT_CONFIRMABLE')
  }

  const now = new Date().toISOString()
  if (isFreshConfirmingRetentionEvent(event)) {
    throw new Error('RETENTION_DECISION_CONFIRMING')
  }
  const eventMetadata = getObjectRecord(event.confirmation_metadata)
  const recoveryAttemptCount = getRecoveryAttemptCount(eventMetadata)

  if (event.expires_at && new Date(String(event.expires_at)).getTime() < Date.now()) {
    await (supabase as any)
      .from('deletion_retention_events')
      .update({ execution_status: 'expired', expired_at: now })
      .eq('id', event.id)
      .eq('project_id', projectId)
    throw new Error('ENTITY_RETENTION_DECISION_EXPIRED')
  }

  const recoveredFromConfirming = event.execution_status === 'confirming'
  if (recoveredFromConfirming && recoveryAttemptCount >= RETENTION_CONFIRMING_MAX_RECOVERY_ATTEMPTS) {
    await (supabase as any)
      .from('deletion_retention_events')
      .update({
        execution_status: 'failed',
        confirmation_metadata: {
          ...eventMetadata,
          actor_id: input.actorId ?? null,
          last_error_code: 'RETENTION_DECISION_RECOVERY_LIMIT_EXCEEDED',
          last_error_message: 'Retention confirmation recovery limit exceeded.',
          recovery_attempts: recoveryAttemptCount,
          failed_at: now,
        },
      })
      .eq('id', event.id)
      .eq('project_id', projectId)
    throw new Error('RETENTION_DECISION_RECOVERY_LIMIT_EXCEEDED')
  }

  const freshDecision = await evaluateRetention({
    projectId,
    entityType: String(event.entity_type ?? ''),
    entityId: String(event.entity_id ?? ''),
    entityNameSnapshot: event.entity_name_snapshot ?? null,
    projectNameSnapshot: event.project_name_snapshot ?? null,
    userAction: toRetentionRequestedAction(event.requested_action),
    actorId: input.actorId ?? null,
    requestId: event.request_id ?? null,
    suggestedAction: event.suggested_action ?? {},
  })

  const previousRefs = stableReferenceSignature(event.reference_summary ?? {})
  const freshRefs = stableReferenceSignature(freshDecision.referenceSummary ?? {})
  if (
    previousRefs !== freshRefs ||
    freshDecision.resolvedAction !== event.resolved_action ||
    freshDecision.executionMode !== 'require_user_confirm'
  ) {
    await (supabase as any)
      .from('deletion_retention_events')
      .update({ execution_status: 'expired', expired_at: now })
      .eq('id', event.id)
      .eq('project_id', projectId)
    throw new Error('ENTITY_RETENTION_DECISION_EXPIRED')
  }

  if (!recoveredFromConfirming) {
    const { data: reserved, error: reserveError } = await (supabase as any)
      .from('deletion_retention_events')
      .update({
        execution_status: 'confirming',
        confirmation_metadata: {
          ...(event.confirmation_metadata ?? {}),
          actor_id: input.actorId ?? null,
          reserved_at: now,
          refs_signature_before: previousRefs,
          refs_signature_after: freshRefs,
          token_hash_version: RETENTION_TOKEN_HASH_VERSION,
        },
      })
      .eq('id', event.id)
      .eq('project_id', projectId)
      .eq('execution_status', 'pending_confirmation')
      .select('id')
      .maybeSingle()

    if (reserveError) throw reserveError
    if (!reserved) {
      const { data: latest, error: latestError } = await (supabase as any)
        .from('deletion_retention_events')
        .select('*')
        .eq('project_id', projectId)
        .eq('decision_token_hash', decisionTokenHash)
        .maybeSingle()
      if (latestError) throw latestError
      if (latest?.execution_status === 'executed') {
        return {
          eventId: latest.id,
          projectId: latest.project_id ?? null,
          entityType: latest.entity_type,
          entityId: latest.entity_id,
          requestedAction: latest.requested_action,
          resolvedAction: latest.resolved_action,
          executionStatus: latest.execution_status,
          confirmedAt: latest.confirmed_at,
          expiresAt: latest.expires_at ?? null,
          actionResult: {
            ...(latest.confirmed_action_result ?? {}),
            idempotent: true,
          },
        }
      }
      throw new Error('RETENTION_DECISION_NOT_CONFIRMABLE')
    }
  }

  const nextRecoveryAttempts = recoveredFromConfirming ? recoveryAttemptCount + 1 : 0
  let actionResult: Record<string, unknown>
  try {
    actionResult = await executeConfirmedRetentionAction(event, input.actorId ?? null)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown retention executor error')
    await (supabase as any)
      .from('deletion_retention_events')
      .update({
        execution_status: 'failed',
        confirmation_metadata: {
          ...eventMetadata,
          actor_id: input.actorId ?? null,
          request_id: event.request_id ?? null,
          last_error_code: 'CONFIRMED_RETENTION_ACTION_FAILED',
          last_error_message: errorMessage,
          recovery_attempts: nextRecoveryAttempts,
          failed_at: now,
        },
      })
      .eq('id', event.id)
      .eq('project_id', projectId)
    throw error
  }
  const confirmationMetadata = {
    ...eventMetadata,
    actor_id: input.actorId ?? null,
    request_id: event.request_id ?? null,
    confirmed_at: now,
    refs_signature_before: previousRefs,
    refs_signature_after: freshRefs,
    recovered_from_confirming: recoveredFromConfirming,
    recovery_attempts: nextRecoveryAttempts,
    token_hash_version: RETENTION_TOKEN_HASH_VERSION,
  }

  const { data: updated, error: updateError } = await (supabase as any)
    .from('deletion_retention_events')
    .update({
      execution_status: 'executed',
      confirmed_by: input.actorId ?? null,
      confirmed_at: now,
      executed_at: now,
      confirmed_action_result: actionResult,
      confirmation_metadata: confirmationMetadata,
    })
    .eq('id', event.id)
    .eq('project_id', projectId)
    .eq('execution_status', 'confirming')
    .select('id, project_id, entity_type, entity_id, requested_action, resolved_action, execution_status, confirmed_at, expires_at, confirmed_action_result')
    .maybeSingle()

  if (updateError) throw updateError
  if (!updated) throw new Error('RETENTION_DECISION_NOT_CONFIRMABLE')

  return {
    eventId: updated.id,
    projectId: updated.project_id ?? null,
    entityType: updated.entity_type,
    entityId: updated.entity_id,
    requestedAction: updated.requested_action,
    resolvedAction: updated.resolved_action,
    executionStatus: updated.execution_status,
    confirmedAt: updated.confirmed_at,
    expiresAt: updated.expires_at ?? null,
    actionResult: updated.confirmed_action_result ?? actionResult,
  }
}

// v1.4.15: blocking helper — evaluate and block if retention says reject
export async function resolveRetentionOperatorAttention(input: ResolveRetentionOperatorAttentionInput) {
  const projectId = String(input.projectId ?? '').trim()
  const eventId = String(input.eventId ?? '').trim()
  const action = input.action
  if (!projectId || !eventId) {
    throw new Error('RETENTION_OPERATOR_ACTION_TARGET_REQUIRED')
  }
  if (!['mark_handled', 'retry_requested'].includes(action)) {
    throw new Error('RETENTION_OPERATOR_ACTION_UNSUPPORTED')
  }

  const { data: existing, error: existingError } = await (supabase as any)
    .from('deletion_retention_events')
    .select('id, project_id, execution_status, confirmation_metadata')
    .eq('id', eventId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new Error('RETENTION_OPERATOR_ACTION_TARGET_NOT_FOUND')

  const existingStatus = String(existing.execution_status ?? '').trim()
  const existingMetadata = getObjectRecord(existing.confirmation_metadata)
  const attentionStatus = existingStatus === 'failed' || isStaleConfirmingRetentionEvent({
    execution_status: existingStatus,
    confirmation_metadata: existingMetadata,
  })
  if (!attentionStatus) {
    throw new Error('RETENTION_OPERATOR_ACTION_NOT_ATTENTION_STATUS')
  }

  const now = new Date().toISOString()
  const operatorMetadata = {
    ...existingMetadata,
    operator_action: action,
    operator_status: action === 'mark_handled' ? 'handled' : 'retry_requested',
    operator_note: input.note ?? null,
    operator_actor_id: input.actorId ?? null,
    operator_action_at: now,
  }
  const executionStatus = action === 'mark_handled' ? 'cancelled_by_user' : 'failed'

  const { data, error } = await (supabase as any)
    .from('deletion_retention_events')
    .update({
      execution_status: executionStatus,
      confirmation_metadata: operatorMetadata,
    })
    .eq('id', eventId)
    .eq('project_id', projectId)
    .select('id, project_id, execution_status, confirmation_metadata')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('RETENTION_OPERATOR_ACTION_TARGET_NOT_FOUND')

  return {
    eventId: data.id,
    projectId: data.project_id ?? null,
    action,
    executionStatus: data.execution_status,
    confirmationMetadata: data.confirmation_metadata ?? operatorMetadata,
  }
}

export async function expirePendingRetentionDecisions(now: Date = new Date()) {
  const cutoff = now.toISOString()
  const { data, error } = await (supabase as any)
    .from('deletion_retention_events')
    .update({
      execution_status: 'expired',
      expired_at: cutoff,
    })
    .eq('execution_status', 'pending_confirmation')
    .lt('expires_at', cutoff)
    .select('id')

  if (error) throw error
  return {
    expired: Array.isArray(data) ? data.length : 0,
    cutoff,
  }
}

function shouldBlockRequestedAction(input: RetentionCheckInput, result: RetentionCheckResult) {
  if (result.executionMode === 'reject') return true
  if (result.requiresUserConfirmation) return true
  if (input.userAction === 'delete') {
    return result.resolvedAction !== 'physical_delete' || result.executionMode !== 'auto_execute'
  }
  return false
}

export async function enforceRetentionOrBlock(
  input: RetentionCheckInput,
): Promise<{ blocked: boolean; reason: string; result: RetentionCheckResult }> {
  const result = await executeRetention(input)
  if (shouldBlockRequestedAction(input, result)) {
    return { blocked: true, reason: result.reason, result }
  }
  return { blocked: false, reason: '', result }
}

export function buildRetentionBlockedHttpStatus(result: Pick<RetentionCheckResult, 'requiresUserConfirmation'> | Record<string, unknown>) {
  return result.requiresUserConfirmation === true ? 409 : 422
}

export function buildRetentionBlockedApiError(
  reason: string,
  result: RetentionCheckResult,
  options: { details?: unknown } = {},
) {
  return {
    code: result.requiresUserConfirmation ? 'RETENTION_CONFIRMATION_REQUIRED' : 'RETENTION_REJECTED',
    message: reason || result.reason,
    details: options.details ?? result,
  }
}

export function createRetentionConfirmationTransactionPlan(input: RetentionConfirmationTransactionPlanInput) {
  return {
    eventId: input.eventId,
    projectId: input.projectId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    resolvedAction: input.resolvedAction,
    atomicity: 'planned_transaction_boundary',
    recommendedBoundary: 'reserve decision event, execute domain lifecycle action, and persist confirmation audit in one database transaction when a domain executor supports transactional clients.',
    steps: [
      'reserve_decision_event',
      'execute_domain_lifecycle_action',
      'persist_confirmation_audit',
    ],
  }
}

export function createRetentionConfirmationTransactionBoundary(input: RetentionConfirmationTransactionPlanInput) {
  const entityType = String(input.entityType ?? '').trim()
  const executor = getExecutorEntry(entityType)
  const plan = createRetentionConfirmationTransactionPlan(input)
  return {
    boundaryId: 'retention_confirmation_transaction_boundary',
    ...plan,
    transactionReady: Boolean(executor?.transactionReady),
    requiresTransactionClient: true,
    canExecuteAtomically: Boolean(executor?.transactionReady),
    executorRegistered: Boolean(executor),
    executorTransactionMode: executor?.transactionMode ?? 'planned_transaction_boundary',
    executorIdempotent: executor?.idempotent ?? false,
    dryRunSupported: executor?.dryRunSupported ?? false,
    executorEffect: executor?.effect ?? null,
  }
}

export async function executeRetentionConfirmationTransactionBoundary(
  input: ExecuteRetentionConfirmationTransactionBoundaryInput,
) {
  const boundary = createRetentionConfirmationTransactionBoundary(input)
  const transactionClient = input.transactionClient ?? null
  if (!transactionClient) {
    return {
      ...boundary,
      transactionReady: false,
      executedAtomically: false,
      skippedReason: 'transaction_client_required',
      results: null,
    }
  }

  const reserveDecisionEvent = await transactionClient.reserveDecisionEvent(input)
  const executeDomainLifecycleAction = await transactionClient.executeDomainLifecycleAction(input)
  const persistConfirmationAudit = await transactionClient.persistConfirmationAudit({
    ...input,
    actionResult: executeDomainLifecycleAction,
  })

  return {
    ...boundary,
    transactionReady: true,
    canExecuteAtomically: true,
    executedAtomically: true,
    results: {
      reserveDecisionEvent,
      executeDomainLifecycleAction,
      persistConfirmationAudit,
    },
  }
}
