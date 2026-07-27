// v1.4.22.1 §4: 11 business type recommendations with default features, methods, and building configs

export type BusinessTypeCode =
  | 'general_civil' | 'hotel' | 'hospital' | 'school' | 'industrial'
  | 'data_center' | 'transportation_hub' | 'sports_culture' | 'tod_upper_cover'
  | 'renovation' | 'modular_building'

export type BusinessSubtypeCode =
  | 'civil_residential' | 'civil_office_commercial' | 'civil_complex'
  | 'industrial_general' | 'industrial_logistics' | 'industrial_cleanroom' | 'industrial_heavy'
  | 'transport_multimodal' | 'transport_railway_station' | 'transport_metro_interchange' | 'transport_bus_terminal'
  | 'sports_stadium' | 'sports_indoor_arena' | 'sports_theater' | 'sports_exhibition'
  | 'renovation_seismic' | 'renovation_energy' | 'renovation_heritage'

export type MethodVariantCode = 'cast_in_situ' | 'steel_frame' | 'precast_concrete' | 'modular_mic'

export interface BusinessTypeRecommendation {
  businessType: BusinessTypeCode
  label: string
  lucideIcon: string
  subtypes?: { code: BusinessSubtypeCode; label: string; triggers: string[] }[]
  defaultMethods: MethodVariantCode[]
  availableMethods: MethodVariantCode[]
  defaultFeatures: string[]
  defaultBuildingConfig: { functionalUsage: string; floors: number; basement: number }[]
  warningItemCount: number
  templateCountHint: number
}

export const BUSINESS_TYPE_RECOMMENDATIONS: Record<BusinessTypeCode, BusinessTypeRecommendation> = {
  general_civil: {
    businessType: 'general_civil',
    label: '民用建筑',
    lucideIcon: 'Building2',
    subtypes: [
      { code: 'civil_residential', label: '住宅', triggers: ['分户验收', '住宅精装'] },
      { code: 'civil_office_commercial', label: '商办', triggers: ['幕墙', '商业泛光', '公区精装'] },
      { code: 'civil_complex', label: '综合体', triggers: ['多业态接口', '分期'] },
    ],
    defaultMethods: ['cast_in_situ'],
    availableMethods: ['cast_in_situ', 'precast_concrete', 'modular_mic'],
    defaultFeatures: [],
    defaultBuildingConfig: [
      { functionalUsage: '住宅楼', floors: 22, basement: 2 },
    ],
    warningItemCount: 5,
    templateCountHint: 22,
  },
  hotel: {
    businessType: 'hotel',
    label: '酒店',
    lucideIcon: 'Hotel',
    defaultMethods: ['cast_in_situ'],
    availableMethods: ['cast_in_situ', 'steel_frame'],
    defaultFeatures: [],
    defaultBuildingConfig: [
      { functionalUsage: '酒店客房楼', floors: 22, basement: 3 },
    ],
    warningItemCount: 4,
    templateCountHint: 18,
  },
  hospital: {
    businessType: 'hospital',
    label: '医院',
    lucideIcon: 'BadgePlus',
    defaultMethods: ['cast_in_situ'],
    availableMethods: ['cast_in_situ', 'steel_frame'],
    defaultFeatures: ['has_or', 'has_medical_gas'],
    defaultBuildingConfig: [
      { functionalUsage: '住院楼', floors: 22, basement: 3 },
      { functionalUsage: '医技楼', floors: 5, basement: 3 },
      { functionalUsage: '门诊楼', floors: 8, basement: 2 },
      { functionalUsage: '传染门诊', floors: 3, basement: 1 },
    ],
    warningItemCount: 6,
    templateCountHint: 28,
  },
  school: {
    businessType: 'school',
    label: '学校',
    lucideIcon: 'GraduationCap',
    defaultMethods: ['cast_in_situ'],
    availableMethods: ['cast_in_situ', 'steel_frame'],
    defaultFeatures: [],
    defaultBuildingConfig: [
      { functionalUsage: '教学楼', floors: 6, basement: 1 },
      { functionalUsage: '实验楼', floors: 5, basement: 1 },
      { functionalUsage: '宿舍楼', floors: 6, basement: 1 },
    ],
    warningItemCount: 3,
    templateCountHint: 16,
  },
  industrial: {
    businessType: 'industrial',
    label: '工业建筑',
    lucideIcon: 'Factory',
    subtypes: [
      { code: 'industrial_general', label: '一般厂房', triggers: ['主体 + 钢构'] },
      { code: 'industrial_logistics', label: '物流仓储', triggers: ['AGV', '立体仓库'] },
      { code: 'industrial_cleanroom', label: '工艺洁净', triggers: ['洁净室全套'] },
      { code: 'industrial_heavy', label: '重型装备制造', triggers: ['大型设备吊装', '精密就位与负荷试验'] },
    ],
    defaultMethods: ['steel_frame'],
    availableMethods: ['steel_frame', 'cast_in_situ'],
    defaultFeatures: [],
    defaultBuildingConfig: [
      { functionalUsage: '主厂房', floors: 2, basement: 1 },
      { functionalUsage: '公辅', floors: 2, basement: 0 },
      { functionalUsage: '仓库', floors: 2, basement: 0 },
    ],
    warningItemCount: 4,
    templateCountHint: 20,
  },
  data_center: {
    businessType: 'data_center',
    label: '数据中心',
    lucideIcon: 'Server',
    defaultMethods: ['steel_frame'],
    availableMethods: ['steel_frame'],
    defaultFeatures: ['dual_utility_power'],
    defaultBuildingConfig: [
      { functionalUsage: '机房楼', floors: 5, basement: 1 },
      { functionalUsage: '动力中心', floors: 2, basement: 0 },
    ],
    warningItemCount: 4,
    templateCountHint: 16,
  },
  transportation_hub: {
    businessType: 'transportation_hub',
    label: '交通枢纽',
    lucideIcon: 'TrainTrack',
    subtypes: [
      { code: 'transport_multimodal', label: '综合交通枢纽', triggers: ['多方式换乘', '综合运营移交'] },
      { code: 'transport_railway_station', label: '铁路站房', triggers: ['营业线接口', '站台客运系统'] },
      { code: 'transport_metro_interchange', label: '地铁换乘站', triggers: ['既有线保护', '夜间窗口改接'] },
      { code: 'transport_bus_terminal', label: '汽车客运站', triggers: ['发车场坪', '充电与调度系统'] },
    ],
    defaultMethods: ['steel_frame'],
    availableMethods: ['steel_frame', 'cast_in_situ'],
    defaultFeatures: ['integral_lifting'],
    defaultBuildingConfig: [
      { functionalUsage: '枢纽主体', floors: 3, basement: 2 },
    ],
    warningItemCount: 5,
    templateCountHint: 18,
  },
  sports_culture: {
    businessType: 'sports_culture',
    label: '体育文化建筑',
    lucideIcon: 'Trophy',
    subtypes: [
      { code: 'sports_stadium', label: '体育场', triggers: ['大跨度屋盖', '比赛与集散系统'] },
      { code: 'sports_indoor_arena', label: '室内体育馆', triggers: ['活动场地', '伸缩看台与模式转换'] },
      { code: 'sports_theater', label: '剧院剧场', triggers: ['舞台机械', '建筑声学与带妆排演'] },
      { code: 'sports_exhibition', label: '博物馆展览馆', triggers: ['藏品环境', '布展与试开放'] },
    ],
    defaultMethods: ['steel_frame'],
    availableMethods: ['steel_frame'],
    defaultFeatures: ['integral_lifting'],
    defaultBuildingConfig: [
      { functionalUsage: '场馆主体', floors: 4, basement: 2 },
    ],
    warningItemCount: 4,
    templateCountHint: 14,
  },
  tod_upper_cover: {
    businessType: 'tod_upper_cover',
    label: 'TOD上盖',
    lucideIcon: 'TramFront',
    defaultMethods: ['cast_in_situ', 'steel_frame'],
    availableMethods: ['cast_in_situ', 'steel_frame'],
    defaultFeatures: ['three_level_isolation', 'non_stop_operation'],
    defaultBuildingConfig: [
      { functionalUsage: '转换层', floors: 1, basement: 0 },
      { functionalUsage: '上盖塔楼', floors: 26, basement: 0 },
    ],
    warningItemCount: 6,
    templateCountHint: 22,
  },
  renovation: {
    businessType: 'renovation',
    label: '改造修缮',
    lucideIcon: 'Wrench',
    subtypes: [
      { code: 'renovation_seismic', label: '加固抗震', triggers: ['抗震加固'] },
      { code: 'renovation_energy', label: '节能改造', triggers: ['节能改造'] },
      { code: 'renovation_heritage', label: '文保修缮', triggers: ['文保全套'] },
    ],
    defaultMethods: ['cast_in_situ'],
    availableMethods: ['cast_in_situ'],
    defaultFeatures: ['occupied_renovation'],
    defaultBuildingConfig: [
      { functionalUsage: '既有建筑', floors: 6, basement: 1 },
    ],
    warningItemCount: 3,
    templateCountHint: 12,
  },
  modular_building: {
    businessType: 'modular_building',
    label: '模块化建筑',
    lucideIcon: 'Boxes',
    defaultMethods: ['modular_mic'],
    availableMethods: ['modular_mic'],
    defaultFeatures: [],
    defaultBuildingConfig: [
      { functionalUsage: '模块化单体', floors: 18, basement: 1 },
    ],
    warningItemCount: 3,
    templateCountHint: 10,
  },
}

export const BUSINESS_SUBTYPE_CODES = Object.values(BUSINESS_TYPE_RECOMMENDATIONS)
  .flatMap((recommendation) => recommendation.subtypes ?? [])
  .map((subtype) => subtype.code)

const BUSINESS_SUBTYPE_CODE_SET = new Set<string>(BUSINESS_SUBTYPE_CODES)

const PROJECT_TYPE_COMPATIBILITY_ALIASES_BY_SUBTYPE: Record<BusinessSubtypeCode, readonly string[]> = {
  civil_residential: ['residential', 'general_civil'],
  civil_office_commercial: ['office', 'commercial', 'general_civil'],
  civil_complex: ['residential', 'office', 'commercial', 'general_civil'],
  industrial_general: ['industrial', 'factory', 'manufacturing_plant'],
  industrial_logistics: ['industrial', 'logistics', 'logistics_warehouse', 'automated_warehouse'],
  industrial_cleanroom: ['industrial', 'clean_industrial', 'process_facility', 'clean_manufacturing', 'pharma_factory'],
  industrial_heavy: ['industrial', 'heavy_manufacturing', 'heavy_industry', 'heavy_industrial_plant', 'equipment_manufacturing'],
  transport_multimodal: ['transportation_hub', 'transport_hub', 'multimodal_hub'],
  transport_railway_station: ['transportation_hub', 'transport_hub', 'railway_station'],
  transport_metro_interchange: ['transportation_hub', 'transport_hub', 'metro_interchange', 'underground_station'],
  transport_bus_terminal: ['transportation_hub', 'transport_hub', 'bus_terminal'],
  sports_stadium: ['sports_culture', 'sports_venue', 'large_span_public'],
  sports_indoor_arena: ['sports_culture', 'sports_venue', 'indoor_arena', 'arena'],
  sports_theater: ['sports_culture', 'culture_venue', 'theater', 'performing_arts_center'],
  sports_exhibition: ['sports_culture', 'culture_venue', 'exhibition_venue', 'museum', 'convention_center'],
  renovation_seismic: ['renovation'],
  renovation_energy: ['renovation', 'energy_retrofit'],
  renovation_heritage: ['renovation', 'heritage', 'historic_preservation', 'heritage_preservation'],
}

function normalizeBusinessCode(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function normalizeBusinessSubtypeCode(value: unknown): BusinessSubtypeCode | null {
  const normalized = normalizeBusinessCode(value)
  return BUSINESS_SUBTYPE_CODE_SET.has(normalized)
    ? normalized as BusinessSubtypeCode
    : null
}

export function businessTypeRequiresSubtype(value: unknown) {
  const businessType = normalizeBusinessCode(value) as BusinessTypeCode
  return (BUSINESS_TYPE_RECOMMENDATIONS[businessType]?.subtypes?.length ?? 0) > 0
}

export function isBusinessSubtypeForType(businessTypeValue: unknown, businessSubtypeValue: unknown) {
  const businessType = normalizeBusinessCode(businessTypeValue) as BusinessTypeCode
  const businessSubtype = normalizeBusinessSubtypeCode(businessSubtypeValue)
  if (!businessSubtype) return false
  return BUSINESS_TYPE_RECOMMENDATIONS[businessType]?.subtypes
    ?.some((subtype) => subtype.code === businessSubtype) ?? false
}

export function resolveProjectTypeCompatibilityCodes(input: {
  businessType?: unknown
  businessSubtype?: unknown
  projectTypeCode?: unknown
}) {
  const projectTypeCode = normalizeBusinessCode(input.projectTypeCode)
  const explicitSubtype = normalizeBusinessSubtypeCode(input.businessSubtype)
  const projectTypeSubtype = normalizeBusinessSubtypeCode(projectTypeCode)
  const businessSubtype = explicitSubtype ?? projectTypeSubtype
  const businessType = normalizeBusinessCode(input.businessType)

  return [...new Set([
    projectTypeCode,
    businessSubtype,
    businessType,
    ...(businessSubtype ? PROJECT_TYPE_COMPATIBILITY_ALIASES_BY_SUBTYPE[businessSubtype] : []),
  ].filter(Boolean) as string[])]
}

export function getBusinessTypeRecommendation(code: BusinessTypeCode): BusinessTypeRecommendation {
  return BUSINESS_TYPE_RECOMMENDATIONS[code]
}

export function inferBusinessTypeFromFunctionalUsages(usages: string[]): BusinessTypeCode | null {
  const set = new Set(usages.map(u => u.toLowerCase()))
  if (set.has('住院楼') && set.has('医技楼')) return 'hospital'
  if (set.has('教学楼') && (set.has('实验楼') || set.has('宿舍楼'))) return 'school'
  if (set.has('主厂房') && set.has('公辅')) return 'industrial'
  if (set.has('机房楼') && set.has('动力中心')) return 'data_center'
  if (set.has('转换层') && set.has('上盖塔楼')) return 'tod_upper_cover'
  if (set.has('住宅楼') && (set.has('商业') || set.has('写字楼') || set.has('酒店客房楼'))) return 'general_civil'
  if (set.has('酒店客房楼')) return 'hotel'
  if (set.has('枢纽主体')) return 'transportation_hub'
  if (set.has('场馆主体')) return 'sports_culture'
  if (set.has('既有建筑')) return 'renovation'
  if (set.has('模块化单体')) return 'modular_building'
  if (set.has('住宅楼')) return 'general_civil'
  return null
}
