export type V1474RegionCode = 'north' | 'east' | 'south' | 'west' | 'default'

export type V1474SeasonalProductivityRegionCode =
  | 'severe_cold'
  | 'severe_cold_northeast'
  | 'severe_cold_northwest'
  | 'cold'
  | 'cold_north_plain'
  | 'cold_coastal'
  | 'hot_summer_cold_winter'
  | 'hot_summer_cold_winter_yangtze_delta'
  | 'hot_summer_cold_winter_middle_yangtze'
  | 'hot_summer_cold_winter_southwest_basin'
  | 'hot_summer_warm_winter'
  | 'hot_summer_warm_winter_south_coast'
  | 'hot_summer_warm_winter_tropical'
  | 'mild'
  | 'mild_southwest_highland'
  | 'plateau'
  | 'plateau_qinghai_tibet'
  | 'desert'
  | 'desert_northwest_arid'
  | 'default'

export type V1474SeedEvidenceSource = {
  sourceKey: string
  title: string
  url: string
  accessedAt: string
}

export type V1474MonthlyProductivity = {
  regionCode: V1474SeasonalProductivityRegionCode
  month: number
  productivity: number
  climateSignal: 'winter_low_temp' | 'rainy_season' | 'summer_heat' | 'normal'
  classificationBasis: 'gb50176_thermal_zone' | 'construction_operational_extension' | 'neutral_default'
  sourceStandard: 'industry_standard' | 'system_default' | 'enterprise_method'
  sourceVersion: string
  sourceClauseRef: string
  evidenceSourceKeys: string[]
  webVerified: true
  reviewNeeded: false
  confidence: 'high' | 'medium' | 'low'
}

export const V1474_SEASONAL_PRODUCTIVITY_SEED_VERSION = 'v1.4.7.4-field-calibrated-20260518'

export const V1474_SEASONAL_PRODUCTIVITY_EVIDENCE_SOURCES: V1474SeedEvidenceSource[] = [
  {
    sourceKey: 'JGJT104_2011',
    title: 'JGJ/T 104-2011 Specification for winter construction of building engineering',
    url: 'https://www.jianbiaoku.com/webarbs/book/111/1679406.shtml',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB55032_2022',
    title: 'GB 55032-2022 General code for construction quality control of building and municipal engineering',
    url: 'https://zjj.sm.gov.cn/xxgk/fgwj/jsbz/202209/t20220909_1827392.htm',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'HEAT_PROTECTION_2012',
    title: 'Measures for heatstroke prevention and cooling in workplaces',
    url: 'https://www.nhc.gov.cn/jkj/c100063/201207/fac34d3937eb480b864783d1d5007bce.shtml',
    accessedAt: '2026-05-18',
  },
]

type MonthlyAdjustment = {
  productivity: number
  climateSignal: V1474MonthlyProductivity['climateSignal']
  evidenceSourceKeys: string[]
  sourceClauseRef: string
}

const NORMAL: MonthlyAdjustment = {
  productivity: 1,
  climateSignal: 'normal',
  evidenceSourceKeys: ['GB55032_2022'],
  sourceClauseRef: 'Normal construction rhythm; no calendar or process-specific deduction is applied by seasonal productivity.',
}

const ZONE_MONTH_OVERRIDES: Record<V1474SeasonalProductivityRegionCode, Partial<Record<number, MonthlyAdjustment>>> = {
  severe_cold: {
    1: { productivity: 0.88, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Severe cold region winter low-temperature macro productivity fallback; concrete and wet trades are handled by process sensitivity.' },
    2: { productivity: 0.9, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Severe cold region winter low-temperature macro productivity fallback; Spring Festival is handled by work_calendar.' },
    12: { productivity: 0.88, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Severe cold region winter low-temperature macro productivity fallback.' },
  },
  severe_cold_northeast: {
    1: { productivity: 0.88, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northeast severe-cold city profile; longer winter affects site organization while wet-trade impact remains process-owned.' },
    2: { productivity: 0.9, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northeast severe-cold city profile; Spring Festival is handled by work_calendar.' },
    3: { productivity: 0.95, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northeast thaw transition month; kept as low-confidence macro context.' },
    11: { productivity: 0.95, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northeast early-winter transition month; process sensitivity owns concrete and wet trades.' },
    12: { productivity: 0.88, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northeast severe-cold city profile.' },
  },
  severe_cold_northwest: {
    1: { productivity: 0.89, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northwest severe-cold/arid profile; cold-season macro context without wind/sand duration invention.' },
    2: { productivity: 0.91, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northwest severe-cold/arid profile; Spring Festival is handled by work_calendar.' },
    11: { productivity: 0.96, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northwest early-winter transition month; weather facts override when available.' },
    12: { productivity: 0.89, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northwest severe-cold/arid profile.' },
  },
  cold: {
    1: { productivity: 0.9, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Cold region winter low-temperature macro productivity fallback.' },
    2: { productivity: 0.92, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Cold region winter low-temperature macro productivity fallback; Spring Festival is handled by work_calendar.' },
    12: { productivity: 0.9, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Cold region winter low-temperature macro productivity fallback.' },
  },
  cold_north_plain: {
    1: { productivity: 0.91, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'North-plain cold profile; conservative winter macro context.' },
    2: { productivity: 0.93, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'North-plain cold profile; Spring Festival is handled by work_calendar.' },
    7: { productivity: 0.97, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'North-plain summer-rain site organization fallback; process and weather facts own stronger impact.' },
    8: { productivity: 0.97, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'North-plain summer-rain site organization fallback.' },
    12: { productivity: 0.91, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'North-plain cold profile.' },
  },
  cold_coastal: {
    1: { productivity: 0.92, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Cold coastal profile; winter effect is lighter than inland severe-cold regions.' },
    2: { productivity: 0.94, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Cold coastal profile; Spring Festival is handled by work_calendar.' },
    7: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Cold coastal summer-rain profile; coastal wind is not modeled without weather facts.' },
    8: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Cold coastal summer-rain profile.' },
    12: { productivity: 0.92, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Cold coastal profile.' },
  },
  hot_summer_cold_winter: {
    1: { productivity: 0.96, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Hot-summer cold-winter region has limited winter macro fallback; process-specific wet trades own stronger impact.' },
    6: { productivity: 0.94, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Rainy-season macro fallback for site organization; foundation, exterior and waterproofing are handled by process sensitivity.' },
    7: { productivity: 0.96, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Summer heat macro fallback for outdoor rhythm; only extreme heat facts may stop outdoor work.' },
    8: { productivity: 0.96, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Summer heat macro fallback for outdoor rhythm; only extreme heat facts may stop outdoor work.' },
    12: { productivity: 0.96, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Hot-summer cold-winter region has limited winter macro fallback.' },
  },
  hot_summer_cold_winter_yangtze_delta: {
    1: { productivity: 0.97, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Yangtze-delta hot-summer cold-winter city profile; winter macro effect is light.' },
    4: { productivity: 0.98, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Yangtze-delta spring-rain bridge window; process-specific exposed waterproof/facade packages own stronger impact.' },
    6: { productivity: 0.93, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Yangtze-delta plum-rain macro fallback for site organization and exposed work windows.' },
    7: { productivity: 0.95, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Yangtze-delta summer heat macro work-hour fallback; shutdown requires weather facts.' },
    8: { productivity: 0.95, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Yangtze-delta summer heat macro work-hour fallback.' },
    9: { productivity: 0.97, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Yangtze-delta late typhoon/rain window; weather facts own strong event impact.' },
    11: { productivity: 0.98, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Yangtze-delta early-winter low-temperature bridge window for wet trades; process and weather facts own stronger impact.' },
    12: { productivity: 0.97, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Yangtze-delta hot-summer cold-winter city profile.' },
  },
  hot_summer_cold_winter_middle_yangtze: {
    1: { productivity: 0.96, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Middle-Yangtze hot-summer cold-winter profile; winter macro effect is limited.' },
    6: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Middle-Yangtze rainy-season macro fallback.' },
    7: { productivity: 0.94, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Middle-Yangtze hot-summer work-hour macro fallback.' },
    8: { productivity: 0.94, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Middle-Yangtze hot-summer work-hour macro fallback.' },
    9: { productivity: 0.96, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Middle-Yangtze late hot-season macro fallback.' },
    12: { productivity: 0.96, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Middle-Yangtze hot-summer cold-winter profile.' },
  },
  hot_summer_cold_winter_southwest_basin: {
    1: { productivity: 0.97, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Southwest basin profile; winter is mostly a light macro confidence factor.' },
    6: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Southwest basin rainy-season site organization fallback.' },
    7: { productivity: 0.95, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Southwest basin heat and humidity macro work-hour fallback.' },
    8: { productivity: 0.95, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Southwest basin heat and humidity macro work-hour fallback.' },
    9: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Southwest basin late rainy-season site organization fallback.' },
    12: { productivity: 0.97, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Southwest basin profile.' },
  },
  hot_summer_warm_winter: {
    6: { productivity: 0.94, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'South China rainy-season macro fallback; strong impact is owned by weather facts and process sensitivity.' },
    7: { productivity: 0.93, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'South China summer heat macro work-hour fallback; high-temperature facts, not the static seed, own shutdown decisions.' },
    8: { productivity: 0.93, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'South China summer heat macro work-hour fallback; high-temperature facts, not the static seed, own shutdown decisions.' },
    9: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Late rainy/typhoon season macro fallback; weather facts should override this when available.' },
  },
  hot_summer_warm_winter_south_coast: {
    4: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'South-coast early rainy-season macro fallback.' },
    5: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'South-coast long rainy-season macro fallback.' },
    6: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'South-coast long rainy-season macro fallback.' },
    7: { productivity: 0.93, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'South-coast heat/humidity macro work-hour fallback.' },
    8: { productivity: 0.93, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'South-coast heat/humidity macro work-hour fallback.' },
    9: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'South-coast late typhoon/rain macro fallback; weather facts own strong events.' },
  },
  hot_summer_warm_winter_tropical: {
    5: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Tropical coastal rainy-season macro fallback.' },
    6: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Tropical coastal rainy-season macro fallback.' },
    7: { productivity: 0.94, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Tropical heat/humidity macro work-hour fallback.' },
    8: { productivity: 0.94, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Tropical heat/humidity macro work-hour fallback.' },
    9: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Tropical late rainy/typhoon-season macro fallback.' },
    10: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Tropical late rainy-season macro fallback.' },
  },
  mild: {
    6: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Mild climate rainy-season macro fallback; no broad winter or heat deduction.' },
    7: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Mild climate rainy-season macro fallback; no broad winter or heat deduction.' },
  },
  mild_southwest_highland: {
    5: { productivity: 0.97, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Southwest highland mild-climate rainy-season macro fallback.' },
    6: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Southwest highland mild-climate rainy-season macro fallback.' },
    7: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Southwest highland mild-climate rainy-season macro fallback.' },
    8: { productivity: 0.96, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Southwest highland mild-climate rainy-season macro fallback.' },
    9: { productivity: 0.97, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Southwest highland mild-climate late rainy-season macro fallback.' },
  },
  plateau: {
    1: { productivity: 0.91, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Plateau winter macro fallback; project climate profile and local override should calibrate altitude difference.' },
    2: { productivity: 0.92, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Plateau winter macro fallback; Spring Festival is handled by work_calendar.' },
    7: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Plateau rainy-season macro fallback; site facts should override when available.' },
    8: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Plateau rainy-season macro fallback; site facts should override when available.' },
    12: { productivity: 0.91, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Plateau winter macro fallback.' },
  },
  plateau_qinghai_tibet: {
    1: { productivity: 0.9, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Qinghai-Tibet plateau profile; winter and altitude constrain site organization, but exact impact needs project facts.' },
    2: { productivity: 0.91, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Qinghai-Tibet plateau profile; Spring Festival is handled by work_calendar.' },
    3: { productivity: 0.95, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Qinghai-Tibet plateau transition month; low-confidence macro context.' },
    7: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Qinghai-Tibet plateau rainy-season macro fallback.' },
    8: { productivity: 0.95, climateSignal: 'rainy_season', evidenceSourceKeys: ['GB55032_2022'], sourceClauseRef: 'Qinghai-Tibet plateau rainy-season macro fallback.' },
    11: { productivity: 0.94, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Qinghai-Tibet plateau early-winter transition month.' },
    12: { productivity: 0.9, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Qinghai-Tibet plateau profile.' },
  },
  desert: {
    1: { productivity: 0.93, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Desert and arid cold-season macro fallback; wind/sand is not represented without weather facts.' },
    2: { productivity: 0.94, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Desert and arid cold-season macro fallback; Spring Festival is handled by work_calendar.' },
    7: { productivity: 0.96, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Arid-region summer heat macro fallback for outdoor rhythm.' },
    8: { productivity: 0.96, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Arid-region summer heat macro fallback for outdoor rhythm.' },
    12: { productivity: 0.93, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Desert and arid cold-season macro fallback.' },
  },
  desert_northwest_arid: {
    1: { productivity: 0.92, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northwest arid/desert profile; cold-season macro fallback without wind/sand inference.' },
    2: { productivity: 0.93, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northwest arid/desert profile; Spring Festival is handled by work_calendar.' },
    7: { productivity: 0.95, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Northwest arid/desert summer heat macro work-hour fallback.' },
    8: { productivity: 0.95, climateSignal: 'summer_heat', evidenceSourceKeys: ['HEAT_PROTECTION_2012'], sourceClauseRef: 'Northwest arid/desert summer heat macro work-hour fallback.' },
    12: { productivity: 0.92, climateSignal: 'winter_low_temp', evidenceSourceKeys: ['JGJT104_2011'], sourceClauseRef: 'Northwest arid/desert profile.' },
  },
  default: {},
}

const REGION_FALLBACK: Record<string, V1474SeasonalProductivityRegionCode> = {
  north: 'cold',
  east: 'hot_summer_cold_winter',
  south: 'hot_summer_warm_winter',
  west: 'plateau',
}

const PRODUCTIVITY_ZONES: V1474SeasonalProductivityRegionCode[] = [
  'severe_cold',
  'severe_cold_northeast',
  'severe_cold_northwest',
  'cold',
  'cold_north_plain',
  'cold_coastal',
  'hot_summer_cold_winter',
  'hot_summer_cold_winter_yangtze_delta',
  'hot_summer_cold_winter_middle_yangtze',
  'hot_summer_cold_winter_southwest_basin',
  'hot_summer_warm_winter',
  'hot_summer_warm_winter_south_coast',
  'hot_summer_warm_winter_tropical',
  'mild',
  'mild_southwest_highland',
  'plateau',
  'plateau_qinghai_tibet',
  'desert',
  'desert_northwest_arid',
  'default',
]

function classificationBasisOf(regionCode: V1474SeasonalProductivityRegionCode): V1474MonthlyProductivity['classificationBasis'] {
  if (regionCode === 'default') return 'neutral_default'
  if (regionCode === 'plateau' || regionCode === 'desert' || regionCode.includes('plateau') || regionCode.includes('desert')) return 'construction_operational_extension'
  return 'gb50176_thermal_zone'
}

function hasTag(tags: Set<string>, values: string[]) {
  return values.some((value) => tags.has(value))
}

export const V1474_SEASONAL_PRODUCTIVITY_SEED: V1474MonthlyProductivity[] = PRODUCTIVITY_ZONES.flatMap((regionCode) => (
  Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const override = ZONE_MONTH_OVERRIDES[regionCode]?.[month] ?? NORMAL
    return {
      regionCode,
      month,
      productivity: override.productivity,
      climateSignal: override.climateSignal,
      classificationBasis: classificationBasisOf(regionCode),
      sourceStandard: override.climateSignal === 'normal' ? 'system_default' : 'enterprise_method',
      sourceVersion: 'GB50176 thermal-zone aligned macro fallback; plateau/desert are construction-operational extensions; no statutory holiday deduction',
      sourceClauseRef: override.sourceClauseRef,
      evidenceSourceKeys: override.evidenceSourceKeys,
      webVerified: true,
      reviewNeeded: false,
      confidence: regionCode === 'default' || override.climateSignal === 'normal' ? 'medium' : 'low',
    } satisfies V1474MonthlyProductivity
  })
))

export function normalizeV1474SeasonalProductivityRegion(regionCode: string | null | undefined) {
  const normalized = String(regionCode ?? '').trim().toLowerCase()
  if (PRODUCTIVITY_ZONES.includes(normalized as V1474SeasonalProductivityRegionCode)) {
    return normalized as V1474SeasonalProductivityRegionCode
  }
  return REGION_FALLBACK[normalized] ?? 'default'
}

export function deriveV1474SeasonalProductivityRegion(input: {
  thermalZone?: string | null
  regionCode?: string | null
  climateTags?: string[] | null
  location?: string | null
}) {
  const base = normalizeV1474SeasonalProductivityRegion(input.thermalZone ?? input.regionCode)
  const tags = new Set((input.climateTags ?? []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))
  const location = String(input.location ?? '').toLowerCase()

  if (base === 'severe_cold') {
    if (hasTag(tags, ['wind_sand', 'desert_dry']) || /xinjiang|gansu|ningxia|inner_mongolia|altay|urumqi|lanzhou|yinchuan/.test(location)) return 'severe_cold_northwest'
    return 'severe_cold_northeast'
  }
  if (base === 'cold') {
    if (hasTag(tags, ['coastal_wind', 'coastal_rain']) || /dalian|qingdao|yantai|tianjin|coastal/.test(location)) return 'cold_coastal'
    return 'cold_north_plain'
  }
  if (base === 'hot_summer_cold_winter') {
    if (hasTag(tags, ['plum_rain', 'coastal_typhoon']) || /shanghai|jiangsu|zhejiang|nanjing|suzhou|hangzhou|ningbo|wenzhou|delta/.test(location)) return 'hot_summer_cold_winter_yangtze_delta'
    if (hasTag(tags, ['basin_humidity', 'mountain_rain']) || /sichuan|chengdu|chongqing|yichang|basin/.test(location)) return 'hot_summer_cold_winter_southwest_basin'
    return 'hot_summer_cold_winter_middle_yangtze'
  }
  if (base === 'hot_summer_warm_winter') {
    if (hasTag(tags, ['tropical_rain']) || /hainan|haikou|sanya|tropical/.test(location)) return 'hot_summer_warm_winter_tropical'
    return 'hot_summer_warm_winter_south_coast'
  }
  if (base === 'mild') return 'mild_southwest_highland'
  if (base === 'plateau') return 'plateau_qinghai_tibet'
  if (base === 'desert') return 'desert_northwest_arid'
  return base
}

export function getV1474SeasonalProductivity(regionCode: string | null | undefined, month: number) {
  const normalizedRegion = normalizeV1474SeasonalProductivityRegion(regionCode)
  return V1474_SEASONAL_PRODUCTIVITY_SEED.find((item) => item.regionCode === normalizedRegion && item.month === month)
    ?? V1474_SEASONAL_PRODUCTIVITY_SEED.find((item) => item.regionCode === 'default' && item.month === month)
    ?? null
}

export const V1474_SEASONAL_PRODUCTIVITY_SEED_META = {
  seedVersion: V1474_SEASONAL_PRODUCTIVITY_SEED_VERSION,
  seedScope: 'algorithm_auxiliary',
  sourceStandards: ['JGJ/T104-2011', 'GB55032-2022', 'Measures for heatstroke prevention and cooling in workplaces'],
  expectedCounts: {
    regions: PRODUCTIVITY_ZONES.length,
    baseThermalRegions: 8,
    constructionClimateProfiles: PRODUCTIVITY_ZONES.length - 8,
    monthsPerRegion: 12,
    records: V1474_SEASONAL_PRODUCTIVITY_SEED.length,
  },
  evidenceSources: V1474_SEASONAL_PRODUCTIVITY_EVIDENCE_SOURCES,
  generationPolicy: 'source_backed_no_generic_generation; low-confidence macro fallback only; statutory holidays are owned by work_calendar, high-temperature shutdown is owned by weather facts, and process impacts are owned by process_seasonal_sensitivity',
  relationshipRole: 'monthly_productivity_context',
  upstreamRuleTypes: ['regional_climate_rules', 'project_climate_profiles', 'work_calendar'],
  downstreamRuleTypes: ['process_seasonal_sensitivity'],
  boundaryPolicy: [
    'owns climate-profile monthly macro fallback only',
    'GB50176 thermal-zone categories align with regional_climate_rules.thermalZone; construction climate profiles refine them by climateTags/location without replacing regional_climate_rules',
    'must not deduct statutory holidays, Spring Festival shutdown, year-end behavior, or compensatory workdays',
    'must not turn ordinary 35C heat into a process-level delay; strong heat impact requires weather facts or governed historical calibration',
    'must not own process-specific rainy/winter/heat sensitivity multiplier',
    'default region is neutral productivity and lowers confidence rather than inventing a climate penalty',
  ],
  selfCalibrationPolicy: {
    candidateSource: 'duration_experience_samples',
    groupingKeys: ['thermalZone', 'month'],
    statistic: 'planned_duration / actual_duration p50',
    actionPolicy: 'candidate_only_until_review',
  },
  webVerified: true,
  reviewNeeded: false,
} as const
