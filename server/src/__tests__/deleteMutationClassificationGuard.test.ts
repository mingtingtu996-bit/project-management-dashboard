import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const {
  auditDeleteMutationClassifications,
  collectDeleteMutationCandidates,
  formatDeleteMutationClassificationFailure,
} = await import('../../scripts/audit-delete-mutation-classification.mjs')

const tempRoots: string[] = []

function createFixture(files: Record<string, string>) {
  const root = join(
    tmpdir(),
    `delete-mutation-classification-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )

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

describe('delete mutation classification guard', () => {
  it('detects SQL, Supabase, dynamic helper, and RPC physical deletes without flagging cache deletes', () => {
    const root = createFixture({
      'server/src/routes/demo.ts': `
        cache.delete(projectId)
        await executeSQL('DELETE FROM demo_rows WHERE id = ?', [id])
        await supabase.from('demo_items').delete().eq('id', id)
        await supabase.from(table).delete().eq('id', id)
        await supabase.delete(TABLE_NAME, id)
        await deleteTaskInMainChain(id, projectId, actorId)
        await supabase.rpc('delete_task_obstacle_with_source_backfill_atomic', { p_id: id })
      `,
    })

    const candidates = collectDeleteMutationCandidates(root)

    expect(candidates.map((candidate: any) => `${candidate.kind}:${candidate.table}`)).toEqual([
      'sql_delete:demo_rows',
      'supabase_delete:demo_items',
      'dynamic_supabase_delete:table',
      'legacy_supabase_helper_delete:<helper>',
      'delete_helper_call:deleteTaskInMainChain',
      'rpc_delete:delete_task_obstacle_with_source_backfill_atomic',
    ])
  })

  it('includes live diagnostic scripts in the physical delete scan surface', () => {
    const root = createFixture({
      'server/src/scripts/diagnose-cleanup-live.ts': `
        await (client as any).from('diagnostic_disposable_rows').delete({ count: 'exact' }).eq('project_id', projectId)
      `,
    })

    const candidates = collectDeleteMutationCandidates(root)

    expect(candidates.map((candidate: any) => `${candidate.file}:${candidate.kind}:${candidate.table}`)).toEqual([
      'server/src/scripts/diagnose-cleanup-live.ts:supabase_delete:diagnostic_disposable_rows',
    ])
  })

  it('includes retention cleanup jobs in the physical delete scan surface', () => {
    const root = createFixture({
      'server/src/jobs/demoCleanupJob.ts': `
        await (client as any).from('demo_cleanup_rows').delete({ count: 'exact' }).eq('project_id', projectId)
      `,
    })

    const candidates = collectDeleteMutationCandidates(root)

    expect(candidates.map((candidate: any) => `${candidate.file}:${candidate.kind}:${candidate.table}`)).toEqual([
      'server/src/jobs/demoCleanupJob.ts:supabase_delete:demo_cleanup_rows',
    ])
  })

  it('does not classify RPC function-name catalog strings as physical delete calls', () => {
    const root = createFixture({
      'server/src/scripts/catalog.ts': `
        const functionNames = [
          'delete_task_obstacle_with_source_backfill_atomic',
        ]
      `,
    })

    const candidates = collectDeleteMutationCandidates(root)

    expect(candidates).toEqual([])
  })

  it('fails closed when a physical delete is missing an explicit classification', () => {
    const root = createFixture({
      'server/src/routes/unclassified.ts': `
        await executeSQL('DELETE FROM unknown_runtime_rows WHERE id = ?', [id])
      `,
    })

    const result = auditDeleteMutationClassifications(root)

    expect(result.status).toBe('fail')
    expect(formatDeleteMutationClassificationFailure(result)).toContain('unknown_runtime_rows')
  })

  it('uses a stable structural callsite key instead of source line numbers', () => {
    const root = createFixture({
      'server/src/routes/classified.ts': `




        await executeSQL('DELETE FROM classified_rows WHERE id = ?', [id])
      `,
    })

    const result = auditDeleteMutationClassifications(root, [{
      file: 'server/src/routes/classified.ts',
      line: 1,
      table: 'classified_rows',
      kind: 'sql_delete',
      bucket: 'guarded_route',
      reason: 'The fixture delete is explicitly governed despite unrelated source line movement.',
      liveVerification: false,
    }])

    expect(result.status).toBe('pass')
    expect(result.unclassifiedCandidates).toEqual([])
    expect(result.staleClassifications).toEqual([])
  })

  it('still fails closed when another same-table delete callsite is introduced', () => {
    const root = createFixture({
      'server/src/routes/classified.ts': `
        await executeSQL('DELETE FROM classified_rows WHERE id = ?', [id])
        await executeSQL('DELETE FROM classified_rows WHERE project_id = ?', [projectId])
      `,
    })

    const result = auditDeleteMutationClassifications(root, [{
      file: 'server/src/routes/classified.ts',
      line: 1,
      table: 'classified_rows',
      kind: 'sql_delete',
      bucket: 'guarded_route',
      reason: 'Only the first fixture delete callsite has an explicit governance classification.',
      liveVerification: false,
    }])

    expect(result.status).toBe('fail')
    expect(result.unclassifiedCandidates).toHaveLength(1)
    expect(result.unclassifiedCandidates[0].callsiteOrdinal).toBe(1)
  })

  it('keeps current server physical deletes classified by governance bucket', () => {
    const result = auditDeleteMutationClassifications()

    expect(result.status).toBe('pass')
    expect(result.scannedCandidateCount).toBe(105)
    expect(result.classifiedCandidateCount).toBe(105)
    expect(result.liveVerificationCount).toBe(99)
    expect(result.bucketCounts).toEqual({
      guarded_route: 27,
      internal_recovery_cleanup: 42,
      main_chain_integrity_cleanup: 19,
      diagnostic_live_cleanup: 8,
      dynamic_delete_requires_callsite_allowlist: 5,
      retention_governance_executor: 3,
      config_soft_delete: 1,
    })
    expect(result.unclassifiedCandidates).toEqual([])
    expect(result.staleClassifications).toEqual([])
    expect(result.invalidClassifications).toEqual([])
    expect(result.bucketCounts).toMatchObject({
      guarded_route: expect.any(Number),
      internal_recovery_cleanup: expect.any(Number),
      main_chain_integrity_cleanup: expect.any(Number),
      diagnostic_live_cleanup: expect.any(Number),
      dynamic_delete_requires_callsite_allowlist: expect.any(Number),
      retention_governance_executor: expect.any(Number),
    })
    expect(result.liveVerificationCount).toBeGreaterThan(0)
  }, 15000)
})
