import type {
  ConstructionOrganizationPlanNetworkDraft,
  ConstructionOrganizationPlanNetworkDraftEdge,
} from './constructionOrganizationPlanNetworkDraftService.js'

export type ConstructionOrganizationPlanNetworkDomainWriterQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type ConstructionOrganizationPlanNetworkAppliedDependency = {
  edgeId: string
  taskId: string
  dependencyTaskId: string
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
  sourceType: 'construction_organization_plan_network'
  sourceRefId: string | null
  sourceEventId: string | null
  intent: string | null
}

export type ApplyConstructionOrganizationPlanNetworkApprovedDraftResult = {
  source: 'construction_organization_plan_network_domain_writer'
  status: 'runtime_apply_ready' | 'runtime_apply_blocked'
  canMaterializeRuntime: boolean
  draftNetworkKey: string | null
  releaseHandoffCandidateEventId: string | null
  releaseRecordTarget: string | null
  rollbackTarget: string | null
  insertedDependencyCount: number
  skippedDependencyCount: number
  appliedDependencies: ConstructionOrganizationPlanNetworkAppliedDependency[]
  releaseRecordPersisted: boolean
  writesTaskDependencies: boolean
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  reasons: string[]
  boundaryPolicy: string[]
}

export type ApplyConstructionOrganizationPlanNetworkApprovedDraftInput = {
  draft?: ConstructionOrganizationPlanNetworkDraft | null
  companyId?: string | null
  projectId?: string | null
  queryExec: ConstructionOrganizationPlanNetworkDomainWriterQueryExec
  executedByUserId?: string | null
  executedAt?: string | null
}

const SOURCE_TYPE = 'construction_organization_plan_network' as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function dependencyType(value: unknown): 'FS' | 'SS' | 'FF' | 'SF' {
  const normalized = normalizeText(value).toUpperCase()
  return normalized === 'SS' || normalized === 'FF' || normalized === 'SF' ? normalized : 'FS'
}

function safeInteger(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.trunc(numeric)
}

function uuidOrNull(value: unknown) {
  const text = normalizeText(value)
  return UUID_PATTERN.test(text) ? text : null
}

function collectDraftSourceMarkers(draft: ConstructionOrganizationPlanNetworkDraft) {
  const lineage = (draft.runtimeEvidenceLineage ?? {}) as Partial<ConstructionOrganizationPlanNetworkDraft['runtimeEvidenceLineage']>
  return [
    (draft as { source?: unknown }).source,
    draft.assetKey,
    draft.optionId,
    draft.workPackageKey,
    draft.useCase,
    draft.evidenceAction,
    lineage.workPackageKey,
    lineage.useCase,
    lineage.evidenceAction,
    ...(Array.isArray(draft.boundaryPolicy) ? draft.boundaryPolicy : []),
    ...(Array.isArray(draft.blockedReasons) ? draft.blockedReasons : []),
    ...(Array.isArray(draft.replayRequirements) ? draft.replayRequirements : []),
    ...(Array.isArray(draft.evaluationRequirements) ? draft.evaluationRequirements : []),
  ].map((value) => normalizeText(value).toLowerCase()).filter(Boolean)
}

function runtimeSourceBoundaryReasons(draft: ConstructionOrganizationPlanNetworkDraft) {
  const markers = collectDraftSourceMarkers(draft)
  const joined = markers.join('\n')
  const reasons: string[] = []
  if (
    joined.includes('option_comparison')
    || joined.includes('plan_option_comparison')
    || joined.includes('comparison_package')
  ) {
    reasons.push('option_comparison_package_cannot_materialize_runtime')
  }
  if (
    joined.includes('manual_comparison')
    || joined.includes('manual_comparison_package')
    || joined.includes('manual_comparison_source')
  ) {
    reasons.push('manual_comparison_source_cannot_materialize_runtime')
  }
  return reasons
}

function boundaryPolicy() {
  return [
    'domain_writer_requires_release_exit_handoff_candidate_event',
    'domain_writer_appends_only_construction_organization_source_dependencies',
    'domain_writer_does_not_replace_manual_dependencies',
    'domain_writer_does_not_write_plan_dates_baseline_seed_or_critical_path_facts',
    'runtime_apply_requires_consumer_observation_monitoring_release_record_and_rollback_followup',
  ]
}

function blocked(input: {
  draft?: ConstructionOrganizationPlanNetworkDraft | null
  reasons: string[]
}): ApplyConstructionOrganizationPlanNetworkApprovedDraftResult {
  return {
    source: 'construction_organization_plan_network_domain_writer',
    status: 'runtime_apply_blocked',
    canMaterializeRuntime: false,
    draftNetworkKey: input.draft?.draftNetworkKey ?? null,
    releaseHandoffCandidateEventId: input.draft?.releaseExitHandoff?.candidateEventId ?? null,
    releaseRecordTarget: input.draft?.releaseExitHandoff?.releaseRecordTarget ?? null,
    rollbackTarget: input.draft?.releaseExitHandoff?.rollbackTarget ?? null,
    insertedDependencyCount: 0,
    skippedDependencyCount: 0,
    appliedDependencies: [],
    releaseRecordPersisted: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: unique(input.reasons),
    boundaryPolicy: boundaryPolicy(),
  }
}

function validateDraft(draft?: ConstructionOrganizationPlanNetworkDraft | null) {
  const reasons: string[] = []
  if (!draft) return ['draft_network_required']
  if (draft.readiness !== 'ready_for_replay') reasons.push('draft_not_ready_for_replay')
  if (draft.evaluationEvidence?.evaluationStatus !== 'evaluation_ready') reasons.push('draft_evaluation_not_ready')
  if (!draft.manualReviewHandoff?.candidateEventId) reasons.push('manual_review_handoff_required')
  if (!draft.manualReviewApproval?.candidateEventId) reasons.push('manual_review_approval_required')
  if (!draft.releaseExitHandoff?.candidateEventId) reasons.push('release_exit_handoff_required')
  if (!draft.releaseExitHandoff?.releaseRecordTarget) reasons.push('release_record_target_required')
  if (!draft.releaseExitHandoff?.rollbackTarget) reasons.push('rollback_target_required')
  if (!(draft.edgeCount > 0) || !Array.isArray(draft.edges) || draft.edges.length === 0) reasons.push('draft_has_no_edges')
  if (draft.mutationBoundary?.writesTaskDependencies !== false) reasons.push('draft_write_boundary_unknown')
  if (draft.edges.some((edge) => edge.writesTaskDependencies !== false)) reasons.push('draft_edge_write_boundary_unknown')
  reasons.push(...runtimeSourceBoundaryReasons(draft))
  return reasons
}

function rowCarrierCandidates(row: Record<string, unknown>) {
  const metadata = (row.standard_task_metadata && typeof row.standard_task_metadata === 'object')
    ? row.standard_task_metadata as Record<string, unknown>
    : {}
  return [
    row.id,
    row.rowCarrierClientRowId,
    row.row_carrier_client_row_id,
    row.clientRowId,
    row.client_row_id,
    metadata.rowCarrierClientRowId,
    metadata.row_carrier_client_row_id,
    metadata.clientRowId,
    metadata.client_row_id,
  ].map(normalizeText).filter(Boolean)
}

function edgeRowIds(edge: ConstructionOrganizationPlanNetworkDraftEdge) {
  return [
    normalizeText(edge.fromGeneratedRowId),
    normalizeText(edge.toGeneratedRowId),
  ].filter(Boolean)
}

async function loadTaskIdByGeneratedRowId(input: {
  queryExec: ConstructionOrganizationPlanNetworkDomainWriterQueryExec
  projectId: string
  rowIds: string[]
}) {
  const rows = await input.queryExec<Record<string, unknown>>(
    `SELECT id, standard_task_metadata
       FROM public.tasks
      WHERE project_id = $1
        AND deleted_at IS NULL
        AND standard_task_metadata IS NOT NULL`,
    [input.projectId],
  )
  const taskIdByRowId = new Map<string, string>()
  const wanted = new Set(input.rowIds)
  for (const row of rows) {
    const taskId = normalizeText(row.id)
    if (!taskId) continue
    for (const candidate of rowCarrierCandidates(row)) {
      if (wanted.has(candidate) && !taskIdByRowId.has(candidate)) {
        taskIdByRowId.set(candidate, taskId)
      }
    }
  }
  return taskIdByRowId
}

function buildDependency(edge: ConstructionOrganizationPlanNetworkDraftEdge, taskIdByRowId: Map<string, string>, sourceEventId: string) {
  const predecessorTaskId = taskIdByRowId.get(normalizeText(edge.fromGeneratedRowId))
  const successorTaskId = taskIdByRowId.get(normalizeText(edge.toGeneratedRowId))
  if (!predecessorTaskId || !successorTaskId) return null
  return {
    edgeId: normalizeText(edge.edgeId),
    taskId: successorTaskId,
    dependencyTaskId: predecessorTaskId,
    dependencyType: dependencyType(edge.dependencyType),
    lagDays: safeInteger(edge.lagDays),
    sourceType: SOURCE_TYPE,
    sourceRefId: uuidOrNull(sourceEventId),
    sourceEventId,
    intent: normalizeText(edge.intent) || null,
  } satisfies ConstructionOrganizationPlanNetworkAppliedDependency
}

function buildRuntimePublicationKey(draft: ConstructionOrganizationPlanNetworkDraft) {
  return normalizeText(draft.releaseExitHandoff?.releaseRecordTarget) || null
}

async function upsertDependency(input: {
  queryExec: ConstructionOrganizationPlanNetworkDomainWriterQueryExec
  projectId: string
  draft: ConstructionOrganizationPlanNetworkDraft
  dependency: ConstructionOrganizationPlanNetworkAppliedDependency
  executedAt: string
}) {
  const publicationKey = buildRuntimePublicationKey(input.draft)
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
      WHERE public.task_dependencies.source_type = 'construction_organization_plan_network'
     RETURNING id`,
    [
      input.projectId,
      input.dependency.taskId,
      input.dependency.dependencyTaskId,
      input.dependency.dependencyType,
      input.dependency.lagDays,
      input.dependency.sourceType,
      input.dependency.sourceRefId,
      'construction organization approved plan-network edge',
      JSON.stringify({
        source: 'construction_organization_plan_network_domain_writer',
        businessType: normalizeText(input.draft.businessType) || null,
        draftNetworkKey: input.draft.draftNetworkKey,
        optionId: normalizeText(input.draft.optionId) || null,
        publicationKey,
        runtimePublicationKey: publicationKey,
        releaseHandoffCandidateEventId: input.dependency.sourceEventId,
        edgeId: input.dependency.edgeId,
        intent: input.dependency.intent,
        selectedScenarioIds: input.draft.selectedScenarioIds,
      }),
      input.executedAt,
    ],
  )
  return rows.length > 0
}

async function persistReleaseRecord(input: {
  queryExec: ConstructionOrganizationPlanNetworkDomainWriterQueryExec
  companyId: string | null
  projectId: string
  draft: ConstructionOrganizationPlanNetworkDraft
  appliedDependencies: ConstructionOrganizationPlanNetworkAppliedDependency[]
  executedByUserId: string | null
  executedAt: string
}) {
  await input.queryExec(
    `INSERT INTO public.construction_organization_plan_network_runtime_publications (
       publication_key,
       company_id,
       project_id,
       draft_network_key,
       release_handoff_candidate_event_id,
       runtime_publication_status,
       applied_dependency_count,
       applied_dependency_edges,
       release_lineage,
       rollback_target,
       record_visibility_policy,
       published_by_user_id,
       published_at
     ) VALUES (
       $1, $2, $3, $4, $5, 'runtime_published', $6, $7::jsonb, $8::jsonb, $9, 'backend_admin_governance_only', $10, $11::timestamptz
     )
     ON CONFLICT (publication_key)
     DO UPDATE SET
       runtime_publication_status = 'runtime_published',
       applied_dependency_count = EXCLUDED.applied_dependency_count,
       applied_dependency_edges = EXCLUDED.applied_dependency_edges,
       release_lineage = EXCLUDED.release_lineage,
       rollback_target = EXCLUDED.rollback_target,
       published_by_user_id = EXCLUDED.published_by_user_id,
       published_at = EXCLUDED.published_at
     RETURNING id`,
    [
      input.draft.releaseExitHandoff?.releaseRecordTarget,
      input.companyId,
      input.projectId,
      input.draft.draftNetworkKey,
      input.draft.releaseExitHandoff?.candidateEventId,
      input.appliedDependencies.length,
      JSON.stringify(input.appliedDependencies),
      JSON.stringify({
        source: 'construction_organization_plan_network_domain_writer',
        businessType: normalizeText(input.draft.businessType) || null,
        draftNetworkKey: input.draft.draftNetworkKey,
        optionId: normalizeText(input.draft.optionId) || null,
        publicationKey: input.draft.releaseExitHandoff?.releaseRecordTarget ?? null,
        runtimePublicationKey: input.draft.releaseExitHandoff?.releaseRecordTarget ?? null,
        candidateEventId: input.draft.candidateEventId,
        manualReviewHandoffCandidateEventId: input.draft.manualReviewHandoff?.candidateEventId,
        manualReviewApprovalCandidateEventId: input.draft.manualReviewApproval?.candidateEventId,
        releaseExitHandoffCandidateEventId: input.draft.releaseExitHandoff?.candidateEventId,
        selectedScenarioIds: input.draft.selectedScenarioIds,
        boundaryPolicy: boundaryPolicy(),
      }),
      input.draft.releaseExitHandoff?.rollbackTarget,
      input.executedByUserId,
      input.executedAt,
    ],
  )
}

export async function applyConstructionOrganizationPlanNetworkApprovedDraft(
  input: ApplyConstructionOrganizationPlanNetworkApprovedDraftInput,
): Promise<ApplyConstructionOrganizationPlanNetworkApprovedDraftResult> {
  const draft = input.draft ?? null
  const reasons = validateDraft(draft)
  const projectId = normalizeText(input.projectId)
  if (!projectId) reasons.push('project_id_required')
  if (reasons.length > 0 || !draft) return blocked({ draft, reasons })

  const rowIds = unique(draft.edges.flatMap(edgeRowIds))
  const taskIdByRowId = await loadTaskIdByGeneratedRowId({
    queryExec: input.queryExec,
    projectId,
    rowIds,
  })
  const missingRowIds = rowIds.filter((rowId) => !taskIdByRowId.has(rowId))
  if (missingRowIds.length > 0) {
    return blocked({
      draft,
      reasons: missingRowIds.map((rowId) => `generated_row_task_mapping_missing:${rowId}`),
    })
  }

  const sourceEventId = normalizeText(draft.releaseExitHandoff?.candidateEventId)
  const dependencies = draft.edges
    .map((edge) => buildDependency(edge, taskIdByRowId, sourceEventId))
    .filter((dependency): dependency is ConstructionOrganizationPlanNetworkAppliedDependency => Boolean(dependency))
  const skippedDependencyCount = draft.edges.length - dependencies.length
  const executedAt = normalizeText(input.executedAt) || new Date().toISOString()

  const appliedDependencies: ConstructionOrganizationPlanNetworkAppliedDependency[] = []
  for (const dependency of dependencies) {
    const applied = await upsertDependency({
      queryExec: input.queryExec,
      projectId,
      draft,
      dependency,
      executedAt,
    })
    if (applied) appliedDependencies.push(dependency)
  }

  await persistReleaseRecord({
    queryExec: input.queryExec,
    companyId: normalizeText(input.companyId) || null,
    projectId,
    draft,
    appliedDependencies,
    executedByUserId: normalizeText(input.executedByUserId) || null,
    executedAt,
  })

  return {
    source: 'construction_organization_plan_network_domain_writer',
    status: 'runtime_apply_ready',
    canMaterializeRuntime: true,
    draftNetworkKey: draft.draftNetworkKey,
    releaseHandoffCandidateEventId: sourceEventId,
    releaseRecordTarget: draft.releaseExitHandoff?.releaseRecordTarget ?? null,
    rollbackTarget: draft.releaseExitHandoff?.rollbackTarget ?? null,
    insertedDependencyCount: appliedDependencies.length,
    skippedDependencyCount: draft.edges.length - appliedDependencies.length,
    appliedDependencies,
    releaseRecordPersisted: true,
    writesTaskDependencies: appliedDependencies.length > 0,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: [],
    boundaryPolicy: boundaryPolicy(),
  }
}
