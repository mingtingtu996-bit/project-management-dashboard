import { describe, expect, it } from 'vitest'

import {
  executeMetricRuntimeRollback,
  persistMetricRuntimePublication,
  resolveMetricRuntimePublication,
} from '../services/metricRuntimePublicationService.js'
import type {
  MetricRuntimePublicationQueryExec,
  MetricRuntimePublicationReadiness,
} from '../services/metricRuntimePublicationService.js'

const readyMetricPublication: MetricRuntimePublicationReadiness = {
  status: 'metric_publication_ready',
  metricLineage: {
    metricKey: 'business_health_score',
    metricCaliberVersionId: 'metric-caliber:business_health_score:v2',
    runtimePublicationKey: 'metric_runtime:business_health_score:v2',
    rollbackTarget: 'metric_runtime:business_health_score:v1',
    producerContractRef: 'server/src/services/metricRegistryService.ts',
    snapshotPersistenceRef: 'server/src/services/projectDailySnapshotService.ts',
    dashboardConsumerContractRef: 'server/src/routes/dashboard.ts',
  },
  missingReasons: [],
}

describe('metricRuntimePublicationService', () => {
  it('persists a scoped metric runtime publication without writing snapshots or project facts', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return []
    }

    const result = await persistMetricRuntimePublication({
      readiness: readyMetricPublication,
      companyId: 'company-a',
      queryExec,
      executedAt: '2026-06-15T08:30:00.000Z',
      impactMonitoring: {
        monitoredMetricCount: 1,
        monitoringWindowHours: 72,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'metric_runtime_published',
      canPersist: true,
      writesMetricRuntime: true,
      writesMetricValueSnapshotsDirectly: false,
      writesProjectDailySnapshotDirectly: false,
      writesProjectFactsDirectly: false,
      publicationKey: 'metric_runtime:business_health_score:v2',
      rollbackTarget: 'metric_runtime:business_health_score:v1',
      reasons: [],
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).toContain('insert into public.metric_runtime_publications')
    expect(joinedSql).toContain('insert into public.metric_runtime_events')
    expect(joinedSql).not.toContain('insert into public.metric_value_snapshots')
    expect(joinedSql).not.toContain('update public.metric_value_snapshots')
    expect(joinedSql).not.toContain('insert into public.project_daily_snapshot')
    expect(joinedSql).not.toContain('update public.project_daily_snapshot')
    expect(joinedSql).not.toContain('insert into public.projects')
    expect(joinedSql).not.toContain('update public.projects')
  })

  it('blocks publication when readiness or company scope is missing', async () => {
    const queryExec = async () => {
      throw new Error('queryExec should not be called for blocked metric publication')
    }

    const result = await persistMetricRuntimePublication({
      readiness: {
        ...readyMetricPublication,
        status: 'metric_publication_not_ready',
        missingReasons: ['snapshot_persistence_required'],
      },
      companyId: null,
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      canPersist: false,
      writesMetricRuntime: false,
      writesMetricValueSnapshotsDirectly: false,
      writesProjectDailySnapshotDirectly: false,
      writesProjectFactsDirectly: false,
      reasons: expect.arrayContaining([
        'snapshot_persistence_required',
        'company_scope_required',
      ]),
    }))
  })

  it('blocks runtime publication for metric keys outside the unified registry', async () => {
    const queryExec = async () => {
      throw new Error('queryExec should not be called for unregistered metric publication')
    }

    const result = await persistMetricRuntimePublication({
      readiness: {
        ...readyMetricPublication,
        metricLineage: {
          ...readyMetricPublication.metricLineage,
          metricKey: 'orphan_runtime_metric',
          runtimePublicationKey: 'metric_runtime:orphan_runtime_metric:v1',
        },
      },
      companyId: 'company-a',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      canPersist: false,
      writesMetricRuntime: false,
      reasons: expect.arrayContaining(['metric_registry_entry_required']),
    }))
  })

  it('resolves only scoped runtime-published metric publications for consumers', async () => {
    const queryExec: MetricRuntimePublicationQueryExec = async <T = Record<string, unknown>>(sql: string) => {
      const normalizedSql = sql.toLowerCase()
      expect(normalizedSql).toContain('from public.metric_runtime_publications')
      expect(normalizedSql).toContain("runtime_publication_status = 'runtime_published'")
      expect(normalizedSql).toContain('company_id = $2')
      return [{
        publication_key: 'metric_runtime:business_health_score:v2',
        metric_key: 'business_health_score',
        metric_caliber_version_id: 'metric-caliber:business_health_score:v2',
        runtime_publication_status: 'runtime_published',
        metric_lineage: readyMetricPublication.metricLineage,
        rollback_target: 'metric_runtime:business_health_score:v1',
        company_id: 'company-a',
        project_id: null,
      }] as T[]
    }

    const result = await resolveMetricRuntimePublication({
      publicationKey: 'metric_runtime:business_health_score:v2',
      companyId: 'company-a',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      runtimeConsumable: true,
      publicationKey: 'metric_runtime:business_health_score:v2',
      metricKey: 'business_health_score',
      metricCaliberVersionId: 'metric-caliber:business_health_score:v2',
      reasons: [],
    }))
  })

  it('rolls back only the scoped metric runtime publication', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return []
    }

    const result = await executeMetricRuntimeRollback({
      queryExec,
      companyId: 'company-a',
      sourcePublicationKey: 'metric_runtime:business_health_score:v2',
      rollbackTarget: 'metric_runtime:business_health_score:v1',
      reason: 'dashboard_metric_regression',
      executedAt: '2026-06-15T09:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      sourcePublicationKey: 'metric_runtime:business_health_score:v2',
      rollbackTarget: 'metric_runtime:business_health_score:v1',
      writesMetricRuntime: true,
      writesMetricValueSnapshotsDirectly: false,
      writesProjectDailySnapshotDirectly: false,
      writesProjectFactsDirectly: false,
      reasons: [],
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).toContain("set runtime_publication_status = 'runtime_rolled_back'")
    expect(joinedSql).toContain('where publication_key = $3 and rollback_target = $4 and company_id = $5')
    expect(joinedSql).not.toContain('metric_value_snapshots')
    expect(joinedSql).not.toContain('project_daily_snapshot')
    expect(joinedSql).not.toContain('projects')
  })
})
