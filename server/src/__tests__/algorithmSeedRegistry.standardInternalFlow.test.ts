import { describe, expect, it } from 'vitest'
import { STANDARD_INTERNAL_FLOW_RULE_SEED } from '../seeds/standardInternalFlowSeed.js'
import { ALGORITHM_SEED_REGISTRY, getAlgorithmSeedEntry } from '../services/algorithmSeedRegistry.js'
import { validateV1474AlgorithmSeeds } from '../services/algorithmSeedValidationService.js'

describe('standard internal-flow seed registry', () => {
  it('registers standard internal-flow rules as a governed algorithm seed asset', () => {
    const entry = getAlgorithmSeedEntry('standard_internal_flow')

    expect(entry).toBeTruthy()
    expect(entry?.records).toHaveLength(STANDARD_INTERNAL_FLOW_RULE_SEED.length)
    expect(entry?.meta).toEqual(expect.objectContaining({
      seedVersion: expect.stringContaining('v1.4.7.5'),
      seedScope: 'building_construction_standard_internal_flow',
      generationPolicy: expect.stringContaining('rule_seed_only'),
      webVerified: false,
      reviewNeeded: false,
    }))
    expect(ALGORITHM_SEED_REGISTRY.map((item) => item.seedType)).toContain('standard_internal_flow')

    const acceptanceGateRule = entry?.records.find((record) => record.relationKind === 'acceptance_gate')
    expect(acceptanceGateRule).toEqual(expect.objectContaining({
      seedRuleId: expect.any(String),
      sourceStandard: 'standard_internal_flow_seed',
      sourceVersion: 'v1.4.7.5-standard-internal-flow',
      sourceClauseRef: expect.stringContaining('standard_internal_flow.'),
      evidenceSourceKeys: expect.arrayContaining(['GB50300']),
      webVerified: false,
      reviewNeeded: false,
    }))
    expect(acceptanceGateRule?.standardWorkCodes.length).toBeGreaterThan(0)
    expect(entry?.records.every((record) => record.standardWorkCodes.length > 0)).toBe(true)

    const stableCodeAcceptanceGateRule = entry?.records.find((record) => (
      record.relationKind === 'acceptance_gate'
      && record.predecessorStableCode
      && record.successorStableCode
    ))
    expect(stableCodeAcceptanceGateRule?.standardWorkCodes).toEqual(expect.arrayContaining([
      stableCodeAcceptanceGateRule?.predecessorStableCode,
      stableCodeAcceptanceGateRule?.successorStableCode,
    ]))

    const validation = validateV1474AlgorithmSeeds({ strict: true, seedType: 'standard_internal_flow' })
    expect(validation.ok).toBe(true)
    expect(validation.entries).toEqual([
      expect.objectContaining({
        seedType: 'standard_internal_flow',
        expectedCount: STANDARD_INTERNAL_FLOW_RULE_SEED.length,
        actualCount: STANDARD_INTERNAL_FLOW_RULE_SEED.length,
        missingV1475FieldCount: 0,
      }),
    ])
  })
})
