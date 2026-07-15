export type EngineeringObjectFeatureProfile = {
  projectTypeCode?: string | null
  structureTypeCode?: string | null
  methodVariantCodes?: string[]
  elementVariantCodes?: string[]
}

export type EngineeringObjectFeatureDraft = {
  projectTypeCode: string
  structureTypeCode: string
  methodVariantCode: string
  elementVariantCode: string
}

export const EMPTY_ENGINEERING_OBJECT_FEATURE_DRAFT: EngineeringObjectFeatureDraft = {
  projectTypeCode: '',
  structureTypeCode: '',
  methodVariantCode: '',
  elementVariantCode: '',
}

export const ENGINEERING_OBJECT_PROJECT_TYPE_OPTIONS = [
  { id: 'building_main', label: '房建主干' },
  { id: 'residential', label: '住宅' },
  { id: 'office', label: '办公' },
  { id: 'commercial', label: '商业' },
  { id: 'mixed_use', label: '商业综合体' },
  { id: 'hotel', label: '酒店' },
  { id: 'hospital', label: '医院' },
  { id: 'school', label: '学校' },
  { id: 'industrial', label: '工业厂房' },
  { id: 'logistics', label: '物流仓储' },
  { id: 'parking', label: '停车场' },
  { id: 'outdoor_support', label: '室外配套' },
  { id: 'municipal', label: '市政基础' },
  { id: 'decoration_specialty', label: '装饰装修专项' },
  { id: 'mep_specialty', label: '机电安装专项' },
  { id: 'fire_specialty', label: '消防深化专项' },
  { id: 'smart_specialty', label: '智能化专项' },
]

export const ENGINEERING_OBJECT_STRUCTURE_TYPE_OPTIONS = [
  { id: 'masonry', label: '砖混' },
  { id: 'cast_in_place_frame', label: '现浇框架' },
  { id: 'frame_shear_wall', label: '框剪' },
  { id: 'shear_wall', label: '剪力墙' },
  { id: 'steel_structure', label: '钢结构' },
  { id: 'steel_concrete_composite', label: '钢混组合' },
  { id: 'prefabricated_concrete', label: '装配式混凝土' },
  { id: 'prefabricated_steel', label: '装配式钢结构' },
  { id: 'mixed_structure', label: '混合结构' },
  { id: 'basement_human_defense', label: '地下室 / 人防' },
]

export const ENGINEERING_OBJECT_METHOD_VARIANT_OPTIONS = [
  { id: 'aluminum_formwork', label: '铝模' },
  { id: 'timber_formwork', label: '木模' },
  { id: 'steel_formwork', label: '钢模' },
  { id: 'full_steel_large_formwork', label: '全钢大模' },
  { id: 'climbing_formwork', label: '爬模' },
  { id: 'flying_formwork', label: '飞模' },
  { id: 'normal_concrete', label: '普通混凝土' },
  { id: 'mass_concrete', label: '大体积混凝土' },
  { id: 'impermeable_concrete', label: '抗渗混凝土' },
  { id: 'post_cast_strip', label: '后浇带' },
  { id: 'fair_faced_concrete', label: '清水混凝土' },
  { id: 'cast_in_place_rebar', label: '现浇钢筋' },
  { id: 'precast_assembly', label: '装配式吊装' },
  { id: 'mechanical_connection', label: '钢筋机械连接' },
  { id: 'sleeve_grouting', label: '套筒灌浆' },
  { id: 'membrane_waterproofing', label: '卷材防水' },
  { id: 'coating_waterproofing', label: '涂膜防水' },
  { id: 'rigid_waterproofing', label: '刚性防水' },
  { id: 'basement_waterproofing', label: '地下室防水' },
  { id: 'roof_waterproofing', label: '屋面防水' },
  { id: 'kitchen_bath_waterproofing', label: '厨卫防水' },
  { id: 'plastering', label: '抹灰' },
  { id: 'coating_finish', label: '涂饰' },
  { id: 'doors_windows', label: '门窗' },
  { id: 'curtain_wall', label: '幕墙' },
  { id: 'curtain_wall_unitized', label: '单元式幕墙' },
  { id: 'fine_decoration_wet_work', label: '精装湿作业' },
  { id: 'dry_hanging', label: '干挂' },
  { id: 'assembled_interior', label: '装配式内装' },
  { id: 'integrated_hanger', label: '综合支吊架' },
  { id: 'prefabricated_machine_room', label: '装配式机房' },
  { id: 'air_duct', label: '风管' },
  { id: 'cable_tray', label: '桥架' },
  { id: 'pipe_network', label: '管网' },
  { id: 'equipment_installation', label: '设备安装' },
  { id: 'system_commissioning', label: '系统调试' },
  { id: 'sprinkler', label: '喷淋' },
  { id: 'fire_hydrant', label: '消火栓' },
  { id: 'smoke_control', label: '防排烟' },
  { id: 'positive_pressure_air_supply', label: '正压送风' },
  { id: 'gas_extinguishing', label: '气体灭火' },
  { id: 'fire_shutter', label: '防火卷帘' },
  { id: 'fire_linkage_commissioning', label: '消防联动调试' },
  { id: 'fire_detection_acceptance', label: '检测验收' },
  { id: 'cabling', label: '综合布线' },
  { id: 'security', label: '安防' },
  { id: 'access_control', label: '门禁' },
  { id: 'bas', label: '楼控' },
  { id: 'information_release', label: '信息发布' },
  { id: 'equipment_room', label: '机房' },
  { id: 'point_installation', label: '点位安装' },
  { id: 'system_integration_commissioning', label: '系统联调' },
]

export const ENGINEERING_OBJECT_ELEMENT_VARIANT_OPTIONS = [
  { id: 'foundation', label: '基础' },
  { id: 'column', label: '柱' },
  { id: 'beam', label: '梁' },
  { id: 'slab', label: '板' },
  { id: 'wall', label: '墙' },
  { id: 'stair', label: '楼梯' },
]

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeCode(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeCodeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(normalizeCode).filter(Boolean) as string[]
  const single = normalizeCode(value)
  return single ? [single] : []
}

function readProfileRecord(record: Record<string, unknown>): EngineeringObjectFeatureProfile {
  return {
    projectTypeCode: normalizeCode(record.projectTypeCode ?? record.project_type_code),
    structureTypeCode: normalizeCode(record.structureTypeCode ?? record.structure_type_code),
    methodVariantCodes: normalizeCodeArray(record.methodVariantCodes ?? record.method_variant_codes),
    elementVariantCodes: normalizeCodeArray(record.elementVariantCodes ?? record.element_variant_codes),
  }
}

export function compactEngineeringObjectFeatureProfile(
  profile: EngineeringObjectFeatureProfile,
): EngineeringObjectFeatureProfile {
  const compacted: EngineeringObjectFeatureProfile = {}
  if (profile.projectTypeCode) compacted.projectTypeCode = profile.projectTypeCode
  if (profile.structureTypeCode) compacted.structureTypeCode = profile.structureTypeCode
  if ((profile.methodVariantCodes ?? []).length > 0) compacted.methodVariantCodes = profile.methodVariantCodes
  if ((profile.elementVariantCodes ?? []).length > 0) compacted.elementVariantCodes = profile.elementVariantCodes
  return compacted
}

export function isEmptyEngineeringObjectFeatureProfile(profile: EngineeringObjectFeatureProfile): boolean {
  return !profile.projectTypeCode
    && !profile.structureTypeCode
    && (profile.methodVariantCodes ?? []).length === 0
    && (profile.elementVariantCodes ?? []).length === 0
}

export function readEngineeringObjectFeatureProfile(metadata: unknown): EngineeringObjectFeatureProfile {
  const record = readRecord(metadata)
  return compactEngineeringObjectFeatureProfile({
    ...readProfileRecord(record),
    ...readProfileRecord(readRecord(record.featureProfile)),
    ...readProfileRecord(readRecord(record.projectGenerationFacts)),
  })
}

export function engineeringObjectFeatureProfileToDraft(
  profile: EngineeringObjectFeatureProfile,
): EngineeringObjectFeatureDraft {
  return {
    projectTypeCode: profile.projectTypeCode ?? '',
    structureTypeCode: profile.structureTypeCode ?? '',
    methodVariantCode: profile.methodVariantCodes?.[0] ?? '',
    elementVariantCode: profile.elementVariantCodes?.[0] ?? '',
  }
}

export function engineeringObjectFeatureDraftToProfile(
  draft: EngineeringObjectFeatureDraft,
): EngineeringObjectFeatureProfile {
  return compactEngineeringObjectFeatureProfile({
    projectTypeCode: normalizeCode(draft.projectTypeCode),
    structureTypeCode: normalizeCode(draft.structureTypeCode),
    methodVariantCodes: normalizeCodeArray(draft.methodVariantCode),
    elementVariantCodes: normalizeCodeArray(draft.elementVariantCode),
  })
}

export function writeEngineeringObjectFeatureProfileMetadata(
  metadata: unknown,
  profile: EngineeringObjectFeatureProfile,
): Record<string, unknown> {
  const next = { ...readRecord(metadata) }
  delete next.featureProfile
  delete next.project_type_code
  delete next.structure_type_code
  delete next.method_variant_codes
  delete next.element_variant_codes
  delete next.projectTypeCode
  delete next.structureTypeCode
  delete next.methodVariantCodes
  delete next.elementVariantCodes

  const compacted = compactEngineeringObjectFeatureProfile(profile)
  if (!isEmptyEngineeringObjectFeatureProfile(compacted)) {
    next.featureProfile = compacted
  }
  return next
}

function mergeProfiles(
  base: EngineeringObjectFeatureProfile,
  next: EngineeringObjectFeatureProfile,
): EngineeringObjectFeatureProfile {
  return compactEngineeringObjectFeatureProfile({
    projectTypeCode: next.projectTypeCode ?? base.projectTypeCode ?? null,
    structureTypeCode: next.structureTypeCode ?? base.structureTypeCode ?? null,
    methodVariantCodes: (next.methodVariantCodes ?? []).length > 0 ? next.methodVariantCodes : base.methodVariantCodes,
    elementVariantCodes: (next.elementVariantCodes ?? []).length > 0 ? next.elementVariantCodes : base.elementVariantCodes,
  })
}

export function getEngineeringObjectFeatureProfileFromObjects(
  objects: Array<{ id: string; metadata?: Record<string, unknown> | null }>,
  objectIds: Array<string | null | undefined>,
): EngineeringObjectFeatureProfile {
  const objectById = new Map(objects.map((object) => [object.id, object]))
  return objectIds.reduce<EngineeringObjectFeatureProfile>((profile, objectId) => {
    const normalizedId = String(objectId ?? '').trim()
    if (!normalizedId) return profile
    const object = objectById.get(normalizedId)
    if (!object) return profile
    return mergeProfiles(profile, readEngineeringObjectFeatureProfile(object.metadata))
  }, {})
}

function getOptionLabel(options: Array<{ id: string; label: string }>, code?: string | null) {
  if (!code) return null
  return options.find((option) => option.id === code)?.label ?? code
}

export function getEngineeringObjectFeatureProfileChips(profile: EngineeringObjectFeatureProfile): string[] {
  const chips: string[] = []
  const projectTypeLabel = getOptionLabel(ENGINEERING_OBJECT_PROJECT_TYPE_OPTIONS, profile.projectTypeCode)
  const structureTypeLabel = getOptionLabel(ENGINEERING_OBJECT_STRUCTURE_TYPE_OPTIONS, profile.structureTypeCode)
  const methodVariantLabel = getOptionLabel(ENGINEERING_OBJECT_METHOD_VARIANT_OPTIONS, profile.methodVariantCodes?.[0])
  const elementVariantLabel = getOptionLabel(ENGINEERING_OBJECT_ELEMENT_VARIANT_OPTIONS, profile.elementVariantCodes?.[0])
  if (projectTypeLabel) chips.push(`工程类型: ${projectTypeLabel}`)
  if (structureTypeLabel) chips.push(`结构体系: ${structureTypeLabel}`)
  if (methodVariantLabel) chips.push(`工法: ${methodVariantLabel}`)
  if (elementVariantLabel) chips.push(`构件: ${elementVariantLabel}`)
  return chips
}
