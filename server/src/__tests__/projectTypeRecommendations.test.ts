import { describe, expect, it } from 'vitest'

import * as projectTypeRecommendations from '../services/projectTypeRecommendations.js'

describe('project type recommendation subtype contract', () => {
  it('normalizes every subtype exposed by the product recommendation registry', () => {
    const normalizeBusinessSubtypeCode = (
      projectTypeRecommendations as typeof projectTypeRecommendations & {
        normalizeBusinessSubtypeCode?: (value: unknown) => string | null
      }
    ).normalizeBusinessSubtypeCode
    const subtypeCodes = Object.values(projectTypeRecommendations.BUSINESS_TYPE_RECOMMENDATIONS)
      .flatMap((recommendation) => recommendation.subtypes ?? [])
      .map((subtype) => subtype.code)

    expect(normalizeBusinessSubtypeCode).toBeTypeOf('function')
    expect(subtypeCodes).toHaveLength(18)
    expect(subtypeCodes.map((code) => normalizeBusinessSubtypeCode?.(code))).toEqual(subtypeCodes)
  })

  it('checks subtype ownership instead of accepting a subtype from another business type', () => {
    const isBusinessSubtypeForType = (
      projectTypeRecommendations as typeof projectTypeRecommendations & {
        isBusinessSubtypeForType?: (businessType: unknown, businessSubtype: unknown) => boolean
      }
    ).isBusinessSubtypeForType

    expect(isBusinessSubtypeForType).toBeTypeOf('function')
    expect(isBusinessSubtypeForType?.('sports_culture', 'sports_theater')).toBe(true)
    expect(isBusinessSubtypeForType?.('transportation_hub', 'sports_theater')).toBe(false)
  })

  it('expands subtype project types to the parent and domain aliases used by existing WBS assets', () => {
    const resolveProjectTypeCompatibilityCodes = (
      projectTypeRecommendations as typeof projectTypeRecommendations & {
        resolveProjectTypeCompatibilityCodes?: (input: {
          businessType?: unknown
          businessSubtype?: unknown
          projectTypeCode?: unknown
        }) => string[]
      }
    ).resolveProjectTypeCompatibilityCodes

    expect(resolveProjectTypeCompatibilityCodes).toBeTypeOf('function')
    expect(resolveProjectTypeCompatibilityCodes?.({
      businessType: 'general_civil',
      businessSubtype: 'civil_office_commercial',
      projectTypeCode: 'civil_office_commercial',
    })).toEqual(expect.arrayContaining(['civil_office_commercial', 'general_civil', 'commercial', 'office']))
    expect(resolveProjectTypeCompatibilityCodes?.({
      businessType: 'renovation',
      businessSubtype: 'renovation_energy',
      projectTypeCode: 'renovation_energy',
    })).toEqual(expect.arrayContaining(['renovation_energy', 'renovation', 'energy_retrofit']))
    expect(resolveProjectTypeCompatibilityCodes?.({
      businessType: 'renovation',
      businessSubtype: 'renovation_heritage',
      projectTypeCode: 'renovation_heritage',
    })).toEqual(expect.arrayContaining(['renovation_heritage', 'renovation', 'heritage', 'historic_preservation']))
  })
})
