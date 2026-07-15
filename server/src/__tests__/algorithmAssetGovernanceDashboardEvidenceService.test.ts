import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  collectAlgorithmAssetGovernanceDashboardEvidence,
} from '../services/algorithmAssetGovernanceDashboardEvidenceService.js'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('algorithmAssetGovernanceDashboardEvidenceService', () => {
  it('collects company-scoped governance evidence without reading other companies', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('FROM public.algorithm_asset_candidate_events')) {
        return [
          {
            total_count: '3',
            review_required_count: '1',
            quarantined_count: '1',
            replay_ready_count: '1',
          },
        ] as T[]
      }
      if (sql.includes('FROM public.algorithm_asset_replay_runs')) {
        return [
          {
            total_count: '2',
            passed_count: '1',
            blocked_count: '1',
            failed_count: '0',
          },
        ] as T[]
      }
      if (sql.includes('FROM public.algorithm_sample_health_events')) {
        return [
          {
            total_count: '6',
            accepted_count: '3',
            weak_count: '2',
            rejected_count: '1',
            benchmark_eligible_count: '3',
          },
        ] as T[]
      }
      return [] as T[]
    }

    const evidence = await collectAlgorithmAssetGovernanceDashboardEvidence({
      companyId: 'company-a',
      queryExec,
    })

    expect(evidence).toEqual({
      companyId: 'company-a',
      scopePolicy: 'company_scoped_backend_governance_summary',
      candidateEvents: {
        totalCount: 3,
        reviewRequiredCount: 1,
        quarantinedCount: 1,
        replayReadyCount: 1,
      },
      replayRuns: {
        totalCount: 2,
        passedCount: 1,
        blockedCount: 1,
        failedCount: 0,
      },
      sampleHealth: {
        totalCount: 6,
        acceptedCount: 3,
        weakCount: 2,
        rejectedCount: 1,
        benchmarkEligibleCount: 3,
      },
      boundaryPolicy: [
        'dashboard_evidence_filters_by_current_company_id',
        'system_observation_and_other_company_rows_are_excluded',
        'sample_health_summary_is_observable_without_runtime_write',
      ],
    })

    expect(calls).toHaveLength(3)
    for (const call of calls) {
      expect(call.params).toEqual(['company-a'])
      expect(call.sql.toLowerCase()).toContain('company_id = $1')
      expect(call.sql.toLowerCase()).not.toContain(' or company_id is null')
    }
  })

  it('requires a current company before querying governance evidence', async () => {
    await expect(collectAlgorithmAssetGovernanceDashboardEvidence({
      companyId: null,
      queryExec: async () => [],
    })).rejects.toThrow('algorithm_asset_governance_dashboard_requires_company_id')
  })

  it('keeps default dashboard evidence reads on fixed rawQuery branches', () => {
    const source = readServerFile('src', 'services', 'algorithmAssetGovernanceDashboardEvidenceService.ts')

    expect(source).not.toContain('function buildDefaultQueryExec')
    expect(source).not.toContain('rawQuery(sql')
    expect(source).toContain('function runDefaultDashboardEvidenceQueries')
    expect(source).toContain('FROM public.algorithm_asset_candidate_events')
    expect(source).toContain('FROM public.algorithm_asset_replay_runs')
    expect(source).toContain('FROM public.algorithm_sample_health_events')
  })
})
