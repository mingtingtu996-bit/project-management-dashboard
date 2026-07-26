type UnknownRecord = Record<string, unknown>

function readRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function normalizeMarker(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export function isUnconfirmedHeuristicDependency(value: unknown) {
  const row = readRecord(value)
  const metadata = readRecord(row.metadata)
  const evidence = readRecord(
    row.dependencyRuleEvidence
      ?? row.dependency_rule_evidence
      ?? metadata.dependencyRuleEvidence
      ?? metadata.dependency_rule_evidence,
  )
  const source = normalizeMarker(row.source ?? metadata.source)
  const sequencingBasis = normalizeMarker(
    row.sequencingBasis
      ?? row.sequencing_basis
      ?? metadata.sequencingBasis
      ?? metadata.sequencing_basis,
  )
  const intentCode = normalizeMarker(
    row.intentCode
      ?? row.intent_code
      ?? metadata.intentCode
      ?? metadata.intent_code,
  )
  const evidenceLevel = normalizeMarker(evidence.evidenceLevel ?? evidence.evidence_level)

  return source === 'heuristic_stagger'
    || sequencingBasis === 'heuristic_stagger'
    || intentCode === 'sequencing_fallback:heuristic_stagger'
    || evidenceLevel === 'heuristic_fallback_l0'
}
