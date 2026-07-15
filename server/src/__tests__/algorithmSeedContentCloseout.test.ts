import { describe, expect, it } from 'vitest'
import { ALGORITHM_SEED_REGISTRY } from '../services/algorithmSeedRegistry.js'

function recordsOf(seedType: string) {
  const entry = ALGORITHM_SEED_REGISTRY.find((item) => item.seedType === seedType)
  expect(entry).toBeTruthy()
  return entry!.records
}

describe('algorithm seed content closeout contracts', () => {
  it('keeps risk/issue/warning seed records bound to impact signal summaries', () => {
    const records = recordsOf('risk_issue_warning_rule')

    expect(records.length).toBeGreaterThan(0)
    for (const record of records) {
      expect(record.signalConsumptionPolicy).toEqual(expect.objectContaining({
        inputContract: 'impactSignalSummary_only',
        duplicateCountPolicy: 'dedupe_by_impactMode_impactOwnership_sourceEntityId',
        confirmedDelaySignalStatuses: expect.arrayContaining(['confirmed_delay']),
        uncertainRiskSignalStatuses: expect.arrayContaining(['uncertain_risk']),
      }))
      expect(record.signalConsumptionPolicy.forbiddenDirectBusinessTables).toEqual(expect.arrayContaining([
        'task_conditions',
        'task_obstacles',
        'acceptance_plans',
        'tasks',
      ]))
      expect(record.warningAuthorityPolicy).toBe('threshold_and_lifecycle_policy_only_no_fact_inference')
    }
  })

  it('marks standard internal flow records as gate signals instead of duration authority', () => {
    const records = recordsOf('standard_internal_flow')
    const gateRecords = records.filter((record) => record.relationKind === 'acceptance_gate')

    expect(gateRecords.length).toBeGreaterThan(0)
    for (const record of gateRecords) {
      expect(record.impactSignalContract).toEqual(expect.objectContaining({
        emitsImpactSignal: true,
        signalKind: 'acceptance_gate',
        impactMode: 'blocking_start',
        impactOwnership: 'standard_internal_flow',
        sourceEntityIdPolicy: 'seedRuleId',
        duplicateCountPolicy: 'dedupe_by_impactMode_impactOwnership_sourceEntityId',
      }))
      expect(record.durationAuthorityPolicy).toBe('no_direct_duration_day_authority')
      expect(record.defaultDaysP50).toBeNull()
    }
  })

  it('keeps standard duration seed authority separate from gate and warning policy', () => {
    const records = recordsOf('standard_work_duration')

    const durationBearing = records.filter((record) => record.durationContributionMode === 'duration_bearing')
    const nonBearing = records.filter((record) => record.durationContributionMode !== 'duration_bearing')

    expect(durationBearing.length).toBeGreaterThan(0)
    expect(nonBearing.length).toBeGreaterThan(0)
    expect(durationBearing.every((record) => record.baseDaysEligible === true)).toBe(true)
    expect(nonBearing.every((record) => record.baseDaysEligible === false)).toBe(true)

    for (const record of records) {
      expect(record.durationAuthorityPolicy).toBe('baseline_duration_context_only')
      expect(record.warningAuthorityPolicy).toBe('no_warning_generation_authority')
      expect(record.gateAuthorityPolicy).toBe('no_gate_signal_authority')
    }
  })

  it('keeps process and cross-item workflow seeds from double-counting delay impact', () => {
    const processRecords = recordsOf('process_constraint')
    const workflowRecords = recordsOf('cross_item_workflow')

    expect(processRecords.length).toBeGreaterThan(0)
    expect(workflowRecords.length).toBeGreaterThan(0)

    for (const record of processRecords) {
      expect(record.impactSignalContract).toEqual(expect.objectContaining({
        impactOwnership: 'process_constraint',
        sourceEntityIdPolicy: 'seedRuleId',
        duplicateCountPolicy: 'dedupe_by_impactMode_impactOwnership_sourceEntityId',
      }))
      expect(record.durationAuthorityPolicy).toBe('no_duration_values_in_process_constraint')
    }

    for (const record of workflowRecords) {
      expect(record.impactSignalContract).toEqual(expect.objectContaining({
        impactOwnership: 'cross_item_workflow',
        sourceEntityIdPolicy: 'seedRuleId',
        duplicateCountPolicy: 'dedupe_by_impactMode_impactOwnership_sourceEntityId',
      }))
      expect(record.durationAuthorityPolicy).toBe('no_direct_duration_day_authority')
    }
  })
})
