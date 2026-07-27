import type {
  DurationLearningFactSource,
  DurationLearningReuseScope,
} from './durationLearningAssetAutomationPolicyService.js'

export type ExperienceTier = 'T1' | 'T2' | 'T3'

export type ExperienceReuseScope = DurationLearningReuseScope
export type ExperienceFactSource = DurationLearningFactSource

export type ExperienceAssetRegistryDefinition = {
  assetType: string
  allowedReuseScopes: ExperienceReuseScope[]
  allowedFactSources: ExperienceFactSource[]
  defaultReuseScope: ExperienceReuseScope
  defaultFactSource: ExperienceFactSource
}

export type ExperienceTierRegistryEntry = {
  tier: ExperienceTier
  label: string
  description: string
  reusableAtNodeTypes: string[]
  forbiddenNodeTypes: string[]
  allowedAssetTypes: string[]
  assetDefinitions: ExperienceAssetRegistryDefinition[]
  groupKeyStrategy: string
  prohibitsCrossTierBucketMixing: boolean
  runtimePublicationRequired: true
}

export type ExperienceTierCandidateAssessment = {
  status: 'tier_candidate_valid' | 'tier_candidate_rejected'
  tier: ExperienceTier | null
  assetType: string | null
  reuseScope: ExperienceReuseScope | null
  factSource: ExperienceFactSource | null
  identityResolution: 'explicit' | 'registry_default'
  acceptedGroupKeys: string[]
  rejectedReasons: string[]
}

const EXPERIENCE_TIER_REGISTRY: ExperienceTierRegistryEntry[] = [
  {
    tier: 'T1',
    label: 'process_dependency_rhythm',
    description: 'Process-level task duration, lag, dependency order, and operation rhythm experience.',
    reusableAtNodeTypes: ['process', 'activity_step', 'task'],
    forbiddenNodeTypes: ['division', 'subdivision', 'project'],
    allowedAssetTypes: ['process_duration', 'dependency_order', 'task_lag_rule'],
    assetDefinitions: [
      {
        assetType: 'process_duration',
        allowedReuseScopes: ['project', 'company', 'industry', 'global'],
        allowedFactSources: ['actual_outcome', 'replay', 'hybrid'],
        defaultReuseScope: 'project',
        defaultFactSource: 'actual_outcome',
      },
      {
        assetType: 'dependency_order',
        allowedReuseScopes: ['project', 'company', 'industry', 'global'],
        allowedFactSources: ['actual_outcome', 'behavioral_change', 'replay', 'hybrid'],
        defaultReuseScope: 'project',
        defaultFactSource: 'hybrid',
      },
      {
        assetType: 'task_lag_rule',
        allowedReuseScopes: ['project', 'company', 'industry', 'global'],
        allowedFactSources: ['actual_outcome', 'behavioral_change', 'replay', 'hybrid'],
        defaultReuseScope: 'project',
        defaultFactSource: 'hybrid',
      },
    ],
    groupKeyStrategy: 'standard_work_process_dependency',
    prohibitsCrossTierBucketMixing: true,
    runtimePublicationRequired: true,
  },
  {
    tier: 'T2',
    label: 'division_subdivision_rhythm',
    description: 'Division/subdivision-level rhythm, overlap depth, workface cadence, and handover gate experience.',
    reusableAtNodeTypes: ['division', 'subdivision'],
    forbiddenNodeTypes: ['process', 'activity_step', 'task', 'project'],
    allowedAssetTypes: ['t2_division_rhythm_template', 'division_overlap_model', 'subdivision_handover_gate'],
    assetDefinitions: [
      {
        assetType: 't2_division_rhythm_template',
        allowedReuseScopes: ['project', 'company', 'industry', 'global'],
        allowedFactSources: ['actual_outcome', 'behavioral_change', 'replay', 'hybrid'],
        defaultReuseScope: 'company',
        defaultFactSource: 'hybrid',
      },
      {
        assetType: 'division_overlap_model',
        allowedReuseScopes: ['project', 'company', 'industry'],
        allowedFactSources: ['actual_outcome', 'behavioral_change', 'replay', 'hybrid'],
        defaultReuseScope: 'company',
        defaultFactSource: 'hybrid',
      },
      {
        assetType: 'subdivision_handover_gate',
        allowedReuseScopes: ['project', 'company', 'industry'],
        allowedFactSources: ['actual_outcome', 'behavioral_change', 'replay', 'hybrid'],
        defaultReuseScope: 'company',
        defaultFactSource: 'hybrid',
      },
    ],
    groupKeyStrategy: 'business_type_phase_division_subdivision_workface',
    prohibitsCrossTierBucketMixing: true,
    runtimePublicationRequired: true,
  },
  {
    tier: 'T3',
    label: 'project_organization_efficiency',
    description: 'Project-level organization profile, productivity, delivery model, and whole-project efficiency experience.',
    reusableAtNodeTypes: ['project', 'building', 'zone'],
    forbiddenNodeTypes: ['process', 'activity_step', 'task', 'division', 'subdivision'],
    allowedAssetTypes: ['project_efficiency_model', 'construction_organization_profile', 's_curve_state_model'],
    assetDefinitions: [
      {
        assetType: 'project_efficiency_model',
        allowedReuseScopes: ['project', 'company', 'industry'],
        allowedFactSources: ['actual_outcome', 'behavioral_change', 'replay', 'hybrid'],
        defaultReuseScope: 'project',
        defaultFactSource: 'actual_outcome',
      },
      {
        assetType: 'construction_organization_profile',
        allowedReuseScopes: ['project', 'company', 'industry'],
        allowedFactSources: ['actual_outcome', 'behavioral_change', 'replay', 'hybrid'],
        defaultReuseScope: 'project',
        defaultFactSource: 'hybrid',
      },
      {
        assetType: 's_curve_state_model',
        allowedReuseScopes: ['project', 'company'],
        allowedFactSources: ['actual_outcome', 'replay', 'hybrid'],
        defaultReuseScope: 'project',
        defaultFactSource: 'actual_outcome',
      },
    ],
    groupKeyStrategy: 'business_type_scale_region_delivery_model',
    prohibitsCrossTierBucketMixing: true,
    runtimePublicationRequired: true,
  },
]

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeTier(value: unknown): ExperienceTier | null {
  const normalized = normalizeText(value).toUpperCase()
  return normalized === 'T1' || normalized === 'T2' || normalized === 'T3' ? normalized : null
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(normalizeText).filter(Boolean)
    : []
}

function normalizeReuseScope(value: unknown): ExperienceReuseScope | null {
  const normalized = normalizeText(value).toLowerCase()
  return ['project', 'company', 'industry', 'global'].includes(normalized)
    ? normalized as ExperienceReuseScope
    : null
}

function normalizeFactSource(value: unknown): ExperienceFactSource | null {
  const normalized = normalizeText(value).toLowerCase()
  return ['actual_outcome', 'behavioral_change', 'replay', 'hybrid'].includes(normalized)
    ? normalized as ExperienceFactSource
    : null
}

export function listExperienceTierRegistry() {
  return EXPERIENCE_TIER_REGISTRY.map((entry) => ({
    ...entry,
    reusableAtNodeTypes: [...entry.reusableAtNodeTypes],
    forbiddenNodeTypes: [...entry.forbiddenNodeTypes],
    allowedAssetTypes: [...entry.allowedAssetTypes],
    assetDefinitions: entry.assetDefinitions.map((definition) => ({
      ...definition,
      allowedReuseScopes: [...definition.allowedReuseScopes],
      allowedFactSources: [...definition.allowedFactSources],
    })),
  }))
}

export function getExperienceTierRegistryEntry(tier: ExperienceTier | string | null | undefined) {
  const normalizedTier = normalizeTier(tier)
  if (!normalizedTier) return null
  return listExperienceTierRegistry().find((entry) => entry.tier === normalizedTier) ?? null
}

export function assessExperienceTierCandidatePayload(payload: unknown): ExperienceTierCandidateAssessment {
  const record = readRecord(payload)
  const tier = normalizeTier(record.experienceTier ?? record.tier)
  const entry = getExperienceTierRegistryEntry(tier)
  const rejectedReasons: string[] = []
  if (!tier || !entry) {
    return {
      status: 'tier_candidate_rejected',
      tier,
      assetType: null,
      reuseScope: null,
      factSource: null,
      identityResolution: 'registry_default',
      acceptedGroupKeys: [],
      rejectedReasons: ['unknown_experience_tier'],
    }
  }

  const allowedNodeTypes = new Set(entry.reusableAtNodeTypes)
  for (const nodeType of readStringArray(record.wbsNodeTypes)) {
    if (!allowedNodeTypes.has(nodeType)) {
      rejectedReasons.push(`unsupported_node_type:${nodeType}`)
    }
  }

  const assetType = normalizeText(record.experienceAssetType ?? record.assetType ?? record.asset_type)
  const assetDefinition = entry.assetDefinitions.find((definition) => definition.assetType === assetType) ?? null
  if (!assetType) {
    rejectedReasons.push('missing_experience_asset_type')
  } else if (!entry.allowedAssetTypes.includes(assetType)) {
    rejectedReasons.push(`unsupported_experience_asset_type:${assetType}`)
  }

  const rawReuseScope = normalizeText(record.reuseScope ?? record.reuse_scope)
  const rawFactSource = normalizeText(record.factSource ?? record.fact_source)
  const normalizedReuseScope = normalizeReuseScope(rawReuseScope)
  const normalizedFactSource = normalizeFactSource(rawFactSource)
  const reuseScope = rawReuseScope ? normalizedReuseScope : assetDefinition?.defaultReuseScope ?? null
  const factSource = rawFactSource ? normalizedFactSource : assetDefinition?.defaultFactSource ?? null
  const identityResolution = rawReuseScope && rawFactSource ? 'explicit' : 'registry_default'

  if (rawReuseScope && !normalizedReuseScope) {
    rejectedReasons.push(`unsupported_reuse_scope:${rawReuseScope}`)
  } else if (reuseScope && assetDefinition && !assetDefinition.allowedReuseScopes.includes(reuseScope)) {
    rejectedReasons.push(`unsupported_reuse_scope:${reuseScope}`)
  }
  if (rawFactSource && !normalizedFactSource) {
    rejectedReasons.push(`unsupported_fact_source:${rawFactSource}`)
  } else if (factSource && assetDefinition && !assetDefinition.allowedFactSources.includes(factSource)) {
    rejectedReasons.push(`unsupported_fact_source:${factSource}`)
  }

  const projectIds = readStringArray(record.projectIds ?? record.project_ids)
  const projectId = normalizeText(record.projectId ?? record.project_id)
  if (reuseScope === 'project' && !projectId && projectIds.length === 0) {
    rejectedReasons.push('project_id_required_for_project_reuse_scope')
  }
  const companyId = normalizeText(record.companyId ?? record.company_id)
  if (reuseScope === 'company' && !companyId) {
    rejectedReasons.push('company_id_required_for_company_reuse_scope')
  }

  const acceptedGroupKeys: string[] = []
  const prefix = `${tier}:`
  for (const groupKey of readStringArray(record.experienceGroupKeys)) {
    if (!groupKey.startsWith(prefix)) {
      rejectedReasons.push(`cross_tier_group_key:${groupKey}`)
      continue
    }
    acceptedGroupKeys.push(groupKey)
  }

  if (acceptedGroupKeys.length === 0) {
    rejectedReasons.push('missing_valid_tier_group_key')
  }

  return {
    status: rejectedReasons.length === 0 ? 'tier_candidate_valid' : 'tier_candidate_rejected',
    tier,
    assetType: assetType || null,
    reuseScope,
    factSource,
    identityResolution,
    acceptedGroupKeys,
    rejectedReasons,
  }
}
