import { describe, expect, it } from 'vitest'

import {
  buildCausalDedupeDiagnostics,
  buildEffectiveFactorContributionLedger,
  buildExplainPackage,
  buildFactorContributionLedger,
  buildInputCoverage,
  buildReadinessGraph,
  resolveDurationContextInterferenceMatrix,
  summarizeLedgerDurationScenario,
} from '../services/durationContextFactorSynthesisService.js'
import type { DurationContextFactor, DurationContextInput } from '../services/durationContextService.js'

describe('durationContextFactorSynthesisService', () => {
  it('synthesizes factor ledger, scenarios, coverage, and explain payload without runtime reads or writes', () => {
    const contextInput: DurationContextInput = {
      projectId: 'project-1',
      taskId: 'task-1',
      buildingObjectId: 'building-a',
      floorObjectId: 'floor-03',
      zoneObjectId: 'zone-east',
      responsibleUnitId: 'unit-a',
      standardWorkCode: 'SW-001',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-10',
    }
    const factors: DurationContextFactor[] = [
      {
        key: 'external_readiness',
        label: 'External readiness',
        multiplier: 1.2,
        extraDays: 3,
        confidenceDelta: -8,
        actionPolicy: 'auto_apply',
        source: 'external_readiness',
        dataDependencies: ['task_conditions'],
        reason: 'Open start condition blocks the workface',
        metadata: {
          sourceEntityKeys: ['condition:foundation-ready'],
          hardConditionCount: 1,
        },
      },
      {
        key: 'progress_velocity',
        label: 'Progress velocity',
        multiplier: 1.1,
        extraDays: 2,
        confidenceDelta: -5,
        actionPolicy: 'auto_apply',
        source: 'project_history',
        dataDependencies: ['task_progress_snapshots'],
        reason: 'Lag is explained by the same external readiness condition',
        metadata: {
          sourceEntityKeys: ['condition:foundation-ready'],
        },
      },
      {
        key: 'weather_forecast_impact',
        label: 'Weather forecast',
        multiplier: 1.3,
        extraDays: 4,
        confidenceDelta: -6,
        actionPolicy: 'candidate_only',
        source: 'weather_fact',
        dataDependencies: ['weather_forecast'],
        reason: 'Heavy rain candidate window',
        metadata: {
          sourceEntityType: 'weather_event',
          sourceEntityId: 'rain-001',
        },
      },
    ]

    const baseLedger = buildFactorContributionLedger(contextInput, factors)
    const dedupe = buildCausalDedupeDiagnostics(factors)
    const interference = resolveDurationContextInterferenceMatrix(baseLedger)
    const effectiveLedger = buildEffectiveFactorContributionLedger(baseLedger, dedupe, interference)
    const committedScenario = summarizeLedgerDurationScenario({
      ledger: effectiveLedger,
      policy: 'auto_apply_only',
      extraDaysCap: {
        plannedDuration: 10,
        cap: 5,
        cappedExtraDays: 5,
        policy: 'test_cap',
      },
    })
    const candidateScenario = summarizeLedgerDurationScenario({
      ledger: effectiveLedger,
      policy: 'auto_apply_plus_candidate_only',
      extraDaysCap: {
        plannedDuration: 10,
        cap: 5,
        cappedExtraDays: 5,
        policy: 'test_cap',
      },
    })
    const inputCoverage = buildInputCoverage(factors)
    const readinessGraph = buildReadinessGraph(contextInput, factors)
    const explainPackage = buildExplainPackage({
      ledger: effectiveLedger,
      readinessGraph,
      causalDedupe: dedupe,
      inputCoverage,
      multiplier: committedScenario.multiplier,
      extraDays: committedScenario.extraDays,
      confidenceDelta: -16,
      runtimeCache: { touched: false },
    })

    expect(baseLedger[0]).toEqual(expect.objectContaining({
      key: 'external_readiness',
      contributionMode: 'extra_days_and_multiplier',
      scopeFingerprint: 'project:project-1|task:task-1|building:building-a|floor:floor-03|zone:zone-east|unit:unit-a|work:SW-001',
      sourceEntityKeys: ['condition:foundation-ready'],
      dedupeKey: 'external_readiness:condition:foundation-ready',
    }))
    expect(dedupe).toEqual(expect.objectContaining({
      duplicateSourceEntityCount: 1,
      suppressedFactorKeys: ['progress_velocity'],
      appliedToSynthesis: true,
    }))
    expect(interference.suppressionByFactorKey.progress_velocity).toEqual(expect.objectContaining({
      primaryFactorKey: 'external_readiness',
      relation: 'causal',
      suppressionMode: 'half',
    }))
    expect(effectiveLedger.find((entry) => entry.key === 'progress_velocity')).toEqual(expect.objectContaining({
      contributionMode: 'interference_secondary',
      multiplier: 1,
      extraDays: 0,
      confidenceDelta: -2,
      diagnosticOriginalMultiplier: 1.1,
      diagnosticOriginalExtraDays: 2,
      diagnosticOriginalConfidenceDelta: -5,
      suppressedByFactorKey: 'external_readiness',
    }))
    expect(committedScenario).toEqual(expect.objectContaining({
      policy: 'auto_apply_only',
      multiplier: 1.2,
      rawMultiplier: 1.2,
      extraDays: 3,
      rawExtraDays: 3,
      factorKeys: ['external_readiness', 'progress_velocity'],
    }))
    expect(candidateScenario).toEqual(expect.objectContaining({
      policy: 'auto_apply_plus_candidate_only',
      multiplier: 1.56,
      rawMultiplier: 1.56,
      extraDays: 5,
      rawExtraDays: 7,
      factorKeys: ['external_readiness', 'progress_velocity', 'weather_forecast_impact'],
    }))
    expect(inputCoverage).toEqual(expect.objectContaining({
      external_readiness: true,
      progress_velocity: true,
      weather_forecast_impact: true,
      task_conditions: true,
      task_progress_snapshots: true,
      weather_forecast: true,
    }))
    expect(readinessGraph).toEqual(expect.objectContaining({
      primaryFactorKey: 'external_readiness',
      rootCauseEntityKeys: ['condition:foundation-ready'],
      relatedFactorKeys: ['progress_velocity'],
      policy: 'readiness_primary_cause_graph',
    }))
    expect(explainPackage).toEqual(expect.objectContaining({
      version: 'duration_context_explain_v1',
      runtimeCache: { touched: false },
      inputCoverage,
      causalDedupe: dedupe,
    }))
    expect(explainPackage.primaryDrivers).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'external_readiness' }),
      expect.objectContaining({ key: 'weather_forecast_impact' }),
    ]))
    expect(explainPackage.suppressedSignals).toEqual([
      expect.objectContaining({
        key: 'progress_velocity',
        suppressedByFactorKey: 'external_readiness',
        contributionMode: 'interference_secondary',
      }),
    ])
  })
})
