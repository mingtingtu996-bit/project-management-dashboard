import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const persistence = vi.hoisted(() => ({
  tables: {
    projects: [{
      id: '11111111-1111-4111-8111-111111111111',
      company_id: '22222222-2222-4222-8222-222222222222',
      status: 'active',
    }],
    algorithm_seed_versions: [] as Row[],
    algorithm_seed_records: [] as Row[],
    algorithm_seed_overrides: [] as Row[],
    duration_algorithm_accuracy_events: [] as Row[],
    duration_forecast_project_overlays: [] as Row[],
  } as Record<string, Row[]>,
  writes: [] as Array<{ table: string; operation: string; payload: unknown }>,
}))

function nextId(table: string) {
  return `${table}-${persistence.tables[table]?.length ?? 0 + 1}`
}

function buildPersistenceQuery(table: string) {
  const filters: Array<{ kind: string; column: string; value: unknown }> = []
  let limitCount: number | null = null
  let orderColumn: string | null = null
  let orderAscending = true

  const rows = () => {
    let selected = [...(persistence.tables[table] ?? [])]
    for (const filter of filters) {
      if (filter.kind === 'eq') selected = selected.filter((row) => row[filter.column] === filter.value)
      else if (filter.kind === 'neq') selected = selected.filter((row) => row[filter.column] !== filter.value)
      else if (filter.kind === 'in') selected = selected.filter((row) => (filter.value as unknown[]).includes(row[filter.column]))
      else if (filter.kind === 'is') selected = selected.filter((row) => row[filter.column] == null)
      else if (filter.kind === 'gte') selected = selected.filter((row) => row[filter.column] >= filter.value)
      else if (filter.kind === 'lte') selected = selected.filter((row) => row[filter.column] <= filter.value)
    }
    if (orderColumn) {
      selected.sort((left, right) => String(left[orderColumn!] ?? '').localeCompare(String(right[orderColumn!] ?? '')))
      if (!orderAscending) selected.reverse()
    }
    return limitCount == null ? selected : selected.slice(0, limitCount)
  }

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => { filters.push({ kind: 'eq', column, value }); return builder }),
    neq: vi.fn((column: string, value: unknown) => { filters.push({ kind: 'neq', column, value }); return builder }),
    in: vi.fn((column: string, value: unknown[]) => { filters.push({ kind: 'in', column, value }); return builder }),
    is: vi.fn((column: string, value: unknown) => { filters.push({ kind: 'is', column, value }); return builder }),
    gte: vi.fn((column: string, value: unknown) => { filters.push({ kind: 'gte', column, value }); return builder }),
    lte: vi.fn((column: string, value: unknown) => { filters.push({ kind: 'lte', column, value }); return builder }),
    not: vi.fn(() => builder),
    or: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    overlaps: vi.fn(() => builder),
    order: vi.fn((column: string, options?: { ascending?: boolean }) => {
      orderColumn = column
      orderAscending = options?.ascending !== false
      return builder
    }),
    limit: vi.fn((count: number) => { limitCount = count; return builder }),
    range: vi.fn((from: number, to: number) => { limitCount = Math.max(0, to - from + 1); return builder }),
    maybeSingle: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
    single: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
    insert: vi.fn(async (payload: Row | Row[]) => mutate('insert', payload)),
    upsert: vi.fn(async (payload: Row | Row[], options?: { onConflict?: string }) => mutate('upsert', payload, options)),
    update: vi.fn((payload: Row) => {
      const updateBuilder: any = {
        eq: vi.fn((column: string, value: unknown) => { filters.push({ kind: 'eq', column, value }); return updateBuilder }),
        in: vi.fn((column: string, value: unknown[]) => { filters.push({ kind: 'in', column, value }); return updateBuilder }),
        select: vi.fn(() => updateBuilder),
        then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => {
          const selected = rows()
          for (const row of selected) Object.assign(row, payload)
          persistence.writes.push({ table, operation: 'update', payload })
          return Promise.resolve({ data: selected, error: null }).then(resolve, reject)
        },
      }
      return updateBuilder
    }),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => (
      Promise.resolve({ data: rows(), error: null }).then(resolve, reject)
    ),
  }

  async function mutate(operation: 'insert' | 'upsert', payload: Row | Row[], options?: { onConflict?: string }) {
    const values = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
      id: row.id ?? nextId(table),
      ...row,
    }))
    for (const value of values) {
      const conflictColumns = String(options?.onConflict ?? '').split(',').map((item) => item.trim()).filter(Boolean)
      const existing = operation === 'upsert' && conflictColumns.length > 0
        ? (persistence.tables[table] ?? []).find((row) => conflictColumns.every((column) => row[column] === value[column]))
        : null
      if (existing) Object.assign(existing, value)
      else {
        persistence.tables[table] ??= []
        persistence.tables[table].push(value)
      }
    }
    persistence.writes.push({ table, operation, payload: values })
    return { data: Array.isArray(payload) ? values : values[0], error: null }
  }

  return builder
}

vi.mock('../services/dbService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/dbService.js')>()
  return {
    ...actual,
    supabase: { from: vi.fn((table: string) => buildPersistenceQuery(table)) },
    getTask: vi.fn(async () => null),
    usesDirectSqlRuntimePath: vi.fn(() => false),
    executeSQL: vi.fn(async () => []),
  }
})

vi.mock('../database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../database.js')>()
  return {
    ...actual,
    query: vi.fn(async () => ({ rows: [] })),
  }
})

const {
  clearAlgorithmSeedResolverCache,
  resolveStandardWorkDurationSeedByStableCode,
} = await import('../services/algorithmSeedResolver.js')
const { assembleDurationInput } = await import('../services/durationInputAssemblerService.js')
const { getTaskDurationSuggestion } = await import('../services/durationSuggestionService.js')
const { evaluateDurationOutputWrite } = await import('../services/durationOutputGovernanceService.js')
const {
  getDurationAlgorithmAccuracySummary,
  recordDurationAccuracyBacktest,
  recordDurationAccuracyPrediction,
} = await import('../services/durationAlgorithmAccuracyService.js')

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL(
  '../fixtures/duration-accuracy/frozen-accepted-samples.json',
  import.meta.url,
)), 'utf8')) as {
  schemaVersion: string
  fixtureVersion: string
  environmentClassification: string
  sourcePolicy: string
  samples: Array<{
    sampleId: string
    projectId: string
    taskId: string
    standardWorkCode: string
    taskTitle: string
    actualDurationDays: number
    baselineAbsoluteErrorDays: number
    expectedPredictedDurationDays: number
    provenance: { sourceType: string; sourceRef: string; acceptedBy: string }
  }>
}

describe('duration suggestion real assembly accuracy integration', () => {
  beforeEach(() => {
    persistence.tables.algorithm_seed_versions = []
    persistence.tables.algorithm_seed_records = []
    persistence.tables.algorithm_seed_overrides = []
    persistence.tables.duration_algorithm_accuracy_events = []
    persistence.tables.duration_forecast_project_overlays = []
    persistence.writes = []
    clearAlgorithmSeedResolverCache()
  })

  it('uses real assembler, fallback/active seed resolver, suggestion governance and accuracy service', async () => {
    expect(fixture.schemaVersion).toBe('duration-accuracy-frozen-samples.v1')
    expect(fixture.environmentClassification).toBe('candidate_readonly')
    expect(fixture.samples).toHaveLength(8)
    expect(fixture.samples.every((sample) => (
      sample.provenance.sourceType === 'accepted_engineering_reference'
      && Boolean(sample.provenance.sourceRef)
      && Boolean(sample.provenance.acceptedBy)
    ))).toBe(true)

    const fallbackSeed = await resolveStandardWorkDurationSeedByStableCode('cast_in_place_concrete')
    expect(fallbackSeed).toEqual(expect.objectContaining({
      __resolverSource: 'ts_seed_fallback',
      __resolverVersionId: null,
      sourceVersion: expect.any(String),
      stableCode: 'cast_in_place_concrete',
    }))

    persistence.tables.algorithm_seed_versions = [{
      id: 'active-standard-duration-v2',
      seed_type: 'standard_work_duration',
      status: 'active',
      is_current: true,
    }]
    persistence.tables.algorithm_seed_records = [{
      stable_code: 'cast_in_place_concrete',
      seed_version_id: 'active-standard-duration-v2',
      seed_type: 'standard_work_duration',
      status: 'active',
      rule_payload: {
        ...fallbackSeed,
        __resolverSource: undefined,
        __resolverVersionId: undefined,
        __stableCode: undefined,
        defaultDaysP50: 4,
      },
    }]
    clearAlgorithmSeedResolverCache('standard_work_duration')
    const activeSeed = await resolveStandardWorkDurationSeedByStableCode('cast_in_place_concrete')
    expect(activeSeed).toEqual(expect.objectContaining({
      __resolverSource: 'active_seed',
      __resolverVersionId: 'active-standard-duration-v2',
      stableCode: 'cast_in_place_concrete',
    }))

    persistence.tables.algorithm_seed_versions = []
    persistence.tables.algorithm_seed_records = []
    clearAlgorithmSeedResolverCache('standard_work_duration')

    const predictions: Array<{ predicted: number; actual: number }> = []
    for (const sample of fixture.samples) {
      const projectGenerationFacts = {
        source: 'frozen_accepted_duration_sample',
        fixtureVersion: fixture.fixtureVersion,
        sampleId: sample.sampleId,
        sourcePolicy: fixture.sourcePolicy,
      }
      const assembled = await assembleDurationInput({
        projectId: sample.projectId,
        taskId: sample.taskId,
        standardWorkCode: sample.standardWorkCode,
        taskTitle: sample.taskTitle,
        wbsNodeType: 'process',
        projectGenerationFacts,
      }, { purpose: 'new_task_reference' })
      expect(assembled.projectGenerationFacts).toEqual(expect.objectContaining({ sampleId: sample.sampleId }))
      expect(assembled.mutationBoundary).toEqual(expect.objectContaining({
        writesPlanDates: false,
        writesSeed: false,
      }))

      const suggestion = await getTaskDurationSuggestion({
        ...assembled,
        suggestionPurpose: 'new_task_reference',
        runtimeEvidenceMode: 'no_write',
      })
      expect(suggestion.recommendedDurationDays).toEqual(expect.any(Number))
      expect(suggestion.durationOutputCode).toBe('contextual_reference')
      expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
        seedVersion: expect.any(String),
        seedStableCode: sample.standardWorkCode,
      }))
      expect(evaluateDurationOutputWrite({
        outputCode: suggestion.durationOutputCode!,
        target: 'runtime_reference_api',
      }).allowed).toBe(true)

      const predicted = Number(suggestion.recommendedDurationDays)
      expect(predicted).toBe(sample.expectedPredictedDurationDays)
      const dedupeKey = `${fixture.fixtureVersion}:${sample.sampleId}`
      await recordDurationAccuracyPrediction({
        engineCode: 'standard_duration_reference',
        outputKind: 'new_task_reference_duration',
        projectId: sample.projectId,
        taskId: sample.taskId,
        dedupeKey,
        predictionBasis: suggestion.forecastSource,
        predictionSource: 'durationSuggestionAssemblyIntegration',
        modelVersion: fixture.fixtureVersion,
        predictedDurationDays: predicted,
        runtimeConsumptionState: 'seed_only',
        seedLineage: {
          fixtureVersion: fixture.fixtureVersion,
          sampleId: sample.sampleId,
          standardWorkCode: sample.standardWorkCode,
          seedVersion: suggestion.businessReasonParams?.seedVersion,
          seedStableCode: suggestion.businessReasonParams?.seedStableCode,
          sourceRef: sample.provenance.sourceRef,
        },
      })
      await recordDurationAccuracyBacktest({
        engineCode: 'standard_duration_reference',
        dedupeKey,
        actualDurationDays: sample.actualDurationDays,
        baselineAbsoluteErrorDays: sample.baselineAbsoluteErrorDays,
        actualContext: {
          fixtureVersion: fixture.fixtureVersion,
          sampleId: sample.sampleId,
          provenance: sample.provenance,
        },
      })
      predictions.push({ predicted, actual: sample.actualDurationDays })
    }

    const summary = await getDurationAlgorithmAccuracySummary({
      projectId: fixture.samples[0].projectId,
      engineCode: 'standard_duration_reference',
    })
    const metric = summary.metrics.find((item) => item.engineCode === 'standard_duration_reference')
    expect(metric).toEqual(expect.objectContaining({
      source: 'duration_algorithm_accuracy_events',
      sampleCount: 8,
      status: 'backtested',
    }))
    expect(metric!.maeDays).toBeLessThanOrEqual(3)
    expect(metric!.mape).toBeLessThanOrEqual(25)
    expect(metric!.overcompensationRate).toBeLessThanOrEqual(0.2)
    expect(predictions).toHaveLength(8)
    expect(persistence.tables.duration_algorithm_accuracy_events).toHaveLength(8)
    expect(persistence.tables.duration_algorithm_accuracy_events.every((row) => (
      row.backtest_status === 'backtested'
      && row.seed_lineage?.fixtureVersion === fixture.fixtureVersion
      && row.actual_context?.fixtureVersion === fixture.fixtureVersion
    ))).toBe(true)
  }, 15_000)
})
