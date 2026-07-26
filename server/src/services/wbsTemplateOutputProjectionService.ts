import type { PlanningTableOperation } from '../types/planningTable.js'
import {
resolveStandardInternalFlowRule,type ChinaTemplateCategoryType,
type StandardInternalFlowRule
} from '../seeds/chinaGb50300TemplateCatalog.js'
import {
type WbsTemplateDomainGroup,
type WbsTemplatePackType
} from '../seeds/domainWbsTemplateCatalogs.js'
import {
type V1475DependencyIntentTemplate
} from '../seeds/v1475DependencyIntentTemplates.js'
import {
describeDurationContributionMode,isDurationBearingContributionMode,
normalizeDurationContributionMode,
type DurationContributionMode
} from '../seeds/durationContributionMode.js'

import {
CHINA_GB55032_TEMPLATE_ID,
WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT,
deriveElementVariantsForGeneration,
isBuiltInChinaTemplateId,
normalizeDependencyType,
normalizeId,
normalizeText,
parseMaybeJson,
readArray,
readCodeArray,
readGeneratedDurationSuggestion,
readRecord,
readStringArray,
readWritablePlanTaskDurationDays,
syncPlanReferenceDurationSuggestionDays,
uniqueStringArray,
withChildPlanRollupDurationTruth,
} from './wbsTemplateGenerationFoundation.js'
import type {
EngineeringFeatureProfile,
GeneratedElementVariant,
GeneratedRowProjectionMode,
GeneratedTemplateBatch,
GeneratedTemplateDurationSuggestion,
GeneratedTemplateRow,
InternalFlowCondition,
InternalFlowConditionalEffect,
InternalFlowEvidenceRef,
InternalFlowRelation,
InternalFlowRelationKind,
TemplateNode,
WbsTemplateGenerationDepth,
WbsTemplateGenerationRowLimitPolicy,
WbsTemplateScope,
} from './wbsTemplateGenerationFoundation.js'
import {
getChildGenerationDepth,
shouldMaterializeNodeInGeneration,
} from './wbsTemplateScopeClassificationService.js'
import {
assertGeneratedRowBudget,
buildScopeCombosForNode,
countGeneratedRowsForNode,
getGeneratableChildren,
hasGeneratableRowsForNode,
readExplicitScopeCardinality,
readNodeDurationContributionMode,
scopeHasPhaseBatch,
scopePhaseBatchKey,
} from './wbsTemplateDurationAssemblyService.js'



export function syncGeneratedRowDurationOutput(row: GeneratedTemplateRow) {
  let syncedSuggestion = syncPlanReferenceDurationSuggestionDays(
    row.durationSuggestion ?? readGeneratedDurationSuggestion(row.values.duration_suggestion),
    row.values.smart_reference_days,
  )
  if (!syncedSuggestion) return
  syncedSuggestion = withChildPlanRollupDurationTruth(syncedSuggestion, row)
  const durationContributionMode = normalizeDurationContributionMode(row.values.duration_contribution_mode)
  const writablePlanTaskDurationDays = isDurationBearingContributionMode(durationContributionMode)
    ? readWritablePlanTaskDurationDays(syncedSuggestion)
    : null
  const suggestionValue = buildGeneratedDurationSuggestionValue(
    syncedSuggestion,
    durationContributionMode,
  )
  const metadata = readRecord(row.values.standard_task_metadata)
  row.durationSuggestion = syncedSuggestion
  row.values = {
    ...row.values,
    smart_reference_days: writablePlanTaskDurationDays,
    duration_suggestion: suggestionValue,
    standard_task_metadata: {
      ...metadata,
      durationSuggestion: suggestionValue,
    },
  }
}



export function inferPreflightRowProjectionMode(node: TemplateNode): GeneratedRowProjectionMode {
  const metadata = readRecord(node.metadata)
  const templateGroup = (normalizeId(metadata.templateGroup) || 'building_main') as WbsTemplateDomainGroup
  const packType = (normalizeId(metadata.packType) || (templateGroup === 'building_main' ? 'core_quality' : 'specialty')) as WbsTemplatePackType
  const relationRole = normalizeId(metadata.relationRole)
  const planItemKind = inferPlanItemKind({ metadata, packType, relationRole, categoryType: node.categoryType })
  const scheduleParticipation = inferScheduleParticipation(planItemKind, metadata)
  const durationContributionMode = readNodeDurationContributionMode(node, { planItemKind, relationRole })
  return inferRowProjectionMode({
    metadata,
    categoryType: node.categoryType,
    planItemKind,
    scheduleParticipation,
    durationContributionMode,
  })
}



export function countGeneratedMainPlanRowsForNode(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope = {},
  replacementCodes?: ReadonlySet<string>,
): number {
  if (!hasGeneratableRowsForNode(node, generationDepth, scope, replacementCodes)) return 0
  const variants = deriveElementVariantsForGeneration(node, scope)
  const multiplier = variants.length > 0 ? variants.length : 1
  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  const childrenCount = getGeneratableChildren(node, generationDepth, scope, replacementCodes)
    .reduce((count, child) => count + countGeneratedMainPlanRowsForNode(child, childGenerationDepth, scope, replacementCodes), 0)
  const selfCount = shouldMaterializeNodeInGeneration(node, generationDepth, scope) && inferPreflightRowProjectionMode(node) === 'schedule_row'
    ? 1
    : 0
  return multiplier * (selfCount + childrenCount)
}



export function buildGenerationBatches(params: {
  generationBatchId: string
  templateIds: string[]
  scopeCombos: WbsTemplateScope[]
  rowCountsByScope: number[]
  totalRowCountsByScope?: number[]
  rows: GeneratedTemplateRow[]
}): { rowLimitPolicy: WbsTemplateGenerationRowLimitPolicy; splitByPhaseApplied: boolean; generationBatches: GeneratedTemplateBatch[] } {
  const rowProjectionCounts = countRowProjectionModes(params.rows)
  const totalRowCount = params.rows.length > 0
    ? params.rows.length
    : (params.totalRowCountsByScope ?? params.rowCountsByScope).reduce((sum, count) => sum + count, 0)
  const mainPlanRowCount = params.rows.length > 0
    ? rowProjectionCounts.schedule_row
    : params.rowCountsByScope.reduce((sum, count) => sum + count, 0)
  const hasPhasePartition = params.scopeCombos.length > 1 && params.scopeCombos.every(scopeHasPhaseBatch)
  if (!hasPhasePartition) {
    return {
      rowLimitPolicy: 'single_batch',
      splitByPhaseApplied: false,
      generationBatches: [{
        batchId: params.generationBatchId,
        phaseObjectId: params.scopeCombos[0]?.phase_object_id ?? null,
        scopeIndexes: params.scopeCombos.map((_, index) => index),
        rowCount: mainPlanRowCount,
        totalRowCount,
        rowProjectionCounts: params.rows.length > 0 ? rowProjectionCounts : undefined,
        templateIds: params.templateIds,
        rowLimit: WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
        rowLimitExceeded: mainPlanRowCount > WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
      }],
    }
  }

  const scopeIndexesByPhase = new Map<string, number[]>()
  params.scopeCombos.forEach((scope, scopeIndex) => {
    const key = scopePhaseBatchKey(scope, scopeIndex)
    scopeIndexesByPhase.set(key, [...(scopeIndexesByPhase.get(key) ?? []), scopeIndex])
  })

  const generationBatches = Array.from(scopeIndexesByPhase.entries()).map(([phaseKey, scopeIndexes], index): GeneratedTemplateBatch => {
    const rowCount = scopeIndexes.reduce((sum, scopeIndex) => sum + (params.rowCountsByScope[scopeIndex] ?? 0), 0)
    const totalRowCount = scopeIndexes.reduce((sum, scopeIndex) => sum + ((params.totalRowCountsByScope ?? params.rowCountsByScope)[scopeIndex] ?? 0), 0)
    const rows = params.rows.filter((row) => {
      const scopeIndex = Number(row.values.scope_index)
      return Number.isFinite(scopeIndex) && scopeIndexes.includes(scopeIndex)
    })
    const rowProjectionCounts = countRowProjectionModes(rows)
    const phaseObjectId = normalizeText(params.scopeCombos[scopeIndexes[0] ?? 0]?.phase_object_id) || null
    return {
      batchId: `${params.generationBatchId}:phase-${index + 1}`,
      phaseObjectId: phaseObjectId ?? phaseKey,
      scopeIndexes,
      rowCount,
      totalRowCount,
      rowProjectionCounts: rows.length > 0 ? rowProjectionCounts : undefined,
      templateIds: params.templateIds,
      rowLimit: WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
      rowLimitExceeded: rowCount > WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
    }
  })

  return {
    rowLimitPolicy: 'split_by_phase',
    splitByPhaseApplied: true,
    generationBatches,
  }
}



export function assertSimpleScopeCardinalityBudget(params: {
  generationBatchId: string
  templateIds: string[]
  templateSelections: Array<{ templateId: string; selectedNodes: TemplateNode[]; templateIndex: number }>
  scopeCombos: WbsTemplateScope[]
  generationDepth: WbsTemplateGenerationDepth
  replacementCodes: ReadonlySet<string>
}) {
  if (params.scopeCombos.length <= WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT) return
  if (params.scopeCombos.some(scopeHasPhaseBatch)) return
  if (params.templateSelections.length !== 1) return
  const selectedNodes = params.templateSelections[0]?.selectedNodes ?? []
  if (selectedNodes.length !== 1) return

  const node = selectedNodes[0]
  const nodeScopes = buildScopeCombosForNode(node, params.scopeCombos)
  if (nodeScopes.length <= WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT) return

  let generatedMainPlanRowCount = 0
  let generatedRowCount = 0
  for (const scope of nodeScopes) {
    generatedMainPlanRowCount += countGeneratedMainPlanRowsForNode(
      node,
      params.generationDepth,
      scope,
      params.replacementCodes,
    )
    generatedRowCount += countGeneratedRowsForNode(
      node,
      params.generationDepth,
      scope,
      params.replacementCodes,
    )
  }

  if (generatedMainPlanRowCount <= WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT) return

  assertGeneratedRowBudget({
    generatedMainPlanRowCount,
    generatedRowCount,
    preflightStage: 'scope_cardinality',
    generationBatches: [{
      batchId: params.generationBatchId,
      phaseObjectId: null,
      scopeIndexes: [],
      rowCount: generatedMainPlanRowCount,
      totalRowCount: generatedRowCount,
      rowProjectionCounts: undefined,
      templateIds: params.templateIds,
      rowLimit: WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
      rowLimitExceeded: generatedMainPlanRowCount > WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
    }],
  })
}



export function assertExplicitScopeCardinalityBudget(params: {
  generationBatchId: string
  templateIds: string[]
  templateSelections: Array<{ templateId: string; selectedNodes: TemplateNode[]; templateIndex: number }>
  operation: PlanningTableOperation
  generationDepth: WbsTemplateGenerationDepth
}) {
  const explicitScopeCardinality = readExplicitScopeCardinality(params.operation.scope)
  if (!explicitScopeCardinality || explicitScopeCardinality <= WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT) return
  if (params.templateSelections.length !== 1) return
  const selectedNodes = params.templateSelections[0]?.selectedNodes ?? []
  if (selectedNodes.length !== 1) return
  const node = selectedNodes[0]

  const generatedMainPlanRowsPerScope = countGeneratedMainPlanRowsForNode(node, params.generationDepth, {})
  if (generatedMainPlanRowsPerScope <= 0) return
  const generatedRowsPerScope = countGeneratedRowsForNode(node, params.generationDepth, {})
  const generatedMainPlanRowCount = explicitScopeCardinality * generatedMainPlanRowsPerScope
  if (generatedMainPlanRowCount <= WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT) return
  const generatedRowCount = explicitScopeCardinality * generatedRowsPerScope

  assertGeneratedRowBudget({
    generatedMainPlanRowCount,
    generatedRowCount,
    preflightStage: 'scope_cardinality',
    generationBatches: [{
      batchId: params.generationBatchId,
      phaseObjectId: null,
      scopeIndexes: [],
      rowCount: generatedMainPlanRowCount,
      totalRowCount: generatedRowCount,
      rowProjectionCounts: undefined,
      templateIds: params.templateIds,
      rowLimit: WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
      rowLimitExceeded: generatedMainPlanRowCount > WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
    }],
  })
}



export function countRowProjectionModes(rows: GeneratedTemplateRow[]): Record<GeneratedRowProjectionMode, number> {
  return rows.reduce<Record<GeneratedRowProjectionMode, number>>((counts, row) => {
    const mode = normalizeRowProjectionMode(row.rowProjectionMode ?? row.values.row_projection_mode ?? readRecord(row.values.standard_task_metadata).rowProjectionMode)
      || 'schedule_row'
    counts[mode] += 1
    return counts
  }, {
    schedule_row: 0,
    gate_marker: 0,
    inline_control: 0,
    linked_projection: 0,
  })
}



export type GeneratedPlanItemKind =
  | 'work_task'
  | 'management_task'
  | 'inspection_task'
  | 'document_task'
  | 'commercial_task'
  | 'safety_control'
  | 'milestone'
  | 'linked_projection'



export const PLAN_ITEM_KIND_SET = new Set<string>([
  'work_task',
  'management_task',
  'inspection_task',
  'document_task',
  'commercial_task',
  'safety_control',
  'milestone',
  'linked_projection',
])



export function normalizePlanItemKind(value: unknown): GeneratedPlanItemKind | '' {
  const normalized = normalizeId(value)
  return PLAN_ITEM_KIND_SET.has(normalized) ? normalized as GeneratedPlanItemKind : ''
}



export function inferPlanItemKindFromRelationRole(relationRole: string): GeneratedPlanItemKind | '' {
  if (relationRole === 'workflow') return 'work_task'
  if (relationRole === 'evidence') return 'document_task'
  if (relationRole === 'inspection') return 'inspection_task'
  if (relationRole === 'commercial') return 'commercial_task'
  if (relationRole === 'approval') return 'safety_control'
  if (relationRole === 'handover') return 'milestone'
  if (relationRole === 'prerequisite' || relationRole === 'management') return 'management_task'
  if (relationRole === 'projected_link') return 'linked_projection'
  return ''
}



export function inferPlanItemKind(params: {
  metadata: Record<string, unknown>
  packType: WbsTemplatePackType
  relationRole: string
  categoryType: TemplateNode['categoryType']
}) {
  const explicit = normalizePlanItemKind(params.metadata.planItemKind ?? params.metadata.plan_item_kind)
  if (explicit) return explicit
  const fromRelation = inferPlanItemKindFromRelationRole(params.relationRole)
  if (fromRelation) return fromRelation
  if (params.metadata.isAcceptanceMilestone || params.metadata.acceptanceLinkRule) return 'linked_projection'
  if (params.packType === 'project_milestone') return 'milestone'
  if (params.packType === 'danger_control') return 'safety_control'
  if (params.packType === 'quality_responsibility') return 'inspection_task'
  if (params.packType === 'document_commercial_support') return 'document_task'
  return 'work_task'
}



export function inferProgressMode(planItemKind: GeneratedPlanItemKind, metadata: Record<string, unknown>) {
  const explicit = normalizeId(metadata.progressMode ?? metadata.progress_mode)
  if (['manual', 'event_triggered', 'upload_triggered', 'binary', 'inherited'].includes(explicit)) return explicit
  if (planItemKind === 'inspection_task') return 'event_triggered'
  if (planItemKind === 'document_task') return 'upload_triggered'
  if (planItemKind === 'milestone') return 'binary'
  if (planItemKind === 'linked_projection') return 'inherited'
  return 'manual'
}



export function inferScheduleParticipation(planItemKind: GeneratedPlanItemKind, metadata: Record<string, unknown>) {
  const explicit = normalizeId(metadata.scheduleParticipation ?? metadata.schedule_participation)
  if (['normal', 'reference_only', 'read_only_projection', 'excluded'].includes(explicit)) return explicit
  if (planItemKind === 'linked_projection') return 'read_only_projection'
  if (planItemKind === 'document_task') return 'reference_only'
  return 'normal'
}



export function inferCriticalPathEligible(planItemKind: GeneratedPlanItemKind, metadata: Record<string, unknown>) {
  if (metadata.criticalPathEligible !== undefined) return Boolean(metadata.criticalPathEligible)
  if (metadata.critical_path_eligible !== undefined) return Boolean(metadata.critical_path_eligible)
  return planItemKind === 'work_task'
    || planItemKind === 'management_task'
    || planItemKind === 'inspection_task'
    || planItemKind === 'safety_control'
    || planItemKind === 'milestone'
}



export function inferScopeExpansionMode(planItemKind: GeneratedPlanItemKind, packType: WbsTemplatePackType, metadata: Record<string, unknown>) {
  const explicit = normalizeId(metadata.scopeExpansionMode ?? metadata.scope_expansion_mode)
  if (explicit) return explicit
  if (packType === 'danger_control') return 'triggered_object'
  if (packType === 'core_quality') return 'building'
  if (packType === 'specialty') return 'building'
  if (planItemKind === 'inspection_task') return 'referenced_work_or_project'
  return 'project'
}



export function normalizeRowProjectionMode(value: unknown): GeneratedRowProjectionMode | '' {
  const mode = normalizeId(value)
  return mode === 'schedule_row'
    || mode === 'gate_marker'
    || mode === 'inline_control'
    || mode === 'linked_projection'
    ? mode
    : ''
}



export function inferRowProjectionMode(params: {
  metadata: Record<string, unknown>
  categoryType: string
  planItemKind: GeneratedPlanItemKind
  scheduleParticipation: string
  durationContributionMode: DurationContributionMode | null
}): GeneratedRowProjectionMode {
  const explicit = normalizeRowProjectionMode(params.metadata.rowProjectionMode ?? params.metadata.row_projection_mode)
  if (explicit) return explicit
  if (params.planItemKind === 'linked_projection' || params.scheduleParticipation === 'read_only_projection') return 'linked_projection'
  if (params.scheduleParticipation === 'reference_only') return 'linked_projection'
  if (params.scheduleParticipation === 'excluded') return 'inline_control'
  if (params.categoryType === 'activity_step') return 'inline_control'
  if (params.durationContributionMode === 'duration_bearing') return 'schedule_row'
  if (params.planItemKind === 'milestone') return 'gate_marker'
  if (params.durationContributionMode === 'quality_gate' || params.durationContributionMode === 'handover_marker' || params.durationContributionMode === 'external_wait') return 'gate_marker'
  if (params.planItemKind === 'inspection_task' || params.planItemKind === 'safety_control') return 'gate_marker'
  if (params.durationContributionMode === 'embedded_check' || params.durationContributionMode === 'record_only') return 'inline_control'
  if (params.categoryType === 'division' || params.categoryType === 'sub_division' || params.categoryType === 'item_work') return 'schedule_row'
  return 'inline_control'
}



export const EXECUTION_PHASE_ORDER: Record<string, number> = {
  startup_site_setup: 10,
  foundation_pit_pile: 20,
  basement_structure: 30,
  basement_waterproof_handover: 40,
  superstructure_rhythm: 50,
  secondary_structure_fitout_roughin: 60,
  mep_roughin: 70,
  envelope_roof_facade: 80,
  elevator_installation: 90,
  interior_fitout_terminal: 100,
  outdoor_municipal_landscape: 110,
  commissioning: 120,
  acceptance_handover: 130,
  management_support: 900,
}



export function inferHotelSpecialtyExecutionPhase(stableCode: string) {
  if (!stableCode.startsWith('HTL-')) return null
  if (/^HTL-05-/.test(stableCode)) return 'commissioning'
  if (/^HTL-01-01-03/.test(stableCode)) return 'mep_roughin'
  if (/^HTL-03-/.test(stableCode) || /^HTL-04-01-02/.test(stableCode)) return 'mep_roughin'
  if (/^HTL-06-01-(?:09|10|19|20|21|22|23)(?:-|$)/.test(stableCode)) return 'mep_roughin'
  if (/^HTL-06-01-26(?:-|$)/.test(stableCode)) return 'commissioning'
  if (/^HTL-06-01-(?:24|25|27)(?:-|$)/.test(stableCode)) return 'acceptance_handover'
  return 'interior_fitout_terminal'
}



export function inferRenovationSpecialtyExecutionPhase(stableCode: string) {
  if (!stableCode.startsWith('RNV-')) return null
  if (/^RNV-01-/.test(stableCode)) return 'startup_site_setup'
  if (/^RNV-02-01-/.test(stableCode)) return 'superstructure_rhythm'
  if (/^RNV-02-02-/.test(stableCode)) return 'mep_roughin'
  if (/^RNV-03-01-02/.test(stableCode)) return 'acceptance_handover'
  if (/^RNV-03-/.test(stableCode)) return 'management_support'
  if (/^RNV-04-01-(?:01|02|03|04|05|06|21)(?:-|$)/.test(stableCode)) return 'startup_site_setup'
  if (/^RNV-04-01-(?:07|08|09|10|11|12|13|25)(?:-|$)/.test(stableCode)) return 'superstructure_rhythm'
  if (/^RNV-04-01-(?:14|15|26)(?:-|$)/.test(stableCode)) return 'envelope_roof_facade'
  if (/^RNV-04-01-(?:16|17|18|19|20|27|28)(?:-|$)/.test(stableCode)) return 'mep_roughin'
  if (/^RNV-04-01-22(?:-|$)/.test(stableCode)) return 'interior_fitout_terminal'
  if (/^RNV-04-01-23(?:-|$)/.test(stableCode)) return 'commissioning'
  if (/^RNV-04-01-24(?:-|$)/.test(stableCode)) return 'acceptance_handover'
  return 'secondary_structure_fitout_roughin'
}



export function inferTodSpecialtyExecutionPhase(stableCode: string) {
  if (!stableCode.startsWith('TOD-')) return null
  if (/^TOD-01-/.test(stableCode)) return 'startup_site_setup'
  if (/^TOD-02-/.test(stableCode)) return 'superstructure_rhythm'
  if (/^TOD-03-01-01/.test(stableCode)) return 'outdoor_municipal_landscape'
  if (/^TOD-03-01-03/.test(stableCode)) return 'mep_roughin'
  if (/^TOD-03-01-02/.test(stableCode)) return 'commissioning'
  if (/^TOD-04-01-(?:01|02|09|25)(?:-|$)/.test(stableCode)) return 'startup_site_setup'
  if (/^TOD-04-01-(?:03|04|20|26)(?:-|$)/.test(stableCode)) return 'superstructure_rhythm'
  if (/^TOD-04-01-(?:05|11|14|16)(?:-|$)/.test(stableCode)) return 'mep_roughin'
  if (/^TOD-04-01-(?:06|13|17|28)(?:-|$)/.test(stableCode)) return 'interior_fitout_terminal'
  if (/^TOD-04-01-(?:07|19)(?:-|$)/.test(stableCode)) return 'envelope_roof_facade'
  if (/^TOD-04-01-10(?:-|$)/.test(stableCode)) return 'elevator_installation'
  if (/^TOD-04-01-12(?:-|$)/.test(stableCode)) return 'outdoor_municipal_landscape'
  if (/^TOD-04-01-(?:15|18|21|23|27)(?:-|$)/.test(stableCode)) return 'commissioning'
  if (/^TOD-04-01-(?:22|24)(?:-|$)/.test(stableCode)) return 'acceptance_handover'
  return 'management_support'
}



export function inferModularSpecialtyExecutionPhase(stableCode: string) {
  if (!stableCode.startsWith('MIC-')) return null
  if (/^MIC-01-/.test(stableCode)) return 'startup_site_setup'
  if (/^MIC-02-/.test(stableCode)) return 'superstructure_rhythm'
  if (/^MIC-03-/.test(stableCode)) return 'startup_site_setup'
  if (/^MIC-04-/.test(stableCode)) return 'superstructure_rhythm'
  if (/^MIC-05-01-01/.test(stableCode)) return 'envelope_roof_facade'
  if (/^MIC-05-01-02/.test(stableCode)) return 'acceptance_handover'
  if (/^MIC-06-01-(?:01|02|11|12)(?:-|$)/.test(stableCode)) return 'startup_site_setup'
  if (/^MIC-06-01-(?:03|13|14|15|16)(?:-|$)/.test(stableCode)) return 'superstructure_rhythm'
  if (/^MIC-06-01-(?:04|08|09|17|19)(?:-|$)/.test(stableCode)) return 'envelope_roof_facade'
  if (/^MIC-06-01-(?:05|18)(?:-|$)/.test(stableCode)) return 'mep_roughin'
  if (/^MIC-06-01-(?:06|07)(?:-|$)/.test(stableCode)) return 'interior_fitout_terminal'
  if (/^MIC-06-01-(?:10|20)(?:-|$)/.test(stableCode)) return 'commissioning'
  if (/^MIC-06-01-(?:21|22)(?:-|$)/.test(stableCode)) return 'acceptance_handover'
  return 'management_support'
}



export function inferDataCenterSpecialtyExecutionPhase(stableCode: string, title: string) {
  if (!stableCode.startsWith('DTC-')) return null
  if (/^DTC-01-/.test(stableCode)) return 'interior_fitout_terminal'
  if (/^DTC-02-01-/.test(stableCode)) return 'commissioning'
  if (/^DTC-02-02-01/.test(stableCode)) return 'mep_roughin'
  if (/^DTC-02-02-02/.test(stableCode)) return 'commissioning'
  if (/^DTC-03-01-01/.test(stableCode)) return 'mep_roughin'
  if (/^DTC-03-01-02/.test(stableCode)) return 'commissioning'
  if (/^DTC-04-/.test(stableCode)) {
    if (/Tier|验收配合|运维接管|培训与SOP移交|备品备件.*移交/i.test(title)) return 'acceptance_handover'
    if (/调试|联调|测试|演练|送电|UAT|连续试运行|投运/i.test(title)) return 'commissioning'
    if (/冷通道封闭|热通道封闭|机柜上架|精保洁|设备进场放行/i.test(title)) return 'interior_fitout_terminal'
    return 'mep_roughin'
  }
  return 'management_support'
}



export function inferIndustrialPlantSpecialtyExecutionPhase(stableCode: string) {
  if (!stableCode.startsWith('IPL-')) return null
  if (/^IPL-05-01-01/.test(stableCode)) return 'mep_roughin'
  if (/^IPL-05-01-02/.test(stableCode)) return 'commissioning'
  if (/^IPL-05-02-01/.test(stableCode)) return 'interior_fitout_terminal'
  if (/^IPL-05-02-02/.test(stableCode)) return 'commissioning'
  if (/^IPL-05-03-01/.test(stableCode)) return 'mep_roughin'
  if (/^IPL-05-03-02/.test(stableCode) || /^IPL-05-04-/.test(stableCode)) return 'commissioning'
  if (/^IPL-01-01-01/.test(stableCode)) return 'superstructure_rhythm'
  if (/^IPL-01-01-02/.test(stableCode)) return 'envelope_roof_facade'
  if (/^IPL-02-01-01/.test(stableCode)) return 'foundation_pit_pile'
  if (/^IPL-02-01-02/.test(stableCode) || /^IPL-03-01-01/.test(stableCode)) return 'mep_roughin'
  if (/^IPL-03-01-02/.test(stableCode) || /^IPL-04-01-02/.test(stableCode)) return 'commissioning'
  if (/^IPL-04-01-01/.test(stableCode)) return 'interior_fitout_terminal'
  return 'management_support'
}



export function inferTransportationHubSpecialtyExecutionPhase(stableCode: string) {
  if (!stableCode.startsWith('TRH-')) return null
  if (/^TRH-04-01-01/.test(stableCode)) return 'envelope_roof_facade'
  if (/^TRH-04-01-02/.test(stableCode)) return 'commissioning'
  if (/^TRH-04-02-01/.test(stableCode)) return 'superstructure_rhythm'
  if (/^TRH-04-02-02/.test(stableCode)) return 'commissioning'
  if (/^TRH-04-03-01/.test(stableCode)) return 'outdoor_municipal_landscape'
  if (/^TRH-04-03-02/.test(stableCode)) return 'commissioning'
  if (/^TRH-04-04-01/.test(stableCode)) return 'interior_fitout_terminal'
  if (/^TRH-04-04-02/.test(stableCode)) return 'commissioning'
  if (/^TRH-01-01-01/.test(stableCode)) return 'superstructure_rhythm'
  if (/^TRH-01-01-02/.test(stableCode)) return 'envelope_roof_facade'
  if (/^TRH-02-01-01/.test(stableCode)) return 'elevator_installation'
  if (/^TRH-02-01-02/.test(stableCode)) return 'mep_roughin'
  if (/^TRH-02-01-03/.test(stableCode) || /^TRH-03-01-02/.test(stableCode)) return 'commissioning'
  if (/^TRH-03-01-01/.test(stableCode)) return 'outdoor_municipal_landscape'
  if (/^TRH-03-01-03/.test(stableCode)) return 'acceptance_handover'
  return 'management_support'
}



export function inferSportsCultureSpecialtyExecutionPhase(stableCode: string) {
  if (!stableCode.startsWith('SPC-')) return null
  if (/^SPC-05-01-01/.test(stableCode)) return 'interior_fitout_terminal'
  if (/^SPC-05-01-02/.test(stableCode)) return 'commissioning'
  if (/^SPC-05-02-01/.test(stableCode)) return 'interior_fitout_terminal'
  if (/^SPC-05-02-02/.test(stableCode)) return 'commissioning'
  if (/^SPC-05-03-01/.test(stableCode)) return 'mep_roughin'
  if (/^SPC-05-03-02/.test(stableCode)) return 'interior_fitout_terminal'
  if (/^SPC-05-04-01/.test(stableCode)) return 'outdoor_municipal_landscape'
  if (/^SPC-05-04-02/.test(stableCode)) return 'commissioning'
  if (/^SPC-01-01-01/.test(stableCode)) return 'superstructure_rhythm'
  if (/^SPC-01-01-02/.test(stableCode)) return 'envelope_roof_facade'
  if (/^SPC-02-/.test(stableCode)) return 'interior_fitout_terminal'
  if (/^SPC-03-/.test(stableCode) || /^SPC-04-01-01/.test(stableCode)) return 'commissioning'
  if (/^SPC-04-01-02/.test(stableCode)) return 'acceptance_handover'
  return 'management_support'
}



export function inferCivilDefenseSpecialtyExecutionPhase(stableCode: string) {
  if (!stableCode.startsWith('CDF-')) return null
  if (/^CDF-01-01-(?:01|03|04)(?:-|$)/.test(stableCode)) return 'basement_structure'
  if (/^CDF-01-01-02(?:-|$)/.test(stableCode)) return 'secondary_structure_fitout_roughin'
  if (/^CDF-02-01-01(?:-|$)/.test(stableCode)) return 'mep_roughin'
  if (/^CDF-02-01-02(?:-|$)/.test(stableCode)) return 'acceptance_handover'
  if (/^CDF-03-01-01(?:-|$)/.test(stableCode)) return 'commissioning'
  return 'management_support'
}



export function inferCampusSpecialtyExecutionPhase(stableCode: string) {
  if (!stableCode.startsWith('CMP-')) return null
  if (/^CMP-01-/.test(stableCode)) return 'startup_site_setup'
  if (/^CMP-02-01-01(?:-|$)/.test(stableCode)) return 'secondary_structure_fitout_roughin'
  if (/^CMP-02-01-(?:02|03)(?:-|$)/.test(stableCode)) return 'mep_roughin'
  if (/^CMP-03-/.test(stableCode)) return 'outdoor_municipal_landscape'
  if (/^CMP-04-/.test(stableCode)) return 'acceptance_handover'
  return 'management_support'
}



export function inferExecutionPhase(params: {
  stableCode: string
  title: string
  packType: WbsTemplatePackType
  templateGroup: string
  planItemKind: GeneratedPlanItemKind
  rowProjectionMode: GeneratedRowProjectionMode
}) {
  const text = `${params.stableCode} ${params.title} ${params.templateGroup}`.toLowerCase()
  const code = params.stableCode
  if (params.packType === 'project_milestone' || params.planItemKind === 'milestone' || params.rowProjectionMode === 'linked_projection') return 'acceptance_handover'
  if (params.packType === 'document_commercial_support' || params.packType === 'quality_responsibility') return 'management_support'
  if (params.packType === 'site_management' || params.packType === 'danger_control') return 'startup_site_setup'
  const domainSpecialtyPhase = params.templateGroup === 'data_center'
    ? inferDataCenterSpecialtyExecutionPhase(code, params.title)
    : params.templateGroup === 'hotel'
      ? inferHotelSpecialtyExecutionPhase(code)
    : params.templateGroup === 'renovation'
      ? inferRenovationSpecialtyExecutionPhase(code)
      : params.templateGroup === 'tod_upper_cover'
        ? inferTodSpecialtyExecutionPhase(code)
        : params.templateGroup === 'modular_mic'
          ? inferModularSpecialtyExecutionPhase(code)
          : params.templateGroup === 'industrial_plant'
            ? inferIndustrialPlantSpecialtyExecutionPhase(code)
            : params.templateGroup === 'transportation_hub'
              ? inferTransportationHubSpecialtyExecutionPhase(code)
              : params.templateGroup === 'sports_culture'
              ? inferSportsCultureSpecialtyExecutionPhase(code)
                : params.templateGroup === 'civil_defense'
                  ? inferCivilDefenseSpecialtyExecutionPhase(code)
                  : params.templateGroup === 'campus'
                    ? inferCampusSpecialtyExecutionPhase(code)
                    : null
  if (domainSpecialtyPhase) return domainSpecialtyPhase
  if (/^CLN-01-01-01(?:-|$)/.test(code)) return 'interior_fitout_terminal'
  if (/\u56F4\u62A4\u7CFB\u7EDF\u8282\u80FD|\u5EFA\u7B51\u8282\u80FD\u56F4\u62A4/u.test(params.title)) return 'envelope_roof_facade'
  if (text.includes('??') || text.includes('trial') || text.includes('??') || text.includes('commission')) return 'commissioning'
  if (params.templateGroup === 'elevator' || code.startsWith('10-') || text.includes('电梯') || text.includes('井道')) return 'elevator_installation'
  if (params.templateGroup === 'outdoor' || params.templateGroup === 'municipal' || text.includes('室外') || text.includes('市政') || text.includes('景观')) return 'outdoor_municipal_landscape'
  if (params.templateGroup === 'facade' || params.templateGroup === 'waterproof' || code.startsWith('04-') || text.includes('??') || text.includes('??') || text.includes('facade') || text.includes('??')) return 'envelope_roof_facade'
  if (params.templateGroup === 'decoration' || code.startsWith('03-') || text.includes('精装') || text.includes('装修') || text.includes('抹灰') || text.includes('涂饰') || text.includes('吊顶')) return 'interior_fitout_terminal'
  if (['mep', 'hvac', 'plumbing', 'electrical', 'intelligent', 'cleanroom'].includes(params.templateGroup) || /^0[5-9]-/.test(code)) return 'mep_roughin'
  if (params.templateGroup === 'foundation' || code.startsWith('01-')) {
    if (text.includes('basement') || text.includes('??') || text.includes('??') || text.includes('??')) return 'basement_waterproof_handover'
    return 'foundation_pit_pile'
  }
  if (params.templateGroup === 'steel_structure' || params.templateGroup === 'prefab' || code.startsWith('02-')) {
    if (text.includes('砌筑') || text.includes('二次结构') || text.includes('粗装')) return 'secondary_structure_fitout_roughin'
    return 'superstructure_rhythm'
  }
  return 'management_support'
}



export function inferExecutionLane(params: {
  executionPhase: string
  templateGroup: string
  packType: WbsTemplatePackType
}) {
  if (params.executionPhase === 'management_support') return params.packType
  if (params.executionPhase === 'mep_roughin') return params.templateGroup || 'mep'
  if (params.executionPhase === 'superstructure_rhythm') return 'structure'
  if (params.executionPhase === 'foundation_pit_pile') return 'foundation'
  if (params.executionPhase === 'basement_waterproof_handover') return 'basement'
  if (params.executionPhase === 'envelope_roof_facade') return params.templateGroup === 'facade' ? 'facade' : 'envelope'
  if (params.executionPhase === 'interior_fitout_terminal') return 'interior'
  return params.executionPhase
}



export function buildWorkfaceId(scope: WbsTemplateScope) {
  return normalizeText(scope.physical_zone_object_id)
    || normalizeText(scope.functional_area_object_id)
    || normalizeText(scope.floor_object_id)
    || normalizeText(scope.building_object_id)
    || normalizeText(scope.section_object_id)
    || normalizeText(scope.phase_object_id)
    || normalizeText(scope.engineering_object_id)
    || 'project'
}



export function buildLinkedProjectionSource(metadata: Record<string, unknown>) {
  const direct = readRecord(metadata.linkedProjectionSource ?? metadata.linked_projection_source)
  if (Object.keys(direct).length > 0) return direct
  const acceptanceLinkRule = readRecord(metadata.acceptanceLinkRule ?? metadata.acceptance_link_rule)
  if (Object.keys(acceptanceLinkRule).length === 0) return {}
  return {
    sourceType: 'acceptance_plan',
    sourceId: normalizeId(acceptanceLinkRule.referencedTypeFilter ?? acceptanceLinkRule.referenced_type_filter) || 'acceptance_plan',
    sourceLabel: 'Acceptance timeline',
    sourceRoute: '/acceptance-timeline',
  }
}



export function buildGeneratedDurationSuggestionValue(
  durationSuggestion: GeneratedTemplateDurationSuggestion | null,
  durationContributionMode: string | null,
) {
  if (!durationSuggestion) return null
  const templateFastEstimateDays = durationSuggestion.durationOutputCode === 'template_fast_estimate'
    ? durationSuggestion.recommendedDurationDays ?? durationSuggestion.templateFastEstimateDays ?? null
    : durationSuggestion.templateFastEstimateDays ?? null
  return {
    conservativeDurationDays: durationSuggestion.conservativeDurationDays,
    riskP20DurationDays: durationSuggestion.riskP20DurationDays ?? durationSuggestion.durationRiskRange?.p20Days ?? null,
    riskP50DurationDays: durationSuggestion.riskP50DurationDays ?? durationSuggestion.durationRiskRange?.p50Days ?? null,
    riskP80DurationDays: durationSuggestion.riskP80DurationDays ?? durationSuggestion.durationRiskRange?.p80Days ?? null,
    durationRiskRange: durationSuggestion.durationRiskRange ?? null,
    durationOutputCode: durationSuggestion.durationOutputCode ?? null,
    durationOutputSemanticFieldName: durationSuggestion.durationOutputSemanticFieldName ?? null,
    durationOutputContract: durationSuggestion.durationOutputContract ?? null,
    durationOutputWriteEvaluation: durationSuggestion.durationOutputWriteEvaluation ?? null,
    durationOutputPromotion: durationSuggestion.durationOutputPromotion ?? null,
    templateFastEstimateDays,
    planReferenceDays: durationSuggestion.planReferenceDays ?? null,
    contextualReferenceDays: durationSuggestion.contextualReferenceDays ?? null,
    remainingForecastDays: durationSuggestion.remainingForecastDays ?? null,
    phaseWindowDays: durationSuggestion.phaseWindowDays ?? null,
    accelerationTargetDays: durationSuggestion.accelerationTargetDays ?? null,
    confidenceLevel: durationSuggestion.confidenceLevel,
    confidenceScore: durationSuggestion.confidenceScore,
    forecastSource: durationSuggestion.forecastSource,
    durationCalibrationSource: durationSuggestion.durationCalibrationSource,
    durationProvenance: durationSuggestion.durationProvenance,
    businessReason: durationSuggestion.businessReason,
    businessReasonCode: durationSuggestion.businessReasonCode ?? null,
    businessReasonCodes: durationSuggestion.businessReasonCodes ?? [],
    businessReasonParams: durationSuggestion.businessReasonParams ?? null,
    displaySummary: durationSuggestion.displaySummary ?? null,
    dataMaturity: durationSuggestion.dataMaturity ?? null,
    dataMaturityReasons: durationSuggestion.dataMaturityReasons ?? [],
    dataUpgradePath: durationSuggestion.dataUpgradePath ?? [],
    dataUpgradeBlockedBy: durationSuggestion.dataUpgradeBlockedBy ?? [],
    factorAvailability: durationSuggestion.factorAvailability ?? {},
    durationContributionMode: durationContributionMode ?? durationSuggestion.durationContributionMode ?? null,
    floorRhythmAdjustment: durationSuggestion.floorRhythmAdjustment ?? null,
    durationBoundaryRole: durationSuggestion.durationBoundaryRole ?? null,
    parentDurationBoundaryPolicy: durationSuggestion.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: durationSuggestion.nonAdditiveWithParentDuration ?? false,
    parentReferenceDurationDays: durationSuggestion.parentReferenceDurationDays ?? null,
    parentTaskTitle: durationSuggestion.parentTaskTitle ?? null,
    independentReferenceDurationDays: durationSuggestion.independentReferenceDurationDays ?? null,
    packageChildPlanDurationDays: durationSuggestion.packageChildPlanDurationDays ?? null,
    planDurationTruthSource: durationSuggestion.planDurationTruthSource ?? null,
    packageChildRhythmWindowStartDay: durationSuggestion.packageChildRhythmWindowStartDay ?? null,
    packageChildRhythmWindowEndDay: durationSuggestion.packageChildRhythmWindowEndDay ?? null,
    packageChildRhythmWindowRole: durationSuggestion.packageChildRhythmWindowRole ?? null,
  }
}



export function normalizeInternalFlowRelationKind(value: unknown): InternalFlowRelationKind {
  const kind = normalizeText(value)
  if (kind === 'hard_sequence' || kind === 'acceptance_gate' || kind === 'parallel_allowed') return kind
  return 'soft_sequence'
}



export function normalizeInternalFlowRelationRole(value: unknown, kind: InternalFlowRelationKind): V1475DependencyIntentTemplate['relationRole'] {
  const role = normalizeText(value) as V1475DependencyIntentTemplate['relationRole']
  if (role === 'workflow' || role === 'inspection') return role
  return kind === 'acceptance_gate' ? 'inspection' : 'workflow'
}



export function normalizeInternalFlowStrength(value: unknown, createsDependency: boolean): V1475DependencyIntentTemplate['strength'] {
  const strength = normalizeText(value) as V1475DependencyIntentTemplate['strength']
  if (strength === 'hard' || strength === 'recommended' || strength === 'candidate') return strength
  return createsDependency ? 'recommended' : 'candidate'
}



export function buildInternalFlowRuntimePolicy(relation: InternalFlowRelation) {
  if (relation.createsDependency) {
    return {
      runtimeDependency: relation.kind === 'acceptance_gate' ? 'gate_dependency' : 'strong_dependency',
      initialScheduling: 'dependency_edge',
      readinessBlocking: true,
      criticalPathEligible: true,
      manualPromotionRequired: false,
      projectLearning: 'record_execution_evidence',
    }
  }

  if (relation.kind === 'soft_sequence') {
    return {
      runtimeDependency: 'none',
      initialScheduling: 'recommended_order',
      readinessBlocking: false,
      criticalPathEligible: false,
      manualPromotionRequired: true,
      projectLearning: 'increase_recommendation_weight_only',
    }
  }

  return {
    runtimeDependency: 'none',
    initialScheduling: relation.scheduleMode === 'parallel_with_previous' ? 'parallel_hint' : 'reference_only',
    readinessBlocking: false,
    criticalPathEligible: false,
    manualPromotionRequired: true,
    projectLearning: 'record_execution_evidence',
  }
}



export function readInternalFlowConditions(value: unknown): InternalFlowCondition[] {
  return readArray(parseMaybeJson(value))
    .map((item) => {
      const record = readRecord(item)
      const values = readStringArray(record.values)
      return values.length > 0
        ? {
            field: normalizeId(record.field),
            operator: normalizeId(record.operator) || 'includes_any',
            values,
          }
        : null
    })
    .filter((item): item is InternalFlowCondition => Boolean(item))
}



export function readInternalFlowEvidenceRefs(value: unknown): InternalFlowEvidenceRef[] {
  return readArray(parseMaybeJson(value))
    .map((item) => {
      const record = readRecord(item)
      const code = normalizeId(record.code)
      if (!code) return null
      return {
        code,
        level: normalizeId(record.level) || 'standard',
        ref: normalizeText(record.ref) || null,
        rationale: normalizeText(record.rationale) || null,
      }
    })
    .filter((item): item is InternalFlowEvidenceRef => Boolean(item))
}



export function readInternalFlowConditionalEffects(value: unknown): InternalFlowConditionalEffect[] {
  return readArray(parseMaybeJson(value))
    .map((item) => {
      const record = readRecord(item)
      const when = readInternalFlowConditions(record.when)
      if (when.length === 0) return null
      const effect: InternalFlowConditionalEffect = {
        id: normalizeId(record.id),
        when,
        relationKind: normalizeInternalFlowRelationKind(record.relationKind ?? record.relation_kind),
        dependencyType: normalizeDependencyType(record.dependencyType ?? record.dependency_type),
        lagDays: Number(record.lagDays ?? record.lag_days ?? 0) || 0,
        relationRole: normalizeInternalFlowRelationRole(
          record.relationRole ?? record.relation_role,
          normalizeInternalFlowRelationKind(record.relationKind ?? record.relation_kind),
        ),
        strength: normalizeInternalFlowStrength(
          record.strength,
          normalizeInternalFlowRelationKind(record.relationKind ?? record.relation_kind) === 'hard_sequence'
            || normalizeInternalFlowRelationKind(record.relationKind ?? record.relation_kind) === 'acceptance_gate',
        ),
        reasonCode: normalizeText(record.reasonCode ?? record.reason_code) || null,
        curationBasis: normalizeText(record.curationBasis ?? record.curation_basis) || null,
        scheduleMode: normalizeId(record.scheduleMode ?? record.schedule_mode) === 'parallel_with_previous'
          ? 'parallel_with_previous'
          : 'sequential',
        requiresAllPreviousSiblings: record.requiresAllPreviousSiblings === true || record.requires_all_previous_siblings === true,
        evidenceCodes: readCodeArray(record.evidenceCodes ?? record.evidence_codes),
        evidenceRefs: readInternalFlowEvidenceRefs(record.evidenceRefs ?? record.evidence_refs),
      }
      return effect
    })
    .filter(Boolean) as InternalFlowConditionalEffect[]
}



export function internalFlowConditionValues(condition: InternalFlowCondition, context: {
  featureProfile: EngineeringFeatureProfile
  predecessorName: string
  successorName: string
  elementVariant?: GeneratedElementVariant | null
}) {
  const field = normalizeId(condition.field)
  if (field === 'project_type_code') return [context.featureProfile.projectTypeCode].filter(Boolean) as string[]
  if (field === 'structure_type_code') return [context.featureProfile.structureTypeCode].filter(Boolean) as string[]
  if (field === 'method_variant_code') return context.featureProfile.methodVariantCodes
  if (field === 'element_variant_code') {
    return uniqueStringArray([
      ...context.featureProfile.elementVariantCodes,
      context.elementVariant?.code ?? '',
    ])
  }
  if (field === 'climate_signal' || field === 'monthly_climate_signal') return context.featureProfile.climateSignals
  if (field === 'weather_impact_band') return context.featureProfile.weatherImpactBands
  if (field === 'predecessor_name') return [context.predecessorName]
  if (field === 'successor_name') return [context.successorName]
  return []
}



export function internalFlowConditionMatches(condition: InternalFlowCondition, context: {
  featureProfile: EngineeringFeatureProfile
  predecessorName: string
  successorName: string
  elementVariant?: GeneratedElementVariant | null
}) {
  const actualValues = internalFlowConditionValues(condition, context)
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
  const expectedValues = uniqueStringArray(condition.values ?? [])
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
  if (expectedValues.length === 0) return false
  const hasMatch = expectedValues.some((expected) => actualValues.includes(expected))
  return normalizeId(condition.operator) === 'excludes_any' ? !hasMatch : hasMatch
}



export function applyInternalFlowConditionalEffects(
  relation: InternalFlowRelation,
  context: {
    featureProfile: EngineeringFeatureProfile
    predecessorName: string
    successorName: string
    elementVariant?: GeneratedElementVariant | null
  },
): InternalFlowRelation {
  const applied: string[] = []
  let current = { ...relation }
  for (const effect of relation.conditionalEffects ?? []) {
    const conditions = effect.when ?? []
    if (conditions.length === 0 || !conditions.every((condition) => internalFlowConditionMatches(condition, context))) continue
    const kind = normalizeInternalFlowRelationKind(effect.relationKind)
    const createsDependency = kind === 'hard_sequence' || kind === 'acceptance_gate'
    applied.push(normalizeId(effect.id) || `effect-${applied.length + 1}`)
    current = {
      ...current,
      kind,
      createsDependency,
      dependencyType: normalizeDependencyType(effect.dependencyType ?? current.dependencyType),
      lagDays: Number(effect.lagDays ?? current.lagDays ?? 0) || 0,
      relationRole: normalizeInternalFlowRelationRole(effect.relationRole ?? current.relationRole, kind),
      strength: normalizeInternalFlowStrength(effect.strength ?? current.strength, createsDependency),
      reasonCode: normalizeText(effect.reasonCode) || current.reasonCode,
      curationBasis: normalizeText(effect.curationBasis) || current.curationBasis,
      scheduleMode: normalizeId(effect.scheduleMode) === 'parallel_with_previous' ? 'parallel_with_previous' : 'sequential',
      requiresAllPreviousSiblings: effect.requiresAllPreviousSiblings ?? current.requiresAllPreviousSiblings,
      evidenceCodes: (effect.evidenceCodes?.length ? effect.evidenceCodes : current.evidenceCodes) ?? [],
      evidenceRefs: (effect.evidenceRefs?.length ? effect.evidenceRefs : current.evidenceRefs) ?? [],
    }
  }
  return applied.length > 0 ? { ...current, appliedConditionalEffectIds: applied } : current
}



export function buildReferenceOnlyInternalFlowRelation(mode: DurationContributionMode): InternalFlowRelation {
  const label = describeDurationContributionMode(mode)
  return {
    kind: 'parallel_allowed',
    createsDependency: false,
    dependencyType: 'SS',
    lagDays: 0,
    relationRole: mode === 'record_only' ? 'evidence' : 'workflow',
    strength: 'candidate',
    reasonCode: 'DURATION_CONTRIBUTION_MODE_REFERENCE_ONLY',
    source: 'duration_contribution_mode',
    sourceVersion: 'v1.4.7.2',
    seedRuleId: null,
    ruleVersion: null,
    curationStatus: 'system_resolved',
    curationMethod: 'duration_contribution_mode_guard',
    curationBasis: `${label}，不作为同父级普通施工依赖链条的前置或后置。`,
    reviewNeeded: false,
    scheduleMode: 'parallel_with_previous',
    requiresAllPreviousSiblings: false,
    evidenceCodes: [],
    evidenceRefs: [],
    governancePriority: 'P2',
    applicableWhen: [],
    conditionalEffects: [],
    appliedConditionalEffectIds: [],
    generalizationHint: null,
    additionalPredecessorStableCodes: [],
  }
}



export function buildOverviewItemWorkInternalFlowRelation(
  predecessorNode: TemplateNode,
  currentNode: TemplateNode,
): InternalFlowRelation {
  const predecessorCode = normalizeText(predecessorNode.stableCode).toUpperCase()
  const currentCode = normalizeText(currentNode.stableCode).toUpperCase()
  if (predecessorCode.startsWith('PFB-00') && currentCode.startsWith('PFB-00')) {
    return {
      kind: 'parallel_allowed',
      createsDependency: true,
      dependencyType: 'SS',
      lagDays: currentCode.startsWith('PFB-00-01-03') ? 7 : 0,
      relationRole: 'workflow',
      strength: 'recommended',
      reasonCode: 'PREFAB_FACTORY_ROLLING_SUPPLY_LANE',
      source: 'wbs_template_generation_service',
      sourceVersion: 'v1.4.22.1',
      seedRuleId: `overview-prefab-factory-rolling:${predecessorNode.stableCode}:${currentNode.stableCode}`,
      ruleVersion: 1,
      curationStatus: 'system_resolved',
      curationMethod: 'prefab_supply_chain_lane',
      curationBasis: 'PC factory detailing, production and delivery are rolling supply-chain lanes; overview generation must not queue the whole batch as FS or it will overextend site hoisting.',
      reviewNeeded: false,
      scheduleMode: 'parallel_with_previous',
      requiresAllPreviousSiblings: false,
      evidenceCodes: ['JGJ1', 'GB/T51231'],
      evidenceRefs: [],
      governancePriority: 'P1',
      applicableWhen: [],
      conditionalEffects: [],
      appliedConditionalEffectIds: [],
      generalizationHint: {
        status: 'semantic_rule',
        targetPattern: 'prefab_factory_supply_chain_rolling_release',
        promotionPriority: 'P1',
        reason: 'Factory full-batch completion is a supply-chain control lane, not the onsite critical path release gate.',
      },
      additionalPredecessorStableCodes: [],
    }
  }

  return {
    kind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'OVERVIEW_ITEM_WORK_FRONTIER_SEQUENCE',
    source: 'wbs_template_generation_service',
    sourceVersion: 'v1.4.22.1',
    seedRuleId: `overview-item-work:${predecessorNode.stableCode}:${currentNode.stableCode}`,
    ruleVersion: 1,
    curationStatus: 'system_resolved',
    curationMethod: 'overview_item_work_frontier',
    curationBasis: 'At overview/itemPack depth, item_work rows carry the master plan. Adjacent duration-bearing item packs default to same-parent FS+0 execution sequence; non-duration control items stay out of the dependency chain.',
    reviewNeeded: false,
    scheduleMode: 'sequential',
    requiresAllPreviousSiblings: false,
    evidenceCodes: ['GB50300'],
    evidenceRefs: [],
    governancePriority: 'P2',
    applicableWhen: [],
    conditionalEffects: [],
    appliedConditionalEffectIds: [],
    generalizationHint: {
      status: 'semantic_rule',
      targetPattern: 'overview_item_work_duration_bearing_sequence',
      promotionPriority: 'P2',
      reason: 'Keep overview generation schedulable after process rows are collapsed under itemPack rows.',
    },
    additionalPredecessorStableCodes: [],
  }
}



export function readInternalFlowRelationFromSeed(
  predecessorNode: TemplateNode,
  currentNode: TemplateNode,
  context?: {
    featureProfile: EngineeringFeatureProfile
    predecessorName: string
    successorName: string
    elementVariant?: GeneratedElementVariant | null
  },
): InternalFlowRelation {
  const legacyRule = readRecord(currentNode.metadata.internalFlowFromPrevious ?? currentNode.metadata.internal_flow_from_previous)
  const resolvedRule: StandardInternalFlowRule | Record<string, unknown> = (
    isBuiltInChinaTemplateId(currentNode.templateId) || Object.keys(legacyRule).length === 0
  )
    ? resolveStandardInternalFlowRule({
      catalogSource: currentNode.templateId === CHINA_GB55032_TEMPLATE_ID
        ? 'china_gb50300_template_catalog'
        : 'domain_wbs_template_catalog',
      predecessorStableCode: predecessorNode.stableCode,
      predecessorName: predecessorNode.name,
      successorStableCode: currentNode.stableCode,
      successorName: currentNode.name,
      successorCategoryType: currentNode.categoryType as ChinaTemplateCategoryType,
    })
    : legacyRule
  const rule = readRecord(resolvedRule)
  if (!Object.keys(rule).length) {
    return {
      kind: 'soft_sequence',
      createsDependency: false,
      dependencyType: 'SS',
      lagDays: 0,
      relationRole: 'workflow',
      strength: 'candidate',
      reasonCode: 'MISSING_INTERNAL_FLOW_RULE_SOFT_FALLBACK',
      source: null,
      sourceVersion: null,
      seedRuleId: null,
      ruleVersion: null,
      curationStatus: 'review_required',
      curationMethod: 'soft_fallback',
      curationBasis: 'The same-parent internal flow rule is not explicitly provided by the standard-work seed; no hard dependency is generated by default.',
      reviewNeeded: true,
      scheduleMode: 'sequential',
      requiresAllPreviousSiblings: false,
      evidenceCodes: [],
      evidenceRefs: [],
      governancePriority: 'P2',
      applicableWhen: [],
      conditionalEffects: [],
      appliedConditionalEffectIds: [],
      generalizationHint: null,
      additionalPredecessorStableCodes: [],
    }
  }
  const kind = normalizeInternalFlowRelationKind(rule.relationKind ?? rule.relation_kind)
  const createsDependency = typeof rule.createsDependency === 'boolean'
    ? rule.createsDependency
    : kind === 'hard_sequence' || kind === 'acceptance_gate'
  const relation: InternalFlowRelation = {
    kind,
    createsDependency,
    dependencyType: normalizeDependencyType(rule.dependencyType ?? rule.dependency_type),
    lagDays: Number(rule.lagDays ?? rule.lag_days ?? 0) || 0,
    relationRole: normalizeInternalFlowRelationRole(rule.relationRole ?? rule.relation_role, kind),
    strength: normalizeInternalFlowStrength(rule.strength, createsDependency),
    reasonCode: normalizeText(rule.reasonCode ?? rule.reason_code) || 'STANDARD_INTERNAL_FLOW_RULE',
    source: normalizeId(rule.source),
    sourceVersion: normalizeId(rule.sourceVersion ?? rule.source_version),
    seedRuleId: normalizeId(rule.seedRuleId ?? rule.seed_rule_id),
    ruleVersion: Number(rule.ruleVersion ?? rule.rule_version ?? 0) || null,
    curationStatus: normalizeId(rule.curationStatus ?? rule.curation_status),
    curationMethod: normalizeId(rule.curationMethod ?? rule.curation_method),
    curationBasis: normalizeText(rule.curationBasis ?? rule.curation_basis) || null,
    reviewNeeded: rule.reviewNeeded === true || rule.review_needed === true,
    scheduleMode: normalizeId(rule.scheduleMode ?? rule.schedule_mode) === 'parallel_with_previous'
      ? 'parallel_with_previous'
      : 'sequential',
    requiresAllPreviousSiblings: rule.requiresAllPreviousSiblings === true || rule.requires_all_previous_siblings === true,
    evidenceCodes: Array.isArray(rule.evidenceCodes)
      ? rule.evidenceCodes.map((code) => normalizeId(code)).filter(Boolean)
      : Array.isArray(rule.evidence_codes)
        ? rule.evidence_codes.map((code) => normalizeId(code)).filter(Boolean)
        : [],
    evidenceRefs: readInternalFlowEvidenceRefs(rule.evidenceRefs ?? rule.evidence_refs),
    governancePriority: normalizeId(rule.governancePriority ?? rule.governance_priority) === 'P0'
      ? 'P0'
      : normalizeId(rule.governancePriority ?? rule.governance_priority) === 'P1'
        ? 'P1'
        : 'P2',
    applicableWhen: readInternalFlowConditions(rule.applicableWhen ?? rule.applicable_when),
    conditionalEffects: readInternalFlowConditionalEffects(rule.conditionalEffects ?? rule.conditional_effects),
    appliedConditionalEffectIds: [],
    generalizationHint: Object.keys(readRecord(rule.generalizationHint ?? rule.generalization_hint)).length > 0
      ? readRecord(rule.generalizationHint ?? rule.generalization_hint)
      : null,
    additionalPredecessorStableCodes: readCodeArray(
      rule.additionalPredecessorStableCodes
        ?? rule.additional_predecessor_stable_codes,
    ),
  }
  if (!context) return relation
  if ((relation.applicableWhen ?? []).length > 0 && !relation.applicableWhen?.every((condition) => internalFlowConditionMatches(condition, context))) {
    return {
      ...relation,
      kind: 'soft_sequence',
      createsDependency: false,
      dependencyType: 'SS',
      relationRole: 'workflow',
      strength: 'candidate',
      reasonCode: 'STANDARD_INTERNAL_FLOW_CONDITION_NOT_MATCHED',
      scheduleMode: 'parallel_with_previous',
      requiresAllPreviousSiblings: false,
      additionalPredecessorStableCodes: [],
    }
  }
  return applyInternalFlowConditionalEffects(relation, context)
}



export function getScheduleChildKey(node: TemplateNode, elementVariant?: GeneratedElementVariant | null) {
  return `${node.id}:${elementVariant?.code ?? 'base'}`
}
