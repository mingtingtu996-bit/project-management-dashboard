import { describe, expect, it } from 'vitest'

import { evaluateLegacyObjectDropGuardReport } from '../services/legacyObjectDropGuardService.js'
import {
  buildLegacyObjectDispositionLedger,
  buildLegacyObjectDropCandidatesFromDisposition,
} from '../services/legacyObjectDispositionLedgerService.js'

describe('legacyObjectDispositionLedgerService', () => {
  it('bridges retired-object audit disposition summaries into fail-closed drop candidates', () => {
    const candidates = buildLegacyObjectDropCandidatesFromDisposition([
      {
        token: 'ai_duration_estimates',
        occurrenceCount: 2,
        runtimeSurfaceCount: 0,
        buckets: { migration_history_or_drop: 1, documentation_or_archive: 1 },
        disposition: 'historical_evidence_only',
        deletionReadiness: 'physical_delete_candidate_after_migration_ledger_review',
      },
    ])

    expect(candidates).toEqual([expect.objectContaining({
      objectName: 'ai_duration_estimates',
      classification: 'obsolete_or_superseded',
      rowCount: null,
      dependencyScan: { pass: false },
      postDropReadback: { required: true, pass: false },
    })])
    expect(evaluateLegacyObjectDropGuardReport(candidates)).toEqual(expect.objectContaining({
      status: 'blocked',
    }))
  })

  it('retains compatibility and semantic context references instead of turning them into drop-ready candidates', () => {
    const ledger = buildLegacyObjectDispositionLedger([
      {
        token: 'scope_dimensions',
        occurrenceCount: 4,
        runtimeSurfaceCount: 0,
        buckets: { guard_or_cleanup: 1, migration_history_or_drop: 1 },
        disposition: 'compatibility_guard_retained',
        deletionReadiness: 'retain_guard_or_cleanup_shell',
      },
      {
        token: 'scope_dimensions',
        occurrenceCount: 1,
        runtimeSurfaceCount: 0,
        buckets: { semantic_context_reference: 1 },
        disposition: 'semantic_context_reference_retained',
        deletionReadiness: 'retain_semantic_context_or_rename_before_delete',
      },
    ])

    expect(ledger.map((row) => row.dropClassification)).toEqual([
      'compatibility',
      'intentionally_retained',
    ])
    expect(evaluateLegacyObjectDropGuardReport(ledger.map((row) => row.dropCandidate)).status).toBe('blocked')
  })

  it('keeps runtime reintroductions blocked before any physical drop discussion', () => {
    const [row] = buildLegacyObjectDispositionLedger([
      {
        token: '/api/scope-dimensions',
        occurrenceCount: 1,
        runtimeSurfaceCount: 1,
        buckets: { runtime_surface: 1 },
        disposition: 'runtime_surface_reintroduced',
        deletionReadiness: 'blocked_runtime_surface_must_be_removed',
      },
    ])

    expect(row.dropClassification).toBe('blocked')
    expect(row.dropCandidate.dependencies?.runtime).toEqual(['retired_object_runtime_surface'])
    expect(evaluateLegacyObjectDropGuardReport([row.dropCandidate]).status).toBe('blocked')
  })
})
