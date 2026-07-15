import { describe, expect, it } from 'vitest'

import { buildTemplateRecommendation } from '../services/projectFactsToTemplateService.js'
import { getFeatureEntry } from '../services/projectFeatureToItemPackMap.js'

describe('projectFeatureToItemPackMap foundation surface', () => {
  it('keeps wizard foundation feature codes canonical and mapped to foundation packs', () => {
    expect(getFeatureEntry('basementLevelCount')).toEqual(expect.objectContaining({
      hasNumericValue: true,
      triggers: expect.arrayContaining(['china-foundation-pit-pile', 'china-waterproof-insulation']),
    }))
    expect(getFeatureEntry('basementAreaM2')).toEqual(expect.objectContaining({
      hasNumericValue: true,
      triggers: expect.arrayContaining(['china-foundation-pit-pile', 'china-waterproof-insulation']),
    }))
    expect(getFeatureEntry('pile_foundation')).toEqual(expect.objectContaining({
      hasNumericValue: false,
      triggers: expect.arrayContaining(['china-foundation-pit-pile', 'FND-01-01-01']),
    }))
    expect(getFeatureEntry('foundation_dewatering')).toEqual(expect.objectContaining({
      hasNumericValue: false,
      triggers: expect.arrayContaining(['FND-05-01-01']),
    }))
    expect(getFeatureEntry('foundation_monitoring')).toEqual(expect.objectContaining({
      hasNumericValue: false,
      triggers: expect.arrayContaining(['FND-06-01-02']),
    }))
  })

  it('uses flat wizard foundation features to trigger foundation recommendation packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {
        basementLevelCount: 2,
        basementAreaM2: 8000,
        pile_foundation: true,
        foundation_dewatering: true,
        foundation_monitoring: true,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-foundation-pit-pile',
      'china-waterproof-insulation',
      'FND-01-01-01',
      'FND-05-01-01',
      'FND-06-01-02',
    ]))
    expect(recommendation.triggeredMilestones).toEqual(expect.arrayContaining([
      'pile_foundation_acceptance',
      'monitoring_commissioning',
    ]))
  })
})
