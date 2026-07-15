import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server')

describe('task batch update durability contract', () => {
  it('persists accepted work before returning 202 and exposes durable status', () => {
    const routeSource = readFileSync(resolve(serverRoot, 'src/routes/tasks.ts'), 'utf8')
    const batchRoute = routeSource.slice(
      routeSource.indexOf("router.post('/batch-update'"),
      routeSource.indexOf('// 删除任务'),
    )

    expect(batchRoute).toContain('createTaskBatchUpdateJob')
    expect(batchRoute).toContain('scheduleTaskBatchUpdateJob')
    expect(batchRoute).not.toContain('setTimeout(')
    expect(routeSource).toContain("router.get('/batch-update/jobs/:jobId'")
  })

  it('defines persistent jobs, item outcomes, idempotency, and expiring leases', () => {
    const migration = readFileSync(
      resolve(serverRoot, 'migrations/293_task_batch_update_jobs.sql'),
      'utf8',
    ).toLowerCase()

    expect(migration).toContain('create table if not exists public.task_batch_update_jobs')
    expect(migration).toContain('create table if not exists public.task_batch_update_items')
    expect(migration).toMatch(/unique[\s\S]*project_id[\s\S]*idempotency_key/)
    expect(migration).toContain('request_hash')
    expect(migration).toContain('lease_expires_at')
    expect(migration).toContain('target_patch')
    expect(migration).toContain('expected_version')
    expect(migration).toContain('on delete cascade')
  })

  it('allows the inheriting runtime login role through the RLS policy', () => {
    const migration = readFileSync(
      resolve(serverRoot, 'migrations/293_task_batch_update_jobs.sql'),
      'utf8',
    )

    expect(migration).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
  })

  it('recovers unfinished durable batch jobs during server bootstrap', () => {
    const serverEntry = readFileSync(resolve(serverRoot, 'src/index.ts'), 'utf8')

    expect(serverEntry).toContain('recoverTaskBatchUpdateJobs')
    expect(serverEntry).toMatch(/await recoverTaskBatchUpdateJobs\(\)/)
  })
})
