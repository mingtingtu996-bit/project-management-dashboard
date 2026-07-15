import { describe, expect, it } from 'vitest'

import {
  persistCriticalPathRuleRuntimePublication,
  executeCriticalPathRuleRuntimeRollback,
  resolveCriticalPathRuleRuntimePublication,
  type CriticalPathRuleRuntimePublicationQueryExec,
} from '../services/criticalPathRuleRuntimePublicationService.js'
import type {
  CriticalPathRulePublicationReadiness,
} from '../services/criticalPathRulePublicationReadinessService.js'

const readyPublication: CriticalPathRulePublicationReadiness = {
  status: 'critical_path_rule_publication_ready',
  liveLearningEvidence: {
    assetClassificationRegistered: true,
    predictionEventRecorded: true,
    actualOutcomeEventRecorded: true,
    tieredLearningPolicyRegistered: true,
    enabledLearningScopes: ['global', 'industry', 'company', 'project'],
    runtimeConsumerUsesPublishedArtifact: true,
    criticalPathProjectionEvidencePresent: true,
    approvedCriticalPathRuleCandidateRecorded: true,
    criticalPathRulePublicationWriterReady: true,
    criticalPathRuleLineageRecorded: true,
    criticalPathFactsRemainLocked: true,
    releaseExitApproved: true,
    impactMonitoringReady: true,
    rollbackTargetReady: true,
    accuracyMetricsAvailable: true,
    criticalTaskCount: 3,
    projectedFloatTaskCount: 3,
  },
  criticalPathRuleLineage: {
    assetType: 'critical_path_rule_candidate',
    criticalPathRuleVersionId: 'critical-path-rule-version-v2',
    runtimePublicationKey: 'critical_path_rule_runtime:critical-path-rule-version-v2',
    rollbackTarget: 'critical_path_rule_runtime:critical-path-rule-version-v1',
    approvedCandidateEventIds: ['critical-candidate-1'],
    criticalPathInputHash: 'critical-input-hash-v2',
    criticalSetHash: 'critical-set-hash-v2',
    criticalPathAlgorithmVersion: 'cpm-v1.4.22.5',
    criticalTaskIds: ['task-a', 'task-b', 'task-c'],
    projectDurationDays: 28,
  },
  missingReasons: [],
}

describe('criticalPathRuleRuntimePublicationService', () => {
  it('persists a critical-path rule runtime publication without mutating critical path facts or plans', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec: CriticalPathRuleRuntimePublicationQueryExec = async (sql, params) => {
      calls.push({ sql, params })
      return []
    }

    const result = await persistCriticalPathRuleRuntimePublication({
      readiness: readyPublication,
      queryExec,
      executedAt: '2026-06-16T08:00:00.000Z',
      impactMonitoring: {
        monitoredAssetCount: 3,
        monitoringWindowHours: 72,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'critical_path_rule_runtime_published',
      writesCriticalPathRuleRuntime: true,
      writesTaskDatesDirectly: false,
      writesTaskCriticalOverridesDirectly: false,
      writesBaselinesOrMonthlyPlansDirectly: false,
      writesProgressFactsDirectly: false,
      publicationKey: 'critical_path_rule_runtime:critical-path-rule-version-v2',
      rollbackTarget: 'critical_path_rule_runtime:critical-path-rule-version-v1',
      reasons: [],
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).toContain('insert into public.construction_dependency_rule_runtime_publications')
    expect(joinedSql).toContain('insert into public.construction_dependency_rule_runtime_events')
    expect(joinedSql).not.toContain('task_critical_overrides')
    expect(joinedSql).not.toContain('update public.tasks')
    expect(joinedSql).not.toContain('insert into public.tasks')
    expect(joinedSql).not.toContain('task_baselines')
    expect(joinedSql).not.toContain('monthly_plan')
    expect(joinedSql).not.toContain('project_daily_snapshot')
    expect(joinedSql).not.toContain('task_dependencies')
    expect(joinedSql).not.toContain('algorithm_seed_records')
  })

  it('blocks runtime publication when readiness is not ready or the publication prefix is not critical-path scoped', async () => {
    const queryExec: CriticalPathRuleRuntimePublicationQueryExec = async () => {
      throw new Error('queryExec should not run for blocked critical path publication')
    }

    await expect(persistCriticalPathRuleRuntimePublication({
      readiness: {
        ...readyPublication,
        status: 'critical_path_rule_publication_not_ready',
        missingReasons: ['runtime_consumer_publication_required'],
      },
      queryExec,
    })).resolves.toEqual(expect.objectContaining({
      status: 'blocked',
      writesCriticalPathRuleRuntime: false,
      reasons: ['runtime_consumer_publication_required'],
    }))

    await expect(persistCriticalPathRuleRuntimePublication({
      readiness: {
        ...readyPublication,
        criticalPathRuleLineage: {
          ...readyPublication.criticalPathRuleLineage,
          runtimePublicationKey: 'dependency_rule_runtime:wrong-asset',
        },
      },
      queryExec,
    })).resolves.toEqual(expect.objectContaining({
      status: 'blocked',
      reasons: ['critical_path_rule_runtime_publication_key_required'],
    }))
  })

  it('rolls back only the critical-path rule runtime publication', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec: CriticalPathRuleRuntimePublicationQueryExec = async (sql, params) => {
      calls.push({ sql, params })
      return []
    }

    const result = await executeCriticalPathRuleRuntimeRollback({
      queryExec,
      sourcePublicationKey: 'critical_path_rule_runtime:critical-path-rule-version-v2',
      rollbackTarget: 'critical_path_rule_runtime:critical-path-rule-version-v1',
      reason: 'impact_monitoring_regression',
      executedAt: '2026-06-16T08:30:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'critical_path_rule_runtime_rollback_executed',
      writesCriticalPathRuleRuntime: true,
      writesTaskDatesDirectly: false,
      writesTaskCriticalOverridesDirectly: false,
      writesBaselinesOrMonthlyPlansDirectly: false,
      writesProgressFactsDirectly: false,
      sourcePublicationKey: 'critical_path_rule_runtime:critical-path-rule-version-v2',
      rollbackTarget: 'critical_path_rule_runtime:critical-path-rule-version-v1',
      reasons: [],
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).toContain("set runtime_publication_status = 'runtime_rolled_back'")
    expect(joinedSql).toContain('where publication_key = $3 and rollback_target = $4')
    expect(joinedSql).not.toContain('task_critical_overrides')
    expect(joinedSql).not.toContain('task_baselines')
    expect(joinedSql).not.toContain('monthly_plan')
    expect(joinedSql).not.toContain('project_daily_snapshot')
  })

  it('resolves only runtime-published critical-path rule publications for consumers', async () => {
    const queryExec: CriticalPathRuleRuntimePublicationQueryExec = async <T = Record<string, unknown>>(sql: string) => {
      expect(sql.toLowerCase()).toContain('from public.construction_dependency_rule_runtime_publications')
      expect(sql.toLowerCase()).toContain("runtime_publication_status = 'runtime_published'")
      expect(sql.toLowerCase()).toContain("publication_key like 'critical_path_rule_runtime:%'")
      return [{
        publication_key: 'critical_path_rule_runtime:critical-path-rule-version-v2',
        dependency_rule_version_id: 'critical-path-rule-version-v2',
        runtime_publication_status: 'runtime_published',
        dependency_rule_lineage: readyPublication.criticalPathRuleLineage,
        rollback_target: 'critical_path_rule_runtime:critical-path-rule-version-v1',
      }] as T[]
    }

    const result = await resolveCriticalPathRuleRuntimePublication({
      publicationKey: 'critical_path_rule_runtime:critical-path-rule-version-v2',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      runtimeConsumable: true,
      publicationKey: 'critical_path_rule_runtime:critical-path-rule-version-v2',
      criticalPathRuleVersionId: 'critical-path-rule-version-v2',
      reasons: [],
    }))
  })
})
