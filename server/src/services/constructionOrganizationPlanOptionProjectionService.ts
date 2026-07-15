import type {
  ConstructionOrganizationGeneratedRowProjection,
  ConstructionOrganizationPlanOption,
  ConstructionOrganizationPlanNetworkDraftRecommendationSummary,
  ConstructionOrganizationScenarioSelection,
  ConstructionOrganizationVirtualNetworkNode,
} from './constructionOrganizationScenarioSelector.js'
import { buildPlanOptionComparisonPackage } from './constructionOrganizationScenarioSelector.js'
import { inclusiveDurationDays, signedDurationDayDelta } from '../utils/durationDays.js'

export type ConstructionOrganizationGeneratedRowProjectionInputRow = {
  id: string
  title?: string | null
  stableCode?: string | null
  executionPhase?: string | null
  rowProjectionMode?: string | null
  durationContributionMode?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  smartReferenceDays?: number | null
  durationSuggestion?: unknown
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword))
}

function readStableCodeParts(value: unknown) {
  return normalizeText(value)
    .toUpperCase()
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean)
}

function isCoarseStableCode(row: ConstructionOrganizationGeneratedRowProjectionInputRow, major: string) {
  const parts = readStableCodeParts(row.stableCode)
  return parts.length === 1 && parts[0] === major
}

function stableCodeStartsWith(row: ConstructionOrganizationGeneratedRowProjectionInputRow, prefix: string) {
  const code = normalizeText(row.stableCode).toUpperCase()
  const normalizedPrefix = normalizeText(prefix).toUpperCase()
  return Boolean(code && normalizedPrefix && (code === normalizedPrefix || code.startsWith(`${normalizedPrefix}-`)))
}

function rowSemanticText(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  return `${normalizeId(row.executionPhase)} ${normalizeId(row.title)}`
}

function isBackfillCarrier(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  return includesAny(rowSemanticText(row), ['backfill', '回填'])
}

function isExplicitEarthworkCarrier(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  if (isBackfillCarrier(row)) return false
  return includesAny(rowSemanticText(row), [
    'earthwork',
    'excavat',
    'bulk excavation',
    '土方',
    '开挖',
    '边坡',
  ])
}

function isExplicitBasementCarrier(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  return includesAny(rowSemanticText(row), [
    'basement',
    '地下',
    '人防',
    'basement structure',
  ])
}

function isExplicitPileCarrier(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  return includesAny(normalizeId(row.title), [
    'pile',
    '桩',
    '灌注桩',
    '排桩',
  ])
}

function rowIsScheduleCarrier(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  const rowProjectionMode = normalizeId(row.rowProjectionMode)
  if (rowProjectionMode && rowProjectionMode !== 'schedule_row') return false
  const durationContributionMode = normalizeId(row.durationContributionMode)
  return durationContributionMode !== 'record_only' && durationContributionMode !== 'reference_only'
}

function rowMatchesVirtualPhase(
  row: ConstructionOrganizationGeneratedRowProjectionInputRow,
  phase: ConstructionOrganizationVirtualNetworkNode['phase'],
  virtualNodeId?: string | null,
) {
  const executionPhase = normalizeId(row.executionPhase)
  const title = normalizeId(row.title)
  const stableCode = normalizeId(row.stableCode)
  const nodeId = normalizeId(virtualNodeId)
  const haystack = `${executionPhase} ${title} ${stableCode}`
  const explicitEarthworkCarrier = isExplicitEarthworkCarrier(row)
  const explicitBasementCarrier = isExplicitBasementCarrier(row)
  const explicitPileCarrier = isExplicitPileCarrier(row)
  const coarseFoundationPackage = isCoarseStableCode(row, '01')
  const coarseStructurePackage = isCoarseStableCode(row, '02')
  const isHandoffCarrier = includesAny(haystack, [
    'handoff',
    'acceptance',
    'commission',
    '移交',
    '验收',
    '交付',
  ])

  if (nodeId.includes('pile')) {
    if (explicitPileCarrier) return true
    if (explicitEarthworkCarrier || explicitBasementCarrier) return false
    if (stableCodeStartsWith(row, '01-02')) return true
    if (stableCodeStartsWith(row, '01-05') || stableCodeStartsWith(row, '01-06') || stableCodeStartsWith(row, '01-07')) return false
    if (coarseFoundationPackage) return true
    return includesAny(haystack, [
      'pile',
      '桩',
      '灌注桩',
      '排桩',
      '筏',
      '箱型',
      '基础',
    ])
  }

  if (nodeId.includes('earthwork') || nodeId.includes('excavat')) {
    if (explicitEarthworkCarrier) return true
    if (stableCodeStartsWith(row, '01-05') && !isBackfillCarrier(row)) return true
    if (explicitPileCarrier || explicitBasementCarrier) return false
    if (stableCodeStartsWith(row, '01-05-01') || stableCodeStartsWith(row, '01-06-03')) return true
    if (stableCodeStartsWith(row, '01-02') || stableCodeStartsWith(row, '01-03') || stableCodeStartsWith(row, '01-04') || stableCodeStartsWith(row, '01-07')) return false
    if (coarseFoundationPackage) return true
    return includesAny(haystack, [
      'earthwork',
      'excavat',
      'bulk excavation',
      '土方',
      '开挖',
      '边坡',
    ])
  }

  if (nodeId.includes('basement')) {
    if (isHandoffCarrier) return false
    if (executionPhase.includes('superstructure') || executionPhase.includes('tower')) return false
    if (explicitBasementCarrier) return true
    if (explicitEarthworkCarrier || explicitPileCarrier) return false
    if (nodeId.includes('core_basement') || nodeId.includes('shared_basement')) {
      if (stableCodeStartsWith(row, '01-07') || stableCodeStartsWith(row, '01-02') || stableCodeStartsWith(row, '01-05')) return true
      if (stableCodeStartsWith(row, '01-06')) return false
    }
    if (coarseFoundationPackage) return true
    return includesAny(haystack, [
      'basement',
      '地下',
      '人防',
      '筏',
      '箱型',
      '防水',
      'basement structure',
    ])
  }

  if (nodeId.includes('handoff')) {
    return isHandoffCarrier
  }

  if (nodeId.includes('tower_lane')) {
    if (isHandoffCarrier) return false
    if (coarseStructurePackage) return true
    return includesAny(haystack, [
      'superstructure',
      'tower',
      '主体',
    ])
  }

  if (nodeId.includes('outdoor_site') || nodeId.includes('outdoor')) {
    if (isHandoffCarrier) return false
    return includesAny(haystack, [
      'outdoor',
      'site',
      'municipal',
      'road',
      'landscape',
      '总平',
      '室外',
      '市政',
      '道路',
      '园林',
      '景观',
      'out-',
    ])
  }

  const explicitPhase = (() => {
    if (!executionPhase) return null
    if (executionPhase.includes('foundation') || executionPhase.includes('pile')) return 'foundation'
    if (executionPhase.includes('earthwork') || executionPhase.includes('excavat') || executionPhase.includes('pit')) return 'earthwork'
    if (executionPhase.includes('basement')) return 'basement'
    if (executionPhase.includes('superstructure') || executionPhase.includes('structure') || executionPhase.includes('tower')) return 'tower'
    if (executionPhase.includes('outdoor') || executionPhase.includes('municipal') || executionPhase.includes('landscape') || executionPhase.includes('site')) return 'outdoor'
    if (executionPhase.includes('handoff') || executionPhase.includes('acceptance') || executionPhase.includes('commission')) return 'handoff'
    return null
  })()
  if (explicitPhase) return explicitPhase === phase
  if (phase === 'foundation') {
    return haystack.includes('foundation')
      || haystack.includes('pile')
      || haystack.includes('桩')
      || haystack.includes('基础')
      || coarseFoundationPackage
  }
  if (phase === 'earthwork') {
    return coarseFoundationPackage
      || haystack.includes('earthwork')
      || haystack.includes('pit')
      || haystack.includes('excavat')
      || haystack.includes('土方')
      || haystack.includes('基坑')
  }
  if (phase === 'basement') {
    return coarseFoundationPackage
      || haystack.includes('basement')
      || haystack.includes('地下')
      || haystack.includes('人防')
  }
  if (phase === 'tower') {
    return coarseStructurePackage
      || haystack.includes('superstructure')
      || haystack.includes('structure')
      || haystack.includes('tower')
      || haystack.includes('主体')
      || haystack.includes('结构')
  }
  if (phase === 'outdoor') {
    return haystack.includes('outdoor')
      || haystack.includes('municipal')
      || haystack.includes('landscape')
      || haystack.includes('site')
      || haystack.includes('总平')
      || haystack.includes('室外')
      || haystack.includes('市政')
      || haystack.includes('道路')
      || haystack.includes('园林')
      || haystack.includes('景观')
      || haystack.includes('out-')
  }
  return haystack.includes('handoff')
    || haystack.includes('acceptance')
    || haystack.includes('commission')
    || haystack.includes('移交')
    || haystack.includes('验收')
}

function spanDays(rows: ConstructionOrganizationGeneratedRowProjectionInputRow[]) {
  const starts = rows.map((row) => row.plannedStartDate).filter((date): date is string => Boolean(date))
  const ends = rows.map((row) => row.plannedEndDate).filter((date): date is string => Boolean(date))
  const firstStart = starts.sort()[0]
  const lastEnd = ends.sort().at(-1)
  return inclusiveDurationDays(firstStart, lastEnd) ?? 0
}

function dateDay(value: string | null | undefined) {
  return signedDurationDayDelta('1970-01-01', value)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readDurationSuggestionNumber(value: unknown, keys: string[]) {
  const record = readRecord(value)
  for (const key of keys) {
    const parsed = readPositiveNumber(record[key])
    if (parsed != null) return parsed
  }
  return null
}

function readGeneratedRowPlanReferenceDays(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  return readPositiveNumber(row.smartReferenceDays)
    ?? readDurationSuggestionNumber(row.durationSuggestion, ['planReferenceDays', 'contextualReferenceDays', 'recommendedDurationDays'])
}

function readGeneratedRowPlanWindowFallbackDays(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  return inclusiveDurationDays(row.plannedStartDate, row.plannedEndDate)
}

function readGeneratedRowContextualReferenceDays(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  return readDurationSuggestionNumber(row.durationSuggestion, ['contextualReferenceDays'])
}

function readGeneratedRowRecommendedDurationDays(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  return readDurationSuggestionNumber(row.durationSuggestion, ['recommendedDurationDays'])
}

function readGeneratedRowDurationDays(row: ConstructionOrganizationGeneratedRowProjectionInputRow) {
  const start = row.plannedStartDate
  const end = row.plannedEndDate
  return inclusiveDurationDays(start, end) ?? readGeneratedRowPlanReferenceDays(row) ?? 1
}

function selectRepresentativeRowsForVirtualNode(
  rows: ConstructionOrganizationGeneratedRowProjectionInputRow[],
) {
  return [...rows]
    .sort((left, right) => {
      const leftStart = dateDay(left.plannedStartDate) ?? Number.MAX_SAFE_INTEGER
      const rightStart = dateDay(right.plannedStartDate) ?? Number.MAX_SAFE_INTEGER
      if (leftStart !== rightStart) return leftStart - rightStart
      const leftEnd = dateDay(left.plannedEndDate) ?? Number.MAX_SAFE_INTEGER
      const rightEnd = dateDay(right.plannedEndDate) ?? Number.MAX_SAFE_INTEGER
      if (leftEnd !== rightEnd) return leftEnd - rightEnd
      return normalizeText(left.stableCode).localeCompare(normalizeText(right.stableCode), 'zh-Hans-CN')
        || normalizeText(left.id).localeCompare(normalizeText(right.id), 'zh-Hans-CN')
    })
    .slice(0, 2)
}

function phaseWindow(rows: ConstructionOrganizationGeneratedRowProjectionInputRow[]) {
  const starts = rows.map((row) => dateDay(row.plannedStartDate)).filter((day): day is number => Number.isFinite(day))
  const finishes = rows.map((row) => dateDay(row.plannedEndDate)).filter((day): day is number => Number.isFinite(day))
  if (starts.length === 0 || finishes.length === 0) return null
  return {
    startDay: Math.min(...starts),
    finishDay: Math.max(...finishes),
  }
}

function buildPhaseWindows(
  rows: ConstructionOrganizationGeneratedRowProjectionInputRow[],
  matchedRowIdsByPhase: Map<ConstructionOrganizationVirtualNetworkNode['phase'], string[]>,
) {
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const windows = new Map<ConstructionOrganizationVirtualNetworkNode['phase'], { startDay: number, finishDay: number }>()
  for (const [phase, rowIds] of matchedRowIdsByPhase.entries()) {
    const rowsForPhase = rowIds.map((rowId) => rowById.get(rowId)).filter((row): row is ConstructionOrganizationGeneratedRowProjectionInputRow => Boolean(row))
    const window = phaseWindow(rowsForPhase)
    if (window) windows.set(phase, window)
  }
  return windows
}

function sumNullable(values: Array<number | null>) {
  const finiteValues = values.filter((value): value is number => Number.isFinite(value))
  return finiteValues.length > 0
    ? finiteValues.reduce((sum, value) => sum + value, 0)
    : null
}

function buildGeneratedRowReferenceDurationEvidence(params: {
  rowById: Map<string, ConstructionOrganizationGeneratedRowProjectionInputRow>
  matchedRowIdsByPhase: Map<ConstructionOrganizationVirtualNetworkNode['phase'], string[]>
  phaseWindows: Map<ConstructionOrganizationVirtualNetworkNode['phase'], { startDay: number, finishDay: number }>
}): ConstructionOrganizationGeneratedRowProjection['generatedRowReferenceDurationEvidence'] {
  const phaseDurations: NonNullable<ConstructionOrganizationGeneratedRowProjection['generatedRowReferenceDurationEvidence']>['phaseDurations'] = []

  for (const [phase, rowIds] of params.matchedRowIdsByPhase.entries()) {
    const rows = uniqueStrings(rowIds)
      .map((rowId) => params.rowById.get(rowId))
      .filter((row): row is ConstructionOrganizationGeneratedRowProjectionInputRow => Boolean(row))
    const explicitPlanReferenceDays = sumNullable(rows.map(readGeneratedRowPlanReferenceDays))
    const planWindowFallbackDays = sumNullable(rows.map(readGeneratedRowPlanWindowFallbackDays))
    const planReferenceDays = explicitPlanReferenceDays ?? planWindowFallbackDays
    const contextualReferenceDays = sumNullable(rows.map(readGeneratedRowContextualReferenceDays))
    const recommendedDurationDays = sumNullable(rows.map(readGeneratedRowRecommendedDurationDays))
    if (planReferenceDays == null && contextualReferenceDays == null && recommendedDurationDays == null) continue
    const window = params.phaseWindows.get(phase)
    phaseDurations.push({
      phase,
      generatedRowIds: uniqueStrings(rows.map((row) => row.id)),
      planReferenceDays,
      contextualReferenceDays,
      recommendedDurationDays,
      plannedSpanDays: window
        ? Math.max(1, window.finishDay - window.startDay + 1)
        : null,
      durationEvidenceSource: explicitPlanReferenceDays != null
        ? 'generated_row_reference_duration_metadata'
        : 'generated_row_planned_window_fallback',
    })
  }

  const matchedReferenceRowIds = new Set<string>()
  for (const phaseDuration of phaseDurations) {
    for (const rowId of phaseDuration.generatedRowIds) matchedReferenceRowIds.add(rowId)
  }

  return {
    source: 'generated_wbs_row_reference_duration_projection',
    durationBasis: 'generated_row_plan_dates_and_plan_reference_days',
    matchedReferenceRowCount: matchedReferenceRowIds.size,
    totalPlanReferenceDays: sumNullable(phaseDurations.map((item) => item.planReferenceDays)),
    totalContextualReferenceDays: sumNullable(phaseDurations.map((item) => item.contextualReferenceDays)),
    totalRecommendedDurationDays: sumNullable(phaseDurations.map((item) => item.recommendedDurationDays)),
    phaseDurations,
    writesReferenceDuration: false,
    writesPlanDates: false,
    writesSeed: false,
  }
}

function buildGeneratedRowNetworkEvaluation(params: {
  rowById: Map<string, ConstructionOrganizationGeneratedRowProjectionInputRow>
  matchedRowIdsByNode: Map<string, string[]>
  candidateDependencyPreview: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateDependencyPreview']>
}) {
  const nodes = [...params.rowById.values()].map((row) => {
    const startDay = Math.max(0, dateDay(row.plannedStartDate))
    const durationDays = readGeneratedRowDurationDays(row)
    return {
      generatedRowId: row.id,
      startDay,
      finishDay: startDay + durationDays,
      durationDays,
      totalFloatDays: 0,
      isCritical: true,
    }
  })

  const rowById = params.rowById
  const nodeById = new Map(nodes.map((node) => [node.generatedRowId, node]))
  const earliestStart = new Map(nodes.map((node) => [node.generatedRowId, node.startDay]))

  const previewEdges = params.candidateDependencyPreview.previewEdges
  const mappedPreviewEdges = previewEdges.flatMap((edge) => {
    const fromIds = edge.fromGeneratedRowIds.filter((rowId) => rowById.has(rowId))
    const toIds = edge.toGeneratedRowIds.filter((rowId) => rowById.has(rowId))
    return fromIds.flatMap((fromGeneratedRowId) => toIds.map((toGeneratedRowId) => ({
      fromGeneratedRowId,
      toGeneratedRowId,
      dependencyType: edge.dependencyType,
      lagDays: edge.lagDays,
    })))
  })

  for (let pass = 0; pass < Math.max(1, nodes.length); pass += 1) {
    let changed = false
    for (const edge of mappedPreviewEdges) {
      const from = nodeById.get(edge.fromGeneratedRowId)
      const to = nodeById.get(edge.toGeneratedRowId)
      if (!from || !to) continue
      const fromStart = earliestStart.get(from.generatedRowId) ?? from.startDay
      const requiredStart = edge.dependencyType === 'SS'
        ? fromStart + edge.lagDays
        : fromStart + from.durationDays + edge.lagDays
      if (requiredStart > (earliestStart.get(to.generatedRowId) ?? to.startDay)) {
        earliestStart.set(to.generatedRowId, requiredStart)
        changed = true
      }
    }
    if (!changed) break
  }

  const latestStart = new Map(nodes.map((node) => [node.generatedRowId, Math.max(0, node.startDay)]))
  const projectedNetworkSpanDays = Math.max(
    1,
    ...nodes.map((node) => (earliestStart.get(node.generatedRowId) ?? node.startDay) + node.durationDays),
  ) - Math.min(...nodes.map((node) => node.startDay))

  for (let pass = 0; pass < Math.max(1, nodes.length); pass += 1) {
    let changed = false
    for (const edge of [...mappedPreviewEdges].reverse()) {
      const from = nodeById.get(edge.fromGeneratedRowId)
      const to = nodeById.get(edge.toGeneratedRowId)
      if (!from || !to) continue
      const toLatestStart = latestStart.get(to.generatedRowId) ?? to.startDay
      const requiredLatestStart = edge.dependencyType === 'SS'
        ? toLatestStart - edge.lagDays
        : toLatestStart - from.durationDays - edge.lagDays
      if (requiredLatestStart < (latestStart.get(from.generatedRowId) ?? projectedNetworkSpanDays)) {
        latestStart.set(from.generatedRowId, requiredLatestStart)
        changed = true
      }
    }
    if (!changed) break
  }

  const rowSchedule = nodes
    .map((node) => {
      const startDay = Math.max(0, Math.round(earliestStart.get(node.generatedRowId) ?? node.startDay))
      const finishDay = startDay + node.durationDays
      const totalFloatDays = Math.max(0, Math.round((latestStart.get(node.generatedRowId) ?? startDay) - startDay))
      return {
        ...node,
        startDay,
        finishDay,
        totalFloatDays,
        isCritical: totalFloatDays <= 0,
      }
    })
    .sort((left, right) => left.startDay - right.startDay || left.finishDay - right.finishDay || left.generatedRowId.localeCompare(right.generatedRowId))

  const criticalGeneratedRowIds = rowSchedule.filter((node) => node.isCritical).map((node) => node.generatedRowId)
  const mappedEdgeCount = mappedPreviewEdges.length
  const materializationStatus: NonNullable<ConstructionOrganizationGeneratedRowProjection['generatedRowNetworkEvaluation']>['materializationStatus'] = mappedEdgeCount === 0
    ? 'no_mapped_edges'
    : params.candidateDependencyPreview.unresolvedEdges.length === 0
      ? 'fully_mapped_read_only'
      : 'partial_mapping_read_only'

  return {
    source: 'generated_wbs_row_candidate_network_cpm' as const,
    networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges' as const,
    projectedNetworkSpanDays,
    previewEdgeCount: previewEdges.length,
    unresolvedEdgeCount: params.candidateDependencyPreview.unresolvedEdges.length,
    criticalGeneratedRowIds,
    materializationStatus,
    rowSchedule,
    writesTaskDependencies: false as const,
    writesPlanDates: false as const,
    writesCriticalPathFacts: false as const,
  }
}

function scoreGeneratedRowDependencyAlignment(
  option: ConstructionOrganizationPlanOption,
  phaseWindows: Map<ConstructionOrganizationVirtualNetworkNode['phase'], { startDay: number, finishDay: number }>,
) {
  let score = 0
  let evaluated = 0
  const sharedBasement = phaseWindows.get('basement')
  const tower = phaseWindows.get('tower')
  const foundation = phaseWindows.get('foundation')
  const earthwork = phaseWindows.get('earthwork')
  const selected = new Set(option.selectedScenarioIds)

  if (foundation && earthwork) {
    evaluated += 1
    if (selected.has('pile_before_excavation')) {
      score += foundation.startDay <= earthwork.startDay ? 1 : -1
    } else if (selected.has('excavation_before_pile')) {
      score += earthwork.startDay <= foundation.startDay ? 1 : -1
    }
  }

  if (sharedBasement && tower) {
    evaluated += 1
    if (selected.has('tower_lane_early_release_after_core_basement')) {
      const towerStartsBeforeBasementTail = tower.startDay < sharedBasement.finishDay
      score += towerStartsBeforeBasementTail ? 1 : -1
    } else if (selected.has('shared_basement_first_then_tower')) {
      const towerStartsAfterBasementRelease = tower.startDay >= sharedBasement.finishDay
      score += towerStartsAfterBasementRelease ? 1 : -1
    }
  }

  if (evaluated === 0) return 0
  return Math.round((score / evaluated) * 1000) / 1000
}

function buildCandidateMaterializationReadiness(params: {
  projectionConfidence: ConstructionOrganizationGeneratedRowProjection['projectionConfidence']
  previewEdgeCount: number
  unresolvedEdgeCount: number
}): NonNullable<NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateDependencyPreview']>['materializationReadiness']> {
  const hasPreviewEdges = params.previewEdgeCount > 0
  const hasUnresolvedEdges = params.unresolvedEdgeCount > 0
  const readiness = !hasPreviewEdges || params.projectionConfidence === 'low'
    ? 'evidence_only'
    : hasUnresolvedEdges
      ? 'needs_generated_row_carrier'
      : 'ready_for_manual_materialization_preview'
  const reasons = [
    hasPreviewEdges ? null : 'no_preview_edges_available',
    params.projectionConfidence === 'low' ? 'low_projection_confidence' : null,
    hasUnresolvedEdges ? 'unresolved_virtual_dependency_edges' : null,
    !hasUnresolvedEdges && hasPreviewEdges && params.projectionConfidence !== 'low'
      ? 'all_virtual_dependency_edges_have_generated_row_carriers'
      : null,
  ].filter((item): item is string => Boolean(item))

  return {
    source: 'construction_organization_candidate_materialization_readiness' as const,
    readiness,
    reasons,
    previewEdgeCount: params.previewEdgeCount,
    unresolvedEdgeCount: params.unresolvedEdgeCount,
    writesTaskDependencies: false as const,
    writesPlanDates: false as const,
    writesCriticalPathFacts: false as const,
  }
}

function isTerminalHandoffVirtualDependencyGap(input: {
  toVirtualNodeId: string
  fromGeneratedRowIds: string[]
  toGeneratedRowIds: string[]
}) {
  return input.toVirtualNodeId.includes('handoff')
    && input.fromGeneratedRowIds.length > 0
    && input.toGeneratedRowIds.length === 0
}

function generatedRowWindow(
  rowIds: string[],
  rowById: Map<string, ConstructionOrganizationGeneratedRowProjectionInputRow>,
) {
  const rows = rowIds.map((rowId) => rowById.get(rowId)).filter((row): row is ConstructionOrganizationGeneratedRowProjectionInputRow => Boolean(row))
  return phaseWindow(rows)
}

function generatedRowWindowEvidence(
  rowId: string,
  rowById: Map<string, ConstructionOrganizationGeneratedRowProjectionInputRow>,
  fallbackWindow: { startDay: number, finishDay: number },
) {
  const row = rowById.get(rowId)
  return {
    startDay: fallbackWindow.startDay,
    finishDay: fallbackWindow.finishDay,
    plannedStartDate: row?.plannedStartDate ?? null,
    plannedEndDate: row?.plannedEndDate ?? null,
  }
}

function buildViolationEvidenceForPreviewEdge(params: {
  edge: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateDependencyPreview']>['previewEdges'][number]
  rowById: Map<string, ConstructionOrganizationGeneratedRowProjectionInputRow>
  fromWindow: { startDay: number, finishDay: number }
  toWindow: { startDay: number, finishDay: number }
  reason: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateMaterializationEvaluation']>['violationDetails'][number]['reason']
}) {
  const details: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateMaterializationEvaluation']>['violationDetails'] = []
  const seen = new Set<string>()
  for (const fromGeneratedRowId of params.edge.fromGeneratedRowIds) {
    for (const toGeneratedRowId of params.edge.toGeneratedRowIds) {
      if (!fromGeneratedRowId || !toGeneratedRowId || fromGeneratedRowId === toGeneratedRowId) continue
      const key = [
        fromGeneratedRowId,
        toGeneratedRowId,
        params.edge.dependencyType,
        params.edge.lagDays,
        params.edge.intent,
        params.reason,
      ].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      details.push({
        edgeId: key,
        fromGeneratedRowId,
        toGeneratedRowId,
        fromVirtualNodeId: params.edge.fromVirtualNodeId,
        toVirtualNodeId: params.edge.toVirtualNodeId,
        dependencyType: params.edge.dependencyType,
        lagDays: params.edge.lagDays,
        intent: params.edge.intent,
        reason: params.reason,
        fromWindow: generatedRowWindowEvidence(fromGeneratedRowId, params.rowById, params.fromWindow),
        toWindow: generatedRowWindowEvidence(toGeneratedRowId, params.rowById, params.toWindow),
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
      })
    }
  }
  return details
}

function buildCandidateMaterializationEvaluation(params: {
  candidateDependencyPreview: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateDependencyPreview']>
  generatedScheduleSpanDays: number
  rowById: Map<string, ConstructionOrganizationGeneratedRowProjectionInputRow>
}): NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateMaterializationEvaluation']> {
  const violationDetails: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateMaterializationEvaluation']>['violationDetails'] = []
  let satisfiedEdgeCount = 0

  for (const edge of params.candidateDependencyPreview.previewEdges) {
    const fromWindow = generatedRowWindow(edge.fromGeneratedRowIds, params.rowById)
    const toWindow = generatedRowWindow(edge.toGeneratedRowIds, params.rowById)
    if (!fromWindow || !toWindow) continue

    if (edge.dependencyType === 'FS') {
      const satisfies = toWindow.startDay >= fromWindow.finishDay + edge.lagDays
      if (satisfies) {
        satisfiedEdgeCount += 1
      } else {
        violationDetails.push(...buildViolationEvidenceForPreviewEdge({
          edge,
          rowById: params.rowById,
          fromWindow,
          toWindow,
          reason: 'fs_predecessor_finishes_after_successor_start',
        }))
      }
      continue
    }

    const satisfies = toWindow.startDay >= fromWindow.startDay + edge.lagDays
    if (satisfies) {
      satisfiedEdgeCount += 1
    } else {
      violationDetails.push(...buildViolationEvidenceForPreviewEdge({
        edge,
        rowById: params.rowById,
        fromWindow,
        toWindow,
        reason: 'ss_predecessor_starts_after_successor_start',
      }))
    }
  }

  const previewEdgeCount = params.candidateDependencyPreview.previewEdges.length
  const unresolvedEdgeCount = params.candidateDependencyPreview.unresolvedEdges.length
  const violatedEdgeCount = violationDetails.length
  const denominator = Math.max(1, previewEdgeCount + unresolvedEdgeCount)
  const materializationScore = Math.max(0, Math.min(1, (satisfiedEdgeCount - violatedEdgeCount * 1.5) / denominator))

  return {
    source: 'construction_organization_candidate_materialization_evaluation' as const,
    materializationBasis: 'preview_edges_checked_against_generated_wbs_row_dates' as const,
    previewEdgeCount,
    satisfiedEdgeCount,
    violatedEdgeCount,
    unresolvedEdgeCount,
    materializedNetworkSpanDays: params.generatedScheduleSpanDays,
    materializationScore: Math.round(materializationScore * 1000) / 1000,
    violationDetails,
    writesTaskDependencies: false as const,
    writesPlanDates: false as const,
    writesCriticalPathFacts: false as const,
  }
}

function buildMaterializationDecision(params: {
  candidateDependencyPreview: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateDependencyPreview']>
  candidateMaterializationEvaluation: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateMaterializationEvaluation']>
}): NonNullable<ConstructionOrganizationGeneratedRowProjection['materializationDecision']> {
  const readiness = params.candidateDependencyPreview.materializationReadiness
  const reasons = new Set<string>(readiness.reasons)
  if (params.candidateMaterializationEvaluation.violatedEdgeCount > 0) {
    reasons.add('candidate_preview_edges_violate_generated_row_dates')
  }
  if (params.candidateMaterializationEvaluation.unresolvedEdgeCount > 0) {
    reasons.add('candidate_preview_edges_unresolved')
  }

  const decision = params.candidateMaterializationEvaluation.violatedEdgeCount > 0
    ? 'blocked_by_violations'
    : readiness.readiness === 'ready_for_manual_materialization_preview'
      ? 'ready_for_manual_materialization'
      : readiness.readiness === 'needs_generated_row_carrier'
        ? 'needs_generated_row_carrier'
        : 'evidence_only'

  return {
    source: 'construction_organization_candidate_materialization_decision' as const,
    decision,
    allowManualMaterialization: decision === 'ready_for_manual_materialization',
    reasons: [...reasons],
    writesTaskDependencies: false as const,
    writesPlanDates: false as const,
    writesCriticalPathFacts: false as const,
  }
}

function buildMaterializationReviewPackage(params: {
  optionId: string
  candidateDependencyPreview: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateDependencyPreview']>
  candidateMaterializationEvaluation: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateMaterializationEvaluation']>
  materializationDecision: NonNullable<ConstructionOrganizationGeneratedRowProjection['materializationDecision']>
}): NonNullable<ConstructionOrganizationGeneratedRowProjection['materializationReviewPackage']> {
  const status: NonNullable<ConstructionOrganizationGeneratedRowProjection['materializationReviewPackage']>['status'] =
    params.materializationDecision.decision === 'ready_for_manual_materialization'
      ? 'ready_for_manual_review'
      : params.materializationDecision.decision
  const proposedDependencyEdges: NonNullable<ConstructionOrganizationGeneratedRowProjection['materializationReviewPackage']>['proposedDependencyEdges'] = []
  const seen = new Set<string>()

  for (const edge of params.candidateDependencyPreview.previewEdges) {
    for (const fromGeneratedRowId of edge.fromGeneratedRowIds) {
      for (const toGeneratedRowId of edge.toGeneratedRowIds) {
        if (!fromGeneratedRowId || !toGeneratedRowId || fromGeneratedRowId === toGeneratedRowId) continue
        const key = [
          fromGeneratedRowId,
          toGeneratedRowId,
          edge.dependencyType,
          edge.lagDays,
          edge.intent,
        ].join('|')
        if (seen.has(key)) continue
        seen.add(key)
        proposedDependencyEdges.push({
          fromGeneratedRowId,
          toGeneratedRowId,
          dependencyType: edge.dependencyType,
          lagDays: edge.lagDays,
          intent: edge.intent,
          fromVirtualNodeId: edge.fromVirtualNodeId,
          toVirtualNodeId: edge.toVirtualNodeId,
          operation: 'propose_create_dependency',
          writesTaskDependencies: false,
        })
      }
    }
  }

  return {
    source: 'construction_organization_candidate_materialization_review_package',
    packageBasis: 'manual_review_package_from_generated_row_preview_edges',
    optionId: params.optionId,
    status,
    allowManualReview: params.materializationDecision.allowManualMaterialization && proposedDependencyEdges.length > 0,
    proposedDependencyEdgeCount: proposedDependencyEdges.length,
    blockedReasons: params.materializationDecision.reasons,
    proposedDependencyEdges,
    conflictEvidence: params.candidateMaterializationEvaluation.violationDetails,
    reviewRequired: true,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
  }
}

function attachProjectionToOption(
  option: ConstructionOrganizationPlanOption,
  projection: ConstructionOrganizationGeneratedRowProjection,
): ConstructionOrganizationPlanOption {
  return {
    ...option,
    evaluation: {
      ...option.evaluation,
      generatedRowProjection: projection,
    },
  }
}

export function projectConstructionOrganizationPlanOptionToGeneratedRows(
  option: ConstructionOrganizationPlanOption,
  rows: ConstructionOrganizationGeneratedRowProjectionInputRow[],
): ConstructionOrganizationGeneratedRowProjection {
  const scheduleRows = rows.filter(rowIsScheduleCarrier)
  const rowById = new Map(scheduleRows.map((row) => [row.id, row]))
  const matchedRowIdsByPhase = new Map<ConstructionOrganizationVirtualNetworkNode['phase'], string[]>()
  const nodesByPhase = new Map<ConstructionOrganizationVirtualNetworkNode['phase'], string[]>()
  const matchedRowIdsByNode = new Map<string, string[]>()
  const unmappedNodeIds: string[] = []

  for (const node of option.combinedVirtualNetwork.nodes) {
    const nodeIds = nodesByPhase.get(node.phase) ?? []
    nodeIds.push(node.id)
    nodesByPhase.set(node.phase, nodeIds)

    const matchingRows = selectRepresentativeRowsForVirtualNode(
      scheduleRows.filter((row) => rowMatchesVirtualPhase(row, node.phase, node.id)),
    )
    const rowIds = uniqueStrings(matchingRows.map((row) => row.id))
    if (rowIds.length === 0) {
      unmappedNodeIds.push(node.id)
      continue
    }
    matchedRowIdsByNode.set(node.id, rowIds)
    matchedRowIdsByPhase.set(node.phase, uniqueStrings([
      ...(matchedRowIdsByPhase.get(node.phase) ?? []),
      ...rowIds,
    ]))
  }

  const generatedRowIds = uniqueStrings([...matchedRowIdsByPhase.values()].flat())
  const phaseWindows = buildPhaseWindows(scheduleRows, matchedRowIdsByPhase)
  const generatedScheduleSpanDays = spanDays(scheduleRows)
  const virtualProjectDurationDays = option.evaluation.networkEvaluation.projectDurationDays
  const mappedNodeCount = option.combinedVirtualNetwork.nodes.length - unmappedNodeIds.length
  const nodeCoverageRatio = option.combinedVirtualNetwork.nodes.length > 0
    ? mappedNodeCount / option.combinedVirtualNetwork.nodes.length
    : 0
  const projectionConfidence = nodeCoverageRatio >= 0.8 && generatedRowIds.length >= 4
    ? 'high'
    : nodeCoverageRatio >= 0.5 && generatedRowIds.length >= 2
      ? 'medium'
      : 'low'
  const gapReasons = [
    unmappedNodeIds.length > 0 ? 'virtual_nodes_without_generated_row_carrier' : null,
    generatedScheduleSpanDays <= 0 ? 'generated_schedule_span_unavailable' : null,
  ].filter((item): item is string => Boolean(item))
  const dependencyAlignmentScore = scoreGeneratedRowDependencyAlignment(option, phaseWindows)
  const generatedRowReferenceDurationEvidence = buildGeneratedRowReferenceDurationEvidence({
    rowById,
    matchedRowIdsByPhase,
    phaseWindows,
  })
  const previewEdges: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateDependencyPreview']>['previewEdges'] = []
  const unresolvedEdges: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateDependencyPreview']>['unresolvedEdges'] = []
  let terminalHandoffEvidenceOnlyEdgeCount = 0

  for (const dependency of option.combinedVirtualNetwork.dependencies) {
    const fromGeneratedRowIds = matchedRowIdsByNode.get(dependency.fromNodeId) ?? []
    const toGeneratedRowIds = matchedRowIdsByNode.get(dependency.toNodeId) ?? []
    if (fromGeneratedRowIds.length === 0 || toGeneratedRowIds.length === 0) {
      if (isTerminalHandoffVirtualDependencyGap({
        toVirtualNodeId: dependency.toNodeId,
        fromGeneratedRowIds,
        toGeneratedRowIds,
      })) {
        terminalHandoffEvidenceOnlyEdgeCount += 1
        continue
      }
      unresolvedEdges.push({
        fromVirtualNodeId: dependency.fromNodeId,
        toVirtualNodeId: dependency.toNodeId,
        dependencyType: dependency.dependencyType,
        lagDays: dependency.lagDays,
        intent: dependency.intent,
        reason: fromGeneratedRowIds.length === 0
          ? 'missing_from_generated_row_carrier'
          : 'missing_to_generated_row_carrier',
      })
      continue
    }
    const crossRowPairs = fromGeneratedRowIds.flatMap((fromGeneratedRowId) => (
      toGeneratedRowIds
        .filter((toGeneratedRowId) => toGeneratedRowId !== fromGeneratedRowId)
        .map((toGeneratedRowId) => ({ fromGeneratedRowId, toGeneratedRowId }))
    ))
    if (crossRowPairs.length === 0) continue

    previewEdges.push({
      fromVirtualNodeId: dependency.fromNodeId,
      toVirtualNodeId: dependency.toNodeId,
      fromGeneratedRowIds: uniqueStrings(crossRowPairs.map((pair) => pair.fromGeneratedRowId)),
      toGeneratedRowIds: uniqueStrings(crossRowPairs.map((pair) => pair.toGeneratedRowId)),
      dependencyType: dependency.dependencyType,
      lagDays: dependency.lagDays,
      intent: dependency.intent,
      materializationStatus: 'preview_only',
      writesTaskDependencies: false,
    })
  }

  const candidateDependencyPreview = {
    source: 'construction_organization_candidate_dependency_preview' as const,
    previewBasis: 'virtual_dependency_edges_mapped_to_generated_wbs_row_carriers' as const,
    materializationReadiness: buildCandidateMaterializationReadiness({
      projectionConfidence,
      previewEdgeCount: previewEdges.length,
      unresolvedEdgeCount: unresolvedEdges.length,
    }),
    previewEdges,
    unresolvedEdges,
    writesTaskDependencies: false as const,
    writesPlanDates: false as const,
    writesCriticalPathFacts: false as const,
  }
  const generatedRowNetworkEvaluation = buildGeneratedRowNetworkEvaluation({
    rowById,
    matchedRowIdsByNode,
    candidateDependencyPreview,
  })
  const candidateMaterializationEvaluation = buildCandidateMaterializationEvaluation({
    candidateDependencyPreview,
    generatedScheduleSpanDays,
    rowById,
  })
  const materializationDecision = buildMaterializationDecision({
    candidateDependencyPreview,
    candidateMaterializationEvaluation,
  })

  return {
    source: 'construction_organization_plan_option_generated_row_projection',
    optionId: option.optionId,
    projectionBasis: 'generated_wbs_rows_mapped_to_virtual_plan_option_nodes',
    generatedScheduleSpanDays,
    virtualProjectDurationDays,
    spanDeltaDays: generatedScheduleSpanDays - virtualProjectDurationDays,
    dependencyAlignmentScore,
    projectionConfidence,
    mappedNodeCount,
    generatedRowMatchCount: generatedRowIds.length,
    unmappedNodeIds,
    phaseCoverage: [...nodesByPhase.entries()].map(([phase, virtualNodeIds]) => {
      const generatedPhaseRowIds = matchedRowIdsByPhase.get(phase) ?? []
      return {
        phase,
        virtualNodeIds,
        generatedRowIds: generatedPhaseRowIds,
        generatedRowCount: generatedPhaseRowIds.length,
      }
    }),
    candidateDependencyPreview,
    candidateMaterializationEvaluation,
    materializationDecision,
    materializationReviewPackage: buildMaterializationReviewPackage({
      optionId: option.optionId,
      candidateDependencyPreview,
      candidateMaterializationEvaluation,
      materializationDecision,
    }),
    generatedRowReferenceDurationEvidence,
    generatedRowNetworkEvaluation,
    gapReasons: generatedRowReferenceDurationEvidence.matchedReferenceRowCount > 0
      ? Array.from(new Set([
          ...gapReasons,
          'generated_row_reference_duration_projection_attached',
          terminalHandoffEvidenceOnlyEdgeCount > 0
            ? 'terminal_handoff_virtual_edges_kept_as_evidence_without_generated_row_carrier'
            : null,
        ].filter((item): item is string => Boolean(item))))
      : gapReasons,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
  }
}

function projectionAwareScore(option: ConstructionOrganizationPlanOption) {
  const projection = option.evaluation.generatedRowProjection
  const alignment = projection?.dependencyAlignmentScore ?? 0
  const materializationScore = projection?.candidateMaterializationEvaluation?.materializationScore ?? 0
  const violationPenalty = projection?.candidateMaterializationEvaluation?.violatedEdgeCount
    ? projection.candidateMaterializationEvaluation.violatedEdgeCount * 16
    : 0
  const confidenceBonus = projection?.projectionConfidence === 'high'
    ? 6
    : projection?.projectionConfidence === 'medium'
      ? 3
      : 0
  const coveragePenalty = projection ? projection.unmappedNodeIds.length * 2 : 0
  return option.combinedScore + alignment * 18 + materializationScore * 12 + confidenceBonus - coveragePenalty - violationPenalty
}

function projectionAwareAccelerationRecoverableDays(option: ConstructionOrganizationPlanOption) {
  const projection = option.evaluation.generatedRowProjection
  const baselineRecoverable = option.evaluation.networkEvaluation.e5RecoverableSpanDays
  if (!projection?.generatedRowNetworkEvaluation) return baselineRecoverable
  const violationPenalty = projection.candidateMaterializationEvaluation?.violatedEdgeCount
    ? projection.candidateMaterializationEvaluation.violatedEdgeCount * 4
    : 0
  const unresolvedPenalty = projection.generatedRowNetworkEvaluation.unresolvedEdgeCount * 2
  return Math.max(0, Math.round(baselineRecoverable - violationPenalty - unresolvedPenalty))
}

function projectionAwareAccelerationScore(option: ConstructionOrganizationPlanOption) {
  const projection = option.evaluation.generatedRowProjection
  const projectedRecoverable = projectionAwareAccelerationRecoverableDays(option)
  const materializationScore = projection?.candidateMaterializationEvaluation?.materializationScore ?? 0
  const networkSpan = projection?.generatedRowNetworkEvaluation?.projectedNetworkSpanDays
    ?? option.evaluation.networkEvaluation.projectDurationDays
  const spanPenalty = Math.min(30, networkSpan / 30)
  const violationPenalty = projection?.candidateMaterializationEvaluation?.violatedEdgeCount
    ? projection.candidateMaterializationEvaluation.violatedEdgeCount * 24
    : 0
  const unresolvedPenalty = projection?.generatedRowNetworkEvaluation?.unresolvedEdgeCount
    ? projection.generatedRowNetworkEvaluation.unresolvedEdgeCount * 8
    : 0
  return Math.round((
    projectionAwareScore(option)
    + projectedRecoverable * 1.2
    + materializationScore * 16
    + (option.evaluation.recoveryFactorHint - 1) * 500
    - spanPenalty
    - violationPenalty
    - unresolvedPenalty
  ) * 100) / 100
}

function selectProjectedAccelerationRecoveryOption(options: ConstructionOrganizationPlanOption[]) {
  return [...options].sort((left, right) => {
    const scoreDelta = projectionAwareAccelerationScore(right) - projectionAwareAccelerationScore(left)
    if (scoreDelta !== 0) return scoreDelta
    return projectionAwareScore(right) - projectionAwareScore(left)
  })[0] ?? options[0]
}

function buildProjectedPlanOptionMap(options: ConstructionOrganizationPlanOption[]) {
  const byOptionId = new Map<string, ConstructionOrganizationPlanOption>()
  for (const option of options) {
    if (!option.optionId || byOptionId.has(option.optionId)) continue
    byOptionId.set(option.optionId, option)
  }
  return byOptionId
}

function readEvaluationStatus(params: {
  referenceEvidence: ConstructionOrganizationGeneratedRowProjection['generatedRowReferenceDurationEvidence'] | null | undefined
  networkEvaluation: ConstructionOrganizationGeneratedRowProjection['generatedRowNetworkEvaluation'] | null | undefined
  useCaseEvaluation: NonNullable<ConstructionOrganizationPlanOption['evaluation']['useCaseEvaluations']>[keyof NonNullable<ConstructionOrganizationPlanOption['evaluation']['useCaseEvaluations']>] | null | undefined
}): ConstructionOrganizationPlanNetworkDraftRecommendationSummary['evaluationStatus'] {
  const evidenceCount = [
    params.referenceEvidence,
    params.networkEvaluation,
    params.useCaseEvaluation,
  ].filter(Boolean).length
  if (evidenceCount === 3) return 'evaluation_ready'
  if (evidenceCount > 0) return 'partial_evidence'
  return 'missing_evaluation_evidence'
}

function buildPlanNetworkDraftRecommendation(params: {
  recommendation: ConstructionOrganizationScenarioSelection['scenarioRecommendations'][keyof ConstructionOrganizationScenarioSelection['scenarioRecommendations']]
  option: ConstructionOrganizationPlanOption | null | undefined
  useCaseEvaluation: NonNullable<ConstructionOrganizationPlanOption['evaluation']['useCaseEvaluations']>[keyof NonNullable<ConstructionOrganizationPlanOption['evaluation']['useCaseEvaluations']>] | null | undefined
}): ConstructionOrganizationPlanNetworkDraftRecommendationSummary | null {
  const option = params.option
  if (!option) return null
  const projection = option.evaluation.generatedRowProjection
  const referenceEvidence = projection?.generatedRowReferenceDurationEvidence ?? null
  const networkEvaluation = projection?.generatedRowNetworkEvaluation ?? null
  const reviewPackage = projection?.materializationReviewPackage ?? null
  const decision = projection?.materializationDecision ?? null
  const useCaseEvaluation = params.useCaseEvaluation ?? null

  return {
    source: 'construction_organization_plan_network_draft_recommendation',
    useCase: params.recommendation.useCase,
    optionId: option.optionId,
    selectedScenarioIds: option.selectedScenarioIds,
    readiness: reviewPackage?.status
      ?? decision?.decision
      ?? (projection ? 'evidence_only' : 'missing_generated_row_projection'),
    evaluationStatus: readEvaluationStatus({
      referenceEvidence,
      networkEvaluation,
      useCaseEvaluation,
    }),
    materializationDecision: decision?.decision ?? null,
    proposedDependencyEdgeCount: reviewPackage?.proposedDependencyEdgeCount
      ?? projection?.candidateDependencyPreview?.previewEdges.length
      ?? 0,
    recommendationBasis: Array.from(new Set([
      ...params.recommendation.recommendationBasis,
      ...(useCaseEvaluation?.rankBasis ?? []),
      'projected_plan_network_draft_recommendation',
    ])),
    factCoverage: useCaseEvaluation?.factCoverage ?? null,
    e1: referenceEvidence
      ? {
          matchedReferenceRowCount: referenceEvidence.matchedReferenceRowCount,
          totalPlanReferenceDays: referenceEvidence.totalPlanReferenceDays,
          totalContextualReferenceDays: referenceEvidence.totalContextualReferenceDays,
          totalRecommendedDurationDays: referenceEvidence.totalRecommendedDurationDays,
          writesReferenceDuration: false,
          writesPlanDates: false,
          writesSeed: false,
        }
      : null,
    e3: networkEvaluation
      ? {
          projectedNetworkSpanDays: networkEvaluation.projectedNetworkSpanDays,
          previewEdgeCount: networkEvaluation.previewEdgeCount,
          unresolvedEdgeCount: networkEvaluation.unresolvedEdgeCount,
          criticalGeneratedRowIds: networkEvaluation.criticalGeneratedRowIds,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }
      : null,
    e5: useCaseEvaluation
      ? {
          optionScore: useCaseEvaluation.optionScore,
          recoveryFactorHint: useCaseEvaluation.recoveryFactorHint,
          e5RecoverableSpanDays: useCaseEvaluation.e5RecoverableSpanDays,
          actionability: useCaseEvaluation.actionability,
          writesAccelerationDraft: false,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
        }
      : null,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
  }
}

function buildPlanNetworkDraftRecommendations(params: {
  scenarioRecommendations: ConstructionOrganizationScenarioSelection['scenarioRecommendations']
  options: ConstructionOrganizationPlanOption[]
}) {
  const optionById = buildProjectedPlanOptionMap(params.options)
  const build = (
    key: keyof ConstructionOrganizationScenarioSelection['scenarioRecommendations'],
    evaluationKey: keyof NonNullable<ConstructionOrganizationPlanOption['evaluation']['useCaseEvaluations']>,
  ) => {
    const recommendation = params.scenarioRecommendations[key]
    const option = optionById.get(recommendation.optionId)
    return buildPlanNetworkDraftRecommendation({
      recommendation,
      option,
      useCaseEvaluation: option?.evaluation.useCaseEvaluations?.[evaluationKey] ?? null,
    })
  }

  return {
    newProjectPlanning: build('newProjectPlanning', 'newProjectPlanning'),
    startingLineOnboarding: build('startingLineOnboarding', 'startingLineOnboarding'),
    accelerationRecovery: build('accelerationRecovery', 'accelerationRecovery'),
  }
}

function refreshUseCaseEvaluation(
  evaluation: NonNullable<ConstructionOrganizationPlanOption['evaluation']['useCaseEvaluations']>[keyof NonNullable<ConstructionOrganizationPlanOption['evaluation']['useCaseEvaluations']>],
  option: ConstructionOrganizationPlanOption,
  rankBasis: string[],
) {
  const isAcceleration = evaluation.useCase === 'acceleration_recovery'
  return {
    ...evaluation,
    optionId: option.optionId,
    optionScore: isAcceleration ? projectionAwareAccelerationScore(option) : projectionAwareScore(option),
    rankBasis: Array.from(new Set([
      ...evaluation.rankBasis,
      ...rankBasis,
    ])),
    recoveryFactorHint: option.evaluation.recoveryFactorHint,
    e5RecoverableSpanDays: isAcceleration
      ? projectionAwareAccelerationRecoverableDays(option)
      : option.evaluation.networkEvaluation.e5RecoverableSpanDays,
  }
}

function refreshPlanOptionUseCaseEvaluations(
  option: ConstructionOrganizationPlanOption,
  rankBasis: string[],
  accelerationRankBasis: string[] = [],
  startingLineRankBasis: string[] = rankBasis,
): ConstructionOrganizationPlanOption {
  if (!option.evaluation.useCaseEvaluations) return option
  return {
    ...option,
    evaluation: {
      ...option.evaluation,
      useCaseEvaluations: {
        newProjectPlanning: refreshUseCaseEvaluation(option.evaluation.useCaseEvaluations.newProjectPlanning, option, rankBasis),
        startingLineOnboarding: refreshUseCaseEvaluation(option.evaluation.useCaseEvaluations.startingLineOnboarding, option, startingLineRankBasis),
        accelerationRecovery: refreshUseCaseEvaluation(option.evaluation.useCaseEvaluations.accelerationRecovery, option, accelerationRankBasis),
      },
    },
  }
}

function markProjectionSelected(option: ConstructionOrganizationPlanOption): ConstructionOrganizationPlanOption {
  const projection = option.evaluation.generatedRowProjection
  if (!projection) return option
  return {
    ...option,
    evaluation: {
      ...option.evaluation,
      generatedRowProjection: {
        ...projection,
        gapReasons: Array.from(new Set([
          ...projection.gapReasons,
          'selected_by_generated_row_projection_alignment',
        ])),
      },
    },
  }
}

export function projectConstructionOrganizationSelectionToGeneratedRows(
  selection: ConstructionOrganizationScenarioSelection,
  rows: ConstructionOrganizationGeneratedRowProjectionInputRow[],
): ConstructionOrganizationScenarioSelection {
  const projectionEvaluatedRankBasis = ['generated_row_projection_evaluated']
  const planOptions = selection.planOptions.map((option) => attachProjectionToOption(
    option,
    projectConstructionOrganizationPlanOptionToGeneratedRows(option, rows),
  )).map((option) => refreshPlanOptionUseCaseEvaluations(
    option,
    projectionEvaluatedRankBasis,
    projectionEvaluatedRankBasis,
    projectionEvaluatedRankBasis,
  ))
  const projectedFallback = refreshPlanOptionUseCaseEvaluations(attachProjectionToOption(
      selection.recommendedPlanOption,
      projectConstructionOrganizationPlanOptionToGeneratedRows(selection.recommendedPlanOption, rows),
    ),
    projectionEvaluatedRankBasis,
    projectionEvaluatedRankBasis,
    projectionEvaluatedRankBasis,
  )
  const comparableOptions = planOptions.length > 0 ? planOptions : [projectedFallback]
  const projectionRecommended = [...comparableOptions]
    .sort((left, right) => projectionAwareScore(right) - projectionAwareScore(left))[0] ?? projectedFallback
  const projectionAccelerationRecommended = selectProjectedAccelerationRecoveryOption(comparableOptions) ?? projectionRecommended
  const originalStartingLineOptionId = selection.scenarioRecommendations?.startingLineOnboarding?.optionId
  const hasObservedStartingLineRecommendation = Boolean(
    originalStartingLineOptionId
      && originalStartingLineOptionId !== selection.scenarioRecommendations?.newProjectPlanning?.optionId
      && selection.scenarioRecommendations?.startingLineOnboarding?.recommendationBasis?.some((basis) => (
        basis === 'selected_by_starting_line_observed_progress'
          || basis === 'starting_line_tower_lane_progress_observed'
      )),
  )
  const projectionStartingLineRecommended = hasObservedStartingLineRecommendation
    ? comparableOptions.find((option) => option.optionId === originalStartingLineOptionId)
      ?? selection.planOptions.find((option) => option.optionId === originalStartingLineOptionId)
      ?? projectionRecommended
    : projectionRecommended
  const recommendedPlanOption = refreshPlanOptionUseCaseEvaluations(
    markProjectionSelected(projectionRecommended),
    [...projectionEvaluatedRankBasis, 'generated_row_projection_alignment'],
    projectionRecommended.optionId === projectionAccelerationRecommended.optionId
      ? [...projectionEvaluatedRankBasis, 'generated_row_network_recovery_evidence', 'selected_by_projected_acceleration_recovery_score']
      : projectionEvaluatedRankBasis,
    projectionRecommended.optionId === projectionStartingLineRecommended.optionId
      ? [...projectionEvaluatedRankBasis, 'generated_row_projection_alignment']
      : projectionEvaluatedRankBasis,
  )
  const selectedPlanOptions = planOptions.map((option) => (
    option.optionId === recommendedPlanOption.optionId
      ? recommendedPlanOption
      : option.optionId === projectionAccelerationRecommended.optionId
        ? refreshPlanOptionUseCaseEvaluations(
            option,
            projectionEvaluatedRankBasis,
            [...projectionEvaluatedRankBasis, 'generated_row_network_recovery_evidence', 'selected_by_projected_acceleration_recovery_score'],
            projectionEvaluatedRankBasis,
          )
        : option.optionId === projectionStartingLineRecommended.optionId
          ? refreshPlanOptionUseCaseEvaluations(
              option,
              projectionEvaluatedRankBasis,
              projectionEvaluatedRankBasis,
              [...projectionEvaluatedRankBasis, 'generated_row_projection_alignment'],
            )
        : option
  ))
  const accelerationPlanOption = selectedPlanOptions.find((option) => option.optionId === projectionAccelerationRecommended.optionId)
    ?? (recommendedPlanOption.optionId === projectionAccelerationRecommended.optionId ? recommendedPlanOption : projectionAccelerationRecommended)
  const startingLinePlanOption = selectedPlanOptions.find((option) => option.optionId === projectionStartingLineRecommended.optionId)
    ?? (recommendedPlanOption.optionId === projectionStartingLineRecommended.optionId ? recommendedPlanOption : projectionStartingLineRecommended)
  const recommendedScenarioIds = recommendedPlanOption.selectedScenarioIds
  const scenarioRecommendations = selection.scenarioRecommendations
    ? {
        ...selection.scenarioRecommendations,
        newProjectPlanning: {
          ...selection.scenarioRecommendations.newProjectPlanning,
          optionId: recommendedPlanOption.optionId,
          selectedScenarioIds: recommendedScenarioIds,
          recoveryFactorHint: recommendedPlanOption.evaluation.recoveryFactorHint,
          recommendationBasis: Array.from(new Set([
            ...selection.scenarioRecommendations.newProjectPlanning.recommendationBasis,
            'generated_row_projection_alignment',
          ])),
        },
        startingLineOnboarding: {
          ...selection.scenarioRecommendations.startingLineOnboarding,
          optionId: startingLinePlanOption.optionId,
          selectedScenarioIds: startingLinePlanOption.selectedScenarioIds,
          recoveryFactorHint: startingLinePlanOption.evaluation.recoveryFactorHint,
          recommendationBasis: Array.from(new Set([
            ...selection.scenarioRecommendations.startingLineOnboarding.recommendationBasis,
            'generated_row_projection_alignment',
          ])),
        },
        accelerationRecovery: {
          ...selection.scenarioRecommendations.accelerationRecovery,
          optionId: accelerationPlanOption.optionId,
          selectedScenarioIds: accelerationPlanOption.selectedScenarioIds,
          recoveryFactorHint: accelerationPlanOption.evaluation.recoveryFactorHint,
          recommendationBasis: Array.from(new Set([
            ...selection.scenarioRecommendations.accelerationRecovery.recommendationBasis,
            'generated_row_network_recovery_evidence',
            'selected_by_projected_acceleration_recovery_score',
          ])),
        },
      }
    : selection.scenarioRecommendations

  return {
    ...selection,
    recommendedScenarioIds,
    recommendedPlanOption,
    planOptions: selectedPlanOptions,
    scenarioRecommendations,
    planOptionComparisonPackage: buildPlanOptionComparisonPackage({
      planOptions: selectedPlanOptions,
      recommendedPlanOption,
      scenarioRecommendations,
    }),
    planNetworkDraftRecommendations: buildPlanNetworkDraftRecommendations({
      scenarioRecommendations,
      options: selectedPlanOptions.length > 0 ? selectedPlanOptions : [recommendedPlanOption],
    }),
  }
}
