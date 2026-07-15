import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server')

describe('task commit atomicity contract', () => {
  it('uses one request transaction and an in-transaction idempotency ledger', () => {
    const route = readFileSync(resolve(serverRoot, 'src/routes/tasks.ts'), 'utf8')
    const commit = route.slice(
      route.indexOf("router.post('/commit'"),
      route.indexOf('// v1.4.4 middleware'),
    )

    expect(commit).toContain('withDatabaseTransaction')
    expect(commit).toContain('reserveTaskCommitRequest')
    expect(commit).toContain('completeTaskCommitRequest')
  })

  it('defines a tenant-scoped unique request ledger with payload hashes and replay summaries', () => {
    const migration = readFileSync(
      resolve(serverRoot, 'migrations/294_task_commit_requests.sql'),
      'utf8',
    ).toLowerCase()

    expect(migration).toContain('create table if not exists public.task_commit_requests')
    expect(migration).toMatch(/unique[\s\S]*project_id[\s\S]*request_id/)
    expect(migration).toContain('request_hash')
    expect(migration).toContain('result_summary')
  })

  it('allows the inheriting runtime login role through the RLS policy', () => {
    const migration = readFileSync(
      resolve(serverRoot, 'migrations/294_task_commit_requests.sql'),
      'utf8',
    )

    expect(migration).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
  })
})
