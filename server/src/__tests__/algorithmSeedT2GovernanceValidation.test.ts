import { describe, expect, it } from 'vitest'

import { ALGORITHM_SEED_REGISTRY } from '../services/algorithmSeedRegistry.js'
import { validateV1474AlgorithmSeeds } from '../services/algorithmSeedValidationService.js'

describe('T2 division rhythm algorithm seed governance', () => {
  it('accepts the curated candidate-only T2 seed under its domain governance contract', () => {
    const validation = validateV1474AlgorithmSeeds({
      strict: true,
      seedType: 't2_division_rhythm_template',
    })

    expect(validation.ok).toBe(true)
    expect(validation.issues).toEqual([])
    expect(validation.entries).toEqual([
      expect.objectContaining({
        seedType: 't2_division_rhythm_template',
        expectedCount: 196,
        actualCount: 196,
        webVerifiedFalseCount: 0,
        reviewNeededCount: 0,
        missingEvidenceCount: 0,
        missingSourceCount: 0,
      }),
    ])
  })

  it('rejects a T2 seed record that grants direct runtime write authority', () => {
    const entry = ALGORITHM_SEED_REGISTRY.find((item) => item.seedType === 't2_division_rhythm_template')
    expect(entry).toBeTruthy()
    const original = entry!.records[0]
    entry!.records[0] = {
      ...original,
      governance: {
        ...(original.governance as Record<string, unknown>),
        directRuntimeWrite: true,
      },
    }

    try {
      const validation = validateV1474AlgorithmSeeds({
        strict: true,
        seedType: 't2_division_rhythm_template',
      })

      expect(validation.ok).toBe(false)
      expect(validation.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'T2_RHYTHM_TEMPLATE_RUNTIME_BOUNDARY_INVALID',
          stableCode: expect.any(String),
        }),
      ]))
    } finally {
      entry!.records[0] = original
    }
  })
})
