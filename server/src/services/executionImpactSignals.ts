export type ExecutionImpactMode =
  | 'add_days'
  | 'multiplier'
  | 'start_wait'
  | 'finish_gate'
  | 'confidence_only'

export type ExecutionImpactPhase = 'start' | 'execution' | 'finish' | 'handover' | 'archive'
export type ExecutionImpactSeverity = 'info' | 'warning' | 'critical'
export type ExecutionImpactOwnership = 'condition' | 'obstacle' | 'acceptance' | 'dependency' | 'weather' | 'calendar' | 'context'
export type ExecutionImpactRuntimePolicy = 'deterministic' | 'candidate_only' | 'confidence_only'

export type ExecutionImpactResponsibilityEvidence = {
  source: string
  value: string
  confidence?: number | null
}

export type ExecutionImpactResponsibility = {
  ownerType: 'participant_unit' | 'role' | 'unassigned'
  ownerUnitId?: string | null
  ownerRole?: string | null
  basis: string
  confidence?: number | null
  evidence?: ExecutionImpactResponsibilityEvidence[]
  contributors?: ExecutionImpactResponsibility[]
}

export type ExecutionImpactCriticalityInput = {
  isCritical?: boolean | null
  totalFloatDays?: number | string | null
  freeFloatDays?: number | string | null
  successorCount?: number | string | null
  milestoneDistanceDays?: number | string | null
  criticalityWeight?: number | string | null
  basis?: string | null
}

export type ExecutionImpactSignal = {
  signalId: string
  sourceAlgorithm: 'condition' | 'obstacle' | 'acceptance' | 'delay_forecast'
  sourceEntityType: string
  sourceEntityId: string
  sourceCategory: string
  impactOwnership: ExecutionImpactOwnership
  impactMode: ExecutionImpactMode
  impactPhase: ExecutionImpactPhase
  severity: ExecutionImpactSeverity
  runtimePolicy: ExecutionImpactRuntimePolicy
  confidence: number
  expectedDate?: string | null
  reason: string
  dedupeKey: string
  metadata?: Record<string, unknown>
  responsibility?: ExecutionImpactResponsibility
  criticalityWeight?: number
  criticalityBasis?: string | null
  weightedRiskScore?: number
}

type ConditionLike = {
  id?: string | null
  condition_type?: string | null
  name?: string | null
  status?: string | null
  is_satisfied?: boolean | number | string | null
  required_for_start?: boolean | null
  blocking_level?: string | null
  drawing_package_id?: string | null
  drawing_package_code?: string | null
  source_type?: string | null
  source_ref_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  target_date?: string | null
  planned_date?: string | null
  expected_date?: string | null
  due_date?: string | null
  participant_unit_id?: string | null
  owner_unit_id?: string | null
  responsible_unit_id?: string | null
  responsibility_role?: string | null
  owner_role?: string | null
  typical_responsibility_role?: string | null
}

type ObstacleLike = {
  id?: string | null
  status?: string | null
  severity?: string | null
  blocking_level?: string | null
  progress_impact_level?: string | null
  impact_level?: string | null
  created_at?: string | null
  estimated_resolve_date?: string | null
  expected_resolution_date?: string | null
  obstacle_type?: string | null
  description?: string | null
  source_type?: string | null
  source_ref_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  participant_unit_id?: string | null
  owner_unit_id?: string | null
  responsible_unit_id?: string | null
  responsibility_role?: string | null
  owner_role?: string | null
  typical_responsibility_role?: string | null
}

type AcceptanceSignalInput = {
  planId: string
  status?: string | null
  plannedDate?: string | null
  upstreamUnfinishedCount?: number
  blockedRequirementCount?: number
  requirementReadyPercent?: number
  isOverdue?: boolean
  gateHint?: string | null
  participantUnitId?: string | null
  responsibilityRole?: string | null
}

type DelaySummaryInput = {
  forecastDelayDays?: number | null
  unknownBlockerCount?: number | null
  staleKnownDateCount?: number | null
  taskCriticality?: ExecutionImpactCriticalityInput | null
  dedupeScope?: 'task' | 'project'
  now?: Date | string | null
  downgradeStaleSeedSignals?: boolean
  minSeedConfidence?: number | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeBoolean(value: unknown) {
  const normalized = normalizeLower(value)
  return value === true || value === 1 || normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function normalizeNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeDateText(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function normalizeEvidence(value: unknown): ExecutionImpactResponsibilityEvidence[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const source = normalizeText(record.source)
    const evidenceValue = normalizeText(record.value)
    if (!source || !evidenceValue) return []
    const confidence = record.confidence == null ? null : normalizeNumber(record.confidence, Number.NaN)
    return [{
      source,
      value: evidenceValue,
      confidence: Number.isFinite(confidence as number) ? confidence : null,
    }]
  })
}

function normalizeResponsibility(value: unknown): ExecutionImpactResponsibility | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const ownerTypeText = normalizeText(record.ownerType ?? record.owner_type)
  const ownerUnitId = normalizeText(record.ownerUnitId ?? record.owner_unit_id)
  const ownerRole = normalizeText(record.ownerRole ?? record.owner_role)
  const basis = normalizeText(record.basis ?? record.responsibilityBasis ?? record.responsibility_basis)
  const ownerType = ownerTypeText === 'participant_unit' || ownerTypeText === 'role' || ownerTypeText === 'unassigned'
    ? ownerTypeText
    : ownerUnitId
      ? 'participant_unit'
      : ownerRole
        ? 'role'
        : 'unassigned'
  if (!ownerUnitId && !ownerRole && ownerType !== 'unassigned') return undefined
  const confidence = record.confidence == null ? null : normalizeNumber(record.confidence, Number.NaN)
  const contributors = Array.isArray(record.contributors)
    ? record.contributors.map(normalizeResponsibility).filter((item): item is ExecutionImpactResponsibility => Boolean(item))
    : undefined
  return {
    ownerType,
    ownerUnitId: ownerUnitId || null,
    ownerRole: ownerRole || null,
    basis: basis || 'metadata_responsibility',
    confidence: Number.isFinite(confidence as number) ? clamp(confidence as number, 0, 1) : null,
    evidence: normalizeEvidence(record.evidence),
    contributors,
  }
}

function conditionIsClosed(condition: ConditionLike) {
  return ['deleted', 'closed', 'archived', 'cancelled', 'resolved'].includes(normalizeLower(condition.status))
}

function conditionIsSatisfied(condition: ConditionLike) {
  if (condition.is_satisfied != null) return normalizeBoolean(condition.is_satisfied)
  return ['completed', 'satisfied', 'confirmed', 'met', 'closed'].includes(normalizeLower(condition.status))
}

function conditionExpectedDate(condition: ConditionLike) {
  return normalizeDateText(condition.target_date ?? condition.planned_date ?? condition.expected_date ?? condition.due_date)
}

function classifyCategory(parts: Array<unknown>, fallback = 'general') {
  const text = parts.map(normalizeLower).join(' ')
  if (text.includes('drawing') || text.includes('图纸')) return 'drawing'
  if (text.includes('certificate') || text.includes('permit') || text.includes('license') || text.includes('证照') || text.includes('许可')) return 'certificate'
  if (text.includes('material') || text.includes('supplier') || text.includes('procurement') || text.includes('材料') || text.includes('采购') || text.includes('供应')) return 'material'
  if (text.includes('labor') || text.includes('crew') || text.includes('resource') || text.includes('equipment') || text.includes('人员') || text.includes('班组') || text.includes('设备') || text.includes('资源')) return 'resource_capacity'
  if (text.includes('acceptance') || text.includes('inspection') || text.includes('handover') || text.includes('验收') || text.includes('移交') || text.includes('检查')) return 'acceptance'
  if (text.includes('safety') || text.includes('quality') || text.includes('安全') || text.includes('质量')) return 'quality_safety'
  if (text.includes('weather') || text.includes('rain') || text.includes('temperature') || text.includes('天气') || text.includes('雨') || text.includes('冬期')) return 'weather_calendar'
  if (text.includes('access') || text.includes('site') || text.includes('interface') || text.includes('场地') || text.includes('作业面') || text.includes('交接')) return 'site_access'
  return fallback
}

function severityFromText(value: unknown, fallback: ExecutionImpactSeverity): ExecutionImpactSeverity {
  const text = normalizeLower(value)
  if (text.includes('critical') || text.includes('severe') || text.includes('blocked') || text.includes('hard') || text.includes('严重') || text.includes('硬')) return 'critical'
  if (text.includes('warning') || text.includes('medium') || text.includes('partial') || text.includes('high') || text.includes('中') || text.includes('高')) return 'warning'
  if (text.includes('info') || text.includes('low') || text.includes('soft') || text.includes('低') || text.includes('软')) return 'info'
  return fallback
}

function defaultRoleForCategory(category: string, sourceEntityType?: string | null) {
  const text = `${normalizeLower(category)} ${normalizeLower(sourceEntityType)}`
  if (text.includes('material') || text.includes('supplier')) return 'supplier_install'
  if (text.includes('drawing') || text.includes('design')) return 'design'
  if (text.includes('acceptance') || text.includes('quality') || text.includes('inspection')) return 'supervision'
  if (text.includes('certificate') || text.includes('permit') || text.includes('license')) return 'owner_direct'
  if (text.includes('resource') || text.includes('labor') || text.includes('equipment')) return 'general_contractor'
  return null
}

function responsibilityFromInput(params: {
  category: string
  sourceEntityType?: string | null
  ownerUnitId?: string | null
  ownerRole?: string | null
  basis?: string | null
}): ExecutionImpactResponsibility | undefined {
  const ownerUnitId = normalizeText(params.ownerUnitId)
  const explicitRole = normalizeText(params.ownerRole)
  const ownerRole = explicitRole || defaultRoleForCategory(params.category, params.sourceEntityType)
  if (!ownerUnitId && !ownerRole) return undefined

  return {
    ownerType: ownerUnitId ? 'participant_unit' : 'role',
    ownerUnitId: ownerUnitId || null,
    ownerRole: ownerRole || null,
    basis: normalizeText(params.basis) || (ownerUnitId || explicitRole ? 'explicit_signal_metadata' : 'category_inference'),
  }
}

function responsibilityFromMetadata(signal: ExecutionImpactSignal): ExecutionImpactResponsibility | undefined {
  if (signal.responsibility) return signal.responsibility
  const metadata = signal.metadata ?? {}
  const metadataResponsibility = normalizeResponsibility(metadata.responsibility ?? metadata.responsibility_metadata)
  if (metadataResponsibility) return metadataResponsibility
  return responsibilityFromInput({
    category: signal.sourceCategory,
    sourceEntityType: signal.sourceEntityType,
    ownerUnitId: metadata.ownerUnitId as string | null | undefined
      ?? metadata.owner_unit_id as string | null | undefined
      ?? metadata.participantUnitId as string | null | undefined
      ?? metadata.participant_unit_id as string | null | undefined,
    ownerRole: metadata.ownerRole as string | null | undefined
      ?? metadata.owner_role as string | null | undefined
      ?? metadata.responsibilityRole as string | null | undefined
      ?? metadata.responsibility_role as string | null | undefined
      ?? metadata.typicalResponsibilityRole as string | null | undefined
      ?? metadata.typical_responsibility_role as string | null | undefined,
    basis: metadata.responsibilityBasis as string | null | undefined
      ?? metadata.responsibility_basis as string | null | undefined,
  })
}

function resolveCriticality(input?: ExecutionImpactCriticalityInput | null) {
  const explicitWeight = normalizeNumber(input?.criticalityWeight, Number.NaN)
  const totalFloatDays = input?.totalFloatDays == null ? null : normalizeNumber(input.totalFloatDays, Number.NaN)
  const freeFloatDays = input?.freeFloatDays == null ? null : normalizeNumber(input.freeFloatDays, Number.NaN)
  const successorCount = input?.successorCount == null ? null : Math.max(0, Math.trunc(normalizeNumber(input.successorCount, Number.NaN)))
  const milestoneDistanceDays = input?.milestoneDistanceDays == null ? null : normalizeNumber(input.milestoneDistanceDays, Number.NaN)
  const hasValidFloat = typeof totalFloatDays === 'number' && Number.isFinite(totalFloatDays)
  const hasValidFreeFloat = typeof freeFloatDays === 'number' && Number.isFinite(freeFloatDays)
  const hasValidSuccessorCount = typeof successorCount === 'number' && Number.isFinite(successorCount)
  const hasValidMilestoneDistance = typeof milestoneDistanceDays === 'number' && Number.isFinite(milestoneDistanceDays)
  const isCritical = Boolean(input?.isCritical) || (hasValidFloat && totalFloatDays <= 0)
  const basisFactors: string[] = []
  let inferredWeight = isCritical
    ? 1.35
    : hasValidFloat && totalFloatDays <= 2
      ? 1.2
      : hasValidFloat && totalFloatDays <= 5
        ? 1.1
        : 1

  if (isCritical) basisFactors.push('critical_path')
  if (hasValidFloat && totalFloatDays <= 2 && totalFloatDays > 0) basisFactors.push('near_zero_total_float')
  if (hasValidFloat && totalFloatDays <= 0) basisFactors.push('zero_total_float')
  if (hasValidFreeFloat && freeFloatDays <= 0) {
    inferredWeight += 0.1
    basisFactors.push('zero_free_float')
  } else if (hasValidFreeFloat && freeFloatDays <= 2) {
    inferredWeight += 0.05
    basisFactors.push('low_free_float')
  }
  if (hasValidSuccessorCount && successorCount >= 5) {
    inferredWeight += 0.09
    basisFactors.push('high_successor_fanout')
  } else if (hasValidSuccessorCount && successorCount >= 2) {
    inferredWeight += 0.04
    basisFactors.push('successor_fanout')
  }
  if (hasValidMilestoneDistance && milestoneDistanceDays <= 7) {
    inferredWeight += 0.1
    basisFactors.push('near_downstream_milestone')
  } else if (hasValidMilestoneDistance && milestoneDistanceDays <= 14) {
    inferredWeight += 0.05
    basisFactors.push('downstream_milestone_window')
  }

  const criticalityWeight = Number.isFinite(explicitWeight)
    ? clamp(explicitWeight, 0.75, 1.6)
    : clamp(inferredWeight, 0.75, 1.6)

  return {
    isCritical,
    totalFloatDays: hasValidFloat ? totalFloatDays : null,
    freeFloatDays: hasValidFreeFloat ? freeFloatDays : null,
    successorCount: hasValidSuccessorCount ? successorCount : null,
    milestoneDistanceDays: hasValidMilestoneDistance ? milestoneDistanceDays : null,
    criticalityWeight: round(criticalityWeight, 2),
    basis: normalizeText(input?.basis) || (isCritical ? 'critical_path' : hasValidFloat ? 'float_days' : 'not_critical_path'),
    basisFactors,
  }
}

function riskScore(signal: ExecutionImpactSignal, criticalityWeight: number) {
  const severityScore = signal.severity === 'critical' ? 1 : signal.severity === 'warning' ? 0.72 : 0.42
  const modeScore = signal.impactMode === 'start_wait' || signal.impactMode === 'finish_gate'
    ? 1
    : signal.impactMode === 'add_days' || signal.impactMode === 'multiplier'
      ? 0.74
      : 0.45
  const runtimeScore = signal.runtimePolicy === 'deterministic' ? 1 : signal.runtimePolicy === 'candidate_only' ? 0.68 : 0.5
  return round(clamp(severityScore * modeScore * runtimeScore * signal.confidence * criticalityWeight, 0, 1.6), 2)
}

function sourceDedupeKey(params: {
  fallback: string
  sourceEntityType?: string | null
  sourceEntityId?: string | null
  category: string
  phase: ExecutionImpactPhase
}) {
  const entityType = normalizeText(params.sourceEntityType)
  const entityId = normalizeText(params.sourceEntityId)
  if (entityType && entityId) return `blocker:${entityType}:${entityId}:${params.phase}`
  return `${params.fallback}:${params.category}:${params.phase}`
}

function canonicalSource(params: {
  fallbackType: string
  fallbackId: string
  sourceEntityType?: string | null
  sourceEntityId?: string | null
}) {
  const sourceEntityType = normalizeText(params.sourceEntityType)
  const sourceEntityId = normalizeText(params.sourceEntityId)
  if (sourceEntityType && sourceEntityId) {
    return {
      sourceEntityType,
      sourceEntityId,
      sourceRowType: params.fallbackType,
      sourceRowId: params.fallbackId,
    }
  }
  return {
    sourceEntityType: params.fallbackType,
    sourceEntityId: params.fallbackId,
    sourceRowType: params.fallbackType,
    sourceRowId: params.fallbackId,
  }
}

export function buildConditionImpactSignals(conditions: ConditionLike[]): ExecutionImpactSignal[] {
  return conditions
    .filter((condition) => !conditionIsClosed(condition))
    .filter((condition) => condition.required_for_start !== false)
    .filter((condition) => !conditionIsSatisfied(condition))
    .map((condition, index) => {
      const id = normalizeText(condition.id) || `unknown-${index + 1}`
      const category = classifyCategory([
        condition.condition_type,
        condition.name,
        condition.source_type,
        condition.source_entity_type,
        condition.drawing_package_id,
        condition.drawing_package_code,
      ], 'condition')
      const blockingLevel = normalizeLower(condition.blocking_level)
      const isHard = !blockingLevel || blockingLevel === 'hard' || blockingLevel === 'blocked' || blockingLevel === 'critical'
      const expectedDate = conditionExpectedDate(condition)
      const impactMode: ExecutionImpactMode = isHard && expectedDate ? 'start_wait' : isHard ? 'confidence_only' : 'confidence_only'
      const severity: ExecutionImpactSeverity = isHard ? 'critical' : 'warning'
      const phase: ExecutionImpactPhase = 'start'
      const source = canonicalSource({
        fallbackType: 'task_condition',
        fallbackId: id,
        sourceEntityType: condition.source_entity_type ?? condition.source_type,
        sourceEntityId: condition.source_entity_id ?? condition.source_ref_id,
      })
      const responsibility = responsibilityFromInput({
        category,
        sourceEntityType: source.sourceEntityType,
        ownerUnitId: condition.participant_unit_id ?? condition.owner_unit_id ?? condition.responsible_unit_id,
        ownerRole: condition.responsibility_role ?? condition.owner_role ?? condition.typical_responsibility_role,
      })

      return {
        signalId: `condition:${id}`,
        sourceAlgorithm: 'condition',
        sourceEntityType: source.sourceEntityType,
        sourceEntityId: source.sourceEntityId,
        sourceCategory: category,
        impactOwnership: 'condition',
        impactMode,
        impactPhase: phase,
        severity,
        runtimePolicy: impactMode === 'confidence_only' ? 'confidence_only' : 'deterministic',
        confidence: expectedDate ? 0.82 : 0.55,
        expectedDate,
        reason: expectedDate
          ? `${category} start condition waits until ${expectedDate}`
          : `${category} start condition is unresolved without a usable date`,
        dedupeKey: sourceDedupeKey({
          fallback: `condition:${id}`,
          sourceEntityType: source.sourceEntityType,
          sourceEntityId: source.sourceEntityId,
          category,
          phase,
        }),
        metadata: {
          sourceRowType: source.sourceRowType,
          sourceRowId: source.sourceRowId,
          blockingLevel: condition.blocking_level ?? null,
          status: condition.status ?? null,
          ownerUnitId: condition.participant_unit_id ?? condition.owner_unit_id ?? condition.responsible_unit_id ?? null,
          ownerRole: condition.responsibility_role ?? condition.owner_role ?? condition.typical_responsibility_role ?? null,
        },
        responsibility,
      } satisfies ExecutionImpactSignal
    })
}

function obstacleIsClosed(obstacle: ObstacleLike) {
  return ['resolved', 'closed', 'deleted', 'archived', 'cancelled'].includes(normalizeLower(obstacle.status))
}

export function buildObstacleImpactSignals(obstacles: ObstacleLike[], now = new Date()): ExecutionImpactSignal[] {
  const today = normalizeDateText(now.toISOString())
  return obstacles
    .filter((obstacle) => !obstacleIsClosed(obstacle))
    .map((obstacle, index) => {
      const id = normalizeText(obstacle.id) || `unknown-${index + 1}`
      const category = classifyCategory([obstacle.obstacle_type, obstacle.description, obstacle.source_type], 'general')
      const severity = severityFromText(
        obstacle.progress_impact_level ?? obstacle.impact_level ?? obstacle.blocking_level ?? obstacle.severity,
        'warning',
      )
      const expectedDate = normalizeDateText(obstacle.estimated_resolve_date ?? obstacle.expected_resolution_date)
      const critical = severity === 'critical'
      const phase: ExecutionImpactPhase = critical ? 'start' : 'execution'
      const impactMode: ExecutionImpactMode = critical && expectedDate ? 'start_wait' : 'add_days'
      const confidence = critical ? 0.78 : 0.66
      const source = canonicalSource({
        fallbackType: 'task_obstacle',
        fallbackId: id,
        sourceEntityType: obstacle.source_entity_type ?? obstacle.source_type,
        sourceEntityId: obstacle.source_entity_id ?? obstacle.source_ref_id,
      })
      const responsibility = responsibilityFromInput({
        category,
        sourceEntityType: source.sourceEntityType,
        ownerUnitId: obstacle.participant_unit_id ?? obstacle.owner_unit_id ?? obstacle.responsible_unit_id,
        ownerRole: obstacle.responsibility_role ?? obstacle.owner_role ?? obstacle.typical_responsibility_role,
      })

      return {
        signalId: `obstacle:${id}`,
        sourceAlgorithm: 'obstacle',
        sourceEntityType: source.sourceEntityType,
        sourceEntityId: source.sourceEntityId,
        sourceCategory: category,
        impactOwnership: 'obstacle',
        impactMode,
        impactPhase: phase,
        severity,
        runtimePolicy: 'deterministic',
        confidence,
        expectedDate,
        reason: expectedDate
          ? `${category} obstacle expected to clear on ${expectedDate}`
          : `${category} obstacle is open${critical ? ' without a clear resolution date' : ''}`,
        dedupeKey: sourceDedupeKey({
          fallback: `obstacle:${id}`,
          sourceEntityType: source.sourceEntityType,
          sourceEntityId: source.sourceEntityId,
          category,
          phase,
        }),
        metadata: {
          sourceRowType: source.sourceRowType,
          sourceRowId: source.sourceRowId,
          today,
          status: obstacle.status ?? null,
          severity: obstacle.severity ?? null,
          obstacleType: obstacle.obstacle_type ?? null,
          ownerUnitId: obstacle.participant_unit_id ?? obstacle.owner_unit_id ?? obstacle.responsible_unit_id ?? null,
          ownerRole: obstacle.responsibility_role ?? obstacle.owner_role ?? obstacle.typical_responsibility_role ?? null,
        },
        responsibility,
      } satisfies ExecutionImpactSignal
    })
}

function inferAcceptancePhase(input: AcceptanceSignalInput): ExecutionImpactPhase {
  const text = normalizeLower(input.gateHint)
  if (text.includes('start')) return 'start'
  if (text.includes('handover') || text.includes('移交')) return 'handover'
  if (text.includes('archive') || text.includes('资料') || text.includes('record')) return 'archive'
  return 'finish'
}

export function buildAcceptancePlanImpactSignals(input: AcceptanceSignalInput): ExecutionImpactSignal[] {
  const planId = normalizeText(input.planId)
  if (!planId) return []

  const signals: ExecutionImpactSignal[] = []
  const normalizedStatus = normalizeLower(input.status)
  const isClosed = ['passed', 'archived', 'completed', 'closed', '已通过', '已归档'].includes(normalizedStatus)
  const requirementReadyPercent = normalizeNumber(input.requirementReadyPercent, 100)
  const upstreamUnfinishedCount = Math.max(0, Math.trunc(normalizeNumber(input.upstreamUnfinishedCount, 0)))
  const blockedRequirementCount = Math.max(0, Math.trunc(normalizeNumber(input.blockedRequirementCount, 0)))
  const isBlocked = upstreamUnfinishedCount > 0 || blockedRequirementCount > 0
  const phase = inferAcceptancePhase(input)
  const plannedDate = normalizeDateText(input.plannedDate)
  const hasOpenDatedGate = Boolean(plannedDate && !isClosed)
  const responsibility = responsibilityFromInput({
    category: 'acceptance',
    sourceEntityType: 'acceptance_plan',
    ownerUnitId: input.participantUnitId,
    ownerRole: input.responsibilityRole,
  })

  if (isBlocked || input.isOverdue || hasOpenDatedGate) {
    signals.push({
      signalId: `acceptance:${planId}:gate`,
      sourceAlgorithm: 'acceptance',
      sourceEntityType: 'acceptance_plan',
      sourceEntityId: planId,
      sourceCategory: phase === 'handover' ? 'handover' : 'acceptance',
      impactOwnership: 'acceptance',
      impactMode: phase === 'start' ? 'start_wait' : 'finish_gate',
      impactPhase: phase,
      severity: input.isOverdue ? 'critical' : 'warning',
      runtimePolicy: 'deterministic',
      confidence: plannedDate ? 0.82 : 0.62,
      expectedDate: plannedDate,
      reason: input.isOverdue
        ? 'Acceptance gate is overdue'
        : isBlocked
          ? 'Acceptance gate has unfinished predecessors or blocked requirements'
          : 'Acceptance gate has a planned control date',
      dedupeKey: `acceptance:${planId}:${phase}`,
      metadata: {
        upstreamUnfinishedCount,
        blockedRequirementCount,
        status: input.status ?? null,
        ownerUnitId: input.participantUnitId ?? null,
        ownerRole: input.responsibilityRole ?? null,
      },
      responsibility,
    })
  }

  if (requirementReadyPercent < 100) {
    signals.push({
      signalId: `acceptance:${planId}:requirements`,
      sourceAlgorithm: 'acceptance',
      sourceEntityType: 'acceptance_plan',
      sourceEntityId: planId,
      sourceCategory: 'acceptance_requirement',
      impactOwnership: 'acceptance',
      impactMode: 'confidence_only',
      impactPhase: 'archive',
      severity: requirementReadyPercent < 50 ? 'critical' : 'warning',
      runtimePolicy: 'confidence_only',
      confidence: 0.58,
      expectedDate: plannedDate,
      reason: `Acceptance requirements are ${requirementReadyPercent}% ready`,
      dedupeKey: `acceptance:${planId}:requirements`,
      metadata: {
        requirementReadyPercent,
        ownerUnitId: input.participantUnitId ?? null,
        ownerRole: input.responsibilityRole ?? null,
      },
      responsibility,
    })
  }

  return signals
}

function metadataTextValue(signal: ExecutionImpactSignal, ...keys: string[]) {
  for (const key of keys) {
    const value = signal.metadata?.[key]
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function isSeedBackedSignal(signal: ExecutionImpactSignal) {
  return signal.sourceEntityType === 'algorithm_seed'
    || Boolean(metadataTextValue(signal, 'seedSource', 'seed_source', 'sourceStandard', 'source_standard', 'ruleCode', 'rule_code'))
}

function isStaleSeedSignal(signal: ExecutionImpactSignal, now?: Date | string | null) {
  if (!isSeedBackedSignal(signal)) return false
  const staleReason = metadataTextValue(signal, 'staleReason', 'stale_reason')
  if (staleReason) return true

  const validUntil = normalizeDateText(signal.metadata?.validUntil ?? signal.metadata?.valid_until)
  if (!validUntil) return false
  const today = normalizeDateText(now instanceof Date ? now.toISOString() : now) ?? new Date().toISOString().slice(0, 10)
  return validUntil < today
}

function signalTaskId(signal: ExecutionImpactSignal) {
  return normalizeText(
    signal.metadata?.taskId
      ?? signal.metadata?.task_id
      ?? signal.metadata?.sourceTaskId
      ?? signal.metadata?.source_task_id,
  ) || null
}

function uniqueTexts(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function signalSeedSource(signal: ExecutionImpactSignal) {
  return metadataTextValue(signal, 'sourceStandard', 'source_standard', 'seedSource', 'seed_source')
    || (signal.sourceEntityType === 'algorithm_seed' ? normalizeText(signal.sourceEntityId).split(':')[0] : '')
    || 'unknown'
}

function signalRuleCode(signal: ExecutionImpactSignal) {
  return metadataTextValue(signal, 'ruleCode', 'rule_code', 'gateCode', 'gate_code', 'conditionCode', 'condition_code')
    || signal.sourceEntityId
    || signal.signalId
}

function scopedDedupeKey(signal: ExecutionImpactSignal, scope: DelaySummaryInput['dedupeScope']) {
  if (scope !== 'project') return signal.dedupeKey
  if (isSeedBackedSignal(signal)) {
    return `project:seed-rule:${signalSeedSource(signal)}:${signalRuleCode(signal)}:${signal.sourceCategory}:${signal.impactPhase}`
  }
  const sourceEntityType = normalizeText(signal.sourceEntityType)
  const sourceEntityId = normalizeText(signal.sourceEntityId)
  if (sourceEntityType && sourceEntityId) {
    return `project:blocker:${sourceEntityType}:${sourceEntityId}:${signal.impactPhase}`
  }
  return `project:${signal.dedupeKey}`
}

function downgradeRuntimePolicy(signal: ExecutionImpactSignal, input: DelaySummaryInput): ExecutionImpactSignal {
  const shouldDowngradeStale = input.downgradeStaleSeedSignals !== false
  if (shouldDowngradeStale && isStaleSeedSignal(signal, input.now)) {
    return {
      ...signal,
      runtimePolicy: 'candidate_only',
      metadata: {
        ...signal.metadata,
        staleReason: signal.metadata?.staleReason ?? signal.metadata?.stale_reason ?? 'evidence_expired',
        runtimeDowngradeReason: 'stale_seed_evidence',
      },
    }
  }

  const minSeedConfidence = input.minSeedConfidence == null ? 0.5 : normalizeNumber(input.minSeedConfidence, 0.5)
  if (isSeedBackedSignal(signal) && signal.runtimePolicy === 'deterministic' && signal.confidence < minSeedConfidence) {
    return {
      ...signal,
      impactMode: 'confidence_only',
      runtimePolicy: 'confidence_only',
      metadata: {
        ...signal.metadata,
        runtimeDowngradeReason: 'low_confidence_seed',
      },
    }
  }

  return signal
}

function responsibilityEntries(responsibility: ExecutionImpactResponsibility | undefined): ExecutionImpactResponsibility[] {
  if (!responsibility) return []
  return [responsibility, ...(responsibility.contributors ?? [])]
}

export function summarizeDelayImpactSignals(signals: ExecutionImpactSignal[], input: DelaySummaryInput = {}) {
  const byDedupeKey = new Map<string, ExecutionImpactSignal>()
  const affectedTasksByDedupeKey = new Map<string, Set<string>>()
  const duplicates: Array<{
    dedupeKey: string
    keptSignalId: string
    suppressedSignalIds: string[]
    affectedTaskIds?: string[]
  }> = []

  const priority = (signal: ExecutionImpactSignal) => {
    const severityScore = signal.severity === 'critical' ? 3 : signal.severity === 'warning' ? 2 : 1
    const modeScore = signal.impactMode === 'start_wait' || signal.impactMode === 'finish_gate'
      ? 3
      : signal.impactMode === 'add_days' || signal.impactMode === 'multiplier'
        ? 2
        : 1
    const ownerScore = signal.impactOwnership === 'condition' ? 3 : signal.impactOwnership === 'acceptance' ? 2 : 1
    return severityScore * 100 + modeScore * 10 + ownerScore + signal.confidence
  }

  for (const rawSignal of signals) {
    const signal = downgradeRuntimePolicy(rawSignal, input)
    const dedupeKey = scopedDedupeKey(signal, input.dedupeScope)
    const taskId = signalTaskId(signal)
    const affectedTaskIds = affectedTasksByDedupeKey.get(dedupeKey) ?? new Set<string>()
    if (taskId) affectedTaskIds.add(taskId)
    affectedTasksByDedupeKey.set(dedupeKey, affectedTaskIds)

    const current = byDedupeKey.get(dedupeKey)
    if (!current) {
      byDedupeKey.set(dedupeKey, {
        ...signal,
        dedupeKey,
      })
      continue
    }

    const scopedSignal = {
      ...signal,
      dedupeKey,
    }
    const keep = priority(scopedSignal) > priority(current) ? scopedSignal : current
    const suppress = keep === scopedSignal ? current : scopedSignal
    byDedupeKey.set(dedupeKey, keep)
    const existing = duplicates.find((item) => item.dedupeKey === dedupeKey)
    if (existing) {
      existing.keptSignalId = keep.signalId
      existing.suppressedSignalIds = Array.from(new Set([...existing.suppressedSignalIds, suppress.signalId]))
      existing.affectedTaskIds = Array.from(affectedTaskIds)
    } else {
      duplicates.push({
        dedupeKey,
        keptSignalId: keep.signalId,
        suppressedSignalIds: [suppress.signalId],
        ...(affectedTaskIds.size > 0 ? { affectedTaskIds: Array.from(affectedTaskIds) } : {}),
      })
    }
  }

  const criticality = resolveCriticality(input.taskCriticality)
  const dedupedSignals = Array.from(byDedupeKey.values()).map((signal) => {
    const signalWeight = normalizeNumber(signal.criticalityWeight ?? signal.metadata?.criticalityWeight, criticality.criticalityWeight)
    const criticalityWeight = round(clamp(signalWeight, 0.75, 1.6), 2)
    const responsibility = responsibilityFromMetadata(signal)
    const affectedTaskIds = Array.from(affectedTasksByDedupeKey.get(signal.dedupeKey) ?? new Set<string>())
    return {
      ...signal,
      responsibility,
      criticalityWeight,
      criticalityBasis: signal.criticalityBasis ?? criticality.basis,
      weightedRiskScore: riskScore(signal, criticalityWeight),
      metadata: {
        ...signal.metadata,
        ...(affectedTaskIds.length > 0 ? { affectedTaskIds } : {}),
      },
    } satisfies ExecutionImpactSignal
  })
  const unknownBlockerCount = Math.max(0, normalizeNumber(input.unknownBlockerCount, 0))
  const staleKnownDateCount = Math.max(0, normalizeNumber(input.staleKnownDateCount, 0))
  const confidenceOnlyCount = dedupedSignals.filter((signal) => signal.impactMode === 'confidence_only' || signal.runtimePolicy === 'confidence_only').length
  const candidateOnlyCount = dedupedSignals.filter((signal) => signal.runtimePolicy === 'candidate_only').length
  const staleSeedCount = dedupedSignals.filter((signal) => isStaleSeedSignal(signal, input.now)).length
  const deterministicDelaySignalCount = dedupedSignals.filter((signal) =>
    signal.runtimePolicy === 'deterministic' && signal.impactMode !== 'confidence_only',
  ).length
  const uncertaintyIndex = Math.min(1, Number((
    unknownBlockerCount * 0.16
    + staleKnownDateCount * 0.1
    + confidenceOnlyCount * 0.12
    + candidateOnlyCount * 0.1
    + staleSeedCount * 0.1
    + dedupedSignals.filter((signal) => signal.confidence < 0.6).length * 0.08
  ).toFixed(2)))
  const confirmedDelayDays = deterministicDelaySignalCount > 0
    ? Math.max(0, normalizeNumber(input.forecastDelayDays, 0))
    : 0
  const maxCriticalityWeight = dedupedSignals.reduce((max, signal) => Math.max(max, normalizeNumber(signal.criticalityWeight, criticality.criticalityWeight)), criticality.criticalityWeight)
  const weightedRiskScore = round(dedupedSignals.reduce((max, signal) => Math.max(max, normalizeNumber(signal.weightedRiskScore, 0)), 0), 2)
  const responsibilityMap = new Map<string, {
    ownerType: ExecutionImpactResponsibility['ownerType']
    ownerUnitId: string | null
    ownerRole: string | null
    basis: string
    signalCount: number
    weightedSignalCount: number
    maxWeightedRiskScore: number
    confidence: number | null
    evidence: ExecutionImpactResponsibilityEvidence[]
  }>()
  for (const signal of dedupedSignals) {
    for (const responsibility of responsibilityEntries(signal.responsibility)) {
      const key = `${responsibility.ownerUnitId ?? ''}|${responsibility.ownerRole ?? ''}|${responsibility.ownerType}`
      const existing = responsibilityMap.get(key) ?? {
        ownerType: responsibility.ownerType,
        ownerUnitId: responsibility.ownerUnitId ?? null,
        ownerRole: responsibility.ownerRole ?? null,
        basis: responsibility.basis,
        signalCount: 0,
        weightedSignalCount: 0,
        maxWeightedRiskScore: 0,
        confidence: responsibility.confidence == null ? null : round(clamp(normalizeNumber(responsibility.confidence, 0), 0, 1), 2),
        evidence: [],
      }
      existing.signalCount += 1
      existing.weightedSignalCount = round(existing.weightedSignalCount + normalizeNumber(signal.criticalityWeight, criticality.criticalityWeight), 2)
      existing.maxWeightedRiskScore = Math.max(existing.maxWeightedRiskScore, normalizeNumber(signal.weightedRiskScore, 0))
      const responsibilityConfidence = responsibility.confidence == null ? null : round(clamp(normalizeNumber(responsibility.confidence, 0), 0, 1), 2)
      existing.confidence = existing.confidence == null
        ? responsibilityConfidence
        : responsibilityConfidence == null
          ? existing.confidence
          : round(Math.max(existing.confidence, responsibilityConfidence), 2)
      for (const evidence of responsibility.evidence ?? []) {
        if (!existing.evidence.some((item) => item.source === evidence.source && item.value === evidence.value)) {
          existing.evidence.push(evidence)
        }
      }
      responsibilityMap.set(key, existing)
    }
  }

  return {
    rawCount: signals.length,
    dedupedCount: dedupedSignals.length,
    signals: dedupedSignals,
    duplicates,
    confirmedDelayDays,
    weightedConfirmedDelayDays: round(confirmedDelayDays * maxCriticalityWeight, 2),
    weightedRiskScore,
    criticality,
    responsibilityBreakdown: Array.from(responsibilityMap.values())
      .sort((left, right) => (
        right.weightedSignalCount - left.weightedSignalCount
        || right.maxWeightedRiskScore - left.maxWeightedRiskScore
        || normalizeNumber(right.confidence, 0) - normalizeNumber(left.confidence, 0)
        || (left.ownerType === 'participant_unit' ? 0 : 1) - (right.ownerType === 'participant_unit' ? 0 : 1)
        || String(left.ownerRole ?? '').localeCompare(String(right.ownerRole ?? ''))
      )),
    uncertaintyIndex,
    uncertaintyReasons: [
      unknownBlockerCount > 0 ? 'unknown_blocker_dates' : null,
      staleKnownDateCount > 0 ? 'stale_known_dates' : null,
      candidateOnlyCount > 0 ? 'candidate_only_signals' : null,
      confidenceOnlyCount > 0 ? 'confidence_only_signals' : null,
      staleSeedCount > 0 ? 'stale_seed_signals' : null,
    ].filter((item): item is string => Boolean(item)),
  }
}
