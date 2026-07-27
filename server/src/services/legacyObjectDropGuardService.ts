export type LegacyObjectDropStatus =
  | 'blocked'
  | 'drop_ready'
  | 'needs_gating'
  | 'retain_compatibility'
  | 'intentionally_retained'

export type LegacyObjectDependencyCategory =
  | 'runtime'
  | 'import'
  | 'route'
  | 'frontend'
  | 'test'
  | 'registry'
  | 'schema'
  | 'view'
  | 'function'
  | 'trigger'
  | 'foreign_key'
  | 'rls'
  | 'policy'
  | 'job'
  | 'seed'
  | 'migration'

export type LegacyObjectDropReason =
  | 'classification_not_obsolete_or_superseded'
  | 'row_count_unknown'
  | 'row_count_not_zero'
  | 'row_count_zero_not_sufficient'
  | 'dependency_scan_not_passed'
  | 'missing_structure_export'
  | 'missing_migration_plan'
  | 'missing_rollback_plan'
  | 'missing_controlled_drop_migration'
  | 'missing_catalog_readback'
  | 'post_drop_readback_not_required'
  | 'post_drop_readback_not_passed'
  | 'dependency_readback_not_passed'
  | 'post_drop_api_smoke_not_passed'
  | 'missing_approval_ref'
  | 'dependency_detected'
  | 'migration_drop_candidate_evidence_required'
  | 'compatibility_surface'
  | 'intentionally_retained'

export interface LegacyObjectDropCandidate {
  objectName: string
  classification?: string
  rowCount?: number | null
  dependencyScan?: {
    pass?: boolean
    evidencePath?: string | null
  }
  structureExport?: {
    path?: string | null
  }
  migrationPlan?: {
    path?: string | null
  }
  rollbackPlan?: {
    path?: string | null
  }
  controlledDropMigration?: {
    filename?: string | null
  }
  postDropReadback?: {
    required?: boolean
    pass?: boolean
    evidencePath?: string | null
  }
  catalogReadback?: {
    pass?: boolean
    path?: string | null
  }
  dependencyReadback?: {
    pass?: boolean
    path?: string | null
  }
  postDropApiSmoke?: {
    pass?: boolean
    path?: string | null
  }
  approvalRef?: string | null
  dependencies?: Partial<Record<LegacyObjectDependencyCategory, string[]>>
}

export interface LegacyObjectDropEvaluation {
  objectName: string
  status: LegacyObjectDropStatus
  reasons: LegacyObjectDropReason[]
}

export interface LegacyObjectDropGuardReport {
  status: 'blocked' | 'drop_ready' | 'needs_gating'
  reasons?: LegacyObjectDropReason[]
  candidates: LegacyObjectDropEvaluation[]
}

const blockingDependencyCategories: LegacyObjectDependencyCategory[] = [
  'runtime',
  'import',
  'route',
  'frontend',
  'test',
  'registry',
  'schema',
  'view',
  'function',
  'trigger',
  'foreign_key',
  'rls',
  'policy',
  'job',
  'seed',
  'migration',
]

export function evaluateLegacyObjectDropCandidates(
  candidates: LegacyObjectDropCandidate[],
): LegacyObjectDropEvaluation[] {
  return candidates.map(evaluateLegacyObjectDropCandidate)
}

export function evaluateLegacyObjectDropGuardReport(
  candidates: LegacyObjectDropCandidate[],
): LegacyObjectDropGuardReport {
  const evaluations = evaluateLegacyObjectDropCandidates(candidates)

  return {
    status: summarizeDropGuardStatus(evaluations),
    candidates: evaluations,
  }
}

export function createBlockedSafeLegacyObjectDropReport(reason: LegacyObjectDropReason) {
  return {
    status: 'blocked' as const,
    reasons: [reason],
    candidates: [],
  }
}

function evaluateLegacyObjectDropCandidate(
  candidate: LegacyObjectDropCandidate,
): LegacyObjectDropEvaluation {
  if (candidate.classification === 'compatibility') {
    return compatibilityResult(candidate)
  }

  if (candidate.classification === 'intentionally_retained') {
    return intentionallyRetainedResult(candidate)
  }

  const reasons = collectDropBlockingReasons(candidate)

  return {
    objectName: candidate.objectName,
    status: statusFromReasons(reasons),
    reasons,
  }
}

function collectDropBlockingReasons(candidate: LegacyObjectDropCandidate): LegacyObjectDropReason[] {
  const reasons: LegacyObjectDropReason[] = []

  if (candidate.classification !== 'obsolete_or_superseded') {
    reasons.push('classification_not_obsolete_or_superseded')
  }

  if (candidate.rowCount === undefined || candidate.rowCount === null) {
    reasons.push('row_count_unknown')
  } else if (candidate.rowCount !== 0) {
    reasons.push('row_count_not_zero')
  }

  if (candidate.dependencyScan?.pass !== true) {
    reasons.push('dependency_scan_not_passed')
  }

  if (!hasText(candidate.structureExport?.path)) {
    reasons.push('missing_structure_export')
  }

  if (!hasText(candidate.migrationPlan?.path)) {
    reasons.push('missing_migration_plan')
  }

  if (!hasText(candidate.rollbackPlan?.path)) {
    reasons.push('missing_rollback_plan')
  }

  if (!hasText(candidate.controlledDropMigration?.filename)) {
    reasons.push('missing_controlled_drop_migration')
  }

  if (candidate.postDropReadback?.required !== true) {
    reasons.push('post_drop_readback_not_required')
  } else if (candidate.postDropReadback.pass !== true) {
    reasons.push('post_drop_readback_not_passed')
  } else {
    if (candidate.catalogReadback?.pass !== true || !hasText(candidate.catalogReadback.path)) {
      reasons.push('missing_catalog_readback')
    }
    if (candidate.dependencyReadback?.pass !== true || !hasText(candidate.dependencyReadback.path)) {
      reasons.push('dependency_readback_not_passed')
    }
    if (candidate.postDropApiSmoke?.pass !== true || !hasText(candidate.postDropApiSmoke.path)) {
      reasons.push('post_drop_api_smoke_not_passed')
    }
    if (!hasText(candidate.approvalRef)) {
      reasons.push('missing_approval_ref')
    }
  }

  if (hasBlockingDependencies(candidate)) {
    reasons.push('dependency_detected')
  }

  if (candidate.rowCount === 0 && hasPreReadbackBlockingReason(reasons)) {
    reasons.push('row_count_zero_not_sufficient')
  }

  return [...new Set(reasons)]
}

function summarizeDropGuardStatus(evaluations: LegacyObjectDropEvaluation[]): LegacyObjectDropGuardReport['status'] {
  if (evaluations.length > 0 && evaluations.every((candidate) => candidate.status === 'drop_ready')) {
    return 'drop_ready'
  }
  if (
    evaluations.length > 0
    && evaluations.every((candidate) => candidate.status === 'drop_ready' || candidate.status === 'needs_gating')
    && evaluations.some((candidate) => candidate.status === 'needs_gating')
  ) {
    return 'needs_gating'
  }
  return 'blocked'
}

function statusFromReasons(reasons: LegacyObjectDropReason[]): LegacyObjectDropStatus {
  if (reasons.length === 0) return 'drop_ready'
  if (reasons.length === 1 && reasons[0] === 'post_drop_readback_not_passed') return 'needs_gating'
  return 'blocked'
}

function hasPreReadbackBlockingReason(reasons: LegacyObjectDropReason[]) {
  return reasons.some((reason) => reason !== 'row_count_not_zero' && reason !== 'post_drop_readback_not_passed')
}

function hasBlockingDependencies(candidate: LegacyObjectDropCandidate) {
  return blockingDependencyCategories.some((category) => {
    const entries = candidate.dependencies?.[category]
    return Array.isArray(entries) && entries.length > 0
  })
}

function compatibilityResult(candidate: LegacyObjectDropCandidate): LegacyObjectDropEvaluation {
  return {
    objectName: candidate.objectName,
    status: 'retain_compatibility',
    reasons: ['compatibility_surface'],
  }
}

function intentionallyRetainedResult(candidate: LegacyObjectDropCandidate): LegacyObjectDropEvaluation {
  return {
    objectName: candidate.objectName,
    status: 'intentionally_retained',
    reasons: ['intentionally_retained'],
  }
}

function hasText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}
