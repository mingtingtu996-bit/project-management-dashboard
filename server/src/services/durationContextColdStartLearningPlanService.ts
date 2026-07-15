import { supabase } from './dbService.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'

export interface BuildDurationContextColdStartLearningPlanInput {
  projectIds?: string[] | null
  asOfDate?: string | null
  limit?: number | null
}

type DurationContextLearningStage =
  | 'shadow_logging'
  | 'data_quality_diagnostics'
  | 'factor_attribution'
  | 'candidate_parameter_learning'
  | 'offline_replay'
  | 'canary_candidate_generation'
  | 'activation_readiness_review'
  | 'controlled_trial_review'

type DurationContextMaturityStage =
  | 'day_0_shadow_logging'
  | 'day_7_diagnostics'
  | 'day_30_candidate_learning'
  | 'day_60_shadow_replay'
  | 'day_90_controlled_trial_review'

type DurationContextAutomationLevel =
  | 'shadow_logging_only'
  | 'diagnostics_only'
  | 'candidate_parameter_learning'
  | 'offline_replay_and_canary_candidate_review'
  | 'controlled_trial_review_eligible'

interface ProjectRow {
  id?: string | null
  start_date?: string | null
  planned_start_date?: string | null
  created_at?: string | null
}

interface EvidenceRow {
  project_id?: string | null
  sample_date?: string | null
  started_at?: string | null
  completed_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  snapshot_date?: string | null
  decision_date?: string | null
  window_end_date?: string | null
  reward_status?: string | null
  status?: string | null
}

interface ProjectEvidence {
  durationExperienceSampleCount: number
  dailySnapshotCount: number
  policyDecisionCount: number
  evaluatedPolicyDecisionCount: number
  productivityCalibrationCount: number
}

const ALL_LEARNING_STAGES: DurationContextLearningStage[] = [
  'shadow_logging',
  'data_quality_diagnostics',
  'factor_attribution',
  'candidate_parameter_learning',
  'offline_replay',
  'canary_candidate_generation',
  'activation_readiness_review',
  'controlled_trial_review',
]

const AUTOMATION_RANK: Record<DurationContextAutomationLevel, number> = {
  shadow_logging_only: 0,
  diagnostics_only: 1,
  candidate_parameter_learning: 2,
  offline_replay_and_canary_candidate_review: 3,
  controlled_trial_review_eligible: 4,
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

function normalizeProjectIds(projectIds: string[] | null | undefined) {
  return Array.isArray(projectIds)
    ? projectIds.map((projectId) => normalizeId(projectId)).filter((projectId): projectId is string => Boolean(projectId))
    : []
}

function rowProjectId(row: EvidenceRow) {
  return normalizeId(row.project_id)
}

function rowDate(row: EvidenceRow, dateColumns: Array<keyof EvidenceRow>) {
  for (const column of dateColumns) {
    const date = normalizeText(row[column])
    if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10)
  }
  return null
}

function isOnOrBefore(row: EvidenceRow, dateColumns: Array<keyof EvidenceRow>, asOfDate: string) {
  const date = rowDate(row, dateColumns)
  return !date || date <= asOfDate
}

async function selectRows<T>(table: string): Promise<T[]> {
  const { data, error } = await (supabase as any)
    .from(table)
    .select('*')
  if (error || !Array.isArray(data)) return []
  return data as T[]
}

function countProjectRows(
  rows: EvidenceRow[],
  projectId: string,
  asOfDate: string,
  dateColumns: Array<keyof EvidenceRow>,
  predicate: (row: EvidenceRow) => boolean = () => true,
) {
  return rows.filter((row) => rowProjectId(row) === projectId && isOnOrBefore(row, dateColumns, asOfDate) && predicate(row)).length
}

function projectStartDate(project: ProjectRow) {
  return normalizeDate(project.start_date ?? project.planned_start_date ?? project.created_at)
}

function buildProjectEvidence(
  projectId: string,
  asOfDate: string,
  rows: {
    durationExperienceSamples: EvidenceRow[]
    projectDailySnapshot: EvidenceRow[]
    policyDecisions: EvidenceRow[]
    projectProductivityCalibrations: EvidenceRow[]
  },
): ProjectEvidence {
  return {
    durationExperienceSampleCount: countProjectRows(rows.durationExperienceSamples, projectId, asOfDate, [
      'sample_date',
      'completed_at',
      'started_at',
      'created_at',
      'updated_at',
    ]),
    dailySnapshotCount: countProjectRows(rows.projectDailySnapshot, projectId, asOfDate, ['snapshot_date']),
    policyDecisionCount: countProjectRows(rows.policyDecisions, projectId, asOfDate, ['decision_date']),
    evaluatedPolicyDecisionCount: countProjectRows(
      rows.policyDecisions,
      projectId,
      asOfDate,
      ['decision_date'],
      (row) => normalizeText(row.reward_status) === 'evaluated',
    ),
    productivityCalibrationCount: countProjectRows(
      rows.projectProductivityCalibrations,
      projectId,
      asOfDate,
      ['window_end_date'],
    ),
  }
}

function resolveMaturity(daysSinceStart: number, evidence: ProjectEvidence): {
  maturityStage: DurationContextMaturityStage
  allowedAutomationLevel: DurationContextAutomationLevel
  allowedStages: DurationContextLearningStage[]
  blockedStages: DurationContextLearningStage[]
} {
  const readyForCandidateLearning = daysSinceStart >= 30
    && evidence.durationExperienceSampleCount >= 30
    && evidence.dailySnapshotCount >= 30
  const readyForOfflineReplay = daysSinceStart >= 60
    && evidence.durationExperienceSampleCount >= 60
    && evidence.dailySnapshotCount >= 60
    && evidence.evaluatedPolicyDecisionCount >= 10
    && evidence.productivityCalibrationCount >= 1
  const readyForTrialReview = daysSinceStart >= 90
    && evidence.durationExperienceSampleCount >= 90
    && evidence.dailySnapshotCount >= 90
    && evidence.evaluatedPolicyDecisionCount >= 30
    && evidence.productivityCalibrationCount >= 2

  if (readyForTrialReview) {
    return {
      maturityStage: 'day_90_controlled_trial_review',
      allowedAutomationLevel: 'controlled_trial_review_eligible',
      allowedStages: ALL_LEARNING_STAGES,
      blockedStages: [],
    }
  }

  if (readyForOfflineReplay) {
    const allowedStages: DurationContextLearningStage[] = [
      'shadow_logging',
      'candidate_parameter_learning',
      'offline_replay',
      'canary_candidate_generation',
    ]
    return {
      maturityStage: 'day_60_shadow_replay',
      allowedAutomationLevel: 'offline_replay_and_canary_candidate_review',
      allowedStages,
      blockedStages: ALL_LEARNING_STAGES.filter((stage) => !allowedStages.includes(stage)),
    }
  }

  if (readyForCandidateLearning) {
    const allowedStages: DurationContextLearningStage[] = [
      'shadow_logging',
      'data_quality_diagnostics',
      'factor_attribution',
      'candidate_parameter_learning',
    ]
    return {
      maturityStage: 'day_30_candidate_learning',
      allowedAutomationLevel: 'candidate_parameter_learning',
      allowedStages,
      blockedStages: ALL_LEARNING_STAGES.filter((stage) => !allowedStages.includes(stage)),
    }
  }

  if (daysSinceStart >= 7 && (evidence.dailySnapshotCount > 0 || evidence.policyDecisionCount > 0 || evidence.durationExperienceSampleCount > 0)) {
    const allowedStages: DurationContextLearningStage[] = [
      'shadow_logging',
      'data_quality_diagnostics',
      'factor_attribution',
    ]
    return {
      maturityStage: 'day_7_diagnostics',
      allowedAutomationLevel: 'diagnostics_only',
      allowedStages,
      blockedStages: ALL_LEARNING_STAGES.filter((stage) => !allowedStages.includes(stage)),
    }
  }

  return {
    maturityStage: 'day_0_shadow_logging',
    allowedAutomationLevel: 'shadow_logging_only',
    allowedStages: ['shadow_logging'],
    blockedStages: ALL_LEARNING_STAGES.filter((stage) => stage !== 'shadow_logging'),
  }
}

function lowestCommonAutomationLevel(levels: DurationContextAutomationLevel[]): DurationContextAutomationLevel {
  if (levels.length === 0) return 'shadow_logging_only'
  return levels.reduce<DurationContextAutomationLevel>((lowest, current) => (
    AUTOMATION_RANK[current] < AUTOMATION_RANK[lowest] ? current : lowest
  ), levels[0])
}

export async function buildDurationContextColdStartLearningPlan(
  input: BuildDurationContextColdStartLearningPlanInput = {},
) {
  const asOfDate = normalizeDate(input.asOfDate)
  const requestedProjectIds = normalizeProjectIds(input.projectIds)
  const requestedProjectIdSet = requestedProjectIds.length > 0 ? new Set(requestedProjectIds) : null
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(input.limit ?? 500) || 500)))

  const [
    projectRows,
    durationExperienceSamples,
    projectDailySnapshot,
    policyDecisions,
    projectProductivityCalibrations,
  ] = await Promise.all([
    selectRows<ProjectRow>('projects'),
    selectRows<EvidenceRow>('duration_experience_samples'),
    selectRows<EvidenceRow>('project_daily_snapshot'),
    selectRows<EvidenceRow>('duration_context_policy_decisions'),
    selectRows<EvidenceRow>('project_productivity_compensation_calibrations'),
  ])

  const projects = projectRows
    .filter((project) => {
      const projectId = normalizeId(project.id)
      return projectId && (!requestedProjectIdSet || requestedProjectIdSet.has(projectId))
    })
    .slice(0, limit)

  const projectPlans = projects.map((project) => {
    const projectId = normalizeId(project.id) as string
    const startDate = projectStartDate(project)
    const daysSinceStart = Math.max(0, signedDurationDayDelta(startDate, asOfDate) ?? 0)
    const evidence = buildProjectEvidence(projectId, asOfDate, {
      durationExperienceSamples,
      projectDailySnapshot,
      policyDecisions,
      projectProductivityCalibrations,
    })
    const maturity = resolveMaturity(daysSinceStart, evidence)
    return {
      projectId,
      asOfDate,
      projectStartDate: startDate,
      daysSinceStart,
      runtimeMutationPolicy: 'none_maturity_gate_report_only' as const,
      ...maturity,
      evidence,
    }
  })

  const readyForCandidateLearningCount = projectPlans
    .filter((plan) => AUTOMATION_RANK[plan.allowedAutomationLevel] >= AUTOMATION_RANK.candidate_parameter_learning)
    .length
  const readyForOfflineReplayCount = projectPlans
    .filter((plan) => AUTOMATION_RANK[plan.allowedAutomationLevel] >= AUTOMATION_RANK.offline_replay_and_canary_candidate_review)
    .length
  const readyForTrialReviewCount = projectPlans
    .filter((plan) => plan.allowedAutomationLevel === 'controlled_trial_review_eligible')
    .length

  return {
    planCode: 'duration_context_cold_start_learning_plan' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_maturity_gate_report_only' as const,
    allowedAutomationLevel: lowestCommonAutomationLevel(projectPlans.map((plan) => plan.allowedAutomationLevel)),
    summary: {
      projectCount: projectPlans.length,
      readyForCandidateLearningCount,
      readyForOfflineReplayCount,
      readyForTrialReviewCount,
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    },
    projectPlans,
  }
}
