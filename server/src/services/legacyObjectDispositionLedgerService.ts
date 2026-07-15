import type { LegacyObjectDropCandidate } from './legacyObjectDropGuardService.js'

export type RetiredObjectDeletionReadiness =
  | 'physical_delete_candidate_after_migration_ledger_review'
  | 'retain_guard_or_cleanup_shell'
  | 'retain_semantic_context_or_rename_before_delete'
  | 'blocked_runtime_surface_must_be_removed'
  | 'blocked_until_reference_is_classified'

export type RetiredObjectDispositionSummary = {
  token: string
  occurrenceCount: number
  runtimeSurfaceCount: number
  buckets: Record<string, number>
  disposition: string
  deletionReadiness: RetiredObjectDeletionReadiness | string
}

export type LegacyObjectDispositionLedgerRow = {
  token: string
  dropClassification: 'obsolete_or_superseded' | 'compatibility' | 'intentionally_retained' | 'blocked'
  dropCandidate: LegacyObjectDropCandidate
  migrationLedgerReviewRequired: boolean
  reason: string
}

export function buildLegacyObjectDispositionLedger(
  summaries: RetiredObjectDispositionSummary[],
): LegacyObjectDispositionLedgerRow[] {
  return summaries.map((summary) => {
    const dropClassification = classifyDropDisposition(summary)

    return {
      token: summary.token,
      dropClassification,
      migrationLedgerReviewRequired:
        summary.deletionReadiness === 'physical_delete_candidate_after_migration_ledger_review',
      reason: summary.deletionReadiness,
      dropCandidate: buildDropCandidate(summary, dropClassification),
    }
  })
}

export function buildLegacyObjectDropCandidatesFromDisposition(
  summaries: RetiredObjectDispositionSummary[],
): LegacyObjectDropCandidate[] {
  return buildLegacyObjectDispositionLedger(summaries).map((row) => row.dropCandidate)
}

function classifyDropDisposition(
  summary: RetiredObjectDispositionSummary,
): LegacyObjectDispositionLedgerRow['dropClassification'] {
  if (summary.deletionReadiness === 'physical_delete_candidate_after_migration_ledger_review') {
    return 'obsolete_or_superseded'
  }
  if (summary.deletionReadiness === 'retain_guard_or_cleanup_shell') {
    return 'compatibility'
  }
  if (summary.deletionReadiness === 'retain_semantic_context_or_rename_before_delete') {
    return 'intentionally_retained'
  }
  return 'blocked'
}

function buildDropCandidate(
  summary: RetiredObjectDispositionSummary,
  dropClassification: LegacyObjectDispositionLedgerRow['dropClassification'],
): LegacyObjectDropCandidate {
  if (dropClassification === 'compatibility') {
    return {
      objectName: summary.token,
      classification: 'compatibility',
      rowCount: null,
    }
  }

  if (dropClassification === 'intentionally_retained') {
    return {
      objectName: summary.token,
      classification: 'intentionally_retained',
      rowCount: null,
    }
  }

  if (dropClassification === 'obsolete_or_superseded') {
    return {
      objectName: summary.token,
      classification: 'obsolete_or_superseded',
      rowCount: null,
      dependencyScan: { pass: false },
      dependencies: {
        runtime: summary.runtimeSurfaceCount > 0 ? ['retired_object_runtime_surface'] : [],
      },
      postDropReadback: { required: true, pass: false },
    }
  }

  return {
    objectName: summary.token,
    classification: 'blocked',
    rowCount: null,
    dependencyScan: { pass: false },
    dependencies: {
      runtime: summary.runtimeSurfaceCount > 0 ? ['retired_object_runtime_surface'] : [],
    },
    postDropReadback: { required: true, pass: false },
  }
}
