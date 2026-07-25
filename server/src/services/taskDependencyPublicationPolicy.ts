function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeMarker(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export function isUnpublishedHeuristicDependency(value: unknown) {
  const dependency = readRecord(value)
  const metadata = readRecord(dependency.metadata)
  const evidence = readRecord(
    dependency.dependencyRuleEvidence
      ?? dependency.dependency_rule_evidence
      ?? metadata.dependencyRuleEvidence
      ?? metadata.dependency_rule_evidence,
  )

  const source = normalizeMarker(dependency.source ?? dependency.source_type ?? metadata.source)
  const sequencingBasis = normalizeMarker(
    dependency.sequencingBasis
      ?? dependency.sequencing_basis
      ?? metadata.sequencingBasis
      ?? metadata.sequencing_basis,
  )
  const evidenceLevel = normalizeMarker(evidence.evidenceLevel ?? evidence.evidence_level)
  const publicationStatus = normalizeMarker(evidence.publicationStatus ?? evidence.publication_status)
  const learningPolicy = normalizeMarker(metadata.learningPolicy ?? metadata.learning_policy)

  return source === 'heuristic_stagger'
    || sequencingBasis === 'heuristic_stagger'
    || evidenceLevel === 'heuristic_fallback_l0'
    || publicationStatus === 'fallback_not_published_dependency_rule'
    || learningPolicy === 'candidate_only_until_dependency_rule_replay_publication'
}

export function isFormalTaskDependencyEvidence(value: unknown) {
  return !isUnpublishedHeuristicDependency(value)
}
