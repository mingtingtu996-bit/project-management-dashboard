import { describe, expect, it } from 'vitest'

import {
  executeConstructionDependencyRuleRuntimeRollback,
  persistConstructionDependencyRuleRuntimePublication,
  resolveConstructionDependencyRuleRuntimePublication,
} from '../services/constructionDependencyRuleRuntimePublicationService.js'
import type {
  ConstructionDependencyRuleRuntimePublicationQueryExec,
} from '../services/constructionDependencyRuleRuntimePublicationService.js'
import type {
  ConstructionDependencyRulePublicationReadiness,
} from '../services/constructionDependencyReplayCalibrationService.js'

const readyPublication: ConstructionDependencyRulePublicationReadiness = {
  status: 'dependency_rule_publication_ready',
  liveLearningEvidence: {
    assetClassificationRegistered: true,
    predictionEventRecorded: true,
    actualOutcomeEventRecorded: true,
    tieredLearningPolicyRegistered: true,
    enabledLearningScopes: ['global', 'industry', 'company', 'project'],
    runtimeConsumerUsesPublishedArtifact: true,
    replayReportOnly: true,
    dependencyWritePolicyPreserved: true,
    dependencyRuleCandidatePresent: true,
    approvedDependencyRuleCandidateRecorded: true,
    dependencyRulePublicationWriterReady: true,
    dependencyRuleLineageRecorded: true,
    releaseExitApproved: true,
    impactMonitoringReady: true,
    rollbackTargetReady: true,
    accuracyMetricsAvailable: true,
    comparableActualDateCount: 4,
  },
  dependencyRuleLineage: {
    assetType: 'dependency_rule_candidate',
    dependencyRuleVersionId: 'dependency-rule-version-v2',
    runtimePublicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
    rollbackTarget: 'dependency_rule_runtime:dependency-rule-version-v1',
    approvedCandidateEventIds: ['dependency-candidate-1'],
    sourceDependencyIds: ['dep-1', 'dep-2'],
    matchedSeedCodes: ['prefab_factory_to_site_hoist_handoff'],
    replayReportCode: 'construction_dependency_replay_calibration',
    comparableActualDateCount: 4,
  },
  missingReasons: [],
}

describe('constructionDependencyRuleRuntimePublicationService', () => {
  it('persists a dependency rule runtime publication without writing task dependencies or seed runtime', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return []
    }

    const result = await persistConstructionDependencyRuleRuntimePublication({
      readiness: readyPublication,
      queryExec,
      executedAt: '2026-06-15T03:30:00.000Z',
      impactMonitoring: {
        monitoredAssetCount: 2,
        monitoringWindowHours: 72,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'dependency_rule_runtime_published',
      writesDependencyRuleRuntime: true,
      writesTaskDependenciesDirectly: false,
      writesSeedRuntimeDirectly: false,
      publicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
      rollbackTarget: 'dependency_rule_runtime:dependency-rule-version-v1',
      reasons: [],
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).toContain('insert into public.construction_dependency_rule_runtime_publications')
    expect(joinedSql).toContain('insert into public.construction_dependency_rule_runtime_events')
    expect(joinedSql).not.toContain('insert into public.task_dependencies')
    expect(joinedSql).not.toContain('update public.task_dependencies')
    expect(joinedSql).not.toContain('algorithm_seed_records')
    expect(joinedSql).not.toContain('algorithm_seed_versions')
  })

  it('blocks runtime publication when readiness is not ready', async () => {
    const queryExec = async () => {
      throw new Error('queryExec should not be called for blocked publication')
    }

    const result = await persistConstructionDependencyRuleRuntimePublication({
      readiness: {
        ...readyPublication,
        status: 'dependency_rule_publication_not_ready',
        missingReasons: ['runtime_consumer_publication_required'],
      },
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      writesDependencyRuleRuntime: false,
      writesTaskDependenciesDirectly: false,
      writesSeedRuntimeDirectly: false,
      reasons: ['runtime_consumer_publication_required'],
    }))
  })

  it('rolls back only the scoped dependency rule runtime publication', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return []
    }

    const result = await executeConstructionDependencyRuleRuntimeRollback({
      queryExec,
      sourcePublicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
      rollbackTarget: 'dependency_rule_runtime:dependency-rule-version-v1',
      reason: 'impact_monitoring_regression',
      executedAt: '2026-06-15T04:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      writesDependencyRuleRuntime: true,
      writesTaskDependenciesDirectly: false,
      writesSeedRuntimeDirectly: false,
      sourcePublicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
      rollbackTarget: 'dependency_rule_runtime:dependency-rule-version-v1',
      reasons: [],
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).toContain("set runtime_publication_status = 'runtime_rolled_back'")
    expect(joinedSql).toContain('where publication_key = $3 and rollback_target = $4')
    expect(joinedSql).not.toContain('task_dependencies')
    expect(joinedSql).not.toContain('algorithm_seed_records')
  })

  it('resolves only runtime-published dependency rule publications for consumers', async () => {
    const queryExec: ConstructionDependencyRuleRuntimePublicationQueryExec = async <T = Record<string, unknown>>(sql: string) => {
      expect(sql.toLowerCase()).toContain('from public.construction_dependency_rule_runtime_publications')
      expect(sql.toLowerCase()).toContain("runtime_publication_status = 'runtime_published'")
      return [{
        publication_key: 'dependency_rule_runtime:dependency-rule-version-v2',
        dependency_rule_version_id: 'dependency-rule-version-v2',
        runtime_publication_status: 'runtime_published',
        dependency_rule_lineage: readyPublication.dependencyRuleLineage,
        rollback_target: 'dependency_rule_runtime:dependency-rule-version-v1',
      }] as T[]
    }

    const result = await resolveConstructionDependencyRuleRuntimePublication({
      publicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      runtimeConsumable: true,
      publicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
      dependencyRuleVersionId: 'dependency-rule-version-v2',
      reasons: [],
    }))
  })
})
