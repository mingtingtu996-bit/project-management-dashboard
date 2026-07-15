import { readFileSync } from 'node:fs'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(async (_sql: string, _params?: unknown[]) => []),
  from: vi.fn(() => {
    throw new Error('drawing package iteration persistence must use the runtime database role')
  }),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  supabase: { from: mocks.from },
}))

const {
  buildDrawingPackageExperienceIterationReport,
  persistDrawingPackageExperienceIterationRun,
  publishDrawingPackageExperienceIterationRun,
} = await import('../services/drawingPackageExperienceIterationService.js')

describe('drawing package experience iteration persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes the audit run through the non-bypass runtime database role', async () => {
    const run = publishDrawingPackageExperienceIterationRun({
      report: buildDrawingPackageExperienceIterationReport(),
      asOfDate: '2026-07-14',
    })

    const record = await persistDrawingPackageExperienceIterationRun(run)

    expect(record.run_id).toBe(run.runId)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.executeSQL).toHaveBeenCalledTimes(1)
    expect(String(mocks.executeSQL.mock.calls[0]?.[0])).toContain(
      'INSERT INTO public.drawing_package_experience_iteration_runs',
    )
    expect(mocks.executeSQL.mock.calls[0]?.[1]?.[0]).toBe(run.runId)
  })

  it('grants only the audit table operations needed by the runtime job', () => {
    const migration = readFileSync(
      new URL('../../migrations/306_v14241_worker_runtime_job_write_rls.sql', import.meta.url),
      'utf8',
    )

    expect(migration).toContain(
      'GRANT SELECT, INSERT ON TABLE public.drawing_package_experience_iteration_runs TO workbuddy_runtime',
    )
    expect(migration).toContain('TO workbuddy_runtime')
    expect(migration).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(migration).not.toContain('BYPASSRLS')
    expect(migration).not.toContain('SECURITY DEFINER')
  })
})
