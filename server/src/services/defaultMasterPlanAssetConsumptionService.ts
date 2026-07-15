import {
  buildDurationAssetConsumptionReceipt,
  summarizeDurationAssetConsumption,
  type DurationAssetConsumptionReceipt,
  type DurationAssetConsumptionSummary,
  type DurationAssetEffectProjection,
} from './durationAssetConsumptionReceiptService.js'
import {
  classifyAlgorithmSeedRuntimeRole,
  mapAlgorithmSeedResolverSource,
  type AlgorithmSeedResolverRuntimeSource,
  type EffectiveDurationAssetResolution,
} from './durationAssetRuntimeContractService.js'
import type { AlgorithmSeedType } from './algorithmSeedRegistry.js'

type DefaultMasterPlanConsumptionRow = {
  clientRowId: string
  values: Record<string, unknown>
  predecessorDependencies?: Array<Record<string, unknown>> | null
  rowProjectionMode?: string | null
  durationSuggestion?: Record<string, unknown> | null
}

export type DefaultMasterPlanAssetConsumptionResult = {
  receipts: DurationAssetConsumptionReceipt[]
  summary: DurationAssetConsumptionSummary
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function resolverSource(value: unknown): AlgorithmSeedResolverRuntimeSource {
  const normalized = text(value)
  if (
    normalized === 'project_override'
    || normalized === 'company_override'
    || normalized === 'active_seed'
    || normalized === 'ts_seed_fallback'
  ) return normalized
  return 'ts_seed_fallback'
}

function runtimeResolution<T>(params: {
  seedType: AlgorithmSeedType
  assetType?: string
  stableCode: string
  value: T
  resolverSource?: unknown
  versionId?: unknown
  rollbackTarget?: unknown
}): EffectiveDurationAssetResolution<T> {
  const source = resolverSource(params.resolverSource)
  return {
    stableCode: params.stableCode,
    assetType: params.assetType ?? params.seedType,
    role: classifyAlgorithmSeedRuntimeRole(params.seedType, source),
    value: params.value,
    effectiveSource: mapAlgorithmSeedResolverSource(source),
    versionId: text(params.versionId) || null,
    publicationKey: null,
    suppressedSources: [],
    conflictCodes: [],
    runtimeConsumable: true,
    rollbackTarget: text(params.rollbackTarget) || null,
  }
}

function rowMetadata(row: DefaultMasterPlanConsumptionRow) {
  return record(row.values.standard_task_metadata ?? row.values.standardTaskMetadata)
}

function durationCalculation(row: DefaultMasterPlanConsumptionRow) {
  const metadata = rowMetadata(row)
  return record(
    metadata.durationAssetCalculation
      ?? metadata.duration_asset_calculation
      ?? row.values.duration_asset_calculation,
  )
}

function durationMapping(row: DefaultMasterPlanConsumptionRow) {
  const metadata = rowMetadata(row)
  return record(
    metadata.durationAssetMapping
      ?? metadata.duration_asset_mapping
      ?? row.values.duration_asset_mapping,
  )
}

function durationSuggestion(row: DefaultMasterPlanConsumptionRow) {
  return record(row.durationSuggestion ?? row.values.duration_suggestion)
}

function durationRiskRange(row: DefaultMasterPlanConsumptionRow) {
  const suggestion = durationSuggestion(row)
  const range = record(suggestion.durationRiskRange ?? suggestion.duration_risk_range)
  const p50 = number(
    suggestion.riskP50DurationDays
      ?? suggestion.risk_p50_duration_days
      ?? range.p50Days
      ?? range.p50_days
      ?? row.values.smart_reference_days,
  )
  return {
    p20: number(
      suggestion.riskP20DurationDays
        ?? suggestion.risk_p20_duration_days
        ?? range.p20Days
        ?? range.p20_days,
    ) ?? p50,
    p50,
    p80: number(
      suggestion.riskP80DurationDays
        ?? suggestion.risk_p80_duration_days
        ?? range.p80Days
        ?? range.p80_days,
    ) ?? p50,
  }
}

function baselineDurationProjection(row: DefaultMasterPlanConsumptionRow): DurationAssetEffectProjection {
  const calculation = durationCalculation(row)
  const finalRange = durationRiskRange(row)
  const baseline = number(
    calculation.realPlanSkeletonDurationDays
      ?? calculation.real_plan_skeleton_duration_days
      ?? calculation.baseSelectedDurationDays
      ?? calculation.base_selected_duration_days
      ?? finalRange.p50,
  )
  return {
    durationDays: baseline
      ? { p20: baseline, p50: baseline, p80: baseline }
      : null,
  }
}

function finalDurationProjection(row: DefaultMasterPlanConsumptionRow): DurationAssetEffectProjection {
  return { durationDays: durationRiskRange(row) }
}

function isScheduleDurationRow(row: DefaultMasterPlanConsumptionRow) {
  const metadata = rowMetadata(row)
  const projection = text(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode)
  const contribution = text(
    row.values.duration_contribution_mode
      ?? metadata.durationContributionMode
      ?? metadata.duration_contribution_mode,
  )
  return projection === 'schedule_row' && contribution === 'duration_bearing'
}

function buildStandardDurationReceipt(row: DefaultMasterPlanConsumptionRow) {
  const calculation = durationCalculation(row)
  const mapping = durationMapping(row)
  const stableCode = text(
    calculation.standardWorkDurationSeedStableCode
      ?? calculation.standard_work_duration_seed_stable_code
      ?? mapping.standardWorkDurationSeedStableCode
      ?? mapping.standard_work_duration_seed_stable_code,
  )
  if (!stableCode || !isScheduleDurationRow(row)) return null
  const authorityMode = text(
    mapping.standardWorkDurationAuthorityMode
      ?? mapping.standard_work_duration_authority_mode,
  )
  const processRollup = authorityMode === 'descendant_process_seed_rollup'
  const sourceStableCodeInput = mapping.standardWorkDurationSeedSourceStableCodes
    ?? mapping.standard_work_duration_seed_source_stable_codes
  const resolverVersionIdInput = mapping.standardWorkDurationSeedResolverVersionIds
    ?? mapping.standard_work_duration_seed_resolver_version_ids
  const sourceResolutionInput = mapping.standardWorkDurationSeedResolutions
    ?? mapping.standard_work_duration_seed_resolutions
  const sourceStableCodes = Array.isArray(sourceStableCodeInput)
    ? sourceStableCodeInput.map(text).filter(Boolean)
    : []
  const resolverVersionIds = Array.isArray(resolverVersionIdInput)
    ? resolverVersionIdInput.map(text).filter(Boolean)
    : []
  const sourceResolutions = Array.isArray(sourceResolutionInput)
    ? sourceResolutionInput.map(record)
    : []
  const outputUsesSystemAuthority = text(row.values.duration_authority) === 'system_standard_seed'
  const before = baselineDurationProjection(row)
  const after = outputUsesSystemAuthority ? finalDurationProjection(row) : before
  return buildDurationAssetConsumptionReceipt({
    consumer: 'wizard_master_plan',
    resolution: runtimeResolution({
      seedType: 'standard_work_duration',
      assetType: processRollup
        ? 'standard_work_duration_process_rollup'
        : 'standard_work_duration',
      stableCode,
      value: finalDurationProjection(row),
      resolverSource: calculation.standardWorkDurationSeedResolverSource
        ?? calculation.standard_work_duration_seed_resolver_source
        ?? mapping.standardWorkDurationSeedResolverSource
        ?? mapping.standard_work_duration_seed_resolver_source,
      versionId: calculation.standardWorkDurationSeedResolverVersionId
        ?? calculation.standard_work_duration_seed_resolver_version_id
        ?? mapping.standardWorkDurationSeedResolverVersionId
        ?? mapping.standard_work_duration_seed_resolver_version_id,
    }),
    before,
    after,
    targetRowIds: [row.clientRowId],
    reasonCodes: outputUsesSystemAuthority
      ? [
          'system_standard_duration_authority_applied',
          ...(processRollup ? ['descendant_process_seed_rollup_lineage_preserved'] : []),
        ]
      : ['system_standard_duration_authority_not_selected'],
    ...(processRollup
      ? {
          lineage: {
            authorityMode,
            sourceStableCodes,
            resolverVersionIds,
            sourceResolutions,
          },
        }
      : {}),
  })
}

function buildT2Receipt(row: DefaultMasterPlanConsumptionRow) {
  const calculation = durationCalculation(row)
  const mapping = durationMapping(row)
  const templateId = text(
    calculation.t2RhythmTemplateId
      ?? calculation.t2_rhythm_template_id
      ?? mapping.t2RhythmTemplateId
      ?? mapping.t2_rhythm_template_id,
  )
  if (!templateId || !isScheduleDurationRow(row)) return null
  const finalRange = durationRiskRange(row)
  const t2Range = {
    p20: number(calculation.t2RhythmTemplateP20Days ?? calculation.t2_rhythm_template_p20_days),
    p50: number(calculation.t2RhythmTemplateP50Days ?? calculation.t2_rhythm_template_p50_days),
    p80: number(calculation.t2RhythmTemplateP80Days ?? calculation.t2_rhythm_template_p80_days),
  }
  const affectsFinalRange = Object.keys(t2Range).some((key) => {
    const typedKey = key as keyof typeof t2Range
    return t2Range[typedKey] !== null && t2Range[typedKey] === finalRange[typedKey]
  })
  const before = baselineDurationProjection(row)
  return buildDurationAssetConsumptionReceipt({
    consumer: 'wizard_master_plan',
    resolution: runtimeResolution({
      seedType: 't2_division_rhythm_template',
      stableCode: templateId,
      value: t2Range,
      resolverSource: calculation.t2RhythmTemplateResolverSource
        ?? calculation.t2_rhythm_template_resolver_source
        ?? mapping.t2RhythmTemplateResolverSource
        ?? mapping.t2_rhythm_template_resolver_source,
      versionId: calculation.t2RhythmTemplateResolverVersionId
        ?? calculation.t2_rhythm_template_resolver_version_id
        ?? mapping.t2RhythmTemplateResolverVersionId
        ?? mapping.t2_rhythm_template_resolver_version_id,
    }),
    before,
    after: affectsFinalRange ? finalDurationProjection(row) : before,
    targetRowIds: [row.clientRowId],
    reasonCodes: affectsFinalRange
      ? ['t2_rhythm_range_applied_to_final_duration_output']
      : ['t2_rhythm_loaded_without_final_output_change'],
  })
}

function buildProcessSeasonalReceipt(row: DefaultMasterPlanConsumptionRow) {
  const calculation = durationCalculation(row)
  if (calculation.processSeasonalDurationAssetConsumed !== true) return null
  const stableCode = text(
    calculation.processSeasonalStableCode
      ?? calculation.process_seasonal_stable_code,
  )
  const beforeDays = number(
    calculation.baseSelectedDurationDays
      ?? calculation.base_selected_duration_days,
  )
  const afterDays = number(
    calculation.selectedDurationDays
      ?? calculation.selected_duration_days
      ?? row.values.smart_reference_days,
  )
  if (!stableCode) return null
  return buildDurationAssetConsumptionReceipt({
    consumer: 'wizard_master_plan',
    resolution: runtimeResolution({
      seedType: 'process_seasonal_sensitivity',
      stableCode,
      value: { multiplier: calculation.processSeasonalMultiplier },
      resolverSource: calculation.processSeasonalResolverSource,
    }),
    before: { durationDays: beforeDays },
    after: { durationDays: afterDays },
    targetRowIds: [row.clientRowId],
    reasonCodes: ['process_seasonal_duration_adjustment_evaluated'],
  })
}

function buildDependencyReceipts(row: DefaultMasterPlanConsumptionRow) {
  if (!isScheduleDurationRow(row)) return []
  return (row.predecessorDependencies ?? []).map((dependency, index) => {
    const evidence = record(dependency.dependencyRuleEvidence ?? dependency.dependency_rule_evidence)
    const stableCode = text(
      evidence.dependencyAssetStableCode
        ?? evidence.dependency_asset_stable_code
        ?? dependency.intentCode
        ?? dependency.intent_code
        ?? `generated_dependency_${index + 1}`,
    )
    const afterDependency = {
      predecessorClientRowId: text(dependency.clientRowId ?? dependency.client_row_id),
      dependencyType: text(dependency.dependencyType ?? dependency.dependency_type) || 'FS',
      lagDays: Number(dependency.lagDays ?? dependency.lag_days ?? 0),
      intentCode: text(dependency.intentCode ?? dependency.intent_code) || null,
    }
    return buildDurationAssetConsumptionReceipt({
      consumer: 'wizard_master_plan',
      resolution: runtimeResolution({
        seedType: 'cross_item_workflow',
        assetType: 'construction_dependency_rule_system',
        stableCode,
        value: afterDependency,
        resolverSource: 'ts_seed_fallback',
      }),
      before: { dependencies: [] },
      after: { dependencies: [afterDependency] },
      targetRowIds: [row.clientRowId],
      reasonCodes: ['generated_dependency_changed_schedule_network'],
    })
  })
}

function buildVisibilityReceipt(row: DefaultMasterPlanConsumptionRow) {
  const metadata = rowMetadata(row)
  const decision = record(metadata.masterPlanVisibilityDecision)
  const policyStableCode = text(decision.policyStableCode ?? decision.policy_stable_code)
  if (!policyStableCode) return null
  const visible = decision.visibleOnMasterPlan !== false
  const source = resolverSource(decision.policyResolverSource ?? decision.policy_resolver_source)
  const resolution = runtimeResolution({
    seedType: 'master_plan_visibility_policy',
    stableCode: policyStableCode,
    value: { visibleOnMasterPlan: visible },
    resolverSource: source,
    versionId: decision.policySeedVersionId ?? decision.policy_seed_version_id,
  })
  return buildDurationAssetConsumptionReceipt({
    consumer: 'wizard_master_plan',
    resolution,
    before: { taskSelection: { visibleOnMasterPlan: true, rowProjectionMode: 'schedule_row' } },
    after: visible
      ? { taskSelection: { visibleOnMasterPlan: true, rowProjectionMode: 'schedule_row' } }
      : { taskSelection: { visibleOnMasterPlan: false, rowProjectionMode: 'linked_projection' } },
    targetRowIds: [row.clientRowId],
    reasonCodes: visible
      ? ['visibility_policy_kept_default_master_plan_row']
      : ['visibility_policy_removed_row_from_default_master_plan_surface'],
  })
}

export function buildDefaultMasterPlanAssetConsumption(
  rows: DefaultMasterPlanConsumptionRow[],
): DefaultMasterPlanAssetConsumptionResult {
  const receipts: DurationAssetConsumptionReceipt[] = []
  for (const row of rows) {
    const standardDurationReceipt = buildStandardDurationReceipt(row)
    const t2Receipt = buildT2Receipt(row)
    const processSeasonalReceipt = buildProcessSeasonalReceipt(row)
    const visibilityReceipt = buildVisibilityReceipt(row)
    if (standardDurationReceipt) receipts.push(standardDurationReceipt)
    if (t2Receipt) receipts.push(t2Receipt)
    if (processSeasonalReceipt) receipts.push(processSeasonalReceipt)
    if (visibilityReceipt) receipts.push(visibilityReceipt)
    receipts.push(...buildDependencyReceipts(row))
  }
  return {
    receipts,
    summary: summarizeDurationAssetConsumption(receipts),
  }
}
