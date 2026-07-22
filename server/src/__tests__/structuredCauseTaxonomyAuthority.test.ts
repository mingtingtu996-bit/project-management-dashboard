import { describe, expect, it } from 'vitest'

import {
  CANONICAL_STRUCTURED_CAUSE_CODES,
  translateLegacyProgressFactor,
} from '../domain/structuredCauseTaxonomy.js'
import { PROGRESS_DEVIATION_CAUSE_RULES } from '../seeds/progressDeviationCauseRegistry.js'

describe('structuredCauseTaxonomy authority', () => {
  it('maps every legacy factor to one canonical cause', () => {
    const factors = PROGRESS_DEVIATION_CAUSE_RULES.flatMap((rule) => rule.factorKeys)
    expect(new Set(factors).size).toBe(factors.length)
    expect(factors.every((factorKey) => translateLegacyProgressFactor(factorKey) != null)).toBe(true)
  })

  it('fails closed for an unknown legacy factor', () => {
    expect(translateLegacyProgressFactor('unregistered_factor')).toBeNull()
  })

  it('owns exactly fourteen canonical codes', () => {
    expect(CANONICAL_STRUCTURED_CAUSE_CODES).toHaveLength(14)
    expect(new Set(CANONICAL_STRUCTURED_CAUSE_CODES).size).toBe(14)
  })
})
