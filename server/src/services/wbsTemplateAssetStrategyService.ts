import {
getTaskDurationSuggestion
} from './durationSuggestionService.js'
import {
T2_DIVISION_RHYTHM_TEMPLATE_SEED,
T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION,
type T2DivisionRhythmTemplate,
} from '../seeds/t2DivisionRhythmTemplateSeed.js'
import type { PlanningTableOperation } from '../types/planningTable.js'
import {
V1475_CROSS_ITEM_WORKFLOW_SEED,
type V1475CrossItemWorkflowRule,
} from '../seeds/v1475CrossItemWorkflowSeed.js'
import {
isDurationBearingContributionMode,
normalizeDurationContributionMode,
type DurationContributionMode
} from '../seeds/durationContributionMode.js'
import {
resolveProjectConstructionOrganizationPolicy
} from '../seeds/projectConstructionOrganizationPolicySeed.js'
import {
type ConstructionDependencyRuleLayerKey
} from './constructionDependencyRuleSystemService.js'
import { buildConstructionDependencyRuleEvidence } from './constructionDependencyRuleEvidenceService.js'
import {
type ExecutionNature
} from '../seeds/executionNature.js'
import {
distributePlanDurationAcrossActivitySteps
} from './wbsPlanRollupService.js'
import {
readStandardWorkDurationSeedVersion,
inferWorkEnvironmentFromResolver,
resolveV1474ProcessSeasonalSensitivity,
resolveAlgorithmSeedRecords,resolveStandardWorkDurationSeed,
resolveStandardWorkDurationSeedByStableCode,
resolveT2DivisionRhythmTemplateByTemplateId,
type AlgorithmSeedResolveContext,
type StandardWorkDurationSeedResolverRecord,
type StandardWorkDurationSeedResolverProductivity,
type T2DivisionRhythmTemplateResolverRecord
} from './algorithmSeedResolver.js'
import { buildProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import { resolveProjectFactDurationScaling as resolveSharedProjectFactDurationScaling } from './durationProjectFactScaleService.js'
import type {
DurationRuntimeConsumerObservationQueryExec
} from './durationRuntimeConsumerObservationService.js'

import {
DURATION_SUGGESTION_CONCURRENCY_LIMIT,
buildEngineeringFeatureProfile,
decorateTitleWithElementVariant,
isBuiltInChinaTemplateId,
mapWithConcurrencyLimit,
normalizeId,
normalizeText,
parseMaybeJson,
pickDurationRelevantScopeValues,
readArray,
readOptionalNumber,
readPlanReferenceDurationNumber,
readPositiveNumber,
readRecord,
readStringArray,
readWritablePlanTaskDurationDays,
uniqueStringArray,
withPlanReferenceDurationOutput,
withTemplateFastEstimateDurationOutput,
} from './wbsTemplateGenerationFoundation.js'
import type {
DefaultMasterPlanDependencyRuleEvidence,
EngineeringFeatureProfile,
GeneratedElementVariant,
GeneratedTemplateDependency,
GeneratedTemplateDurationSuggestion,
GeneratedTemplateRow,
TemplateNode,
WbsTemplateDurationSuggestionMode,
WbsTemplateGenerationDepth,
WbsTemplateScope,
} from './wbsTemplateGenerationFoundation.js'
import {
isFloorSeriesScope,
isRhythmExpansionEligibleNode,
resolveGenerationDepthPolicyForNode,
} from './wbsTemplateScopeClassificationService.js'
import {
applyExplicitParentPackageWindowsToSuggestionMap,
applyFloorRhythmCurvesToSuggestionMap,
buildActivityStepDurationSuggestion,
buildBenchmarkPlanReferenceDurationSuggestion,
buildFastTemplateDurationProjectionCacheKey,
buildFastTemplateDurationSeedCacheKey,
buildFastTemplateDurationSeedMatchText,
buildFloorRhythmSeriesAdjustment,
buildNonDurationActivityStepSuggestion,
buildNonDurationTemplateSuggestion,
clampNumber,
collectDurationSuggestionTargets,
collectTemplateNodesById,
executionProfileHasArchetype,
getDurationSuggestionKey,
inferParentDurationBoundaryPolicy,
inferSchedulePhaseKindFromText,
isDurationBearingNode,
isHardParentDurationBoundaryPolicy,
isLowRiseMultiBuildingParallelProject,
isSequentialModularItemPackProcessChain,
normalizeDurationMethodCode,
normalizeRate01,
parentWindowBusinessReasonCode,
readContextualDescendantRollupCompression,
readExecutionProfileFromProjectFacts,
readFastTrackDescendantNetworkTailFactor,
readNodeDurationContributionMode,
readPositiveFactor,
readScenarioScheduleProfile,
resolveParentReferenceDurationDays,
serializeDurationSuggestion,
shouldUseDescendantRollupForDurationSuggestion,
shouldUseManagedFrontierDescendantRollup,
withRecommendedDuration,
} from './wbsTemplateDurationAssemblyService.js'
import type {
DurationSuggestionTarget,
FastTemplateDescendantDurationEstimate,
FastTemplateDescendantDurationScaling,
PrefabRateDurationFactor,
} from './wbsTemplateDurationAssemblyService.js'
import type {
GeneratedPlanItemKind,
} from './wbsTemplateOutputProjectionService.js'
import {
clampInteger,
} from './wbsTemplateDependencyCandidateService.js'



export function pickTemplateSeedDurationDays(
  seedRule: StandardWorkDurationSeedRule | null,
  featureProfile: EngineeringFeatureProfile,
) {
  if (!seedRule) return null
  const byMethod = readRecord(seedRule.defaultDaysByMethod)
  for (const methodCode of featureProfile.methodVariantCodes.map(normalizeDurationMethodCode)) {
    const methodDays = readPositiveNumber(byMethod[methodCode])
    if (methodDays) return methodDays
  }

  let baseDays = readPositiveNumber(seedRule.defaultDaysP50)
  if (!baseDays) return null
  const projectType = normalizeText(featureProfile.projectTypeCode).toLowerCase()
  const projectFactor = readPositiveFactor(readRecord(seedRule.projectTypeDurationFactors)[projectType])
  if (projectFactor) baseDays = Math.max(1, Math.ceil(baseDays * projectFactor))
  const structureType = normalizeText(featureProfile.structureTypeCode).toLowerCase()
  const structureFactor = readPositiveFactor(readRecord(seedRule.structureTypeDurationFactors)[structureType])
  if (structureFactor) baseDays = Math.max(1, Math.ceil(baseDays * structureFactor))
  const elementFactors = readRecord(seedRule.elementVariantDurationFactors)
  for (const elementCode of featureProfile.elementVariantCodes.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)) {
    const elementFactor = readPositiveFactor(elementFactors[elementCode])
    if (elementFactor) {
      baseDays = Math.max(1, Math.ceil(baseDays * elementFactor))
      break
    }
  }
  return baseDays
}



export type ProjectFactDurationScalingResult = {
  days: number
  applied: boolean
  factor: number
  quantity: number | null
  defaultQuantity: number | null
  basis: StandardWorkDurationSeedRule['scaleBasis'] | string | null
  source: string | null
  projectScaleRatio: number | null
  baseline: Record<string, unknown> | null
}



export function readConstructionArchetypeDurationFactor(
  stableCodeValue: unknown,
  featureProfile: EngineeringFeatureProfile,
  scaleBasis: StandardWorkDurationSeedRule['scaleBasis'] | string | null,
) {
  const executionProfile = readExecutionProfileFromProjectFacts(featureProfile)
  const stableCode = normalizeText(stableCodeValue).toLowerCase()
  const phaseKind = inferSchedulePhaseKindFromText(stableCode)
  const floorCount = Math.max(
    readOptionalNumber(featureProfile.standardFloorCount) ?? 0,
    readOptionalNumber(featureProfile.highestBuildingFloorCount) ?? 0,
  )
  const compactLowRiseParallel = floorCount > 0 && floorCount <= 13
  const isMainDurationScope = stableCode.startsWith('01-')
    || stableCode.startsWith('02-')
    || stableCode.startsWith('03-')
    || stableCode.startsWith('04-')
    || stableCode.startsWith('05-')
    || stableCode.startsWith('06-')
    || stableCode.startsWith('07-')
    || stableCode.startsWith('08-')
    || stableCode.startsWith('10-')
    || stableCode.startsWith('fac-')
    || stableCode.startsWith('dec-')
    || stableCode.startsWith('plu-')
    || stableCode.startsWith('ele-')
    || stableCode.startsWith('hva-')
    || stableCode.startsWith('fir-')
    || stableCode.startsWith('int-')
    || stableCode.includes('bdt-')
    || scaleBasis === 'area'
    || scaleBasis === 'floor'
    || scaleBasis === 'workface'
    || scaleBasis === 'building'
    || scaleBasis === 'system'

  if (!isMainDurationScope) return null

  if (executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')) {
    return {
      factor: phaseKind === 'commissioning' ? 0.42 : phaseKind === 'mep' ? 0.36 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.34 : 0.26,
      profile: 'mic_modular_wet_work_replacement',
    }
  }
  if (executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')) {
    return {
      factor: phaseKind === 'commissioning' ? 0.65 : phaseKind === 'mep' ? 0.55 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.52 : 0.58,
      profile: 'steel_assembly_wet_work_replacement',
    }
  }
  if (
    executionProfileHasArchetype(executionProfile, 'lowrise_multi_building_parallel')
    || isLowRiseMultiBuildingParallelProject(featureProfile)
  ) {
    if (!compactLowRiseParallel) {
      return {
        factor: phaseKind === 'commissioning' ? 0.9 : phaseKind === 'mep' ? 0.95 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.88 : stableCode.startsWith('01-') ? 0.94 : 0.88,
        profile: 'midrise_multi_building_parallel_workfaces',
      }
    }
    return {
      factor: phaseKind === 'commissioning' ? 0.68 : phaseKind === 'mep' ? 0.78 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.7 : stableCode.startsWith('01-') ? 0.82 : 0.72,
      profile: 'lowrise_multi_building_parallel_workfaces',
    }
  }

  return null
}



export function readPrefabRateFactorForStableCode(
  stableCodeValue: unknown,
  featureProfile: EngineeringFeatureProfile,
  scaleBasis: StandardWorkDurationSeedRule['scaleBasis'] | string | null,
): PrefabRateDurationFactor | null {
  const prefabRate = normalizeRate01(featureProfile.prefabRate)
  if (prefabRate === null) return null

  const stableCode = normalizeText(stableCodeValue).toLowerCase()
  const methodCodes = featureProfile.methodVariantCodes.map(normalizeDurationMethodCode)
  const isPrefabMethod = methodCodes.some((code) => code === 'prefab')
    || normalizeText(featureProfile.structureTypeCode).toLowerCase().includes('prefab')
    || normalizeText(featureProfile.structureTypeCode).toLowerCase().includes('prefabricated')

  if (stableCode.startsWith('pfb-00')) {
    return {
      factor: clampNumber(0.94 + prefabRate * 0.45, 0.95, 1.34),
      profile: 'prefab_factory_supply_chain',
    }
  }
  if (stableCode.startsWith('pfb-02')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.34, 0.98, 1.28),
      profile: 'prefab_grouting_connection_control',
    }
  }
  if (stableCode.startsWith('pfb-01')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.24, 0.98, 1.2),
      profile: 'prefab_site_hoisting_control',
    }
  }
  if (stableCode.startsWith('pfb-03')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.18, 0.98, 1.16),
      profile: 'prefab_acceptance_traceability_control',
    }
  }
  if (stableCode.startsWith('pfb-')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.26, 0.98, 1.22),
      profile: 'prefab_specialty_general_control',
    }
  }

  const isCastInPlaceStructureScope = stableCode.startsWith('02-01')
    || stableCode.startsWith('02-03')
    || stableCode.startsWith('02-04')
    || stableCode.startsWith('02-05')
    || stableCode.includes('bdt-04')
    || scaleBasis === 'floor'
  if (isPrefabMethod && isCastInPlaceStructureScope) {
    return {
      factor: clampNumber(1 - prefabRate * 0.14, 0.86, 1),
      profile: 'prefab_reduces_cast_in_place_structure_scope',
    }
  }

  return null
}



export function applyProjectFactDurationScaling(
  baseDays: number,
  seedRule: StandardWorkDurationSeedRule | null,
  featureProfile: EngineeringFeatureProfile,
): ProjectFactDurationScalingResult {
  return resolveSharedProjectFactDurationScaling(baseDays, seedRule, featureProfile)
}



export async function resolveFastTemplateDurationSeed(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
): Promise<StandardWorkDurationSeedRule | null> {
  const standardWorkCodes = uniqueStringArray([
    normalizeId(node.standardWorkCode),
    normalizeId(node.stableCode),
  ])
  const seed = await resolveStandardWorkDurationSeed(
    buildFastTemplateDurationSeedMatchText(node, featureProfile),
    {
      standardWorkCode: normalizeId(node.standardWorkCode) || normalizeId(node.stableCode) || null,
      standardWorkCodes,
      templateNodeId: isBuiltInChinaTemplateId(node.templateId) ? null : node.id,
      methodVariantCodes: featureProfile.methodVariantCodes,
      elementVariantCodes: featureProfile.elementVariantCodes,
      projectTypeCode: featureProfile.projectTypeCode,
      structureTypeCode: featureProfile.structureTypeCode,
      applicableGranularity: node.categoryType === 'item_work' ? 'summary' : 'task',
      featureProfile: buildProjectGenerationFactsSnapshot(featureProfile),
      ...(featureProfile.algorithmSeedSourcePolicy
        ? { sourcePolicy: featureProfile.algorithmSeedSourcePolicy }
        : {}),
    },
  )
  return seed as unknown as StandardWorkDurationSeedRule | null
}



export type FastTemplateDurationCache = {
  seedByKey: Map<string, Promise<StandardWorkDurationSeedRule | null>>
  suggestionByKey: Map<string, Promise<GeneratedTemplateDurationSuggestion>>
  descendantByKey: Map<string, Promise<FastTemplateDescendantDurationEstimate | null>>
}



export function createFastTemplateDurationCache(): FastTemplateDurationCache {
  return {
    seedByKey: new Map(),
    suggestionByKey: new Map(),
    descendantByKey: new Map(),
  }
}



export function resolveCachedFastTemplateDurationSeed(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
  cache?: FastTemplateDurationCache,
): Promise<StandardWorkDurationSeedRule | null> {
  if (!cache) return resolveFastTemplateDurationSeed(node, featureProfile)
  const cacheKey = buildFastTemplateDurationSeedCacheKey(node, featureProfile)
  const existing = cache.seedByKey.get(cacheKey)
  if (existing) return existing
  const resolved = resolveFastTemplateDurationSeed(node, featureProfile)
  cache.seedByKey.set(cacheKey, resolved)
  return resolved
}



export function pickResolvedDurationSeedDays(seedRule: StandardWorkDurationSeedRule | null) {
  if (!seedRule) return null
  return readPositiveNumber(
    seedRule.defaultDaysP50
      ?? (seedRule as Record<string, unknown>).default_days_p50
      ?? (seedRule as Record<string, unknown>).defaultDays,
  )
}



export async function estimateFastTemplateDescendantDuration(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
  cache?: FastTemplateDurationCache,
): Promise<FastTemplateDescendantDurationEstimate | null> {
  if (cache) {
    const cacheKey = buildFastTemplateDurationProjectionCacheKey(node, featureProfile)
    const existing = cache.descendantByKey.get(cacheKey)
    if (existing) return existing
    const resolved = estimateFastTemplateDescendantDurationUncached(node, featureProfile, cache)
    cache.descendantByKey.set(cacheKey, resolved)
    return resolved
  }
  return estimateFastTemplateDescendantDurationUncached(node, featureProfile, cache)
}



export async function estimateFastTemplateDescendantDurationUncached(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
  cache?: FastTemplateDurationCache,
): Promise<FastTemplateDescendantDurationEstimate | null> {
  if (node.children.length === 0) return null
  let total = 0
  let usesDurationSeed = false
  let projectFactScalingApplied = false
  const projectFactScalingSamples: FastTemplateDescendantDurationScaling[] = []
  for (const child of node.children) {
    if (child.categoryType === 'process' || child.categoryType === 'activity_step') {
      const mode = readNodeDurationContributionMode(child)
      if (!isDurationBearingContributionMode(mode)) continue
      const childSeed = await resolveCachedFastTemplateDurationSeed(child, featureProfile, cache)
      usesDurationSeed = usesDurationSeed || Boolean(childSeed)
      const baseDays = pickResolvedDurationSeedDays(childSeed)
        ?? readPositiveNumber(child.defaultDurationDays)
        ?? 1
      const scaled = applyProjectFactDurationScaling(baseDays, childSeed, featureProfile)
      total += scaled.days
      if (scaled.applied) {
        projectFactScalingApplied = true
        if (projectFactScalingSamples.length < 5) {
          projectFactScalingSamples.push({
            stableCode: childSeed?.stableCode ?? child.stableCode,
            scaleBasis: scaled.basis,
            quantity: scaled.quantity,
            defaultQuantity: scaled.defaultQuantity ?? childSeed?.defaultQuantity ?? null,
            source: scaled.source,
            projectScaleRatio: scaled.projectScaleRatio,
            baseline: scaled.baseline,
            factor: Number(scaled.factor.toFixed(3)),
            baseRecommendedDurationDays: baseDays,
            adjustedRecommendedDurationDays: scaled.days,
          })
        }
      }
      continue
    }
    const nested = await estimateFastTemplateDescendantDuration(child, featureProfile, cache)
    if (nested) {
      total += nested.days
      usesDurationSeed = usesDurationSeed || nested.usesDurationSeed
      projectFactScalingApplied = projectFactScalingApplied || nested.projectFactScalingApplied
      for (const sample of nested.projectFactScalingSamples) {
        if (projectFactScalingSamples.length >= 5) break
        projectFactScalingSamples.push(sample)
      }
    }
  }
  return total > 0
    ? {
      days: total,
      usesDurationSeed,
      projectFactScalingApplied,
      projectFactScalingSamples,
    }
    : null
}



export async function buildFastTemplateDurationSuggestion(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
  durationContributionMode: DurationContributionMode,
  cache?: FastTemplateDurationCache,
): Promise<GeneratedTemplateDurationSuggestion> {
  if (cache) {
    const cacheKey = JSON.stringify({
      projection: buildFastTemplateDurationProjectionCacheKey(node, featureProfile),
      durationContributionMode: durationContributionMode ?? null,
    })
    const existing = cache.suggestionByKey.get(cacheKey)
    if (existing) return existing
    const resolved = buildFastTemplateDurationSuggestionUncached(node, featureProfile, durationContributionMode, cache)
    cache.suggestionByKey.set(cacheKey, resolved)
    return resolved
  }
  return buildFastTemplateDurationSuggestionUncached(node, featureProfile, durationContributionMode, cache)
}



export async function buildFastTemplateDurationSuggestionUncached(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
  durationContributionMode: DurationContributionMode,
  cache?: FastTemplateDurationCache,
): Promise<GeneratedTemplateDurationSuggestion> {
  const nodeMetadata = readRecord(node.metadata)
  const learnedPublicationKey = normalizeText(nodeMetadata.durationLearningPublicationKey)
  const learnedDurationDays = learnedPublicationKey
    ? readPositiveNumber(node.defaultDurationDays)
    : null
  const seedRule = await resolveCachedFastTemplateDurationSeed(node, featureProfile, cache)
  const seedMode = normalizeDurationContributionMode(seedRule?.durationContributionMode)
  const effectiveMode = durationContributionMode ?? seedMode
  if (!isDurationBearingContributionMode(effectiveMode)) {
    return buildNonDurationTemplateSuggestion(effectiveMode)
  }

  const directSeedDurationDays = learnedDurationDays ?? pickResolvedDurationSeedDays(seedRule)
  const descendantDurationEstimate = directSeedDurationDays == null
    ? await estimateFastTemplateDescendantDuration(node, featureProfile, cache)
    : null
  const baseRecommendedDurationDays = directSeedDurationDays
    ?? descendantDurationEstimate?.days
    ?? readPositiveNumber(node.defaultDurationDays)
    ?? 1
  const descendantPrefabRateFactor = directSeedDurationDays == null && descendantDurationEstimate
    ? readPrefabRateFactorForStableCode(node.stableCode, featureProfile, null)
    : null
  const descendantArchetypeDurationFactor = directSeedDurationDays == null && descendantDurationEstimate
    ? readConstructionArchetypeDurationFactor(node.stableCode, featureProfile, null)
    : null
  const descendantAdjustmentFactor = (descendantPrefabRateFactor?.factor ?? 1) * (descendantArchetypeDurationFactor?.factor ?? 1)
  const descendantAdjustedDurationDays = descendantAdjustmentFactor !== 1
    ? Math.max(1, Math.ceil(baseRecommendedDurationDays * descendantAdjustmentFactor))
    : baseRecommendedDurationDays
  const directProjectFactScaling = directSeedDurationDays != null || !descendantDurationEstimate
    ? learnedDurationDays
      ? {
          days: learnedDurationDays,
          applied: false,
          factor: 1,
          quantity: null,
          defaultQuantity: null,
          basis: null,
          source: 'duration_learning_runtime_publication',
          projectScaleRatio: null,
          baseline: null,
        } satisfies ProjectFactDurationScalingResult
      : applyProjectFactDurationScaling(baseRecommendedDurationDays, seedRule, featureProfile)
    : null
  const projectFactScaling = directSeedDurationDays != null || !descendantDurationEstimate
    ? directProjectFactScaling!
    : {
      days: descendantAdjustedDurationDays,
      applied: descendantDurationEstimate.projectFactScalingApplied || descendantAdjustedDurationDays !== baseRecommendedDurationDays,
      factor: descendantAdjustmentFactor,
      quantity: null as number | null,
      defaultQuantity: null as number | null,
      basis: null as string | null,
      source: descendantPrefabRateFactor || descendantArchetypeDurationFactor
        ? `descendant_duration_seed_rollup:${[
            descendantArchetypeDurationFactor?.profile,
            descendantPrefabRateFactor?.profile,
          ].filter(Boolean).join('+')}`
        : 'descendant_duration_seed_rollup',
      projectScaleRatio: null as number | null,
      baseline: null as Record<string, unknown> | null,
    } satisfies ProjectFactDurationScalingResult
  const recommendedDurationDays = projectFactScaling.days
  const conservativeDurationDays = Math.max(
    recommendedDurationDays,
    projectFactScaling.applied && seedRule?.defaultDaysP50
      ? Math.ceil((readPositiveNumber(seedRule?.defaultDaysP80) ?? Math.ceil(baseRecommendedDurationDays * 1.35)) * (recommendedDurationDays / Math.max(baseRecommendedDurationDays, 1)))
      : readPositiveNumber(seedRule?.defaultDaysP80) ?? Math.ceil(recommendedDurationDays * 1.35),
  )
  const usesDurationLearningPublication = Boolean(learnedPublicationKey && learnedDurationDays)
  const usesDurationSeed = Boolean(seedRule) || Boolean(descendantDurationEstimate?.usesDurationSeed)
  const seedSource = usesDurationLearningPublication
    ? 'duration_learning_runtime_publication'
    : usesDurationSeed
      ? 'standard_work_duration_seed'
      : 'template_placeholder'
  const baseSuggestion: GeneratedTemplateDurationSuggestion = {
    recommendedDurationDays,
    conservativeDurationDays,
    confidenceLevel: usesDurationLearningPublication ? 'medium' : seedRule?.confidence ?? (descendantDurationEstimate?.usesDurationSeed ? 'medium' : 'low'),
    confidenceScore: usesDurationLearningPublication ? 66 : seedRule?.confidence === 'high' ? 74 : seedRule?.confidence === 'medium' || descendantDurationEstimate?.usesDurationSeed ? 60 : 38,
    forecastSource: `${seedSource}:sync_fast_template`,
    durationCalibrationSource: usesDurationLearningPublication ? 'runtime_learning_publication' : usesDurationSeed ? 'standard_work_duration_seed' : 'unavailable',
    durationProvenance: usesDurationLearningPublication ? 'runtime_learning_publication' : usesDurationSeed ? 'standard_work_duration_seed' : 'unavailable',
    businessReason: usesDurationLearningPublication
      ? 'Published WBS duration learning overlay matched this template node.'
      : seedRule?.benchmarkBasis
      ?? '?????????? seed ????????????',
    businessReasonCode: usesDurationLearningPublication ? 'DURATION_LEARNING_RUNTIME_PUBLICATION' : usesDurationSeed ? 'STANDARD_SEED_REFERENCE' : 'TEMPLATE_FAST_PLACEHOLDER',
    businessReasonCodes: uniqueStringArray([
      usesDurationLearningPublication ? 'DURATION_LEARNING_RUNTIME_PUBLICATION' : usesDurationSeed ? 'STANDARD_SEED_REFERENCE' : 'TEMPLATE_FAST_PLACEHOLDER',
      projectFactScaling.applied ? 'PROJECT_FACT_QUANTITY_SCALING' : null,
    ]),
    businessReasonParams: {
      durationSuggestionMode: 'fast_template',
      durationLearningPublicationKey: learnedPublicationKey || null,
      durationLearningPublicationStage: normalizeText(nodeMetadata.durationLearningPublicationStage) || null,
      durationLearningSelectionBasis: normalizeText(nodeMetadata.durationLearningSelectionBasis) || null,
      durationLearningAssetKey: normalizeText(nodeMetadata.durationLearningAssetKey) || null,
      seedStableCode: seedRule?.__stableCode ?? seedRule?.stableCode ?? null,
      dbQuerySkipped: true,
      seedResolver: 'resolveStandardWorkDurationSeed',
      seedResolverSource: seedRule?.__resolverSource ?? null,
      seedResolverVersionId: seedRule?.__resolverVersionId ?? null,
      projectFactScaling: projectFactScaling.applied ? {
        scaleBasis: projectFactScaling.basis,
        quantity: projectFactScaling.quantity,
        defaultQuantity: projectFactScaling.defaultQuantity ?? seedRule?.defaultQuantity ?? null,
        scalingSource: projectFactScaling.source,
        projectScaleRatio: projectFactScaling.projectScaleRatio,
        baseline: projectFactScaling.baseline,
        factor: Number(projectFactScaling.factor.toFixed(3)),
        baseRecommendedDurationDays,
        adjustedRecommendedDurationDays: recommendedDurationDays,
        rollupSource: descendantDurationEstimate?.projectFactScalingApplied && directSeedDurationDays == null
          ? 'descendant_duration_seed_rollup'
          : 'direct_duration_seed',
        descendantSamples: descendantDurationEstimate?.projectFactScalingSamples ?? [],
      } : null,
    },
    displaySummary: `?? ${recommendedDurationDays} ????????????????????????`,
    dataMaturity: usesDurationLearningPublication || usesDurationSeed ? 'L1' : 'L0',
    dataMaturityReasons: usesDurationLearningPublication
      ? ['governed duration learning runtime publication matched this template node']
      : usesDurationSeed
      ? ['standard_work_duration seed matched through governed resolver']
      : ['template placeholder used because governed duration seed was not matched'],
    dataUpgradePath: ['background_duration_suggestion'],
    dataUpgradeBlockedBy: [],
    factorAvailability: {
      standard_work_duration_seed: usesDurationSeed,
      duration_learning_runtime_publication: usesDurationLearningPublication,
      sync_fast_template: true,
      db_query_skipped: true,
      project_fact_quantity_scaling: projectFactScaling.applied,
    },
    durationContributionMode: effectiveMode,
  }
  return usesDurationLearningPublication
    ? withPlanReferenceDurationOutput({
        ...baseSuggestion,
        durationOutputCode: 'contextual_reference',
        contextualReferenceDays: recommendedDurationDays,
      })!
    : withTemplateFastEstimateDurationOutput(baseSuggestion)
}



export async function estimateContextualDescendantRollupDuration(params: {
  projectId: string
  node: TemplateNode
  featureProfile: EngineeringFeatureProfile
  scope: WbsTemplateScope
  plannedStartDate?: string | null
  elementVariant: GeneratedElementVariant | null
  durationSuggestionMode: WbsTemplateDurationSuggestionMode
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeEvidenceMode?: 'record' | 'no_write'
  fastTemplateDurationCache?: FastTemplateDurationCache
  rollupCache?: Map<string, Promise<{
    recommendedDurationDays: number
    conservativeDurationDays: number
    samples: Array<Record<string, unknown>>
    rollupAdjustment: Record<string, unknown> | null
  } | null>>
}): Promise<{
  recommendedDurationDays: number
  conservativeDurationDays: number
  samples: Array<Record<string, unknown>>
  rollupAdjustment: Record<string, unknown> | null
} | null> {
  const cacheKey = JSON.stringify({
    nodeId: params.node.id,
    stableCode: params.node.stableCode,
    mode: params.durationSuggestionMode,
    elementVariant: params.elementVariant?.code ?? null,
    scope: pickDurationRelevantScopeValues(params.scope),
  })
  if (params.rollupCache?.has(cacheKey)) return params.rollupCache.get(cacheKey)!
  const compute = estimateContextualDescendantRollupDurationUncached(params)
  params.rollupCache?.set(cacheKey, compute)
  return compute
}



export async function estimateContextualDescendantRollupDurationUncached(params: {
  projectId: string
  node: TemplateNode
  featureProfile: EngineeringFeatureProfile
  scope: WbsTemplateScope
  plannedStartDate?: string | null
  elementVariant: GeneratedElementVariant | null
  durationSuggestionMode: WbsTemplateDurationSuggestionMode
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeEvidenceMode?: 'record' | 'no_write'
  fastTemplateDurationCache?: FastTemplateDurationCache
  rollupCache?: Map<string, Promise<{
    recommendedDurationDays: number
    conservativeDurationDays: number
    samples: Array<Record<string, unknown>>
    rollupAdjustment: Record<string, unknown> | null
  } | null>>
}): Promise<{
  recommendedDurationDays: number
  conservativeDurationDays: number
  samples: Array<Record<string, unknown>>
  rollupAdjustment: Record<string, unknown> | null
} | null> {
  const childDurations: Array<{ recommendedDurationDays: number; conservativeDurationDays: number; child: TemplateNode }> = []
  const samples: Array<Record<string, unknown>> = []

  for (const child of params.node.children) {
    if (child.categoryType === 'process' || child.categoryType === 'activity_step') {
      const childMode = readNodeDurationContributionMode(child)
      if (!isDurationBearingContributionMode(childMode)) continue
      const childSuggestion = params.durationSuggestionMode === 'fast_template'
        ? await buildFastTemplateDurationSuggestion(child, params.featureProfile, childMode, params.fastTemplateDurationCache)
        : serializeDurationSuggestion(await getTaskDurationSuggestion({
          projectId: params.projectId,
          templateNodeId: isBuiltInChinaTemplateId(child.templateId) ? null : child.id,
          templateStableCode: child.stableCode,
          wbsNodeType: child.categoryType,
          engineeringCategoryId: child.engineeringCategoryId,
          standardWorkCode: child.standardWorkCode,
          standardWorkName: child.standardWorkName,
          taskTitle: decorateTitleWithElementVariant(child.name, params.elementVariant),
          plannedStartDate: params.plannedStartDate,
          engineeringObjectId: params.scope.engineering_object_id,
          buildingObjectId: params.scope.building_object_id,
          floorObjectId: params.scope.floor_object_id,
          zoneObjectId: params.scope.physical_zone_object_id,
          projectTypeCode: params.featureProfile.projectTypeCode,
          structureTypeCode: params.featureProfile.structureTypeCode,
          methodVariantCodes: params.featureProfile.methodVariantCodes,
          projectGenerationFacts: buildProjectGenerationFactsSnapshot(params.featureProfile),
          elementVariantCodes: params.elementVariant ? [params.elementVariant.code] : params.featureProfile.elementVariantCodes,
          runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec ?? undefined,
          runtimeEvidenceMode: params.runtimeEvidenceMode,
        }))
      const promotedChildSuggestion = withPlanReferenceDurationOutput(childSuggestion)
      const childRecommended = readWritablePlanTaskDurationDays(promotedChildSuggestion)
        ?? readPositiveNumber(childSuggestion.recommendedDurationDays)
      if (!childRecommended) continue
      const childConservative = readPositiveNumber(childSuggestion.conservativeDurationDays)
        ?? Math.ceil(childRecommended * 1.15)
      const childReasonParams = readRecord(childSuggestion.businessReasonParams)
      childDurations.push({
        child,
        recommendedDurationDays: childRecommended,
        conservativeDurationDays: Math.max(childRecommended, childConservative),
      })
      if (samples.length < 6) {
        samples.push({
          stableCode: child.stableCode,
          durationSeedStableCode: normalizeText(
            childReasonParams.seedStableCode ?? childReasonParams.seed_stable_code,
          ) || null,
          durationSeedResolverSource: normalizeText(
            childReasonParams.seedResolverSource ?? childReasonParams.seed_resolver_source,
          ) || 'ts_seed_fallback',
          durationSeedResolverVersionId: normalizeText(
            childReasonParams.seedResolverVersionId ?? childReasonParams.seed_resolver_version_id,
          ) || null,
          recommendedDurationDays: childRecommended,
          conservativeDurationDays: childConservative,
          forecastSource: childSuggestion.forecastSource,
          businessReasonCode: childSuggestion.businessReasonCode ?? null,
          scaleFactor: readRecord(childSuggestion.businessReasonParams).scaleFactor ?? null,
        })
      }
      continue
    }

    const nested = await estimateContextualDescendantRollupDuration({
      ...params,
      node: child,
    })
    if (!nested) continue
    childDurations.push({
      child,
      recommendedDurationDays: nested.recommendedDurationDays,
      conservativeDurationDays: nested.conservativeDurationDays,
    })
    for (const sample of nested.samples) {
      if (samples.length >= 6) break
      samples.push(sample)
    }
  }

  if (childDurations.length === 0) return null

  const recommendedTotal = childDurations.reduce((sum, item) => sum + item.recommendedDurationDays, 0)
  const conservativeTotal = childDurations.reduce((sum, item) => sum + item.conservativeDurationDays, 0)
  if (recommendedTotal <= 0) return null

  const rollupCompression = readContextualDescendantRollupCompression(params.featureProfile)
  const networkRollup = readContextualDescendantNetworkRollup(params.node, childDurations, params.featureProfile)
  const recommendedDurationDays = Math.max(1, Math.ceil(
    networkRollup
      ? networkRollup.recommendedDurationDays
      : rollupCompression
        ? recommendedTotal * rollupCompression.factor
        : recommendedTotal,
  ))
  const rawConservativeDurationDays = Math.max(recommendedTotal, conservativeTotal || Math.ceil(recommendedTotal * 1.15))
  const conservativeDurationDays = Math.max(recommendedDurationDays, Math.ceil(
    networkRollup
      ? networkRollup.conservativeDurationDays
      : rollupCompression
        ? rawConservativeDurationDays * rollupCompression.factor
        : rawConservativeDurationDays,
  ))

  return {
    recommendedDurationDays,
    conservativeDurationDays,
    samples,
    rollupAdjustment: networkRollup
    ? {
        ...networkRollup,
        rawRecommendedDurationDays: recommendedTotal,
        rawConservativeDurationDays,
        adjustedRecommendedDurationDays: recommendedDurationDays,
        adjustedConservativeDurationDays: conservativeDurationDays,
      }
    : rollupCompression
    ? {
        ...rollupCompression,
        rawRecommendedDurationDays: recommendedTotal,
        rawConservativeDurationDays,
        adjustedRecommendedDurationDays: recommendedDurationDays,
        adjustedConservativeDurationDays: conservativeDurationDays,
      }
    : null,
  }
}



export async function applyManagedFrontierDescendantRollupDurationSuggestion(params: {
  projectId: string
  node: TemplateNode
  generationDepth: WbsTemplateGenerationDepth
  featureProfile: EngineeringFeatureProfile
  scope: WbsTemplateScope
  plannedStartDate?: string | null
  elementVariant: GeneratedElementVariant | null
  suggestion: GeneratedTemplateDurationSuggestion
  durationSuggestionMode: WbsTemplateDurationSuggestionMode
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeEvidenceMode?: 'record' | 'no_write'
  fastTemplateDurationCache?: FastTemplateDurationCache
  rollupCache?: Map<string, Promise<{
    recommendedDurationDays: number
    conservativeDurationDays: number
    samples: Array<Record<string, unknown>>
    rollupAdjustment: Record<string, unknown> | null
  } | null>>
}): Promise<GeneratedTemplateDurationSuggestion> {
  if (!shouldUseManagedFrontierDescendantRollup(params.node, params.generationDepth, params.scope)) return params.suggestion
  const policy = resolveGenerationDepthPolicyForNode(params.node)
  const rollup = await estimateContextualDescendantRollupDuration(params)
  if (!rollup) return params.suggestion
  const durationSeedStableCodes = uniqueStringArray(rollup.samples.map((sample) => (
    normalizeText(sample.durationSeedStableCode ?? sample.duration_seed_stable_code)
  )))
  const durationSeedResolverSources = uniqueStringArray(rollup.samples.map((sample) => (
    normalizeText(sample.durationSeedResolverSource ?? sample.duration_seed_resolver_source)
  )))
  const durationSeedResolverVersionIds = uniqueStringArray(rollup.samples.map((sample) => (
    normalizeText(sample.durationSeedResolverVersionId ?? sample.duration_seed_resolver_version_id)
  )))
  const durationSeedResolutions = [...new Map(rollup.samples.map((sample) => {
    const stableCode = normalizeText(sample.durationSeedStableCode ?? sample.duration_seed_stable_code)
    const resolverSource = normalizeText(sample.durationSeedResolverSource ?? sample.duration_seed_resolver_source)
      || 'ts_seed_fallback'
    const resolverVersionId = normalizeText(sample.durationSeedResolverVersionId ?? sample.duration_seed_resolver_version_id)
      || null
    return [
      [stableCode, resolverSource, resolverVersionId ?? ''].join('|'),
      { stableCode, resolverSource, resolverVersionId },
    ] as const
  }).filter(([, resolution]) => Boolean(resolution.stableCode))).values()]
  const childProcessStableCodes = uniqueStringArray(rollup.samples.map((sample) => (
    normalizeText(sample.stableCode ?? sample.stable_code)
  )))
  const reason = '首屏计划停在管理颗粒度，计划工期由未物化子工序深算汇总，保证同一事实同一任务只有一套工期真值。'
  return {
    ...params.suggestion,
    recommendedDurationDays: rollup.recommendedDurationDays,
    conservativeDurationDays: rollup.conservativeDurationDays,
    durationOutputCode: 'contextual_reference',
    contextualReferenceDays: rollup.recommendedDurationDays,
    planReferenceDays: null,
    forecastSource: `${params.suggestion.forecastSource}+managed_frontier_descendant_rollup`,
    businessReason: [params.suggestion.businessReason, reason].map((item) => normalizeText(item)).filter(Boolean).join('；'),
    businessReasonCode: 'MANAGED_FRONTIER_DESCENDANT_ROLLUP',
    businessReasonCodes: uniqueStringArray([
      ...(params.suggestion.businessReasonCodes ?? []),
      'MANAGED_FRONTIER_DESCENDANT_ROLLUP',
    ]),
    businessReasonParams: {
      ...readRecord(params.suggestion.businessReasonParams),
      generationDepthPolicy: policy,
      descendantRollup: {
        source: 'contextual_descendant_rollup',
        childCount: rollup.samples.length,
        samples: rollup.samples,
        durationSeedStableCodes,
        durationSeedResolverSource: durationSeedResolverSources.length === 1
          ? durationSeedResolverSources[0]
          : 'mixed_governed_resolvers',
        durationSeedResolverSources,
        durationSeedResolverVersionId: durationSeedResolverVersionIds.length === 1
          ? durationSeedResolverVersionIds[0]
          : null,
        durationSeedResolverVersionIds,
        durationSeedResolutions,
        childProcessStableCodes,
        rollupAdjustment: rollup.rollupAdjustment,
        materializeDepth: policy.materializeDepth,
        durationComputeDepth: policy.durationComputeDepth,
      },
    },
    displaySummary: `参考工期 ${rollup.recommendedDurationDays} 天，来自下层工序深算汇总。`,
    dataMaturityReasons: uniqueStringArray([
      ...(params.suggestion.dataMaturityReasons ?? []),
      'managed frontier row duration uses descendant process rollup while descendants stay drill-down only',
    ]),
    factorAvailability: {
      ...(params.suggestion.factorAvailability ?? {}),
      managed_frontier_descendant_rollup: true,
    },
  }
}



export function readContextualDescendantNetworkRollup(
  node: TemplateNode,
  childDurations: Array<{ recommendedDurationDays: number; conservativeDurationDays: number; child: TemplateNode }>,
  featureProfile: EngineeringFeatureProfile,
) {
  if (childDurations.length <= 1) return null
  const phaseKind = inferSchedulePhaseKindFromText(`${node.stableCode} ${node.name} ${node.standardWorkName ?? ''}`)
  const maxRecommended = Math.max(...childDurations.map((item) => item.recommendedDurationDays))
  const maxConservative = Math.max(...childDurations.map((item) => item.conservativeDurationDays))
  const sumRecommended = childDurations.reduce((sum, item) => sum + item.recommendedDurationDays, 0)
  const sumConservative = childDurations.reduce((sum, item) => sum + item.conservativeDurationDays, 0)
  const executionProfile = readExecutionProfileFromProjectFacts(featureProfile)
  const isFastTrack = executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')
    || executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')
    || readScenarioScheduleProfile(featureProfile).fastTrackIntensity === 'high'
  const sequentialModularItemPackProcessChain = isSequentialModularItemPackProcessChain(node, childDurations)
  const pipelineFactor = phaseKind === 'mep'
    ? 0.26
    : phaseKind === 'finishing' || phaseKind === 'facade'
      ? 0.32
      : phaseKind === 'superstructure'
        ? 0.42
        : phaseKind === 'foundation' || phaseKind === 'basement'
          ? 0.48
          : 0.38
  const fastTrackTailFactor = readFastTrackDescendantNetworkTailFactor(featureProfile, phaseKind)
  const adjustedPipelineFactor = sequentialModularItemPackProcessChain
    ? 1
    : fastTrackTailFactor !== null
    ? Math.min(pipelineFactor * 0.78, fastTrackTailFactor)
    : isFastTrack
      ? Math.max(0.18, pipelineFactor * 0.78)
      : pipelineFactor
  const networkRecommended = Math.max(
    maxRecommended,
    Math.ceil(maxRecommended + Math.max(0, sumRecommended - maxRecommended) * adjustedPipelineFactor),
  )
  const networkConservative = Math.max(
    maxConservative,
    Math.ceil(
      maxConservative
      + Math.max(0, sumConservative - maxConservative)
        * (sequentialModularItemPackProcessChain ? 1 : Math.min(0.62, adjustedPipelineFactor + 0.1)),
    ),
  )
  const replacementFactor = sequentialModularItemPackProcessChain
    ? null
    : readConstructionArchetypeDurationFactor(node.stableCode, featureProfile, null)
  const replacementProfile = replacementFactor
    && (
      replacementFactor.profile === 'steel_assembly_wet_work_replacement'
      || replacementFactor.profile === 'mic_modular_wet_work_replacement'
    )
    ? replacementFactor
    : null
  const adjustedRecommended = replacementProfile
    ? Math.max(1, Math.ceil(networkRecommended * replacementProfile.factor))
    : networkRecommended
  const adjustedConservative = replacementProfile
    ? Math.max(adjustedRecommended, Math.ceil(networkConservative * replacementProfile.factor))
    : networkConservative
  return {
    source: 'contextual_descendant_network_rollup',
    profile: [
      sequentialModularItemPackProcessChain ? 'sequential_specialty_item_pack_process_chain' : null,
      replacementProfile?.profile,
      `${phaseKind}_hidden_child_network`,
    ].filter(Boolean).join('+'),
    childCount: childDurations.length,
    maxChildRecommendedDays: maxRecommended,
    sumChildRecommendedDays: sumRecommended,
    pipelineFactor: adjustedPipelineFactor,
    replacementFactor: replacementProfile?.factor ?? null,
    recommendedDurationDays: adjustedRecommended,
    conservativeDurationDays: adjustedConservative,
    reason: sequentialModularItemPackProcessChain
      ? 'Mandatory processes inside one modular item pack remain sequential; factory-site overlap is applied between workfaces instead of compressing the package-internal process chain.'
      : replacementProfile
      ? 'Hidden child processes are scheduled as a managed construction network and then compressed by the selected fast-track wet-work replacement profile before projecting duration to the visible managed-frontier row.'
      : 'Hidden child processes are scheduled as a managed construction network, not a fully serial sum, before projecting duration to the visible managed-frontier row.',
  }
}



export async function preferContextualDescendantRollupDurationSuggestion(params: {
  projectId: string
  node: TemplateNode
  featureProfile: EngineeringFeatureProfile
  scope: WbsTemplateScope
  plannedStartDate?: string | null
  elementVariant: GeneratedElementVariant | null
  suggestion: GeneratedTemplateDurationSuggestion
  durationSuggestionMode: WbsTemplateDurationSuggestionMode
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeEvidenceMode?: 'record' | 'no_write'
  fastTemplateDurationCache?: FastTemplateDurationCache
  rollupCache?: Map<string, Promise<{
    recommendedDurationDays: number
    conservativeDurationDays: number
    samples: Array<Record<string, unknown>>
    rollupAdjustment: Record<string, unknown> | null
  } | null>>
}): Promise<GeneratedTemplateDurationSuggestion> {
  if (!shouldUseDescendantRollupForDurationSuggestion(params.node, params.suggestion)) {
    return params.suggestion
  }
  const rollup = await estimateContextualDescendantRollupDuration(params)
  if (!rollup) return params.suggestion
  const reason = '父级工序包命中泛化 seed，已改用子工序计划参考工期汇总，避免 overview 行被标题关键词误配到其他专业 family'
  const durationSeedStableCodes = uniqueStringArray(rollup.samples.map((sample) => (
    normalizeText(sample.durationSeedStableCode ?? sample.duration_seed_stable_code)
  )))
  const durationSeedResolverSources = uniqueStringArray(rollup.samples.map((sample) => (
    normalizeText(sample.durationSeedResolverSource ?? sample.duration_seed_resolver_source)
  )))
  const durationSeedResolverVersionIds = uniqueStringArray(rollup.samples.map((sample) => (
    normalizeText(sample.durationSeedResolverVersionId ?? sample.duration_seed_resolver_version_id)
  )))
  const durationSeedResolutions = [...new Map(rollup.samples.map((sample) => {
    const stableCode = normalizeText(sample.durationSeedStableCode ?? sample.duration_seed_stable_code)
    const resolverSource = normalizeText(sample.durationSeedResolverSource ?? sample.duration_seed_resolver_source)
      || 'ts_seed_fallback'
    const resolverVersionId = normalizeText(sample.durationSeedResolverVersionId ?? sample.duration_seed_resolver_version_id)
      || null
    return [
      [stableCode, resolverSource, resolverVersionId ?? ''].join('|'),
      { stableCode, resolverSource, resolverVersionId },
    ] as const
  }).filter(([, resolution]) => Boolean(resolution.stableCode))).values()]
  return {
    ...params.suggestion,
    recommendedDurationDays: rollup.recommendedDurationDays,
    conservativeDurationDays: rollup.conservativeDurationDays,
    durationOutputCode: 'contextual_reference',
    contextualReferenceDays: rollup.recommendedDurationDays,
    planReferenceDays: null,
    forecastSource: `${params.suggestion.forecastSource}+item_pack_descendant_rollup`,
    businessReason: [params.suggestion.businessReason, reason].map((item) => normalizeText(item)).filter(Boolean).join('；'),
    businessReasonCode: 'ITEM_PACK_DESCENDANT_ROLLUP',
    businessReasonCodes: uniqueStringArray([
      ...(params.suggestion.businessReasonCodes ?? []),
      'ITEM_PACK_DESCENDANT_ROLLUP',
    ]),
    businessReasonParams: {
      ...readRecord(params.suggestion.businessReasonParams),
      descendantRollup: {
        source: 'contextual_child_process_duration_suggestions',
        childCount: rollup.samples.length,
        samples: rollup.samples,
        durationSeedStableCodes,
        durationSeedResolverSource: durationSeedResolverSources.length === 1
          ? durationSeedResolverSources[0]
          : 'mixed_governed_resolvers',
        durationSeedResolverSources,
        durationSeedResolverVersionId: durationSeedResolverVersionIds.length === 1
          ? durationSeedResolverVersionIds[0]
          : null,
        durationSeedResolverVersionIds,
        durationSeedResolutions,
        childProcessStableCodes: uniqueStringArray(rollup.samples.map((sample) => (
          normalizeText(sample.stableCode ?? sample.stable_code)
        ))),
        rollupAdjustment: rollup.rollupAdjustment,
      },
    },
    dataMaturityReasons: uniqueStringArray([
      ...(params.suggestion.dataMaturityReasons ?? []),
      'item-pack duration uses contextual child process rollup because direct seed was generic fallback',
    ]),
    factorAvailability: {
      ...(params.suggestion.factorAvailability ?? {}),
      item_pack_descendant_rollup: true,
    },
  }
}



export async function applyFloorRhythmSeriesSuggestions(params: {
  suggestions: Map<string, GeneratedTemplateDurationSuggestion>
  targetsByScope: Array<{ scope: WbsTemplateScope; scopeIndex: number; targets: DurationSuggestionTarget[] }>
  fastTemplateDurationCache?: FastTemplateDurationCache
}) {
  for (const { scope, scopeIndex, targets } of params.targetsByScope) {
    if (!isFloorSeriesScope(scope)) continue
    const featureProfile = buildEngineeringFeatureProfile(scope)
    for (const target of targets) {
      if (!isRhythmExpansionEligibleNode(target.node)) continue
      const series = buildFloorRhythmSeriesAdjustment(target.node, scope)
      if (!series) continue
      const suggestionKey = getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant)
      const existing = params.suggestions.get(suggestionKey)
      const durationSeed = await resolveCachedFastTemplateDurationSeed(target.node, featureProfile, params.fastTemplateDurationCache)
      const durationSeedStableCode = normalizeText(durationSeed?.stableCode ?? series.adjustment.durationSeedStableCode)
      const usesDurationSeed = Boolean(durationSeedStableCode)
      const baseMode = normalizeDurationContributionMode(existing?.durationContributionMode)
        ?? readNodeDurationContributionMode(target.node)
      const baseSuggestion = existing ?? await buildFastTemplateDurationSuggestion(target.node, featureProfile, baseMode, params.fastTemplateDurationCache)
      params.suggestions.set(suggestionKey, {
        ...baseSuggestion,
        recommendedDurationDays: series.totalDays,
        conservativeDurationDays: Math.max(series.totalDays, Math.ceil(series.totalDays * 1.15)),
        businessReasonCode: 'STANDARD_FLOOR_RHYTHM_SERIES',
        businessReasonCodes: uniqueStringArray([
          ...(existing?.businessReasonCodes ?? []),
          'STANDARD_FLOOR_RHYTHM_SERIES',
        ]),
        businessReasonParams: {
          ...(existing?.businessReasonParams ?? {}),
          seedStableCode: durationSeedStableCode || (existing?.businessReasonParams?.seedStableCode as string | undefined) || null,
          floorRhythmSeries: true,
          totalRhythmDurationDays: series.totalDays,
          floorCount: scope.floor_series_count ?? scope.floor_series?.length ?? null,
        },
        displaySummary: [
          existing?.displaySummary,
          `?????? ${scope.floor_series_count ?? scope.floor_series?.length ?? 0} ??? ${series.totalDays} ??`,
        ].map(normalizeText).filter(Boolean).join(' '),
        factorAvailability: {
          ...(existing?.factorAvailability ?? {}),
          standard_work_duration_seed: existing?.factorAvailability?.standard_work_duration_seed || usesDurationSeed,
          standard_floor_rhythm_series: true,
        },
        durationCalibrationSource: usesDurationSeed ? 'standard_work_duration_seed' : (existing?.durationCalibrationSource ?? 'unavailable'),
        durationProvenance: usesDurationSeed ? 'standard_work_duration_seed' : (existing?.durationProvenance ?? 'unavailable'),
        forecastSource: usesDurationSeed
          ? 'standard_work_duration_seed:sync_fast_template:floor_rhythm_series'
          : (existing?.forecastSource ?? 'template_placeholder:sync_fast_template'),
        confidenceLevel: usesDurationSeed ? (existing?.confidenceLevel ?? 'medium') : (existing?.confidenceLevel ?? 'low'),
        confidenceScore: usesDurationSeed ? Math.max(existing?.confidenceScore ?? 0, 60) : existing?.confidenceScore ?? 38,
        dataMaturity: usesDurationSeed ? 'L1' : (existing?.dataMaturity ?? 'L0'),
        dataMaturityReasons: uniqueStringArray([
          ...(existing?.dataMaturityReasons ?? []),
          usesDurationSeed
            ? 'itemPack-level standard_work_duration seed matched for floor rhythm aggregate'
            : 'template floor rhythm curve used without itemPack duration seed match',
        ]),
        durationContributionMode: baseMode,
        floorRhythmAdjustment: {
          ...series.adjustment,
          durationSeedStableCode: durationSeedStableCode || null,
        },
      })
    }
  }
}



export async function applyParentPackageWindowSuggestions(params: {
  suggestions: Map<string, GeneratedTemplateDurationSuggestion>
  targetsByScope: Array<{ scope: WbsTemplateScope; scopeIndex: number; targets: DurationSuggestionTarget[] }>
  fastTemplateDurationCache?: FastTemplateDurationCache
}) {
  for (const { scope, scopeIndex, targets } of params.targetsByScope) {
    if (isFloorSeriesScope(scope)) continue
    const featureProfile = buildEngineeringFeatureProfile(scope)
    for (const target of targets) {
      if (target.node.categoryType !== 'item_work') continue
      const policy = inferParentDurationBoundaryPolicy(target.node)
      if (!isHardParentDurationBoundaryPolicy(policy)) continue
      const parentWindowDays = resolveParentReferenceDurationDays(target.node, scope)
      if (!parentWindowDays) continue
      const suggestionKey = getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant)
      const existing = params.suggestions.get(suggestionKey)
      const baseMode = normalizeDurationContributionMode(existing?.durationContributionMode)
        ?? readNodeDurationContributionMode(target.node)
      const metadata = readRecord(target.node.metadata)
      const businessReasonCode = parentWindowBusinessReasonCode(policy)
      const baseSuggestion = existing ?? await buildFastTemplateDurationSuggestion(target.node, featureProfile, baseMode, params.fastTemplateDurationCache)
      params.suggestions.set(suggestionKey, {
        ...baseSuggestion,
        recommendedDurationDays: parentWindowDays,
        conservativeDurationDays: Math.max(parentWindowDays, readPositiveNumber(existing?.conservativeDurationDays) ?? Math.ceil(parentWindowDays * 1.15)),
        businessReasonCode,
        businessReasonCodes: uniqueStringArray([
          ...(existing?.businessReasonCodes ?? []),
          businessReasonCode,
        ]),
        businessReasonParams: {
          ...(existing?.businessReasonParams ?? {}),
          parentPackageDurationTruth: true,
          parentReferenceDurationDays: parentWindowDays,
          rhythmPatternCode: normalizeText(metadata.rhythmPatternCode ?? metadata.rhythm_pattern_code) || null,
          floorSequencePosition: scope.floor_sequence_position ?? null,
          floorSequenceNumber: scope.floor_sequence_number ?? null,
          floorSequenceTotal: scope.floor_sequence_total ?? null,
          planDurationTruthSource: 'parent_package_rhythm_window',
        },
        displaySummary: `标准层节拍包计划工期 ${parentWindowDays} 天；父级节点是本层结构流水总窗口，包内子工序只展示各自占用窗口。`,
        factorAvailability: {
          ...(existing?.factorAvailability ?? {}),
          parent_package_window_plan_truth: true,
          standard_floor_rhythm_curve: policy === 'rhythm_package_window',
          package_child_duration_window: true,
        },
        forecastSource: `${existing?.forecastSource ?? 'template_seed'}${existing?.forecastSource?.includes('parent_package_window') ? '' : '+parent_package_window'}`,
        floorRhythmAdjustment: {
          ...(existing?.floorRhythmAdjustment ?? {}),
          source: 'template_duration_truth_asset',
          adjustmentKind: policy === 'rhythm_package_window' ? 'floor_duration_curve' : 'parent_package_window',
          allocationPolicy: 'parent_package_rhythm_window',
          rhythmPatternCode: normalizeText(metadata.rhythmPatternCode ?? metadata.rhythm_pattern_code) || null,
          rhythmNodeStableCode: target.node.stableCode,
          floorSequenceNumber: scope.floor_sequence_number,
          floorSequenceTotal: scope.floor_sequence_total,
          floorSequencePosition: scope.floor_sequence_position,
          floorCurveDays: parentWindowDays,
          adjustedDurationDays: parentWindowDays,
        },
        parentDurationBoundaryPolicy: policy,
        nonAdditiveWithParentDuration: false,
        parentReferenceDurationDays: parentWindowDays,
        planDurationTruthSource: 'parent_package_rhythm_window',
      })
    }
  }
}



export async function buildDurationSuggestionMap(params: {
  projectId: string
  selectedNodes: TemplateNode[]
  scopeCombos: WbsTemplateScope[]
  scopeContexts?: Array<{ scope: WbsTemplateScope; selectedNodes: TemplateNode[] }>
  generationDepth: WbsTemplateGenerationDepth
  durationSuggestionMode: WbsTemplateDurationSuggestionMode
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeEvidenceMode?: 'record' | 'no_write'
  plannedStartDate?: string | null
  scopeStartDateByIndex?: Map<number, string>
  onStageTiming?: (stage: string, details?: Record<string, unknown>) => void
}) {
  const suggestions = new Map<string, GeneratedTemplateDurationSuggestion>()
  const fastTemplateDurationCache = createFastTemplateDurationCache()
  const rollupCache = new Map<string, Promise<{
    recommendedDurationDays: number
    conservativeDurationDays: number
    samples: Array<Record<string, unknown>>
    rollupAdjustment: Record<string, unknown> | null
  } | null>>()
  const scopeContexts = params.scopeContexts?.length
    ? params.scopeContexts.map((context, scopeIndex) => ({
        scope: context.scope,
        scopeIndex,
        selectedNodes: context.selectedNodes,
      }))
    : params.scopeCombos.map((scope, scopeIndex) => ({
        scope,
        scopeIndex,
        selectedNodes: params.selectedNodes,
      }))
  const selectedNodesForLookup = scopeContexts.flatMap((context) => context.selectedNodes)
  const nodeById = collectTemplateNodesById(selectedNodesForLookup.length > 0 ? selectedNodesForLookup : params.selectedNodes)
  const targetsByScope = scopeContexts.map(({ scope, scopeIndex, selectedNodes }) => ({
    scope,
    scopeIndex,
    targets: selectedNodes.flatMap((node) => collectDurationSuggestionTargets(node, params.generationDepth, scope)),
  }))

  const durationSuggestionTargets = targetsByScope.flatMap(({ scope, scopeIndex, targets }) => (
    targets
      .filter((target) => target.node.categoryType !== 'activity_step')
      .map((target) => ({ scope, scopeIndex, target }))
  ))
  params.onStageTiming?.('duration_suggestion_targets_collected', {
    targetCount: durationSuggestionTargets.length,
    scopeCount: scopeContexts.length,
  })

  await mapWithConcurrencyLimit(
    durationSuggestionTargets,
    DURATION_SUGGESTION_CONCURRENCY_LIMIT,
    async ({ scope, scopeIndex, target }) => {
        const durationContributionMode = readNodeDurationContributionMode(target.node)
        if (!isDurationBearingContributionMode(durationContributionMode)) {
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            buildNonDurationTemplateSuggestion(durationContributionMode),
          )
          return
        }
        const featureProfile = buildEngineeringFeatureProfile(scope)
        if (params.durationSuggestionMode === 'fast_template') {
          const fastSuggestion = await buildFastTemplateDurationSuggestion(
            target.node,
            featureProfile,
            durationContributionMode,
            fastTemplateDurationCache,
          )
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            await applyManagedFrontierDescendantRollupDurationSuggestion({
              projectId: params.projectId,
              node: target.node,
              generationDepth: params.generationDepth,
              featureProfile,
              scope,
              plannedStartDate: params.scopeStartDateByIndex?.get(scopeIndex) ?? params.plannedStartDate,
              elementVariant: target.elementVariant,
              suggestion: fastSuggestion,
              durationSuggestionMode: params.durationSuggestionMode,
              runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec,
              runtimeEvidenceMode: params.runtimeEvidenceMode,
              fastTemplateDurationCache,
              rollupCache,
            }),
          )
          return
        }
        if (params.durationSuggestionMode === 'benchmark_plan_reference') {
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            buildBenchmarkPlanReferenceDurationSuggestion(target.node, durationContributionMode),
          )
          return
        }
        const suggestion = await getTaskDurationSuggestion({
          projectId: params.projectId,
          templateNodeId: isBuiltInChinaTemplateId(target.node.templateId) ? null : target.node.id,
          templateStableCode: target.node.stableCode,
          wbsNodeType: target.node.categoryType,
          engineeringCategoryId: target.node.engineeringCategoryId,
          standardWorkCode: target.node.standardWorkCode,
          standardWorkName: target.node.standardWorkName,
          taskTitle: decorateTitleWithElementVariant(target.node.name, target.elementVariant),
          plannedStartDate: params.scopeStartDateByIndex?.get(scopeIndex) ?? params.plannedStartDate,
          engineeringObjectId: scope.engineering_object_id,
          buildingObjectId: scope.building_object_id,
          floorObjectId: scope.floor_object_id,
          zoneObjectId: scope.physical_zone_object_id,
          projectTypeCode: featureProfile.projectTypeCode,
          structureTypeCode: featureProfile.structureTypeCode,
          methodVariantCodes: featureProfile.methodVariantCodes,
          projectGenerationFacts: buildProjectGenerationFactsSnapshot(featureProfile),
          elementVariantCodes: target.elementVariant ? [target.elementVariant.code] : featureProfile.elementVariantCodes,
          parentStandardWorkCode: target.parentDurationBoundary?.parentStandardWorkCode ?? null,
          parentTaskTitle: target.parentDurationBoundary?.parentTaskTitle ?? null,
          parentDurationBoundaryPolicy: target.parentDurationBoundary?.parentDurationBoundaryPolicy ?? null,
          parentDurationPolicySource: target.parentDurationBoundary?.parentDurationPolicySource ?? null,
          parentReferenceDurationDays: target.parentDurationBoundary?.parentReferenceDurationDays ?? null,
          packageChildRhythmWindowStartDay: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowStartDay ?? readRecord(target.node.metadata).rhythm_window_start_day),
          packageChildRhythmWindowEndDay: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowEndDay ?? readRecord(target.node.metadata).rhythm_window_end_day),
          packageChildRhythmWindowDurationDays: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowDurationDays ?? readRecord(target.node.metadata).rhythm_window_duration_days),
          packageChildRhythmWindowRole: normalizeText(readRecord(target.node.metadata).rhythmWindowRole ?? readRecord(target.node.metadata).rhythm_window_role) || null,
          runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec ?? undefined,
          runtimeEvidenceMode: params.runtimeEvidenceMode,
        })
        const serializedSuggestion = await preferContextualDescendantRollupDurationSuggestion({
          projectId: params.projectId,
          node: target.node,
          featureProfile,
          scope,
          plannedStartDate: params.scopeStartDateByIndex?.get(scopeIndex) ?? params.plannedStartDate,
          elementVariant: target.elementVariant,
          suggestion: serializeDurationSuggestion(suggestion),
          durationSuggestionMode: params.durationSuggestionMode,
          runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec,
          runtimeEvidenceMode: params.runtimeEvidenceMode,
          fastTemplateDurationCache,
          rollupCache,
        })
        const managedFrontierSuggestion = await applyManagedFrontierDescendantRollupDurationSuggestion({
          projectId: params.projectId,
          node: target.node,
          generationDepth: params.generationDepth,
          featureProfile,
          scope,
          plannedStartDate: params.scopeStartDateByIndex?.get(scopeIndex) ?? params.plannedStartDate,
          elementVariant: target.elementVariant,
          suggestion: serializedSuggestion,
          durationSuggestionMode: params.durationSuggestionMode,
          runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec,
          runtimeEvidenceMode: params.runtimeEvidenceMode,
          fastTemplateDurationCache,
          rollupCache,
        })
        suggestions.set(
          getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
          managedFrontierSuggestion,
        )
      },
  )
  params.onStageTiming?.('duration_suggestion_base_targets_built', {
    suggestionCount: suggestions.size,
    rollupCacheSize: rollupCache.size,
    fastTemplateSeedCacheSize: fastTemplateDurationCache.seedByKey.size,
    fastTemplateSuggestionCacheSize: fastTemplateDurationCache.suggestionByKey.size,
    fastTemplateDescendantCacheSize: fastTemplateDurationCache.descendantByKey.size,
  })

  applyFloorRhythmCurvesToSuggestionMap({ suggestions, targetsByScope, nodeById })
  params.onStageTiming?.('duration_suggestion_floor_curves_applied', { suggestionCount: suggestions.size })
  applyExplicitParentPackageWindowsToSuggestionMap({ suggestions, targetsByScope })
  params.onStageTiming?.('duration_suggestion_explicit_parent_windows_applied', { suggestionCount: suggestions.size })
  await applyParentPackageWindowSuggestions({ suggestions, targetsByScope, fastTemplateDurationCache })
  params.onStageTiming?.('duration_suggestion_parent_windows_applied', { suggestionCount: suggestions.size })
  await applyFloorRhythmSeriesSuggestions({ suggestions, targetsByScope, fastTemplateDurationCache })
  params.onStageTiming?.('duration_suggestion_floor_series_applied', { suggestionCount: suggestions.size })

  if (params.generationDepth === 'activity_step') {
    for (const { scope, scopeIndex, targets } of targetsByScope) {
      const activityTargets = targets.filter((target) => target.node.categoryType === 'activity_step')
      const activityTargetsByParent = new Map<string, { parent: TemplateNode, targets: DurationSuggestionTarget[] }>()
      for (const target of activityTargets) {
        const parent = target.node.parentId ? nodeById.get(target.node.parentId) ?? null : null
        if (!parent || parent.categoryType !== 'process') continue
        const parentKey = `${parent.id}:${target.elementVariant?.code ?? 'base'}`
        const group = activityTargetsByParent.get(parentKey) ?? { parent, targets: [] }
        group.targets.push(target)
        activityTargetsByParent.set(parentKey, group)
      }

      for (const { parent, targets: siblingTargets } of activityTargetsByParent.values()) {
        const sortedSiblingTargets = [...siblingTargets].sort((left, right) => (
          parent.children.findIndex((child) => child.id === left.node.id)
          - parent.children.findIndex((child) => child.id === right.node.id)
        ))
        const durationBearingTargets = sortedSiblingTargets.filter((target) => isDurationBearingNode(target.node))
        const nonDurationTargets = sortedSiblingTargets.filter((target) => !isDurationBearingNode(target.node))
        const elementVariant = sortedSiblingTargets[0]?.elementVariant ?? null
        const parentKey = getDurationSuggestionKey(scopeIndex, parent, elementVariant)
        const parentSuggestion = suggestions.get(parentKey)
        if (!parentSuggestion) continue
        const parentBaseDays = readPositiveNumber(parentSuggestion.recommendedDurationDays)
          ?? readPositiveNumber(parent.defaultDurationDays)
          ?? Math.max(durationBearingTargets.length, 1)
        const parentTotalDays = Math.max(parentBaseDays, durationBearingTargets.length || 1)
        if (parentTotalDays !== parentBaseDays) {
          suggestions.set(parentKey, withRecommendedDuration(
            parentSuggestion,
            parentTotalDays,
            `?????? activity_step ??????????? 1 ???? process ??????? ${parentTotalDays} ?`,
          ))
        }
        const alignedParentSuggestion = suggestions.get(parentKey) ?? parentSuggestion
        const stepDurations = distributePlanDurationAcrossActivitySteps(parentTotalDays, durationBearingTargets.length || 1)
        durationBearingTargets.forEach((target, index) => {
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            buildActivityStepDurationSuggestion(alignedParentSuggestion, stepDurations[index] ?? 1, index, durationBearingTargets.length, parentTotalDays),
          )
        })
        nonDurationTargets.forEach((target) => {
          const mode = readNodeDurationContributionMode(target.node)
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            buildNonDurationActivityStepSuggestion(alignedParentSuggestion, mode),
          )
        })
      }

      const unresolvedActivityTargets = activityTargets
        .filter((target) => !suggestions.has(getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant)) && isDurationBearingNode(target.node))
        .map((target) => ({ scope, scopeIndex, target }))
      await mapWithConcurrencyLimit(unresolvedActivityTargets, DURATION_SUGGESTION_CONCURRENCY_LIMIT, async ({ scope, scopeIndex, target }) => {
        const featureProfile = buildEngineeringFeatureProfile(scope)
        if (params.durationSuggestionMode === 'fast_template') {
          const durationContributionMode = readNodeDurationContributionMode(target.node)
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            await buildFastTemplateDurationSuggestion(
              target.node,
              featureProfile,
              durationContributionMode,
              fastTemplateDurationCache,
            ),
          )
          return
        }
        if (params.durationSuggestionMode === 'benchmark_plan_reference') {
          const durationContributionMode = readNodeDurationContributionMode(target.node)
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            buildBenchmarkPlanReferenceDurationSuggestion(target.node, durationContributionMode),
          )
          return
        }
        const suggestion = await getTaskDurationSuggestion({
          projectId: params.projectId,
          templateNodeId: isBuiltInChinaTemplateId(target.node.templateId) ? null : target.node.id,
          templateStableCode: target.node.stableCode,
          wbsNodeType: target.node.categoryType,
          engineeringCategoryId: target.node.engineeringCategoryId,
          standardWorkCode: target.node.standardWorkCode,
          standardWorkName: target.node.standardWorkName,
          taskTitle: decorateTitleWithElementVariant(target.node.name, target.elementVariant),
          plannedStartDate: params.plannedStartDate,
          engineeringObjectId: scope.engineering_object_id,
          buildingObjectId: scope.building_object_id,
          floorObjectId: scope.floor_object_id,
          zoneObjectId: scope.physical_zone_object_id,
          projectTypeCode: featureProfile.projectTypeCode,
          structureTypeCode: featureProfile.structureTypeCode,
          methodVariantCodes: featureProfile.methodVariantCodes,
          projectGenerationFacts: buildProjectGenerationFactsSnapshot(featureProfile),
          elementVariantCodes: target.elementVariant ? [target.elementVariant.code] : featureProfile.elementVariantCodes,
          parentStandardWorkCode: target.parentDurationBoundary?.parentStandardWorkCode ?? null,
          parentTaskTitle: target.parentDurationBoundary?.parentTaskTitle ?? null,
          parentDurationBoundaryPolicy: target.parentDurationBoundary?.parentDurationBoundaryPolicy ?? null,
          parentDurationPolicySource: target.parentDurationBoundary?.parentDurationPolicySource ?? null,
          parentReferenceDurationDays: target.parentDurationBoundary?.parentReferenceDurationDays ?? null,
          packageChildRhythmWindowStartDay: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowStartDay ?? readRecord(target.node.metadata).rhythm_window_start_day),
          packageChildRhythmWindowEndDay: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowEndDay ?? readRecord(target.node.metadata).rhythm_window_end_day),
          packageChildRhythmWindowDurationDays: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowDurationDays ?? readRecord(target.node.metadata).rhythm_window_duration_days),
          packageChildRhythmWindowRole: normalizeText(readRecord(target.node.metadata).rhythmWindowRole ?? readRecord(target.node.metadata).rhythm_window_role) || null,
          runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec ?? undefined,
          runtimeEvidenceMode: params.runtimeEvidenceMode,
        })
        const serializedSuggestion = await preferContextualDescendantRollupDurationSuggestion({
          projectId: params.projectId,
          node: target.node,
          featureProfile,
          scope,
          plannedStartDate: params.plannedStartDate,
          elementVariant: target.elementVariant,
          suggestion: serializeDurationSuggestion(suggestion),
          durationSuggestionMode: params.durationSuggestionMode,
          runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec,
          runtimeEvidenceMode: params.runtimeEvidenceMode,
        })
        suggestions.set(
          getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
          serializedSuggestion,
        )
      })
    }
  }
  return suggestions
}



export function normalizeGeneratedPlanDurationFields(rows: GeneratedTemplateRow[]) {
  for (const row of rows) {
    row.values = {
      ...row.values,
      smart_reference_days: readPlanReferenceDurationNumber(row.values.smart_reference_days),
    }
  }
  return rows
}



export type ResidentialMasterPlanActivity = {
  code: string
  title: string
  executionPhase: string
  executionLane: string
  startOffsetDays: number
  durationDays: number
  predecessorCodes?: string[]
  predecessorRules?: Array<{
    code: string
    dependencyType?: GeneratedTemplateDependency['dependencyType']
    lagDays?: number
    intentCode?: string
  }>
  dependencyType?: GeneratedTemplateDependency['dependencyType']
  lagDays?: number
  dependencyIntentCode?: string
  tags?: string[]
  planItemKind?: GeneratedPlanItemKind
  durationContributionMode?: DurationContributionMode
  executionNature?: ExecutionNature
  durationAssetStableCode?: string
  t2RhythmTemplateId?: string
  t2RhythmApplicability?: 'required_repetitive_or_workface_activity' | 'not_applicable_one_off_activity'
  durationFormula?: string
  quantityProxy?: {
    value: number
    unit: string
    basis: string
    source?: string
  }
  durationCalculationBasis?: {
    minDays?: number
    maxDays?: number
    fallbackDays?: number
    fixedBufferDays?: number
    factor?: number
    selectionRule?: string
  }
  methodVariantCode?: string
  buildingSequenceNumber?: number
  organizationLaneReleaseStepDays?: number
  organizationLaneReleaseLagDays?: number
  durationBaselineAuthority?: 'project_organization_variant'
  projectOrganizationVariantCode?: string
  contractualCloseoutRole?: 'completion_filing' | 'property_handover'
  contractualTerminalControlCode?: string
}



export type BusinessTypeMasterPlanActivity = ResidentialMasterPlanActivity



export type StandardWorkDurationSeedRule = StandardWorkDurationSeedResolverRecord


export type StandardDurationSeedRecord = StandardWorkDurationSeedResolverRecord


export type StandardDurationSeedLookup = Map<string, StandardDurationSeedRecord | null>


export type ResolvedT2DivisionRhythmTemplate = T2DivisionRhythmTemplate & {
  __resolverSource?: T2DivisionRhythmTemplateResolverRecord['__resolverSource']
  __resolverVersionId?: string | null
  __resolverStableCode?: string | null
}


export type T2RhythmTemplateLookup = Map<string, ResolvedT2DivisionRhythmTemplate | null>



export function normalizeT2RhythmTemplateKey(templateId: string | null | undefined) {
  return normalizeText(templateId).toLowerCase()
}



export function mergeResolvedT2RhythmTemplate(
  templateId: string,
  resolved: T2DivisionRhythmTemplateResolverRecord | null,
): ResolvedT2DivisionRhythmTemplate | null {
  const fallback = T2_DIVISION_RHYTHM_TEMPLATE_SEED.find((template) => template.templateId === templateId) ?? null
  if (!resolved) return fallback
  const resolvedRecord = readRecord(resolved)
  const resolvedRhythm = readRecord(resolvedRecord.rhythm)
  const fallbackRhythm = readRecord(fallback?.rhythm)
  const mergedRhythm = {
    ...(fallbackRhythm as T2DivisionRhythmTemplate['rhythm']),
    ...(resolvedRhythm as Partial<T2DivisionRhythmTemplate['rhythm']>),
    parentWindowDays: {
      ...(readRecord(fallbackRhythm.parentWindowDays) as T2DivisionRhythmTemplate['rhythm']['parentWindowDays']),
      ...(readRecord(resolvedRhythm.parentWindowDays ?? resolvedRecord.parentWindowDays ?? resolvedRecord.parent_window_days) as Partial<T2DivisionRhythmTemplate['rhythm']['parentWindowDays']>),
    },
  }
  return {
    ...((fallback ?? {}) as T2DivisionRhythmTemplate),
    ...(resolvedRecord as Partial<T2DivisionRhythmTemplate>),
    templateId: normalizeText(resolvedRecord.templateId ?? resolvedRecord.template_id) || fallback?.templateId || templateId,
    rhythm: mergedRhythm as T2DivisionRhythmTemplate['rhythm'],
    __resolverSource: resolved.__resolverSource,
    __resolverVersionId: resolved.__resolverVersionId ?? null,
    __resolverStableCode: resolved.__stableCode ?? templateId,
  } as ResolvedT2DivisionRhythmTemplate
}


export type DefaultMasterPlanProcessSeasonalDurationAdjustment = {
  source: 'process_seasonal_sensitivity'
  baseDurationDays: number
  adjustedDurationDays: number
  multiplier: number
  productivityMultiplier: number
  stableCode: string
  climateSignal: string | null
  monthlyClimateSignal: string | null
  impactBand: string | null
  month: number
  workEnvironment: string | null
  resolverSource: string | null
  mutationBoundary: 'candidate_only_no_business_fact_write'
}


export type DefaultMasterPlanRuntimeReferenceDay = {
  stableCode: string
  p50Days: number
  p80Days: number | null
  sampleCount: number | null
  source: string
  sourceSampleIds: string[]
}


export type DefaultMasterPlanRuntimeReferenceDaysInput = {
  status: 'runtime_calibrated'
  evidenceLevel: 'runtime_calibrated_l2'
  runtimeReferenceDays: DefaultMasterPlanRuntimeReferenceDay[]
  recordsByStableCode: Map<string, DefaultMasterPlanRuntimeReferenceDay>
}



export const ASSET_BACKED_DEFAULT_MASTER_PLAN_SOURCE = 'asset_backed_default_master_plan'


export const RESIDENTIAL_DEFAULT_MASTER_PLAN_ENTRY_TEMPLATE_CODE = 'residential_master_plan_v2'


export const ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE = 'system_standard_asset_backed_master_plan_v2'


export const ASSET_BACKED_MASTER_PLAN_SOURCE_VERSION = 'v1.4.24-system-standard-default-master-plan-20260710'


export const ASSET_BACKED_MASTER_PLAN_DURATION_CALIBRATION_SOURCE = 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules'


export const STANDARD_SEED_ONLY_MASTER_PLAN_DURATION_CALIBRATION_SOURCE = 'standard_work_duration_seed'


export const ASSET_BACKED_MASTER_PLAN_TRUTH_SOURCE = 'system_standard_executable_master_plan'


export const REAL_PLAN_SKELETON_SOURCE_IDS = [
  'source:real_construction_schedule_shape:2026-06-30:v1',
  'source:real_project_cases:v1',
  'source:planned_schedule_field_review:v1',
]



export function scoreDefaultMasterPlanCrossItemPrefixMatch(code: string, prefix: string) {
  const normalizedCode = normalizeText(code).toUpperCase()
  const normalizedPrefix = normalizeText(prefix).toUpperCase()
  if (!normalizedCode || !normalizedPrefix) return 0
  if (normalizedCode === normalizedPrefix) return 80
  if (normalizedCode.startsWith(`${normalizedPrefix}-`)) return 55
  if (normalizedPrefix.startsWith(`${normalizedCode}-`)) return 20
  return 0
}



export const DEFAULT_MASTER_PLAN_CROSS_ITEM_CODE_ALIAS_PREFIXES: Record<string, string[]> = {
  MOD: ['MIC'],
}



export const DEFAULT_MASTER_PLAN_CROSS_ITEM_CODE_ALIASES: Record<string, string[]> = {
  'BTMP-DTC-03': ['DTC-03-01'],
  'DTC-03': ['DTC-03-01'],
  'BTMP-DTC-04': ['DTC-02'],
  'DTC-04': ['DTC-02'],
  'BTMP-DTC-05': ['INT-04-01-01', 'ELE-04-01-01'],
  'DTC-05': ['INT-04-01-01', 'ELE-04-01-01'],
  'BTMP-HSP-03': ['CLN-01'],
  'HSP-03': ['CLN-01'],
  'BTMP-HSP-04': ['CLN-01-01-02'],
  'HSP-04': ['CLN-01-01-02'],
  'BTMP-HSP-05': ['CLN-03-01-05'],
  'HSP-05': ['CLN-03-01-05'],
  'BTMP-HSP-05A': ['CLN-02', 'CLN-02-01-02'],
  'HSP-05A': ['CLN-02', 'CLN-02-01-02'],
  'BTMP-HSP-06': ['CLN-02', 'CLN-02-01-02'],
  'HSP-06': ['CLN-02', 'CLN-02-01-02'],
  'BTMP-SCH-01': ['02-01'],
  'SCH-01': ['02-01'],
  'BTMP-SCH-02': ['02-02'],
  'SCH-02': ['02-02'],
  'BTMP-SCH-04': ['03-02'],
  'SCH-04': ['03-02'],
  'BTMP-MOD-04': ['MIC-03'],
  'MOD-04': ['MIC-03'],
}



export function expandDefaultMasterPlanCrossItemWorkflowCodes(code: string | null | undefined) {
  const normalizedCode = normalizeText(code).toUpperCase()
  if (!normalizedCode) return []
  const codes = [normalizedCode]
  if (normalizedCode.startsWith('BTMP-')) codes.push(normalizedCode.slice(5))
  for (const currentCode of [...codes]) {
    const [prefix, ...rest] = currentCode.split('-')
    if (!prefix || rest.length === 0) continue
    for (const aliasPrefix of DEFAULT_MASTER_PLAN_CROSS_ITEM_CODE_ALIAS_PREFIXES[prefix] ?? []) {
      codes.push([aliasPrefix, ...rest].join('-'))
    }
  }
  if (normalizedCode.startsWith('RMP-04-')) {
    codes.push('02-01')
  }
  if (normalizedCode.startsWith('RMP-05-')) {
    codes.push('02-02')
  }
  if (normalizedCode.startsWith('RMP-09-')) {
    codes.push('03-02')
  }
  codes.push(...(DEFAULT_MASTER_PLAN_CROSS_ITEM_CODE_ALIASES[normalizedCode] ?? []))
  return uniqueStringArray(codes)
}



export function maxDefaultMasterPlanCrossItemPrefixMatchScore(codes: string[], prefixes: string[]) {
  return Math.max(0, ...codes.flatMap((code) => (
    prefixes.map((prefix) => scoreDefaultMasterPlanCrossItemPrefixMatch(code, prefix))
  )))
}



export function resolveDefaultMasterPlanCrossItemWorkflowAsset(params: {
  intentCode: string
  predecessorStableCode?: string | null
  successorStableCode?: string | null
  predecessorActivity?: ResidentialMasterPlanActivity | null
  successorActivity?: ResidentialMasterPlanActivity | null
}): V1475CrossItemWorkflowRule | null {
  if (params.intentCode === 'business_type_profile_phase_anchor') return null
  const predecessorCodes = uniqueStringArray([
    ...expandDefaultMasterPlanCrossItemWorkflowCodes(params.predecessorStableCode),
    ...expandDefaultMasterPlanCrossItemWorkflowCodes(params.predecessorActivity?.code),
    ...expandDefaultMasterPlanCrossItemWorkflowCodes(params.predecessorActivity?.durationAssetStableCode),
  ])
  const successorCodes = uniqueStringArray([
    ...expandDefaultMasterPlanCrossItemWorkflowCodes(params.successorStableCode),
    ...expandDefaultMasterPlanCrossItemWorkflowCodes(params.successorActivity?.code),
    ...expandDefaultMasterPlanCrossItemWorkflowCodes(params.successorActivity?.durationAssetStableCode),
  ])
  const predecessorText = [
    params.predecessorActivity?.code,
    params.predecessorActivity?.title,
    params.predecessorActivity?.executionPhase,
    params.predecessorActivity?.executionLane,
    params.predecessorActivity?.durationAssetStableCode,
    ...(params.predecessorActivity?.tags ?? []),
  ].map((item) => normalizeText(item).toLowerCase()).filter(Boolean).join(' ')
  const successorText = [
    params.successorActivity?.code,
    params.successorActivity?.title,
    params.successorActivity?.executionPhase,
    params.successorActivity?.executionLane,
    params.successorActivity?.durationAssetStableCode,
    ...(params.successorActivity?.tags ?? []),
  ].map((item) => normalizeText(item).toLowerCase()).filter(Boolean).join(' ')
  const categoryHints = new Set<V1475CrossItemWorkflowRule['handoffCategory']>()
  const combinedText = `${predecessorText} ${successorText} ${params.intentCode}`
  if (/masonry|secondary_structure|砌体|二次结构/.test(combinedText)) categoryHints.add('structure_masonry_infill')
  if (/mep|plumbing|fire|pipe|机电|管线|消防|立管/.test(combinedText)) categoryHints.add('mep_to_finishes')
  if (/facade|envelope|roof|curtain|外立面|幕墙|屋面|门窗/.test(combinedText)) categoryHints.add('structure_envelope_roof')
  if (/elevator|vertical_transport|电梯|塔吊|垂直/.test(combinedText)) categoryHints.add('vertical_transport')
  if (/outdoor|municipal|landscape|室外|市政|景观|道路|管网/.test(combinedText)) categoryHints.add('outdoor_municipal')
  if (/data_center|white_space|cleanroom|机房|白区|洁净|数据中心/.test(combinedText)) categoryHints.add('data_center_cleanroom')
  if (/commission|handover|acceptance|调试|验收|移交/.test(combinedText)) categoryHints.add('mep_system_commissioning')
  if (/modular|mic|prefab|module|factory|hoisting/.test(combinedText)) categoryHints.add('prefab_modular')

  const scoreRule = (rule: V1475CrossItemWorkflowRule) => {
    if (rule.isActive === false) return -1
    if (rule.autoApplyPolicy !== 'confirmed_template_only') return -1
    let score = 0
    const predecessorPrefixScore = maxDefaultMasterPlanCrossItemPrefixMatchScore(predecessorCodes, rule.predecessorCodePrefixes)
    const successorPrefixScore = maxDefaultMasterPlanCrossItemPrefixMatchScore(successorCodes, rule.successorCodePrefixes)
    if (predecessorPrefixScore <= 0 || successorPrefixScore <= 0) return -1
    score += predecessorPrefixScore + successorPrefixScore
    if (rule.handoffCategory && categoryHints.has(rule.handoffCategory)) score += 80
    if (
      /hospital|medical|medgas|medical_gas|医院|医疗|医气|手术/.test(combinedText)
      && /hospital|medical|medgas|GB50751|医疗|医气/.test([
        rule.stableCode,
        rule.sourceVersion,
        rule.sourceClauseRef,
        ...(rule.evidenceSourceKeys ?? []),
      ].join(' '))
    ) {
      score += 18
    }
    if (rule.strength === 'hard') score += 10
    if (rule.confidence === 'high') score += 6
    if (!rule.stableCode.startsWith('expanded_')) score += 2
    if (rule.predecessorCategoryTypes?.includes('process') || rule.successorCategoryTypes?.includes('process')) score -= 20
    return score
  }
  return V1475_CROSS_ITEM_WORKFLOW_SEED
    .map((rule) => ({ rule, score: scoreRule(rule) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.rule.stableCode.localeCompare(right.rule.stableCode))[0]
    ?.rule ?? null
}



export function buildDefaultMasterPlanDependencyRuleEvidence(params: {
  intentCode: string
  dependencyType: GeneratedTemplateDependency['dependencyType']
  lagDays: number
  predecessorStableCode?: string | null
  successorStableCode?: string | null
  predecessorActivity?: ResidentialMasterPlanActivity | null
  successorActivity?: ResidentialMasterPlanActivity | null
}): DefaultMasterPlanDependencyRuleEvidence {
  const relationLayerKey: ConstructionDependencyRuleLayerKey = params.intentCode === 'business_type_profile_phase_anchor'
    ? 'cross_business_domain_dependency_intent'
    : 'cross_item_workflow'
  const hasProcessTimingConstraint = params.dependencyType !== 'FS' || params.lagDays !== 0
  const layerStack = uniqueStringArray([
    relationLayerKey,
    hasProcessTimingConstraint ? 'process_constraint' : null,
  ].filter(Boolean)) as ConstructionDependencyRuleLayerKey[]
  const dependencyAsset = relationLayerKey === 'cross_item_workflow'
    ? resolveDefaultMasterPlanCrossItemWorkflowAsset(params)
    : null
  const predecessorT2RhythmTemplateId = normalizeText(params.predecessorActivity?.t2RhythmTemplateId) || null
  const successorT2RhythmTemplateId = normalizeText(params.successorActivity?.t2RhythmTemplateId) || null
  const hasActivityTimingAsset = Boolean(
    dependencyAsset
      || predecessorT2RhythmTemplateId
      || successorT2RhythmTemplateId
      || Number.isFinite(Number(params.predecessorActivity?.startOffsetDays))
      || Number.isFinite(Number(params.successorActivity?.startOffsetDays)),
  )
  const dependencyTimingSource = dependencyAsset
    && params.dependencyType === dependencyAsset.dependencyType
    && Number(params.lagDays) === Number(dependencyAsset.lagDays)
    ? 'cross_item_workflow_asset' as const
    : 'default_master_plan_activity_offset' as const
  return {
    ...buildConstructionDependencyRuleEvidence({
      relationLayerKey,
      layerStack,
      dependencyType: params.dependencyType,
      lagDays: params.lagDays,
      intentCode: params.intentCode,
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
    }),
    productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
    mutationBoundary: 'preview_no_write_wizard_commit_transactional',
    ...(dependencyAsset
      ? {
          dependencyAssetConsumed: true as const,
          dependencyAssetType: 'cross_item_workflow' as const,
          dependencyAssetStableCode: dependencyAsset.stableCode,
          dependencyAssetAutoApplyPolicy: dependencyAsset.autoApplyPolicy,
          dependencyAssetStrength: dependencyAsset.strength,
          dependencyAssetHandoffCategory: dependencyAsset.handoffCategory ?? null,
          dependencyAssetScopeRule: dependencyAsset.scopeRule,
          dependencyAssetDependencyType: dependencyAsset.dependencyType,
          dependencyAssetLagDays: dependencyAsset.lagDays,
          dependencyAssetSourceStandard: dependencyAsset.sourceStandard,
          dependencyAssetSourceVersion: dependencyAsset.sourceVersion,
          dependencyAssetSourceClauseRef: dependencyAsset.sourceClauseRef,
          dependencyAssetEvidenceSourceKeys: dependencyAsset.evidenceSourceKeys,
          dependencyAssetBoundaryPolicy: dependencyAsset.boundaryPolicy,
          dependencyAssetConfidence: dependencyAsset.confidence,
        }
      : {}),
    ...(hasActivityTimingAsset
      ? {
          dependencyTimingAssetConsumed: true as const,
          dependencyTimingSource,
          dependencyTimingPredecessorT2RhythmTemplateId: predecessorT2RhythmTemplateId,
          dependencyTimingSuccessorT2RhythmTemplateId: successorT2RhythmTemplateId,
          dependencyTimingSelectedLagDays: params.lagDays,
          dependencyTimingPredecessorStartOffsetDays: Number.isFinite(Number(params.predecessorActivity?.startOffsetDays))
            ? Number(params.predecessorActivity?.startOffsetDays)
            : null,
          dependencyTimingSuccessorStartOffsetDays: Number.isFinite(Number(params.successorActivity?.startOffsetDays))
            ? Number(params.successorActivity?.startOffsetDays)
            : null,
          dependencyTimingMutationBoundary: 'preview_no_write_wizard_commit_transactional' as const,
        }
      : {}),
  }
}



export const RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS = {
  basement: 't2-residential-basement-structure-handover-rhythm-v1',
  standardFloor: 't2-residential-standard-floor-structure-rhythm-v1',
  secondaryFitout: 't2-residential-secondary-structure-fitout-interleave-v1',
  envelope: 't2-facade-roof-envelope-closeout-rhythm-v1',
  mep: 't2-mep-roughin-riser-branch-pressure-rhythm-v1',
  decoration: 't2-decoration-wet-dry-room-handover-rhythm-v1',
  outdoor: 't2-outdoor-municipal-landscape-interface-rhythm-v1',
  commissioning: 't2-integrated-commissioning-handover-rhythm-v1',
} as const



export const DEFAULT_MASTER_PLAN_PHASE_DURATION_ASSETS: Record<string, {
  durationAssetStableCode: string
  t2RhythmTemplateId: string
  durationFormula: string
}> = {
  startup_site_setup: {
    durationAssetStableCode: 'site_setup_temp_works',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement,
    durationFormula: 'site-management seed and early workface-readiness rhythm, bounded by real-plan main-control skeleton',
  },
  foundation_pit_pile: {
    durationAssetStableCode: 'foundation_pit_retaining_support',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement,
    durationFormula: 'foundation/support seed plus foundation-basement T2 rhythm, after method-selection filtering',
  },
  basement_structure: {
    durationAssetStableCode: 'basement_structure',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement,
    durationFormula: 'basement-structure seed plus basement handover rhythm by underground workface proxy',
  },
  superstructure_rhythm: {
    durationAssetStableCode: 'cast_in_place_formwork',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.standardFloor,
    durationFormula: 'superstructure seed plus T2 floor/zone rhythm, not fixed template-row duration alone',
  },
  secondary_structure_fitout_roughin: {
    durationAssetStableCode: 'masonry_infill_wall',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.secondaryFitout,
    durationFormula: 'masonry/secondary seed plus cross-trade interleave T2 rhythm',
  },
  envelope_roof_facade: {
    durationAssetStableCode: 'curtain_wall_installation',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.envelope,
    durationFormula: 'facade/roof seed plus envelope closeout rhythm',
  },
  mep_roughin: {
    durationAssetStableCode: 'mep_plumbing_fire_pipe',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep,
    durationFormula: 'MEP coordination seed plus system-zone T2 rhythm',
  },
  elevator_installation: {
    durationAssetStableCode: 'elevator_traction_installation',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.standardFloor,
    durationFormula: 'elevator seed by shaft proxy, aligned to structure progress rhythm',
  },
  interior_fitout_terminal: {
    durationAssetStableCode: 'interior_public_finish',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.decoration,
    durationFormula: 'decoration seed plus wet/dry room handover T2 rhythm',
  },
  outdoor_municipal_landscape: {
    durationAssetStableCode: 'outdoor_utilities',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.outdoor,
    durationFormula: 'outdoor/domain seed plus municipal-landscape interface T2 rhythm',
  },
  commissioning: {
    durationAssetStableCode: 'integrated_commissioning',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning,
    durationFormula: 'integrated commissioning seed plus system-zone commissioning T2 rhythm',
  },
  acceptance_handover: {
    durationAssetStableCode: 'integrated_commissioning',
    t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning,
    durationFormula: 'handover closeout window from commissioning seed and T2 handover rhythm',
  },
}



export const DEFAULT_MASTER_PLAN_PHASE_T2_DIVISION_FAMILIES: Record<string, Array<T2DivisionRhythmTemplate['applicability']['divisionFamilies'][number]>> = {
  foundation_pit_pile: ['foundation_and_basement'],
  basement_structure: ['foundation_and_basement'],
  superstructure_rhythm: ['superstructure'],
  secondary_structure_fitout_roughin: ['decoration_fitout'],
  envelope_roof_facade: ['envelope_facade_roof'],
  mep_roughin: ['mep_systems'],
  elevator_installation: ['superstructure', 'mep_systems'],
  interior_fitout_terminal: ['decoration_fitout'],
  outdoor_municipal_landscape: ['outdoor_municipal_landscape'],
  commissioning: ['commissioning_handover'],
  acceptance_handover: ['commissioning_handover'],
}



export const BUSINESS_TYPE_SPECIALTY_DURATION_ASSETS: Record<string, Array<{
  match: RegExp
  phases?: string[]
  durationAssetStableCode: string
  t2RhythmTemplateId: string
  durationFormula: string
}>> = {
  general_civil: [
    { match: /幕墙|外立面|外围护|门窗|facade|curtain.wall/i, phases: ['envelope_roof_facade'], durationAssetStableCode: 'curtain_wall_installation', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.envelope, durationFormula: 'office/commercial facade closeout backed by curtain-wall seed and envelope rhythm' },
    { match: /机电|消防|智能化|楼控|安防|mep|fire|bms|security/i, phases: ['mep_roughin'], durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep, durationFormula: 'office/commercial MEP, fire and intelligent backbone backed by MEP seed and riser-branch rhythm' },
    { match: /办公|商业|公区|租户|精装|装修|fitout|tenant/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1', durationFormula: 'office/commercial standard-floor and public-area fitout backed by public-finish seed and opening-interface rhythm' },
    { match: /电梯|垂直运输|elevator/i, phases: ['elevator_installation'], durationAssetStableCode: 'elevator_installation', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep, durationFormula: 'office/commercial vertical transport backed by elevator seed and MEP interface rhythm' },
    { match: /联调|验收|移交|开业|运营|commissioning|acceptance|handover|opening/i, phases: ['commissioning', 'acceptance_handover'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1', durationFormula: 'office/commercial integrated commissioning and opening handover backed by commissioning seed and opening-interface rhythm' },
  ],
  commercial: [
    { match: /商业|裙房|商场|公区|开业|opening|podium|commercial/i, phases: ['interior_fitout_terminal', 'commissioning', 'acceptance_handover'], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1', durationFormula: 'commercial podium/opening plan shape plus commercial fitout-interface T2 rhythm' },
  ],
  hotel: [
    { match: /客房|样板|guestroom|mockup/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'interior_unit_finish', t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1', durationFormula: 'hotel room/mockup plan shape plus commercial/hotel fitout interface rhythm' },
    { match: /开业|联调|试运营|移交|opening|commissioning|trial/i, phases: ['commissioning', 'acceptance_handover'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, durationFormula: 'hotel opening commissioning and trial-operation handover backed by commissioning seed' },
    { match: /厨房|洗衣|后勤|back.of.house/i, phases: ['mep_roughin'], durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep, durationFormula: 'hotel back-of-house MEP installation backed by MEP rough-in seed and MEP T2 rhythm' },
    { match: /大堂|宴会|lobby|banquet/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1', durationFormula: 'hotel public-area fitout plan shape plus public fitout-interface rhythm' },
  ],
  hospital: [
    { match: /主体|病房|医技楼|tower|structure/i, phases: ['superstructure_rhythm'], durationAssetStableCode: 'cast_in_place_formwork', t2RhythmTemplateId: 't2-hospital-ward-medical-tower-structure-rhythm-v1', durationFormula: 'hospital ward/medical tower rhythm backed by cast-in-place structure seed' },
    { match: /病房|二次结构|粗装修|ward|secondary_structure|rough_fitout/i, phases: ['secondary_structure_fitout_roughin'], durationAssetStableCode: 'masonry_infill_wall', t2RhythmTemplateId: 't2-hospital-clinical-department-fitout-rhythm-v1', durationFormula: 'hospital ward secondary-structure and rough-fitout release backed by masonry seed and clinical-department fitout T2 rhythm' },
    { match: /联调|验收|卫生|移交|commissioning|acceptance|handover/i, phases: ['commissioning', 'acceptance_handover'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-hospital-cleanroom-medical-system-commissioning-v1', durationFormula: 'hospital medical specialty commissioning and health acceptance backed by integrated commissioning seed and hospital cleanroom T2 rhythm' },
    { match: /医气|医疗气体|气体|站房|设备带|护理呼叫|医疗设备|设备安装|系统接驳|medical_gas|medical_equipment/i, phases: ['mep_roughin'], durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-hospital-cleanroom-medical-system-commissioning-v1', durationFormula: 'hospital medical-gas and equipment-interface work backed by MEP installation seed plus hospital specialty T2 rhythm' },
    { match: /手术|洁净|净化|cleanroom/i, phases: ['interior_fitout_terminal', 'mep_roughin', 'commissioning', 'acceptance_handover'], durationAssetStableCode: 'hvac_cleanroom_system', t2RhythmTemplateId: 't2-hospital-cleanroom-medical-system-commissioning-v1', durationFormula: 'hospital cleanroom specialty seed plus hospital commissioning T2 rhythm' },
  ],
  school: [
    { match: /操场|道路|室外|outdoor|sports/i, phases: ['outdoor_municipal_landscape'], durationAssetStableCode: 'outdoor_utilities', t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1', durationFormula: 'school outdoor/campus support seed plus campus functional-phasing T2 rhythm' },
    { match: /实验|通风|机电|专业|laboratory|lab|mep/i, phases: ['mep_roughin'], durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1', durationFormula: 'school laboratory MEP seed plus campus functional-phasing T2 rhythm' },
    { match: /竣工|验收|开学|移交|acceptance|handover/i, phases: ['acceptance_handover'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1', durationFormula: 'school final acceptance and opening handover backed by integrated commissioning seed and campus T2 rhythm' },
    { match: /实验|宿舍|食堂|教室|classroom|lab|dormitory/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1', durationFormula: 'school functional fitout evidence plus public fitout seed and campus T2 rhythm' },
    { match: /主体|教学楼|教学|structure/i, phases: ['superstructure_rhythm'], durationAssetStableCode: 'cast_in_place_formwork', t2RhythmTemplateId: 't2-school-teaching-building-structure-rhythm-v1', durationFormula: 'school teaching-building structure rhythm backed by cast-in-place structure seed' },
    { match: /二次结构|粗装修|普通教室|教学|classroom|secondary_structure|rough_fitout/i, phases: ['secondary_structure_fitout_roughin'], durationAssetStableCode: 'masonry_infill_wall', t2RhythmTemplateId: 't2-school-classroom-lab-fitout-rhythm-v1', durationFormula: 'school teaching-building secondary-structure and classroom rough-fitout backed by masonry seed and classroom/lab fitout T2 rhythm' },
  ],
  industrial: [
    { match: /围护|屋面|防水|封闭|envelope|roof/i, phases: ['envelope_roof_facade'], durationAssetStableCode: 'roof_waterproof_insulation', t2RhythmTemplateId: 't2-industrial-main-plant-utility-equipment-rhythm-v1', durationFormula: 'industrial roof/envelope closeout backed by roof waterproofing seed plus industrial T2 rhythm' },
    { match: /钢结构|厂房|围护|工业|industrial|plant|steel/i, phases: ['superstructure_rhythm', 'envelope_roof_facade'], durationAssetStableCode: 'steel_erection', t2RhythmTemplateId: 't2-industrial-main-plant-utility-equipment-rhythm-v1', durationFormula: 'industrial plant steel/envelope plan shape plus industrial T2 rhythm' },
    { match: /试生产|投产|联动|验收|commissioning|acceptance/i, phases: ['commissioning', 'acceptance_handover'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-industrial-main-plant-utility-equipment-rhythm-v1', durationFormula: 'industrial commissioning and production validation backed by integrated commissioning seed and industrial T2 rhythm' },
    { match: /设备|动力|工艺|process|equipment/i, phases: ['mep_roughin'], durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-industrial-main-plant-utility-equipment-rhythm-v1', durationFormula: 'industrial process/equipment MEP installation backed by MEP seed and industrial T2 rhythm' },
    { match: /地坪|物流|装卸|floor|logistics|loading/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-industrial-logistics-warehouse-mezzanine-fitout-rhythm-v1', durationFormula: 'industrial floor/logistics area finish backed by public-finish seed and industrial logistics fitout T2 rhythm' },
  ],
  data_center: [
    { match: /主体结构|设备层|机房楼|shell|structure|plant_room/i, phases: ['superstructure_rhythm', 'envelope_roof_facade'], durationAssetStableCode: 'cast_in_place_formwork', t2RhythmTemplateId: 't2-data-center-shell-room-readiness-rhythm-v1', durationFormula: 'data-center shell and plant-room readiness backed by structure seed and mission-critical shell T2 rhythm' },
    { match: /供配电|UPS|柴油|power|generator/i, phases: ['mep_roughin'], durationAssetStableCode: 'intelligent_data_center_power', t2RhythmTemplateId: 't2-data-center-power-cooling-commissioning-rhythm-v1', durationFormula: 'data-center power plan shape plus mission-critical T2 rhythm' },
    { match: /制冷|精密空调|冷冻水|cooling|precision/i, phases: ['mep_roughin'], durationAssetStableCode: 'intelligent_data_center_precision_air', t2RhythmTemplateId: 't2-data-center-power-cooling-commissioning-rhythm-v1', durationFormula: 'data-center cooling plan shape plus mission-critical T2 rhythm' },
    { match: /联调|负载|投产|load|commissioning/i, phases: ['commissioning', 'acceptance_handover'], durationAssetStableCode: 'intelligent_data_center_commissioning', t2RhythmTemplateId: 't2-data-center-power-cooling-commissioning-rhythm-v1', durationFormula: 'data-center load-test commissioning seed plus mission-critical T2 rhythm' },
    { match: /数据|机房|白区|data|white/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'intelligent_data_center_interior_fitout', t2RhythmTemplateId: 't2-data-center-power-cooling-commissioning-rhythm-v1', durationFormula: 'data-center white-space plan shape plus mission-critical T2 rhythm' },
  ],
  transportation_hub: [
    { match: /幕墙|围护|封闭|防水|envelope|facade/i, phases: ['envelope_roof_facade'], durationAssetStableCode: 'curtain_wall_installation', t2RhythmTemplateId: 't2-transport-hub-longspan-envelope-rhythm-v1', durationFormula: 'transportation-hub facade/envelope closeout backed by curtain-wall seed plus hub T2 rhythm' },
    { match: /枢纽|站房|屋盖|大空间|交通|transport|hub/i, phases: ['superstructure_rhythm', 'envelope_roof_facade'], durationAssetStableCode: 'large_span_roof_structure', t2RhythmTemplateId: 't2-transport-hub-longspan-envelope-rhythm-v1', durationFormula: 'transportation hub structure/envelope plan shape plus long-span station-hall T2 rhythm' },
    { match: /机电|弱电|旅客服务|公共系统|life_safety|public_system|mep/i, phases: ['mep_roughin'], durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-transport-hub-mep-public-systems-rhythm-v1', durationFormula: 'transportation hub public MEP and passenger-service systems backed by MEP seed and hub public-system T2 rhythm' },
    { match: /流线|装修|导向|站厅|passenger|fitout|signage/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-transport-hub-station-hall-fitout-handover-rhythm-v1', durationFormula: 'transportation hub passenger-flow fitout backed by public-finish seed and station-hall handover T2 rhythm' },
    { match: /站台|接口|运营|联调|联试|移交|platform|trial|handover|commissioning/i, phases: ['commissioning', 'acceptance_handover'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-transportation-hub-public-system-transfer-rhythm-v1', durationFormula: 'transportation hub platform interface, trial operation and handover backed by commissioning seed and public-system transfer T2 rhythm' },
  ],
  sports_culture: [
    { match: /围护|屋面|封闭|防水|envelope|roof/i, phases: ['envelope_roof_facade'], durationAssetStableCode: 'roof_waterproof_insulation', t2RhythmTemplateId: 't2-sports-culture-longspan-envelope-event-rhythm-v1', durationFormula: 'sports/culture roof-envelope closeout backed by roof waterproofing seed plus venue T2 rhythm' },
    { match: /体育|文化|场馆|大跨度|屋盖|sports|culture|longspan/i, phases: ['superstructure_rhythm', 'envelope_roof_facade'], durationAssetStableCode: 'large_span_roof_structure', t2RhythmTemplateId: 't2-sports-culture-longspan-envelope-event-rhythm-v1', durationFormula: 'sports/culture long-span envelope evidence plus T2 venue rhythm' },
    { match: /声光电|机电|系统|broadcast|audio|video|mep/i, phases: ['mep_roughin'], durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-sports-culture-event-systems-commissioning-rhythm-v1', durationFormula: 'sports/culture event systems MEP backed by MEP seed and event-system commissioning T2 rhythm' },
    { match: /看台|装修|运动面层|公区|bowl|fitout|public/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1', durationFormula: 'sports/culture bowl and public-area fitout backed by public-finish seed and venue fitout T2 rhythm' },
    { match: /联调|赛事|模拟|验收|运营|移交|commissioning|event|handover/i, phases: ['commissioning', 'acceptance_handover'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-sports-culture-event-systems-commissioning-rhythm-v1', durationFormula: 'sports/culture event rehearsal, system commissioning and operation handover backed by commissioning seed and event-system T2 rhythm' },
  ],
  tod_upper_cover: [
    { match: /保护|监测|临时防护|运营线|rail_operation|monitoring|protection/i, phases: ['startup_site_setup'], durationAssetStableCode: 'site_setup_temp_works', t2RhythmTemplateId: 't2-tod-rail-protection-transfer-deck-readiness-rhythm-v1', durationFormula: 'TOD live-rail protection and monitoring startup backed by temporary-works seed and rail-protection T2 rhythm' },
    { match: /TOD|上盖|轨交|转换层|保护|运营线|裙房|塔楼|tod|rail|transfer/i, phases: ['superstructure_rhythm', 'basement_structure'], durationAssetStableCode: 'cast_in_place_formwork', t2RhythmTemplateId: 't2-tod-transfer-deck-tower-interface-rhythm-v1', durationFormula: 'TOD rail-interface/transfer-deck evidence plus upper-cover T2 rhythm' },
    { match: /机电|消防|接口|rail_interface|mep|fire/i, phases: ['mep_roughin'], durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-tod-upper-cover-mep-interface-rhythm-v1', durationFormula: 'TOD rail-interface MEP/fire and tower service backed by MEP seed and upper-cover interface T2 rhythm' },
    { match: /装修|公区|商业|裙房|podium|fitout|commercial/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-tod-upper-cover-podium-public-fitout-rhythm-v1', durationFormula: 'TOD podium public-area fitout backed by public-finish seed and podium-opening T2 rhythm' },
    { match: /验收|移交|接口|运营|handover|acceptance|commissioning/i, phases: ['commissioning', 'acceptance_handover'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-tod-rail-interface-commissioning-handover-rhythm-v1', durationFormula: 'TOD rail-interface acceptance and upper-cover handover backed by commissioning seed and rail-interface handover T2 rhythm' },
  ],
  renovation: [
    { match: /检测|鉴定|导改|保护|腾挪|survey|diversion|decanting|occupied/i, phases: ['startup_site_setup'], durationAssetStableCode: 'expert_domain_renovation_retrofit', t2RhythmTemplateId: 't2-renovation-occupied-zone-decanting-cutover-rhythm-v1', durationFormula: 'renovation survey, diversion and occupied-zone protection backed by renovation-domain seed and occupied-zone T2 rhythm' },
    { match: /联调|消防|验收|移交|commissioning|handover/i, phases: ['commissioning', 'acceptance_handover'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-renovation-occupied-zone-decanting-cutover-rhythm-v1', durationFormula: 'renovation MEP/fire cutover commissioning and operational handover rhythm' },
    { match: /加固|拆改|结构|改造|修缮|renovation|retrofit/i, phases: ['superstructure_rhythm'], durationAssetStableCode: 'expert_domain_renovation_retrofit', t2RhythmTemplateId: 't2-renovation-occupied-zone-decanting-cutover-rhythm-v1', durationFormula: 'renovation demolition and structural retrofit backed by renovation-domain seed and occupied-zone T2 rhythm' },
    { match: /装修|恢复|fitout|finish/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-renovation-occupied-zone-decanting-cutover-rhythm-v1', durationFormula: 'renovation finish restoration evidence plus public fitout seed and occupied-zone T2 rhythm' },
  ],
  modular_building: [
    { match: /深化|样板|设计|mockup|design/i, phases: ['startup_site_setup'], durationAssetStableCode: 'site_setup_temp_works', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', durationFormula: 'modular design/mockup startup backed by temporary-works seed and modular factory-lot T2 rhythm' },
    { match: /基础|吊装道路|锚固|foundation|anchor|lift_path/i, phases: ['foundation_pit_pile'], durationAssetStableCode: 'foundation_pit_retaining_support', t2RhythmTemplateId: 't2-modular-building-site-foundation-anchor-readiness-rhythm-v1', durationFormula: 'modular site foundation, anchor and lift-path readiness backed by foundation support seed and modular foundation T2 rhythm' },
    { match: /拼缝机电|机电接驳|系统贯通|vertical_mep|mep/i, phases: ['mep_roughin'], durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', durationFormula: 'modular vertical MEP plug-in and system-throughput work backed by MEP seed and factory-lot assembly rhythm' },
    { match: /内装|设备末端|内装收口|fitout|interior/i, phases: ['interior_fitout_terminal'], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', durationFormula: 'modular interior closeout and terminal installation backed by public-finish seed and factory-lot assembly rhythm' },
    { match: /室外|管网|场坪|道路恢复|outdoor|utility/i, phases: ['outdoor_municipal_landscape'], durationAssetStableCode: 'outdoor_utilities', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', durationFormula: 'modular site recovery and outdoor utility completion backed by outdoor seed and factory-lot assembly rhythm' },
    { match: /整体调试|接驳|移交|commissioning|handover/i, phases: ['commissioning', 'acceptance_handover'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', durationFormula: 'modular MEP connection and integrated handover commissioning rhythm' },
    { match: /模块|装配|构件|吊装|工厂|运输|MiC|modular|prefab/i, phases: ['superstructure_rhythm'], durationAssetStableCode: 'pc_component_hoisting', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', durationFormula: 'modular factory-lot/site assembly evidence plus PC hoisting seed and modular-building T2 rhythm' },
    { match: /围护|防水|拼缝|封闭|envelope|waterproof|joint/i, phases: ['envelope_roof_facade'], durationAssetStableCode: 'curtain_wall_installation', t2RhythmTemplateId: 't2-modular-building-stacked-module-envelope-closeout-rhythm-v1', durationFormula: 'modular envelope, waterproofing and joint closeout backed by facade seed and stacked-module envelope T2 rhythm' },
  ],
}



export const FOUNDATION_SUPPORT_METHOD_OPTIONS = [
  { codes: ['diaphragm_wall', 'underground_diaphragm_wall'], title: '地下连续墙施工', seedStableCode: 'foundation_pit_diaphragm_wall' },
  { codes: ['smw_wall', 'smw'], title: 'SMW 工法桩支护施工', seedStableCode: 'foundation_pit_smw_wall' },
  { codes: ['trd_wall', 'trd'], title: 'TRD 等厚水泥土墙支护施工', seedStableCode: 'foundation_pit_cement_soil_wall' },
  { codes: ['soil_nail_wall', 'soil_nail'], title: '土钉墙支护施工', seedStableCode: 'foundation_pit_soil_nail_wall' },
  { codes: ['bored_pile_support', 'retaining_bored_pile'], title: '排桩支护施工', seedStableCode: 'foundation_pit_bored_pile_support' },
  { codes: ['anchor_support', 'anchor_cable'], title: '锚索支护施工', seedStableCode: 'foundation_pit_anchor_support' },
] as const



export const PILE_FOUNDATION_METHOD_OPTIONS = [
  { codes: ['bored_pile', 'bored_cast_in_place_pile', 'rotary_drilling_pile'], title: '钻孔灌注桩施工', seedStableCode: 'bored_cast_in_place_pile_foundation' },
  { codes: ['precast_pile', 'phc_pile', 'static_press_pile'], title: '预制管桩静压施工', seedStableCode: 'precast_concrete_pile_foundation' },
  { codes: ['cfg_pile', 'cfg'], title: 'CFG 桩复合地基施工', seedStableCode: 'cfg_composite_ground' },
] as const



export const RESIDENTIAL_MASTER_PLAN_PRELOAD_DURATION_SEED_CODES = [
  'site_setup_temp_works',
  'cast_in_place_formwork',
  'cushion_and_blinding',
  'cast_in_place_concrete',
  'basement_structure',
  'expert_foundation_pit_support',
  'basement_waterproof_backfill',
  'earthwork_excavation_transport',
  'masonry_infill_wall',
  'mep_plumbing_fire_pipe',
  'outdoor_utilities',
  'roof_waterproof_insulation',
  'curtain_wall_installation',
  'elevator_traction_civil_handover',
  'elevator_traction_installation',
  'elevator_traction_final_acceptance',
  'single_system_commissioning',
  'integrated_commissioning',
  ...FOUNDATION_SUPPORT_METHOD_OPTIONS.map((option) => option.seedStableCode),
  ...PILE_FOUNDATION_METHOD_OPTIONS.map((option) => option.seedStableCode),
]



export function normalizeStandardDurationSeedKey(stableCode: string | null | undefined) {
  return normalizeText(stableCode).toLowerCase()
}



export function findStandardDurationSeed(
  stableCode: string | null | undefined,
  seedLookup: StandardDurationSeedLookup,
) {
  const key = normalizeStandardDurationSeedKey(stableCode)
  if (!key) return null
  return seedLookup.get(key) ?? null
}



export async function fillStandardDurationSeedLookup(
  seedLookup: StandardDurationSeedLookup,
  stableCodes: Array<string | null | undefined>,
  context: AlgorithmSeedResolveContext = {},
) {
  const missingCodes = uniqueStringArray(stableCodes
    .map(normalizeStandardDurationSeedKey)
    .filter((stableCode) => stableCode && !seedLookup.has(stableCode)))
  for (const stableCode of missingCodes) {
    const seed = await resolveStandardWorkDurationSeedByStableCode(stableCode, context)
    seedLookup.set(stableCode, seed)
  }
  return seedLookup
}



export async function buildStandardDurationSeedLookup(
  stableCodes: Array<string | null | undefined>,
  context: AlgorithmSeedResolveContext = {},
) {
  return fillStandardDurationSeedLookup(new Map(), stableCodes, context)
}



export function findT2RhythmTemplate(
  templateId: string | undefined,
  t2Lookup?: T2RhythmTemplateLookup | null,
): ResolvedT2DivisionRhythmTemplate | null {
  const key = normalizeT2RhythmTemplateKey(templateId)
  if (!key) return null
  return t2Lookup?.get(key) ?? T2_DIVISION_RHYTHM_TEMPLATE_SEED.find((template) => template.templateId === templateId) ?? null
}



export async function fillT2RhythmTemplateLookup(
  t2Lookup: T2RhythmTemplateLookup,
  templateIds: Array<string | null | undefined>,
  context: AlgorithmSeedResolveContext = {},
) {
  const missingTemplateIds = uniqueStringArray(templateIds
    .map(normalizeText)
    .filter((templateId) => templateId && !t2Lookup.has(normalizeT2RhythmTemplateKey(templateId))))
  const resolved = await Promise.all(missingTemplateIds.map(async (templateId) => [
    normalizeT2RhythmTemplateKey(templateId),
    mergeResolvedT2RhythmTemplate(
      templateId,
      await resolveT2DivisionRhythmTemplateByTemplateId(templateId, context),
    ),
  ] as const))
  for (const [templateId, template] of resolved) t2Lookup.set(templateId, template)
  return t2Lookup
}



export function t2RhythmTemplateMatchesBusinessType(
  template: ResolvedT2DivisionRhythmTemplate | null | undefined,
  businessType: string,
) {
  const normalizedBusinessType = normalizeText(businessType)
  if (!template || !normalizedBusinessType) return false
  return readStringArray(readRecord(template.applicability).businessTypeCodes)
    .map((code) => normalizeText(code))
    .includes(normalizedBusinessType)
}



export async function fillT2RhythmTemplateLookupForBusinessType(
  t2Lookup: T2RhythmTemplateLookup,
  businessType: string,
  context: AlgorithmSeedResolveContext = {},
) {
  const normalizedBusinessType = normalizeText(businessType)
  if (!normalizedBusinessType) return t2Lookup
  const records = await resolveAlgorithmSeedRecords<T2DivisionRhythmTemplateResolverRecord>('t2_division_rhythm_template', context)
  for (const record of records) {
    const templateId = normalizeText(record.templateId ?? record.template_id ?? record.__stableCode)
    if (!templateId) continue
    const template = mergeResolvedT2RhythmTemplate(templateId, record)
    if (!t2RhythmTemplateMatchesBusinessType(template, normalizedBusinessType)) continue
    t2Lookup.set(normalizeT2RhythmTemplateKey(templateId), template)
  }
  return t2Lookup
}



export async function buildT2RhythmTemplateLookup(
  templateIds: Array<string | null | undefined>,
  context: AlgorithmSeedResolveContext = {},
) {
  return fillT2RhythmTemplateLookup(new Map(), templateIds, context)
}



export function readT2RhythmTemplateResolverLineage(template: ResolvedT2DivisionRhythmTemplate | null | undefined) {
  const record = readRecord(template)
  return {
    resolverSource: normalizeText(record.__resolverSource) || 'ts_seed_fallback',
    resolverVersionId: normalizeText(record.__resolverVersionId) || null,
    resolverStableCode: normalizeText(record.__resolverStableCode) || normalizeText(template?.templateId) || null,
  }
}



export function buildDefaultMasterPlanSeedResolveContext(params: {
  projectId: string
  operation: PlanningTableOperation
  projectFacts: Record<string, unknown>
  algorithmSeedSourcePolicy?: AlgorithmSeedResolveContext['sourcePolicy']
}): AlgorithmSeedResolveContext {
  const operationRecord = readRecord(params.operation)
  const clientContext = readRecord(operationRecord.clientContext ?? operationRecord.client_context)
  const scope = readRecord(operationRecord.scope)
  const companyId = normalizeText(
    clientContext.companyId
      ?? clientContext.company_id
      ?? scope.companyId
      ?? scope.company_id
      ?? params.projectFacts.companyId
      ?? params.projectFacts.company_id,
  )
  return {
    projectId: params.projectId,
    ...(companyId ? { companyId } : {}),
    ...(params.algorithmSeedSourcePolicy ? { sourcePolicy: params.algorithmSeedSourcePolicy } : {}),
  }
}



export function normalizeDefaultMasterPlanRuntimeReferenceDay(item: unknown): DefaultMasterPlanRuntimeReferenceDay | null {
  const record = readRecord(item)
  const stableCode = normalizeText(record.stableCode ?? record.stable_code)
  const p50Days = readOptionalNumber(record.p50Days ?? record.p50_days)
  if (!stableCode || !p50Days || p50Days <= 0) return null
  const p80Days = readOptionalNumber(record.p80Days ?? record.p80_days)
  const sampleCount = readOptionalNumber(record.sampleCount ?? record.sample_count)
  return {
    stableCode,
    p50Days,
    p80Days: p80Days && p80Days > 0 ? p80Days : null,
    sampleCount: sampleCount && sampleCount > 0 ? sampleCount : null,
    source: normalizeText(record.source) || 'accepted_real_project_outcome',
    sourceSampleIds: uniqueStringArray(readStringArray(record.sourceSampleIds ?? record.source_sample_ids)),
  }
}



export function normalizeDefaultMasterPlanRuntimeReferenceDaysInput(value: unknown): DefaultMasterPlanRuntimeReferenceDaysInput | null {
  const record = readRecord(value)
  const source = Array.isArray(value) ? { runtimeReferenceDays: value } : record
  const status = normalizeText(source.status)
  const evidenceLevel = normalizeText(source.evidenceLevel ?? source.evidence_level)
  if (status !== 'runtime_calibrated') return null
  if (evidenceLevel !== 'runtime_calibrated_l2') return null
  const runtimeReferenceDays = readArray(source.runtimeReferenceDays ?? source.runtime_reference_days)
    .map(normalizeDefaultMasterPlanRuntimeReferenceDay)
    .filter((item): item is DefaultMasterPlanRuntimeReferenceDay => Boolean(item))
  if (runtimeReferenceDays.length === 0) return null
  const recordsByStableCode = new Map<string, DefaultMasterPlanRuntimeReferenceDay>()
  for (const item of runtimeReferenceDays) {
    const key = normalizeStandardDurationSeedKey(item.stableCode)
    if (key && !recordsByStableCode.has(key)) recordsByStableCode.set(key, item)
  }
  return {
    status: 'runtime_calibrated',
    evidenceLevel: 'runtime_calibrated_l2',
    runtimeReferenceDays,
    recordsByStableCode,
  }
}



export function readDefaultMasterPlanRuntimeReferenceDaysInput(params: {
  operation: PlanningTableOperation
  projectFacts: Record<string, unknown>
}): DefaultMasterPlanRuntimeReferenceDaysInput | null {
  const operationRecord = readRecord(params.operation)
  const clientContext = readRecord(operationRecord.clientContext ?? operationRecord.client_context)
  const scope = readRecord(operationRecord.scope)
  const candidates = [
    params.projectFacts.defaultMasterPlanRuntimeReferenceDays,
    params.projectFacts.default_master_plan_runtime_reference_days,
    params.projectFacts.durationCalibrationEvidence,
    params.projectFacts.duration_calibration_evidence,
    clientContext.defaultMasterPlanRuntimeReferenceDays,
    clientContext.default_master_plan_runtime_reference_days,
    clientContext.durationCalibrationEvidence,
    clientContext.duration_calibration_evidence,
    scope.defaultMasterPlanRuntimeReferenceDays,
    scope.default_master_plan_runtime_reference_days,
    scope.durationCalibrationEvidence,
    scope.duration_calibration_evidence,
  ]
  for (const candidate of candidates) {
    const normalized = normalizeDefaultMasterPlanRuntimeReferenceDaysInput(candidate)
    if (normalized) return normalized
  }
  return null
}



export function findRuntimeReferenceDayForActivity(
  activity: ResidentialMasterPlanActivity,
  runtimeReferenceDays: DefaultMasterPlanRuntimeReferenceDaysInput | null | undefined,
) {
  if (!runtimeReferenceDays) return null
  const keys = uniqueStringArray([
    activity.code,
    activity.durationAssetStableCode ?? '',
  ].map(normalizeStandardDurationSeedKey))
  for (const key of keys) {
    const record = runtimeReferenceDays.recordsByStableCode.get(key)
    if (record) return record
  }
  return null
}



export function calculateRuntimeReferenceDayDuration(
  activity: ResidentialMasterPlanActivity,
  runtimeReferenceDays: DefaultMasterPlanRuntimeReferenceDaysInput | null | undefined,
  fallbackDays: number,
) {
  const record = findRuntimeReferenceDayForActivity(activity, runtimeReferenceDays)
  if (!record) return null
  const minDays = clampInteger(activity.durationCalculationBasis?.minDays ?? 1, 1, 3650, 1)
  const maxDays = clampInteger(activity.durationCalculationBasis?.maxDays ?? 3650, minDays, 3650, 3650)
  return clampInteger(record.p50Days, minDays, maxDays, fallbackDays)
}



export function readP50DaysFromStandardSeed(
  stableCode: string | undefined,
  fallback: number,
  seedLookup: StandardDurationSeedLookup,
) {
  const seed = findStandardDurationSeed(stableCode, seedLookup)
  return clampInteger(seed?.defaultDaysP50, 1, 3650, fallback)
}



export function readStandardDurationSeedResolverLineage(seed: StandardDurationSeedRecord | null | undefined) {
  const record = readRecord(seed)
  return {
    resolverSource: normalizeText(record.__resolverSource) || null,
    resolverVersionId: normalizeText(record.__resolverVersionId) || null,
    resolverStableCode: normalizeText(record.__stableCode) || normalizeText(seed?.stableCode) || normalizeText(record.stable_code) || null,
  }
}



export function readP50DaysFromT2Template(
  templateId: string | undefined,
  fallback: number,
  t2Lookup?: T2RhythmTemplateLookup | null,
) {
  const template = findT2RhythmTemplate(templateId, t2Lookup)
  return clampInteger(template?.rhythm.parentWindowDays.p50, 1, 3650, fallback)
}



export function readProjectScaleFactNumber(projectFacts: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = readOptionalNumber(projectFacts[key])
    if (value != null && Number.isFinite(value)) return value
  }
  return null
}



export function buildBusinessTypeProjectScaleQuantityProxy(params: {
  activity: BusinessTypeMasterPlanActivity
  businessType: string
  projectFacts: Record<string, unknown>
  fallbackUnit: string
}) {
  const buildingCount = Math.max(1, Math.floor(readProjectScaleFactNumber(params.projectFacts, 'buildingCount', 'building_count') ?? 1))
  const standardFloorCount = Math.max(1, Math.floor(readProjectScaleFactNumber(params.projectFacts, 'standardFloorCount', 'standard_floor_count') ?? 1))
  const highestFloorCount = Math.max(standardFloorCount, Math.floor(readProjectScaleFactNumber(params.projectFacts, 'highestBuildingFloorCount', 'highest_building_floor_count', 'floorCount', 'floor_count') ?? standardFloorCount))
  const basementLevelCount = Math.max(0, Math.floor(readProjectScaleFactNumber(params.projectFacts, 'basementLevelCount', 'basement_level_count') ?? 0))
  const totalAreaM2 = Math.max(1, Math.round(readProjectScaleFactNumber(params.projectFacts, 'totalAreaM2', 'total_area_m2', 'grossFloorAreaM2', 'gross_floor_area_m2') ?? 0))
  const phase = normalizeText(params.activity.executionPhase)
  const businessType = normalizeText(params.businessType)
  const title = normalizeText(params.activity.title)
  const activityCode = normalizeText(params.activity.code).toUpperCase()
  const durationAssetStableCode = normalizeText(params.activity.durationAssetStableCode).toLowerCase()

  if (
    durationAssetStableCode === 'expert_domain_heritage_preservation'
    || durationAssetStableCode.startsWith('expert_domain_industrial_')
    || durationAssetStableCode.startsWith('expert_domain_transportation_')
    || durationAssetStableCode.startsWith('expert_domain_sports_')
  ) {
    return {
      value: Math.max(4, buildingCount, Math.ceil(totalAreaM2 / 30_000)),
      unit: 'domain_workface',
      basis: `project_scale_facts max(total_area_m2 / 30000, building_count, 4) for ${durationAssetStableCode} governed domain workfaces`,
      source: 'project_scale_facts',
    }
  }

  if (businessType === 'data_center') {
    const dataHallAreaM2 = Math.max(2_400, Math.round(totalAreaM2 * 0.32))
    const powerModuleCount = Math.max(4, buildingCount * 2, Math.ceil(totalAreaM2 / 24_000) + basementLevelCount)
    const coolingLoopCount = Math.max(4, buildingCount * 2, Math.ceil(totalAreaM2 / 28_000) + Math.ceil(basementLevelCount / 2))
    const monitoringInterfaceZoneCount = Math.max(4, buildingCount + basementLevelCount + Math.ceil(totalAreaM2 / 30_000))
    const loadTestScenarioCount = Math.max(5, buildingCount + basementLevelCount + Math.ceil(totalAreaM2 / 24_000))

    if (activityCode === 'BTMP-DTC-02' || /白区|架空地板|机房装修|white|data_hall|raised.floor/i.test(title)) {
      return {
        value: dataHallAreaM2,
        unit: 'm2',
        basis: `project_scale_facts data hall white-space area proxy total_area_m2 * 0.32 for ${businessType} fitout`,
        source: 'project_scale_facts',
      }
    }
    if (activityCode === 'BTMP-DTC-03' || /供配电|UPS|柴油|发电|power|generator/i.test(title)) {
      return {
        value: powerModuleCount,
        unit: 'power_module',
        basis: `project_scale_facts critical power module proxy max(building_count * 2, total_area_m2 / 24000 + basement_level_count) for ${businessType}`,
        source: 'project_scale_facts',
      }
    }
    if (activityCode === 'BTMP-DTC-04' || /制冷|冷冻水|精密空调|cooling|precision/i.test(title)) {
      return {
        value: coolingLoopCount,
        unit: 'cooling_loop',
        basis: `project_scale_facts cooling loop proxy max(building_count * 2, total_area_m2 / 28000 + basement_level_count / 2) for ${businessType}`,
        source: 'project_scale_facts',
      }
    }
    if (activityCode === 'BTMP-DTC-05' || /动环|监控|DCIM|monitoring/i.test(title)) {
      return {
        value: monitoringInterfaceZoneCount,
        unit: 'monitoring_interface_zone',
        basis: `project_scale_facts monitoring interface zone proxy building_count + basement_level_count + total_area_m2 / 30000 for ${businessType}`,
        source: 'project_scale_facts',
      }
    }
    if (activityCode === 'BTMP-DTC-06' || /带载|负载|投产|load|failover/i.test(title)) {
      return {
        value: loadTestScenarioCount,
        unit: 'load_test_scenario',
        basis: `project_scale_facts load-test scenario proxy building_count + basement_level_count + total_area_m2 / 24000 for ${businessType}`,
        source: 'project_scale_facts',
      }
    }
  }

  if (businessType === 'hospital') {
    const cleanroomTerminalCount = Math.max(80, buildingCount * 24, Math.ceil(totalAreaM2 / 1_000))
    const medicalGasZoneCount = Math.max(4, buildingCount + basementLevelCount + Math.ceil(totalAreaM2 / 35_000))
    const medicalEquipmentInterfaceCount = Math.max(6, buildingCount * 2 + Math.ceil(totalAreaM2 / 40_000))
    const medicalValidationScenarioCount = Math.max(6, buildingCount + basementLevelCount + Math.ceil(totalAreaM2 / 30_000))

    if (activityCode === 'BTMP-HSP-03' || /手术|洁净|净化|cleanroom|operating/i.test(title)) {
      return {
        value: cleanroomTerminalCount,
        unit: 'terminal',
        basis: `project_scale_facts cleanroom HEPA terminal proxy max(building_count * 24, total_area_m2 / 1000) for ${businessType}`,
        source: 'project_scale_facts',
      }
    }
    if (activityCode === 'BTMP-HSP-04' || /医气|医疗气体|medical.gas|medgas/i.test(title)) {
      return {
        value: medicalGasZoneCount,
        unit: 'medical_gas_zone',
        basis: `project_scale_facts medical gas zone proxy building_count + basement_level_count + total_area_m2 / 35000 for ${businessType}`,
        source: 'project_scale_facts',
      }
    }
    if (activityCode === 'BTMP-HSP-05' || /医疗设备|设备安装|medical.equipment/i.test(title)) {
      return {
        value: medicalEquipmentInterfaceCount,
        unit: 'medical_equipment_interface',
        basis: `project_scale_facts medical equipment interface proxy building_count * 2 + total_area_m2 / 40000 for ${businessType}`,
        source: 'project_scale_facts',
      }
    }
    if (activityCode === 'BTMP-HSP-06' || /卫生|专项验收|医疗专项|health|validation/i.test(title)) {
      return {
        value: medicalValidationScenarioCount,
        unit: 'medical_validation_scenario',
        basis: `project_scale_facts medical validation scenario proxy building_count + basement_level_count + total_area_m2 / 30000 for ${businessType}`,
        source: 'project_scale_facts',
      }
    }
  }

  if (businessType === 'modular_building' && phase === 'superstructure_rhythm') {
    return {
      value: highestFloorCount,
      unit: 'parallel_floor_workface',
      basis: 'project_scale_facts highest_building_floor_count under project-organization-modular-factory-site-v1 parallel factory/site and building lanes',
      source: 'project_scale_facts',
    }
  }

  if (phase === 'superstructure_rhythm') {
    return {
      value: buildingCount * standardFloorCount,
      unit: 'floor_workface',
      basis: `project_scale_facts building_count * standard_floor_count for ${businessType} superstructure rhythm`,
      source: 'project_scale_facts',
    }
  }
  if (phase === 'foundation_pit_pile') {
    return {
      value: Math.max(1, Math.ceil(Math.sqrt(totalAreaM2) * Math.max(1, basementLevelCount + 1))),
      unit: 'foundation_workface',
      basis: `project_scale_facts sqrt(total_area_m2) * basement_level_factor for ${businessType} foundation works`,
      source: 'project_scale_facts',
    }
  }
  if (phase === 'basement_structure') {
    return {
      value: Math.max(1, Math.ceil((totalAreaM2 * Math.max(1, basementLevelCount)) / 10_000)),
      unit: 'basement_zone',
      basis: `project_scale_facts total_area_m2 * basement_level_count / 10000 for ${businessType} basement zones`,
      source: 'project_scale_facts',
    }
  }
  if (phase === 'secondary_structure_fitout_roughin') {
    return {
      value: Math.max(3, Math.ceil(totalAreaM2 / 22_000), buildingCount, Math.ceil(highestFloorCount / 8)),
      unit: 'secondary_structure_zone',
      basis: `project_scale_facts max(total_area_m2 / 22000, building_count, highest_floor_count / 8) for ${businessType} secondary structure zones`,
      source: 'project_scale_facts',
    }
  }
  if (phase === 'mep_roughin') {
    return {
      value: Math.max(4, Math.ceil(totalAreaM2 / 20_000), buildingCount + basementLevelCount),
      unit: 'system_zone',
      basis: `project_scale_facts max(total_area_m2 / 20000, building_count + basement_level_count) for ${businessType} MEP zones`,
      source: 'project_scale_facts',
    }
  }
  if (phase === 'interior_fitout_terminal') {
    const specialtyMultiplier = /hospital|data_center|hotel|实验|客房|洁净|机房|白区/i.test(`${businessType} ${title}`) ? 1.25 : 1
    return {
      value: Math.max(3, Math.ceil((totalAreaM2 / 25_000) * specialtyMultiplier), buildingCount),
      unit: 'fitout_zone',
      basis: `project_scale_facts total_area_m2 / 25000 with specialty multiplier for ${businessType} fitout zones`,
      source: 'project_scale_facts',
    }
  }
  if (phase === 'envelope_roof_facade') {
    return {
      value: Math.max(3, Math.ceil(highestFloorCount / 10), buildingCount),
      unit: 'facade_zone',
      basis: `project_scale_facts max(highest_floor_count / 10, building_count) for ${businessType} envelope zones`,
      source: 'project_scale_facts',
    }
  }
  if (phase === 'elevator_installation') {
    return {
      value: Math.max(1, buildingCount * 2),
      unit: 'shaft',
      basis: `project_scale_facts building_count * typical two shafts for ${businessType} elevator installation`,
      source: 'project_scale_facts',
    }
  }
  if (phase === 'outdoor_municipal_landscape') {
    return {
      value: Math.max(180, Math.round(Math.sqrt(totalAreaM2) * 1.8)),
      unit: 'm',
      basis: `project_scale_facts sqrt(total_area_m2) site frontage proxy for ${businessType} outdoor works`,
      source: 'project_scale_facts',
    }
  }
  if (phase === 'commissioning' || phase === 'acceptance_handover') {
    return {
      value: Math.max(3, Math.ceil(totalAreaM2 / 30_000), buildingCount),
      unit: 'system_zone',
      basis: `project_scale_facts max(total_area_m2 / 30000, building_count) for ${businessType} commissioning and handover`,
      source: 'project_scale_facts',
    }
  }
  if (phase === 'startup_site_setup') {
    return {
      value: Math.max(1, buildingCount + basementLevelCount),
      unit: 'startup_workface',
      basis: `project_scale_facts building_count + basement_level_count for ${businessType} site setup`,
      source: 'project_scale_facts',
    }
  }

  return {
    value: Math.max(1, Math.ceil(params.activity.durationDays / 30)),
    unit: params.fallbackUnit,
    basis: `business-type ${businessType || 'unknown'} ${phase} main-plan workface proxy`,
    source: 'duration_fallback_proxy',
  }
}



export function phaseWindowMatchesExecutionPhase(template: T2DivisionRhythmTemplate, executionPhase: string) {
  const phaseWindows = template.applicability.phaseWindows.map((phase) => normalizeText(phase))
  if (executionPhase === 'startup_site_setup') return phaseWindows.some((phase) => ['startup', 'foundation'].includes(phase))
  if (executionPhase === 'foundation_pit_pile') return phaseWindows.some((phase) => ['foundation', 'basement'].includes(phase))
  if (executionPhase === 'basement_structure') return phaseWindows.some((phase) => ['basement', 'foundation'].includes(phase))
  if (executionPhase === 'superstructure_rhythm') return phaseWindows.includes('superstructure')
  if (executionPhase === 'secondary_structure_fitout_roughin') return phaseWindows.some((phase) => ['decoration', 'mep', 'handover'].includes(phase))
  if (executionPhase === 'envelope_roof_facade') return phaseWindows.includes('envelope')
  if (executionPhase === 'mep_roughin') return phaseWindows.some((phase) => ['mep', 'commissioning'].includes(phase))
  if (executionPhase === 'elevator_installation') return phaseWindows.some((phase) => ['superstructure', 'mep', 'commissioning'].includes(phase))
  if (executionPhase === 'interior_fitout_terminal') return phaseWindows.some((phase) => ['decoration', 'handover', 'opening'].includes(phase))
  if (executionPhase === 'outdoor_municipal_landscape') return phaseWindows.some((phase) => ['outdoor', 'handover'].includes(phase))
  if (executionPhase === 'commissioning') return phaseWindows.some((phase) => ['commissioning', 'handover', 'opening'].includes(phase))
  if (executionPhase === 'acceptance_handover') return phaseWindows.some((phase) => ['handover', 'commissioning', 'opening'].includes(phase))
  return phaseWindows.includes(executionPhase)
}



export const RENOVATION_SEISMIC_T2_TEMPLATE_ID = 't2-renovation-structural-reinforcement-envelope-rhythm-v1'


export const RENOVATION_ENERGY_T2_TEMPLATE_ID = 't2-renovation-energy-envelope-mep-verification-rhythm-v1'


export const RENOVATION_HERITAGE_T2_TEMPLATE_ID = 't2-renovation-heritage-craft-minimal-intervention-rhythm-v1'



export const PROJECT_ORGANIZATION_VARIANT_T2_TEMPLATE_IDS: Record<string, string> = {
  general_civil_office_commercial: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
  general_civil_mixed_use_complex: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
  industrial_logistics_automation: 't2-industrial-logistics-warehouse-mezzanine-fitout-rhythm-v1',
  industrial_process_validation: 't2-industrial-clean-utility-validation-rhythm-v1',
  industrial_heavy_equipment: 't2-industrial-heavy-equipment-lifting-rhythm-v1',
  transportation_rail_station: 't2-transport-hub-platform-canopy-trackside-interface-rhythm-v1',
  transportation_metro_interchange: 't2-transport-hub-metro-night-window-transfer-rhythm-v1',
  transportation_bus_terminal: 't2-transport-hub-bus-yard-charging-rhythm-v1',
  sports_culture_indoor_arena: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1',
  sports_culture_theater: 't2-sports-culture-theater-stage-acoustic-rhythm-v1',
  sports_culture_exhibition: 't2-sports-culture-exhibition-environment-rhythm-v1',
  renovation_seismic_reinforcement: RENOVATION_SEISMIC_T2_TEMPLATE_ID,
  renovation_energy_retrofit: RENOVATION_ENERGY_T2_TEMPLATE_ID,
  renovation_heritage_conservation: RENOVATION_HERITAGE_T2_TEMPLATE_ID,
}



export function resolveProjectOrganizationPolicyFromProjectFacts(
  businessType: string,
  projectFacts: Record<string, unknown>,
) {
  const businessSubtype = normalizeText(
    projectFacts.businessSubtype
      ?? projectFacts.business_subtype,
  )
  const projectTypeCode = normalizeText(
    projectFacts.projectTypeCode
      ?? projectFacts.project_type_code
      ?? businessSubtype,
  )
  return resolveProjectConstructionOrganizationPolicy(
    businessType,
    projectTypeCode,
    {
      businessSubtype,
      structureTypeCode: normalizeText(projectFacts.structureTypeCode ?? projectFacts.structure_type_code),
      methodVariantCodes: projectFacts.methodVariantCodes ?? projectFacts.method_variant_codes,
      prefabSystemCodes: projectFacts.prefabSystemCodes ?? projectFacts.prefab_system_codes,
      elementVariantCodes: projectFacts.elementVariantCodes ?? projectFacts.element_variant_codes,
      externalInterfaceCodes: projectFacts.externalInterfaceCodes ?? projectFacts.external_interface_codes,
      hardConstraintCodes: projectFacts.hardConstraintCodes ?? projectFacts.hard_constraint_codes,
      functionalUsageCodes: projectFacts.functionalUsageCodes ?? projectFacts.functional_usage_codes,
      functionalCategoryCodes: projectFacts.functionalCategoryCodes ?? projectFacts.functional_category_codes,
      specialRoomTypeCodes: projectFacts.specialRoomTypeCodes ?? projectFacts.special_room_type_codes,
      physicalZoneTypeCodes: projectFacts.physicalZoneTypeCodes ?? projectFacts.physical_zone_type_codes,
      projectFeatures: projectFacts.projectFeatures ?? projectFacts.project_features,
    },
  )
}



export function resolveProjectOrganizationVariantT2Template(params: {
  businessType: string
  executionPhase: string
  projectFacts: Record<string, unknown>
  t2Lookup?: T2RhythmTemplateLookup | null
}) {
  const policy = resolveProjectOrganizationPolicyFromProjectFacts(
    params.businessType,
    params.projectFacts,
  )
  const templateId = PROJECT_ORGANIZATION_VARIANT_T2_TEMPLATE_IDS[policy.variantCode]
  const template = findT2RhythmTemplate(templateId, params.t2Lookup)
  return {
    variantCode: policy.variantCode,
    templateId: template && phaseWindowMatchesExecutionPhase(template, params.executionPhase)
      ? template.templateId
      : null,
  }
}



export function scoreBusinessTypeT2RhythmTemplate(params: {
  template: T2DivisionRhythmTemplate
  businessType: string
  executionPhase: string
  divisionFamilies: Array<T2DivisionRhythmTemplate['applicability']['divisionFamilies'][number]>
  preferredTemplateId?: string | null
}) {
  const businessTypes = params.template.applicability.businessTypeCodes.map((code) => normalizeText(code))
  if (!businessTypes.includes(params.businessType)) return -1
  let score = 100
  if (normalizeT2RhythmTemplateKey(params.template.templateId) === normalizeT2RhythmTemplateKey(params.preferredTemplateId)) score += 240
  if (params.template.templateId.includes(`t2-${params.businessType}-`)) score += 60
  if (phaseWindowMatchesExecutionPhase(params.template, params.executionPhase)) score += 25
  const matchingDivisionFamilyCount = params.divisionFamilies
    .filter((family) => params.template.applicability.divisionFamilies.includes(family))
    .length
  score += matchingDivisionFamilyCount * 20
  if (params.template.templateId.includes('standard-library')) score += 8
  if (params.template.confidence === 'high') score += 6
  if (params.template.confidence === 'medium') score += 3
  return score
}



export function selectBusinessTypePhaseT2RhythmTemplateId(
  businessType: string,
  executionPhase: string,
  fallbackTemplateId: string | undefined,
  t2Lookup?: T2RhythmTemplateLookup | null,
  preferredTemplateId?: string | null,
) {
  const normalizedBusinessType = normalizeText(businessType)
  if (!normalizedBusinessType || normalizedBusinessType === 'residential') return fallbackTemplateId
  const divisionFamilies = DEFAULT_MASTER_PLAN_PHASE_T2_DIVISION_FAMILIES[executionPhase] ?? []
  const candidateByKey = new Map<string, ResolvedT2DivisionRhythmTemplate>()
  for (const template of T2_DIVISION_RHYTHM_TEMPLATE_SEED) {
    candidateByKey.set(normalizeT2RhythmTemplateKey(template.templateId), template)
  }
  for (const template of Array.from(t2Lookup?.values() ?? [])) {
    if (!template) continue
    candidateByKey.set(normalizeT2RhythmTemplateKey(template.templateId), template)
  }
  const candidates = Array.from(candidateByKey.values())
    .map((template) => ({
      template,
      score: scoreBusinessTypeT2RhythmTemplate({
        template,
        businessType: normalizedBusinessType,
        executionPhase,
        divisionFamilies,
        preferredTemplateId,
      }),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score)
  return candidates[0]?.template.templateId ?? fallbackTemplateId
}



export function selectGovernedBusinessTypePhaseT2RhythmTemplateId(
  businessType: string,
  executionPhase: string,
  fallbackTemplateId: string | undefined,
  t2Lookup?: T2RhythmTemplateLookup | null,
  preferredTemplateId?: string | null,
) {
  const normalizedBusinessType = normalizeText(businessType)
  if (!normalizedBusinessType || !t2Lookup) return fallbackTemplateId
  const divisionFamilies = DEFAULT_MASTER_PLAN_PHASE_T2_DIVISION_FAMILIES[executionPhase] ?? []
  const scoreTemplate = (template: ResolvedT2DivisionRhythmTemplate | null | undefined) => (
    template
      ? scoreBusinessTypeT2RhythmTemplate({
          template,
          businessType: normalizedBusinessType,
          executionPhase,
          divisionFamilies,
          preferredTemplateId,
        })
      : -1
  )
  const fallbackScore = scoreTemplate(findT2RhythmTemplate(fallbackTemplateId, t2Lookup))
  const governedCandidates = Array.from(t2Lookup.values())
    .filter((template): template is ResolvedT2DivisionRhythmTemplate => Boolean(
      template
      && template.__resolverSource
      && template.__resolverSource !== 'ts_seed_fallback',
    ))
    .map((template) => ({ template, score: scoreTemplate(template) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score)
  const best = governedCandidates[0]
  if (!best) return fallbackTemplateId
  return best.score >= fallbackScore ? best.template.templateId : fallbackTemplateId
}



export function normalizeStandardSeedProductivity(
  productivity: StandardWorkDurationSeedResolverProductivity,
) {
  if (!productivity || typeof productivity !== 'object') return null
  const p50PerDay = Number(productivity.p50PerDay ?? productivity.p50_per_day)
  if (!Number.isFinite(p50PerDay) || p50PerDay <= 0) return null
  return {
    ...productivity,
    p50PerDay,
    unit: normalizeText(productivity.unit) || undefined,
    basis: normalizeText(productivity.basis) || undefined,
  }
}



export function readP50ProductivityRecord(
  stableCode: string | undefined,
  seedLookup: StandardDurationSeedLookup,
) {
  const seed = findStandardDurationSeed(stableCode, seedLookup)
  const directProductivity = seed?.baselineProductivity
  const normalizedDirectProductivity = normalizeStandardSeedProductivity(directProductivity)
  if (normalizedDirectProductivity) return normalizedDirectProductivity
  const seedRecord = readRecord(seed)
  const productivityBands = Array.isArray(seed?.productivityBands)
    ? seed.productivityBands
    : Array.isArray(seedRecord.productivity_bands)
      ? seedRecord.productivity_bands as Array<Record<string, unknown>>
      : []
  const bandProductivity = productivityBands
    .find((band) => {
      const record = band as Record<string, unknown>
      return /standard|normal|default/i.test(String(record.conditionCode ?? record.condition_code ?? ''))
    })
  const bandRecord = bandProductivity as Record<string, unknown> | undefined
  const firstBandRecord = productivityBands[0] as Record<string, unknown> | undefined
  const normalizedBandSource = bandRecord?.baselineProductivity
    ?? bandRecord?.baseline_productivity
    ?? firstBandRecord?.baselineProductivity
    ?? firstBandRecord?.baseline_productivity
  const normalizedBandProductivity = normalizeStandardSeedProductivity(normalizedBandSource)
  if (normalizedBandProductivity) return normalizedBandProductivity
  return null
}



export function readP50Productivity(
  stableCode: string | undefined,
  seedLookup: StandardDurationSeedLookup,
) {
  const productivity = Number(readP50ProductivityRecord(stableCode, seedLookup)?.p50PerDay)
  return Number.isFinite(productivity) && productivity > 0 ? productivity : null
}



export function calculateDurationByProductivity(params: {
  stableCode: string
  quantity: number
  minDays: number
  maxDays: number
  fallbackDays: number
  fixedBufferDays?: number
  factor?: number
  seedLookup: StandardDurationSeedLookup
}) {
  const productivity = readP50Productivity(params.stableCode, params.seedLookup)
  const factor = Number.isFinite(Number(params.factor)) && Number(params.factor) > 0 ? Number(params.factor) : 1
  if (!productivity) {
    return clampInteger(readP50DaysFromStandardSeed(params.stableCode, params.fallbackDays, params.seedLookup) * factor, params.minDays, params.maxDays, params.fallbackDays)
  }
  const fixedBufferDays = Number.isFinite(Number(params.fixedBufferDays)) ? Number(params.fixedBufferDays) : 0
  return clampInteger(Math.ceil((Math.max(1, params.quantity) / productivity) * factor + fixedBufferDays), params.minDays, params.maxDays, params.fallbackDays)
}



export function calculateDurationByStandardSeedFloor(params: {
  stableCode: string
  minDays: number
  maxDays: number
  fallbackDays: number
  seedLookup: StandardDurationSeedLookup
}) {
  const fallbackDays = clampInteger(params.fallbackDays, params.minDays, params.maxDays, params.fallbackDays)
  const standardSeedDays = readP50DaysFromStandardSeed(params.stableCode, fallbackDays, params.seedLookup)
  return clampInteger(Math.max(fallbackDays, standardSeedDays), params.minDays, params.maxDays, fallbackDays)
}



export function buildProductivityDurationCalculation(params: {
  stableCode: string | undefined
  quantityProxy?: ResidentialMasterPlanActivity['quantityProxy']
  durationCalculationBasis?: ResidentialMasterPlanActivity['durationCalculationBasis']
  selectedDurationDays: number
  seedLookup: StandardDurationSeedLookup
}) {
  const productivityRecord = readP50ProductivityRecord(params.stableCode, params.seedLookup)
  const productivity = Number(productivityRecord?.p50PerDay)
  const standardSeed = findStandardDurationSeed(params.stableCode, params.seedLookup)
  const quantity = Number(params.quantityProxy?.value)
  if (!productivity || !Number.isFinite(quantity) || quantity <= 0) {
    return {
      standardWorkDurationSeedProductivityP50PerDay: Number.isFinite(productivity) && productivity > 0 ? productivity : null,
      standardWorkDurationSeedProductivityUnit: productivityRecord?.unit ?? standardSeed?.baselineProductivity?.unit ?? null,
      standardWorkDurationSeedProductivityBasis: productivityRecord?.basis ?? standardSeed?.baselineProductivity?.basis ?? null,
      productivityBaseDurationDays: null,
      productivityFixedBufferDays: params.durationCalculationBasis?.fixedBufferDays ?? null,
      productivityFactor: params.durationCalculationBasis?.factor ?? null,
      productivityDerivedDurationDays: null,
    }
  }

  const factor = Number.isFinite(Number(params.durationCalculationBasis?.factor)) && Number(params.durationCalculationBasis?.factor) > 0
    ? Number(params.durationCalculationBasis?.factor)
    : 1
  const fixedBufferDays = Number.isFinite(Number(params.durationCalculationBasis?.fixedBufferDays))
    ? Number(params.durationCalculationBasis?.fixedBufferDays)
    : 0
  const fallbackDays = clampInteger(
    params.durationCalculationBasis?.fallbackDays ?? params.selectedDurationDays,
    1,
    3650,
    params.selectedDurationDays,
  )
  const minDays = clampInteger(params.durationCalculationBasis?.minDays ?? 1, 1, 3650, 1)
  const maxDays = clampInteger(params.durationCalculationBasis?.maxDays ?? 3650, minDays, 3650, 3650)
  const productivityBaseDurationDays = Math.ceil((Math.max(1, quantity) / productivity) * factor)
  const productivityDerivedDurationDays = clampInteger(
    productivityBaseDurationDays + fixedBufferDays,
    minDays,
    maxDays,
    fallbackDays,
  )
  return {
    standardWorkDurationSeedProductivityP50PerDay: productivity,
    standardWorkDurationSeedProductivityUnit: productivityRecord?.unit ?? standardSeed?.baselineProductivity?.unit ?? null,
    standardWorkDurationSeedProductivityBasis: productivityRecord?.basis ?? standardSeed?.baselineProductivity?.basis ?? null,
    productivityBaseDurationDays,
    productivityFixedBufferDays: fixedBufferDays,
    productivityFactor: factor,
    productivityDerivedDurationDays,
  }
}



export function buildAssetDurationCalculation(
  activity: ResidentialMasterPlanActivity,
  selectedDurationDays: number | undefined,
  seedLookup: StandardDurationSeedLookup,
  runtimeReferenceDays?: DefaultMasterPlanRuntimeReferenceDaysInput | null,
  t2Lookup?: T2RhythmTemplateLookup | null,
) {
  const t2RhythmApplicability = activity.t2RhythmApplicability ?? 'required_repetitive_or_workface_activity'
  const durationCalibrationSource = t2RhythmApplicability === 'not_applicable_one_off_activity'
    ? STANDARD_SEED_ONLY_MASTER_PLAN_DURATION_CALIBRATION_SOURCE
    : ASSET_BACKED_MASTER_PLAN_DURATION_CALIBRATION_SOURCE
  const realPlanSkeletonDurationDays = clampInteger(activity.durationDays, 1, 3650, activity.durationDays || 1)
  const standardSeed = findStandardDurationSeed(activity.durationAssetStableCode, seedLookup)
  const standardSeedLineage = readStandardDurationSeedResolverLineage(standardSeed)
  const t2Template = findT2RhythmTemplate(activity.t2RhythmTemplateId, t2Lookup)
  const t2TemplateLineage = readT2RhythmTemplateResolverLineage(t2Template)
  const selectedDays = clampInteger(selectedDurationDays ?? activity.durationDays, 1, 3650, activity.durationDays || 1)
  const runtimeReferenceDay = findRuntimeReferenceDayForActivity(activity, runtimeReferenceDays)
  const runtimeReferenceSelectedDays = runtimeReferenceDay
    ? calculateRuntimeReferenceDayDuration(activity, runtimeReferenceDays, selectedDays)
    : null
  const productivityCalculation = buildProductivityDurationCalculation({
    stableCode: activity.durationAssetStableCode,
    quantityProxy: activity.quantityProxy,
    durationCalculationBasis: activity.durationCalculationBasis,
    selectedDurationDays: selectedDays,
    seedLookup,
  })
  const runtimeReferenceDaysConsumed = Boolean(runtimeReferenceDay && runtimeReferenceSelectedDays === selectedDays)
  const assetCandidateDays = [
    readOptionalNumber(standardSeed?.defaultDaysP50),
    readOptionalNumber(t2Template?.rhythm.parentWindowDays.p50),
    productivityCalculation.productivityDerivedDurationDays,
  ].map((days) => clampInteger(days, 1, 3650, 0)).filter((days) => days > 0)
  const maxNonSkeletonAssetDays = assetCandidateDays.length > 0 ? Math.max(...assetCandidateDays) : 0
  const realPlanSkeletonFloorApplied = !runtimeReferenceDaysConsumed
    && realPlanSkeletonDurationDays > maxNonSkeletonAssetDays
    && selectedDays >= realPlanSkeletonDurationDays
  const baseSelectionRule = runtimeReferenceDaysConsumed
    ? 'runtime_calibrated_reference_days_p50_candidate_l2'
    : activity.durationCalculationBasis?.selectionRule
      ?? (productivityCalculation.productivityDerivedDurationDays
        ? 'productivity_or_formula_asset_backed_candidate_l1'
        : 'max_or_formula_asset_backed_candidate_l1')

  return {
    source: durationCalibrationSource,
    evidenceLevel: 'candidate_asset_backed_l1',
    selectedDurationDays: selectedDays,
    selectionRule: realPlanSkeletonFloorApplied
      ? `${baseSelectionRule}+real_plan_skeleton_floor_candidate_l1`
      : baseSelectionRule,
    realPlanSkeletonDurationDays,
    realPlanSkeletonFloorApplied,
    maxNonSkeletonAssetDays,
    durationFormula: activity.durationFormula ?? null,
    quantityProxy: activity.quantityProxy ?? null,
    standardWorkDurationSeedStableCode: activity.durationAssetStableCode ?? null,
    standardWorkDurationSeedVersion: standardSeed ? readStandardWorkDurationSeedVersion() : null,
    standardWorkDurationSeedResolverSource: standardSeedLineage.resolverSource,
    standardWorkDurationSeedResolverVersionId: standardSeedLineage.resolverVersionId,
    standardWorkDurationSeedResolverStableCode: standardSeedLineage.resolverStableCode,
    standardWorkDurationSeedP20Days: standardSeed?.defaultDaysP20 ?? null,
    standardWorkDurationSeedP50Days: standardSeed?.defaultDaysP50 ?? null,
    standardWorkDurationSeedP80Days: standardSeed?.defaultDaysP80 ?? null,
    standardWorkDurationSeedCoverageMode: standardSeed?.durationCoverageMode ?? null,
    standardWorkDurationSeedScaleBasis: standardSeed?.scaleBasis ?? null,
    ...productivityCalculation,
    t2RhythmTemplateId: activity.t2RhythmTemplateId ?? null,
    t2RhythmApplicability,
    t2RhythmTemplateVersion: t2Template ? T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION : null,
    t2RhythmTemplateResolverSource: t2TemplateLineage.resolverSource,
    t2RhythmTemplateResolverVersionId: t2TemplateLineage.resolverVersionId,
    t2RhythmTemplateResolverStableCode: t2TemplateLineage.resolverStableCode,
    t2RhythmTemplateP20Days: t2Template?.rhythm.parentWindowDays.p20 ?? null,
    t2RhythmTemplateP50Days: t2Template?.rhythm.parentWindowDays.p50 ?? null,
    t2RhythmTemplateP80Days: t2Template?.rhythm.parentWindowDays.p80 ?? null,
    t2RhythmWorkfaceUnit: t2Template?.rhythm.workfaceUnit ?? null,
    t2RhythmOverlapPolicy: t2Template?.rhythm.overlapPolicy ?? null,
    runtimeReferenceDaysConsumed,
    runtimeReferenceDaysStatus: runtimeReferenceDay ? runtimeReferenceDays?.status ?? null : null,
    runtimeReferenceDaysEvidenceLevel: runtimeReferenceDay ? runtimeReferenceDays?.evidenceLevel ?? null : null,
    runtimeReferenceDaysStableCode: runtimeReferenceDay?.stableCode ?? null,
    runtimeReferenceDaysP50Days: runtimeReferenceDay?.p50Days ?? null,
    runtimeReferenceDaysP80Days: runtimeReferenceDay?.p80Days ?? null,
    runtimeReferenceDaysSampleCount: runtimeReferenceDay?.sampleCount ?? null,
    runtimeReferenceDaysSource: runtimeReferenceDay?.source ?? null,
    runtimeReferenceDaysSourceSampleIds: runtimeReferenceDay?.sourceSampleIds ?? [],
    runtimeReferenceDaysMutationBoundary: runtimeReferenceDay ? 'candidate_only_no_business_fact_write' : null,
    selectedMethodVariantCode: activity.methodVariantCode ?? null,
    mutationBoundary: 'candidate_only_no_business_fact_write',
  }
}



export function readDurationRiskCandidateDays(
  calculation: Record<string, unknown>,
  keys: string[],
): number[] {
  return keys
    .map((key) => readOptionalNumber(calculation[key]))
    .map((days) => clampInteger(days, 1, 3650, 0))
    .filter((days) => days > 0)
}



export function buildDefaultMasterPlanDurationRiskRange(
  durationAssetCalculation: Record<string, unknown>,
  selectedDurationDays: number,
): NonNullable<GeneratedTemplateDurationSuggestion['durationRiskRange']> {
  const p50Days = clampInteger(selectedDurationDays, 1, 3650, 1)
  const p20Candidates = readDurationRiskCandidateDays(durationAssetCalculation, [
    'standardWorkDurationSeedP20Days',
    'standard_work_duration_seed_p20_days',
    't2RhythmTemplateP20Days',
    't2_rhythm_template_p20_days',
  ])
  const p80Candidates = readDurationRiskCandidateDays(durationAssetCalculation, [
    'runtimeReferenceDaysP80Days',
    'runtime_reference_days_p80_days',
    'standardWorkDurationSeedP80Days',
    'standard_work_duration_seed_p80_days',
    't2RhythmTemplateP80Days',
    't2_rhythm_template_p80_days',
  ])
  const fallbackP20 = Math.max(1, Math.floor(p50Days * 0.85))
  const fallbackP80 = Math.max(p50Days, Math.ceil(p50Days * 1.15))
  const p20Days = Math.min(p50Days, p20Candidates.length > 0 ? Math.min(...p20Candidates) : fallbackP20)
  const p80Days = Math.max(p50Days, p80Candidates.length > 0 ? Math.max(...p80Candidates) : fallbackP80)

  return {
    source: normalizeText(durationAssetCalculation.source) || ASSET_BACKED_MASTER_PLAN_DURATION_CALIBRATION_SOURCE,
    evidenceLevel: 'candidate_asset_backed_l1',
    p20Days,
    p50Days,
    p80Days,
    uncertaintyBandDays: Math.max(0, p80Days - p20Days),
    mutationBoundary: 'candidate_only_no_business_fact_write',
  }
}



export function readResidentialMethodVariantCodes(scope: Record<string, unknown>, projectFacts: Record<string, unknown>) {
  const projectFeatures = readRecord(scope.project_features ?? scope.projectFeatures ?? projectFacts.projectFeatures ?? projectFacts.project_features)
  return uniqueStringArray([
    ...readStringArray(scope.method_variant_codes ?? scope.methodVariantCodes),
    ...readStringArray(projectFacts.methodVariantCodes ?? projectFacts.method_variant_codes),
    ...readStringArray(projectFeatures.foundationFormCodes ?? projectFeatures.foundation_form_codes),
    ...readStringArray(projectFeatures.methodVariantCodes ?? projectFeatures.method_variant_codes),
  ].map((code) => code.toLowerCase()))
}



export function selectResidentialMethodOption<T extends { codes: readonly string[] }>(
  variantCodes: string[],
  options: readonly T[],
  fallback: T,
) {
  const normalizedVariants = new Set(variantCodes.map((code) => normalizeText(code).toLowerCase()).filter(Boolean))
  return options.find((option) => option.codes.some((code) => normalizedVariants.has(code))) ?? fallback
}



export function buildResidentialDurationAssetMapping(
  activity: ResidentialMasterPlanActivity,
  selectedDurationDays: number | undefined,
  seedLookup: StandardDurationSeedLookup,
  runtimeReferenceDays?: DefaultMasterPlanRuntimeReferenceDaysInput | null,
  t2Lookup?: T2RhythmTemplateLookup | null,
) {
  const standardSeed = findStandardDurationSeed(activity.durationAssetStableCode, seedLookup)
  const standardSeedLineage = readStandardDurationSeedResolverLineage(standardSeed)
  const t2Template = findT2RhythmTemplate(activity.t2RhythmTemplateId, t2Lookup)
  const t2TemplateLineage = readT2RhythmTemplateResolverLineage(t2Template)
  const durationAssetCalculation = buildAssetDurationCalculation(activity, selectedDurationDays, seedLookup, runtimeReferenceDays, t2Lookup)
  return {
    source: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
    standardWorkDurationSeedStableCode: activity.durationAssetStableCode ?? null,
    standardWorkDurationSeedVersion: standardSeed ? readStandardWorkDurationSeedVersion() : null,
    standardWorkDurationSeedResolverSource: standardSeedLineage.resolverSource,
    standardWorkDurationSeedResolverVersionId: standardSeedLineage.resolverVersionId,
    standardWorkDurationSeedResolverStableCode: standardSeedLineage.resolverStableCode,
    standardWorkDurationSeedCoverageMode: standardSeed?.durationCoverageMode ?? null,
    standardWorkDurationSeedScaleBasis: standardSeed?.scaleBasis ?? null,
    standardWorkDurationSeedProductivity: standardSeed?.baselineProductivity ?? null,
    t2RhythmTemplateId: activity.t2RhythmTemplateId ?? null,
    t2RhythmApplicability: activity.t2RhythmApplicability ?? 'required_repetitive_or_workface_activity',
    t2RhythmTemplateVersion: t2Template ? T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION : null,
    t2RhythmTemplateResolverSource: t2TemplateLineage.resolverSource,
    t2RhythmTemplateResolverVersionId: t2TemplateLineage.resolverVersionId,
    t2RhythmTemplateResolverStableCode: t2TemplateLineage.resolverStableCode,
    t2RhythmWorkfaceUnit: t2Template?.rhythm.workfaceUnit ?? null,
    t2RhythmOverlapPolicy: t2Template?.rhythm.overlapPolicy ?? null,
    selectedMethodVariantCode: activity.methodVariantCode ?? null,
    durationFormula: activity.durationFormula ?? null,
    quantityProxy: activity.quantityProxy ?? null,
    durationAssetCalculation,
    externalPlanEvidenceRefs: REAL_PLAN_SKELETON_SOURCE_IDS,
    mutationBoundary: 'candidate_only_no_business_fact_write',
  }
}



export function inferBusinessTypeActivityDurationAssets(
  activity: BusinessTypeMasterPlanActivity,
  businessType: string,
  seedLookup: StandardDurationSeedLookup,
  projectFacts: Record<string, unknown>,
  t2Lookup?: T2RhythmTemplateLookup | null,
): Pick<BusinessTypeMasterPlanActivity, 'durationAssetStableCode' | 't2RhythmTemplateId' | 'durationFormula' | 'quantityProxy' | 'durationCalculationBasis'> {
  const normalizedBusinessType = normalizeText(businessType)
  const activitySearchText = [
    activity.title,
    activity.executionPhase,
    activity.executionLane,
    ...(activity.tags ?? []),
  ].join(' ')
  const specialty = BUSINESS_TYPE_SPECIALTY_DURATION_ASSETS[normalizedBusinessType]
    ?.find((candidate) => (
      (!candidate.phases || candidate.phases.includes(activity.executionPhase))
      && candidate.match.test(activitySearchText)
    ))
  const phaseDefault = DEFAULT_MASTER_PLAN_PHASE_DURATION_ASSETS[activity.executionPhase]
  const selected = specialty ?? phaseDefault
  const durationAssetStableCode = activity.durationAssetStableCode ?? selected?.durationAssetStableCode
  const standardSeed = findStandardDurationSeed(durationAssetStableCode, seedLookup)
  const organizationVariantT2 = resolveProjectOrganizationVariantT2Template({
    businessType: normalizedBusinessType,
    executionPhase: activity.executionPhase,
    projectFacts,
    t2Lookup,
  })
  const fallbackT2RhythmTemplateId = organizationVariantT2.templateId ?? (specialty
    ? selected?.t2RhythmTemplateId
    : selectBusinessTypePhaseT2RhythmTemplateId(
      normalizedBusinessType,
      activity.executionPhase,
      selected?.t2RhythmTemplateId,
      t2Lookup,
      organizationVariantT2.templateId,
    ))
  const selectedT2RhythmTemplateId = selectGovernedBusinessTypePhaseT2RhythmTemplateId(
    normalizedBusinessType,
    activity.executionPhase,
    fallbackT2RhythmTemplateId,
    t2Lookup,
    organizationVariantT2.templateId,
  )
  const t2Template = findT2RhythmTemplate(selectedT2RhythmTemplateId, t2Lookup)

  const quantityProxy = activity.quantityProxy ?? buildBusinessTypeProjectScaleQuantityProxy({
    activity,
    businessType: normalizedBusinessType,
    projectFacts,
    fallbackUnit: t2Template?.rhythm.workfaceUnit ?? standardSeed?.scaleBasis ?? 'workface',
  })
  return {
    durationAssetStableCode,
    t2RhythmTemplateId: selectedT2RhythmTemplateId,
    durationFormula: selected
      ? [
          selected.durationFormula,
          quantityProxy.source === 'project_scale_facts' ? `project-scale proxy ${quantityProxy.unit}=${quantityProxy.value}` : null,
          standardSeed ? `standard seed ${standardSeed.stableCode}` : null,
          t2Template ? `T2 ${t2Template.templateId} p50=${t2Template.rhythm.parentWindowDays.p50}d` : null,
          'bounded as system-standard L1 with optional runtime calibration overlay',
        ].filter(Boolean).join('; ')
      : 'candidate main-control skeleton duration requires asset mapping review',
    quantityProxy,
    durationCalculationBasis: activity.durationCalculationBasis ?? {
      minDays: Math.max(1, Math.floor(activity.durationDays * 0.55)),
      maxDays: Math.max(activity.durationDays, Math.ceil(activity.durationDays * 1.9)),
      fallbackDays: activity.durationDays,
      selectionRule: quantityProxy.source === 'project_scale_facts'
        ? 'project_scale_productivity_or_formula_asset_backed_candidate_l1'
        : 'productivity_or_formula_asset_backed_candidate_l1',
    },
  }
}



export function resolveMasterPlanT2RhythmApplicability(
  activity: BusinessTypeMasterPlanActivity,
): NonNullable<BusinessTypeMasterPlanActivity['t2RhythmApplicability']> {
  if (activity.t2RhythmApplicability) return activity.t2RhythmApplicability
  const stableCode = normalizeText(activity.durationAssetStableCode)
  if (
    activity.executionNature === 'technical_preparation'
    && activity.executionPhase === 'startup_site_setup'
    && ['specialist_design_procurement_release', 'long_lead_equipment_manufacture_delivery'].includes(stableCode)
  ) {
    return 'not_applicable_one_off_activity'
  }
  return 'required_repetitive_or_workface_activity'
}



export function buildAssetBackedBusinessTypeMasterPlanActivity(
  activity: BusinessTypeMasterPlanActivity,
  businessType: string,
  seedLookup: StandardDurationSeedLookup,
  projectFacts: Record<string, unknown>,
  t2Lookup?: T2RhythmTemplateLookup | null,
): BusinessTypeMasterPlanActivity {
  const inferred = inferBusinessTypeActivityDurationAssets(activity, businessType, seedLookup, projectFacts, t2Lookup)
  const t2RhythmApplicability = resolveMasterPlanT2RhythmApplicability(activity)
  const organizationVariantT2 = resolveProjectOrganizationVariantT2Template({
    businessType: normalizeText(businessType),
    executionPhase: activity.executionPhase,
    projectFacts,
    t2Lookup,
  })
  const t2RhythmTemplateId = t2RhythmApplicability === 'not_applicable_one_off_activity'
    ? undefined
    : activity.t2RhythmTemplateId
      ?? organizationVariantT2.templateId
      ?? inferred.t2RhythmTemplateId
  const baseDurationFormula = activity.durationFormula ?? inferred.durationFormula
  const organizationVariantAligned = Boolean(
    organizationVariantT2.templateId
    && t2RhythmTemplateId === organizationVariantT2.templateId,
  )
  return {
    ...activity,
    durationAssetStableCode: activity.durationAssetStableCode ?? inferred.durationAssetStableCode,
    t2RhythmApplicability,
    t2RhythmTemplateId,
    durationFormula: organizationVariantAligned
      ? `${baseDurationFormula ?? 'asset-backed candidate duration'}; organization variant ${organizationVariantT2.variantCode} ${activity.t2RhythmTemplateId ? 'confirms explicit' : 'selects'} T2 ${t2RhythmTemplateId}`
      : baseDurationFormula,
    quantityProxy: activity.quantityProxy ?? inferred.quantityProxy,
    durationCalculationBasis: activity.durationCalculationBasis ?? inferred.durationCalculationBasis,
  }
}



export function readDefaultMasterPlanClimateInputs(params: {
  operation: PlanningTableOperation
  projectFacts: Record<string, unknown>
}) {
  const readClimateCodeArray = (value: unknown) => {
    const parsed = parseMaybeJson(value)
    const values = Array.isArray(parsed) ? parsed : [parsed]
    return uniqueStringArray(values
      .flatMap((item) => typeof item === 'string' ? item.split(/[,\s]+/) : [item])
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean))
  }
  const operationRecord = readRecord(params.operation)
  const clientContext = readRecord(operationRecord.clientContext ?? operationRecord.client_context)
  const scope = readRecord(operationRecord.scope)
  const projectLocationFacts = readRecord(params.projectFacts.locationFacts ?? params.projectFacts.location_facts)
  const scopeLocationFacts = readRecord(scope.locationFacts ?? scope.location_facts)
  const clientLocationFacts = readRecord(clientContext.locationFacts ?? clientContext.location_facts)
  const climateSignals = uniqueStringArray([
    ...readClimateCodeArray(params.projectFacts.climateSignals ?? params.projectFacts.climate_signals),
    ...readClimateCodeArray(params.projectFacts.climateSignal ?? params.projectFacts.climate_signal),
    ...readClimateCodeArray(params.projectFacts.monthlyClimateSignal ?? params.projectFacts.monthly_climate_signal),
    ...readClimateCodeArray(projectLocationFacts.climateSignals ?? projectLocationFacts.climate_signals),
    ...readClimateCodeArray(scope.climateSignals ?? scope.climate_signals),
    ...readClimateCodeArray(scope.climate_signal),
    ...readClimateCodeArray(scope.monthlyClimateSignal ?? scope.monthly_climate_signal),
    ...readClimateCodeArray(scopeLocationFacts.climateSignals ?? scopeLocationFacts.climate_signals),
    ...readClimateCodeArray(clientContext.climateSignals ?? clientContext.climate_signals),
    ...readClimateCodeArray(clientContext.climateSignal ?? clientContext.climate_signal),
    ...readClimateCodeArray(clientContext.monthlyClimateSignal ?? clientContext.monthly_climate_signal),
    ...readClimateCodeArray(clientLocationFacts.climateSignals ?? clientLocationFacts.climate_signals),
  ])
  const weatherImpactBands = uniqueStringArray([
    ...readClimateCodeArray(params.projectFacts.weatherImpactBands ?? params.projectFacts.weather_impact_bands),
    ...readClimateCodeArray(projectLocationFacts.weatherImpactBands ?? projectLocationFacts.weather_impact_bands),
    ...readClimateCodeArray(scope.weatherImpactBands ?? scope.weather_impact_bands),
    ...readClimateCodeArray(scopeLocationFacts.weatherImpactBands ?? scopeLocationFacts.weather_impact_bands),
    ...readClimateCodeArray(clientContext.weatherImpactBands ?? clientContext.weather_impact_bands),
    ...readClimateCodeArray(clientLocationFacts.weatherImpactBands ?? clientLocationFacts.weather_impact_bands),
  ])
  const monthlyClimateSignal = normalizeText(
    scope.monthlyClimateSignal
      ?? scope.monthly_climate_signal
      ?? clientContext.monthlyClimateSignal
      ?? clientContext.monthly_climate_signal
      ?? params.projectFacts.monthlyClimateSignal
      ?? params.projectFacts.monthly_climate_signal
      ?? climateSignals[0],
  ).toLowerCase() || null
  const numberArray = (...values: unknown[]) => uniqueStringArray(values.flatMap((value) => readStringArray(value)))
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12)
  return {
    climateSignals,
    weatherImpactBands,
    monthlyClimateSignal,
    rainySeasonMonths: numberArray(params.projectFacts.rainySeasonMonths, params.projectFacts.rainy_season_months, scope.rainySeasonMonths, scope.rainy_season_months, clientContext.rainySeasonMonths, clientContext.rainy_season_months),
    floodSeasonMonths: numberArray(params.projectFacts.floodSeasonMonths, params.projectFacts.flood_season_months, scope.floodSeasonMonths, scope.flood_season_months, clientContext.floodSeasonMonths, clientContext.flood_season_months),
    highTempMonths: numberArray(params.projectFacts.highTempMonths, params.projectFacts.high_temp_months, scope.highTempMonths, scope.high_temp_months, clientContext.highTempMonths, clientContext.high_temp_months),
    coldWeatherMonths: numberArray(params.projectFacts.coldWeatherMonths, params.projectFacts.cold_weather_months, scope.coldWeatherMonths, scope.cold_weather_months, clientContext.coldWeatherMonths, clientContext.cold_weather_months),
  }
}



export function buildDefaultMasterPlanProcessSeasonalContextText(activity: ResidentialMasterPlanActivity) {
  return [
    activity.title,
    activity.executionPhase,
    activity.executionLane,
    activity.durationAssetStableCode,
    activity.durationFormula,
    activity.quantityProxy?.basis,
    activity.quantityProxy?.unit,
    ...(activity.tags ?? []),
  ].map(normalizeText).filter(Boolean).join(' ')
}



export async function calculateDefaultMasterPlanProcessSeasonalDurationAdjustment(params: {
  activity: ResidentialMasterPlanActivity
  operation: PlanningTableOperation
  projectFacts: Record<string, unknown>
  plannedStartDate: string
  selectedDurationDays: number
  seedResolveContext?: AlgorithmSeedResolveContext
}): Promise<DefaultMasterPlanProcessSeasonalDurationAdjustment | null> {
  const month = Number(params.plannedStartDate.slice(5, 7))
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  const climate = readDefaultMasterPlanClimateInputs(params)
  if (climate.climateSignals.length === 0 && climate.weatherImpactBands.length === 0 && !climate.monthlyClimateSignal) return null
  const contextText = buildDefaultMasterPlanProcessSeasonalContextText(params.activity)
  const workEnvironment = inferWorkEnvironmentFromResolver(contextText, {
    phaseWindow: params.activity.executionPhase,
    primaryWorkfaceType: params.activity.executionLane,
  })
  const match = await resolveV1474ProcessSeasonalSensitivity(contextText, month, {
    ...(params.seedResolveContext ?? {}),
    standardWorkCode: params.activity.durationAssetStableCode ?? params.activity.code,
    standardWorkCodes: uniqueStringArray([params.activity.durationAssetStableCode ?? '', params.activity.code]),
    phaseWindow: params.activity.executionPhase,
    contextKeywords: [contextText, ...climate.weatherImpactBands],
    workEnvironment,
    monthlyClimateSignal: climate.monthlyClimateSignal,
    rainySeasonMonths: climate.rainySeasonMonths,
    floodSeasonMonths: climate.floodSeasonMonths,
    highTempMonths: climate.highTempMonths,
    coldWeatherMonths: climate.coldWeatherMonths,
  })
  const productivityMultiplier = Number((match as Record<string, unknown> | null)?.productivityMultiplier)
  if (!match || !Number.isFinite(productivityMultiplier) || productivityMultiplier <= 0 || productivityMultiplier >= 1) return null
  const multiplier = Math.min(1.3, Math.max(1, 1 / productivityMultiplier))
  const adjustedDurationDays = clampInteger(Math.ceil(params.selectedDurationDays * multiplier), 1, 3650, params.selectedDurationDays)
  if (adjustedDurationDays <= params.selectedDurationDays) return null
  return {
    source: 'process_seasonal_sensitivity',
    baseDurationDays: params.selectedDurationDays,
    adjustedDurationDays,
    multiplier,
    productivityMultiplier,
    stableCode: normalizeText(match.stableCode ?? match.__stableCode),
    climateSignal: normalizeText(match.sensitivityReason) || (climate.climateSignals[0] ?? null),
    monthlyClimateSignal: climate.monthlyClimateSignal,
    impactBand: normalizeText(match.impactBand) || null,
    month,
    workEnvironment,
    resolverSource: normalizeText(match.__resolverSource) || null,
    mutationBoundary: 'candidate_only_no_business_fact_write',
  }
}



export function calculateAssetBackedMasterPlanDuration(
  activity: BusinessTypeMasterPlanActivity,
  seedLookup: StandardDurationSeedLookup,
  runtimeReferenceDays?: DefaultMasterPlanRuntimeReferenceDaysInput | null,
  t2Lookup?: T2RhythmTemplateLookup | null,
) {
  const fallback = clampInteger(activity.durationDays, 1, 3650, 30)
  const standardSeed = activity.durationAssetStableCode
    ? findStandardDurationSeed(activity.durationAssetStableCode, seedLookup)
    : null
  const standardSeedDays = standardSeed
    ? readP50DaysFromStandardSeed(activity.durationAssetStableCode, fallback, seedLookup)
    : fallback
  const standardSeedCandidateDays = standardSeed
    ? clampInteger(readOptionalNumber(standardSeed.defaultDaysP50), 1, 3650, 0)
    : 0
  const t2Template = activity.t2RhythmTemplateId
    ? findT2RhythmTemplate(activity.t2RhythmTemplateId, t2Lookup)
    : null
  const t2Days = t2Template
    ? readP50DaysFromT2Template(activity.t2RhythmTemplateId, fallback, t2Lookup)
    : fallback
  const t2CandidateDays = t2Template
    ? clampInteger(readOptionalNumber(t2Template.rhythm.parentWindowDays.p50), 1, 3650, 0)
    : 0
  const productivityDays = buildProductivityDurationCalculation({
    stableCode: activity.durationAssetStableCode,
    quantityProxy: activity.quantityProxy,
    durationCalculationBasis: activity.durationCalculationBasis,
    selectedDurationDays: fallback,
    seedLookup,
  }).productivityDerivedDurationDays
  const productivityCandidateDays = clampInteger(readOptionalNumber(productivityDays), 1, 3650, 0)
  const projectScaleSelection = activity.durationCalculationBasis?.selectionRule?.startsWith('project_scale_')
    || activity.quantityProxy?.source === 'project_scale_facts'
  const assetCandidateDays = [
    fallback,
    standardSeedCandidateDays,
    t2CandidateDays,
    productivityCandidateDays,
  ].filter((days) => days > 0)
  const assetBackedBaselineDays = projectScaleSelection && assetCandidateDays.length > 0
    ? Math.max(...assetCandidateDays)
    : Math.max(fallback, standardSeedDays, t2Days, productivityCandidateDays)
  const assetBackedDays = clampInteger(assetBackedBaselineDays, 1, 3650, fallback)
  return calculateRuntimeReferenceDayDuration(activity, runtimeReferenceDays, assetBackedDays) ?? assetBackedDays
}



export const BUSINESS_TYPE_BASE_MASTER_PLAN_ACTIVITIES: BusinessTypeMasterPlanActivity[] = [
  { code: 'BTMP-BASE-01', title: '施工准备与现场临设完成', executionPhase: 'startup_site_setup', executionLane: 'site_preparation', startOffsetDays: 0, durationDays: 30, tags: ['base', 'startup'] },
  { code: 'BTMP-BASE-02', title: '基坑支护降水与土方开挖', executionPhase: 'foundation_pit_pile', executionLane: 'foundation', startOffsetDays: 25, durationDays: 55, predecessorCodes: ['BTMP-BASE-01'], tags: ['base', 'foundation'] },
  { code: 'BTMP-BASE-03', title: '桩基基础与检测验收', executionPhase: 'foundation_pit_pile', executionLane: 'foundation', startOffsetDays: 35, durationDays: 60, durationAssetStableCode: 'pile_foundation', predecessorCodes: ['BTMP-BASE-01'], tags: ['base', 'foundation'] },
  { code: 'BTMP-BASE-04', title: '地下结构施工与出正负零', executionPhase: 'basement_structure', executionLane: 'basement', startOffsetDays: 80, durationDays: 75, predecessorCodes: ['BTMP-BASE-02', 'BTMP-BASE-03'], tags: ['base', 'basement'] },
  { code: 'BTMP-BASE-05', title: '主体结构施工与分区验收', executionPhase: 'superstructure_rhythm', executionLane: 'main_structure', startOffsetDays: 145, durationDays: 130, predecessorCodes: ['BTMP-BASE-04'], tags: ['base', 'structure'] },
  { code: 'BTMP-BASE-06', title: '二次结构与砌体穿插施工', executionPhase: 'secondary_structure_fitout_roughin', executionLane: 'secondary_structure', startOffsetDays: 210, durationDays: 105, predecessorCodes: ['BTMP-BASE-05'], tags: ['base', 'secondary_structure'] },
  { code: 'BTMP-BASE-07', title: '屋面防水与外围护封闭', executionPhase: 'envelope_roof_facade', executionLane: 'envelope', startOffsetDays: 245, durationDays: 90, predecessorCodes: ['BTMP-BASE-05'], tags: ['base', 'envelope'] },
  { code: 'BTMP-BASE-08', title: '机电安装与管线综合施工', executionPhase: 'mep_roughin', executionLane: 'mep_common', startOffsetDays: 220, durationDays: 135, predecessorCodes: ['BTMP-BASE-05'], tags: ['base', 'mep'] },
  { code: 'BTMP-BASE-09', title: '装饰装修与功能区样板确认', executionPhase: 'interior_fitout_terminal', executionLane: 'interior_fitout', startOffsetDays: 270, durationDays: 120, predecessorCodes: ['BTMP-BASE-06', 'BTMP-BASE-08'], tags: ['base', 'fitout'] },
  { code: 'BTMP-BASE-10', title: '电梯安装与专项检验', executionPhase: 'elevator_installation', executionLane: 'vertical_transport', startOffsetDays: 285, durationDays: 70, predecessorCodes: ['BTMP-BASE-05'], tags: ['base', 'elevator'] },
  { code: 'BTMP-BASE-11', title: '室外管网道路与景观施工', executionPhase: 'outdoor_municipal_landscape', executionLane: 'outdoor', startOffsetDays: 330, durationDays: 85, predecessorCodes: ['BTMP-BASE-04'], tags: ['base', 'outdoor'] },
  { code: 'BTMP-BASE-12', title: '系统调试与专项验收准备', executionPhase: 'commissioning', executionLane: 'commissioning', startOffsetDays: 390, durationDays: 60, predecessorCodes: ['BTMP-BASE-08', 'BTMP-BASE-09', 'BTMP-BASE-10'], tags: ['base', 'commissioning'] },
  { code: 'BTMP-BASE-13', title: '竣工验收与移交准备', executionPhase: 'acceptance_handover', executionLane: 'handover', startOffsetDays: 445, durationDays: 45, predecessorCodes: ['BTMP-BASE-11', 'BTMP-BASE-12'], tags: ['base', 'acceptance'] },
]
