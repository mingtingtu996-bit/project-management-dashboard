import type { T2RhythmReleaseClosureArtifact } from '../scripts/generate-t2-rhythm-release-closure.js'
import type { T2RhythmReleaseClosureArtifactVerification } from '../scripts/verify-t2-rhythm-release-closure-artifact.js'
import type {
  T2RhythmScheduleCandidateNetworkEdge,
  T2RhythmScheduleCandidateNetworkNode,
} from './t2RhythmScheduleCandidateNetworkService.js'
import type {
  T2RhythmScheduleCandidateNetworkPhase1Evaluation,
} from './t2RhythmScheduleCandidateNetworkEvaluationService.js'
import type { ProductionMigrationGovernanceReport } from './migrationProductionGovernanceService.js'

export type T2RhythmScheduleRuntimePublicationQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type T2RhythmScheduleRuntimeTaskMapping = {
  nodeId: string
  taskId: string
}

export type T2RhythmScheduleRuntimePublicationApproval = {
  approved: boolean
  approvalMode: 'manual_governance_approval' | 'guarded_runtime_auto_publish'
  approvedByUserId?: string | null
  approvalEvidenceRefs: string[]
  canWriteTaskDependencies: boolean
  canWritePlanDates: boolean
  rollbackTarget: string
  consumerVerificationRefs: string[]
  impactMonitoringRefs: string[]
}

export type T2RhythmScheduleRuntimeAppliedDependency = {
  edgeId: string
  taskId: string
  dependencyTaskId: string
  dependencyType: 'FS' | 'SS' | 'FF'
  lagDays: number
  sourceType: 't2_rhythm_schedule_runtime'
  sourceRefId: string | null
  sourceEventId: string
  predecessorWindowCode: string
  successorWindowCode: string
}

export type T2RhythmScheduleRuntimeAppliedPlanPatch = {
  nodeId: string
  taskId: string
  windowCode: string
  plannedStartDate: string
  plannedEndDate: string
  previousPlannedStartDate: string | null
  previousPlannedEndDate: string | null
  previousStartDate: string | null
  previousEndDate: string | null
}

export type ApplyT2RhythmScheduleRuntimePublicationInput = {
  artifact?: T2RhythmReleaseClosureArtifact | null
  verification?: T2RhythmReleaseClosureArtifactVerification | null
  evaluation?: T2RhythmScheduleCandidateNetworkPhase1Evaluation | null
  networkEdges?: T2RhythmScheduleCandidateNetworkEdge[]
  networkNodes?: T2RhythmScheduleCandidateNetworkNode[]
  taskMappings?: T2RhythmScheduleRuntimeTaskMapping[]
  projectStartDate?: string | null
  companyId?: string | null
  projectId?: string | null
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  approval?: T2RhythmScheduleRuntimePublicationApproval | null
  productionMigrationGovernanceReport?: ProductionMigrationGovernanceReport | null
  executedAt?: string | null
}

export type ApplyT2RhythmScheduleRuntimePublicationResult = {
  source: 't2_rhythm_schedule_runtime_publication_service'
  status: 'runtime_apply_ready' | 'runtime_apply_blocked'
  publicationKey: string | null
  selectedTemplateIds: string[]
  sourceEvidenceRefs: string[]
  runtimeCallEvidenceRefs: string[]
  canAutoPublishRuntimeExperience: boolean
  canMaterializeTaskDependencies: boolean
  canWritePlanDates: boolean
  insertedDependencyCount: number
  skippedDependencyCount: number
  patchedPlanDateCount: number
  releaseRecordPersisted: boolean
  appliedDependencies: T2RhythmScheduleRuntimeAppliedDependency[]
  appliedPlanDatePatches: T2RhythmScheduleRuntimeAppliedPlanPatch[]
  rollbackTarget: string | null
  writesTaskDependencies: boolean
  writesPlanDates: boolean
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  reasons: string[]
  boundaryPolicy: string[]
}

export type T2RhythmScheduleRuntimeEventType =
  | 'schedule_runtime_apply'
  | 'rollback_execution'
  | 'impact_monitoring'

export type RecordT2RhythmScheduleRuntimeImpactMonitoringInput = {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  publicationKey?: string | null
  eventStatus?: string | null
  eventPayload?: Record<string, unknown> | null
  productionMigrationGovernanceReport?: ProductionMigrationGovernanceReport | null
  executedAt?: string | null
}

export type RecordT2RhythmScheduleRuntimeEventResult = {
  source: 't2_rhythm_schedule_runtime_publication_service'
  status: 'runtime_event_recorded' | 'runtime_event_blocked'
  eventType: T2RhythmScheduleRuntimeEventType | null
  eventStatus: string | null
  sourcePublicationKey: string | null
  eventPersisted: boolean
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  reasons: string[]
  boundaryPolicy: string[]
}

export type RollbackT2RhythmScheduleRuntimePublicationInput = {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  projectId: string
  publicationKey?: string | null
  rollbackReason?: string | null
  rollbackEvidenceRefs?: string[]
  executedByUserId?: string | null
  productionMigrationGovernanceReport?: ProductionMigrationGovernanceReport | null
  executedAt?: string | null
}

export type RollbackT2RhythmScheduleRuntimePublicationResult = {
  source: 't2_rhythm_schedule_runtime_publication_service'
  status: 'runtime_rollback_ready' | 'runtime_rollback_blocked'
  publicationKey: string | null
  dependencyRollbackCount: number
  planDateRollbackCount: number
  releaseRecordRolledBack: boolean
  rollbackEventPersisted: boolean
  writesTaskDependencies: boolean
  writesPlanDates: boolean
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  reasons: string[]
  boundaryPolicy: string[]
}

const SOURCE_TYPE = 't2_rhythm_schedule_runtime' as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function normalizeRecordStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key]
  if (!Array.isArray(value)) return []
  return unique(value.filter((item): item is string => typeof item === 'string'))
}

function uuidOrNull(value: unknown) {
  const text = normalizeText(value)
  return UUID_PATTERN.test(text) ? text : null
}

function boundaryPolicy() {
  return [
    't2_schedule_runtime_writer_requires_verified_release_closure_artifact',
    't2_schedule_runtime_writer_requires_production_migration_governance_mg07_closeout',
    't2_schedule_runtime_writer_requires_explicit_manual_governance_approval_for_final_runtime_apply',
    't2_schedule_runtime_writer_materializes_only_t2_source_dependencies',
    't2_schedule_runtime_writer_updates_plan_dates_only_for_mapped_t2_nodes',
    't2_schedule_runtime_writer_records_rollback_snapshots_before_plan_date_patch',
    't2_schedule_runtime_writer_does_not_write_seed_baseline_or_critical_path_facts',
  ]
}

function validateProductionMigrationGovernanceForRuntimeWrites(
  report: ProductionMigrationGovernanceReport | null | undefined,
) {
  const reasons: string[] = []
  const mg07 = report?.gates.find((gate) => gate.id === 'MG-07')

  if (!report || report.status !== 'closed' || mg07?.status !== 'pass') {
    reasons.push('production_migration_governance_closed_evidence_required')
  }
  if (report && report.allowScheduler !== true) {
    reasons.push('production_migration_governance_runtime_writes_not_allowed')
  }

  return unique(reasons)
}

function runtimeCallEvidenceRefs(input: {
  approval?: T2RhythmScheduleRuntimePublicationApproval | null
  eventPayload?: Record<string, unknown> | null
}) {
  return unique([
    ...(input.approval?.approvalEvidenceRefs ?? []),
    ...(input.approval?.consumerVerificationRefs ?? []),
    ...(input.approval?.impactMonitoringRefs ?? []),
    normalizeText(input.approval?.rollbackTarget),
    ...normalizeRecordStringArray(input.eventPayload, 'runtimeCallEvidenceRefs'),
  ])
}

function blocked(input: {
  artifact?: T2RhythmReleaseClosureArtifact | null
  approval?: T2RhythmScheduleRuntimePublicationApproval | null
  reasons: string[]
}): ApplyT2RhythmScheduleRuntimePublicationResult {
  const sourceEvidenceRefs = unique(input.artifact?.sourceEvidenceRefs ?? [])
  const runtimeCallEvidenceRefsValue = runtimeCallEvidenceRefs({ approval: input.approval })
  return {
    source: 't2_rhythm_schedule_runtime_publication_service',
    status: 'runtime_apply_blocked',
    publicationKey: null,
    selectedTemplateIds: input.artifact?.report?.selectedTemplateIds ?? [],
    sourceEvidenceRefs,
    runtimeCallEvidenceRefs: runtimeCallEvidenceRefsValue,
    canAutoPublishRuntimeExperience: false,
    canMaterializeTaskDependencies: false,
    canWritePlanDates: false,
    insertedDependencyCount: 0,
    skippedDependencyCount: 0,
    patchedPlanDateCount: 0,
    releaseRecordPersisted: false,
    appliedDependencies: [],
    appliedPlanDatePatches: [],
    rollbackTarget: normalizeText(input.approval?.rollbackTarget) || null,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    reasons: unique(input.reasons),
    boundaryPolicy: boundaryPolicy(),
  }
}

function eventBlocked(input: {
  eventType: T2RhythmScheduleRuntimeEventType | null
  eventStatus: string | null
  publicationKey: string | null
  reasons: string[]
}): RecordT2RhythmScheduleRuntimeEventResult {
  return {
    source: 't2_rhythm_schedule_runtime_publication_service',
    status: 'runtime_event_blocked',
    eventType: input.eventType,
    eventStatus: input.eventStatus,
    sourcePublicationKey: input.publicationKey,
    eventPersisted: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    reasons: unique(input.reasons),
    boundaryPolicy: boundaryPolicy(),
  }
}

function rollbackBlocked(input: {
  publicationKey: string | null
  reasons: string[]
}): RollbackT2RhythmScheduleRuntimePublicationResult {
  return {
    source: 't2_rhythm_schedule_runtime_publication_service',
    status: 'runtime_rollback_blocked',
    publicationKey: input.publicationKey,
    dependencyRollbackCount: 0,
    planDateRollbackCount: 0,
    releaseRecordRolledBack: false,
    rollbackEventPersisted: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    reasons: unique(input.reasons),
    boundaryPolicy: boundaryPolicy(),
  }
}

function validateInput(input: ApplyT2RhythmScheduleRuntimePublicationInput) {
  const reasons: string[] = []
  const artifact = input.artifact ?? null
  const verification = input.verification ?? null
  const evaluation = input.evaluation ?? null
  const approval = input.approval ?? null
  if (!artifact) reasons.push('release_closure_artifact_required')
  if (!verification) reasons.push('release_closure_verification_required')
  if (!evaluation) reasons.push('phase1_network_evaluation_required')
  if (!approval) reasons.push('runtime_publication_approval_required')

  if (artifact && artifact.status !== 'manual_publication_candidate_ready') {
    reasons.push('release_closure_artifact_not_ready')
  }
  if (verification && verification.status !== 'pass') {
    reasons.push('release_closure_artifact_verification_not_passed')
  }
  if (evaluation && evaluation.status !== 'phase1_readonly_evaluation_ready') {
    reasons.push('phase1_network_evaluation_not_ready')
  }
  if (evaluation && evaluation.phase1PublicationGate.status !== 'canary_handoff_ready_not_published') {
    reasons.push('l5_canary_handoff_required_before_runtime_publication')
  }
  if (artifact && evaluation) {
    const expected = new Set(artifact.report.selectedTemplateIds)
    const actual = new Set(evaluation.standardLibraryReadiness.releaseEvidenceClosure?.selectedTemplateIds ?? [])
    const covers = expected.size > 0 && Array.from(expected).every((templateId) => actual.has(templateId))
    if (!covers) reasons.push('runtime_publication_template_scope_mismatch')
  }
  if (approval && !approval.approved) reasons.push('runtime_publication_approval_not_granted')
  if (approval && approval.approvalMode !== 'manual_governance_approval') {
    reasons.push('manual_runtime_publication_approval_required')
  }
  if (approval && !approval.canWriteTaskDependencies) reasons.push('runtime_dependency_write_approval_required')
  if (approval && !approval.canWritePlanDates) reasons.push('runtime_plan_date_write_approval_required')
  if (approval && approval.approvalEvidenceRefs.length === 0) reasons.push('runtime_publication_approval_evidence_required')
  if (approval && !normalizeText(approval.rollbackTarget)) reasons.push('runtime_publication_rollback_target_required')
  if (approval && approval.consumerVerificationRefs.length === 0) reasons.push('runtime_consumer_verification_evidence_required')
  if (approval && approval.impactMonitoringRefs.length === 0) reasons.push('runtime_impact_monitoring_evidence_required')
  if ((artifact?.sourceEvidenceRefs ?? []).length === 0) reasons.push('runtime_publication_source_evidence_required')
  if (!normalizeText(input.projectId)) reasons.push('project_id_required')
  if (!normalizeText(input.projectStartDate)) reasons.push('project_start_date_required')
  if ((input.taskMappings ?? []).length === 0) reasons.push('task_mapping_required')
  if ((input.networkEdges ?? []).length === 0) reasons.push('network_edges_required')
  if ((input.networkNodes ?? []).length === 0) reasons.push('network_nodes_required')
  return unique(reasons)
}

function mappingByNodeId(mappings: T2RhythmScheduleRuntimeTaskMapping[]) {
  return new Map(mappings.map((mapping) => [normalizeText(mapping.nodeId), normalizeText(mapping.taskId)]))
}

function taskDateRowsById(rows: Record<string, unknown>[]) {
  return new Map(rows.map((row) => [normalizeText(row.id), row]))
}

function isoDatePlusDays(startDate: string, offsetDays: number) {
  const parsed = new Date(`${startDate}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + offsetDays)
  return parsed.toISOString().slice(0, 10)
}

function buildDependency(
  edge: T2RhythmScheduleCandidateNetworkEdge,
  taskByNodeId: Map<string, string>,
  sourceEventId: string,
) {
  const dependencyTaskId = taskByNodeId.get(normalizeText(edge.predecessorNodeId))
  const taskId = taskByNodeId.get(normalizeText(edge.successorNodeId))
  if (!dependencyTaskId || !taskId) return null
  return {
    edgeId: normalizeText(edge.edgeId),
    taskId,
    dependencyTaskId,
    dependencyType: edge.relation,
    lagDays: Math.trunc(Number(edge.lagDays) || 0),
    sourceType: SOURCE_TYPE,
    sourceRefId: uuidOrNull(sourceEventId),
    sourceEventId,
    predecessorWindowCode: edge.predecessorWindowCode,
    successorWindowCode: edge.successorWindowCode,
  } satisfies T2RhythmScheduleRuntimeAppliedDependency
}

function buildPlanPatch(input: {
  node: T2RhythmScheduleCandidateNetworkNode
  taskId: string
  taskRow?: Record<string, unknown>
  projectStartDate: string
}) {
  return {
    nodeId: input.node.nodeId,
    taskId: input.taskId,
    windowCode: input.node.windowCode,
    plannedStartDate: isoDatePlusDays(input.projectStartDate, Math.max(0, Math.trunc(input.node.startDay) - 1)),
    plannedEndDate: isoDatePlusDays(input.projectStartDate, Math.max(0, Math.trunc(input.node.finishDay) - 1)),
    previousPlannedStartDate: normalizeText(input.taskRow?.planned_start_date) || null,
    previousPlannedEndDate: normalizeText(input.taskRow?.planned_end_date) || null,
    previousStartDate: normalizeText(input.taskRow?.start_date) || null,
    previousEndDate: normalizeText(input.taskRow?.end_date) || null,
  } satisfies T2RhythmScheduleRuntimeAppliedPlanPatch
}

async function upsertDependency(input: {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  projectId: string
  dependency: T2RhythmScheduleRuntimeAppliedDependency
  publicationKey: string
  executedAt: string
}) {
  const rows = await input.queryExec(
    `INSERT INTO public.task_dependencies (
       project_id,
       task_id,
       dependency_task_id,
       dependency_type,
       lag_days,
       required_for_start,
       source_type,
       source_ref_id,
       inference_confidence,
       inference_reason,
       metadata,
       status,
       created_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, true, $6, $7, 'high', $8, $9::jsonb, 'active', $10::timestamptz, $10::timestamptz
     )
     ON CONFLICT (project_id, task_id, dependency_task_id, dependency_type)
     WHERE status = 'active'
     DO UPDATE SET
       lag_days = EXCLUDED.lag_days,
       required_for_start = EXCLUDED.required_for_start,
       source_type = EXCLUDED.source_type,
       source_ref_id = EXCLUDED.source_ref_id,
       inference_confidence = EXCLUDED.inference_confidence,
       inference_reason = EXCLUDED.inference_reason,
       metadata = EXCLUDED.metadata,
       updated_at = EXCLUDED.updated_at
      WHERE public.task_dependencies.source_type = 't2_rhythm_schedule_runtime'
     RETURNING id`,
    [
      input.projectId,
      input.dependency.taskId,
      input.dependency.dependencyTaskId,
      input.dependency.dependencyType,
      input.dependency.lagDays,
      input.dependency.sourceType,
      input.dependency.sourceRefId,
      'T2 rhythm schedule runtime dependency edge',
      JSON.stringify({
        source: 't2_rhythm_schedule_runtime_publication_service',
        publicationKey: input.publicationKey,
        releaseHandoffCandidateEventId: input.dependency.sourceEventId,
        edgeId: input.dependency.edgeId,
        predecessorWindowCode: input.dependency.predecessorWindowCode,
        successorWindowCode: input.dependency.successorWindowCode,
      }),
      input.executedAt,
    ],
  )
  return rows.length > 0
}

async function patchPlanDates(input: {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  projectId: string
  patch: T2RhythmScheduleRuntimeAppliedPlanPatch
  publicationKey: string
  executedAt: string
}) {
  const rows = await input.queryExec(
    `UPDATE public.tasks
        SET planned_start_date = $3::date,
            planned_end_date = $4::date,
            start_date = $3::date,
            end_date = $4::date,
            standard_task_metadata = COALESCE(standard_task_metadata, '{}'::jsonb)
              || $5::jsonb,
            updated_at = $6::timestamptz
      WHERE project_id = $1
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id`,
    [
      input.projectId,
      input.patch.taskId,
      input.patch.plannedStartDate,
      input.patch.plannedEndDate,
      JSON.stringify({
        t2RhythmRuntimePublication: {
          publicationKey: input.publicationKey,
          nodeId: input.patch.nodeId,
          windowCode: input.patch.windowCode,
        },
      }),
      input.executedAt,
    ],
  )
  return rows.length > 0
}

async function loadCurrentTaskRows(input: {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  projectId: string
  taskIds: string[]
}) {
  if (input.taskIds.length === 0) return []
  return input.queryExec<Record<string, unknown>>(
    `SELECT id, planned_start_date, planned_end_date, start_date, end_date
       FROM public.tasks
      WHERE project_id = $1
        AND id = ANY($2::uuid[])
        AND deleted_at IS NULL`,
    [input.projectId, input.taskIds],
  )
}

async function persistReleaseRecord(input: {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  publicationKey: string
  companyId: string | null
  projectId: string
  artifact: T2RhythmReleaseClosureArtifact
  verification: T2RhythmReleaseClosureArtifactVerification
  evaluation: T2RhythmScheduleCandidateNetworkPhase1Evaluation
  approval: T2RhythmScheduleRuntimePublicationApproval
  dependencies: T2RhythmScheduleRuntimeAppliedDependency[]
  planPatches: T2RhythmScheduleRuntimeAppliedPlanPatch[]
  sourceEvidenceRefs: string[]
  runtimeCallEvidenceRefs: string[]
  executedAt: string
}) {
  await input.queryExec(
    `INSERT INTO public.t2_rhythm_schedule_runtime_publications (
       publication_key,
       company_id,
       project_id,
       candidate_id,
       selected_template_ids,
       release_artifact,
       release_artifact_verification,
       approval_payload,
       runtime_publication_status,
       applied_dependency_count,
       applied_plan_date_patch_count,
       applied_dependency_edges,
       applied_plan_date_patches,
       release_lineage,
       rollback_target,
       record_visibility_policy,
       published_by_user_id,
       published_at
     ) VALUES (
       $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, 'runtime_published',
       $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, 'backend_admin_governance_only',
       $15, $16::timestamptz
     )
     ON CONFLICT (publication_key)
     DO UPDATE SET
       runtime_publication_status = 'runtime_published',
       applied_dependency_count = EXCLUDED.applied_dependency_count,
       applied_plan_date_patch_count = EXCLUDED.applied_plan_date_patch_count,
       applied_dependency_edges = EXCLUDED.applied_dependency_edges,
       applied_plan_date_patches = EXCLUDED.applied_plan_date_patches,
       release_lineage = EXCLUDED.release_lineage,
       rollback_target = EXCLUDED.rollback_target,
       published_by_user_id = EXCLUDED.published_by_user_id,
       published_at = EXCLUDED.published_at
     RETURNING id`,
    [
      input.publicationKey,
      input.companyId,
      input.projectId,
      input.evaluation.candidateId,
      JSON.stringify(input.artifact.report.selectedTemplateIds),
      JSON.stringify(input.artifact),
      JSON.stringify(input.verification),
      JSON.stringify(input.approval),
      input.dependencies.length,
      input.planPatches.length,
      JSON.stringify(input.dependencies),
      JSON.stringify(input.planPatches),
      JSON.stringify({
        source: 't2_rhythm_schedule_runtime_publication_service',
        artifactCode: input.artifact.artifactCode,
        verificationCode: input.verification.verificationCode,
        releaseEvidenceRefs: input.artifact.report.releaseEvidenceRefs,
        sourceEvidenceRefs: input.sourceEvidenceRefs,
        runtimeCallEvidenceRefs: input.runtimeCallEvidenceRefs,
        boundaryPolicy: boundaryPolicy(),
      }),
      input.approval.rollbackTarget,
      normalizeText(input.approval.approvedByUserId) || null,
      input.executedAt,
    ],
  )
}

async function recordRuntimeEvent(input: {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  eventType: T2RhythmScheduleRuntimeEventType
  eventStatus: string
  publicationKey: string
  eventPayload?: Record<string, unknown> | null
  executedAt: string
}) {
  await input.queryExec(
    `INSERT INTO public.t2_rhythm_schedule_runtime_events (
       event_type,
       event_status,
       source_publication_key,
       event_payload,
       record_visibility_policy,
       executed_at
     ) VALUES ($1, $2, $3, $4::jsonb, 'backend_admin_governance_only', $5::timestamptz)
     RETURNING id`,
    [
      input.eventType,
      input.eventStatus,
      input.publicationKey,
      {
        ...(input.eventPayload ?? {}),
        source: 't2_rhythm_schedule_runtime_publication_service',
        writesTaskDependencies: input.eventType === 'schedule_runtime_apply',
        writesPlanDates: input.eventType === 'schedule_runtime_apply',
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        boundaryPolicy: boundaryPolicy(),
        runtimeCallEvidenceRefs: runtimeCallEvidenceRefs({ eventPayload: input.eventPayload }),
      },
      input.executedAt,
    ],
  )
}

async function runTransaction<T>(
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec,
  task: () => Promise<T>,
) {
  await queryExec('BEGIN')
  try {
    const result = await task()
    await queryExec('COMMIT')
    return result
  } catch (error) {
    await queryExec('ROLLBACK')
    throw error
  }
}

export async function applyT2RhythmScheduleRuntimePublication(
  input: ApplyT2RhythmScheduleRuntimePublicationInput,
): Promise<ApplyT2RhythmScheduleRuntimePublicationResult> {
  const reasons = validateInput(input)
  const artifact = input.artifact ?? null
  const verification = input.verification ?? null
  const evaluation = input.evaluation ?? null
  const approval = input.approval ?? null
  const projectId = normalizeText(input.projectId)
  const projectStartDate = normalizeText(input.projectStartDate)
  if (reasons.length > 0 || !artifact || !verification || !evaluation || !approval || !projectId || !projectStartDate) {
    return blocked({ artifact, approval, reasons })
  }

  const publicationKey = `t2-rhythm-schedule-runtime:${projectId}:${evaluation.candidateId}:${artifact.generatedAt}`
  const taskByNodeId = mappingByNodeId(input.taskMappings ?? [])
  const missingNodeMappings = (input.networkNodes ?? [])
    .map((node) => node.nodeId)
    .filter((nodeId) => !taskByNodeId.has(nodeId))
  if (missingNodeMappings.length > 0) {
    return blocked({
      artifact,
      approval,
      reasons: missingNodeMappings.map((nodeId) => `task_mapping_missing:${nodeId}`),
    })
  }

  const migrationGovernanceReasons = validateProductionMigrationGovernanceForRuntimeWrites(
    input.productionMigrationGovernanceReport,
  )
  if (migrationGovernanceReasons.length > 0) {
    return blocked({
      artifact,
      approval,
      reasons: migrationGovernanceReasons,
    })
  }

  const executedAt = normalizeText(input.executedAt) || new Date().toISOString()
  const sourceEvidenceRefs = unique(artifact.sourceEvidenceRefs ?? [])
  const runtimeCallEvidenceRefsValue = runtimeCallEvidenceRefs({ approval })
  const dependencies = (input.networkEdges ?? [])
    .map((edge) => buildDependency(edge, taskByNodeId, publicationKey))
    .filter((dependency): dependency is T2RhythmScheduleRuntimeAppliedDependency => Boolean(dependency))
  const taskIds = unique((input.taskMappings ?? []).map((mapping) => mapping.taskId))
  const currentTaskRows = taskDateRowsById(await loadCurrentTaskRows({
    queryExec: input.queryExec,
    projectId,
    taskIds,
  }))
  const planPatches = (input.networkNodes ?? []).map((node) => buildPlanPatch({
    node,
    taskId: taskByNodeId.get(node.nodeId) ?? '',
    taskRow: currentTaskRows.get(taskByNodeId.get(node.nodeId) ?? ''),
    projectStartDate,
  }))

  const { appliedDependencies, appliedPlanDatePatches } = await runTransaction(input.queryExec, async () => {
    const appliedDependencies: T2RhythmScheduleRuntimeAppliedDependency[] = []
    for (const dependency of dependencies) {
      const applied = await upsertDependency({
        queryExec: input.queryExec,
        projectId,
        dependency,
        publicationKey,
        executedAt,
      })
      if (applied) appliedDependencies.push(dependency)
    }

    const appliedPlanDatePatches: T2RhythmScheduleRuntimeAppliedPlanPatch[] = []
    for (const patch of planPatches) {
      const applied = await patchPlanDates({
        queryExec: input.queryExec,
        projectId,
        patch,
        publicationKey,
        executedAt,
      })
      if (applied) appliedPlanDatePatches.push(patch)
    }

    await persistReleaseRecord({
      queryExec: input.queryExec,
      publicationKey,
      companyId: normalizeText(input.companyId) || null,
      projectId,
      artifact,
      verification,
      evaluation,
      approval,
      dependencies: appliedDependencies,
      planPatches: appliedPlanDatePatches,
      sourceEvidenceRefs,
      runtimeCallEvidenceRefs: runtimeCallEvidenceRefsValue,
      executedAt,
    })
    await recordRuntimeEvent({
      queryExec: input.queryExec,
      eventType: 'schedule_runtime_apply',
      eventStatus: 'runtime_published',
      publicationKey,
      executedAt,
      eventPayload: {
        candidateId: evaluation.candidateId,
        selectedTemplateIds: artifact.report.selectedTemplateIds,
        insertedDependencyCount: appliedDependencies.length,
        skippedDependencyCount: dependencies.length - appliedDependencies.length,
        patchedPlanDateCount: appliedPlanDatePatches.length,
        approvalMode: approval.approvalMode,
        approvalEvidenceRefs: approval.approvalEvidenceRefs,
        consumerVerificationRefs: approval.consumerVerificationRefs,
        impactMonitoringRefs: approval.impactMonitoringRefs,
        rollbackTarget: approval.rollbackTarget,
        runtimeCallEvidenceRefs: runtimeCallEvidenceRefsValue,
        sourceEvidenceRefs,
      },
    })
    return { appliedDependencies, appliedPlanDatePatches }
  })

  return {
    source: 't2_rhythm_schedule_runtime_publication_service',
    status: 'runtime_apply_ready',
    publicationKey,
    selectedTemplateIds: artifact.report.selectedTemplateIds,
    sourceEvidenceRefs,
    runtimeCallEvidenceRefs: runtimeCallEvidenceRefsValue,
    canAutoPublishRuntimeExperience: false,
    canMaterializeTaskDependencies: true,
    canWritePlanDates: true,
    insertedDependencyCount: appliedDependencies.length,
    skippedDependencyCount: dependencies.length - appliedDependencies.length,
    patchedPlanDateCount: appliedPlanDatePatches.length,
    releaseRecordPersisted: true,
    appliedDependencies,
    appliedPlanDatePatches,
    rollbackTarget: approval.rollbackTarget,
    writesTaskDependencies: appliedDependencies.length > 0,
    writesPlanDates: appliedPlanDatePatches.length > 0,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    reasons: [],
    boundaryPolicy: boundaryPolicy(),
  }
}

export async function recordT2RhythmScheduleRuntimeImpactMonitoring(
  input: RecordT2RhythmScheduleRuntimeImpactMonitoringInput,
): Promise<RecordT2RhythmScheduleRuntimeEventResult> {
  const publicationKey = normalizeText(input.publicationKey)
  const eventStatus = normalizeText(input.eventStatus)
  const eventPayload = input.eventPayload ?? {}
  const businessType = normalizeText(eventPayload.businessType)
  const reasons = unique([
    publicationKey ? '' : 'publication_key_required',
    eventStatus ? '' : 'event_status_required',
    businessType ? '' : 'business_type_required',
  ])
  if (reasons.length > 0) {
    return eventBlocked({
      eventType: 'impact_monitoring',
      eventStatus: eventStatus || null,
      publicationKey: publicationKey || null,
      reasons,
    })
  }

  const migrationGovernanceReasons = validateProductionMigrationGovernanceForRuntimeWrites(
    input.productionMigrationGovernanceReport,
  )
  if (migrationGovernanceReasons.length > 0) {
    return eventBlocked({
      eventType: 'impact_monitoring',
      eventStatus,
      publicationKey,
      reasons: migrationGovernanceReasons,
    })
  }

  const executedAt = normalizeText(input.executedAt) || new Date().toISOString()
  await recordRuntimeEvent({
    queryExec: input.queryExec,
    eventType: 'impact_monitoring',
    eventStatus,
    publicationKey,
    executedAt,
    eventPayload: {
      ...eventPayload,
      runtimeCallEvidenceRefs: normalizeRecordStringArray(eventPayload, 'runtimeCallEvidenceRefs'),
      writesTaskDependencies: false,
      writesPlanDates: false,
    },
  })

  return {
    source: 't2_rhythm_schedule_runtime_publication_service',
    status: 'runtime_event_recorded',
    eventType: 'impact_monitoring',
    eventStatus,
    sourcePublicationKey: publicationKey,
    eventPersisted: true,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    reasons: [],
    boundaryPolicy: boundaryPolicy(),
  }
}

function parseJsonArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => (
    item != null && typeof item === 'object' && !Array.isArray(item)
  ))
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return parseJsonArray(parsed)
  } catch {
    return []
  }
}

async function loadRuntimePublication(input: {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  projectId: string
  publicationKey: string
}) {
  const rows = await input.queryExec<Record<string, unknown>>(
    `SELECT publication_key,
            project_id,
            runtime_publication_status,
            applied_dependency_edges,
            applied_plan_date_patches
       FROM public.t2_rhythm_schedule_runtime_publications
      WHERE publication_key = $1
        AND project_id = $2
      LIMIT 1`,
    [input.publicationKey, input.projectId],
  )
  return rows[0] ?? null
}

async function rollbackDependency(input: {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  projectId: string
  dependency: Record<string, unknown>
  executedAt: string
}) {
  const rows = await input.queryExec(
    `UPDATE public.task_dependencies
        SET status = 'inactive',
            updated_at = $5::timestamptz
      WHERE project_id = $1
        AND task_id = $2
        AND dependency_task_id = $3
        AND dependency_type = $4
        AND source_type = 't2_rhythm_schedule_runtime'
        AND status = 'active'
      RETURNING id`,
    [
      input.projectId,
      normalizeText(input.dependency.taskId),
      normalizeText(input.dependency.dependencyTaskId),
      normalizeText(input.dependency.dependencyType) || 'FS',
      input.executedAt,
    ],
  )
  return rows.length > 0
}

async function rollbackPlanPatch(input: {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  projectId: string
  patch: Record<string, unknown>
  executedAt: string
}) {
  const rows = await input.queryExec(
    `UPDATE public.tasks
        SET planned_start_date = $3::date,
            planned_end_date = $4::date,
            start_date = $5::date,
            end_date = $6::date,
            standard_task_metadata = COALESCE(standard_task_metadata, '{}'::jsonb)
              || $7::jsonb,
            updated_at = $8::timestamptz
      WHERE project_id = $1
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id`,
    [
      input.projectId,
      normalizeText(input.patch.taskId),
      normalizeText(input.patch.previousPlannedStartDate) || null,
      normalizeText(input.patch.previousPlannedEndDate) || null,
      normalizeText(input.patch.previousStartDate) || null,
      normalizeText(input.patch.previousEndDate) || null,
      JSON.stringify({
        t2RhythmRuntimeRollback: {
          restoredFromPublication: true,
        },
      }),
      input.executedAt,
    ],
  )
  return rows.length > 0
}

async function markPublicationRolledBack(input: {
  queryExec: T2RhythmScheduleRuntimePublicationQueryExec
  projectId: string
  publicationKey: string
  rollbackExecution: Record<string, unknown>
  executedAt: string
}) {
  const rows = await input.queryExec(
    `UPDATE public.t2_rhythm_schedule_runtime_publications
        SET runtime_publication_status = 'runtime_rolled_back',
            rollback_execution = $2::jsonb,
            updated_at = $3::timestamptz
      WHERE publication_key = $1
        AND project_id = $4
      RETURNING id`,
    [
      input.publicationKey,
      input.rollbackExecution,
      input.executedAt,
      input.projectId,
    ],
  )
  return rows.length > 0
}

export async function rollbackT2RhythmScheduleRuntimePublication(
  input: RollbackT2RhythmScheduleRuntimePublicationInput,
): Promise<RollbackT2RhythmScheduleRuntimePublicationResult> {
  const publicationKey = normalizeText(input.publicationKey)
  const requestedProjectId = normalizeText(input.projectId)
  const rollbackEvidenceRefs = (input.rollbackEvidenceRefs ?? []).map(normalizeText).filter(Boolean)
  const reasons = unique([
    publicationKey ? '' : 'publication_key_required',
    requestedProjectId ? '' : 'project_id_required',
    normalizeText(input.rollbackReason) ? '' : 'rollback_reason_required',
    rollbackEvidenceRefs.length > 0 ? '' : 'rollback_evidence_refs_required',
  ])
  if (reasons.length > 0) {
    return rollbackBlocked({
      publicationKey: publicationKey || null,
      reasons,
    })
  }

  const migrationGovernanceReasons = validateProductionMigrationGovernanceForRuntimeWrites(
    input.productionMigrationGovernanceReport,
  )
  if (migrationGovernanceReasons.length > 0) {
    return rollbackBlocked({
      publicationKey,
      reasons: migrationGovernanceReasons,
    })
  }

  const publication = await loadRuntimePublication({
    queryExec: input.queryExec,
    projectId: requestedProjectId,
    publicationKey,
  })
  if (!publication) {
    return rollbackBlocked({
      publicationKey,
      reasons: ['runtime_publication_record_not_found'],
    })
  }
  const projectId = normalizeText(publication.project_id)
  if (!projectId) {
    return rollbackBlocked({
      publicationKey,
      reasons: ['runtime_publication_project_id_missing'],
    })
  }

  const executedAt = normalizeText(input.executedAt) || new Date().toISOString()
  const dependencies = parseJsonArray(publication.applied_dependency_edges)
  const planPatches = parseJsonArray(publication.applied_plan_date_patches)

  let dependencyRollbackCount = 0
  for (const dependency of dependencies) {
    if (await rollbackDependency({
      queryExec: input.queryExec,
      projectId,
      dependency,
      executedAt,
    })) dependencyRollbackCount += 1
  }

  let planDateRollbackCount = 0
  for (const patch of planPatches) {
    if (await rollbackPlanPatch({
      queryExec: input.queryExec,
      projectId,
      patch,
      executedAt,
    })) planDateRollbackCount += 1
  }

  const rollbackExecution = {
    source: 't2_rhythm_schedule_runtime_publication_service',
    status: 'runtime_rolled_back',
    rollbackReason: normalizeText(input.rollbackReason),
    rollbackEvidenceRefs,
    runtimeCallEvidenceRefs: rollbackEvidenceRefs,
    executedByUserId: normalizeText(input.executedByUserId) || null,
    executedAt,
    projectId,
    dependencyRollbackCount,
    planDateRollbackCount,
    writesTaskDependencies: dependencyRollbackCount > 0,
    writesPlanDates: planDateRollbackCount > 0,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    boundaryPolicy: boundaryPolicy(),
  }
  const releaseRecordRolledBack = await runTransaction(input.queryExec, async () => {
    const rolledBack = await markPublicationRolledBack({
      queryExec: input.queryExec,
      projectId,
      publicationKey,
      rollbackExecution,
      executedAt,
    })
    await recordRuntimeEvent({
      queryExec: input.queryExec,
      eventType: 'rollback_execution',
      eventStatus: 'rollback_executed',
      publicationKey,
      executedAt,
      eventPayload: rollbackExecution,
    })
    return rolledBack
  })

  return {
    source: 't2_rhythm_schedule_runtime_publication_service',
    status: 'runtime_rollback_ready',
    publicationKey,
    dependencyRollbackCount,
    planDateRollbackCount,
    releaseRecordRolledBack,
    rollbackEventPersisted: true,
    writesTaskDependencies: dependencyRollbackCount > 0,
    writesPlanDates: planDateRollbackCount > 0,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    reasons: [],
    boundaryPolicy: boundaryPolicy(),
  }
}
