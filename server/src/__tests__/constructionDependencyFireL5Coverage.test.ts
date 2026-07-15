import { describe, expect, it } from 'vitest'
import { collectConstructionDependencyRuleSystemReport } from '../services/constructionDependencyRuleSystemService.js'

const TARGET_FIRE_L5_RULES = [
  {
    ruleCode: 'fire_pump_pressure_test_to_fire_water_linkage_logic_retest_project_fact_gate',
    stablePair: 'FIR-07-01-01-P07->FIR-03-02-01-P03',
  },
  {
    ruleCode: 'smoke_control_airflow_tightness_to_smoke_linkage_logic_retest_project_fact_gate',
    stablePair: 'FIR-02-01-01-P05->FIR-03-02-01-P02',
  },
  {
    ruleCode: 'fire_shutter_descent_to_shutter_access_elevator_linkage_retest_project_fact_gate',
    stablePair: 'FIR-04-01-01-P08->FIR-03-02-01-P04',
  },
  {
    ruleCode: 'gas_suppression_simulated_discharge_to_fire_zone_scenario_linkage_retest_project_fact_gate',
    stablePair: 'FIR-04-02-01-P08->FIR-03-02-01-P05',
  },
  {
    ruleCode: 'public_area_terminal_commissioning_to_fire_zone_scenario_linkage_retest_project_fact_gate',
    stablePair: 'DEC-05-01-01-P08->FIR-03-02-01-P05',
  },
  {
    ruleCode: 'fire_sprinkler_concealed_acceptance_to_public_area_terminal_commissioning_project_fact_gate',
    stablePair: 'FIR-01-01-01-P08->DEC-05-01-01-P08',
  },
] as const

describe('construction dependency fire L5 process constraint coverage', () => {
  it('keeps narrow fire and smoke-control L5 fact gates on existing L3 edges only', () => {
    const report = collectConstructionDependencyRuleSystemReport(20)
    const coverage = report.runtimeMetrics.process_constraint.coverage

    for (const target of TARGET_FIRE_L5_RULES) {
      expect(coverage.byMatchedRuleCode[target.ruleCode] ?? 0, `${target.ruleCode} should match one existing edge`)
        .toBe(1)

      const targetPairs = report.processConstraintCoverage.topCrossScopeMatchedPairs.filter((pair) => (
        pair.matchedRuleCodes.includes(target.ruleCode)
      ))
      expect(targetPairs).toHaveLength(1)
      expect(targetPairs[0].exampleStableCodes).toEqual(expect.arrayContaining([target.stablePair]))
      expect(targetPairs[0].relationKinds).toEqual({ explicit_task_dependency: 1 })
      expect(targetPairs[0].catalogGroups).toEqual({ specialty: 1 })
      expect(targetPairs[0].matchQualities).toEqual({ structured_code: 1 })
      expect(targetPairs[0].exampleStableCodes.join(' '))
        .not.toMatch(/MUN|OUT|road|bridge|tunnel|railway|airport|port|acceptance|filing|occupancy/i)
    }

    expect(coverage.keywordFallbackMatchedEdgeCount).toBe(0)
    expect(coverage.structuredCodeMatchedEdgeCount).toBe(coverage.processConstraintMatchedEdgeCount)
    expect(report.dependencySystemCloseout.runtimeBoundaries.processConstraintCreatesDependency).toBe(false)
    expect(report.dependencySystemCloseout.runtimeBoundaries.processConstraintStoresDayValues).toBe(false)
    expect(report.dependencySystemCloseout.runtimeBoundaries.processConstraintRequiresExistingRelation).toBe(true)
  })
})
