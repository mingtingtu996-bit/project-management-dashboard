import { describe, expect, it } from 'vitest'

import {
  FORMAL_BUSINESS_TYPE_CODES,
  auditBusinessTypeRegistry,
  getBusinessTypeRegistryEntry,
  isFormalBusinessTypeCode,
  isT2RhythmCompatibilityBusinessTypeCode,
  mapT2RhythmBusinessTypeCodeToFormalBusinessTypes,
  mapWbsTemplateTypeToBusinessTypes,
  normalizeBusinessTypeCode,
} from '../services/businessTypeRegistryService.js'
import { BUSINESS_TYPE_RECOMMENDATIONS } from '../services/projectTypeRecommendations.js'
import type { WbsTemplateType } from '../services/wbsTemplatePresets.js'

const WBS_TEMPLATE_TYPES: WbsTemplateType[] = [
  '住宅',
  '商业',
  '工业',
  '公共建筑',
  '酒店',
  '医院',
  '学校',
  '数据中心',
  '交通枢纽',
  '体育文化建筑',
  'TOD上盖',
  '改造修缮',
  '模块化建筑',
]

describe('businessTypeRegistryService', () => {
  it('keeps the formal business-type registry aligned with project recommendations', () => {
    const audit = auditBusinessTypeRegistry()

    expect(FORMAL_BUSINESS_TYPE_CODES).toEqual(Object.keys(BUSINESS_TYPE_RECOMMENDATIONS))
    expect(audit.formalBusinessTypeCount).toBe(11)
    expect(audit.missingRecommendationCodes).toEqual([])
    expect(audit.unregisteredRecommendationCodes).toEqual([])
    expect(audit.status).toBe('ready')
  })

  it('maps every legacy Chinese WBS template type to explicit formal business type codes', () => {
    const audit = auditBusinessTypeRegistry()

    expect(audit.legacyWbsTemplateTypeCount).toBe(WBS_TEMPLATE_TYPES.length)
    expect(audit.unmappedLegacyWbsTemplateTypes).toEqual([])
    expect(mapWbsTemplateTypeToBusinessTypes('住宅')).toEqual(['general_civil'])
    expect(mapWbsTemplateTypeToBusinessTypes('商业')).toEqual(['general_civil'])
    expect(mapWbsTemplateTypeToBusinessTypes('公共建筑')).toEqual(['general_civil'])
    expect(mapWbsTemplateTypeToBusinessTypes('医院')).toEqual(['hospital'])
    expect(mapWbsTemplateTypeToBusinessTypes('数据中心')).toEqual(['data_center'])
  })

  it('rejects unknown business types instead of silently falling back to a default', () => {
    expect(normalizeBusinessTypeCode('hospital')).toBe('hospital')
    expect(normalizeBusinessTypeCode(' 医院 ')).toBe('hospital')
    expect(normalizeBusinessTypeCode('civil')).toBeNull()
    expect(normalizeBusinessTypeCode('custom')).toBeNull()
    expect(getBusinessTypeRegistryEntry('custom')).toBeNull()
    expect(isFormalBusinessTypeCode('custom')).toBe(false)
  })

  it('keeps T2 rhythm compatibility codes separate from formal business types', () => {
    expect(isFormalBusinessTypeCode('residential')).toBe(false)
    expect(isFormalBusinessTypeCode('commercial')).toBe(false)
    expect(isT2RhythmCompatibilityBusinessTypeCode('residential')).toBe(true)
    expect(isT2RhythmCompatibilityBusinessTypeCode('commercial')).toBe(true)
    expect(normalizeBusinessTypeCode('residential')).toBeNull()
    expect(mapT2RhythmBusinessTypeCodeToFormalBusinessTypes('residential')).toEqual(['general_civil'])
    expect(mapT2RhythmBusinessTypeCodeToFormalBusinessTypes('commercial')).toEqual(['general_civil'])
    expect(mapT2RhythmBusinessTypeCodeToFormalBusinessTypes('general_civil')).toEqual(['general_civil'])
    expect(mapT2RhythmBusinessTypeCodeToFormalBusinessTypes('custom')).toEqual([])

    const generalCivil = getBusinessTypeRegistryEntry('general_civil')
    expect(generalCivil).toEqual(expect.objectContaining({
      code: 'general_civil',
      t2RhythmBusinessTypeCodes: ['general_civil', 'residential', 'commercial'],
      legacyWbsTemplateTypes: expect.arrayContaining(['住宅', '商业', '公共建筑']),
    }))
  })
})
