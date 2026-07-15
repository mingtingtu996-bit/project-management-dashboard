import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    active: 0,
    maxActive: 0,
    selectCalls: [] as Array<{ table: string; columns: string }>,
  }
  const track = async <T>(value: T): Promise<T> => {
    state.active += 1
    state.maxActive = Math.max(state.maxActive, state.active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    state.active -= 1
    return value
  }
  return {
    state,
    track,
    getTasks: vi.fn(),
    getRisks: vi.fn(),
    getIssues: vi.fn(),
    getCriticalPathTaskIds: vi.fn(),
    buildProjectSummary: vi.fn(),
    supabaseFrom: vi.fn(),
  }
})

vi.mock('../services/dbService.js', () => ({
  getTasks: mocks.getTasks,
  getRisks: mocks.getRisks,
  getIssues: mocks.getIssues,
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

vi.mock('../services/criticalPathHelpers.js', () => ({
  getCriticalPathTaskIds: mocks.getCriticalPathTaskIds,
}))

vi.mock('../services/constructionCalendar.js', () => ({
  resolveConstructionCalendarContext: vi.fn(async () => ({ basis: 'calendar_day', windows: [] })),
}))

vi.mock('../services/dataQualityService.js', () => ({
  dataQualityService: {
    buildProjectSummary: mocks.buildProjectSummary,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { calculateProjectHealth } from '../services/projectHealthService.js'

describe('project health runtime database pressure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.active = 0
    mocks.state.maxActive = 0
    mocks.state.selectCalls = []
    process.env.PROJECT_HEALTH_OPTIONAL_READ_TIMEOUT_MS = '100'
    delete process.env.PROJECT_HEALTH_READ_CONCURRENCY
    mocks.getTasks.mockImplementation(() => mocks.track([]))
    mocks.getRisks.mockImplementation(() => mocks.track([]))
    mocks.getIssues.mockImplementation(() => mocks.track([]))
    mocks.getCriticalPathTaskIds.mockImplementation(() => mocks.track(new Set<string>()))
    mocks.buildProjectSummary.mockImplementation(() => mocks.track({ confidence: { score: 70 } }))
    mocks.supabaseFrom.mockImplementation((table: string) => {
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
      }
      builder.select.mockImplementation((columns: string) => {
        mocks.state.selectCalls.push({ table, columns })
        return builder
      })
      builder.eq.mockImplementation(() => mocks.track({ data: [], error: null }))
      return builder
    })
  })

  it('loads health inputs with bounded concurrency and requests only score-bearing task columns', async () => {
    await calculateProjectHealth('project-1')

    const candidateSelect = mocks.state.selectCalls.find((call) => call.table === 'algorithm_seed_upgrade_candidates')
    expect(candidateSelect?.columns).not.toContain('confidence_score')
    expect(candidateSelect?.columns).toContain('candidate_payload')
    const preMilestoneSelect = mocks.state.selectCalls.find((call) => call.table === 'pre_milestones')
    expect(preMilestoneSelect?.columns.split(',').map((column) => column.trim())).not.toContain('planned_date')
    expect(preMilestoneSelect?.columns).toContain('planned_end_date')
    expect(mocks.state.maxActive).toBeGreaterThan(1)
    expect(mocks.state.maxActive).toBeLessThanOrEqual(4)
    expect(mocks.getTasks).toHaveBeenCalledWith('project-1', {
      columns: expect.arrayContaining([
        'id',
        'parent_id',
        'status',
        'progress',
        'planned_end_date',
        'participant_unit_id',
      ]),
    })
  })
})
