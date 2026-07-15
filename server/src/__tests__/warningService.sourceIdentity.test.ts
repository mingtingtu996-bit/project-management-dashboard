import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  return { from }
})

function createQuery(data: unknown[]) {
  const query = {
    select: vi.fn(() => query),
    neq: vi.fn(() => query),
    in: vi.fn(() => query),
    eq: vi.fn(() => query),
    gt: vi.fn(() => query),
    then: vi.fn((resolve: any) => resolve({ data, error: null })),
  }
  return query
}

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../services/preMilestoneWarningService.js', () => ({
  scanPreMilestoneWarnings: vi.fn(async () => []),
}))

import { WarningService } from '../services/warningService.js'
import { buildWarningSignature } from '../utils/warningSignature.js'

afterEach(() => {
  vi.restoreAllMocks()
  mocks.from.mockReset()
})

describe('legacy warning source identity', () => {
  it('uses each obstacle as the source identity instead of collapsing by task', async () => {
    let obstacleQuery: ReturnType<typeof createQuery> | null = null
    mocks.from.mockImplementation((table: string) => {
      if (table === 'task_obstacles') {
        obstacleQuery = createQuery([
          {
            id: 'obstacle-a',
            task_id: 'task-1',
            obstacle_type: 'material',
            description: '材料未到',
            severity: 'medium',
            status: '处理中',
            estimated_resolve_date: null,
            created_at: '2026-06-01T00:00:00.000Z',
            tasks: { project_id: 'project-1', title: '砌筑' },
          },
          {
            id: 'obstacle-b',
            task_id: 'task-1',
            obstacle_type: 'drawing',
            description: '图纸未审',
            severity: 'medium',
            status: '处理中',
            estimated_resolve_date: null,
            created_at: '2026-06-01T00:00:00.000Z',
            tasks: { project_id: 'project-1', title: '砌筑' },
          },
        ])
        return obstacleQuery
      }
      return createQuery([])
    })

    const warnings = await new WarningService().scanObstacleWarnings('project-1', false)

    expect(obstacleQuery?.select).toHaveBeenCalledWith(expect.stringContaining('estimated_resolve_date'))
    expect(obstacleQuery?.select).not.toHaveBeenCalledWith(expect.stringContaining('expected_resolution_date'))
    expect(warnings).toHaveLength(2)
    expect(warnings.map((warning) => warning.source_entity_type)).toEqual(['task_obstacle', 'task_obstacle'])
    expect(warnings.map((warning) => warning.source_entity_id)).toEqual(['obstacle-a', 'obstacle-b'])
    expect(new Set(warnings.map(buildWarningSignature))).toHaveProperty('size', 2)
  })

  it('uses each acceptance plan as the source identity when task_id is absent', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'acceptance_plans') {
        return createQuery([
          {
            id: 'acceptance-a',
            project_id: 'project-1',
            task_id: null,
            acceptance_name: '主体分部验收',
            acceptance_type: '主体',
            type_name: null,
            planned_date: '2026-01-01',
            status: 'pending',
          },
          {
            id: 'acceptance-b',
            project_id: 'project-1',
            task_id: null,
            acceptance_name: '消防验收',
            acceptance_type: '消防',
            type_name: null,
            planned_date: '2026-01-01',
            status: 'pending',
          },
        ])
      }
      return createQuery([])
    })

    const warnings = await new WarningService().scanAcceptanceWarnings('project-1', false)

    expect(warnings).toHaveLength(2)
    expect(warnings.map((warning) => warning.source_entity_type)).toEqual(['acceptance_plan', 'acceptance_plan'])
    expect(warnings.map((warning) => warning.source_entity_id)).toEqual(['acceptance-a', 'acceptance-b'])
    expect(new Set(warnings.map(buildWarningSignature))).toHaveProperty('size', 2)
  })

  it('uses each task condition as the source identity instead of falling back to task_id', async () => {
    const conditionTargetDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    mocks.from.mockImplementation((table: string) => {
      if (table === 'task_conditions') {
        return createQuery([
          {
            id: 'condition-a',
            task_id: 'task-1',
            name: '材料进场',
            target_date: conditionTargetDate,
            tasks: { project_id: 'project-1', title: '砌筑' },
          },
          {
            id: 'condition-b',
            task_id: 'task-1',
            name: '图纸会审',
            target_date: conditionTargetDate,
            tasks: { project_id: 'project-1', title: '砌筑' },
          },
        ])
      }
      return createQuery([])
    })

    const warnings = await new WarningService().scanConditionWarnings('project-1', false)

    expect(warnings).toHaveLength(2)
    expect(warnings.map((warning) => warning.source_entity_type)).toEqual(['task_condition', 'task_condition'])
    expect(warnings.map((warning) => warning.source_entity_id)).toEqual(['condition-a', 'condition-b'])
    expect(new Set(warnings.map(buildWarningSignature))).toHaveProperty('size', 2)
  })
})
