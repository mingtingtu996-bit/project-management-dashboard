import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const {
  auditRetiredObjectReferences,
  formatRetiredObjectReferenceAuditFailure,
  formatRetiredObjectReferenceAuditSummary,
} = await import('../../scripts/audit-retired-object-references.mjs')

const tempRoots: string[] = []

function createFixture(files: Record<string, string>) {
  const root = join(tmpdir(), `retired-object-reference-audit-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = join(root, relativePath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, source)
  }
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('retired object reference audit', () => {
  it('classifies runtime reintroductions of retired scope and AI duration objects as failures', () => {
    const root = createFixture({
      'server/src/index.ts': `
        app.use('/api/scope-dimensions', legacyScopeRouter)
      `,
      'server/src/routes/legacyScope.ts': `
        export async function readLegacyScope(supabase) {
          return supabase.from('scope_dimensions').select('id, zone_object_id')
        }
      `,
      'server/src/services/legacyDuration.ts': `
        export const sql = 'select reference_duration, ai_duration from tasks'
      `,
      'client/src/pages/LegacyDuration.tsx': `
        export const url = '/api/ai-duration'
      `,
      'server/migrations/224_drop_legacy_scope.sql': `
        DROP TABLE IF EXISTS public.project_scope_dimensions CASCADE;
      `,
      'server/src/__tests__/legacy-contract.test.ts': `
        expect('/api/ai-schedule').not.toBe('/api/ai-schedule')
      `,
      'docs/plans/old-scope.md': `
        /api/scope-dimensions was retired.
      `,
    })

    const result = auditRetiredObjectReferences(root)

    expect(result.status).toBe('fail')
    expect(result.runtimeSurface).toEqual(expect.arrayContaining([
      expect.objectContaining({
        token: '/api/scope-dimensions',
        file: 'server/src/index.ts',
        bucket: 'runtime_surface',
      }),
      expect.objectContaining({
        token: 'zone_object_id',
        file: 'server/src/routes/legacyScope.ts',
        bucket: 'runtime_surface',
      }),
      expect.objectContaining({
        token: 'reference_duration',
        file: 'server/src/services/legacyDuration.ts',
        bucket: 'runtime_surface',
      }),
      expect.objectContaining({
        token: '/api/ai-duration',
        file: 'client/src/pages/LegacyDuration.tsx',
        bucket: 'runtime_surface',
      }),
    ]))
    expect(result.occurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        token: 'project_scope_dimensions',
        bucket: 'migration_history_or_drop',
      }),
      expect.objectContaining({
        token: '/api/ai-schedule',
        bucket: 'test_contract',
      }),
      expect.objectContaining({
        token: '/api/scope-dimensions',
        bucket: 'documentation_or_archive',
      }),
    ]))
    expect(formatRetiredObjectReferenceAuditFailure(result)).toContain('runtime surfaces')
  })

  it('allows cleanup guards, DTO sanitizers, diagnostic scripts, migrations, docs, tests, and semantic scope context references', () => {
    const root = createFixture({
      'server/src/services/legacyScopeObjectSanitizer.ts': `
        export const LEGACY_SCOPE_OBJECT_FIELDS = ['zone_object_id', 'scope_dimensions']
      `,
      'server/src/services/taskDtoService.ts': `
        export const FORBIDDEN_TASK_FIELDS = ['professional_object_id', 'legacy_object_type']
      `,
      'server/src/services/standardWorkDurationSeedReplayService.ts': `
        export const context = metadata.scope_dimensions ?? metadata.scopeDimensions
      `,
      'server/scripts/guard-ai-naming.mjs': `
        export const forbidden = '/api/ai-duration'
      `,
      'scripts/diagnostics/legacy-scope-diagnostic.ts': `
        export const diagnosticField = 'zone_object_id'
      `,
      'project-testing/tools/discover-old-object-drop-candidates.mjs': `
        export const NAME_HINTS = ['ai_duration', 'scope_dimension']
      `,
      'server/migrations/208_drop_legacy_duration_physical_cache_objects.sql': `
        DROP TABLE IF EXISTS ai_duration_estimates CASCADE;
        ALTER TABLE tasks DROP COLUMN IF EXISTS reference_duration;
      `,
      'server/src/__tests__/durationLegacyTaskDurationCleanup.test.ts': `
        expect(source).not.toContain('ai_duration')
      `,
      'docs/reports/duration-cleanup.md': `
        ai_duration_estimates is retired.
      `,
    })

    const result = auditRetiredObjectReferences(root)

    expect(result.status).toBe('pass')
    expect(result.runtimeSurface).toEqual([])
    expect(result.buckets).toEqual(expect.objectContaining({
      guard_or_cleanup: expect.any(Number),
      script_reference: expect.any(Number),
      semantic_context_reference: expect.any(Number),
      migration_history_or_drop: expect.any(Number),
      test_contract: expect.any(Number),
      documentation_or_archive: expect.any(Number),
    }))
  })

  it('produces object-level disposition summaries for physical deletion decisions', () => {
    const root = createFixture({
      'server/src/services/legacyScopeObjectSanitizer.ts': `
        export const LEGACY_SCOPE_OBJECT_FIELDS = ['zone_object_id', 'scope_dimensions']
      `,
      'server/migrations/224_drop_legacy_scope.sql': `
        DROP TABLE IF EXISTS public.scope_dimensions CASCADE;
      `,
      'server/src/__tests__/legacy-contract.test.ts': `
        expect(source).not.toContain('scope_dimensions')
      `,
      'docs/plans/old-scope.md': `
        scope_dimensions is retired.
      `,
      'server/migrations/208_drop_legacy_duration_physical_cache_objects.sql': `
        DROP TABLE IF EXISTS ai_duration_estimates CASCADE;
      `,
      'docs/reports/duration-cleanup.md': `
        ai_duration_estimates is retired.
      `,
    })

    const result = auditRetiredObjectReferences(root)

    expect(result.status).toBe('pass')
    expect(result.objectSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        token: 'scope_dimensions',
        occurrenceCount: 4,
        runtimeSurfaceCount: 0,
        disposition: 'compatibility_guard_retained',
        deletionReadiness: 'retain_guard_or_cleanup_shell',
      }),
      expect.objectContaining({
        token: 'ai_duration_estimates',
        occurrenceCount: 2,
        runtimeSurfaceCount: 0,
        disposition: 'historical_evidence_only',
        deletionReadiness: 'physical_delete_candidate_after_migration_ledger_review',
      }),
    ]))
    expect(formatRetiredObjectReferenceAuditSummary(result)).toContain('scope_dimensions: compatibility_guard_retained')
    expect(formatRetiredObjectReferenceAuditSummary(result)).toContain('ai_duration_estimates: historical_evidence_only')
  })

  it('fails when retired object references cannot be classified for deletion decisions', () => {
    const root = createFixture({
      'server/local-diagnostic.cjs': `
        module.exports = { retiredColumn: 'ai_adjusted_duration' }
      `,
    })

    const result = auditRetiredObjectReferences(root)

    expect(result.status).toBe('fail')
    expect(result.unclassifiedReferenceCount).toBe(1)
    expect(result.objectSummaries).toEqual([expect.objectContaining({
      token: 'ai_adjusted_duration',
      disposition: 'needs_manual_classification',
      deletionReadiness: 'blocked_until_reference_is_classified',
    })])
    const failure = formatRetiredObjectReferenceAuditFailure(result)
    expect(failure).toContain('Unclassified retired object references')
    expect(failure).toContain('approved diagnostic scripts')
    expect(failure).toContain('semantic context references')
  })
})
