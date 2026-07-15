import { getProjectCompanyId } from '../auth/access.js'
import {
  resolveDurationContextPolicyRuntimeSelection,
} from './durationContextPolicySelectorService.js'
import type { ProgressVelocityLearningResult } from './progressVelocityLearningService.js'

export const PROJECT_PROGRESS_VELOCITY_PARAMETER_KEY = 'duration.project_progress_velocity_multiplier'

type RuntimeSelection = Awaited<ReturnType<typeof resolveDurationContextPolicyRuntimeSelection>>

export interface LoadPublishedProgressVelocityRuntimeInput {
  projectId?: string | null
  companyId?: string | null
  consumerKey: string
}

export interface ProgressVelocityRuntimePublicationDependencies {
  resolveCompanyId?: typeof getProjectCompanyId
  resolveRuntimeSelection?: typeof resolveDurationContextPolicyRuntimeSelection
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function boundedMultiplier(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0.75 && number <= 1.35 ? number : null
}

async function selectRuntimePublication(input: {
  projectId: string
  companyId: string
  consumerKey: string
  resolveRuntimeSelection: typeof resolveDurationContextPolicyRuntimeSelection
}) {
  const base = {
    parameterKey: PROJECT_PROGRESS_VELOCITY_PARAMETER_KEY,
    deterministicValue: 1,
    companyId: input.companyId,
    projectId: input.projectId,
  }
  const stable = await input.resolveRuntimeSelection(base)
  if (stable.runtimeApplied) return stable

  const canary = await input.resolveRuntimeSelection({
    ...base,
    consumptionMode: 'canary',
    canaryRuntimeBoundary: {
      consumerKey: input.consumerKey,
      scopeBoundary: 'project',
      stopConditionKeys: [
        'project_progress_velocity_mae_regression',
        'project_progress_velocity_overcompensation',
        'project_progress_velocity_scope_drift',
      ],
      monitoringWindowHours: 24 * 14,
      trafficSubjectKey: input.projectId,
    },
  })
  return canary.runtimeApplied ? canary : stable
}

function toLearningResult(selection: RuntimeSelection): ProgressVelocityLearningResult | null {
  const multiplier = boundedMultiplier(selection.selectedValue)
  if (!selection.runtimeApplied || multiplier == null) return null
  const canary = selection.consumptionMode === 'canary'
  return {
    durationRatio: multiplier,
    multiplier,
    confidenceLevel: canary ? 'medium' : 'high',
    confidenceScore: canary ? 75 : 90,
    confidenceDelta: canary ? 0 : 4,
    actionPolicy: 'auto_apply',
    sampleCount: canary ? 20 : 50,
    variance: 0,
    groupKey: `runtime_publication:${selection.scopeLevel ?? 'project'}`,
    excludedAnomalyTaskCount: 0,
    reason: canary
      ? 'A governed project velocity canary publication is active for this project and traffic subject.'
      : 'A governed stable project velocity publication is active for this project.',
    metadata: {
      source: 'progress_velocity_runtime_publication',
      parameterKey: selection.parameterKey,
      publicationKey: selection.publicationKey,
      publicationStatus: selection.publicationStatus,
      consumptionMode: selection.consumptionMode,
      scopeLevel: selection.scopeLevel,
      rollbackTarget: selection.rollbackTarget,
      runtimeAuthority: 'published_parameter_only',
      rawSampleConsumption: false,
    },
  }
}

export async function loadPublishedProgressVelocityRuntime(
  input: LoadPublishedProgressVelocityRuntimeInput,
  dependencies: ProgressVelocityRuntimePublicationDependencies = {},
) {
  const projectId = normalizeText(input.projectId)
  const consumerKey = normalizeText(input.consumerKey)
  if (!projectId || !consumerKey) return null
  const companyId = normalizeText(input.companyId)
    || normalizeText(await (dependencies.resolveCompanyId ?? getProjectCompanyId)(projectId))
  if (!companyId) return null

  const selection = await selectRuntimePublication({
    projectId,
    companyId,
    consumerKey,
    resolveRuntimeSelection: dependencies.resolveRuntimeSelection ?? resolveDurationContextPolicyRuntimeSelection,
  })
  return toLearningResult(selection)
}
