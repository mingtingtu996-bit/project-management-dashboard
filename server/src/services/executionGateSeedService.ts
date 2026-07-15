import { randomUUID } from 'crypto'
import type { Task } from '../types/db.js'
import { executeSQL } from './dbService.js'

type GateTask = Partial<Task> & Record<string, unknown>

type ExecutionGateSeedTemplateBase = {
  sourceEntityType: 'algorithm_seed'
  sourceEntityId: string
  sourceStandard: string | null
  sourceClauseRef: string | null
  impactMode: 'start_wait' | 'finish_gate'
  impactOwnership: 'condition' | 'acceptance'
  runtimePolicy: 'deterministic' | 'candidate_only' | 'confidence_only'
  evidenceCodes: string[]
  evidenceVersion?: string
  validUntil?: string | null
  stalePolicy?: string
  staleReason?: string | null
  responsibility?: {
    ownerType: 'participant_unit' | 'role' | 'unassigned'
    ownerUnitId?: string | null
    ownerRole?: string | null
    basis: string
  }
}

export type ExecutionConditionGateTemplate = ExecutionGateSeedTemplateBase & {
  conditionCode: string
  conditionName: string
  conditionType: string
  requiredForStart: boolean
  blockingLevel: 'hard' | 'soft' | 'info'
  description: string
}

export type ExecutionAcceptanceGateTemplate = ExecutionGateSeedTemplateBase & {
  gateCode: string
  gateName: string
  gateType: 'quality_acceptance' | 'internal_flow_acceptance_gate'
  description: string
}

export type ExecutionGateSeedDerivation = {
  taskId: string
  projectId: string
  conditionTemplates: ExecutionConditionGateTemplate[]
  acceptanceGateTemplates: ExecutionAcceptanceGateTemplate[]
  summary: {
    sourceStandard: string | null
    stableCode: string | null
    conditionTemplateCount: number
    acceptanceGateTemplateCount: number
    internalFlowGateCount: number
  }
}

type SyncExecutionGateSeedTemplatesParams = {
  task: GateTask
  actorId?: string | null
}

type AcceptancePlanIdentityRow = {
  id?: string | null
  type_id?: string | null
  notes?: unknown
}

type AcceptancePlanTaskLinkRow = {
  source_entity_id?: string | null
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

function normalizeDateText(value: unknown) {
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? null : value.toISOString().slice(0, 10)
  }
  const text = normalizeText(value)
  if (!text) return null
  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoDate) return isoDate[1]
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return {}
}

function readRecordArray(...values: unknown[]) {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value.map(readRecord).filter((item) => Object.keys(item).length > 0)
    const record = readRecord(value)
    return Object.keys(record).length > 0 ? [record] : []
  })
}

function readStringArray(...values: unknown[]) {
  const items: string[] = []
  for (const value of values) {
    if (Array.isArray(value)) {
      value.map(normalizeText).filter(Boolean).forEach((item) => items.push(item))
      continue
    }
    const text = normalizeText(value)
    if (text) items.push(text)
  }
  return Array.from(new Set(items))
}

function humanizeGateCode(code: string) {
  return code
    .split(/[_:\-\s]+/g)
    .map((part) => part ? `${part.slice(0, 1).toUpperCase()}${part.slice(1)}` : '')
    .filter(Boolean)
    .join(' ')
}

function deriveStableCode(task: GateTask, metadata: Record<string, unknown>) {
  return normalizeText(
    metadata.stableCode
      ?? metadata.stable_code
      ?? task.standard_work_code
      ?? task.template_node_id
      ?? metadata.templateNodeId
      ?? metadata.template_node_id,
  ) || null
}

function deriveSourceStandard(task: GateTask, metadata: Record<string, unknown>) {
  return normalizeText(
    metadata.sourceStandard
      ?? metadata.source_standard
      ?? task.source_standard
      ?? metadata.standardCode
      ?? metadata.standard_code,
  ) || null
}

function deriveSourceClauseRef(metadata: Record<string, unknown>) {
  return normalizeText(metadata.sourceClauseRef ?? metadata.source_clause_ref) || null
}

function deriveEvidenceVersion(metadata: Record<string, unknown>, sourceStandard: string | null, evidenceCodes: string[]) {
  return normalizeText(
    metadata.evidenceVersion
      ?? metadata.evidence_version
      ?? metadata.seedVersion
      ?? metadata.seed_version,
  ) || [
    sourceStandard,
    evidenceCodes.length > 0 ? evidenceCodes.join('+') : null,
    'current',
  ].filter(Boolean).join('@')
}

function deriveValidUntil(metadata: Record<string, unknown>) {
  return normalizeDateText(
    metadata.validUntil
      ?? metadata.valid_until
      ?? metadata.evidenceValidUntil
      ?? metadata.evidence_valid_until,
  )
}

function deriveStalePolicy(metadata: Record<string, unknown>) {
  return normalizeText(
    metadata.stalePolicy
      ?? metadata.stale_policy
      ?? metadata.evidenceStalePolicy
      ?? metadata.evidence_stale_policy,
  ) || 'warn_only'
}

function deriveResponsibility(task: GateTask, metadata: Record<string, unknown>) {
  const ownerUnitId = normalizeText(
    task.participant_unit_id
      ?? metadata.ownerUnitId
      ?? metadata.owner_unit_id
      ?? metadata.participantUnitId
      ?? metadata.participant_unit_id,
  )
  const ownerRole = normalizeText(
    metadata.typicalResponsibilityRole
      ?? metadata.typical_responsibility_role
      ?? metadata.responsibilityRole
      ?? metadata.responsibility_role
      ?? metadata.ownerRole
      ?? metadata.owner_role,
  )

  if (!ownerUnitId && !ownerRole) return undefined
  return {
    ownerType: ownerUnitId ? 'participant_unit' as const : 'role' as const,
    ownerUnitId: ownerUnitId || null,
    ownerRole: ownerRole || null,
    basis: ownerUnitId && ownerRole
      ? 'task_participant_unit_and_seed_role'
      : ownerUnitId
        ? 'task_participant_unit'
        : 'seed_role',
  }
}

function governanceForTemplate(params: {
  metadata: Record<string, unknown>
  task: GateTask
  sourceStandard: string | null
  evidenceCodes: string[]
  now: Date
}) {
  const evidenceVersion = deriveEvidenceVersion(params.metadata, params.sourceStandard, params.evidenceCodes)
  const validUntil = deriveValidUntil(params.metadata)
  const today = params.now.toISOString().slice(0, 10)
  return {
    evidenceVersion,
    validUntil,
    stalePolicy: deriveStalePolicy(params.metadata),
    staleReason: validUntil && validUntil < today ? 'evidence_expired' : null,
    responsibility: deriveResponsibility(params.task, params.metadata),
  }
}

function applyGateGovernance<T extends ExecutionGateSeedTemplateBase>(
  template: T,
  governance: ReturnType<typeof governanceForTemplate>,
): T {
  return {
    ...template,
    runtimePolicy: governance.staleReason ? 'candidate_only' : template.runtimePolicy,
    evidenceVersion: governance.evidenceVersion,
    validUntil: governance.validUntil,
    stalePolicy: governance.stalePolicy,
    staleReason: governance.staleReason,
    responsibility: governance.responsibility,
  }
}

function sourceSeedScope(...values: Array<string | null | undefined>) {
  const normalized = values.map(normalizeLower).join(' ')
  if (normalized.includes('gb50300')) return 'gb50300'
  if (normalized.includes('gb55032')) return 'gb55032'
  return 'template_seed'
}

function mapPreconditionTemplate(code: string) {
  const lower = normalizeLower(code)
  if (lower.includes('material')) {
    return { conditionType: '材料', conditionName: 'Material accepted' }
  }
  if (lower.includes('drawing') || lower.includes('design')) {
    return { conditionType: '图纸', conditionName: 'Drawing reviewed' }
  }
  if (lower.includes('person') || lower.includes('labor') || lower.includes('crew')) {
    return { conditionType: '人员', conditionName: 'Crew/resource ready' }
  }
  if (lower.includes('equipment') || lower.includes('machine')) {
    return { conditionType: '设备', conditionName: 'Equipment ready' }
  }
  if (lower.includes('working_face') || lower.includes('site') || lower.includes('handover')) {
    return { conditionType: '其他', conditionName: 'Working face released' }
  }
  return { conditionType: '其他', conditionName: humanizeGateCode(code) }
}

function mapAcceptanceCheckpoint(code: string): { gateType: ExecutionAcceptanceGateTemplate['gateType']; gateName: string } {
  const lower = normalizeLower(code)
  if (lower === 'concealed_acceptance') return { gateType: 'quality_acceptance', gateName: 'Concealed acceptance' }
  if (lower === 'self_check') return { gateType: 'quality_acceptance', gateName: 'Self check' }
  if (lower === 'record_archive') return { gateType: 'quality_acceptance', gateName: 'Record archive' }
  if (lower.includes('water_test')) return { gateType: 'quality_acceptance', gateName: 'Water test acceptance' }
  if (lower.includes('acceptance') || lower.includes('inspection') || lower.includes('check')) {
    return { gateType: 'quality_acceptance', gateName: humanizeGateCode(code) }
  }
  return { gateType: 'quality_acceptance', gateName: humanizeGateCode(code) }
}

function readInternalFlow(metadata: Record<string, unknown>) {
  return readRecord(metadata.internalFlow ?? metadata.internal_flow)
}

function readEvidenceCodes(metadata: Record<string, unknown>, internalFlow: Record<string, unknown>) {
  return readStringArray(
    metadata.evidenceCodes,
    metadata.evidence_codes,
    internalFlow.evidenceCodes,
    internalFlow.evidence_codes,
  )
}

function readProcessConstraintEvidenceCodes(effect: Record<string, unknown>) {
  return readStringArray(
    effect.evidenceCodes,
    effect.evidence_codes,
    effect.evidenceSourceKeys,
    effect.evidence_source_keys,
  )
}

function uniqueBySourceId<T extends { sourceEntityId: string }>(items: T[]) {
  const byId = new Map<string, T>()
  for (const item of items) {
    if (!byId.has(item.sourceEntityId)) byId.set(item.sourceEntityId, item)
  }
  return Array.from(byId.values())
}

function pushRequirementConditionTemplate(params: {
  conditionTemplates: ExecutionConditionGateTemplate[]
  task: GateTask
  stableCode: string
  sourceStandard: string | null
  sourceClauseRef: string | null
  seedScope: string
  evidenceCodes: string[]
  requirementCode: 'material_required' | 'drawing_required'
  preconditionCode: 'material_accepted' | 'drawing_reviewed'
}) {
  const mapped = mapPreconditionTemplate(params.preconditionCode)
  params.conditionTemplates.push({
    conditionCode: `seed:requirement:${params.requirementCode}`,
    conditionName: mapped.conditionName,
    conditionType: mapped.conditionType,
    requiredForStart: true,
    blockingLevel: 'hard',
    description: `${mapped.conditionName} is required before starting ${normalizeText(params.task.title) || 'the task'}.`,
    sourceEntityType: 'algorithm_seed',
    sourceEntityId: `${params.seedScope}:${params.stableCode}:requirement:${params.requirementCode}`,
    sourceStandard: params.sourceStandard,
    sourceClauseRef: params.sourceClauseRef,
    impactMode: 'start_wait',
    impactOwnership: 'condition',
    runtimePolicy: 'deterministic',
    evidenceCodes: params.evidenceCodes,
  })
}

function buildQualityAcceptanceRequirementTemplate(params: {
  task: GateTask
  stableCode: string
  sourceStandard: string | null
  sourceClauseRef: string | null
  evidenceCodes: string[]
}): ExecutionAcceptanceGateTemplate {
  const effectiveSourceStandard = params.sourceStandard || 'GB50300-2013'
  const seedScope = sourceSeedScope(effectiveSourceStandard, params.sourceClauseRef)
  return {
    gateCode: 'seed:requirement:gb50300_quality_acceptance',
    gateName: 'GB50300 quality acceptance',
    gateType: 'quality_acceptance',
    description: `GB50300 quality acceptance is required to close ${normalizeText(params.task.title) || 'the task'}.`,
    sourceEntityType: 'algorithm_seed',
    sourceEntityId: `${seedScope}:${params.stableCode}:requirement:gb50300_quality_acceptance`,
    sourceStandard: effectiveSourceStandard,
    sourceClauseRef: params.sourceClauseRef,
    impactMode: 'finish_gate',
    impactOwnership: 'acceptance',
    runtimePolicy: 'deterministic',
    evidenceCodes: params.evidenceCodes,
  }
}

function processConstraintRuleCode(effect: Record<string, unknown>) {
  return normalizeText(
    effect.ruleCode
      ?? effect.rule_code
      ?? effect.stableCode
      ?? effect.stable_code,
  )
}

function processConstraintGateRequired(effect: Record<string, unknown>) {
  const constraintType = normalizeLower(effect.constraintType ?? effect.constraint_type)
  const applicationMode = normalizeLower(effect.applicationMode ?? effect.application_mode)
  const impactMode = normalizeLower(effect.impactMode ?? effect.impact_mode)
  return normalizeBoolean(effect.gateRequired ?? effect.gate_required)
    || applicationMode === 'gate_wait'
    || impactMode === 'blocking_start'
    || impactMode === 'gate_wait'
    || [
      'acceptance_wait',
      'curing_wait',
      'test_report_wait',
      'handover_wait',
      'commissioning_wait',
      'weather_window',
      'work_hour_window',
      'environment_control',
      'municipal_connection_wait',
      'safety_control_release',
      'monitoring_observation_wait',
      'temperature_control_window',
    ].includes(constraintType)
}

function pushProcessConstraintGateTemplates(params: {
  conditionTemplates: ExecutionConditionGateTemplate[]
  acceptanceGateTemplates: ExecutionAcceptanceGateTemplate[]
  task: GateTask
  stableCode: string
  sourceStandard: string | null
  sourceClauseRef: string | null
  evidenceCodes: string[]
  effect: Record<string, unknown>
}) {
  const ruleCode = processConstraintRuleCode(params.effect)
  if (!ruleCode || !processConstraintGateRequired(params.effect)) return

  const effectSourceStandard = normalizeText(params.effect.sourceStandard ?? params.effect.source_standard) || params.sourceStandard
  const effectSourceClauseRef = normalizeText(params.effect.sourceClauseRef ?? params.effect.source_clause_ref) || params.sourceClauseRef
  const seedScope = sourceSeedScope(effectSourceStandard, effectSourceClauseRef)
  const effectEvidenceCodes = readProcessConstraintEvidenceCodes(params.effect)
  const evidenceCodes = effectEvidenceCodes.length > 0 ? effectEvidenceCodes : params.evidenceCodes
  const constraintType = normalizeText(params.effect.constraintType ?? params.effect.constraint_type) || 'process_constraint'
  const reason = normalizeText(params.effect.businessReason ?? params.effect.business_reason)
  const gateName = `${humanizeGateCode(constraintType)} gate`

  params.conditionTemplates.push({
    conditionCode: `seed:process_constraint:${ruleCode}`,
    conditionName: gateName,
    conditionType: '其他',
    requiredForStart: true,
    blockingLevel: 'hard',
    description: reason || `${gateName} must be released before downstream work starts.`,
    sourceEntityType: 'algorithm_seed',
    sourceEntityId: `${seedScope}:${params.stableCode}:process_constraint:${ruleCode}`,
    sourceStandard: effectSourceStandard,
    sourceClauseRef: effectSourceClauseRef,
    impactMode: 'start_wait',
    impactOwnership: 'condition',
    runtimePolicy: 'deterministic',
    evidenceCodes,
  })

  params.acceptanceGateTemplates.push({
    gateCode: `seed:process_constraint:${ruleCode}`,
    gateName,
    gateType: 'quality_acceptance',
    description: reason || `${gateName} must be confirmed before task close or handover.`,
    sourceEntityType: 'algorithm_seed',
    sourceEntityId: `${seedScope}:${params.stableCode}:process_constraint_acceptance:${ruleCode}`,
    sourceStandard: effectSourceStandard,
    sourceClauseRef: effectSourceClauseRef,
    impactMode: 'finish_gate',
    impactOwnership: 'acceptance',
    runtimePolicy: 'deterministic',
    evidenceCodes,
  })
}

export function deriveExecutionGateSeedTemplates(task: GateTask, now = new Date()): ExecutionGateSeedDerivation {
  const metadata = readRecord(task.standard_task_metadata)
  const taskId = normalizeText(task.id)
  const projectId = normalizeText(task.project_id)
  const stableCode = deriveStableCode(task, metadata) ?? taskId
  const sourceStandard = deriveSourceStandard(task, metadata)
  const sourceClauseRef = deriveSourceClauseRef(metadata)
  const seedScope = sourceSeedScope(sourceStandard, sourceClauseRef)
  const internalFlow = readInternalFlow(metadata)
  const evidenceCodes = readEvidenceCodes(metadata, internalFlow)
  const governance = governanceForTemplate({
    metadata,
    task,
    sourceStandard,
    evidenceCodes,
    now,
  })

  const preconditionTemplates = readStringArray(
    metadata.preconditionTemplates,
    metadata.precondition_templates,
  )
  const conditionTemplates: ExecutionConditionGateTemplate[] = preconditionTemplates.map((code) => {
    const mapped = mapPreconditionTemplate(code)
    const sourceEntityId = `${seedScope}:${stableCode}:precondition:${code}`
    return {
      conditionCode: `seed:precondition:${code}`,
      conditionName: mapped.conditionName,
      conditionType: mapped.conditionType,
      requiredForStart: true,
      blockingLevel: 'hard',
      description: `${mapped.conditionName} is required before starting ${normalizeText(task.title) || 'the task'}.`,
      sourceEntityType: 'algorithm_seed',
      sourceEntityId,
      sourceStandard,
      sourceClauseRef,
      impactMode: 'start_wait',
      impactOwnership: 'condition',
      runtimePolicy: 'deterministic',
      evidenceCodes,
    } satisfies ExecutionConditionGateTemplate
  })

  if (normalizeBoolean(task.material_required ?? metadata.materialRequired ?? metadata.material_required)
    && !preconditionTemplates.includes('material_accepted')) {
    pushRequirementConditionTemplate({
      conditionTemplates,
      task,
      stableCode,
      sourceStandard,
      sourceClauseRef,
      seedScope,
      evidenceCodes,
      requirementCode: 'material_required',
      preconditionCode: 'material_accepted',
    })
  }

  if (normalizeBoolean(task.drawing_required ?? metadata.drawingRequired ?? metadata.drawing_required)
    && !preconditionTemplates.includes('drawing_reviewed')) {
    pushRequirementConditionTemplate({
      conditionTemplates,
      task,
      stableCode,
      sourceStandard,
      sourceClauseRef,
      seedScope,
      evidenceCodes,
      requirementCode: 'drawing_required',
      preconditionCode: 'drawing_reviewed',
    })
  }

  const acceptanceCheckpoints = readStringArray(
    metadata.acceptanceCheckpoints,
    metadata.acceptance_checkpoints,
  )
  const acceptanceGateTemplates: ExecutionAcceptanceGateTemplate[] = acceptanceCheckpoints.map((code) => {
    const mapped = mapAcceptanceCheckpoint(code)
    return {
      gateCode: `seed:acceptance:${code}`,
      gateName: mapped.gateName,
      gateType: mapped.gateType,
      description: `${mapped.gateName} is required to close ${normalizeText(task.title) || 'the task'}.`,
      sourceEntityType: 'algorithm_seed',
      sourceEntityId: `${seedScope}:${stableCode}:acceptance:${code}`,
      sourceStandard,
      sourceClauseRef,
      impactMode: 'finish_gate',
      impactOwnership: 'acceptance',
      runtimePolicy: 'deterministic',
      evidenceCodes,
    }
  })

  if ((normalizeBoolean(task.acceptance_required ?? metadata.acceptanceRequired ?? metadata.acceptance_required)
    || normalizeBoolean(task.quality_required ?? metadata.qualityRequired ?? metadata.quality_required))
    && acceptanceCheckpoints.length === 0) {
    acceptanceGateTemplates.push(buildQualityAcceptanceRequirementTemplate({
      task,
      stableCode,
      sourceStandard,
      sourceClauseRef,
      evidenceCodes,
    }))
  }

  const processConstraintEffects = readRecordArray(
    metadata.processConstraintEffect,
    metadata.process_constraint_effect,
    metadata.processConstraintEffects,
    metadata.process_constraint_effects,
    metadata.processConstraintRules,
    metadata.process_constraint_rules,
  )
  for (const effect of processConstraintEffects) {
    pushProcessConstraintGateTemplates({
      conditionTemplates,
      acceptanceGateTemplates,
      task,
      stableCode,
      sourceStandard,
      sourceClauseRef,
      evidenceCodes,
      effect,
    })
  }

  const internalFlowRelationKind = normalizeLower(internalFlow.relationKind ?? internalFlow.relation_kind)
  const internalFlowRuleId = normalizeText(internalFlow.ruleId ?? internalFlow.rule_id ?? internalFlow.seedRuleId ?? internalFlow.seed_rule_id)
  if (internalFlowRelationKind === 'acceptance_gate' && internalFlowRuleId) {
    acceptanceGateTemplates.push({
      gateCode: `seed:internal_flow:${internalFlowRuleId}`,
      gateName: 'Internal flow acceptance gate',
      gateType: 'internal_flow_acceptance_gate',
      description: 'Standard internal flow requires this acceptance gate before downstream handover.',
      sourceEntityType: 'algorithm_seed',
      sourceEntityId: `standard_internal_flow:${internalFlowRuleId}:${stableCode}`,
      sourceStandard: sourceStandard || 'standard_internal_flow',
      sourceClauseRef,
      impactMode: 'finish_gate',
      impactOwnership: 'acceptance',
      runtimePolicy: 'deterministic',
      evidenceCodes,
    })
  }

  const uniqueAcceptanceTemplates = uniqueBySourceId(acceptanceGateTemplates)
    .map((template) => applyGateGovernance(template, governance))
  const uniqueConditionTemplates = uniqueBySourceId(conditionTemplates)
    .map((template) => applyGateGovernance(template, governance))

  return {
    taskId,
    projectId,
    conditionTemplates: uniqueConditionTemplates,
    acceptanceGateTemplates: uniqueAcceptanceTemplates,
    summary: {
      sourceStandard,
      stableCode,
      conditionTemplateCount: uniqueConditionTemplates.length,
      acceptanceGateTemplateCount: uniqueAcceptanceTemplates.length,
      internalFlowGateCount: internalFlowRelationKind === 'acceptance_gate' && internalFlowRuleId ? 1 : 0,
    },
  }
}

function isoNow() {
  return new Date().toISOString()
}

function dateOnly(value: unknown) {
  return normalizeDateText(value)
}

function serializeGateNotes(template: ExecutionAcceptanceGateTemplate) {
  return JSON.stringify({
    gateCode: template.gateCode,
    sourceEntityType: template.sourceEntityType,
    sourceEntityId: template.sourceEntityId,
    impactMode: template.impactMode,
    impactOwnership: template.impactOwnership,
    runtimePolicy: template.runtimePolicy,
    sourceStandard: template.sourceStandard,
    sourceClauseRef: template.sourceClauseRef,
    evidenceCodes: template.evidenceCodes,
    evidenceVersion: template.evidenceVersion,
    validUntil: template.validUntil ?? null,
    stalePolicy: template.stalePolicy,
    staleReason: template.staleReason ?? null,
    responsibility: template.responsibility ?? null,
  })
}

function matchesExistingAcceptanceGate(row: AcceptancePlanIdentityRow, template: ExecutionAcceptanceGateTemplate) {
  if (normalizeText(row.type_id) === template.gateCode) return true

  const notes = readRecord(row.notes)
  return normalizeText(notes.sourceEntityId ?? notes.source_entity_id) === template.sourceEntityId
    || normalizeText(notes.gateCode ?? notes.gate_code) === template.gateCode
}

export async function syncExecutionGateSeedTemplatesForTask(params: SyncExecutionGateSeedTemplatesParams) {
  const { task, actorId } = params
  const derivation = deriveExecutionGateSeedTemplates(task)
  if (!derivation.taskId || !derivation.projectId) {
    return {
      createdConditionCount: 0,
      createdAcceptanceGateCount: 0,
      skippedConditionCount: 0,
      skippedAcceptanceGateCount: 0,
      summary: derivation.summary,
    }
  }

  let createdConditionCount = 0
  let skippedConditionCount = 0
  let createdAcceptanceGateCount = 0
  let skippedAcceptanceGateCount = 0

  let existingAcceptanceGateRows: AcceptancePlanIdentityRow[] = []
  if (derivation.acceptanceGateTemplates.length > 0) {
    const taskLinks = await executeSQL<AcceptancePlanTaskLinkRow>(
      "SELECT source_entity_id FROM project_entity_links WHERE project_id = ? AND source_entity_type = 'acceptance_plan' AND target_entity_type = 'task' AND target_entity_id = ? AND relation_type = 'covers_task' AND status = 'active' LIMIT 200",
      [derivation.projectId, derivation.taskId],
    )
    const linkedAcceptancePlanIds = new Set(
      taskLinks.map((row) => normalizeText(row.source_entity_id)).filter(Boolean),
    )
    if (linkedAcceptancePlanIds.size > 0) {
      const projectAcceptancePlans = await executeSQL<AcceptancePlanIdentityRow>(
        'SELECT id, type_id, notes FROM acceptance_plans WHERE project_id = ? LIMIT 200',
        [derivation.projectId],
      )
      existingAcceptanceGateRows = projectAcceptancePlans.filter((row) => (
        linkedAcceptancePlanIds.has(normalizeText(row.id))
      ))
    }
  }

  for (const template of derivation.conditionTemplates) {
    const existing = await executeSQL<{ id?: string }>(
      'SELECT id FROM task_conditions WHERE task_id = ? AND project_id = ? AND source_entity_type = ? AND source_entity_id = ? LIMIT 1',
      [derivation.taskId, derivation.projectId, template.sourceEntityType, template.sourceEntityId],
    )
    if (existing.length > 0) {
      skippedConditionCount += 1
      continue
    }

    const ts = isoNow()
    await executeSQL(
      'INSERT INTO task_conditions (id, task_id, project_id, condition_type, name, description, is_satisfied, source_entity_type, source_entity_id, condition_code, required_for_start, blocking_level, source_type, inference_confidence, inference_reason, governance_metadata, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        randomUUID(),
        derivation.taskId,
        derivation.projectId,
        template.conditionType,
        template.conditionName,
        template.description,
        false,
        template.sourceEntityType,
        template.sourceEntityId,
        template.conditionCode,
        template.requiredForStart,
        template.blockingLevel,
        'seed',
        'high',
        `Seed-backed gate from ${template.sourceStandard ?? 'template metadata'}`,
        JSON.stringify({
          sourceStandard: template.sourceStandard,
          sourceClauseRef: template.sourceClauseRef,
          impactMode: template.impactMode,
          impactOwnership: template.impactOwnership,
          runtimePolicy: template.runtimePolicy,
          evidenceCodes: template.evidenceCodes,
          evidenceVersion: template.evidenceVersion,
          validUntil: template.validUntil ?? null,
          stalePolicy: template.stalePolicy,
          staleReason: template.staleReason ?? null,
          responsibility: template.responsibility ?? null,
        }),
        actorId ?? null,
        ts,
        ts,
      ],
    )
    createdConditionCount += 1
  }

  for (const template of derivation.acceptanceGateTemplates) {
    if (existingAcceptanceGateRows.some((row) => matchesExistingAcceptanceGate(row, template))) {
      skippedAcceptanceGateCount += 1
      continue
    }

    const ts = isoNow()
    const planId = randomUUID()
    await executeSQL(
      'INSERT INTO acceptance_plans (id, project_id, acceptance_type, acceptance_name, type_id, type_name, description, planned_date, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        planId,
        derivation.projectId,
        template.gateType,
        template.gateName,
        template.gateCode,
        template.gateName,
        template.description,
        dateOnly(task.planned_end_date ?? task.end_date) ?? dateOnly(task.planned_start_date ?? task.start_date) ?? ts.slice(0, 10),
        'pending',
        serializeGateNotes(template),
        actorId ?? null,
        ts,
        ts,
      ],
    )
    await executeSQL(
      `INSERT INTO project_entity_links (
         project_id, source_entity_type, source_entity_id, target_entity_type,
         target_entity_id, relation_type, relation_strength, status, created_at, updated_at
       ) VALUES (?, 'acceptance_plan', ?, 'task', ?, 'covers_task', 'explicit', 'active', ?, ?)`,
      [derivation.projectId, planId, derivation.taskId, ts, ts],
    )
    createdAcceptanceGateCount += 1
  }

  return {
    createdConditionCount,
    createdAcceptanceGateCount,
    skippedConditionCount,
    skippedAcceptanceGateCount,
    summary: derivation.summary,
  }
}
