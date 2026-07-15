import type { AlgorithmSeedType } from './algorithmSeedRegistry.js'

export type AlgorithmSeedResolverRuntimeSource =
  | 'project_override'
  | 'company_override'
  | 'active_seed'
  | 'ts_seed_fallback'

export type DurationAssetRole =
  | 'system_bootstrap'
  | 'stable_runtime'
  | 'canary_runtime'
  | 'candidate_advisory'
  | 'evidence_reference'
  | 'governance_only'
  | 'retired'

export type EffectiveDurationAssetSource =
  | 'explicit_project_fact'
  | 'project_stable'
  | 'company_stable'
  | 'industry_stable'
  | 'system_stable'
  | 'system_bootstrap'
  | 'candidate_advisory'
  | 'none'

export type DurationAssetCanaryBoundary = {
  companyId: string
  projectId: string
  surface: string
  trafficKey: string
}

export type DurationAssetResolutionCandidate<T> = {
  stableCode: string
  assetType: string
  role: DurationAssetRole
  effectiveSource: Exclude<EffectiveDurationAssetSource, 'none'>
  value: T | null
  versionId: string | null
  publicationKey: string | null
  conflictCodes?: string[]
  rollbackTarget: string | null
  canaryBoundary?: DurationAssetCanaryBoundary | null
}

export type EffectiveDurationAssetResolution<T> = {
  stableCode: string
  assetType: string
  role: DurationAssetRole
  value: T | null
  effectiveSource: EffectiveDurationAssetSource
  versionId: string | null
  publicationKey: string | null
  suppressedSources: EffectiveDurationAssetSource[]
  conflictCodes: string[]
  runtimeConsumable: boolean
  rollbackTarget: string | null
}

const SOURCE_PRIORITY: Record<EffectiveDurationAssetSource, number> = {
  explicit_project_fact: 7,
  project_stable: 6,
  company_stable: 5,
  industry_stable: 4,
  system_stable: 3,
  system_bootstrap: 2,
  candidate_advisory: 1,
  none: 0,
}

const RUNTIME_ROLES = new Set<DurationAssetRole>([
  'system_bootstrap',
  'stable_runtime',
  'canary_runtime',
])

function text(value: unknown) {
  return String(value ?? '').trim()
}

function uniqueText(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(text).filter(Boolean)))
}

function hasExactCanaryBoundary(
  declared: DurationAssetCanaryBoundary | null | undefined,
  requested: DurationAssetCanaryBoundary | null | undefined,
) {
  if (!declared || !requested) return false
  const keys = ['companyId', 'projectId', 'surface', 'trafficKey'] as const
  return keys.every((key) => (
    text(declared[key])
    && text(requested[key])
    && text(declared[key]) === text(requested[key])
  ))
}

function isRuntimeCandidate<T>(
  candidate: DurationAssetResolutionCandidate<T>,
  canaryBoundary?: DurationAssetCanaryBoundary | null,
) {
  if (!RUNTIME_ROLES.has(candidate.role)) return false
  if (candidate.role !== 'canary_runtime') return true
  return hasExactCanaryBoundary(candidate.canaryBoundary, canaryBoundary)
}

function suppressedSources<T>(
  candidates: DurationAssetResolutionCandidate<T>[],
  selected: DurationAssetResolutionCandidate<T>,
) {
  return Array.from(new Set(
    candidates
      .filter((candidate) => candidate !== selected)
      .sort((left, right) => SOURCE_PRIORITY[right.effectiveSource] - SOURCE_PRIORITY[left.effectiveSource])
      .map((candidate) => candidate.effectiveSource),
  ))
}

export function mapAlgorithmSeedResolverSource(
  source: AlgorithmSeedResolverRuntimeSource,
): EffectiveDurationAssetSource {
  if (source === 'project_override') return 'project_stable'
  if (source === 'company_override') return 'company_stable'
  if (source === 'active_seed') return 'system_stable'
  return 'system_bootstrap'
}

export function classifyAlgorithmSeedRuntimeRole(
  _seedType: AlgorithmSeedType,
  source: AlgorithmSeedResolverRuntimeSource,
): DurationAssetRole {
  return source === 'ts_seed_fallback' ? 'system_bootstrap' : 'stable_runtime'
}

export function resolveEffectiveDurationAsset<T>(
  candidates: DurationAssetResolutionCandidate<T>[],
  options: { canaryBoundary?: DurationAssetCanaryBoundary | null } = {},
): EffectiveDurationAssetResolution<T> {
  const ordered = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => (
      SOURCE_PRIORITY[right.candidate.effectiveSource] - SOURCE_PRIORITY[left.candidate.effectiveSource]
      || left.index - right.index
    ))
    .map(({ candidate }) => candidate)

  const selectedRuntime = ordered.find((candidate) => (
    isRuntimeCandidate(candidate, options.canaryBoundary)
  ))
  const selectedAdvisory = ordered.find((candidate) => candidate.role === 'candidate_advisory')
  const selected = selectedRuntime ?? selectedAdvisory ?? ordered[0] ?? null

  if (!selected) {
    return {
      stableCode: '',
      assetType: '',
      role: 'governance_only',
      value: null,
      effectiveSource: 'none',
      versionId: null,
      publicationKey: null,
      suppressedSources: [],
      conflictCodes: ['no_runtime_consumable_asset'],
      runtimeConsumable: false,
      rollbackTarget: null,
    }
  }

  const conflicts = uniqueText(selected.conflictCodes ?? [])
  const runtimeConsumable = Boolean(
    selectedRuntime
    && selected === selectedRuntime
    && conflicts.length === 0,
  )
  const advisorySelected = selected.role === 'candidate_advisory'

  return {
    stableCode: text(selected.stableCode),
    assetType: text(selected.assetType),
    role: selected.role,
    value: runtimeConsumable || advisorySelected ? selected.value : null,
    effectiveSource: runtimeConsumable || advisorySelected
      ? selected.effectiveSource
      : selectedRuntime === selected && conflicts.length > 0
        ? selected.effectiveSource
        : 'none',
    versionId: selected.versionId,
    publicationKey: selected.publicationKey,
    suppressedSources: suppressedSources(ordered, selected),
    conflictCodes: conflicts.length > 0
      ? conflicts
      : runtimeConsumable || advisorySelected
        ? []
        : ['no_runtime_consumable_asset'],
    runtimeConsumable,
    rollbackTarget: selected.rollbackTarget,
  }
}
