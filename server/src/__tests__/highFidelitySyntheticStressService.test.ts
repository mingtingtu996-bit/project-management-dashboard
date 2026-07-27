import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

function roundToPrecision(value: number, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const mocks = vi.hoisted(() => {
  const state = {
    tables: new Map<string, Row[]>(),
    indexes: new Map<string, Map<string, Map<string, Row[]>>>(),
    writes: [] as Array<{ table: string; operation: string; rows: Row[] }>,
  }

  function normalizeDate(value: unknown) {
    const text = String(value ?? '')
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text
  }

  function parseNotIn(value: unknown) {
    return String(value ?? '')
      .replace(/[()]/g, '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  function rowsFor(table: string) {
    return state.tables.get(table) ?? []
  }

  function buildSingleColumnIndex(rows: Row[], column: string) {
    const index = new Map<string, Row[]>()
    for (const row of rows) {
      const key = String(row[column] ?? '')
      index.set(key, [...(index.get(key) ?? []), row])
    }
    return index
  }

  function getSingleColumnIndex(table: string, column: string) {
    const tableIndexes = state.indexes.get(table) ?? new Map<string, Map<string, Row[]>>()
    if (!state.indexes.has(table)) state.indexes.set(table, tableIndexes)
    const current = tableIndexes.get(column)
    if (current) return current
    const next = buildSingleColumnIndex(rowsFor(table), column)
    tableIndexes.set(column, next)
    return next
  }

  function rowsFromIndex(index: Map<string, Row[]>, value: unknown) {
    if (Array.isArray(value)) {
      const rows: Row[] = []
      const seen = new Set<Row>()
      for (const item of value) {
        for (const row of index.get(String(item ?? '')) ?? []) {
          if (seen.has(row)) continue
          rows.push(row)
          seen.add(row)
        }
      }
      return rows
    }
    return index.get(String(value ?? '')) ?? []
  }

  function maybeIndexedRows(table: string, filters: Row[]) {
    const indexedTables: Record<string, string[]> = {
      task_progress_snapshots: ['task_id', 'project_id'],
      task_conditions: ['task_id', 'project_id'],
      task_obstacles: ['task_id', 'project_id'],
      project_materials: ['linked_task_id', 'project_id'],
      data_quality_findings: ['task_id'],
      duration_experience_samples: ['project_id'],
      project_schedule_states: ['project_id'],
    }
    const rows = rowsFor(table)
    const indexedColumns = indexedTables[table]
    if (!indexedColumns) return rows
    for (const filter of filters) {
      if (filter.type !== 'eq' && filter.type !== 'in') continue
      if (!indexedColumns.includes(String(filter.column ?? ''))) continue
      return rowsFromIndex(getSingleColumnIndex(table, String(filter.column)), filter.value)
    }
    return rows
  }

  function applyFilters(table: string, filters: Row[]) {
    return filters.reduce((result, filter) => {
      if (filter.type === 'eq') return result.filter((row) => row[filter.column] === filter.value)
      if (filter.type === 'in') return result.filter((row) => Array.isArray(filter.value) && filter.value.includes(row[filter.column]))
      if (filter.type === 'is') return result.filter((row) => row[filter.column] === filter.value)
      if (filter.type === 'not_is') return result.filter((row) => row[filter.column] !== filter.value)
      if (filter.type === 'not_eq') return result.filter((row) => row[filter.column] !== filter.value)
      if (filter.type === 'not_in') {
        const values = parseNotIn(filter.value)
        return result.filter((row) => !values.includes(String(row[filter.column] ?? '')))
      }
      if (filter.type === 'gte') return result.filter((row) => normalizeDate(row[filter.column]) >= normalizeDate(filter.value))
      if (filter.type === 'lte') return result.filter((row) => normalizeDate(row[filter.column]) <= normalizeDate(filter.value))
      return result
    }, maybeIndexedRows(table, filters))
  }

  function applyOrders(rows: Row[], orders: Row[]) {
    return [...rows].sort((left, right) => {
      for (const order of orders) {
        const direction = order.ascending === false ? -1 : 1
        const leftValue = normalizeDate(left[order.column])
        const rightValue = normalizeDate(right[order.column])
        if (leftValue < rightValue) return -1 * direction
        if (leftValue > rightValue) return 1 * direction
      }
      return 0
    })
  }

  function createBuilder(table: string) {
    const filters: Row[] = []
    const orders: Row[] = []
    let rowLimit: number | null = null

    const readRows = () => {
      const filtered = applyFilters(table, filters)
      const ordered = applyOrders(filtered, orders)
      return rowLimit == null ? ordered : ordered.slice(0, rowLimit)
    }

    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ type: 'eq', column, value })
        return builder
      }),
      in: vi.fn((column: string, value: unknown[]) => {
        filters.push({ type: 'in', column, value })
        return builder
      }),
      is: vi.fn((column: string, value: unknown) => {
        filters.push({ type: 'is', column, value })
        return builder
      }),
      not: vi.fn((column: string, operator: string, value: unknown) => {
        filters.push({ type: operator === 'in' ? 'not_in' : operator === 'is' ? 'not_is' : 'not_eq', column, value })
        return builder
      }),
      gte: vi.fn((column: string, value: unknown) => {
        filters.push({ type: 'gte', column, value })
        return builder
      }),
      lte: vi.fn((column: string, value: unknown) => {
        filters.push({ type: 'lte', column, value })
        return builder
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orders.push({ column, ascending: options?.ascending !== false })
        return builder
      }),
      limit: vi.fn((count: number) => {
        rowLimit = Math.max(0, Number(count) || 0)
        return builder
      }),
      maybeSingle: vi.fn(async () => ({ data: readRows()[0] ?? null, error: null })),
      single: vi.fn(async () => ({ data: readRows()[0] ?? null, error: null })),
      upsert: vi.fn(async (rows: Row | Row[]) => {
        const values = Array.isArray(rows) ? rows : [rows]
        state.writes.push({ table, operation: 'upsert', rows: values })
        return { data: values, error: null }
      }),
      insert: vi.fn(async (rows: Row | Row[]) => {
        const values = Array.isArray(rows) ? rows : [rows]
        state.writes.push({ table, operation: 'insert', rows: values })
        return { data: values, error: null }
      }),
      update: vi.fn((patch: Row) => ({
        eq: vi.fn(async () => {
          state.writes.push({ table, operation: 'update', rows: [patch] })
          return { data: null, error: null }
        }),
      })),
      then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        return Promise.resolve({ data: readRows(), error: null }).then(resolve, reject)
      }),
    }
    return builder
  }

  return {
    state,
    from: vi.fn((table: string) => createBuilder(table)),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

const {
  generateMiniHighFidelitySyntheticDataset,
  runMiniHighFidelitySyntheticStressTest,
  summarizeMiniHighFidelityStressReport,
} = await import('../services/highFidelitySyntheticStressService.js')
const { buildDurationContext } = await import('../services/durationContextService.js')
const { resolveV1474BuildingPatternMatches } = await import('../services/algorithmSeedResolver.js')
const { clearAlgorithmSeedResolverCache } = await import('../services/algorithmSeedResolver.js')

describe('high fidelity synthetic stress service', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mocks.state.tables = new Map()
    mocks.state.indexes = new Map()
    mocks.state.writes = []
    mocks.from.mockClear()
    clearAlgorithmSeedResolverCache()
  })

  it('generates a business-type matrix with process-constraint metadata and scope climate signals', () => {
    const dataset = generateMiniHighFidelitySyntheticDataset({
      projectId: 'synthetic-matrix-contract',
      taskCount: 600,
      startDate: '2026-04-01',
      months: 36,
    })
    const tasks = dataset.tables.tasks ?? []
    const metadataRows = tasks.map((task) => task.standard_task_metadata as Row)

    expect(tasks).toHaveLength(600)
    expect(new Set(tasks.map((task) => task.building_object_id))).toEqual(new Set([
      'Y1#',
      'Y2#',
      'Y3#',
      'Y4#',
      'Y5#',
      'Y6#',
      'Y7#',
      'Y8#',
      'Y9#',
      'Y10#',
    ]))
    expect(metadataRows.some((metadata) => metadata.projectTypeCode === 'hospital' && metadata.spaceCleanlinessGrade === 'iso5')).toBe(true)
    expect(metadataRows.some((metadata) => metadata.projectTypeCode === 'data_center' && metadata.elementVariantCodes?.includes('data_center_room'))).toBe(true)
    expect(metadataRows.some((metadata) => metadata.structureTypeCode === 'steel_frame' && metadata.elementVariantCodes?.includes('large_span_hall'))).toBe(true)
    expect(metadataRows.some((metadata) => metadata.structureTypeCode === 'prefabricated_concrete' && metadata.methodVariantCodes?.includes('prefab_grouting') && metadata.dangerControlLevel === 'critical')).toBe(true)
    expect(tasks.some((task) => task.standard_work_code === 'CLN-02-01-01' && String(task.title).includes('cleanroom envelope'))).toBe(true)
    expect(tasks.some((task) => task.standard_work_code === '07-03' && String(task.title).includes('cable tray cable laying'))).toBe(true)
    expect(tasks.some((task) => task.standard_work_code === '02-01-06' && String(task.title).includes('prefab sleeve grouting topping'))).toBe(true)
    expect(metadataRows.some((metadata) => metadata.climateCity === 'harbin' && metadata.thermalZone === 'severe_cold' && metadata.climateSignal === 'winter_low_temp')).toBe(true)
    expect(metadataRows.some((metadata) => metadata.climateCity === 'guangzhou' && metadata.weatherImpactBand === 'humidity_dry_window')).toBe(true)
    expect(dataset.tables.project_climate_profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ city: '杭州', thermal_zone: 'hot_summer_cold_winter' }),
      expect.objectContaining({ city: '哈尔滨', thermal_zone: 'severe_cold' }),
      expect.objectContaining({ city: '广州', thermal_zone: 'hot_summer_warm_winter' }),
    ]))
  })

  it('generates a mini project and executes real duration/building-pattern/state algorithms with pressure evidence', async () => {
    const dataset = generateMiniHighFidelitySyntheticDataset({
      projectId: 'synthetic-yuntaifu-mini',
      taskCount: 96,
      startDate: '2026-04-01',
      months: 18,
    })
    for (const [table, rows] of Object.entries(dataset.tables)) {
      mocks.state.tables.set(table, rows as Row[])
    }

    const result = await runMiniHighFidelitySyntheticStressTest(dataset, {
      buildDurationContext,
      resolveBuildingPatternMatches: resolveV1474BuildingPatternMatches,
    }, {
      maxCases: 36,
      asOfDate: '2027-09-20T08:00:00.000Z',
    })
    const markdown = summarizeMiniHighFidelityStressReport(result)
    expect(result.datasetProfile.taskCount).toBe(96)
    expect(result.datasetProfile.progressSnapshotCount).toBeGreaterThanOrEqual(96 * 12)
    expect(result.executedCaseCount).toBeGreaterThanOrEqual(30)
    expect(result.ruleCoverage).toEqual(expect.objectContaining({
      seasonal_productivity: expect.any(Number),
      weather_forecast_impact: expect.any(Number),
      progress_velocity: expect.any(Number),
      external_readiness: expect.any(Number),
      resource_conflict: expect.any(Number),
      progress_quality: expect.any(Number),
      process_constraint: expect.any(Number),
      project_schedule_state: expect.any(Number),
      productivity_compensation: expect.any(Number),
      workflow_sequence: expect.any(Number),
      building_pattern: expect.any(Number),
    }))
    expect(result.ruleCoverage.seasonal_productivity).toBeGreaterThan(0)
    expect(result.ruleCoverage.weather_forecast_impact).toBeGreaterThan(0)
    expect(result.ruleCoverage.project_schedule_state).toBeGreaterThan(0)
    expect(result.ruleCoverage.productivity_compensation).toBeGreaterThan(0)
    expect(result.ruleCoverage.process_constraint).toBeGreaterThan(0)
    expect(result.ruleCoverage.building_pattern).toBeGreaterThan(0)
    expect(result.ruleCoverage.external_readiness / result.executedCaseCount).toBeGreaterThanOrEqual(0.55)
    expect(result.ruleCoverage.process_seasonal_sensitivity / result.executedCaseCount).toBeGreaterThanOrEqual(0.55)
    expect(result.observations.extraDaysCapHitCount).toBeGreaterThan(0)
    expect(result.observations.velocitySkippedDueToZeroProgressCount).toBeGreaterThan(0)
    expect(result.observations.weightedBuildingPatternCycleCount).toBeGreaterThan(0)
    expect(result.observations.scheduleStateCombinationCount).toBeGreaterThan(0)
    expect(result.observations.productivityCompensationAppliedCount).toBeGreaterThan(0)
    expect(Math.max(...Object.values(result.monthlyProductivityIndependent))).toBeLessThanOrEqual(1)
    expect(roundToPrecision(result.monthlyProductivityStats['2027-02'].minP)).toBeLessThanOrEqual(result.monthlyProductivity['2027-02'])
    expect(result.monthlyProductivityIndependent['2027-03']).toBeLessThanOrEqual(1)
    expect(result.monthlyProductivity['2027-03']).toBe(result.monthlyProductivityCompensated['2027-03'])
    expect(result.monthlyProductivityCompensated['2027-03']).toBeGreaterThanOrEqual(result.monthlyProductivityIndependent['2027-03'])
    expect(result.monthlyProductivityStats['2027-03']).toEqual(expect.objectContaining({
      maxP: expect.any(Number),
      minP: expect.any(Number),
      p90: expect.any(Number),
      accelerationCaseRatio: expect.any(Number),
      compensationSignalRatio: expect.any(Number),
      scheduleStateAccelerationRatio: expect.any(Number),
      averageCompensationUplift: expect.any(Number),
      maxCompensationUplift: expect.any(Number),
    }))
    expect(result.monthlyCompensationUplift['2027-03']).toBeGreaterThanOrEqual(0)
    expect(result.observations.finalProductivityAboveOneCount).toBe(result.observations.accelerationProductivitySignalCount)
    expect(result.observations.scheduleStateAccelerationSignalCount).toBeGreaterThan(0)
    expect(result.observations.pmRecoveryCompensationAppliedCount).toBeGreaterThanOrEqual(0)
    expect(result.performance.slowCaseTopN.length).toBeGreaterThan(0)
    expect(result.performance.scenarioPerformance.length).toBeGreaterThan(0)
    const summerHeatCase = result.scenarioFindings.find((finding) => finding.scenarioCode === 'summer_roof_outdoor_heat')
    const matureCompensatedCase = result.scenarioFindings.find((finding) => finding.scenarioCode === 'compensated_mature_execution')
    const multiFactorCapCase = result.scenarioFindings.find((finding) => finding.scenarioCode === 'multi_factor_cap')
    expect(summerHeatCase?.productivity).toBeLessThan(matureCompensatedCase?.productivity ?? 0)
    expect(multiFactorCapCase?.productivity).toBeGreaterThan(0)
    expect(multiFactorCapCase?.notes).toContain('extra_days_cap_applied')
    expect(result.performance.averageCaseMs).toBeGreaterThan(0)
    expect(result.performance.projectedFullScaleHours2500x540).toBeLessThan(8)
    expect(result.performance.projectedRepresentativeContextHours).toBeGreaterThan(0)
    expect(result.performance.representativeContextCount).toBe(96)
    expect(result.performance.sourceProgressSnapshotRows).toBe(result.datasetProfile.progressSnapshotCount)
    expect(result.performance.projectionBasis).toContain('representative_task_contexts_only')
    expect(markdown).toContain('Mini High-Fidelity Synthetic Stress Test')
    expect(markdown).toContain('Monthly Productivity (Independent)')
    expect(markdown).toContain('Monthly Productivity (Compensated)')
    expect(markdown).toContain('Monthly Productivity Diagnostics')
    expect(markdown).toContain('Slow Case TopN')
    expect(markdown).toContain('synthetic-yuntaifu-mini')
  }, 30_000)

  it('runs a medium-scale daily-snapshot shadow profile without treating snapshots as execution cases', async () => {
    const dataset = generateMiniHighFidelitySyntheticDataset({
      projectId: 'synthetic-yuntaifu-medium',
      taskCount: 500,
      startDate: '2026-04-01',
      months: 36,
      progressSnapshotMode: 'daily',
      durationExperienceSampleCount: 512,
    })
    for (const [table, rows] of Object.entries(dataset.tables)) {
      mocks.state.tables.set(table, rows as Row[])
    }

    const result = await runMiniHighFidelitySyntheticStressTest(dataset, {
      buildDurationContext,
      resolveBuildingPatternMatches: resolveV1474BuildingPatternMatches,
    }, {
      maxCases: 160,
      concurrency: 12,
      asOfDate: '2028-03-20T08:00:00.000Z',
    })
    const markdown = summarizeMiniHighFidelityStressReport(result)

    expect(result.datasetProfile.taskCount).toBe(500)
    expect(result.datasetProfile.progressSnapshotCount).toBe(500 * 36 * 30)
    expect(result.datasetProfile.durationExperienceSampleCount).toBe(512)
    expect(result.executedCaseCount).toBe(160)
    expect(result.observations.externalReadinessExpectedHitCount / result.observations.externalReadinessExpectedCaseCount).toBeGreaterThanOrEqual(0.9)
    expect(result.ruleCoverage.external_readiness).toBeGreaterThan(0)
    expect(result.ruleCoverage.process_constraint).toBeGreaterThan(0)
    expect(result.ruleCoverage.process_seasonal_sensitivity / result.executedCaseCount).toBeGreaterThanOrEqual(0.5)
    expect(result.ruleCoverage.building_pattern).toBe(result.executedCaseCount)
    expect(result.observations.weightedBuildingPatternCycleCount).toBe(result.executedCaseCount)
    expect(result.observations.scheduleStateCombinationCount).toBeGreaterThan(0)
    expect(result.observations.productivityCompensationAppliedCount).toBeGreaterThan(0)
    const explicitlyCompensatedCase = result.scenarioFindings.find((finding) => (
      finding.factorKeys.includes('productivity_compensation')
      && finding.notes.includes('productivity_compensation_applied')
      && finding.productivity > finding.independentProductivity
    ))
    expect(explicitlyCompensatedCase).toBeDefined()
    const compensatedMonth = explicitlyCompensatedCase!.month
    expect(result.monthlyProductivity[compensatedMonth]).toBe(result.monthlyProductivityCompensated[compensatedMonth])
    expect(result.monthlyProductivityCompensated[compensatedMonth]).toBeGreaterThan(result.monthlyProductivityIndependent[compensatedMonth])
    expect(result.monthlyProductivityStats[compensatedMonth].maxP).toBeGreaterThanOrEqual(explicitlyCompensatedCase!.productivity)
    expect(result.monthlyProductivityStats[compensatedMonth].maxP).toBeGreaterThanOrEqual(result.monthlyProductivity[compensatedMonth] - 0.01)
    expect(result.monthlyProductivityStats[compensatedMonth].p90).toBeGreaterThan(0)
    expect(result.monthlyProductivityStats[compensatedMonth].compensationSignalRatio).toBeGreaterThan(0)
    expect(result.monthlyProductivityStats[compensatedMonth].averageCompensationUplift).toBeGreaterThan(0)
    expect(result.monthlyCompensationUplift[compensatedMonth]).toBeGreaterThan(0)
    expect(Math.max(...Object.values(result.monthlyProductivityIndependent))).toBeLessThanOrEqual(1)
    expect(Math.max(...Object.values(result.monthlyProductivityCompensated))).toBeGreaterThanOrEqual(1)
    expect(roundToPrecision(result.monthlyProductivityStats['2028-02'].minP)).toBeLessThanOrEqual(result.monthlyProductivity['2028-02'])
    const rainyLayer = result.scenarioFindings
      .filter((finding) => finding.scenarioCode.includes('plum_rain'))
    expect(rainyLayer.length).toBeGreaterThan(0)
    expect(rainyLayer.every((finding) => finding.factorKeys.includes('weather_forecast_impact'))).toBe(true)
    expect(rainyLayer.every((finding) => finding.factorKeys.includes('process_seasonal_sensitivity'))).toBe(true)
    expect(Math.max(...rainyLayer.map((finding) => finding.productivity))).toBeLessThan(1)
    expect(result.monthlyProductivity['2027-06']).toBeLessThan(1)
    const juneRainyLayer = result.scenarioFindings.filter((finding) => (
      finding.month === '2027-06'
      && finding.factorKeys.includes('weather_forecast_impact')
      && finding.factorKeys.includes('process_seasonal_sensitivity')
    ))
    expect(juneRainyLayer.length).toBeGreaterThan(0)
    expect(result.monthlyImpactedProductivityStats['2027-06']).toEqual(expect.objectContaining({
      climateSignal: 'rainy_season',
      maxP: expect.any(Number),
      caseCount: expect.any(Number),
    }))
    expect(result.monthlyImpactedProductivityStats['2027-06'].maxP).toBeLessThan(1)
    expect(result.monthlyImpactedProductivityStats['2027-06'].caseCount).toBeGreaterThanOrEqual(juneRainyLayer.length)
    expect(result.observations.externalReadinessExpectedCaseCount).toBeGreaterThan(0)
    expect(result.observations.externalReadinessExpectedHitCount / result.observations.externalReadinessExpectedCaseCount).toBeGreaterThanOrEqual(0.9)
    const spring2029Case = result.scenarioFindings.find((finding) => finding.month === '2029-02' && finding.scenarioCode === 'spring_festival_zero_progress')
    expect(spring2029Case?.factorKeys).toContain('seasonal_productivity')
    expect(spring2029Case?.factorKeys).not.toContain('productivity_compensation')
    expect(spring2029Case?.notes).toContain('velocity_skipped_due_to_zero_progress')
    expect(result.performance.sourceProgressSnapshotRows).toBe(540_000)
    expect(result.performance.representativeContextCount).toBe(500)
    expect(result.performance.slowCaseTopN[0]).toEqual(expect.objectContaining({
      taskId: expect.any(String),
      month: expect.any(String),
      scenarioCode: expect.any(String),
      elapsedMs: expect.any(Number),
      factorKeys: expect.any(Array),
      durationContextCacheStatus: expect.any(String),
      durationContextWaitMs: expect.any(Number),
      buildingPatternCacheStatus: expect.any(String),
      buildingPatternWaitMs: expect.any(Number),
      cacheSharedWaitLikely: expect.any(Boolean),
    }))
    expect(result.performance.scenarioPerformance[0]).toEqual(expect.objectContaining({
      scenarioCode: expect.any(String),
      caseCount: expect.any(Number),
      averageMs: expect.any(Number),
      maxMs: expect.any(Number),
      averageDurationContextWaitMs: expect.any(Number),
      maxDurationContextWaitMs: expect.any(Number),
      pendingDurationContextCacheHitCount: expect.any(Number),
      durationContextCacheMissCount: expect.any(Number),
    }))
    expect(result.performance.projectedRepresentativeContextHours).toBeLessThan(2)
    expect(result.performance.maxCaseMs).toBeLessThanOrEqual(900)
    expect(result.performance.cacheDiagnostics.durationContextMissCount).toBeLessThanOrEqual(48)
    expect(result.performance.projectedFullScaleHours2500x540).toBeLessThan(8)
    expect(result.performance.projectionBasis).toContain('progress snapshots are high-fidelity source data volume')
    expect(markdown).toContain('external readiness expected hits')
    expect(markdown).toContain('Monthly Productivity Diagnostics')
    expect(markdown).toContain('Scenario Performance')
    expect(markdown).toContain('compensationSignalRatio')
    expect(markdown).toContain('durationCache=')
    expect(markdown).toContain('- sourceProgressSnapshotRows: 540000')
    expect(markdown).toContain('- representativeContextCount: 500')
  }, 60_000)

  it('shares representative duration contexts for equivalent scenario-month work packages to reduce long-tail waits', async () => {
    const dataset = generateMiniHighFidelitySyntheticDataset({
      projectId: 'synthetic-yuntaifu-cache',
      taskCount: 120,
      startDate: '2026-04-01',
      months: 18,
      progressSnapshotMode: 'daily',
      durationExperienceSampleCount: 90,
    })
    for (const [table, rows] of Object.entries(dataset.tables)) {
      mocks.state.tables.set(table, rows as Row[])
    }

    const result = await runMiniHighFidelitySyntheticStressTest(dataset, {
      buildDurationContext,
      resolveBuildingPatternMatches: resolveV1474BuildingPatternMatches,
    }, {
      maxCases: 72,
      concurrency: 16,
      asOfDate: '2027-07-20T08:00:00.000Z',
    })

    const sharedWaitCount = result.performance.scenarioPerformance
      .reduce((sum, scenario) => sum + scenario.pendingDurationContextCacheHitCount, 0)
    const missCount = result.performance.scenarioPerformance
      .reduce((sum, scenario) => sum + scenario.durationContextCacheMissCount, 0)

    expect(sharedWaitCount).toBeGreaterThan(0)
    expect(missCount).toBeLessThan(result.executedCaseCount)
    expect(result.performance.cacheOptimizationPolicy).toContain('scenario_month_work_package')
  }, 30_000)

  it('uses the effective contribution ledger when calculating independent productivity', async () => {
    const dataset = {
      projectId: 'synthetic-ledger-contract',
      projectName: 'Synthetic ledger contract',
      scenarioVersion: 'unit',
      startDate: '2026-05-01',
      months: 1,
      representativeContextCount: 1,
      tables: {
        tasks: [{
          id: 'task-ledger-contract',
          project_id: 'synthetic-ledger-contract',
          title: 'ledger contract task',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-10',
          progress: 20,
          standard_work_code: '02-01',
          standard_work_name: 'structure work',
          standard_task_metadata: { scenario: 'ledger_contract' },
        }],
      },
      stressCases: [{
        taskId: 'task-ledger-contract',
        scenarioCode: 'ledger_contract',
        month: '2026-05',
        expectedSignals: [],
      }],
      groundTruth: {
        expectedLowProductivityMonths: [],
        expectedCompensatedMonths: [],
        expectedBuildingPatternTexts: [],
      },
    }

    const result = await runMiniHighFidelitySyntheticStressTest(dataset, {
      buildDurationContext: async () => ({
        contextVersion: 'v1.4.7.4',
        multiplier: 1,
        extraDays: 0,
        confidenceDelta: -3,
        rawConfidenceDelta: -3,
        adjustedBy: ['resource_conflict'],
        factors: [
          {
            key: 'resource_conflict',
            label: 'site capacity pressure',
            multiplier: 1.5,
            extraDays: 0,
            confidenceDelta: -8,
            actionPolicy: 'candidate_only',
            reason: 'duplicate source pressure',
            source: 'task_fact',
          },
        ],
        businessReasons: ['duplicate source pressure'],
        hasLowConfidenceSignal: false,
        calculationContext: {
          duration_source: 'standard',
          adjusted_by: ['resource_conflict'],
          confidence_level: 'medium',
          factor_summary_available: true,
          factor_contribution_ledger: [
            {
              key: 'resource_conflict',
              label: 'site capacity pressure',
              multiplier: 1,
              originalMultiplier: 1.5,
              extraDays: 0,
              confidenceDelta: -3,
              originalConfidenceDelta: -8,
              actionPolicy: 'candidate_only',
              source: 'task_fact',
              contributionMode: 'deduped_secondary',
              scopeFingerprint: 'synthetic-ledger-contract:task-ledger-contract',
              sourceEntityKeys: ['task_condition:condition-1'],
              dedupeKey: 'resource_conflict:task_condition:condition-1',
              dataDependencies: ['tasks'],
              reason: 'duplicate source pressure',
              suppressedByFactorKey: 'external_readiness',
            },
          ],
        },
      }),
      resolveBuildingPatternMatches: async () => [],
    }, {
      maxCases: 1,
      asOfDate: '2026-05-15T08:00:00.000Z',
    })

    expect(result.scenarioFindings[0]?.independentProductivity).toBe(1)
    expect(result.monthlyProductivityIndependent['2026-05']).toBe(1)
  })
})
