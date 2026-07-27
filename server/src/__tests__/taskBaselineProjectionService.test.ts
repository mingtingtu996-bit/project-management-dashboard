import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    task_baselines: [],
    task_baseline_items: [],
  }

  const from = vi.fn((table: string) => {
    const rows = tables[table]
    if (!rows) throw new Error(`Unexpected table: ${table}`)

    const filters: Array<(row: Row) => boolean> = []
    const builder: Record<string, any> = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return builder
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        filters.push((row) => values.map(String).includes(String(row[column] ?? '')))
        return builder
      }),
      order: vi.fn(() => builder),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
        const data = rows.filter((row) => filters.every((filter) => filter(row))).map((row) => ({ ...row }))
        return Promise.resolve(resolve({ data, error: null }))
      },
    }
    return builder
  })

  return { tables, from }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

const {
  attachCurrentBaselineProjectionToTasks,
  loadBaselineProjectionMap,
} = await import('../services/taskBaselineProjectionService.js')

describe('taskBaselineProjectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tables.task_baselines.splice(0, mocks.tables.task_baselines.length)
    mocks.tables.task_baseline_items.splice(0, mocks.tables.task_baseline_items.length)
  })

  it('loads baseline projection from task_baseline_items by source task', async () => {
    mocks.tables.task_baseline_items.push({
      id: 'baseline-item-1',
      baseline_version_id: 'baseline-1',
      source_task_id: 'task-1',
      planned_start_date: '2026-04-01T00:00:00.000Z',
      planned_end_date: '2026-04-10T00:00:00.000Z',
      is_baseline_critical: true,
    })

    const projection = await loadBaselineProjectionMap('baseline-1')

    expect(projection.get('task-1')).toEqual({
      baseline_item_id: 'baseline-item-1',
      baseline_start: '2026-04-01',
      baseline_end: '2026-04-10',
      baseline_is_critical: true,
    })
  })

  it('overlays stale task baseline fields with the latest current execution baseline snapshot', async () => {
    mocks.tables.task_baselines.push(
      {
        id: 'baseline-old',
        project_id: 'project-1',
        status: 'confirmed',
        version: 1,
        confirmed_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'baseline-current',
        project_id: 'project-1',
        status: 'pending_realign',
        version: 2,
        confirmed_at: '2026-04-10T00:00:00.000Z',
        updated_at: '2026-04-11T00:00:00.000Z',
      },
    )
    mocks.tables.task_baseline_items.push({
      id: 'baseline-item-current',
      baseline_version_id: 'baseline-current',
      project_id: 'project-1',
      source_task_id: 'task-1',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-08',
      is_baseline_critical: false,
    })

    const tasks = await attachCurrentBaselineProjectionToTasks([
      {
        id: 'task-1',
        project_id: 'project-1',
        baseline_item_id: 'stale-item',
        baseline_start: '2026-03-01',
        baseline_end: '2026-03-10',
        baseline_is_critical: true,
      },
      {
        id: 'task-2',
        project_id: 'project-1',
        baseline_item_id: 'stale-unlinked',
        baseline_start: '2026-03-15',
        baseline_end: '2026-03-20',
        baseline_is_critical: true,
      },
    ])

    expect(tasks[0]).toMatchObject({
      baseline_item_id: 'baseline-item-current',
      baseline_start: '2026-05-01',
      baseline_end: '2026-05-08',
      baseline_is_critical: false,
    })
    expect(tasks[1]).toMatchObject({
      baseline_item_id: null,
      baseline_start: null,
      baseline_end: null,
      baseline_is_critical: null,
    })
  })
})
