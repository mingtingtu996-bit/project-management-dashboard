import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  from: vi.fn(() => {
    throw new Error('responsibility mutations must not use anonymous Supabase REST')
  }),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
}))

vi.mock('../services/dbService.js', () => ({
  getMembers: vi.fn(),
  supabase: { from: mocks.from },
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: vi.fn(),
}))

vi.mock('../services/criticalPathHelpers.js', () => ({
  getCriticalPathTaskIds: vi.fn(),
}))

const { ResponsibilityInsightService } = await import('../services/responsibilityInsightService.js')

const watch = {
  id: 'c6048877-745a-49a2-a960-c7791ee61ba3',
  project_id: '22cb1b1c-4d72-4275-8790-8174ce8c6d4b',
  dimension: 'person' as const,
  subject_key: 'user:47baa790-29c2-4445-9ed3-d0454327087a',
  subject_label: 'Project owner',
  subject_user_id: '47baa790-29c2-4445-9ed3-d0454327087a',
  subject_unit_id: null,
  created_by: '47baa790-29c2-4445-9ed3-d0454327087a',
  status: 'active' as const,
  metadata: null,
  created_at: '2026-07-14T00:00:00.000Z',
  updated_at: '2026-07-14T00:00:00.000Z',
}

describe('responsibility persistence through the backend database role', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts a project-scoped watch without anonymous Supabase REST', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [watch] })

    await expect(new ResponsibilityInsightService().markWatch(watch.project_id, {
      dimension: watch.dimension,
      subject_key: watch.subject_key,
      subject_label: watch.subject_label,
      subject_user_id: watch.subject_user_id,
      subject_unit_id: watch.subject_unit_id,
      actor_user_id: watch.created_by,
    })).resolves.toEqual(watch)

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO public\.responsibility_watchlist[\s\S]*ON CONFLICT \(project_id, dimension, subject_key\)[\s\S]*RETURNING \*/),
      [
        watch.project_id,
        watch.dimension,
        watch.subject_key,
        watch.subject_label,
        watch.subject_user_id,
        watch.subject_unit_id,
        watch.created_by,
      ],
    )
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each([
    ['clearWatch', false],
    ['confirmRecovery', true],
  ] as const)('%s clears only the matching project subject', async (method, recoveryOnly) => {
    mocks.query.mockResolvedValueOnce({ rows: [{ ...watch, status: 'cleared' }] })

    await expect(new ResponsibilityInsightService()[method](watch.project_id, {
      dimension: watch.dimension,
      subject_key: watch.subject_key,
    })).resolves.toMatchObject({ status: 'cleared' })

    const [sql, params] = mocks.query.mock.calls[0]
    expect(String(sql)).toMatch(/UPDATE public\.responsibility_watchlist[\s\S]*WHERE project_id = \$1[\s\S]*dimension = \$2[\s\S]*subject_key = \$3[\s\S]*RETURNING \*/)
    expect(String(sql).includes("status IN ('suggested_to_clear', 'active')")).toBe(recoveryOnly)
    expect(params).toEqual([watch.project_id, watch.dimension, watch.subject_key])
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('keeps scheduled alert, watch-state, and notification mutations off anonymous REST', () => {
    const source = readFileSync(
      resolve(fileURLToPath(new URL('..', import.meta.url)), 'services', 'responsibilityInsightService.ts'),
      'utf8',
    )

    expect(source).not.toMatch(/\.from\('responsibility_alert_states'\)[\s\S]{0,120}\.upsert\(/)
    expect(source).not.toMatch(/\.from\('responsibility_watchlist'\)[\s\S]{0,120}\.update\(/)
    expect(source).not.toMatch(/\.from\('notifications'\)[\s\S]{0,120}\.update\(/)
    expect(source).toContain('INSERT INTO public.responsibility_alert_states')
    expect(source).not.toContain(".from('projects')")
    expect(source).toContain('SELECT id, name, status')
  })

  it('persists responsibility job execution logs through the backend database role', () => {
    const source = readFileSync(
      resolve(fileURLToPath(new URL('..', import.meta.url)), 'jobs', 'responsibilityAlertJob.ts'),
      'utf8',
    )

    expect(source).not.toContain('@supabase/supabase-js')
    expect(source).toContain('INSERT INTO public.job_execution_logs')
  })
})
