import { describe, expect, it } from 'vitest'

import {
  CANONICAL_STRUCTURED_CAUSE_CODES,
  LEGACY_PROGRESS_FACTOR_TRANSLATION_ENTRIES,
  translateLegacyProgressFactor,
} from '../domain/structuredCauseTaxonomy.js'
import {
  buildProgressDeviationCauseRuleIndex,
  PROGRESS_DEVIATION_CAUSE_RULES,
  type ProgressDeviationCauseRule,
} from '../seeds/progressDeviationCauseRegistry.js'

const EXPECTED_LEGACY_FACTOR_CAUSES = {
  resource_conflict: 'site_capacity_pressure',
  progress_velocity: 'site_capacity_pressure',
  workflow_sequence: 'workflow_sequence',
  seasonal_productivity: 'weather_impact',
  process_seasonal_sensitivity: 'weather_impact',
  weather_forecast_impact: 'weather_impact',
  productivity_compensation: 'weather_impact',
  process_constraint: 'workflow_sequence',
  external_readiness: 'external_readiness',
} as const

describe('structuredCauseTaxonomy authority', () => {
  it('owns the exact legacy factor translations at taxonomy v1.0.0', () => {
    const translations = Object.fromEntries(
      Object.keys(EXPECTED_LEGACY_FACTOR_CAUSES).map((factorKey) => [
        factorKey,
        translateLegacyProgressFactor(factorKey),
      ]),
    )

    expect(translations).toEqual(Object.fromEntries(
      Object.entries(EXPECTED_LEGACY_FACTOR_CAUSES).map(([factorKey, causeCode]) => [
        factorKey,
        { factorKey, causeCode, taxonomyVersion: 'v1.0.0' },
      ]),
    ))
  })

  it('keeps every registry rule and factor identical to the domain translator', () => {
    const registryFactors = PROGRESS_DEVIATION_CAUSE_RULES.flatMap((rule) => rule.factorKeys).sort()
    expect(registryFactors).toEqual(Object.keys(EXPECTED_LEGACY_FACTOR_CAUSES).sort())

    for (const rule of PROGRESS_DEVIATION_CAUSE_RULES) {
      for (const factorKey of rule.factorKeys) {
        expect(translateLegacyProgressFactor(factorKey)).toEqual({
          factorKey,
          causeCode: rule.canonicalCauseCode,
          taxonomyVersion: rule.taxonomyVersion,
        })
      }
    }
  })

  it('keeps translator and legacy registry factor keys exactly bidirectional', () => {
    const registryFactors = PROGRESS_DEVIATION_CAUSE_RULES.flatMap((rule) => rule.factorKeys).sort()
    const translationFactors = LEGACY_PROGRESS_FACTOR_TRANSLATION_ENTRIES.map((entry) => entry.factorKey).sort()

    expect(translationFactors).toEqual(registryFactors)
    expect(LEGACY_PROGRESS_FACTOR_TRANSLATION_ENTRIES.every((entry) => (
      CANONICAL_STRUCTURED_CAUSE_CODES.includes(entry.causeCode)
    ))).toBe(true)
  })

  it('fails closed for an unknown legacy factor', () => {
    expect(translateLegacyProgressFactor('unregistered_factor')).toBeNull()
  })

  it('owns the exact fourteen canonical codes', () => {
    expect(CANONICAL_STRUCTURED_CAUSE_CODES).toEqual([
      'predecessor_delay', 'material_shortage', 'labor_shortage',
      'equipment_unavailable', 'design_change', 'drawing_delay',
      'quality_rework', 'weather_impact', 'owner_decision',
      'government_inspection', 'site_capacity_pressure',
      'workflow_sequence', 'external_readiness', 'other',
    ])
  })

  it('rejects a duplicate legacy factor with a stable error', () => {
    const firstRule = PROGRESS_DEVIATION_CAUSE_RULES[0]
    const duplicateFactor = firstRule.factorKeys[0]
    expect(() => buildProgressDeviationCauseRuleIndex([
      firstRule,
      { ...firstRule, factorKeys: [duplicateFactor] },
    ])).toThrow(`progress_deviation_cause_duplicate_factor:${duplicateFactor}`)
  })

  it('rejects canonical code or taxonomy version drift from the domain translator', () => {
    const firstRule = PROGRESS_DEVIATION_CAUSE_RULES[0]
    const factorKey = firstRule.factorKeys[0]
    expect(() => buildProgressDeviationCauseRuleIndex([{
      ...firstRule,
      canonicalCauseCode: 'other',
      factorKeys: [factorKey],
    }])).toThrow(`progress_deviation_cause_translation_mismatch:${factorKey}`)
    expect(() => buildProgressDeviationCauseRuleIndex([{
      ...firstRule,
      taxonomyVersion: 'v0.0.0',
      factorKeys: [factorKey],
    } as unknown as ProgressDeviationCauseRule])).toThrow(`progress_deviation_cause_translation_mismatch:${factorKey}`)
  })
})
