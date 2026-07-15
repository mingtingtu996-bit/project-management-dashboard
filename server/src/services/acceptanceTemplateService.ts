import { v4 as uuidv4 } from 'uuid'

import { getClient } from '../database.js'
import {
  ACCEPTANCE_TEMPLATE_SEED_VERSION,
  ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
  GENERAL_ACCEPTANCE_TEMPLATE_CODE,
  type AcceptanceTemplateApplicabilityConditionSeed,
  type AcceptanceTemplateBusinessProfile,
  type AcceptanceTemplateIndustryCode,
  type AcceptanceTemplateItemSeed,
  type AcceptanceTemplateRegionProfile,
  type AcceptanceTemplateRegionSource,
} from '../seeds/acceptanceTimelineTemplateSeed.js'
import { executeSQL, executeSQLOne } from './dbService.js'
import { insertRowReturning } from './transactionInsertService.js'
import { clearAcceptanceFlowSnapshotCache } from './acceptanceFlowService.js'
import {
  getLatestAcceptancePolicyAutoPublishRun,
  getLatestStableAcceptancePolicyAutoPublishRun,
  loadLatestAcceptancePolicyAutoPublishRun,
  loadLatestStableAcceptancePolicyAutoPublishRun,
  type AcceptancePolicyAutoPublishRun,
  type AcceptancePolicyPublishedRuleOverlay,
} from './acceptanceTemplatePolicyUpdateService.js'
import type { AcceptanceCatalog, AcceptanceDependency, AcceptancePlan, AcceptanceRequirement } from '../types/db.js'

export type AcceptanceTemplatePreviewAction = 'will_create' | 'will_skip_existing'

export interface AcceptanceTemplatePreviewItem {
  itemCode: string
  canonicalType: string
  itemName: string
  regionalDisplayName?: string | null
  phaseCode: AcceptanceTemplateItemSeed['phaseCode']
  phaseOrder: number
  sortOrder: number
  scopeLevel: AcceptanceTemplateItemSeed['scopeLevel']
  typeColor: string
  authority: string
  responsibleUnit: string
  description: string
  resultDocuments: string[]
  handlingModes: string[]
  materialNames: string[]
  prerequisiteNames: string[]
  sourceCategories: string[]
  sourceIndustryCodes: AcceptanceTemplateIndustryCode[]
  action: AcceptanceTemplatePreviewAction
  selected: boolean
  existingPlanId?: string | null
}

export interface AcceptanceTemplatePreviewDependency {
  dependencyCode: string
  sourceItemCode: string
  targetItemCode: string
  dependencyKind: 'hard' | 'soft'
  reason: string
  action: AcceptanceTemplatePreviewAction
  selected: boolean
}

export interface AcceptanceTemplatePreviewRequirement {
  requirementCode: string
  itemCode: string
  requirementType: string
  sourceEntityType: string
  sourceEntityId: string
  description: string
  action: AcceptanceTemplatePreviewAction
  selected: boolean
}

export interface AcceptanceTemplatePreviewRegionProfile {
  provinceCode: string
  provinceName: string
  cityCode?: string
  cityName?: string
  profileVersion: string
  source: AcceptanceTemplateRegionSource
  deliveryTargetName: string
  updateMode: AcceptanceTemplateRegionProfile['updateMode']
  policySources: AcceptanceTemplateRegionProfile['policySources']
}

export interface AcceptanceTemplatePreviewIndustryProfile {
  codes: AcceptanceTemplateIndustryCode[]
  labels: string[]
}

export interface AcceptanceTemplatePreviewBusinessProfile {
  businessTypeCode: string
  businessTypeName: string
  source: 'project_generation_facts' | 'project_metadata' | 'project_field' | 'default'
  industryCodes: AcceptanceTemplateIndustryCode[]
  defaultItemCodes: string[]
  optionalItemCodes: string[]
  defaultConditionCodes: string[]
  sourcePolicyHints: string[]
}

export type AcceptanceTemplateApplicabilityConditionSource =
  | 'region_profile'
  | 'business_profile'
  | 'project_feature_trigger'
  | 'acceptance_page_confirmation'
  | 'candidate'

export interface AcceptanceTemplateApplicabilityConditionPreview {
  conditionCode: string
  conditionName: string
  description: string
  groupCode: AcceptanceTemplateApplicabilityConditionSeed['groupCode']
  groupName: string
  affectedItemCodes: string[]
  triggerKeywords: string[]
  applicableIndustryCodes: AcceptanceTemplateIndustryCode[]
  selected: boolean
  suggested: boolean
  confirmationRequired: boolean
  source: AcceptanceTemplateApplicabilityConditionSource
  confirmationQuestion: string
  sourcePolicyHint: string
}

export interface AcceptanceTemplatePreview {
  templateCode: string
  templateName: string
  seedVersion: string
  projectId: string
  summary: {
    itemCreateCount: number
    dependencyCreateCount: number
    requirementCreateCount: number
    skippedExistingCount: number
  }
  deliveryGoal: {
    targetName: string
    explanation: string
  }
  regionProfile: AcceptanceTemplatePreviewRegionProfile
  businessProfile: AcceptanceTemplatePreviewBusinessProfile
  industryProfile: AcceptanceTemplatePreviewIndustryProfile
  applicabilityConditions: AcceptanceTemplateApplicabilityConditionPreview[]
  items: AcceptanceTemplatePreviewItem[]
  dependencies: AcceptanceTemplatePreviewDependency[]
  requirements: AcceptanceTemplatePreviewRequirement[]
  warnings: Array<{
    code: string
    message: string
    severity: 'info' | 'warning'
  }>
}

export interface ApplyAcceptanceTemplateRequest {
  templateCode: string
  seedVersion: string
  selectedItemCodes: string[]
  selectedDependencyCodes: string[]
  selectedRequirementCodes: string[]
  duplicatePolicy: 'skip_existing'
}

export interface ApplyAcceptanceTemplateResult {
  templateCode: string
  seedVersion: string
  projectId: string
  createdCatalogIds: string[]
  createdPlanIds: string[]
  createdDependencyIds: string[]
  createdRequirementIds: string[]
  skippedExisting: Array<{
    entityType: 'item' | 'dependency' | 'requirement'
    key: string
    reason: string
  }>
}

export class AcceptanceTemplateError extends Error {
  constructor(
    public code:
      | 'ACCEPTANCE_TEMPLATE_NOT_FOUND'
      | 'ACCEPTANCE_TEMPLATE_VERSION_MISMATCH'
      | 'ACCEPTANCE_TEMPLATE_INVALID_SELECTION'
      | 'ACCEPTANCE_TEMPLATE_APPLY_CONFLICT',
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeSearchText(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[\s_-]+/g, '')
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  return text ? [text] : []
}

function readFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function flattenPrimitiveText(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return []
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = normalizeText(value)
    return text ? [text] : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenPrimitiveText(entry, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => flattenPrimitiveText(entry, depth + 1))
  }
  return []
}

function normalizeDateTimeForSql(value = new Date()) {
  return value.toISOString()
}

function getTemplate(templateCode: string) {
  if (templateCode !== GENERAL_ACCEPTANCE_TEMPLATE_CODE) {
    throw new AcceptanceTemplateError('ACCEPTANCE_TEMPLATE_NOT_FOUND', '验收时间轴系统模板不存在', 404)
  }
  return ACCEPTANCE_TIMELINE_TEMPLATE_SEED
}

function assertApplyRequest(request: ApplyAcceptanceTemplateRequest) {
  getTemplate(request.templateCode)
  if (request.seedVersion !== ACCEPTANCE_TEMPLATE_SEED_VERSION) {
    throw new AcceptanceTemplateError('ACCEPTANCE_TEMPLATE_VERSION_MISMATCH', '验收时间轴模板版本不匹配', 409)
  }
  if (request.duplicatePolicy !== 'skip_existing') {
    throw new AcceptanceTemplateError('ACCEPTANCE_TEMPLATE_INVALID_SELECTION', '验收时间轴模板当前仅支持跳过已存在事项', 422)
  }
}

function readProjectMetadata(project: Record<string, unknown> | null) {
  return readRecord(project?.metadata)
}

function readProjectGenerationFacts(project: Record<string, unknown> | null) {
  const metadata = readProjectMetadata(project)
  return readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts)
}

function readProjectFeatures(project: Record<string, unknown> | null) {
  const metadata = readProjectMetadata(project)
  const facts = readProjectGenerationFacts(project)
  return {
    ...readRecord(metadata.projectFeatures ?? metadata.project_features),
    ...readRecord(facts.projectFeatures ?? facts.project_features),
  }
}

function readLocationFacts(project: Record<string, unknown> | null) {
  const metadata = readProjectMetadata(project)
  const features = readProjectFeatures(project)
  const facts = readProjectGenerationFacts(project)
  const candidates = [
    readRecord(features.locationFacts ?? features.location_facts),
    readRecord(facts.locationFacts ?? facts.location_facts),
    readRecord(metadata.locationFacts ?? metadata.location_facts),
    readRecord(metadata.wizard_location_facts),
  ]
  return candidates.find((candidate) => Object.keys(candidate).length > 0) ?? {}
}

function buildLocationSearchValue(project: Record<string, unknown> | null) {
  const metadata = readProjectMetadata(project)
  const locationFacts = readLocationFacts(project)
  return [
    locationFacts.provinceCode,
    locationFacts.province_code,
    locationFacts.province,
    locationFacts.locationProvince,
    locationFacts.location_province,
    locationFacts.cityCode,
    locationFacts.city_code,
    locationFacts.city,
    locationFacts.locationCity,
    locationFacts.location_city,
    metadata.provinceCode,
    metadata.province_code,
    metadata.province,
    metadata.cityCode,
    metadata.city_code,
    metadata.city,
    project?.province,
    project?.city,
    project?.location,
  ].map(normalizeText).filter(Boolean).join(' ')
}

function resolveRegionProfile(project: Record<string, unknown> | null): { profile: AcceptanceTemplateRegionProfile; source: AcceptanceTemplateRegionSource } {
  const searchValue = normalizeSearchText(buildLocationSearchValue(project))
  for (const profile of ACCEPTANCE_TIMELINE_TEMPLATE_SEED.regionProfiles) {
    if (profile.provinceCode === 'default' || !profile.cityName) continue
    const isDirectAdminCity = normalizeSearchText(profile.cityName) === normalizeSearchText(profile.provinceName)
    const provinceAliases = new Set([
      profile.provinceCode,
      profile.provinceName,
      profile.provinceName.replace(/[省市]$/u, ''),
    ].map(normalizeSearchText).filter(Boolean))
    const cityAliases = [profile.cityCode, profile.cityName, ...profile.aliases].filter((alias) => {
      const normalizedAlias = normalizeSearchText(alias)
      return normalizedAlias && (isDirectAdminCity || !provinceAliases.has(normalizedAlias))
    })
    if (cityAliases.some((alias) => {
      const normalizedAlias = normalizeSearchText(alias)
      return normalizedAlias && searchValue.includes(normalizedAlias)
    })) {
      return { profile, source: 'project_static_profile' }
    }
  }
  for (const profile of ACCEPTANCE_TIMELINE_TEMPLATE_SEED.regionProfiles) {
    if (profile.provinceCode === 'default' || profile.cityName) continue
    const aliases = [profile.provinceCode, profile.provinceName, profile.cityCode, profile.cityName, ...profile.aliases]
    if (aliases.some((alias) => {
      const normalizedAlias = normalizeSearchText(alias)
      return normalizedAlias && searchValue.includes(normalizedAlias)
    })) {
      return { profile, source: 'project_static_profile' }
    }
  }
  return {
    profile: ACCEPTANCE_TIMELINE_TEMPLATE_SEED.regionProfiles.find((profile) => profile.provinceCode === 'default')!,
    source: 'default',
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function buildRegionAssetCode(profile: AcceptanceTemplateRegionProfile) {
  return `region_profile:${profile.provinceCode}:${profile.cityCode ?? 'province'}`
}

function resolveAutoPublishedPolicyUpdate(
  assetCode: string,
  latestAutoPublishRun?: AcceptancePolicyAutoPublishRun | null,
) {
  const latestRun = latestAutoPublishRun ?? getLatestStableAcceptancePolicyAutoPublishRun()
  if (!latestRun || latestRun.publicationStatus !== 'published') return null
  return latestRun.autoPublishedUpdates.find((update) => update.assetCode === assetCode) ?? null
}

function resolveAutoPublishedPolicyVersion(
  assetCode: string,
  latestAutoPublishRun?: AcceptancePolicyAutoPublishRun | null,
) {
  return resolveAutoPublishedPolicyUpdate(assetCode, latestAutoPublishRun)?.publishedProfileVersion ?? null
}

function resolveAutoPublishedPolicyRuleOverlay(
  assetCode: string,
  latestAutoPublishRun?: AcceptancePolicyAutoPublishRun | null,
): AcceptancePolicyPublishedRuleOverlay | null {
  return resolveAutoPublishedPolicyUpdate(assetCode, latestAutoPublishRun)?.publishedRuleOverlay ?? null
}

async function resolveLatestAcceptancePolicyAutoPublishRun() {
  try {
    return await loadLatestStableAcceptancePolicyAutoPublishRun()
  } catch {
    return null
  }
}

function mergeStringRecord(
  base: Record<string, string[]> | undefined,
  additions: Record<string, string[]> | undefined,
) {
  if (!additions) return base
  const result: Record<string, string[]> = { ...(base ?? {}) }
  for (const [key, values] of Object.entries(additions)) {
    result[key] = uniqueStrings([...(result[key] ?? []), ...values])
  }
  return result
}

function toRuntimeRegionProfile(
  profile: AcceptanceTemplateRegionProfile,
  latestAutoPublishRun?: AcceptancePolicyAutoPublishRun | null,
) {
  const assetCode = buildRegionAssetCode(profile)
  const publishedVersion = resolveAutoPublishedPolicyVersion(assetCode, latestAutoPublishRun)
  const overlay = resolveAutoPublishedPolicyRuleOverlay(assetCode, latestAutoPublishRun)
  return {
    profile: {
      ...profile,
      additionalItemCodes: uniqueStrings([
        ...profile.additionalItemCodes,
        ...(overlay?.additionalItemCodes ?? []),
      ]),
      optionalItemCodes: uniqueStrings([
        ...profile.optionalItemCodes,
        ...(overlay?.optionalItemCodes ?? []),
      ]),
      handlingModeOverrides: mergeStringRecord(
        profile.handlingModeOverrides,
        overlay?.handlingModeAdditions,
      ),
      authorityOverrides: {
        ...(profile.authorityOverrides ?? {}),
        ...(overlay?.authorityOverrides ?? {}),
      },
      resultDocumentOverrides: mergeStringRecord(
        profile.resultDocumentOverrides,
        overlay?.resultDocumentAdditions,
      ),
    },
    profileVersion: publishedVersion ?? ACCEPTANCE_TEMPLATE_SEED_VERSION,
  }
}

function includesAny(value: string, needles: string[]) {
  const normalized = normalizeSearchText(value)
  return needles.some((needle) => normalized.includes(normalizeSearchText(needle)))
}

function buildProjectScenarioSearchTokens(project: Record<string, unknown> | null) {
  const metadata = readProjectMetadata(project)
  const features = readProjectFeatures(project)
  const facts = readProjectGenerationFacts(project)
  const tokens = [
    project?.name,
    project?.business_type,
    project?.businessType,
    project?.project_type,
    project?.projectType,
    metadata.businessType,
    metadata.business_type,
    metadata.businessTypeCode,
    metadata.business_type_code,
    metadata.businessSubtype,
    metadata.business_subtype,
    metadata.businessSubtypeCode,
    metadata.business_subtype_code,
    metadata.projectTypeCode,
    metadata.project_type_code,
    metadata.project_type,
    facts.businessType,
    facts.business_type,
    facts.businessTypeCode,
    facts.business_type_code,
    facts.businessSubtype,
    facts.business_subtype,
    facts.businessSubtypeCode,
    facts.business_subtype_code,
    facts.projectTypeCode,
    facts.project_type_code,
    facts.project_type,
    features.businessType,
    features.business_type,
    features.businessTypeCode,
    features.business_type_code,
    features.businessSubtype,
    features.business_subtype,
    features.businessSubtypeCode,
    features.business_subtype_code,
    features.projectTypeCode,
    features.project_type_code,
    features.project_type,
    features.assetType,
    features.asset_type,
    ...flattenPrimitiveText(metadata.methodVariantCodes ?? metadata.method_variant_codes),
    ...flattenPrimitiveText(facts.methodVariantCodes ?? facts.method_variant_codes),
    ...flattenPrimitiveText(features.methodVariantCodes ?? features.method_variant_codes),
    ...flattenPrimitiveText(metadata.projectFeatures ?? metadata.project_features),
    ...flattenPrimitiveText(facts.projectFeatures ?? facts.project_features),
    ...flattenPrimitiveText(features.defaultFeatures ?? features.default_features),
    ...flattenPrimitiveText(features.projectTags ?? features.project_tags),
  ].flatMap(readStringArray)

  const search = tokens.join(' ')
  const derivedTokens: string[] = []
  if (includesAny(search, ['hotel', 'luxury_hotel'])) {
    derivedTokens.push('commercial_office', 'commercial', 'hotel', 'public assembly', 'public_assembly_place')
  }
  if (includesAny(search, ['civil_office_commercial', 'civil_complex'])) {
    derivedTokens.push('commercial_office', 'commercial', 'office', 'mall', 'public assembly')
  }
  if (includesAny(search, ['general_civil', 'civil_residential', 'residential', 'prefab_residential'])) {
    derivedTokens.push('residential', 'housing')
  }
  if (includesAny(search, ['modular_building', 'modular_mic', 'mic_modular'])) {
    derivedTokens.push('modular_building', 'modular_mic', 'prefab', 'residential')
  }
  if (includesAny(search, ['data_center', 'data center', 'idc'])) {
    derivedTokens.push('data_center', 'industrial', 'telecom', 'weak_current', 'power')
  }
  if (includesAny(search, ['industrial', 'industrial_general', 'industrial_logistics', 'industrial_cleanroom', 'clean_industrial'])) {
    derivedTokens.push('industrial', 'factory', 'plant')
  }
  if (includesAny(search, ['hospital'])) {
    derivedTokens.push('medical_school_public', 'medical', 'hospital', 'health')
  }
  if (includesAny(search, ['school', 'campus'])) {
    derivedTokens.push('medical_school_public', 'school', 'campus', 'health')
  }
  if (includesAny(search, ['transportation_hub', 'sports_culture', 'tod_upper_cover', 'tod'])) {
    derivedTokens.push('commercial_office', 'public building', 'traffic', 'parking', 'access')
  }
  if (includesAny(search, ['renovation', 'renovation_seismic', 'renovation_energy', 'renovation_heritage'])) {
    derivedTokens.push('renovation', 'general_building')
  }

  return uniqueStrings([...tokens, ...derivedTokens])
}

function resolveIndustryCodes(project: Record<string, unknown> | null): AcceptanceTemplateIndustryCode[] {
  const metadata = readProjectMetadata(project)
  const features = readProjectFeatures(project)
  const candidates = [
    project?.business_type,
    project?.project_type,
    metadata.businessTypeCode,
    metadata.business_type,
    metadata.projectTypeCode,
    metadata.project_type,
    features.businessTypeCode,
    features.business_type,
    features.projectTypeCode,
    features.project_type,
    features.assetType,
    features.asset_type,
    ...buildProjectScenarioSearchTokens(project),
    project?.name,
  ].flatMap(readStringArray)
  const search = candidates.join(' ')
  const codes = new Set<AcceptanceTemplateIndustryCode>(['general_building'])
  if (includesAny(search, ['residential', 'housing', '住宅', '商品房', '公寓'])) codes.add('residential')
  if (includesAny(search, ['commercial', 'office', 'mall', '商业', '办公', '写字楼', '酒店'])) codes.add('commercial_office')
  if (includesAny(search, ['industrial', 'factory', 'plant', '厂房', '工业', '仓储', '物流'])) codes.add('industrial')
  if (includesAny(search, ['medical', 'school', 'hospital', 'campus', '医院', '学校', '教育', '医疗', '公建'])) codes.add('medical_school_public')
  return [...codes]
}

function buildProjectFeatureSearchValue(project: Record<string, unknown> | null) {
  const metadata = readProjectMetadata(project)
  const features = readProjectFeatures(project)
  const facts = readProjectGenerationFacts(project)
  const highestBuildingFloorCount = readFiniteNumber(
    features.highestBuildingFloorCount
      ?? features.highest_building_floor_count
      ?? facts.highestBuildingFloorCount
      ?? facts.highest_building_floor_count,
  )
  const standardFloorCount = readFiniteNumber(
    features.standardFloorCount
      ?? features.standard_floor_count
      ?? facts.standardFloorCount
      ?? facts.standard_floor_count,
  )
  const buildingPatternCodes = [
    ...readStringArray(features.buildingPatternCodes ?? features.building_pattern_codes),
    ...readStringArray(facts.buildingPatternCodes ?? facts.building_pattern_codes),
  ]
  const derivedFeatureTokens = [
    highestBuildingFloorCount !== null && highestBuildingFloorCount >= 10 ? '高层建筑电梯' : null,
    standardFloorCount !== null && standardFloorCount >= 10 ? '高层建筑电梯' : null,
    buildingPatternCodes.some((code) => normalizeSearchText(code).includes('highrisecoreandfloorcycle')) ? '高层建筑电梯' : null,
  ].filter(Boolean)
  return [
    project?.name,
    project?.business_type,
    project?.project_type,
    project?.location,
    ...buildProjectScenarioSearchTokens(project),
    ...flattenPrimitiveText(metadata.acceptanceSpecialties ?? metadata.acceptance_specialties),
    ...flattenPrimitiveText(metadata.specialtyAcceptance ?? metadata.specialty_acceptance),
    ...flattenPrimitiveText(metadata.specialAcceptance ?? metadata.special_acceptance),
    ...flattenPrimitiveText(features.acceptanceSpecialties ?? features.acceptance_specialties),
    ...flattenPrimitiveText(features.specialtyAcceptance ?? features.specialty_acceptance),
    ...flattenPrimitiveText(features.specialAcceptance ?? features.special_acceptance),
    ...flattenPrimitiveText(facts.acceptanceSpecialties ?? facts.acceptance_specialties),
    ...flattenPrimitiveText(facts.specialtyAcceptance ?? facts.specialty_acceptance),
    ...flattenPrimitiveText(facts.specialAcceptance ?? facts.special_acceptance),
    ...flattenPrimitiveText(features.specialtyPacks ?? features.specialty_packs),
    ...flattenPrimitiveText(features.municipalSupports ?? features.municipal_supports),
    ...flattenPrimitiveText(features.projectTags ?? features.project_tags),
    ...derivedFeatureTokens,
  ].map(normalizeText).filter(Boolean).join(' ')
}

function readAcceptanceTemplateApplicability(project: Record<string, unknown> | null) {
  const metadata = readProjectMetadata(project)
  const features = readProjectFeatures(project)
  const facts = readProjectGenerationFacts(project)
  return {
    ...readRecord(metadata.acceptanceTemplateApplicability ?? metadata.acceptance_template_applicability),
    ...readRecord(features.acceptanceTemplateApplicability ?? features.acceptance_template_applicability),
    ...readRecord(facts.acceptanceTemplateApplicability ?? facts.acceptance_template_applicability),
  }
}

function readConfirmedConditionCodes(project: Record<string, unknown> | null) {
  const applicability = readAcceptanceTemplateApplicability(project)
  return new Set([
    ...readStringArray(applicability.confirmedConditionCodes ?? applicability.confirmed_condition_codes),
    ...readStringArray(applicability.selectedConditionCodes ?? applicability.selected_condition_codes),
  ].map(normalizeSearchText).filter(Boolean))
}

const INDUSTRY_LABELS: Record<AcceptanceTemplateIndustryCode, string> = {
  general_building: '通用房建',
  residential: '商品住宅',
  commercial_office: '商业/办公',
  industrial: '工业厂房',
  medical_school_public: '医疗/学校公建',
}

const CONDITION_GATED_REGION_ADDITIONAL_ITEMS: Record<string, string[]> = {
  gas_acceptance: [
    'gas',
    'fuel gas',
    'production gas',
    'gas engineering',
    'canteen gas',
    'kitchen gas',
    '燃气',
    '生产用气',
    '食堂用气',
    '厨房用气',
    '燃气工程',
  ],
  landscape_acceptance: [
    'landscape',
    'landscaping',
    'green area',
    'greening',
    'garden',
    '景观',
    '园林',
    '绿化',
    '景观绿化',
    '室外景观',
  ],
  heat_supply_acceptance: [
    'heating',
    'heat supply',
    'district heating',
    'heating station',
    'thermal station',
    '供热',
    '集中供暖',
    '热力',
    '换热站',
    '供热接入',
  ],
  telecom_acceptance: [
    'telecom',
    'communication',
    'broadband',
    'fiber',
    'weak current',
    'operator access',
    '通信',
    '广电',
    '有线电视',
    '弱电接入',
    '宽带',
    '运营商接入',
  ],
  water_conservation_acceptance: [
    'water conservation',
    'soil and water conservation',
    'soilwater',
    '水土保持',
    '水保',
    '水土保持方案',
    '水土保持设施',
    '水土保持监测',
  ],
  water_saving_acceptance: [
    'water saving',
    'reclaimed water',
    'reuse water',
    '节水',
    '中水',
    '再生水',
    '节水设施',
    '中水系统',
    '用水指标',
  ],
  sponge_city_acceptance: [
    'sponge city',
    'rainwater detention',
    'rain and sewage separation',
    '海绵城市',
    '海绵专项',
    '雨污分流',
    '雨水调蓄',
    '径流控制',
  ],
  sanitation_facility_acceptance: [
    'sanitation',
    'waste',
    'garbage',
    'garbage classification',
    'refuse room',
    '环卫',
    '垃圾',
    '生活垃圾',
    '垃圾分类',
    '垃圾房',
    '垃圾站',
    '垃圾收集',
  ],
  traffic_access_acceptance: [
    'traffic',
    'parking',
    'road opening',
    'access',
    'traffic organization',
    'traffic impact',
    '交通',
    '交评',
    '停车',
    '出入口',
    '道路开口',
    '交通组织',
    '交通接驳',
  ],
  health_acceptance: [
    'health',
    'disease control',
    'public health',
    'occupational health',
    'hospital',
    'school',
    '卫生',
    '疾控',
    '公共卫生',
    '职业卫生',
    '医院',
    '学校',
    '医疗',
  ],
  national_security_acceptance: [
    'security',
    'classified',
    'national security',
    '国家安全',
    '国安',
    '涉密',
    '安全事项',
    '保护区',
  ],
  public_assembly_fire_safety_check: [
    'public assembly',
    'pre-opening fire safety',
    'mall',
    'hotel',
    'cinema',
    'theater',
    '公众聚集场所',
    '商业综合体',
    '商场',
    '酒店',
    '宾馆',
    '影剧院',
    '营业前',
    '消防安全检查',
  ],
}

function resolveBusinessProfile(project: Record<string, unknown> | null): {
  profile: AcceptanceTemplateBusinessProfile
  source: AcceptanceTemplatePreviewBusinessProfile['source']
} {
  const metadata = readProjectMetadata(project)
  const facts = readProjectGenerationFacts(project)
  const features = readProjectFeatures(project)
  const candidates = [
    { value: facts.businessType ?? facts.business_type ?? facts.businessTypeCode ?? facts.business_type_code, source: 'project_generation_facts' as const },
    { value: facts.businessSubtype ?? facts.business_subtype ?? facts.businessSubtypeCode ?? facts.business_subtype_code, source: 'project_generation_facts' as const },
    { value: metadata.businessType ?? metadata.business_type ?? metadata.businessTypeCode ?? metadata.business_type_code, source: 'project_metadata' as const },
    { value: metadata.businessSubtype ?? metadata.business_subtype ?? metadata.businessSubtypeCode ?? metadata.business_subtype_code, source: 'project_metadata' as const },
    { value: features.businessType ?? features.business_type ?? features.businessTypeCode ?? features.business_type_code, source: 'project_metadata' as const },
    { value: features.businessSubtype ?? features.business_subtype ?? features.businessSubtypeCode ?? features.business_subtype_code, source: 'project_metadata' as const },
    { value: project?.business_type ?? project?.businessType ?? project?.project_type ?? project?.projectType, source: 'project_field' as const },
  ]

  for (const candidate of candidates) {
    const values = readStringArray(candidate.value)
    for (const value of values) {
      const normalizedValue = normalizeSearchText(value)
      const matched = ACCEPTANCE_TIMELINE_TEMPLATE_SEED.businessProfiles.find((profile) =>
        normalizeSearchText(profile.businessTypeCode) === normalizedValue
        || profile.aliases.some((alias) => normalizeSearchText(alias) === normalizedValue),
      )
      if (matched) return { profile: matched, source: candidate.source }
    }
  }

  const fallback = ACCEPTANCE_TIMELINE_TEMPLATE_SEED.businessProfiles
    .find((profile) => profile.businessTypeCode === 'general_civil')
    ?? ACCEPTANCE_TIMELINE_TEMPLATE_SEED.businessProfiles[0]!
  return { profile: fallback, source: 'default' }
}

function mergeProfileStrings(base: string[], ...additions: Array<string[] | undefined>) {
  return uniqueStrings([...base, ...additions.flatMap((values) => values ?? [])])
}

function businessProfileHasItem(profile: AcceptanceTemplateBusinessProfile, itemCode: string) {
  return profile.defaultItemCodes.includes(itemCode) || profile.optionalItemCodes.includes(itemCode)
}

function isRegionAdditionalItemEnabledByProjectFacts(
  itemCode: string,
  businessProfile: AcceptanceTemplateBusinessProfile,
  projectFeatureSearchValue: string,
) {
  const triggerKeywords = CONDITION_GATED_REGION_ADDITIONAL_ITEMS[itemCode]
  if (!triggerKeywords) return true
  if (businessProfile.defaultItemCodes.includes(itemCode)) return true
  return includesAny(projectFeatureSearchValue, triggerKeywords)
}

async function loadProjectFacts(projectId: string) {
  const [project, plans, catalogs, dependencies, requirements] = await Promise.all([
    executeSQLOne('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]),
    executeSQL<AcceptancePlan>('SELECT * FROM acceptance_plans WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
    executeSQL<AcceptanceCatalog>('SELECT * FROM acceptance_catalog WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
    executeSQL<AcceptanceDependency>('SELECT * FROM acceptance_dependencies WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
    executeSQL<AcceptanceRequirement>('SELECT * FROM acceptance_requirements WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
  ])
  return {
    project: project as Record<string, unknown> | null,
    plans: plans || [],
    catalogs: catalogs || [],
    dependencies: dependencies || [],
    requirements: requirements || [],
  }
}

function shouldIncludeItem(
  item: AcceptanceTemplateItemSeed,
  industryCodes: AcceptanceTemplateIndustryCode[],
  regionProfile: AcceptanceTemplateRegionProfile,
  businessProfile: AcceptanceTemplateBusinessProfile,
  projectFeatureSearchValue: string,
) {
  const industrySet = new Set(industryCodes)
  if (item.defaultIndustryCodes.some((code) => industrySet.has(code))) return true
  if (
    regionProfile.additionalItemCodes.includes(item.itemCode) &&
    isRegionAdditionalItemEnabledByProjectFacts(item.itemCode, businessProfile, projectFeatureSearchValue)
  ) return true
  if (businessProfile.defaultItemCodes.includes(item.itemCode)) return true
  const matchesTrigger = Boolean(item.triggerKeywords?.length && includesAny(projectFeatureSearchValue, item.triggerKeywords))
  if (!matchesTrigger) return false
  if (!item.optionalIndustryCodes?.length && !regionProfile.optionalItemCodes.includes(item.itemCode)) return true
  if (regionProfile.optionalItemCodes.includes(item.itemCode)) return true
  if (businessProfile.optionalItemCodes.includes(item.itemCode)) return true
  return item.optionalIndustryCodes.some((code) => industrySet.has(code))
}

function buildApplicabilityConditionPreview(
  project: Record<string, unknown> | null,
  industryCodes: AcceptanceTemplateIndustryCode[],
  regionProfile: AcceptanceTemplateRegionProfile,
  businessProfile: AcceptanceTemplateBusinessProfile,
  projectFeatureSearchValue: string,
): AcceptanceTemplateApplicabilityConditionPreview[] {
  const confirmedCodes = readConfirmedConditionCodes(project)
  const industrySet = new Set(industryCodes)
  const itemByCode = new Map(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.itemPool.map((item) => [item.itemCode, item]))

  return ACCEPTANCE_TIMELINE_TEMPLATE_SEED.applicabilityConditions
    .flatMap((condition): AcceptanceTemplateApplicabilityConditionPreview[] => {
      const affectedItemCodes = condition.affectedItemCodes.filter((itemCode) => itemByCode.has(itemCode))
      if (!affectedItemCodes.length) return []

      const matchesIndustry = condition.applicableIndustryCodes.includes('general_building')
        || condition.applicableIndustryCodes.some((code) => industrySet.has(code))
      const regionAdditional = affectedItemCodes.some((itemCode) =>
        regionProfile.additionalItemCodes.includes(itemCode) &&
        isRegionAdditionalItemEnabledByProjectFacts(itemCode, businessProfile, projectFeatureSearchValue),
      )
      const regionOptional = affectedItemCodes.some((itemCode) => regionProfile.optionalItemCodes.includes(itemCode))
      const businessDefault = businessProfile.defaultConditionCodes.includes(condition.conditionCode)
        || affectedItemCodes.some((itemCode) => businessProfile.defaultItemCodes.includes(itemCode))
      const businessOptional = affectedItemCodes.some((itemCode) => businessProfile.optionalItemCodes.includes(itemCode))
      const projectFeatureMatched = includesAny(projectFeatureSearchValue, condition.triggerKeywords)
      const confirmed = confirmedCodes.has(normalizeSearchText(condition.conditionCode))
      const shouldExpose = regionAdditional || regionOptional || businessDefault || businessOptional || projectFeatureMatched || confirmed || matchesIndustry
      if (!shouldExpose) return []

      const selected = regionAdditional || businessDefault || projectFeatureMatched || confirmed
      const source: AcceptanceTemplateApplicabilityConditionSource = confirmed
        ? 'acceptance_page_confirmation'
        : businessDefault
          ? 'business_profile'
          : projectFeatureMatched
            ? 'project_feature_trigger'
            : regionAdditional
              ? 'region_profile'
              : 'candidate'

      return [{
        conditionCode: condition.conditionCode,
        conditionName: condition.conditionName,
        description: condition.description,
        groupCode: condition.groupCode,
        groupName: condition.groupName,
        affectedItemCodes,
        triggerKeywords: [...condition.triggerKeywords],
        applicableIndustryCodes: [...condition.applicableIndustryCodes],
        selected,
        suggested: selected,
        confirmationRequired: !selected,
        source,
        confirmationQuestion: condition.confirmationQuestion,
        sourcePolicyHint: condition.sourcePolicyHint,
      }]
    })
}

function buildSelectedApplicabilitySearchText(conditions: AcceptanceTemplateApplicabilityConditionPreview[]) {
  return conditions
    .filter((condition) => condition.selected)
    .flatMap((condition) => [
      condition.conditionCode,
      condition.conditionName,
      ...condition.triggerKeywords,
    ])
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')
}

function existingPlanKey(plan: AcceptancePlan) {
  return normalizeSearchText(plan.type_id ?? plan.acceptance_type ?? plan.acceptance_name ?? plan.plan_name)
}

function buildItemPreview(
  existingPlans: AcceptancePlan[],
  industryCodes: AcceptanceTemplateIndustryCode[],
  regionProfile: AcceptanceTemplateRegionProfile,
  businessProfile: AcceptanceTemplateBusinessProfile,
  projectFeatureSearchValue: string,
) {
  const existingByType = new Map(
    existingPlans.map((plan) => [existingPlanKey(plan), plan] as const).filter(([key]) => Boolean(key)),
  )
  const itemByCanonical = new Map<string, AcceptanceTemplatePreviewItem>()

  for (const item of ACCEPTANCE_TIMELINE_TEMPLATE_SEED.itemPool) {
    if (!shouldIncludeItem(item, industryCodes, regionProfile, businessProfile, projectFeatureSearchValue)) continue
    const canonicalKey = normalizeSearchText(item.canonicalType)
    if (itemByCanonical.has(canonicalKey)) continue
    const existing = existingByType.get(canonicalKey) ?? existingByType.get(normalizeSearchText(item.itemName))
    const handlingModes = mergeProfileStrings(
      item.handlingModes,
      regionProfile.handlingModeOverrides?.[item.itemCode],
      businessProfile.handlingModeAdditions?.[item.itemCode],
    )
    const resultDocuments = mergeProfileStrings(
      item.resultDocuments,
      regionProfile.resultDocumentOverrides?.[item.itemCode],
      businessProfile.resultDocumentAdditions?.[item.itemCode],
    )
    const authority = businessProfile.authorityOverrides?.[item.itemCode]
      ?? regionProfile.authorityOverrides?.[item.itemCode]
      ?? item.authority
    const materialNames = mergeProfileStrings(item.materialNames, businessProfile.materialAdditions?.[item.itemCode])
    const sourceIndustryCodes = [...new Set([
      ...item.defaultIndustryCodes.filter((code) => industryCodes.includes(code)),
      ...(item.optionalIndustryCodes ?? []).filter((code) => industryCodes.includes(code)),
      ...businessProfile.industryCodes.filter((code) => industryCodes.includes(code)),
      ...(businessProfileHasItem(businessProfile, item.itemCode) ? businessProfile.industryCodes : []),
      ...(regionProfile.additionalItemCodes.includes(item.itemCode) ? ['general_building' as const] : []),
    ])]

    itemByCanonical.set(canonicalKey, {
      itemCode: item.itemCode,
      canonicalType: item.canonicalType,
      itemName: item.itemName,
      regionalDisplayName: item.regionalDisplayName ?? null,
      phaseCode: item.phaseCode,
      phaseOrder: item.phaseOrder,
      sortOrder: item.sortOrder,
      scopeLevel: item.scopeLevel,
      typeColor: item.typeColor,
      authority,
      responsibleUnit: item.responsibleUnit,
      description: item.description,
      resultDocuments: [...resultDocuments],
      handlingModes: [...handlingModes],
      materialNames,
      prerequisiteNames: [...item.prerequisiteNames],
      sourceCategories: [...item.sourceCategories],
      sourceIndustryCodes,
      action: existing ? 'will_skip_existing' : 'will_create',
      selected: !existing,
      existingPlanId: existing?.id ?? null,
    })
  }

  return [...itemByCanonical.values()].sort((left, right) => left.sortOrder - right.sortOrder)
}

function buildDependencyPreview(items: AcceptanceTemplatePreviewItem[], existingDependencies: AcceptanceDependency[]): AcceptanceTemplatePreviewDependency[] {
  const itemCodes = new Set(items.map((item) => item.itemCode))
  const existingKeys = new Set(existingDependencies.map((dependency) => [
    dependency.source_plan_id,
    dependency.target_plan_id,
    dependency.dependency_kind,
  ].map(normalizeText).join(':')))
  return ACCEPTANCE_TIMELINE_TEMPLATE_SEED.dependencies
    .filter((dependency) => itemCodes.has(dependency.sourceItemCode) && itemCodes.has(dependency.targetItemCode))
    .map((dependency) => {
      const syntheticKey = [dependency.sourceItemCode, dependency.targetItemCode, dependency.dependencyKind].join(':')
      const action: AcceptanceTemplatePreviewAction = existingKeys.has(syntheticKey) ? 'will_skip_existing' : 'will_create'
      return {
        dependencyCode: dependency.dependencyCode,
        sourceItemCode: dependency.sourceItemCode,
        targetItemCode: dependency.targetItemCode,
        dependencyKind: dependency.dependencyKind,
        reason: dependency.reason,
        action,
        selected: action === 'will_create',
      }
    })
}

function buildRequirementPreview(items: AcceptanceTemplatePreviewItem[], existingRequirements: AcceptanceRequirement[]): AcceptanceTemplatePreviewRequirement[] {
  const existingKeys = new Set(existingRequirements.map((requirement) => normalizeSearchText(requirement.source_entity_id)))
  const itemSeedByCode = new Map(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.itemPool.map((item) => [item.itemCode, item]))
  return items.flatMap((item) => {
    const seed = itemSeedByCode.get(item.itemCode)
    if (!seed) return []
    const materialRequirements = seed.requirementSeeds.map((requirement) => ({
      ...requirement,
      itemCode: item.itemCode,
    }))
    const resultRequirements = item.resultDocuments.map((documentName, index) => ({
      requirementCode: `${item.itemCode.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-RESULT-${String(index + 1).padStart(2, '0')}`,
      itemCode: item.itemCode,
      requirementType: 'result_document',
      sourceEntityType: 'template_result_document',
      sourceEntityId: `${item.itemCode}:result:${index + 1}`,
      description: documentName,
    }))
    return [...materialRequirements, ...resultRequirements].map((requirement) => {
      const action: AcceptanceTemplatePreviewAction = existingKeys.has(normalizeSearchText(requirement.sourceEntityId))
        ? 'will_skip_existing'
        : 'will_create'
      return {
        ...requirement,
        action,
        selected: action === 'will_create',
      }
    })
  })
}

function summarizePreview(
  items: AcceptanceTemplatePreviewItem[],
  dependencies: AcceptanceTemplatePreviewDependency[],
  requirements: AcceptanceTemplatePreviewRequirement[],
) {
  const all = [...items, ...dependencies, ...requirements]
  return {
    itemCreateCount: items.filter((item) => item.action === 'will_create').length,
    dependencyCreateCount: dependencies.filter((dependency) => dependency.action === 'will_create').length,
    requirementCreateCount: requirements.filter((requirement) => requirement.action === 'will_create').length,
    skippedExistingCount: all.filter((entry) => entry.action === 'will_skip_existing').length,
  }
}

export async function buildAcceptanceTemplatePreview(projectId: string): Promise<AcceptanceTemplatePreview> {
  const template = getTemplate(GENERAL_ACCEPTANCE_TEMPLATE_CODE)
  const facts = await loadProjectFacts(projectId)
  const latestAutoPublishRun = await resolveLatestAcceptancePolicyAutoPublishRun()
  const { profile: baseProfile, source } = resolveRegionProfile(facts.project)
  const { profile, profileVersion } = toRuntimeRegionProfile(baseProfile, latestAutoPublishRun)
  const { profile: businessProfile, source: businessProfileSource } = resolveBusinessProfile(facts.project)
  const industryCodes = uniqueStrings([
    ...resolveIndustryCodes(facts.project),
    ...businessProfile.industryCodes,
  ]) as AcceptanceTemplateIndustryCode[]
  const projectFeatureSearchValue = buildProjectFeatureSearchValue(facts.project)
  const applicabilityConditions = buildApplicabilityConditionPreview(facts.project, industryCodes, profile, businessProfile, projectFeatureSearchValue)
  const effectiveProjectFeatureSearchValue = [
    projectFeatureSearchValue,
    businessProfile.businessTypeCode,
    businessProfile.businessTypeName,
    ...businessProfile.aliases,
    ...businessProfile.defaultConditionCodes,
    buildSelectedApplicabilitySearchText(applicabilityConditions),
  ].filter(Boolean).join(' ')
  const items = buildItemPreview(facts.plans, industryCodes, profile, businessProfile, effectiveProjectFeatureSearchValue)
  const dependencies = buildDependencyPreview(items, facts.dependencies)
  const requirements = buildRequirementPreview(items, facts.requirements)

  return {
    templateCode: template.templateCode,
    templateName: template.templateName,
    seedVersion: template.seedVersion,
    projectId,
    summary: summarizePreview(items, dependencies, requirements),
    deliveryGoal: {
      targetName: profile.deliveryTargetName,
      explanation: '系统按竣工交付目标倒推需要取得的验收结果文件，再落成验收时间轴事项。',
    },
    regionProfile: {
      provinceCode: profile.provinceCode,
      provinceName: profile.provinceName,
      cityCode: profile.cityCode,
      cityName: profile.cityName,
      profileVersion,
      source,
      deliveryTargetName: profile.deliveryTargetName,
      updateMode: profile.updateMode,
      policySources: profile.policySources,
    },
    businessProfile: {
      businessTypeCode: businessProfile.businessTypeCode,
      businessTypeName: businessProfile.businessTypeName,
      source: businessProfileSource,
      industryCodes: [...businessProfile.industryCodes],
      defaultItemCodes: [...businessProfile.defaultItemCodes],
      optionalItemCodes: [...businessProfile.optionalItemCodes],
      defaultConditionCodes: [...businessProfile.defaultConditionCodes],
      sourcePolicyHints: [...businessProfile.sourcePolicyHints],
    },
    industryProfile: {
      codes: industryCodes,
      labels: industryCodes.map((code) => INDUSTRY_LABELS[code]),
    },
    applicabilityConditions,
    items,
    dependencies,
    requirements,
    warnings: [
      {
        code: 'ACCEPTANCE_TEMPLATE_MAIN_PAGE_UNCHANGED',
        message: '模板只预制竣工交付验收事项；主页面仍使用现有流程板、台账和详情抽屉。',
        severity: 'info',
      },
    ],
  }
}

function assertSelectionKnown<T extends Record<K, unknown>, K extends keyof T>(
  selected: string[],
  all: T[],
  key: K,
  code: string,
) {
  const available = new Set(all.map((item) => normalizeText(item[key])))
  const unknown = selected.filter((item) => !available.has(normalizeText(item)))
  if (unknown.length > 0) {
    throw new AcceptanceTemplateError('ACCEPTANCE_TEMPLATE_INVALID_SELECTION', `${code} 包含无效选择`, 422, { unknown })
  }
}

function selectedSet(values: string[]) {
  return new Set(values.map(normalizeText).filter(Boolean))
}

function toSkipped(preview: AcceptanceTemplatePreview): ApplyAcceptanceTemplateResult['skippedExisting'] {
  return [
    ...preview.items.filter((item) => item.action === 'will_skip_existing').map((item) => ({
      entityType: 'item' as const,
      key: item.itemCode,
      reason: '项目已存在同 canonical 验收事项，系统模板不会重复创建。',
    })),
    ...preview.dependencies.filter((dependency) => dependency.action === 'will_skip_existing').map((dependency) => ({
      entityType: 'dependency' as const,
      key: dependency.dependencyCode,
      reason: '依赖关系已存在或端点未进入本次创建范围。',
    })),
    ...preview.requirements.filter((requirement) => requirement.action === 'will_skip_existing').map((requirement) => ({
      entityType: 'requirement' as const,
      key: requirement.requirementCode,
      reason: '前置资料或结果文件要求已存在。',
    })),
  ]
}

export async function applyAcceptanceTemplate(
  projectId: string,
  request: ApplyAcceptanceTemplateRequest,
  actorUserId?: string | null,
): Promise<ApplyAcceptanceTemplateResult> {
  assertApplyRequest(request)
  const preview = await buildAcceptanceTemplatePreview(projectId)
  assertSelectionKnown(request.selectedItemCodes, preview.items, 'itemCode', 'selectedItemCodes')
  assertSelectionKnown(request.selectedDependencyCodes, preview.dependencies, 'dependencyCode', 'selectedDependencyCodes')
  assertSelectionKnown(request.selectedRequirementCodes, preview.requirements, 'requirementCode', 'selectedRequirementCodes')

  const itemCodes = selectedSet(request.selectedItemCodes)
  const dependencyCodes = selectedSet(request.selectedDependencyCodes)
  const requirementCodes = selectedSet(request.selectedRequirementCodes)
  const selectedItems = preview.items.filter((item) => itemCodes.has(item.itemCode) && item.action === 'will_create')
  const selectedDependencies = preview.dependencies.filter((dependency) => dependencyCodes.has(dependency.dependencyCode) && dependency.action === 'will_create')
  const selectedRequirements = preview.requirements.filter((requirement) => requirementCodes.has(requirement.requirementCode) && requirement.action === 'will_create')
  const createdCatalogIds: string[] = []
  const createdPlanIds: string[] = []
  const createdDependencyIds: string[] = []
  const createdRequirementIds: string[] = []
  const planIdsByItemCode = new Map<string, string>()
  const now = normalizeDateTimeForSql()
  const client = await getClient()

  try {
    await client.query('BEGIN')

    const participantUnitResult = await client.query<{
      id: string
      unit_name: string | null
      unit_type: string | null
    }>(
      `SELECT id, unit_name, unit_type
       FROM participant_units
       WHERE project_id = $1
         AND COALESCE(unit_status, 'active') = 'active'
       ORDER BY created_at, id`,
      [projectId],
    )
    const participantUnitIdByLabel = new Map<string, string>()
    for (const unit of participantUnitResult.rows) {
      for (const label of [unit.unit_name, unit.unit_type]) {
        const key = normalizeText(label).toLowerCase()
        if (key && !participantUnitIdByLabel.has(key)) {
          participantUnitIdByLabel.set(key, unit.id)
        }
      }
    }

    for (const item of selectedItems) {
      const catalog = await insertRowReturning<AcceptanceCatalog>(client, 'acceptance_catalog', {
        id: uuidv4(),
        project_id: projectId,
        catalog_code: item.canonicalType,
        catalog_name: item.itemName,
        phase_code: item.phaseCode,
        scope_level: item.scopeLevel,
        planned_finish_date: null,
        description: item.description,
        is_system: true,
        created_at: now,
        updated_at: now,
      })
      createdCatalogIds.push(catalog.id)

      const plan = await insertRowReturning<AcceptancePlan>(client, 'acceptance_plans', {
        id: uuidv4(),
        project_id: projectId,
        catalog_id: catalog.id,
        type_id: item.canonicalType,
        type_name: item.itemName,
        type_color: item.typeColor,
        acceptance_type: item.canonicalType,
        acceptance_name: item.itemName,
        plan_name: item.itemName,
        description: [
          item.description,
          `结果文件：${item.resultDocuments.join('、')}`,
          `资料门槛：${item.materialNames.join('、')}`,
        ].join('\n'),
        planned_date: null,
        actual_date: null,
        status: 'draft',
        phase: item.phaseCode,
        phase_code: item.phaseCode,
        phase_order: item.phaseOrder,
        sort_order: item.sortOrder,
        scope_level: item.scopeLevel,
        participant_unit_id: participantUnitIdByLabel.get(normalizeText(item.responsibleUnit).toLowerCase()) ?? null,
        parallel_group_id: null,
        predecessor_plan_ids: [],
        successor_plan_ids: [],
        display_badges: ['模板生成'],
        overlay_tags: [],
        is_custom: false,
        responsible_user_id: null,
        inspection_authority: item.authority,
        documents: item.resultDocuments.map((name, index) => ({
          id: `${item.itemCode}-result-${index + 1}`,
          name,
          url: '',
          uploaded_at: '',
        })),
        notes: `system_template:${preview.templateCode}@${preview.seedVersion};delivery_goal:${preview.deliveryGoal.targetName}`,
        created_at: now,
        updated_at: now,
      })
      createdPlanIds.push(plan.id)
      planIdsByItemCode.set(item.itemCode, plan.id)
    }

    for (const dependency of selectedDependencies) {
      const sourcePlanId = planIdsByItemCode.get(dependency.sourceItemCode)
      const targetPlanId = planIdsByItemCode.get(dependency.targetItemCode)
      if (!sourcePlanId || !targetPlanId) continue
      const row = await insertRowReturning<AcceptanceDependency>(client, 'acceptance_dependencies', {
        id: uuidv4(),
        project_id: projectId,
        source_plan_id: sourcePlanId,
        target_plan_id: targetPlanId,
        dependency_kind: dependency.dependencyKind,
        status: 'active',
        created_at: now,
        updated_at: now,
      })
      createdDependencyIds.push(row.id)
    }

    for (const requirement of selectedRequirements) {
      const planId = planIdsByItemCode.get(requirement.itemCode)
      if (!planId) continue
      const row = await insertRowReturning<AcceptanceRequirement>(client, 'acceptance_requirements', {
        id: uuidv4(),
        project_id: projectId,
        plan_id: planId,
        requirement_type: requirement.requirementType,
        source_entity_type: requirement.sourceEntityType,
        source_entity_id: requirement.sourceEntityId,
        drawing_package_id: null,
        description: requirement.description,
        status: 'open',
        is_required: true,
        is_satisfied: false,
        created_at: now,
        updated_at: now,
      })
      createdRequirementIds.push(row.id)
    }

    await client.query('COMMIT')
    clearAcceptanceFlowSnapshotCache(projectId)

    return {
      templateCode: preview.templateCode,
      seedVersion: preview.seedVersion,
      projectId,
      createdCatalogIds,
      createdPlanIds,
      createdDependencyIds,
      createdRequirementIds,
      skippedExisting: toSkipped(preview),
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export { ACCEPTANCE_TEMPLATE_SEED_VERSION, GENERAL_ACCEPTANCE_TEMPLATE_CODE }
