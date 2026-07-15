import {
  BUSINESS_TYPE_RECOMMENDATIONS,
  type BusinessTypeCode,
} from './projectTypeRecommendations.js'
import type { WbsTemplateType } from './wbsTemplatePresets.js'

export type T2RhythmCompatibilityBusinessTypeCode = 'residential' | 'commercial'

export type BusinessTypeRegistryEntry = {
  code: BusinessTypeCode
  label: string
  legacyWbsTemplateTypes: WbsTemplateType[]
  t2RhythmBusinessTypeCodes: Array<BusinessTypeCode | T2RhythmCompatibilityBusinessTypeCode>
}

export type BusinessTypeRegistryAudit = {
  status: 'ready' | 'blocked'
  formalBusinessTypeCount: number
  recommendationBusinessTypeCount: number
  legacyWbsTemplateTypeCount: number
  missingRecommendationCodes: string[]
  unregisteredRecommendationCodes: string[]
  unmappedLegacyWbsTemplateTypes: string[]
  compatibilityBusinessTypeCodes: T2RhythmCompatibilityBusinessTypeCode[]
}

export const FORMAL_BUSINESS_TYPE_CODES = [
  'general_civil',
  'hotel',
  'hospital',
  'school',
  'industrial',
  'data_center',
  'transportation_hub',
  'sports_culture',
  'tod_upper_cover',
  'renovation',
  'modular_building',
] as const satisfies readonly BusinessTypeCode[]

export const T2_RHYTHM_COMPATIBILITY_BUSINESS_TYPE_CODES = [
  'residential',
  'commercial',
] as const satisfies readonly T2RhythmCompatibilityBusinessTypeCode[]

const LEGACY_WBS_TEMPLATE_TYPES = [
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
] as const satisfies readonly WbsTemplateType[]

const BUSINESS_TYPE_REGISTRY: readonly Omit<BusinessTypeRegistryEntry, 'label'>[] = [
  {
    code: 'general_civil',
    legacyWbsTemplateTypes: ['住宅', '商业', '公共建筑'],
    t2RhythmBusinessTypeCodes: ['general_civil', 'residential', 'commercial'],
  },
  {
    code: 'hotel',
    legacyWbsTemplateTypes: ['酒店'],
    t2RhythmBusinessTypeCodes: ['hotel'],
  },
  {
    code: 'hospital',
    legacyWbsTemplateTypes: ['医院'],
    t2RhythmBusinessTypeCodes: ['hospital'],
  },
  {
    code: 'school',
    legacyWbsTemplateTypes: ['学校'],
    t2RhythmBusinessTypeCodes: ['school'],
  },
  {
    code: 'industrial',
    legacyWbsTemplateTypes: ['工业'],
    t2RhythmBusinessTypeCodes: ['industrial'],
  },
  {
    code: 'data_center',
    legacyWbsTemplateTypes: ['数据中心'],
    t2RhythmBusinessTypeCodes: ['data_center'],
  },
  {
    code: 'transportation_hub',
    legacyWbsTemplateTypes: ['交通枢纽'],
    t2RhythmBusinessTypeCodes: ['transportation_hub'],
  },
  {
    code: 'sports_culture',
    legacyWbsTemplateTypes: ['体育文化建筑'],
    t2RhythmBusinessTypeCodes: ['sports_culture'],
  },
  {
    code: 'tod_upper_cover',
    legacyWbsTemplateTypes: ['TOD上盖'],
    t2RhythmBusinessTypeCodes: ['tod_upper_cover'],
  },
  {
    code: 'renovation',
    legacyWbsTemplateTypes: ['改造修缮'],
    t2RhythmBusinessTypeCodes: ['renovation'],
  },
  {
    code: 'modular_building',
    legacyWbsTemplateTypes: ['模块化建筑'],
    t2RhythmBusinessTypeCodes: ['modular_building'],
  },
]

function normalizeKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
}

function cloneEntry(entry: Omit<BusinessTypeRegistryEntry, 'label'>): BusinessTypeRegistryEntry {
  return {
    code: entry.code,
    label: BUSINESS_TYPE_RECOMMENDATIONS[entry.code].label,
    legacyWbsTemplateTypes: [...entry.legacyWbsTemplateTypes],
    t2RhythmBusinessTypeCodes: [...entry.t2RhythmBusinessTypeCodes],
  }
}

export function listBusinessTypeRegistry(): BusinessTypeRegistryEntry[] {
  return BUSINESS_TYPE_REGISTRY.map(cloneEntry)
}

export function isFormalBusinessTypeCode(value: unknown): value is BusinessTypeCode {
  const normalized = normalizeKey(value)
  return FORMAL_BUSINESS_TYPE_CODES.some((code) => code === normalized)
}

export function isT2RhythmCompatibilityBusinessTypeCode(value: unknown): value is T2RhythmCompatibilityBusinessTypeCode {
  const normalized = normalizeKey(value)
  return T2_RHYTHM_COMPATIBILITY_BUSINESS_TYPE_CODES.some((code) => code === normalized)
}

export function normalizeBusinessTypeCode(value: unknown): BusinessTypeCode | null {
  const normalized = normalizeKey(value)
  if (isFormalBusinessTypeCode(normalized)) return normalized

  const fromLegacyType = mapWbsTemplateTypeToBusinessTypes(String(value ?? '').trim())
  return fromLegacyType.length === 1 ? fromLegacyType[0] : null
}

export function getBusinessTypeRegistryEntry(value: unknown): BusinessTypeRegistryEntry | null {
  const code = normalizeBusinessTypeCode(value)
  if (!code) return null
  const entry = BUSINESS_TYPE_REGISTRY.find((item) => item.code === code)
  return entry ? cloneEntry(entry) : null
}

export function mapWbsTemplateTypeToBusinessTypes(value: unknown): BusinessTypeCode[] {
  const templateType = String(value ?? '').trim()
  return BUSINESS_TYPE_REGISTRY
    .filter((entry) => entry.legacyWbsTemplateTypes.includes(templateType as WbsTemplateType))
    .map((entry) => entry.code)
}

export function mapT2RhythmBusinessTypeCodeToFormalBusinessTypes(value: unknown): BusinessTypeCode[] {
  const normalized = normalizeKey(value)
  return BUSINESS_TYPE_REGISTRY
    .filter((entry) => entry.t2RhythmBusinessTypeCodes.some((code) => code === normalized))
    .map((entry) => entry.code)
}

export function getT2RhythmBusinessTypeCodesForFormalBusinessType(value: unknown) {
  const entry = getBusinessTypeRegistryEntry(value)
  return entry ? [...entry.t2RhythmBusinessTypeCodes] : []
}

export function auditBusinessTypeRegistry(): BusinessTypeRegistryAudit {
  const formalCodes = new Set(FORMAL_BUSINESS_TYPE_CODES)
  const recommendationCodes = Object.keys(BUSINESS_TYPE_RECOMMENDATIONS)
  const registryCodes = new Set(BUSINESS_TYPE_REGISTRY.map((entry) => entry.code))

  const missingRecommendationCodes = FORMAL_BUSINESS_TYPE_CODES
    .filter((code) => !recommendationCodes.includes(code))
  const unregisteredRecommendationCodes = recommendationCodes
    .filter((code) => !formalCodes.has(code as BusinessTypeCode) || !registryCodes.has(code as BusinessTypeCode))
  const unmappedLegacyWbsTemplateTypes = LEGACY_WBS_TEMPLATE_TYPES
    .filter((templateType) => mapWbsTemplateTypeToBusinessTypes(templateType).length === 0)

  const status = missingRecommendationCodes.length === 0
    && unregisteredRecommendationCodes.length === 0
    && unmappedLegacyWbsTemplateTypes.length === 0
    ? 'ready'
    : 'blocked'

  return {
    status,
    formalBusinessTypeCount: FORMAL_BUSINESS_TYPE_CODES.length,
    recommendationBusinessTypeCount: recommendationCodes.length,
    legacyWbsTemplateTypeCount: LEGACY_WBS_TEMPLATE_TYPES.length,
    missingRecommendationCodes,
    unregisteredRecommendationCodes,
    unmappedLegacyWbsTemplateTypes: [...unmappedLegacyWbsTemplateTypes],
    compatibilityBusinessTypeCodes: [...T2_RHYTHM_COMPATIBILITY_BUSINESS_TYPE_CODES],
  }
}
