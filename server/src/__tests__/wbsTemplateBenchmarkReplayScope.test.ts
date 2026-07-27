import { describe, expect, it, vi } from 'vitest'

const dbServiceMocks = vi.hoisted(() => {
  const emptyResult = { data: [], error: null, count: 0 }
  const singleResult = { data: null, error: null }
  const tables: Record<string, unknown[]> = {
    algorithm_seed_versions: [],
    algorithm_seed_records: [],
  }

  const createQuery = (table?: string) => {
    const query: Record<string, any> = {}
    const filters: Array<{ column: string; value: unknown }> = []
    const chain = () => query
    for (const method of [
      'select',
      'in',
      'not',
      'is',
      'gte',
      'lte',
      'gt',
      'lt',
      'ilike',
      'like',
      'or',
      'order',
      'limit',
      'range',
      'contains',
      'overlaps',
      'match',
      'insert',
      'update',
      'upsert',
      'delete',
      'returns',
      'throwOnError',
    ]) {
      query[method] = vi.fn(chain)
    }
    query.eq = vi.fn((column: string, value: unknown) => {
      filters.push({ column, value })
      return query
    })
    const resolveRows = () => {
      const rows = table && tables[table] ? tables[table] : []
      return rows.filter((row) => filters.every((filter) => (
        (row as Record<string, unknown>)[filter.column] === filter.value
      )))
    }
    const resolveResult = async () => {
      const data = resolveRows()
      return table && tables[table] ? { data, error: null, count: data.length } : emptyResult
    }
    query.single = vi.fn(async () => {
      const rows = resolveRows()
      return table && tables[table] ? { data: rows[0] ?? null, error: null } : singleResult
    })
    query.maybeSingle = vi.fn(async () => {
      const rows = resolveRows()
      return table && tables[table] ? { data: rows[0] ?? null, error: null } : singleResult
    })
    query.abortSignal = vi.fn(resolveResult)
    query.then = (resolve: (value: typeof emptyResult) => unknown, reject?: (reason: unknown) => unknown) => (
      resolveResult().then(resolve, reject)
    )
    query.catch = (reject: (reason: unknown) => unknown) => resolveResult().catch(reject)
    query.finally = (onFinally: () => void) => resolveResult().finally(onFinally)
    return query
  }

  class SupabaseService {
    async query() { return [] }
    async create() { return {} }
    async update() { return {} }
    async delete() { return null }
  }

  return {
    supabase: {
      from: vi.fn((table: string) => createQuery(table)),
    },
    executeSQL: vi.fn(async () => []),
    executeSQLOne: vi.fn(async () => null),
    SupabaseService,
  }
})

vi.mock('../services/dbService.js', () => dbServiceMocks)

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: vi.fn(async () => null),
  isUuidLike: (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? '').trim()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const constructionCalendarMocks = vi.hoisted(() => ({
  resolveConstructionCalendarContext: vi.fn(async () => ({ basis: 'calendar_day', windows: [] })),
}))

vi.mock('../services/constructionCalendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/constructionCalendar.js')>()
  return {
    ...actual,
    resolveConstructionCalendarContext: constructionCalendarMocks.resolveConstructionCalendarContext,
  }
})
import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import { generateWbsTemplateRows } from '../services/wbsTemplateGenerationService.js'
import { evaluateWbsTemplateGoldenBenchmarkRunGate } from '../services/wbsTemplateGoldenBenchmarkGateService.js'
import { runWbsTemplateGoldenBenchmarkReplay } from '../services/wbsTemplateGoldenBenchmarkReplayService.js'

describe('WBS template benchmark replay scope', () => {
  it('keeps benchmark replay project facts from deriving construction organization lanes', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateIds: ['china-modular-mic-specialty'],
        selectedNodesByTemplate: {
          'china-modular-mic-specialty': ['MIC-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          benchmarkReplayScopeMode: 'single_project_scope',
          project_type_code: 'modular_construction',
          business_type: 'modular_building',
          business_subtype: 'mic_modular',
          method_variant_codes: ['modular_mic', 'steel_assembly'],
          building_pattern_codes: ['factory_parallel_site_assembly'],
          buildingCount: 4,
          standardFloorCount: 12,
          prefabRate: 0.85,
        },
      },
    })

    expect(generated.scopeCombos.some((scope) => scope.project_organization_policy_id)).toBe(false)
    expect(generated.rows.some((row) => (
      Boolean((row.values.standard_task_metadata as Record<string, unknown>).projectOrganization)
    ))).toBe(false)
  }, 30_000)

  it('replays the modular benchmark within the governed runtime row range without relaxing the server row limit', async () => {
    const entry = WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.find((item) => item.projectCode === 'J')!

    const results = await runWbsTemplateGoldenBenchmarkReplay({ projectCodes: ['J'] })

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(expect.objectContaining({
      projectCode: 'J',
      generatedRowCount: expect.any(Number),
      actualGeneratedRowCount: expect.any(Number),
    }))
    expect(results[0]!.generatedRowCount).toBeGreaterThanOrEqual(entry.expectedRuntimeReplayRowCountRange![0])
    expect(results[0]!.generatedRowCount).toBeLessThanOrEqual(entry.expectedRuntimeReplayRowCountRange![1])
    const gate = evaluateWbsTemplateGoldenBenchmarkRunGate(results)
    expect(gate.findings.filter((finding) => finding.projectCode === 'J')).toEqual([])
  }, 90_000)
})
