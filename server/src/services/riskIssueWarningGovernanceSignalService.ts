export type GovernanceSignalActionPolicy = 'observe_only' | 'candidate_warning' | 'create_warning'
export type GovernanceSignalSourceAlgorithm =
  | 'algorithm_seed'
  | 'duration_context'
  | 'execution_impact'
  | 'planning_governance'
  | 'data_quality'
  | 'project_schedule_state'
  | 'manual'
  | 'unknown'

export type GovernanceSignalPromotionStatus = 'explain_only' | 'warning_candidate' | 'warning_allowed'

export interface RiskIssueWarningGovernanceSignal {
  signalType: string
  stableCode?: string | null
  sourceAlgorithm?: GovernanceSignalSourceAlgorithm
  sourceId?: string | null
  sourceEntityId?: string | null
  dedupeKey?: string
  actionPolicy: GovernanceSignalActionPolicy
  canCreateWarning: boolean
  canCreateRisk: boolean
  canCreateIssue: boolean
  projectId?: string | null
  taskId?: string | null
  severity?: 'info' | 'warning' | 'critical' | null
  evidence: Array<Record<string, unknown>>
  promotionStatus?: GovernanceSignalPromotionStatus
  attribution?: {
    primarySourceAlgorithm: GovernanceSignalSourceAlgorithm
    sourceAlgorithms: GovernanceSignalSourceAlgorithm[]
    sourceIds: string[]
    evidenceCount: number
  }
  boundaryReason: string
}

export interface GovernanceSignalDirectoryInput {
  sourceAlgorithm?: string | null
  sourceId?: string | null
  sourceEntityId?: string | null
  signalType: string
  stableCode?: string | null
  actionPolicy?: GovernanceSignalActionPolicy | 'candidate_only' | 'confidence_only' | 'explain_only' | null
  projectId?: string | null
  taskId?: string | null
  severity?: string | null
  evidence?: Array<Record<string, unknown>>
  runtimeEvidence?: Array<Record<string, unknown>>
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function readBoundaryPolicy(meta: Record<string, any>, seed: Record<string, any>) {
  const metaBoundary = Array.isArray(meta.boundaryPolicy) ? meta.boundaryPolicy : []
  const seedBoundary = Array.isArray(seed.boundaryPolicy) ? seed.boundaryPolicy : []
  return [...metaBoundary, ...seedBoundary].map((item) => normalizeText(item)).filter(Boolean)
}

function normalizeSeverity(value: unknown): RiskIssueWarningGovernanceSignal['severity'] {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'critical') return 'critical'
  if (normalized === 'info') return 'info'
  if (normalized === 'warning') return 'warning'
  return null
}

function normalizeSourceAlgorithm(value: unknown): GovernanceSignalSourceAlgorithm {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'algorithm_seed') return 'algorithm_seed'
  if (normalized === 'duration_context') return 'duration_context'
  if (normalized === 'execution_impact') return 'execution_impact'
  if (normalized === 'planning_governance') return 'planning_governance'
  if (normalized === 'data_quality') return 'data_quality'
  if (normalized === 'project_schedule_state') return 'project_schedule_state'
  if (normalized === 'manual') return 'manual'
  return 'unknown'
}

function normalizeActionPolicy(value: unknown): GovernanceSignalActionPolicy {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'create_warning') return 'create_warning'
  if (normalized === 'observe_only' || normalized === 'confidence_only' || normalized === 'explain_only') return 'observe_only'
  return 'candidate_warning'
}

function selectEvidence(input: GovernanceSignalDirectoryInput): Array<Record<string, unknown>> {
  if (Array.isArray(input.runtimeEvidence) && input.runtimeEvidence.length > 0) return input.runtimeEvidence
  if (Array.isArray(input.evidence)) return input.evidence
  return []
}

function hasWarningPromotionSubject(input: GovernanceSignalDirectoryInput) {
  return Boolean(
    normalizeText(input.taskId)
    || normalizeText(input.sourceEntityId)
    || normalizeText(input.sourceId),
  )
}

function buildGovernanceDedupeKey(input: GovernanceSignalDirectoryInput): string {
  const projectId = normalizeText(input.projectId) || 'unknown_project'
  const signalType = normalizeText(input.signalType) || 'runtime_signal'
  const subject = normalizeText(input.taskId)
    || normalizeText(input.sourceEntityId)
    || normalizeText(input.sourceId)
    || 'project'
  return `${projectId}::${signalType}::${subject}`
}

function actionPolicyRank(policy: GovernanceSignalActionPolicy) {
  if (policy === 'create_warning') return 3
  if (policy === 'candidate_warning') return 2
  return 1
}

function severityRank(severity: RiskIssueWarningGovernanceSignal['severity']) {
  if (severity === 'critical') return 3
  if (severity === 'warning') return 2
  if (severity === 'info') return 1
  return 0
}

function sourceRank(signal: RiskIssueWarningGovernanceSignal) {
  if (signal.canCreateWarning && signal.sourceAlgorithm !== 'algorithm_seed') return 40
  if (signal.actionPolicy === 'create_warning') return 30
  if (signal.sourceAlgorithm !== 'algorithm_seed' && signal.sourceAlgorithm !== 'unknown') return 20
  if (signal.actionPolicy === 'candidate_warning') return 10
  return 0
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
}

function uniqueSourceAlgorithms(values: GovernanceSignalSourceAlgorithm[]): GovernanceSignalSourceAlgorithm[] {
  return Array.from(new Set(values))
}

function withAttribution(signal: RiskIssueWarningGovernanceSignal): RiskIssueWarningGovernanceSignal {
  const sourceAlgorithm = signal.sourceAlgorithm ?? 'unknown'
  const sourceIds = uniqueStrings([signal.sourceId])
  return {
    ...signal,
    attribution: {
      primarySourceAlgorithm: sourceAlgorithm,
      sourceAlgorithms: [sourceAlgorithm],
      sourceIds,
      evidenceCount: signal.evidence.length,
    },
  }
}

export function evaluateSeedWarningPromotion(input: GovernanceSignalDirectoryInput): RiskIssueWarningGovernanceSignal {
  const sourceAlgorithm = normalizeSourceAlgorithm(input.sourceAlgorithm)
  const actionPolicy = normalizeActionPolicy(input.actionPolicy)
  const evidence = selectEvidence(input)
  const hasEvidence = evidence.length > 0
  const hasProject = Boolean(normalizeText(input.projectId))
  const hasSubject = hasWarningPromotionSubject(input)
  const canCreateWarning = actionPolicy === 'create_warning' && hasEvidence && hasProject && hasSubject
  const normalizedPolicy: GovernanceSignalActionPolicy = canCreateWarning
    ? 'create_warning'
    : actionPolicy === 'observe_only'
      ? 'observe_only'
      : 'candidate_warning'

  let boundaryReason = 'seed_or_candidate_signal_requires_runtime_evidence'
  if (canCreateWarning) {
    boundaryReason = 'runtime_evidence_can_create_warning_only'
  } else if (actionPolicy === 'create_warning' && (!hasProject || !hasSubject)) {
    boundaryReason = 'missing_project_or_subject_for_warning_promotion'
  } else if (normalizedPolicy === 'observe_only') {
    boundaryReason = 'explain_only_signal_not_promoted'
  }

  const signal: RiskIssueWarningGovernanceSignal = {
    signalType: normalizeText(input.signalType) || 'runtime_signal',
    stableCode: normalizeText(input.stableCode) || null,
    sourceAlgorithm,
    sourceId: normalizeText(input.sourceId) || null,
    sourceEntityId: normalizeText(input.sourceEntityId) || null,
    dedupeKey: buildGovernanceDedupeKey(input),
    actionPolicy: normalizedPolicy,
    canCreateWarning,
    canCreateRisk: false,
    canCreateIssue: false,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    severity: normalizeSeverity(input.severity),
    evidence,
    promotionStatus: canCreateWarning
      ? 'warning_allowed'
      : normalizedPolicy === 'observe_only'
        ? 'explain_only'
        : 'warning_candidate',
    boundaryReason,
  }

  return withAttribution(signal)
}

export function normalizeGovernanceSignalDirectory(
  inputs: GovernanceSignalDirectoryInput[],
): RiskIssueWarningGovernanceSignal[] {
  return inputs.map((input) => evaluateSeedWarningPromotion(input))
}

export function dedupeGovernanceSignals(
  signals: RiskIssueWarningGovernanceSignal[],
): RiskIssueWarningGovernanceSignal[] {
  const buckets = new Map<string, RiskIssueWarningGovernanceSignal[]>()
  for (const signal of signals) {
    const key = signal.dedupeKey || buildGovernanceDedupeKey({
      signalType: signal.signalType,
      projectId: signal.projectId,
      taskId: signal.taskId,
      sourceEntityId: signal.sourceEntityId,
      sourceId: signal.sourceId,
    })
    const bucket = buckets.get(key) ?? []
    bucket.push(signal)
    buckets.set(key, bucket)
  }

  return Array.from(buckets.values()).map((bucket) => {
    const sorted = [...bucket].sort((a, b) => {
      const sourceDiff = sourceRank(b) - sourceRank(a)
      if (sourceDiff !== 0) return sourceDiff
      const policyDiff = actionPolicyRank(b.actionPolicy) - actionPolicyRank(a.actionPolicy)
      if (policyDiff !== 0) return policyDiff
      return severityRank(b.severity) - severityRank(a.severity)
    })
    const primary = sorted[0]
    const evidence = sorted.flatMap((signal) => signal.evidence)
    const sourceAlgorithms = uniqueSourceAlgorithms(sorted.map((signal) => signal.sourceAlgorithm ?? 'unknown'))
    const sourceIds = uniqueStrings(sorted.map((signal) => signal.sourceId))
    const canCreateWarning = sorted.some((signal) => signal.canCreateWarning)
    const strongestPolicy = sorted.reduce<GovernanceSignalActionPolicy>((current, signal) => (
      actionPolicyRank(signal.actionPolicy) > actionPolicyRank(current) ? signal.actionPolicy : current
    ), 'observe_only')
    const strongestSeverity = sorted.reduce<RiskIssueWarningGovernanceSignal['severity']>((current, signal) => (
      severityRank(signal.severity) > severityRank(current) ? signal.severity : current
    ), null)

    return {
      ...primary,
      actionPolicy: canCreateWarning ? 'create_warning' : strongestPolicy,
      canCreateWarning,
      canCreateRisk: false,
      canCreateIssue: false,
      severity: strongestSeverity,
      evidence,
      promotionStatus: canCreateWarning
        ? 'warning_allowed'
        : strongestPolicy === 'observe_only'
          ? 'explain_only'
          : 'warning_candidate',
      attribution: {
        primarySourceAlgorithm: primary.sourceAlgorithm ?? 'unknown',
        sourceAlgorithms,
        sourceIds,
        evidenceCount: evidence.length,
      },
    }
  })
}

export function normalizeGovernanceSignalFromSeedAsset(input: {
  seedType: string
  seed: Record<string, any>
  meta?: Record<string, any>
}): RiskIssueWarningGovernanceSignal {
  const meta = readRecord(input.meta)
  const seed = readRecord(input.seed)
  const effectPolicy = readRecord(seed.effectPolicy ?? seed.effect_policy)
  const boundaryPolicy = readBoundaryPolicy(meta, seed)
  const actionPolicy = normalizeText(effectPolicy.actionPolicy ?? effectPolicy.action_policy)
  const canCreateRiskIssue = effectPolicy.canCreateRiskIssue === true || effectPolicy.can_create_risk_issue === true
  const blocksRiskIssue = !canCreateRiskIssue
    || boundaryPolicy.includes('does_not_create_risk_or_issue')
    || actionPolicy.includes('candidate')

  return {
    signalType: normalizeText(input.seedType) || normalizeText(meta.relationshipRole) || 'algorithm_seed',
    stableCode: normalizeText(seed.stableCode ?? seed.stable_code ?? seed.__stableCode) || null,
    sourceAlgorithm: 'algorithm_seed',
    sourceId: normalizeText(seed.stableCode ?? seed.stable_code ?? seed.__stableCode) || null,
    actionPolicy: blocksRiskIssue ? 'candidate_warning' : 'observe_only',
    canCreateWarning: false,
    canCreateRisk: false,
    canCreateIssue: false,
    severity: null,
    evidence: [{
      source: 'algorithm_seed',
      seedType: input.seedType,
      stableCode: seed.stableCode ?? seed.stable_code ?? seed.__stableCode ?? null,
      sourceVersion: seed.sourceVersion ?? seed.source_version ?? meta.seedVersion ?? null,
    }],
    promotionStatus: blocksRiskIssue ? 'warning_candidate' : 'explain_only',
    boundaryReason: blocksRiskIssue
      ? `seed_boundary:${boundaryPolicy.join(',') || actionPolicy || 'candidate_only'}`
      : 'seed_without_runtime_evidence',
  }
}

export function normalizeGovernanceSignalFromRuntimeEvidence(input: {
  signalType: string
  actionPolicy: GovernanceSignalActionPolicy
  projectId?: string | null
  taskId?: string | null
  severity?: string | null
  evidence?: Array<Record<string, unknown>>
}): RiskIssueWarningGovernanceSignal {
  const hasEvidence = Array.isArray(input.evidence) && input.evidence.length > 0
  const canCreateWarning = input.actionPolicy === 'create_warning' && hasEvidence
  return {
    signalType: normalizeText(input.signalType) || 'runtime_signal',
    sourceAlgorithm: 'unknown',
    actionPolicy: canCreateWarning ? 'create_warning' : 'candidate_warning',
    canCreateWarning,
    canCreateRisk: false,
    canCreateIssue: false,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    severity: normalizeSeverity(input.severity),
    evidence: input.evidence ?? [],
    promotionStatus: canCreateWarning ? 'warning_allowed' : 'warning_candidate',
    boundaryReason: canCreateWarning
      ? 'runtime_evidence_can_create_warning_only'
      : 'missing_runtime_evidence_or_not_warning_action',
  }
}
