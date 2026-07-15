import { readFile } from 'node:fs/promises'
import path from 'node:path'

const PASSING_REAL_OUTCOME_STATUSES = new Set(['pass', 'passed', 'verified', 'accepted', 'ready'])
const PRODUCTION_READY_ENVIRONMENTS = new Set(['production', 'live'])

export async function validateRealProductionOutcomeFile(filePath, expected = {}) {
  let payload = {}
  try {
    payload = readObject(JSON.parse(await readFile(path.resolve(filePath), 'utf8')))
  } catch (error) {
    if (error?.code === 'ENOENT') return ['real_production_outcome_source_file_missing']
    return ['real_production_outcome_source_file_invalid_json']
  }
  return validateRealProductionOutcomeEvidence(payload, expected)
}

export function validateRealProductionOutcomeEvidence(payload, expected = {}) {
  const evidence = normalizeRealProductionOutcomeEvidence(payload)
  const blockers = []
  if (!PASSING_REAL_OUTCOME_STATUSES.has(evidence.status.toLowerCase())) {
    blockers.push('real_production_outcome_status_pass_required')
  }
  if (!evidence.environment) {
    blockers.push('real_production_outcome_environment_required')
  } else {
    if (!PRODUCTION_READY_ENVIRONMENTS.has(evidence.environment.toLowerCase())) {
      blockers.push('real_production_outcome_production_or_live_environment_required')
    }
    if (text(expected.targetEnvironment) && evidence.environment.toLowerCase() !== text(expected.targetEnvironment).toLowerCase()) {
      blockers.push('real_production_outcome_environment_mismatch')
    }
  }
  if (evidence.baselineId !== text(expected.baselineId)) {
    blockers.push('real_production_outcome_baseline_id_mismatch')
  }
  if (evidence.projectId !== text(expected.projectId)) {
    blockers.push('real_production_outcome_project_id_mismatch')
  }
  if (evidence.publicationKey !== text(expected.publicationKey)) {
    blockers.push('real_production_outcome_publication_key_mismatch')
  }
  if (!evidence.evidenceRef) {
    blockers.push('real_production_outcome_evidence_ref_required')
  } else if (!isAuditableEvidenceRef(evidence.evidenceRef)) {
    blockers.push('real_production_outcome_evidence_ref_auditable_required')
  } else if (expected.requireSourceExportEvidenceRef && !isAuditableRealProductionOutcomeExportRef(evidence.evidenceRef)) {
    blockers.push('real_production_outcome_evidence_ref_source_export_required')
  }
  blockers.push(...realProductionOutcomeTargetBlockers(evidence, expected))
  blockers.push(...realProductionOutcomeMaterialCompletenessBlockers(evidence))
  return blockers
}

export function realProductionOutcomeQualityBlockers(payload) {
  const evidence = normalizeRealProductionOutcomeEvidence(payload)
  return [
    PASSING_REAL_OUTCOME_STATUSES.has(evidence.status.toLowerCase()) ? null : 'real_production_outcome_status_pass_required',
    PRODUCTION_READY_ENVIRONMENTS.has(evidence.environment.toLowerCase()) ? null : 'real_production_outcome_production_or_live_environment_required',
    evidence.evidenceRef ? null : 'real_production_outcome_evidence_ref_required',
    evidence.evidenceRef && !isAuditableEvidenceRef(evidence.evidenceRef) ? 'real_production_outcome_evidence_ref_auditable_required' : null,
    ...realProductionOutcomeTargetBlockers(evidence),
    ...realProductionOutcomeMaterialCompletenessBlockers(evidence),
  ].filter(Boolean)
}

export function normalizeRealProductionOutcomeEvidence(payload) {
  const record = readObject(payload)
  return {
    status: text(record.status),
    environment: text(record.environment ?? record.targetEnvironment ?? record.target_environment ?? record.runtimeEnvironment ?? record.runtime_environment ?? record.releaseEnvironment ?? record.release_environment),
    target: normalizeRealProductionOutcomeTarget(record),
    baselineId: text(record.baselineId ?? record.baseline_id),
    projectId: text(record.projectId ?? record.project_id),
    publicationKey: text(record.publicationKey ?? record.publication_key),
    evidenceRef: text(record.evidenceRef ?? record.evidence_ref ?? record.sourceEvidenceRef ?? record.source_evidence_ref ?? record.ref),
    acceptedBy: text(record.acceptedBy ?? record.accepted_by ?? record.reviewedBy ?? record.reviewed_by),
    acceptedAt: text(record.acceptedAt ?? record.accepted_at ?? record.reviewedAt ?? record.reviewed_at),
    approvalRef: text(record.approvalRef ?? record.approval_ref ?? record.manualApprovalRef ?? record.manual_approval_ref ?? record.releaseApprovalRef ?? record.release_approval_ref),
    runtimePublicationEvidenceRef: text(record.runtimePublicationEvidenceRef ?? record.runtime_publication_evidence_ref ?? record.runtimePublicationRef ?? record.runtime_publication_ref),
    apiReadSmokeEvidenceRef: text(record.apiReadSmokeEvidenceRef ?? record.api_read_smoke_evidence_ref ?? record.apiSmokeEvidenceRef ?? record.api_smoke_evidence_ref),
    uiConsumptionSmokeEvidenceRef: text(record.uiConsumptionSmokeEvidenceRef ?? record.ui_consumption_smoke_evidence_ref ?? record.uiSmokeEvidenceRef ?? record.ui_smoke_evidence_ref),
    criticalPathReadbackEvidenceRef: text(record.criticalPathReadbackEvidenceRef ?? record.critical_path_readback_evidence_ref ?? record.criticalPathEvidenceRef ?? record.critical_path_evidence_ref),
    rollbackEvidenceRef: text(record.rollbackEvidenceRef ?? record.rollback_evidence_ref ?? record.rollbackVerificationEvidenceRef ?? record.rollback_verification_evidence_ref),
  }
}

function normalizeRealProductionOutcomeTarget(record) {
  const target = readObject(record.target ?? record.environmentTarget ?? record.environment_target ?? record.runtimeTarget ?? record.runtime_target ?? record.releaseTarget ?? record.release_target)
  return {
    envFileRef: text(target.envFileRef ?? target.env_file_ref ?? target.envRef ?? target.env_ref ?? record.targetEnvFileRef ?? record.target_env_file_ref),
    supabaseProjectRef: text(target.supabaseProjectRef ?? target.supabase_project_ref ?? target.projectRef ?? target.project_ref ?? record.targetSupabaseProjectRef ?? record.target_supabase_project_ref),
    databaseHost: text(target.databaseHost ?? target.database_host ?? target.dbHost ?? target.db_host ?? record.targetDatabaseHost ?? record.target_database_host),
    connectionSource: text(target.connectionSource ?? target.connection_source ?? record.targetConnectionSource ?? record.target_connection_source),
    environment: text(target.environment ?? target.targetEnvironment ?? target.target_environment ?? target.runtimeEnvironment ?? target.runtime_environment),
  }
}

function realProductionOutcomeTargetBlockers(evidence, expected = {}) {
  const target = readObject(evidence.target)
  const hasAnyTargetField = Boolean(
    text(target.envFileRef)
    || text(target.supabaseProjectRef)
    || text(target.databaseHost)
    || text(target.connectionSource)
    || text(target.environment),
  )
  const expectedEnvironment = text(expected.targetEnvironment) || evidence.environment
  return [
    hasAnyTargetField ? null : 'real_production_outcome_target_required',
    text(target.supabaseProjectRef) ? null : 'real_production_outcome_target_supabase_project_ref_required',
    text(target.supabaseProjectRef) && !isValidSupabaseProjectRef(target.supabaseProjectRef)
      ? 'real_production_outcome_target_supabase_project_ref_format_required'
      : null,
    text(target.databaseHost) ? null : 'real_production_outcome_target_database_host_required',
    text(target.databaseHost) && !isValidDatabaseHost(target.databaseHost, target.supabaseProjectRef)
      ? 'real_production_outcome_target_database_host_format_required'
      : null,
    text(target.connectionSource) ? null : 'real_production_outcome_target_connection_source_required',
    text(target.connectionSource) && !isValidConnectionSource(target.connectionSource)
      ? 'real_production_outcome_target_connection_source_format_required'
      : null,
    text(target.environment) ? null : 'real_production_outcome_target_environment_required',
    text(target.environment) && expectedEnvironment && target.environment.toLowerCase() !== expectedEnvironment.toLowerCase()
      ? 'real_production_outcome_target_environment_mismatch'
      : null,
  ].filter(Boolean)
}

function realProductionOutcomeMaterialCompletenessBlockers(evidence) {
  return [
    evidence.acceptedBy ? null : 'real_production_outcome_accepted_by_required',
    evidence.acceptedBy && !isAuditableActorRef(evidence.acceptedBy) ? 'real_production_outcome_accepted_by_auditable_required' : null,
    evidence.acceptedAt ? null : 'real_production_outcome_accepted_at_required',
    evidence.acceptedAt && !isIsoTimestamp(evidence.acceptedAt) ? 'real_production_outcome_accepted_at_iso_required' : null,
    evidence.approvalRef ? null : 'real_production_outcome_approval_ref_required',
    evidence.approvalRef && !isAuditableApprovalRef(evidence.approvalRef) ? 'real_production_outcome_approval_ref_auditable_required' : null,
    ...auditableEvidenceRefBlockers('runtime_publication', evidence.runtimePublicationEvidenceRef),
    ...auditableEvidenceRefBlockers('api_read_smoke', evidence.apiReadSmokeEvidenceRef),
    ...auditableEvidenceRefBlockers('ui_consumption_smoke', evidence.uiConsumptionSmokeEvidenceRef),
    ...auditableEvidenceRefBlockers('critical_path_readback', evidence.criticalPathReadbackEvidenceRef),
    ...auditableEvidenceRefBlockers('rollback', evidence.rollbackEvidenceRef),
  ].filter(Boolean)
}

function auditableEvidenceRefBlockers(kind, value) {
  const ref = text(value)
  if (!ref) return [`real_production_outcome_${kind}_evidence_ref_required`]
  if (!isAuditableEvidenceRef(ref)) {
    return [`real_production_outcome_${kind}_evidence_ref_auditable_required`]
  }
  return isAuditableSourceExportEvidenceRef(kind, ref)
    ? []
    : [`real_production_outcome_${kind}_evidence_ref_source_export_required`]
}

function isAuditableEvidenceRef(value) {
  const ref = text(value)
  if (!ref) return false
  if (/#sha256=[a-f0-9]{64}$/i.test(ref)) return true
  if (/^[a-z0-9_-]+(?:_[a-z0-9_-]+)*_export:/i.test(ref) && /#sha256=/i.test(ref)) return true
  if (ref.startsWith('project-testing/') && /\.(json|md)(?:#sha256=[a-f0-9]{64})?$/i.test(ref)) return true
  return false
}

function isAuditableSourceExportEvidenceRef(kind, value) {
  const ref = text(value)
  const expectedPrefixes = {
    runtime_publication: ['wbs_template_runtime_publications_export'],
    api_read_smoke: ['api_read_smoke_export'],
    ui_consumption_smoke: ['ui_consumption_smoke_export'],
    critical_path_readback: ['critical_path_readback_export'],
    rollback: ['rollback_verification_export'],
  }[kind] ?? []
  return expectedPrefixes.some((prefix) => ref.startsWith(`${prefix}:`) && /#sha256=[a-f0-9]{64}$/i.test(ref))
}

function isAuditableRealProductionOutcomeExportRef(value) {
  const ref = text(value)
  return ref.startsWith('real_production_outcome_export:') && /#sha256=[a-f0-9]{64}$/i.test(ref)
}

function isValidSupabaseProjectRef(value) {
  return /^[a-z0-9][a-z0-9-]{3,62}$/.test(text(value))
}

function isValidDatabaseHost(value, projectRef) {
  const host = text(value).toLowerCase()
  const ref = text(projectRef).toLowerCase()
  if (!/^db\.[a-z0-9-]+\.supabase\.co$/.test(host)) return false
  return ref ? host === `db.${ref}.supabase.co` : true
}

function isValidConnectionSource(value) {
  return /^[A-Z][A-Z0-9_]{2,}$/.test(text(value))
}

function isAuditableApprovalRef(value) {
  const ref = text(value)
  if (!ref) return false
  if (isAuditableEvidenceRef(ref)) return true
  return /^(approval|release|change|ticket|window|handoff):[a-z0-9][a-z0-9._:/-]*$/i.test(ref)
}

function isAuditableActorRef(value) {
  const ref = text(value)
  if (!ref) return false
  if (/[<>]/.test(ref)) return false
  if (/^(unknown|none|null|n\/a|na|todo|tbd)$/i.test(ref)) return false
  if (/(manual[-_ ]?note|placeholder|example|sample|dummy|fake|test[-_ ]?user)/i.test(ref)) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref)) return true
  if (/^(user|operator|project-manager|pm|release-owner|production-owner|authorized-reviewer):[a-z0-9][a-z0-9._:/-]{2,}$/i.test(ref)) return true
  if (/^(operator|project-manager|pm|release-owner|production-owner|authorized-reviewer):\/\/[a-z0-9][a-z0-9._/-]{2,}$/i.test(ref)) return true
  return false
}

function isIsoTimestamp(value) {
  const textValue = text(value)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(textValue)) return false
  const parsed = new Date(textValue)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === (
    textValue.includes('.') ? textValue : textValue.replace('Z', '.000Z')
  )
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value) {
  return String(value ?? '').trim()
}
