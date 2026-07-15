import { query as rawQuery } from '../database.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'
import {
  buildConstructionOrganizationSelectorInputFromProjectFacts,
  selectConstructionOrganizationScenario,
} from './constructionOrganizationScenarioSelectorEngine.js'
import type { ConstructionOrganizationScenarioSelection } from '../types/constructionOrganizationScenario.js'
import {
  persistConstructionOrganizationScenarioCandidateEvents,
} from './constructionOrganizationScenarioGovernanceService.js'

export type BackfillConstructionOrganizationCandidateAnchorsInput = {
  companyId: string
  projectId?: string | null
  limit?: number | null
  dryRun?: boolean
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export type BackfillConstructionOrganizationCandidateAnchorProjectResult = {
  projectId: string
  status: 'candidate_anchor_backfilled' | 'candidate_anchor_backfill_ready' | 'already_has_candidate_anchor' | 'skipped'
  reason: string | null
  candidateEventCount: number
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

export type BackfillConstructionOrganizationCandidateAnchorsResult = {
  source: 'construction_organization_candidate_anchor_backfill_service'
  mode: 'dry_run' | 'apply'
  companyId: string
  projectId: string | null
  scannedProjectCount: number
  backfillableProjectCount: number
  backfilledProjectCount: number
  skippedProjectCount: number
  candidateEventCount: number
  projects: BackfillConstructionOrganizationCandidateAnchorProjectResult[]
  boundaryPolicy: string[]
}

type ProjectCandidateRow = {
  id: string
  metadata?: unknown
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
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const integer = Math.floor(parsed)
  return integer > 0 ? integer : fallback
}

function defaultMutationBoundary(): BackfillConstructionOrganizationCandidateAnchorProjectResult['mutationBoundary'] {
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

function filterSelectionToAssetKeys(
  scenario: ConstructionOrganizationScenarioSelection,
  assetKeys: string[],
): ConstructionOrganizationScenarioSelection {
  const allowedOptionIds = new Set(assetKeys.map((assetKey) => assetKey.replace(/^construction_organization\.plan_option\./, '')))
  return {
    ...scenario,
    planOptions: scenario.planOptions.filter((option) => allowedOptionIds.has(option.optionId)),
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
      && Object.keys(readRecord(evaluation.networkEvaluation)).length > 0
      && Object.keys(readRecord(evaluation.engineEvaluationSummary)).length > 0,
    )
  })
}

function resolveScenarioFromProjectMetadata(metadata: Record<string, unknown>): {
  scenario: ConstructionOrganizationScenarioSelection | null
  reason: string | null
} {
  const existingScenario = readRecord(metadata.constructionOrganizationScenario ?? metadata.construction_organization_scenario)
  if (hasPersistableScenarioShape(existingScenario)) {
    return {
      scenario: existingScenario as unknown as ConstructionOrganizationScenarioSelection,
      reason: null,
    }
  }

  const facts = readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts)
  if (Object.keys(facts).length === 0) {
    return {
      scenario: null,
      reason: 'missing_construction_organization_scenario_and_project_generation_facts',
    }
  }

  const selected = selectConstructionOrganizationScenario(
    buildConstructionOrganizationSelectorInputFromProjectFacts(facts, {
      projectTypeCode: normalizeText(facts.businessType),
      onboardingMode: normalizeText(facts.mode ?? facts.onboardingMode ?? facts.onboarding_mode),
      onboardingSubstage: normalizeText(facts.onboardingSubstage ?? facts.onboarding_substage),
      onboardingPhaseProgress: readRecord(facts.onboardingPhaseProgress ?? facts.onboarding_phase_progress),
      onboardingPassedMilestones: readArray(facts.onboardingPassedMilestones ?? facts.onboarding_passed_milestones)
        .map((value) => normalizeText(value))
        .filter((value): value is string => Boolean(value)),
    }),
  )
  return {
    scenario: selected,
    reason: null,
  }
}

async function defaultQueryExec<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  // database-query-dynamic-approved: local adapter for this service's fixed, parameterized SQL templates only.
  const result = await rawQuery(sql, params as any[])
  return (result.rows ?? []) as T[]
}

async function listProjectsForBackfill(input: Required<Pick<BackfillConstructionOrganizationCandidateAnchorsInput, 'companyId'>> & {
  projectId?: string | null
  limit: number
  queryExec: AlgorithmAssetGovernanceQueryExec
}) {
  if (normalizeText(input.projectId)) {
    return input.queryExec<ProjectCandidateRow>(`
      SELECT id, metadata
      FROM public.projects
      WHERE company_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
    `, [input.companyId, input.projectId])
  }
  return input.queryExec<ProjectCandidateRow>(`
    SELECT id, metadata
    FROM public.projects
    WHERE company_id = $1::uuid
      AND COALESCE(metadata, '{}'::jsonb) ?| ARRAY['constructionOrganizationScenario', 'construction_organization_scenario', 'projectGenerationFacts', 'project_generation_facts']
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT $2
  `, [input.companyId, input.limit])
}

async function existingCandidateAnchorAssetKeys(input: {
  companyId: string
  projectId: string
  assetKeys: string[]
  queryExec: AlgorithmAssetGovernanceQueryExec
}) {
  const assetKeys = [...new Set(input.assetKeys.map((key) => normalizeText(key)).filter((key): key is string => Boolean(key)))]
  if (assetKeys.length === 0) return new Set<string>()
  const rows = await input.queryExec<{ asset_key?: string | null }>(`
    SELECT asset_key
    FROM public.algorithm_asset_candidate_events
    WHERE company_id = $1::uuid
      AND project_id = $2::uuid
      AND source_module = $3
      AND asset_key = ANY($4::text[])
      AND event_status IN ('candidate', 'review_required', 'replay_ready', 'runtime_published')
  `, [
    input.companyId,
    input.projectId,
    'constructionOrganizationScenarioGovernanceService',
    assetKeys,
  ])
  return new Set(rows.map((row) => normalizeText(row.asset_key)).filter((key): key is string => Boolean(key)))
}

export async function backfillConstructionOrganizationCandidateAnchors(
  input: BackfillConstructionOrganizationCandidateAnchorsInput,
): Promise<BackfillConstructionOrganizationCandidateAnchorsResult> {
  const companyId = normalizeText(input.companyId)
  if (!companyId) {
    throw new Error('company_id_required_for_construction_organization_candidate_anchor_backfill')
  }
  const dryRun = input.dryRun !== false
  const projectId = normalizeText(input.projectId)
  const limit = normalizePositiveInteger(input.limit, 50)
  const queryExec = input.queryExec ?? defaultQueryExec
  const projectRows = await listProjectsForBackfill({
    companyId,
    projectId,
    limit,
    queryExec,
  })
  const projects: BackfillConstructionOrganizationCandidateAnchorProjectResult[] = []

  for (const row of projectRows) {
    const currentProjectId = normalizeText(row.id)
    if (!currentProjectId) continue
    const { scenario, reason } = resolveScenarioFromProjectMetadata(readRecord(row.metadata))
    if (!scenario) {
      projects.push({
        projectId: currentProjectId,
        status: 'skipped',
        reason,
        candidateEventCount: 0,
        assetKeys: [],
        runtimeEffectPolicy: 'candidate_only',
        mutationBoundary: defaultMutationBoundary(),
      })
      continue
    }
    const expectedAssetKeys = scenario.planOptions.map((option) => `construction_organization.plan_option.${option.optionId}`)
    const existingAssetKeys = await existingCandidateAnchorAssetKeys({
      companyId,
      projectId: currentProjectId,
      assetKeys: expectedAssetKeys,
      queryExec,
    })
    const missingAssetKeys = expectedAssetKeys.filter((assetKey) => !existingAssetKeys.has(assetKey))
    if (missingAssetKeys.length === 0) {
      projects.push({
        projectId: currentProjectId,
        status: 'already_has_candidate_anchor',
        reason: null,
        candidateEventCount: 0,
        assetKeys: expectedAssetKeys,
        runtimeEffectPolicy: 'candidate_only',
        mutationBoundary: defaultMutationBoundary(),
      })
      continue
    }
    if (dryRun) {
      projects.push({
        projectId: currentProjectId,
        status: 'candidate_anchor_backfill_ready',
        reason: null,
        candidateEventCount: missingAssetKeys.length,
        assetKeys: missingAssetKeys,
        runtimeEffectPolicy: 'candidate_only',
        mutationBoundary: defaultMutationBoundary(),
      })
      continue
    }
    const persisted = await persistConstructionOrganizationScenarioCandidateEvents({
      companyId,
      projectId: currentProjectId,
      selection: filterSelectionToAssetKeys(scenario, missingAssetKeys),
      queryExec,
    })
    projects.push({
      projectId: currentProjectId,
      status: 'candidate_anchor_backfilled',
      reason: null,
      candidateEventCount: persisted.persistedEventCount,
      assetKeys: persisted.events.map((event) => event.assetKey),
      runtimeEffectPolicy: 'candidate_only',
      mutationBoundary: defaultMutationBoundary(),
    })
  }

  const backfilledProjectCount = projects.filter((project) => project.status === 'candidate_anchor_backfilled').length
  const backfillableProjectCount = projects.filter((project) =>
    project.status === 'candidate_anchor_backfilled' || project.status === 'candidate_anchor_backfill_ready',
  ).length
  return {
    source: 'construction_organization_candidate_anchor_backfill_service',
    mode: dryRun ? 'dry_run' : 'apply',
    companyId,
    projectId,
    scannedProjectCount: projectRows.length,
    backfillableProjectCount,
    backfilledProjectCount,
    skippedProjectCount: projects.filter((project) => project.status === 'skipped').length,
    candidateEventCount: projects.reduce((sum, project) => sum + project.candidateEventCount, 0),
    projects,
    boundaryPolicy: [
      'candidate_anchor_backfill_is_governance_candidate_only',
      'candidate_anchor_presence_does_not_claim_runtime_closeout',
      'runtime_publication_site_adoption_saved_outcome_consumer_observation_impact_monitoring_rollback_and_e1_e3_e5_runtime_evidence_still_required',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
}
