import { query as rawQuery } from '../database.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'
import {
  persistConstructionOrganizationScenarioCandidateEvents,
} from './constructionOrganizationScenarioGovernanceService.js'
import {
  projectConstructionOrganizationSelectionToGeneratedRows,
  type ConstructionOrganizationGeneratedRowProjectionInputRow,
} from './constructionOrganizationPlanOptionProjectionService.js'
import type {
  ConstructionOrganizationPlanOption,
  ConstructionOrganizationScenarioSelection,
} from '../types/constructionOrganizationScenario.js'

export type BackfillConstructionOrganizationCandidateProjectionsInput = {
  companyId: string
  projectId?: string | null
  limit?: number | null
  dryRun?: boolean
  forceReproject?: boolean | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export type BackfillConstructionOrganizationCandidateProjectionProjectResult = {
  projectId: string
  status:
    | 'projection_candidate_backfilled'
    | 'projection_candidate_backfill_ready'
    | 'already_has_projection_candidate'
    | 'skipped'
  reason: string | null
  projectedCandidateEventCount: number
  assetKeys: string[]
  runtimeEffectPolicy: 'candidate_only'
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesBaseline: false
    writesSeed: false
    writesTaskFacts: false
    writesAccelerationDraft: false
    writesCriticalPathFacts: false
  }
}

export type BackfillConstructionOrganizationCandidateProjectionsResult = {
  source: 'construction_organization_candidate_projection_backfill_service'
  mode: 'dry_run' | 'apply'
  companyId: string
  projectId: string | null
  scannedProjectCount: number
  upgradableProjectCount: number
  upgradedProjectCount: number
  skippedProjectCount: number
  upgradedCandidateEventCount: number
  projects: BackfillConstructionOrganizationCandidateProjectionProjectResult[]
  boundaryPolicy: string[]
}

type ProjectRow = {
  id?: string | null
  metadata?: unknown
}

type CandidateEventRow = {
  id?: string | null
  asset_key?: string | null
  candidate_payload?: unknown
}

type TaskProjectionRow = {
  id?: string | null
  title?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  task_code?: string | null
  wbs_code?: string | null
  planned_start_date?: unknown
  planned_end_date?: unknown
  start_date?: unknown
  end_date?: unknown
  duration_contribution_mode?: string | null
  standard_task_metadata?: unknown
  stable_code_meta?: string | null
  execution_phase_meta?: string | null
  row_projection_mode_meta?: string | null
  duration_contribution_mode_meta?: string | null
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  const integer = Math.floor(numeric)
  return integer > 0 ? integer : fallback
}

function normalizeDateText(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const text = normalizeText(value)
  if (!text) return null
  return text.slice(0, 10)
}

function readNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function defaultMutationBoundary(): BackfillConstructionOrganizationCandidateProjectionProjectResult['mutationBoundary'] {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesBaseline: false,
    writesSeed: false,
    writesTaskFacts: false,
    writesAccelerationDraft: false,
    writesCriticalPathFacts: false,
  }
}

function hasPersistableScenarioShape(value: unknown) {
  const scenario = readRecord(value)
  if (scenario.source !== 'construction_organization_scenario_selector') return false
  if (!normalizeText(readRecord(scenario.recommendedPlanOption).optionId)) return false
  return readArray(scenario.planOptions).some((rawOption) => {
    const option = readRecord(rawOption)
    const evaluation = readRecord(option.evaluation)
    return Boolean(
      normalizeText(option.optionId)
      && Object.keys(readRecord(option.combinedVirtualNetwork)).length > 0
      && Object.keys(readRecord(evaluation.networkEvaluation)).length > 0
      && Object.keys(readRecord(evaluation.engineEvaluationSummary)).length > 0,
    )
  })
}

function resolveScenarioFromProjectMetadata(metadata: Record<string, unknown>) {
  const scenario = readRecord(metadata.constructionOrganizationScenario ?? metadata.construction_organization_scenario)
  return hasPersistableScenarioShape(scenario)
    ? scenario as unknown as ConstructionOrganizationScenarioSelection
    : null
}

function readOptionIdFromCandidate(row: CandidateEventRow) {
  const payload = readRecord(row.candidate_payload)
  const option = readRecord(payload.option)
  return normalizeText(option.optionId)
}

function candidateHasReviewPackage(row: CandidateEventRow) {
  const payload = readRecord(row.candidate_payload)
  const option = readRecord(payload.option)
  const projection = readRecord(option.generatedRowProjection)
  return Object.keys(readRecord(projection.materializationReviewPackage)).length > 0
}

function candidateNeedsDateConflictEvidenceReprojection(row: CandidateEventRow) {
  const payload = readRecord(row.candidate_payload)
  const option = readRecord(payload.option)
  const projection = readRecord(option.generatedRowProjection)
  const reviewPackage = readRecord(projection.materializationReviewPackage)
  const candidateMaterializationEvaluation = readRecord(projection.candidateMaterializationEvaluation)
  const reviewStatus = normalizeText(reviewPackage.status)
  const blockedReasons = readArray(reviewPackage.blockedReasons).map(normalizeText).filter((reason): reason is string => Boolean(reason))
  const conflictEvidence = readArray(reviewPackage.conflictEvidence)
  const isViolationBlocked = reviewStatus === 'blocked_by_violations'
    || blockedReasons.includes('candidate_preview_edges_violate_generated_row_dates')
    || blockedReasons.includes('candidate_network_conflicts_with_current_generated_row_dates')
  return isViolationBlocked && conflictEvidence.length === 0
}

function readSmartReferenceDays(metadata: Record<string, unknown>) {
  const direct = readNumber(metadata.smartReferenceDays ?? metadata.smart_reference_days)
  if (direct !== null) return direct
  const durationSuggestion = readRecord(metadata.durationSuggestion ?? metadata.duration_suggestion)
  return readNumber(durationSuggestion.planReferenceDays ?? durationSuggestion.plan_reference_days)
}

function readDurationSuggestion(metadata: Record<string, unknown>) {
  const durationSuggestion = readRecord(metadata.durationSuggestion ?? metadata.duration_suggestion)
  return Object.keys(durationSuggestion).length > 0 ? durationSuggestion : null
}

function normalizeDurationSuggestion(metadata: Record<string, unknown>) {
  const durationSuggestion = readDurationSuggestion(metadata)
  if (!durationSuggestion) return null
  return {
    ...durationSuggestion,
    planReferenceDays: durationSuggestion.planReferenceDays ?? durationSuggestion.plan_reference_days,
    contextualReferenceDays: durationSuggestion.contextualReferenceDays ?? durationSuggestion.contextual_reference_days,
    recommendedDurationDays: durationSuggestion.recommendedDurationDays ?? durationSuggestion.recommended_duration_days,
  }
}

function buildProjectionRow(row: TaskProjectionRow): ConstructionOrganizationGeneratedRowProjectionInputRow | null {
  const id = normalizeText(row.id)
  if (!id) return null
  const metadata = readRecord(row.standard_task_metadata)
  const durationSuggestion = normalizeDurationSuggestion(metadata)
  const stableCode = normalizeText(
    row.stable_code_meta
      ?? metadata.stableCode
      ?? metadata.stable_code
      ?? row.standard_work_code
      ?? row.task_code
      ?? row.wbs_code,
  )
  const plannedStartDate = normalizeDateText(row.planned_start_date ?? row.start_date)
  const plannedEndDate = normalizeDateText(row.planned_end_date ?? row.end_date)
  return {
    id,
    title: normalizeText(row.title ?? row.standard_work_name),
    stableCode,
    executionPhase: normalizeText(row.execution_phase_meta ?? metadata.executionPhase ?? metadata.execution_phase),
    rowProjectionMode: normalizeText(row.row_projection_mode_meta ?? metadata.rowProjectionMode ?? metadata.row_projection_mode),
    durationContributionMode: normalizeText(
      row.duration_contribution_mode
        ?? row.duration_contribution_mode_meta
        ?? metadata.durationContributionMode
        ?? metadata.duration_contribution_mode,
    ),
    plannedStartDate,
    plannedEndDate,
    smartReferenceDays: readSmartReferenceDays(metadata),
    durationSuggestion,
  }
}

function filterSelectionToOptions(
  scenario: ConstructionOrganizationScenarioSelection,
  optionIds: string[],
): ConstructionOrganizationScenarioSelection {
  const allowed = new Set(optionIds)
  const planOptions = scenario.planOptions.filter((option) => allowed.has(option.optionId))
  const recommendedPlanOption =
    planOptions.find((option) => option.optionId === scenario.recommendedPlanOption.optionId)
    ?? planOptions[0]
    ?? scenario.recommendedPlanOption
  return {
    ...scenario,
    recommendedPlanOption,
    recommendedScenarioIds: recommendedPlanOption.selectedScenarioIds,
    planOptions,
  }
}

function resultForProject(input: Omit<BackfillConstructionOrganizationCandidateProjectionProjectResult, 'runtimeEffectPolicy' | 'mutationBoundary'>): BackfillConstructionOrganizationCandidateProjectionProjectResult {
  return {
    ...input,
    runtimeEffectPolicy: 'candidate_only',
    mutationBoundary: defaultMutationBoundary(),
  }
}

async function defaultQueryExec<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  // database-query-dynamic-approved: local adapter for fixed, parameterized projection-backfill SQL templates.
  const result = await rawQuery(sql, params as any[])
  return (result.rows ?? []) as T[]
}

async function listProjectRows(input: {
  companyId: string
  projectId: string | null
  limit: number
  queryExec: AlgorithmAssetGovernanceQueryExec
}) {
  if (input.projectId) {
    return input.queryExec<ProjectRow>(`
      SELECT id, metadata
      FROM public.projects
      WHERE company_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
    `, [input.companyId, input.projectId])
  }
  return input.queryExec<ProjectRow>(`
    SELECT id, metadata
    FROM public.projects
    WHERE company_id = $1::uuid
      AND COALESCE(metadata, '{}'::jsonb) ?| ARRAY['constructionOrganizationScenario', 'construction_organization_scenario']
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT $2
  `, [input.companyId, input.limit])
}

async function listTaskProjectionRows(input: {
  projectId: string
  queryExec: AlgorithmAssetGovernanceQueryExec
}) {
  return input.queryExec<TaskProjectionRow>(`
    SELECT
      id,
      title,
      standard_work_code,
      standard_work_name,
      task_code,
      wbs_code,
      planned_start_date,
      planned_end_date,
      start_date,
      end_date,
      duration_contribution_mode,
      jsonb_strip_nulls(jsonb_build_object(
        'stableCode', COALESCE(standard_task_metadata, '{}'::jsonb)->'stableCode',
        'stable_code', COALESCE(standard_task_metadata, '{}'::jsonb)->'stable_code',
        'executionPhase', COALESCE(standard_task_metadata, '{}'::jsonb)->'executionPhase',
        'execution_phase', COALESCE(standard_task_metadata, '{}'::jsonb)->'execution_phase',
        'rowProjectionMode', COALESCE(standard_task_metadata, '{}'::jsonb)->'rowProjectionMode',
        'row_projection_mode', COALESCE(standard_task_metadata, '{}'::jsonb)->'row_projection_mode',
        'durationContributionMode', COALESCE(standard_task_metadata, '{}'::jsonb)->'durationContributionMode',
        'duration_contribution_mode', COALESCE(standard_task_metadata, '{}'::jsonb)->'duration_contribution_mode',
        'smartReferenceDays', COALESCE(standard_task_metadata, '{}'::jsonb)->'smartReferenceDays',
        'smart_reference_days', COALESCE(standard_task_metadata, '{}'::jsonb)->'smart_reference_days',
        'durationSuggestion', COALESCE(standard_task_metadata, '{}'::jsonb)->'durationSuggestion',
        'duration_suggestion', COALESCE(standard_task_metadata, '{}'::jsonb)->'duration_suggestion'
      )) AS standard_task_metadata,
      COALESCE(standard_task_metadata, '{}'::jsonb)->>'stableCode' AS stable_code_meta,
      COALESCE(standard_task_metadata, '{}'::jsonb)->>'executionPhase' AS execution_phase_meta,
      COALESCE(standard_task_metadata, '{}'::jsonb)->>'rowProjectionMode' AS row_projection_mode_meta,
      COALESCE(standard_task_metadata, '{}'::jsonb)->>'durationContributionMode' AS duration_contribution_mode_meta
    FROM public.tasks
    WHERE project_id = $1::uuid
      AND deleted_at IS NULL
    ORDER BY sort_order NULLS LAST, created_at NULLS LAST, id
  `, [input.projectId])
}

async function listCandidateRows(input: {
  companyId: string
  projectId: string
  queryExec: AlgorithmAssetGovernanceQueryExec
}) {
  return input.queryExec<CandidateEventRow>(`
    SELECT id, asset_key, candidate_payload
    FROM public.algorithm_asset_candidate_events
    WHERE company_id = $1::uuid
      AND project_id = $2::uuid
      AND asset_key LIKE $3
      AND source_module = $4
      AND event_status IN ('candidate', 'review_required', 'replay_ready')
      AND runtime_effect = 'candidate_only'
    ORDER BY created_at DESC
  `, [
    input.companyId,
    input.projectId,
    'construction_organization.plan_option.%',
    'constructionOrganizationScenarioGovernanceService',
  ])
}

function resolveMissingProjectionOptionIds(
  scenario: ConstructionOrganizationScenarioSelection,
  candidateRows: CandidateEventRow[],
  forceReproject: boolean,
): { optionIds: string[], reason: string | null } {
  const optionById = new Map<string, ConstructionOrganizationPlanOption>(
    scenario.planOptions.map((option) => [option.optionId, option]),
  )
  if (forceReproject) {
    return {
      optionIds: [...new Set(candidateRows
      .map(readOptionIdFromCandidate)
        .filter((optionId): optionId is string => Boolean(optionId && optionById.has(optionId))))],
      reason: 'force_reproject_existing_projection_candidates',
    }
  }
  const hasProjectedCandidate = new Set<string>()
  const missing = new Set<string>()
  const legacyMissingDateConflictEvidence = new Set<string>()
  for (const row of candidateRows) {
    const optionId = readOptionIdFromCandidate(row)
    if (!optionId || !optionById.has(optionId)) continue
    if (candidateNeedsDateConflictEvidenceReprojection(row)) {
      legacyMissingDateConflictEvidence.add(optionId)
      missing.add(optionId)
    } else if (candidateHasReviewPackage(row)) {
      hasProjectedCandidate.add(optionId)
      missing.delete(optionId)
    } else if (!hasProjectedCandidate.has(optionId)) {
      missing.add(optionId)
    }
  }
  return {
    optionIds: [...missing],
    reason: legacyMissingDateConflictEvidence.size > 0
      ? 'legacy_projection_missing_date_conflict_evidence'
      : null,
  }
}

export async function backfillConstructionOrganizationCandidateProjections(
  input: BackfillConstructionOrganizationCandidateProjectionsInput,
): Promise<BackfillConstructionOrganizationCandidateProjectionsResult> {
  const companyId = normalizeText(input.companyId)
  if (!companyId) {
    throw new Error('company_id_required_for_construction_organization_candidate_projection_backfill')
  }
  const dryRun = input.dryRun !== false
  const forceReproject = input.forceReproject === true
  const projectId = normalizeText(input.projectId)
  const limit = normalizePositiveInteger(input.limit, 50)
  const queryExec = input.queryExec ?? defaultQueryExec
  const projectRows = await listProjectRows({
    companyId,
    projectId,
    limit,
    queryExec,
  })
  const projects: BackfillConstructionOrganizationCandidateProjectionProjectResult[] = []

  for (const projectRow of projectRows) {
    const currentProjectId = normalizeText(projectRow.id)
    if (!currentProjectId) continue
    const scenario = resolveScenarioFromProjectMetadata(readRecord(projectRow.metadata))
    if (!scenario) {
      projects.push(resultForProject({
        projectId: currentProjectId,
        status: 'skipped',
        reason: 'missing_complete_construction_organization_scenario_in_project_metadata',
        projectedCandidateEventCount: 0,
        assetKeys: [],
      }))
      continue
    }
    const candidateRows = await listCandidateRows({
      companyId,
      projectId: currentProjectId,
      queryExec,
    })
    const projectionRequest = resolveMissingProjectionOptionIds(scenario, candidateRows, forceReproject)
    const optionIds = projectionRequest.optionIds
    if (optionIds.length === 0) {
      projects.push(resultForProject({
        projectId: currentProjectId,
        status: 'already_has_projection_candidate',
        reason: null,
        projectedCandidateEventCount: 0,
        assetKeys: scenario.planOptions.map((option) => `construction_organization.plan_option.${option.optionId}`),
      }))
      continue
    }

    const taskRows = await listTaskProjectionRows({
      projectId: currentProjectId,
      queryExec,
    })
    const projectionRows = taskRows
      .map(buildProjectionRow)
      .filter((row): row is ConstructionOrganizationGeneratedRowProjectionInputRow => Boolean(row))
    if (projectionRows.length === 0) {
      projects.push(resultForProject({
        projectId: currentProjectId,
        status: 'skipped',
        reason: 'missing_generated_task_rows_for_projection',
        projectedCandidateEventCount: 0,
        assetKeys: optionIds.map((optionId) => `construction_organization.plan_option.${optionId}`),
      }))
      continue
    }

    const selectedScenario = filterSelectionToOptions(scenario, optionIds)
    const projectedScenario = projectConstructionOrganizationSelectionToGeneratedRows(
      selectedScenario as Parameters<typeof projectConstructionOrganizationSelectionToGeneratedRows>[0],
      projectionRows,
    )
    const assetKeys = projectedScenario.planOptions.map((option) => `construction_organization.plan_option.${option.optionId}`)

    if (dryRun) {
      projects.push(resultForProject({
        projectId: currentProjectId,
        status: 'projection_candidate_backfill_ready',
        reason: projectionRequest.reason,
        projectedCandidateEventCount: projectedScenario.planOptions.length,
        assetKeys,
      }))
      continue
    }

    const persisted = await persistConstructionOrganizationScenarioCandidateEvents({
      companyId,
      projectId: currentProjectId,
      selection: projectedScenario,
      queryExec,
    })
    projects.push(resultForProject({
      projectId: currentProjectId,
      status: 'projection_candidate_backfilled',
      reason: projectionRequest.reason,
      projectedCandidateEventCount: persisted.persistedEventCount,
      assetKeys: persisted.events.map((event) => event.assetKey),
    }))
  }

  const upgradedProjectCount = projects.filter((project) => project.status === 'projection_candidate_backfilled').length
  const upgradableProjectCount = projects.filter((project) =>
    project.status === 'projection_candidate_backfilled' || project.status === 'projection_candidate_backfill_ready',
  ).length

  return {
    source: 'construction_organization_candidate_projection_backfill_service',
    mode: dryRun ? 'dry_run' : 'apply',
    companyId,
    projectId,
    scannedProjectCount: projectRows.length,
    upgradableProjectCount,
    upgradedProjectCount,
    skippedProjectCount: projects.filter((project) => project.status === 'skipped').length,
    upgradedCandidateEventCount: projects.reduce((sum, project) => sum + project.projectedCandidateEventCount, 0),
    projects,
    boundaryPolicy: [
      'candidate_projection_backfill_is_governance_candidate_only',
      'force_reproject_is_explicit_and_candidate_only',
      'candidate_projection_backfill_does_not_claim_runtime_closeout',
      'generated_row_projection_enables_manual_review_package_and_draft_anchor_only',
      'runtime_publication_site_adoption_saved_outcome_consumer_observation_impact_monitoring_rollback_and_e1_e3_e5_runtime_evidence_still_required',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
}
