import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

describe('job lease write fence', () => {
  it('injects the active lease identity into Supabase requests without leaking it outside the runner', async () => {
    const {
      createJobLeaseFencedFetch,
      runWithJobLeaseFenceContext,
    } = await import('../services/jobLeaseFenceContext.js')
    const baseFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response(null, { status: 204 })
    ))
    const fencedFetch = createJobLeaseFencedFetch(baseFetch as typeof fetch)

    await runWithJobLeaseFenceContext(
      {
        jobName: 'conditionAlertJob',
        fenceToken: '11111111-1111-4111-8111-111111111111',
        generation: 7,
      },
      async () => {
        await fencedFetch('https://example.test/rest/v1/notifications', {
          headers: { 'x-existing': 'kept' },
        })
      },
    )
    await fencedFetch('https://example.test/rest/v1/notifications')

    const fencedHeaders = new Headers(baseFetch.mock.calls[0]?.[1]?.headers)
    expect(fencedHeaders.get('x-existing')).toBe('kept')
    expect(fencedHeaders.get('x-workbuddy-job-name')).toBe('conditionAlertJob')
    expect(fencedHeaders.get('x-workbuddy-job-fence-token')).toBe('11111111-1111-4111-8111-111111111111')
    expect(fencedHeaders.get('x-workbuddy-job-fence-generation')).toBe('7')

    const ordinaryHeaders = new Headers(baseFetch.mock.calls[1]?.[1]?.headers)
    expect(ordinaryHeaders.get('x-workbuddy-job-name')).toBeNull()
    expect(ordinaryHeaders.get('x-workbuddy-job-fence-token')).toBeNull()
  })

  it('ships database triggers that reject stale fenced writes when the lease backend no longer holds the advisory lock', () => {
    const migration = readFileSync(resolve(process.cwd(), 'migrations/297_persistent_scheduled_job_slots.sql'), 'utf8')
    const dbService = readFileSync(resolve(process.cwd(), 'src/services/dbService.ts'), 'utf8')
    const persistentSchedule = readFileSync(resolve(process.cwd(), 'src/services/persistentJobScheduleService.ts'), 'utf8')

    expect(dbService).toContain('fetch: createJobLeaseFencedFetch()')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.job_lease_fences')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.assert_job_lease_fence')
    expect(migration).toContain("FROM pg_catalog.pg_locks")
    expect(migration).toContain("locktype = 'advisory'")
    expect(migration).toContain("current_setting('request.headers', TRUE)")
    expect(migration).toContain('job lease fence rejected')
    for (const table of [
      'notifications',
      'notification_user_states',
      'risks',
      'issues',
      'warning_acknowledgments',
      'change_logs',
    ]) {
      expect(migration).toContain(`ON public.${table}`)
      expect(persistentSchedule).toContain(`('${table}')`)
    }
    expect(persistentSchedule).toContain("to_regclass('public.job_lease_fences') IS NOT NULL")
    expect(persistentSchedule).toContain("to_regprocedure('public.assert_job_lease_fence(text,uuid,bigint)') IS NOT NULL")
    expect(persistentSchedule).toContain("trigger.tgname = 'enforce_job_lease_fence'")
    expect(persistentSchedule).toContain(
      "trigger.tgfoid = to_regprocedure('public.enforce_job_lease_fence_from_request()')",
    )
  })
})
