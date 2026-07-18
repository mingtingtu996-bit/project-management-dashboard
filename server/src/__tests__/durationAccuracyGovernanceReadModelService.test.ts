import { describe, expect, it, vi } from 'vitest'

import {
  createDurationAccuracyGovernanceReadQueryExec,
  getDurationAccuracyGovernanceReadModel,
  type DurationAccuracyGovernanceReadQueryExec,
} from '../services/durationAccuracyGovernanceReadModelService.js'

describe('duration accuracy governance read model', () => {
  it('executes fixed parameterized reads through the direct PostgreSQL adapter', async () => {
    const rawQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [{ id: 'row-1' }] }))
    const queryExec = createDurationAccuracyGovernanceReadQueryExec(rawQuery)

    await expect(queryExec<{ id: string }>('SELECT id FROM public.example WHERE id = $1', ['row-1']))
      .resolves.toEqual([{ id: 'row-1' }])
    expect(rawQuery).toHaveBeenCalledWith(
      'SELECT id FROM public.example WHERE id = $1',
      ['row-1'],
    )
  })

  it('returns sanitized real rows scoped to the current company visible projects', async () => {
    const queryMock = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('duration_algorithm_accuracy_events')) {
        expect(params).toEqual([['project-1', 'project-2'], 25])
        return [{
          id: 'sample-1',
          project_id: 'project-1',
          engine_code: 'critical_path_cpm',
          output_kind: 'critical_path_project_duration',
          prediction_basis: 'runtime_snapshot',
          model_version: 'critical_path_cpm_v1',
          predicted_duration_days: 40,
          actual_duration_days: 43,
          signed_error_days: 3,
          backtest_status: 'backtested',
          backtested_at: '2026-07-10T00:00:00.000Z',
        }]
      }
      if (sql.includes('duration_learning_runtime_publications')) {
        expect(params).toEqual(['company-1', ['project-1', 'project-2'], 25])
        return [{
          publication_key: 'duration-learning:one',
          asset_key: 'base_duration_benchmark',
          scope_level: 'project',
          company_id: 'company-1',
          project_id: 'project-1',
          publication_stage: 'canary',
          traffic_percent: 10,
          monitoring_status: 'collecting',
          published_at: '2026-07-11T00:00:00.000Z',
          runtime_payload: { mustNotLeak: true },
        }]
      }
      if (sql.includes('runtime_consumer_runtime_calls')) {
        expect(params).toEqual(['company-1', ['project-1', 'project-2'], 25])
        return [{
          id: 'call-1',
          consumer_key: 'durationSuggestionService',
          runtime_entry_ref: 'durationSuggestionService:getTaskDurationSuggestion',
          call_status: 'called',
          called_at: '2026-07-12T00:00:00.000Z',
          call_context: { projectId: 'project-1', secret: 'must-not-leak' },
        }]
      }
      if (sql.includes('runtime_consumer_observations')) {
        expect(params).toEqual(['company-1', ['project-1', 'project-2'], 25])
        return [{
          id: 'observation-1',
          asset_key: 'base_duration_benchmark',
          publication_key: 'duration-learning:one',
          consumer_key: 'durationSuggestionService',
          consumer_surface: 'duration_suggestion',
          observation_status: 'observed',
          observed_at: '2026-07-12T00:01:00.000Z',
          observation_context: { projectId: 'project-1', secret: 'must-not-leak' },
        }]
      }
      return []
    })
    const queryExec: DurationAccuracyGovernanceReadQueryExec = async <T>(sql: string, params?: unknown[]) =>
      await queryMock(sql, params) as T[]

    const result = await getDurationAccuracyGovernanceReadModel({
      companyId: 'company-1',
      projectIds: ['project-1', 'project-2'],
      queryExec,
      now: '2026-07-18T00:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'duration_accuracy_governance_read_model',
      generatedAt: '2026-07-18T00:00:00.000Z',
      scope: {
        companyId: 'company-1',
        projectId: null,
        projectIds: ['project-1', 'project-2'],
      },
      sourceStatus: {
        samples: 'available',
        publications: 'available',
        runtimeCalls: 'available',
        observations: 'available',
      },
    }))
    expect(result.samples).toEqual([expect.objectContaining({
      id: 'sample-1',
      projectId: 'project-1',
      engineCode: 'critical_path_cpm',
      signedErrorDays: 3,
    })])
    expect(result.publications).toEqual([expect.not.objectContaining({ runtimePayload: expect.anything() })])
    expect(result.runtimeCalls).toEqual([expect.not.objectContaining({ callContext: expect.anything() })])
    expect(result.observations).toEqual([expect.not.objectContaining({ observationContext: expect.anything() })])
  })

  it('keeps independent sections usable when one governed source is unavailable', async () => {
    const queryMock = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('duration_learning_runtime_publications')) {
        throw new Error('relation does not exist')
      }
      return []
    })
    const queryExec: DurationAccuracyGovernanceReadQueryExec = async <T>(sql: string, params?: unknown[]) =>
      await queryMock(sql, params) as T[]

    const result = await getDurationAccuracyGovernanceReadModel({
      companyId: 'company-1',
      projectId: 'project-1',
      projectIds: ['project-1'],
      queryExec,
    })

    expect(result.publications).toEqual([])
    expect(result.sourceStatus.publications).toBe('unavailable')
    expect(result.sourceErrors.publications).toBe('duration_accuracy_publications_unavailable')
    expect(result.sourceStatus.samples).toBe('available')
    expect(result.sourceStatus.runtimeCalls).toBe('available')
    expect(result.sourceStatus.observations).toBe('available')
  })

  it('filters adapter-returned rows through the company/project scope and normalizes database timestamps', async () => {
    const timestamp = new Date('2026-07-12T00:00:00.000Z')
    const queryMock = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('duration_algorithm_accuracy_events')) {
        return [
          { id: 'sample-visible', project_id: 'project-1', backtested_at: timestamp },
          { id: 'sample-hidden', project_id: 'project-hidden', backtested_at: timestamp },
        ]
      }
      if (sql.includes('duration_learning_runtime_publications')) {
        return [
          { publication_key: 'publication-project', asset_key: 'base_duration_benchmark', scope_level: 'project', company_id: 'company-1', project_id: 'project-1', published_at: timestamp },
          { publication_key: 'publication-company', asset_key: 'base_duration_benchmark', scope_level: 'company', company_id: 'company-1', project_id: null, published_at: timestamp },
          { publication_key: 'publication-global', asset_key: 'base_duration_benchmark', scope_level: 'global', company_id: null, project_id: null, published_at: timestamp },
          { publication_key: 'publication-hidden-project', asset_key: 'base_duration_benchmark', scope_level: 'project', company_id: 'company-1', project_id: 'project-hidden', published_at: timestamp },
          { publication_key: 'publication-other-company', asset_key: 'base_duration_benchmark', scope_level: 'company', company_id: 'company-2', project_id: null, published_at: timestamp },
        ]
      }
      if (sql.includes('runtime_consumer_runtime_calls')) {
        return [
          { id: 'call-project', consumer_key: 'one', call_context: { projectId: 'project-1' }, called_at: timestamp },
          { id: 'call-company', consumer_key: 'two', call_context: { companyId: 'company-1' }, called_at: timestamp },
          { id: 'call-hidden-project', consumer_key: 'three', call_context: { companyId: 'company-1', projectId: 'project-hidden' }, called_at: timestamp },
          { id: 'call-other-company', consumer_key: 'four', call_context: { company_id: 'company-2' }, called_at: timestamp },
          { id: 'call-unscoped', consumer_key: 'five', call_context: {}, called_at: timestamp },
        ]
      }
      if (sql.includes('runtime_consumer_observations')) {
        return [
          { id: 'observation-project', asset_key: 'base_duration_benchmark', observation_context: { project_id: 'project-1' }, observed_at: timestamp },
          { id: 'observation-company', asset_key: 'base_duration_benchmark', observation_context: { company_id: 'company-1' }, observed_at: timestamp },
          { id: 'observation-hidden-project', asset_key: 'base_duration_benchmark', observation_context: { companyId: 'company-1', projectId: 'project-hidden' }, observed_at: timestamp },
          { id: 'observation-conflicting-scope', asset_key: 'base_duration_benchmark', observation_context: { companyId: 'company-1', company_id: 'company-2' }, observed_at: timestamp },
        ]
      }
      return []
    })
    const queryExec: DurationAccuracyGovernanceReadQueryExec = async <T>(sql: string, params?: unknown[]) =>
      await queryMock(sql, params) as T[]

    const result = await getDurationAccuracyGovernanceReadModel({
      companyId: 'company-1',
      projectIds: ['project-1'],
      queryExec,
    })

    expect(result.samples.map((row) => row.id)).toEqual(['sample-visible'])
    expect(result.publications.map((row) => row.publicationKey)).toEqual([
      'publication-project',
      'publication-company',
      'publication-global',
    ])
    expect(result.runtimeCalls.map((row) => row.id)).toEqual(['call-project', 'call-company'])
    expect(result.observations.map((row) => row.id)).toEqual(['observation-project', 'observation-company'])
    expect(result.samples[0]?.backtestedAt).toBe('2026-07-12T00:00:00.000Z')
    expect(result.publications[0]?.publishedAt).toBe('2026-07-12T00:00:00.000Z')
    expect(result.runtimeCalls[0]?.calledAt).toBe('2026-07-12T00:00:00.000Z')
    expect(result.observations[0]?.observedAt).toBe('2026-07-12T00:00:00.000Z')
  })

  it('does not issue project-scoped reads when the visible project allow-list is empty', async () => {
    const queryExec = vi.fn()

    const result = await getDurationAccuracyGovernanceReadModel({
      companyId: 'company-1',
      projectIds: [],
      queryExec,
    })

    expect(queryExec).not.toHaveBeenCalled()
    expect(result.samples).toEqual([])
    expect(result.publications).toEqual([])
    expect(result.runtimeCalls).toEqual([])
    expect(result.observations).toEqual([])
  })
})
