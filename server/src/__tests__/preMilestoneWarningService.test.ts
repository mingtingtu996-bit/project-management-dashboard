import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'

type TableName = 'pre_milestones' | 'certificate_work_items' | 'certificate_dependencies' | 'warnings'

const mocks = vi.hoisted(() => {
  const tables: Record<TableName, Array<Record<string, any>>> = {
    pre_milestones: [],
    certificate_work_items: [],
    certificate_dependencies: [],
    warnings: [],
  }

  function createQueryBuilder(table: TableName) {
    let rows = tables[table].slice()
    const builder: any = {}

    builder.select = vi.fn(() => builder)
    builder.not = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.eq = vi.fn((column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value)
      return builder
    })
    builder.in = vi.fn((column: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes(row[column]))
      return builder
    })
    builder.update = vi.fn(() => builder)
    builder.delete = vi.fn(() => builder)
    builder.insert = vi.fn(() => builder)
    builder.single = vi.fn(async () => ({ data: rows[0] ?? null, error: null }))
    builder.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: rows, error: null }))
    builder.catch = Promise.resolve({ data: rows, error: null }).catch.bind(Promise.resolve({ data: rows, error: null }))
    builder.finally = Promise.resolve({ data: rows, error: null }).finally.bind(Promise.resolve({ data: rows, error: null }))

    return builder
  }

  return {
    tables,
    from: vi.fn((table: TableName) => createQueryBuilder(table)),
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mocks.from,
  })),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { scanPreMilestoneWarnings } = await import('../services/preMilestoneWarningService.js')

describe('pre milestone warning service', () => {
  beforeEach(() => {
    mocks.from.mockClear()
    mocks.tables.pre_milestones.splice(0, mocks.tables.pre_milestones.length)
    mocks.tables.certificate_work_items.splice(0, mocks.tables.certificate_work_items.length)
    mocks.tables.certificate_dependencies.splice(0, mocks.tables.certificate_dependencies.length)
    mocks.tables.warnings.splice(0, mocks.tables.warnings.length)
  })

  it('returns only due permit warnings and adds supplement-chain warnings for certificates', async () => {
    const today = new Date('2026-04-17T00:00:00.000Z')
    const expiringSoon = new Date(today)
    expiringSoon.setDate(expiringSoon.getDate() + 3)
    const farFuture = new Date(today)
    farFuture.setDate(farFuture.getDate() + 45)

    mocks.tables.pre_milestones.push(
      {
        id: 'cert-expiring',
        project_id: 'project-1',
        milestone_name: '施工许可证',
        milestone_type: 'construction_permit',
        status: 'internal_review',
        expiry_date: expiringSoon.toISOString().slice(0, 10),
        updated_at: today.toISOString(),
      },
      {
        id: 'cert-far',
        project_id: 'project-1',
        milestone_name: '工程规划许可证',
        milestone_type: 'engineering_planning_permit',
        status: 'internal_review',
        expiry_date: farFuture.toISOString().slice(0, 10),
        updated_at: today.toISOString(),
      },
      {
        id: 'cert-supplement',
        project_id: 'project-1',
        milestone_name: '土地证',
        milestone_type: 'land_certificate',
        status: 'supplement_required',
        updated_at: today.toISOString(),
      },
      {
        id: 'cert-cycle',
        project_id: 'project-1',
        milestone_name: '用地规划许可证',
        milestone_type: 'land_use_planning_permit',
        status: 'internal_review',
        updated_at: today.toISOString(),
      },
    )

    mocks.tables.certificate_work_items.push(
      {
        id: 'work-cycle-1',
        project_id: 'project-1',
        item_name: '批复材料补齐',
        status: 'supplement_required',
        sort_order: 1,
        created_at: today.toISOString(),
        updated_at: today.toISOString(),
      },
      {
        id: 'work-cycle-2',
        project_id: 'project-1',
        item_name: '窗口退件重提',
        status: 'supplement_required',
        sort_order: 2,
        created_at: today.toISOString(),
        updated_at: today.toISOString(),
      },
    )

    mocks.tables.certificate_dependencies.push(
      {
        id: 'dep-1',
        project_id: 'project-1',
        predecessor_type: 'certificate',
        predecessor_id: 'cert-cycle',
        successor_type: 'work_item',
        successor_id: 'work-cycle-1',
        dependency_kind: 'hard',
        created_at: today.toISOString(),
      },
      {
        id: 'dep-2',
        project_id: 'project-1',
        predecessor_type: 'certificate',
        predecessor_id: 'cert-cycle',
        successor_type: 'work_item',
        successor_id: 'work-cycle-2',
        dependency_kind: 'hard',
        created_at: today.toISOString(),
      },
    )

    const warnings = await scanPreMilestoneWarnings('project-1')

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task_id: 'cert-expiring',
          warning_type: 'permit_expiry',
        }),
        expect.objectContaining({
          task_id: 'cert-supplement',
          warning_type: 'permit_supplement_required',
        }),
        expect.objectContaining({
          task_id: 'cert-cycle',
          warning_type: 'permit_supplement_cycle',
        }),
      ]),
    )
    expect(warnings.find((warning) => warning.task_id === 'cert-far')).toBeUndefined()
  })
})
