import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>
type Filter = { type: 'eq' | 'not' | 'in'; column: string; value: unknown }

function productionSample(row: Row): Row {
  return {
    ...row,
    sample_strength: row.sample_strength ?? 'strong',
    duration_day_basis: 'construction_production_day',
    actual_duration_production_days: row.actual_duration ?? null,
    planned_duration_production_days: row.planned_duration ?? null,
  }
}

const mocks = vi.hoisted(() => {
  const state = {
    durationExperienceSamples: [] as Row[],
  }

  function applyFilters(rows: Row[], filters: Filter[]) {
    return filters.reduce((result, filter) => {
      if (filter.type === 'eq') return result.filter((row) => row[filter.column] === filter.value)
      if (filter.type === 'in' && Array.isArray(filter.value)) {
        const values = filter.value
        return result.filter((row) => values.includes(row[filter.column]))
      }
      if (filter.type === 'not' && filter.column === 'actual_duration' && filter.value === null) {
        return result.filter((row) => row.actual_duration != null)
      }
      return result
    }, rows)
  }

  function sortRows(rows: Row[], orderArgs: [string, { ascending: boolean }] | null) {
    if (!orderArgs) return rows
    const [column, options] = orderArgs
    return [...rows].sort((left, right) => {
      const a = String(left[column] ?? '')
      const b = String(right[column] ?? '')
      return options.ascending ? a.localeCompare(b) : b.localeCompare(a)
    })
  }

  function createBuilder(table: string) {
    const filters: Filter[] = []
    let orderArgs: [string, { ascending: boolean }] | null = null
    let limitValue: number | null = null
    let rangeValue: [number, number] | null = null
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ type: 'eq', column, value })
        return builder
      }),
      not: vi.fn((column: string, _operator: string, value: unknown) => {
        filters.push({ type: 'not', column, value })
        return builder
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        if (column !== 'sample_strength') filters.push({ type: 'in', column, value: values })
        return builder
      }),
      order: vi.fn((column: string, options: { ascending: boolean }) => {
        orderArgs = [column, options]
        return builder
      }),
      limit: vi.fn((value: number) => {
        limitValue = value
        return builder
      }),
      range: vi.fn((from: number, to: number) => {
        rangeValue = [from, to]
        return builder
      }),
      then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        let rows = applyFilters(state.durationExperienceSamples, filters)
        rows = sortRows(rows, orderArgs)
        if (rangeValue) rows = rows.slice(rangeValue[0], rangeValue[1] + 1)
        if (limitValue != null) rows = rows.slice(0, limitValue)
        return Promise.resolve({ data: table === 'duration_experience_samples' ? rows : [], error: null }).then(resolve, reject)
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

const {
  loadPmRecoveryEligibilityDurationExperienceSamples,
  loadProgressVelocityCompanyDurationExperienceSamples,
  loadProgressVelocityProjectDurationExperienceSamples,
  loadProjectBaselineCalibrationDurationExperienceSamples,
  loadTemplateDurationGovernanceSamples,
} = await import('../services/durationContextSampleReadModelService.js')

describe('durationContextSampleReadModelService', () => {
  beforeEach(() => {
    mocks.state.durationExperienceSamples = []
    mocks.from.mockClear()
  })

  it('loads baseline calibration samples with the governed filters, descending completed_at order, and 80-row cap', async () => {
    mocks.state.durationExperienceSamples = [
      {
        id: 'inactive',
        project_id: 'project-a',
        task_id: 'task-inactive',
        planned_duration: 10,
        actual_duration: 8,
        sample_status: 'draft',
        included_in_benchmark: true,
        completed_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'excluded',
        project_id: 'project-a',
        task_id: 'task-excluded',
        planned_duration: 10,
        actual_duration: 8,
        sample_status: 'active',
        included_in_benchmark: false,
        completed_at: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 'missing-actual',
        project_id: 'project-a',
        task_id: 'task-missing',
        planned_duration: 10,
        actual_duration: null,
        sample_status: 'active',
        included_in_benchmark: true,
        completed_at: '2026-04-03T00:00:00.000Z',
      },
      {
        id: 'latest',
        project_id: 'project-a',
        task_id: 'task-latest',
        planned_duration: 10,
        actual_duration: 8,
        sample_status: 'active',
        included_in_benchmark: true,
        completed_at: '2026-04-05T00:00:00.000Z',
      },
      {
        id: 'older',
        project_id: 'project-a',
        task_id: 'task-older',
        planned_duration: 10,
        actual_duration: 9,
        sample_status: 'active',
        included_in_benchmark: true,
        completed_at: '2026-04-04T00:00:00.000Z',
      },
    ].map(productionSample)

    const rows = await loadProjectBaselineCalibrationDurationExperienceSamples('project-a')

    expect(rows.map((row) => row.id)).toEqual(['latest', 'older'])
    expect(mocks.from).toHaveBeenCalledWith('duration_experience_samples')
    const builder = mocks.from.mock.results[0]?.value
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('planned_duration'))
    expect(builder.eq).toHaveBeenCalledWith('project_id', 'project-a')
    expect(builder.eq).toHaveBeenCalledWith('sample_status', 'active')
    expect(builder.eq).toHaveBeenCalledWith('included_in_benchmark', true)
    expect(builder.not).toHaveBeenCalledWith('actual_duration', 'is', null)
    expect(builder.order).toHaveBeenCalledWith('completed_at', { ascending: false })
    expect(builder.limit).toHaveBeenCalledWith(80)
  })

  it('rejects weak and unusable samples even when legacy rows claim benchmark inclusion', async () => {
    mocks.state.durationExperienceSamples = [
      productionSample({
        id: 'strong',
        project_id: 'project-a',
        actual_duration: 8,
        sample_status: 'active',
        included_in_benchmark: true,
        sample_strength: 'strong',
      }),
      productionSample({
        id: 'medium',
        project_id: 'project-a',
        actual_duration: 9,
        sample_status: 'active',
        included_in_benchmark: true,
        sample_strength: 'medium',
      }),
      productionSample({
        id: 'weak',
        project_id: 'project-a',
        actual_duration: 10,
        sample_status: 'active',
        included_in_benchmark: true,
        sample_strength: 'weak',
      }),
      productionSample({
        id: 'unusable',
        project_id: 'project-a',
        actual_duration: 11,
        sample_status: 'active',
        included_in_benchmark: true,
        sample_strength: 'unusable',
      }),
    ]

    const rows = await loadProjectBaselineCalibrationDurationExperienceSamples('project-a')

    expect(rows.map((row) => row.id)).toEqual(['strong', 'medium'])
    const builder = mocks.from.mock.results[0]?.value
    expect(builder.in).toHaveBeenCalledWith('sample_strength', ['strong', 'medium'])
  })

  it('loads PM recovery eligibility samples with the governed filters and 30-row cap', async () => {
    mocks.state.durationExperienceSamples = Array.from({ length: 31 }, (_, index) => productionSample({
      id: `sample-${index + 1}`,
      project_id: 'project-b',
      task_id: `task-${index + 1}`,
      planned_duration: 10,
      actual_duration: 8,
      sample_status: 'active',
      included_in_benchmark: true,
      completed_at: `2026-04-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    }))

    const rows = await loadPmRecoveryEligibilityDurationExperienceSamples('project-b')

    expect(rows).toHaveLength(30)
    expect(rows[0]?.id).toBe('sample-1')
    expect(rows[29]?.id).toBe('sample-30')
    const builder = mocks.from.mock.results[0]?.value
    expect(builder.eq).toHaveBeenCalledWith('project_id', 'project-b')
    expect(builder.eq).toHaveBeenCalledWith('sample_status', 'active')
    expect(builder.eq).toHaveBeenCalledWith('included_in_benchmark', true)
    expect(builder.not).toHaveBeenCalledWith('actual_duration', 'is', null)
    expect(builder.order).not.toHaveBeenCalled()
    expect(builder.limit).toHaveBeenCalledWith(30)
  })

  it('requires both company and project identity for project-scoped progress learning samples', async () => {
    mocks.state.durationExperienceSamples = [
      {
        id: 'same-tenant-project',
        company_id: 'company-a',
        project_id: 'project-a',
        actual_duration: 8,
        sample_status: 'active',
        included_in_benchmark: true,
      },
      {
        id: 'other-tenant-project',
        company_id: 'company-b',
        project_id: 'project-a',
        actual_duration: 9,
        sample_status: 'active',
        included_in_benchmark: true,
      },
    ].map(productionSample)

    const rows = await loadProgressVelocityProjectDurationExperienceSamples({
      companyId: 'company-a',
      projectId: 'project-a',
      limit: 200,
    })

    expect(rows.map((row) => row.id)).toEqual(['same-tenant-project'])
    const builder = mocks.from.mock.results[0]?.value
    expect(builder.eq).toHaveBeenCalledWith('company_id', 'company-a')
    expect(builder.eq).toHaveBeenCalledWith('project_id', 'project-a')
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('evidence_fingerprint'))
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('source_lineage'))
  })

  it('loads company-scoped progress samples through an explicit tenant filter and excludes the current project', async () => {
    mocks.state.durationExperienceSamples = [
      {
        id: 'current-project',
        company_id: 'company-a',
        project_id: 'project-a',
        actual_duration: 8,
        sample_status: 'active',
        included_in_benchmark: true,
      },
      {
        id: 'company-peer',
        company_id: 'company-a',
        project_id: 'project-b',
        actual_duration: 9,
        sample_status: 'active',
        included_in_benchmark: true,
      },
      {
        id: 'other-company',
        company_id: 'company-b',
        project_id: 'project-c',
        actual_duration: 10,
        sample_status: 'active',
        included_in_benchmark: true,
      },
    ].map(productionSample)

    const rows = await loadProgressVelocityCompanyDurationExperienceSamples({
      companyId: 'company-a',
      excludeProjectId: 'project-a',
      limit: 200,
    })

    expect(rows.map((row) => row.id)).toEqual(['company-peer'])
    const builder = mocks.from.mock.results[0]?.value
    expect(builder.eq).toHaveBeenCalledWith('company_id', 'company-a')
    expect(builder.eq).not.toHaveBeenCalledWith('project_id', 'project-a')
  })

  it('fails closed when a governed progress sample read omits tenant identity', async () => {
    await expect(loadProgressVelocityProjectDurationExperienceSamples({
      companyId: '',
      projectId: 'project-a',
      limit: 200,
    })).resolves.toEqual([])
    await expect(loadProgressVelocityCompanyDurationExperienceSamples({
      companyId: '',
      limit: 200,
    })).resolves.toEqual([])
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('only exposes explicitly owned and traceable T1 actual-outcome samples to template governance', async () => {
    const governedIdentity = {
      company_id: 'company-a',
      project_id: 'project-a',
      task_id: 'task-a',
      actual_duration: 8,
      sample_status: 'active',
      included_in_benchmark: true,
      experience_tier: 'T1',
      reuse_scope: 'project',
      fact_source: 'actual_outcome',
      evidence_fingerprint: 'sha256:sample-a',
      sample_strength: 'strong',
      source_lineage: { sourceType: 'task_actual_dates' },
      duration_day_basis: 'construction_production_day',
      actual_duration_production_days: 8,
    }
    mocks.state.durationExperienceSamples = [
      { id: 'governed', ...governedIdentity, completed_at: '2026-07-03T00:00:00.000Z' },
      { id: 'tenantless', ...governedIdentity, company_id: null },
      { id: 'untraceable', ...governedIdentity, source_lineage: null },
      { id: 'aggregated', ...governedIdentity, experience_tier: 'T2' },
      { id: 'wrong-fact', ...governedIdentity, fact_source: 'behavioral' },
    ]

    const rows = await loadTemplateDurationGovernanceSamples({ limit: 1000 })

    expect(rows.map((row) => row.id)).toEqual(['governed'])
    const builder = mocks.from.mock.results[0]?.value
    expect(builder.eq).toHaveBeenCalledWith('sample_status', 'active')
    expect(builder.eq).toHaveBeenCalledWith('included_in_benchmark', true)
    expect(builder.not).toHaveBeenCalledWith('actual_duration', 'is', null)
    expect(builder.order).toHaveBeenCalledWith('company_id', { ascending: true })
    expect(builder.order).toHaveBeenCalledWith('project_id', { ascending: true })
    expect(builder.order).toHaveBeenCalledWith('completed_at', { ascending: true })
    expect(builder.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(builder.range).toHaveBeenCalledWith(0, 999)
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('updated_at'))
  })

  it('pages through more than one thousand governed samples instead of starving older projects forever', async () => {
    mocks.state.durationExperienceSamples = Array.from({ length: 1001 }, (_, index) => ({
      id: `governed-${String(index + 1).padStart(4, '0')}`,
      company_id: index < 1000 ? 'company-a' : 'company-z',
      project_id: index < 1000 ? 'project-new' : 'project-old',
      task_id: `task-${index + 1}`,
      actual_duration: 8,
      sample_status: 'active',
      included_in_benchmark: true,
      experience_tier: 'T1',
      reuse_scope: 'project',
      fact_source: 'actual_outcome',
      evidence_fingerprint: `sha256:${index + 1}`,
      sample_strength: 'strong',
      source_lineage: { sourceType: 'task_actual_dates' },
      duration_day_basis: 'construction_production_day',
      actual_duration_production_days: 8,
      completed_at: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    }))

    const rows = await loadTemplateDurationGovernanceSamples({ limit: 1000 })

    expect(rows).toHaveLength(1001)
    expect(rows.at(-1)?.project_id).toBe('project-old')
    expect(mocks.from).toHaveBeenCalledTimes(2)
    expect(mocks.from.mock.results[0]?.value.range).toHaveBeenCalledWith(0, 999)
    expect(mocks.from.mock.results[1]?.value.range).toHaveBeenCalledWith(1000, 1999)
  })
})
