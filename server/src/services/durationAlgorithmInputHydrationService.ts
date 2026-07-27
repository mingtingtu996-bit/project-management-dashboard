import {
  mergeLiveProjectGenerationFactsForForecast,
  readLiveProjectGenerationContext,
} from './projectGenerationFactsStoreService.js'
import type { ConstructionOrganizationScenarioSelection } from './constructionOrganizationScenarioSelector.js'
import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'
import type { T2RhythmProductionCapacityEvidence } from './t2RhythmProductionCapacityEvidenceService.js'
import type { T2RhythmScheduleCandidateNetwork } from './t2RhythmScheduleCandidateNetworkService.js'
import type { T2RhythmScheduleCandidateNetworkPhase1Evaluation } from './t2RhythmScheduleCandidateNetworkEvaluationService.js'
import type { T2RhythmSchedulePhase1Selection } from './t2RhythmSchedulePhase1SelectionService.js'
import type { T2RhythmStandardLibraryTrustGate } from './t2RhythmStandardLibraryTrustGateService.js'

export type DurationAlgorithmHydrationPurpose =
  | 'template_generation'
  | 'new_task_reference'
  | 'execution_reference'
  | 'monthly_plan'
  | 'runtime_forecast'
  | 'schedule_acceleration'

export type DurationAlgorithmHydratableInput = {
  projectId?: string | null
  project_id?: string | null
  taskId?: string | null
  task_id?: string | null
  projectGenerationFacts?: Record<string, unknown> | null
  constructionOrganizationScenario?: ConstructionOrganizationScenarioSelection | null
  actualExecutionFacts?: Record<string, unknown> | null
  durationExperienceSignals?: Record<string, unknown> | null
  criticalPathEvidence?: Record<string, unknown> | null
  t2RhythmScheduleCandidatePackage?: T2RhythmScheduleCandidatePackage | null
  t2RhythmProductionCapacityEvidence?: T2RhythmProductionCapacityEvidence | null
  t2RhythmScheduleCandidateNetwork?: T2RhythmScheduleCandidateNetwork | null
  t2RhythmScheduleCandidateNetworkEvaluation?: T2RhythmScheduleCandidateNetworkPhase1Evaluation | null
  t2RhythmSchedulePhase1Selection?: T2RhythmSchedulePhase1Selection | null
  t2RhythmStandardLibraryTrustGate?: T2RhythmStandardLibraryTrustGate | null
}

export type DurationAlgorithmHydrationResult<T extends DurationAlgorithmHydratableInput> = T & {
  projectGenerationFacts?: Record<string, unknown> | null
  constructionOrganizationScenario?: ConstructionOrganizationScenarioSelection | null
  actualExecutionFacts?: Record<string, unknown> | null
  durationExperienceSignals?: Record<string, unknown> | null
  criticalPathEvidence?: Record<string, unknown> | null
  t2RhythmScheduleCandidatePackage?: T2RhythmScheduleCandidatePackage | null
  t2RhythmProductionCapacityEvidence?: T2RhythmProductionCapacityEvidence | null
  t2RhythmScheduleCandidateNetwork?: T2RhythmScheduleCandidateNetwork | null
  t2RhythmScheduleCandidateNetworkEvaluation?: T2RhythmScheduleCandidateNetworkPhase1Evaluation | null
  t2RhythmSchedulePhase1Selection?: T2RhythmSchedulePhase1Selection | null
  t2RhythmStandardLibraryTrustGate?: T2RhythmStandardLibraryTrustGate | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function hasFacts(value: unknown) {
  return Object.keys(readRecord(value)).length > 0
}

function hasConstructionOrganizationScenario(value: unknown) {
  return readRecord(value).source === 'construction_organization_scenario_selector'
}

function hasT2RhythmScheduleCandidatePackage(value: unknown) {
  return readRecord(value).source === 't2_division_rhythm_schedule_candidate_package'
}

function hasT2RhythmProductionCapacityEvidence(value: unknown) {
  return readRecord(value).source === 't2_rhythm_production_capacity_evidence'
}

function hasT2RhythmScheduleCandidateNetwork(value: unknown) {
  return readRecord(value).source === 't2_rhythm_schedule_candidate_network'
}

function hasT2RhythmScheduleCandidateNetworkEvaluation(value: unknown) {
  return readRecord(value).source === 't2_rhythm_schedule_candidate_network_phase1_evaluation'
}

function hasT2RhythmSchedulePhase1Selection(value: unknown) {
  return readRecord(value).source === 't2_rhythm_schedule_phase1_selection'
}

function hasT2RhythmStandardLibraryTrustGate(value: unknown) {
  return readRecord(value).source === 't2_rhythm_standard_library_live_replay_trust_gate'
}

function readProjectId(input: DurationAlgorithmHydratableInput) {
  return normalizeText(input.projectId ?? input.project_id)
}

function readTaskId(input: DurationAlgorithmHydratableInput) {
  return normalizeText(input.taskId ?? input.task_id)
}

export async function hydrateDurationAlgorithmInput<T extends DurationAlgorithmHydratableInput>(
  input: T,
  options: {
    purpose?: DurationAlgorithmHydrationPurpose
    allowLiveProjectReread?: boolean
  } = {},
): Promise<DurationAlgorithmHydrationResult<T>> {
  const projectId = readProjectId(input)
  const taskId = readTaskId(input)
  const explicitFacts = readRecord(input.projectGenerationFacts)
  const explicitConstructionOrganizationScenario = input.constructionOrganizationScenario ?? null
  const explicitActualExecutionFacts = input.actualExecutionFacts ?? null
  const explicitDurationExperienceSignals = input.durationExperienceSignals ?? null
  const explicitCriticalPathEvidence = input.criticalPathEvidence ?? null
  const explicitT2RhythmScheduleCandidatePackage = input.t2RhythmScheduleCandidatePackage ?? null
  const explicitT2RhythmProductionCapacityEvidence = input.t2RhythmProductionCapacityEvidence ?? null
  const explicitT2RhythmScheduleCandidateNetwork = input.t2RhythmScheduleCandidateNetwork ?? null
  const explicitT2RhythmScheduleCandidateNetworkEvaluation = input.t2RhythmScheduleCandidateNetworkEvaluation ?? null
  const explicitT2RhythmSchedulePhase1Selection = input.t2RhythmSchedulePhase1Selection ?? null
  const explicitT2RhythmStandardLibraryTrustGate = input.t2RhythmStandardLibraryTrustGate ?? null

  if (!projectId || (!options.allowLiveProjectReread && (
    taskId
    || hasFacts(explicitFacts)
    || hasConstructionOrganizationScenario(explicitConstructionOrganizationScenario)
    || hasFacts(explicitActualExecutionFacts)
    || hasFacts(explicitDurationExperienceSignals)
    || hasFacts(explicitCriticalPathEvidence)
    || hasT2RhythmScheduleCandidatePackage(explicitT2RhythmScheduleCandidatePackage)
    || hasT2RhythmProductionCapacityEvidence(explicitT2RhythmProductionCapacityEvidence)
    || hasT2RhythmScheduleCandidateNetwork(explicitT2RhythmScheduleCandidateNetwork)
    || hasT2RhythmScheduleCandidateNetworkEvaluation(explicitT2RhythmScheduleCandidateNetworkEvaluation)
    || hasT2RhythmSchedulePhase1Selection(explicitT2RhythmSchedulePhase1Selection)
    || hasT2RhythmStandardLibraryTrustGate(explicitT2RhythmStandardLibraryTrustGate)
  ))) {
    return input
  }

  const projectContext = await readLiveProjectGenerationContext(projectId)
  const mergedProjectFacts = options.allowLiveProjectReread
    ? mergeLiveProjectGenerationFactsForForecast(explicitFacts, projectContext.projectGenerationFacts)
    : { ...projectContext.projectGenerationFacts, ...explicitFacts }
  const constructionOrganizationScenario = hasConstructionOrganizationScenario(explicitConstructionOrganizationScenario)
    ? explicitConstructionOrganizationScenario
    : projectContext.constructionOrganizationScenario
  const t2RhythmScheduleCandidatePackage = hasT2RhythmScheduleCandidatePackage(explicitT2RhythmScheduleCandidatePackage)
    ? explicitT2RhythmScheduleCandidatePackage
    : projectContext.t2RhythmScheduleCandidatePackage
  const t2RhythmProductionCapacityEvidence = hasT2RhythmProductionCapacityEvidence(explicitT2RhythmProductionCapacityEvidence)
    ? explicitT2RhythmProductionCapacityEvidence
    : projectContext.t2RhythmProductionCapacityEvidence
  const t2RhythmScheduleCandidateNetwork = hasT2RhythmScheduleCandidateNetwork(explicitT2RhythmScheduleCandidateNetwork)
    ? explicitT2RhythmScheduleCandidateNetwork
    : projectContext.t2RhythmScheduleCandidateNetwork
  const t2RhythmScheduleCandidateNetworkEvaluation = hasT2RhythmScheduleCandidateNetworkEvaluation(explicitT2RhythmScheduleCandidateNetworkEvaluation)
    ? explicitT2RhythmScheduleCandidateNetworkEvaluation
    : projectContext.t2RhythmScheduleCandidateNetworkEvaluation
  const t2RhythmSchedulePhase1Selection = hasT2RhythmSchedulePhase1Selection(explicitT2RhythmSchedulePhase1Selection)
    ? explicitT2RhythmSchedulePhase1Selection
    : projectContext.t2RhythmSchedulePhase1Selection
  const t2RhythmStandardLibraryTrustGate = hasT2RhythmStandardLibraryTrustGate(explicitT2RhythmStandardLibraryTrustGate)
    ? explicitT2RhythmStandardLibraryTrustGate
    : projectContext.t2RhythmStandardLibraryTrustGate
  if (!hasFacts(mergedProjectFacts)
    && !constructionOrganizationScenario
    && !t2RhythmScheduleCandidatePackage
    && !t2RhythmProductionCapacityEvidence
    && !t2RhythmScheduleCandidateNetwork
    && !t2RhythmScheduleCandidateNetworkEvaluation
    && !t2RhythmSchedulePhase1Selection
    && !t2RhythmStandardLibraryTrustGate) return input

  return {
    ...input,
    ...(hasFacts(mergedProjectFacts)
      ? {
          projectGenerationFacts: {
            ...mergedProjectFacts,
            hydrationSource: options.purpose
              ? `project_metadata:${options.purpose}`
              : 'project_metadata',
          },
        }
      : {}),
    ...(constructionOrganizationScenario
      ? { constructionOrganizationScenario }
      : {}),
    ...(t2RhythmScheduleCandidatePackage
      ? { t2RhythmScheduleCandidatePackage }
      : {}),
    ...(t2RhythmProductionCapacityEvidence
      ? { t2RhythmProductionCapacityEvidence }
      : {}),
    ...(t2RhythmScheduleCandidateNetwork
      ? { t2RhythmScheduleCandidateNetwork }
      : {}),
    ...(t2RhythmScheduleCandidateNetworkEvaluation
      ? { t2RhythmScheduleCandidateNetworkEvaluation }
      : {}),
    ...(t2RhythmSchedulePhase1Selection
      ? { t2RhythmSchedulePhase1Selection }
      : {}),
    ...(t2RhythmStandardLibraryTrustGate
      ? { t2RhythmStandardLibraryTrustGate }
      : {}),
  }
}
