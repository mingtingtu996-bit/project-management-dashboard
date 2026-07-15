import type { CertificateStage, CertificateStatus, KnownCertificateType } from '../types/db.js'

export const GENERAL_CERTIFICATE_TEMPLATE_CODE = 'general_construction_v1'
export const CERTIFICATE_TEMPLATE_SEED_VERSION = 'v1.4.22.2'

export type CertificateTemplateScope =
  | 'general_construction'
  | 'residential'
  | 'commercial'
  | 'public_building'
  | 'hospital'
  | 'school'
  | 'industrial'
  | 'renovation'

export type CertificateTemplatePolicy = 'required' | 'recommended' | 'conditional'
export type LandAcquisitionMethodCode = 'transfer' | 'allocation' | 'existing_land' | 'redevelopment'

function uniqueSeedStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

export interface CertificateTemplateCondition {
  field:
    | 'projectTypeCode'
    | 'businessSubtype'
    | 'functionalUsage'
    | 'projectFeature'
    | 'scopeObjectType'
    | 'hasResidentialSale'
    | 'hasBasement'
    | 'hasCivilDefense'
    | 'hasFireReview'
    | 'requiresConstructionDrawingReview'
  operator: 'equals' | 'includes' | 'exists' | 'not_exists'
  value?: string | boolean
  reason: string
}

export interface CertificateTemplateCertificate {
  certificateType: KnownCertificateType
  certificateName: string
  defaultStage: CertificateStage
  defaultStatus: Extract<CertificateStatus, 'pending' | 'preparing_documents'>
  approvingAuthority: string
  sortOrder: number
  requiredPolicy: CertificateTemplatePolicy
  reason: string
}

export interface CertificateTemplateWorkItem {
  workItemCode: string
  itemName: string
  itemStage: CertificateStage
  defaultStatus: Extract<CertificateStatus, 'pending' | 'preparing_documents'>
  approvingAuthority?: string
  isShared: boolean
  certificateTypes: KnownCertificateType[]
  requiredPolicy: CertificateTemplatePolicy
  planRole:
    | 'document_preparation'
    | 'internal_review'
    | 'external_submission'
    | 'supplement_handling'
    | 'permit_issue'
    | 'startup_gate'
  criticality: 'blocking' | 'important' | 'normal'
  defaultNextAction: string
  sortOrder: number
  appliesWhen?: CertificateTemplateCondition[]
  excludesWhen?: CertificateTemplateCondition[]
  sourceEvidence?: string[]
  landAcquisitionMethodCodes?: LandAcquisitionMethodCode[]
  provinceProfileCodes?: string[]
}

export interface CertificateTemplateLandAcquisitionMethod {
  methodCode: LandAcquisitionMethodCode
  methodName: string
  description: string
  defaultSelected?: boolean
  workItemCodes: string[]
  materialNames: string[]
  policyBasis: string[]
  recommendedFor: string[]
}

export interface CertificateTemplateMaterialPackage {
  packageCode: string
  packageName: string
  packageScope: 'certificate_common'
  certificateTypes: KnownCertificateType[]
  workItemCodes: string[]
  materialNames: string[]
  policyBasis: string[]
  requiredPolicy: CertificateTemplatePolicy
  sortOrder: number
}

export interface CertificateTemplateHandlingStep {
  stepCode: string
  certificateType: KnownCertificateType
  stepName: string
  sourceParties: string[]
  handlingAuthority: string
  submitMaterials: string[]
  outputDocument: string
  satisfiesMaterialCodes: string[]
  satisfiesMaterials: string[]
  reusableForCertificateTypes: KnownCertificateType[]
  blockingLevel: 'certificate_gate' | 'startup_gate' | 'supporting'
  sortOrder: number
}

export interface CertificateTemplateProvincePolicySource {
  sourceName: string
  sourceUrl?: string
  checkedAt: string
  updateMode: 'governed_seed_update'
  policyLevel: 'national' | 'province' | 'city'
}

export interface CertificateTemplateProvinceMaterialOverride {
  landAcquisitionMethodCode: LandAcquisitionMethodCode
  addMaterialNames?: string[]
  replaceMaterialNames?: string[]
  removeMaterialNames?: string[]
  addPolicyBasis?: string[]
  addRecommendedFor?: string[]
}

export interface CertificateTemplateProvinceMaterialPackageOverride {
  materialPackageCode: string
  addMaterialNames?: string[]
  replaceMaterialNames?: string[]
  removeMaterialNames?: string[]
  addPolicyBasis?: string[]
}

export interface CertificateTemplateProvinceProfile {
  provinceCode: string
  provinceName: string
  profileVersion: string
  reviewStatus: 'published' | 'candidate' | 'deprecated'
  policyLevel: 'national' | 'province'
  effectiveFrom: string
  effectiveTo?: string
  lastReviewedAt: string
  nextReviewDueAt: string
  curationMethod: 'governed_seed'
  authorityAliases: Record<string, string>
  additionalWorkItemCodes: string[]
  optionalWorkItemCodes: string[]
  softDependencyCodes: string[]
  materialOverrides: CertificateTemplateProvinceMaterialOverride[]
  materialPackageOverrides: CertificateTemplateProvinceMaterialPackageOverride[]
  policySources: CertificateTemplateProvincePolicySource[]
  notes: string[]
}

export interface CertificateTemplateProvinceRecognitionRule {
  provinceCode: string
  provinceName: string
  aliases: string[]
  profileCode: string
  profileStatus: 'published_profile' | 'recognition_only'
}

export interface CertificateTemplateProvinceProfileQualityGate {
  gateCode: string
  requiredPublicationStatus: 'published'
  requiredPolicyLevel: 'province'
  requiredMaterialPackageCodes: readonly string[]
  minimumAddMaterialNamesPerPackage: number
  minimumPolicyBasisPerPackage: number
  publishPrerequisites: readonly string[]
}

export interface CertificateTemplateProvinceProfileExpansionBatch {
  batchCode: string
  batchName: string
  rolloutOrder: number
  provinceCodes: string[]
  referenceProfileCodes: string[]
  targetProfileStatus: 'candidate'
  profileQualityGateCode: string
  sourceDiscoveryPolicy: string
  promotionPolicy: string
  notes: string[]
}

export type CertificateTemplateLocalOverrideTargetCategory =
  | 'high_frequency_city'
  | 'major_city'

export type CertificateTemplateLocalOverrideSourceType =
  | 'engineering_approval_portal'
  | 'planning_natural_resources'
  | 'housing_construction_permit'
  | 'land_supply_or_transaction'

export interface CertificateTemplateLocalOverrideSourceEvidence {
  sourceType: CertificateTemplateLocalOverrideSourceType
  sourceName: string
  sourceUrl: string
  checkedAt: string
}

export interface CertificateTemplateLocalOverrideQualityGate {
  gateCode: 'local_override_four_certificate_material_depth'
  requiredMaterialPackageCodes: string[]
  minimumAddMaterialNamesPerPackage: number
  publicationPolicy: 'candidate_review_then_seed_publish'
}

export interface CertificateTemplateLocalOverrideExpansionTarget {
  provinceCode: string
  cityCode: string
  cityName: string
  overrideScope: 'city'
  targetCategory: CertificateTemplateLocalOverrideTargetCategory
  rolloutPriority: number
  seedAssetStatus: 'published_seed_asset' | 'candidate_seed_asset' | 'planned_candidate'
  referenceOverrideCodes: string[]
  rationale: string
  sourceDiscoveryKeywords: string[]
}

export interface CertificateTemplateLocalOverrideExpansionBatch {
  batchCode: string
  batchName: string
  rolloutOrder: number
  targetOverrideStatus: 'published' | 'candidate'
  targetCategories: CertificateTemplateLocalOverrideTargetCategory[]
  referenceOverrideCodes: string[]
  localOverrideQualityGateCode: CertificateTemplateLocalOverrideQualityGate['gateCode']
  targets: CertificateTemplateLocalOverrideExpansionTarget[]
  sourceDiscoveryPolicy: string
  promotionPolicy: string
  runtimePreviewPolicy: 'published_override_only'
  notes: string[]
}

export interface CertificateTemplateCityOverride {
  overrideCode: string
  cityCode: string
  cityName: string
  provinceCode: string
  overrideScope: 'city'
  profileVersion: string
  reviewStatus: 'published' | 'candidate' | 'deprecated'
  policyLevel: 'city'
  effectiveFrom: string
  effectiveTo?: string
  lastReviewedAt: string
  nextReviewDueAt: string
  curationMethod: 'governed_seed'
  aliases: string[]
  materialOverrides: CertificateTemplateProvinceMaterialOverride[]
  materialPackageOverrides: CertificateTemplateProvinceMaterialPackageOverride[]
  handlingAuthorityOverrides?: Record<string, string>
  reusableOutputOverrides?: Record<string, string[]>
  policySources: CertificateTemplateProvincePolicySource[]
  governedSourceTypes?: CertificateTemplateLocalOverrideSourceType[]
  governedSourceEvidence?: CertificateTemplateLocalOverrideSourceEvidence[]
  notes: string[]
}

type PublishedCityCertificateOverrideInput = {
  provinceCode: string
  provinceName: string
  cityCode: string
  cityName: string
  aliases?: string[]
  engineeringApprovalUrl: string
  planningNaturalResourcesUrl: string
  housingConstructionUrl: string
  landSupplyUrl: string
}

export interface CertificateTemplateDependency {
  dependencyCode: string
  predecessor:
    | { type: 'certificate'; certificateType: KnownCertificateType }
    | { type: 'work_item'; workItemCode: string }
  successor:
    | { type: 'certificate'; certificateType: KnownCertificateType }
    | { type: 'work_item'; workItemCode: string }
  dependencyKind: 'hard' | 'soft'
  relationRole: 'legal_sequence' | 'document_reuse' | 'startup_gate' | 'recommended_flow'
  reason: string
}

export interface CertificateTemplateSeed {
  templateCode: string
  templateName: string
  seedVersion: string
  sourceVersion: string
  scope: CertificateTemplateScope
  evidenceLevel: 'A' | 'B' | 'C'
  governanceStatus: 'system_default' | 'needs_review'
  appliesWhen: CertificateTemplateCondition[]
  excludesWhen?: CertificateTemplateCondition[]
  certificates: CertificateTemplateCertificate[]
  workItems: CertificateTemplateWorkItem[]
  dependencies: CertificateTemplateDependency[]
  materialPackages: CertificateTemplateMaterialPackage[]
  handlingSteps: CertificateTemplateHandlingStep[]
  landAcquisitionMethods: CertificateTemplateLandAcquisitionMethod[]
  provinceProfiles: CertificateTemplateProvinceProfile[]
  cityOverrides: CertificateTemplateCityOverride[]
}

const STAGE_PREPARE = '资料准备' as CertificateStage
const STAGE_INTERNAL = '内部报审' as CertificateStage
const STAGE_EXTERNAL = '外部报批' as CertificateStage
const STAGE_ISSUE = '批复领证' as CertificateStage

const TRANSFER_LAND_WORK_ITEM_CODES = [
  'CERT-LAND-TRANSFER-CONTRACT',
  'CERT-LAND-TRANSFER-REDLINE',
  'CERT-LAND-TRANSFER-HANDOVER',
  'CERT-LAND-TRANSFER-TAX-PAYMENT',
  'CERT-LAND-TRANSFER-TAX-CERT',
]

const ALLOCATION_LAND_WORK_ITEM_CODES = [
  'CERT-LAND-ALLOCATION-DECISION',
  'CERT-LAND-ALLOCATION-PRESELECTION',
]

const EXISTING_LAND_WORK_ITEM_CODES = [
  'CERT-LAND-EXISTING-OWNERSHIP',
  'CERT-LAND-EXISTING-CHANGE-REGISTRATION',
]

const REDEVELOPMENT_LAND_WORK_ITEM_CODES = [
  'CERT-LAND-REDEVELOPMENT-PLAN',
  'CERT-LAND-REDEVELOPMENT-RIGHTS-CLEARANCE',
]

const COMMON_LAND_CERTIFICATE_PACKAGE_CODES = [
  'CERT-DOC-PROJECT-BASIC',
  'CERT-DOC-PROJECT-FILING',
  'CERT-DOC-LAND-TRANSFER',
  'CERT-DOC-LAND-TAX',
  'CERT-DOC-LAND-HANDOVER',
]

const COMMON_LAND_USE_PLANNING_PACKAGE_CODES = [
  'CERT-DOC-PROJECT-BASIC',
  'CERT-DOC-PROJECT-FILING',
  'CERT-DOC-FEASIBILITY',
  'CERT-DOC-PLANNING-CONDITIONS',
  'CERT-DOC-DESIGN-SCHEME',
]

const COMMON_ENGINEERING_PLANNING_PACKAGE_CODES = [
  'CERT-DOC-PROJECT-BASIC',
  'CERT-DOC-PROJECT-FILING',
  'CERT-DOC-PLANNING-CONDITIONS',
  'CERT-DOC-DESIGN-SCHEME',
  'CERT-DOC-DRAWING-REVIEW',
]

const COMMON_CONSTRUCTION_PERMIT_PACKAGE_CODES = [
  'CERT-DOC-PROJECT-BASIC',
  'CERT-DOC-PROJECT-FILING',
  'CERT-DOC-DRAWING-REVIEW',
  'CERT-DOC-QUALITY-SAFETY',
  'CERT-DOC-CONSTRUCTION-CONTRACT',
  'CERT-DOC-SITE-CONDITIONS',
]

const provinceRecognition = (
  provinceCode: string,
  provinceName: string,
  aliases: string[],
  profileCode = 'default',
): CertificateTemplateProvinceRecognitionRule => ({
  provinceCode,
  provinceName,
  aliases: [provinceCode, provinceName, ...aliases],
  profileCode,
  profileStatus: profileCode === 'default' ? 'recognition_only' : 'published_profile',
})

export const CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES: CertificateTemplateProvinceRecognitionRule[] = [
  provinceRecognition('beijing', '北京市', ['北京', 'beijing'], 'beijing'),
  provinceRecognition('tianjin', '天津市', ['天津', 'tianjin'], 'tianjin'),
  provinceRecognition('hebei', '河北省', ['河北', 'hebei', '石家庄'], 'hebei'),
  provinceRecognition('shanxi', '山西省', ['山西', 'shanxi', '太原'], 'shanxi'),
  provinceRecognition('inner_mongolia', '内蒙古自治区', ['内蒙古', 'inner mongolia', 'inner_mongolia', '呼和浩特'], 'inner_mongolia'),
  provinceRecognition('liaoning', '辽宁省', ['辽宁', 'liaoning', '沈阳', '大连'], 'liaoning'),
  provinceRecognition('jilin', '吉林省', ['吉林', 'jilin', '长春'], 'jilin'),
  provinceRecognition('heilongjiang', '黑龙江省', ['黑龙江', 'heilongjiang', '哈尔滨'], 'heilongjiang'),
  provinceRecognition('shanghai', '上海市', ['上海', 'shanghai'], 'shanghai'),
  provinceRecognition('jiangsu', '江苏省', ['江苏', 'jiangsu', '南京', '苏州', '无锡'], 'jiangsu'),
  provinceRecognition('zhejiang', '浙江省', ['浙江', 'zhejiang', '杭州', '宁波', '温州'], 'zhejiang'),
  provinceRecognition('anhui', '安徽省', ['安徽', 'anhui', '合肥'], 'anhui'),
  provinceRecognition('fujian', '福建省', ['福建', 'fujian', '福州', '厦门', '泉州'], 'fujian'),
  provinceRecognition('jiangxi', '江西省', ['江西', 'jiangxi', '南昌'], 'jiangxi'),
  provinceRecognition('shandong', '山东省', ['山东', 'shandong', '济南', '青岛'], 'shandong'),
  provinceRecognition('henan', '河南省', ['河南', 'henan', '郑州'], 'henan'),
  provinceRecognition('hubei', '湖北省', ['湖北', 'hubei', '武汉'], 'hubei'),
  provinceRecognition('hunan', '湖南省', ['湖南', 'hunan', '长沙'], 'hunan'),
  provinceRecognition('guangdong', '广东省', ['广东', 'guangdong', '广州', '深圳', '珠海'], 'guangdong'),
  provinceRecognition('guangxi', '广西壮族自治区', ['广西', 'guangxi', '南宁', '桂林'], 'guangxi'),
  provinceRecognition('hainan', '海南省', ['海南', 'hainan', '海口', '三亚'], 'hainan'),
  provinceRecognition('chongqing', '重庆市', ['重庆', 'chongqing'], 'chongqing'),
  provinceRecognition('sichuan', '四川省', ['四川', 'sichuan', '成都'], 'sichuan'),
  provinceRecognition('guizhou', '贵州省', ['贵州', 'guizhou', '贵阳'], 'guizhou'),
  provinceRecognition('yunnan', '云南省', ['云南', 'yunnan', '昆明'], 'yunnan'),
  provinceRecognition('tibet', '西藏自治区', ['西藏', 'tibet', '拉萨'], 'tibet'),
  provinceRecognition('shaanxi', '陕西省', ['陕西', '陕', 'shaanxi', '西安'], 'shaanxi'),
  provinceRecognition('gansu', '甘肃省', ['甘肃', 'gansu', '兰州'], 'gansu'),
  provinceRecognition('qinghai', '青海省', ['青海', 'qinghai', '西宁'], 'qinghai'),
  provinceRecognition('ningxia', '宁夏回族自治区', ['宁夏', 'ningxia', '银川'], 'ningxia'),
  provinceRecognition('xinjiang', '新疆维吾尔自治区', ['新疆', 'xinjiang', '乌鲁木齐'], 'xinjiang'),
]

export const CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE: CertificateTemplateProvinceProfileQualityGate = {
  gateCode: 'published_province_four_certificate_depth',
  requiredPublicationStatus: 'published',
  requiredPolicyLevel: 'province',
  requiredMaterialPackageCodes: [
    'PKG-CERT-LAND-COMMON',
    'PKG-CERT-LUP-COMMON',
    'PKG-CERT-EPP-COMMON',
    'PKG-CERT-CP-COMMON',
  ],
  minimumAddMaterialNamesPerPackage: 2,
  minimumPolicyBasisPerPackage: 1,
  publishPrerequisites: [
    'official_policy_source_discovery',
    'four_certificate_material_packages',
    'land_acquisition_method_overlay',
    'governed_review',
    'no_live_page_scrape',
  ],
}

export const CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE: CertificateTemplateLocalOverrideQualityGate = {
  gateCode: 'local_override_four_certificate_material_depth',
  requiredMaterialPackageCodes: [
    'PKG-CERT-LAND-COMMON',
    'PKG-CERT-LUP-COMMON',
    'PKG-CERT-EPP-COMMON',
    'PKG-CERT-CP-COMMON',
  ],
  minimumAddMaterialNamesPerPackage: 2,
  publicationPolicy: 'candidate_review_then_seed_publish',
}

export const CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES: CertificateTemplateProvinceProfileExpansionBatch[] = [
  {
    batchCode: 'province_profile_east_coast_batch_1',
    batchName: '华东沿海与周边扩省批次',
    rolloutOrder: 10,
    provinceCodes: [],
    referenceProfileCodes: ['zhejiang', 'jiangsu'],
    targetProfileStatus: 'candidate',
    profileQualityGateCode: CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.gateCode,
    sourceDiscoveryPolicy: 'official_policy_source_discovery + province_government_or_government_service_portal + no_live_page_scrape',
    promotionPolicy: 'create candidate profile -> apply quality gate -> governed review -> publish as seed published profile',
    notes: ['优先沿用浙江/江苏四证资料包深度样板，先治理省级工改口径，市级窗口清单后续 city override。'],
  },
  {
    batchCode: 'province_profile_north_batch_2',
    batchName: '华北扩省批次',
    rolloutOrder: 20,
    provinceCodes: [],
    referenceProfileCodes: ['jiangsu', 'zhejiang'],
    targetProfileStatus: 'candidate',
    profileQualityGateCode: CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.gateCode,
    sourceDiscoveryPolicy: 'official_policy_source_discovery + province_government_or_government_service_portal + no_live_page_scrape',
    promotionPolicy: 'create candidate profile -> apply quality gate -> governed review -> publish as seed published profile',
    notes: ['直辖市与省级口径并行治理，不把城市级办事指南直接升级为省级 profile。'],
  },
  {
    batchCode: 'province_profile_northeast_batch_3',
    batchName: '东北扩省批次',
    rolloutOrder: 30,
    provinceCodes: [],
    referenceProfileCodes: ['jiangsu', 'zhejiang'],
    targetProfileStatus: 'candidate',
    profileQualityGateCode: CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.gateCode,
    sourceDiscoveryPolicy: 'official_policy_source_discovery + province_government_or_government_service_portal + no_live_page_scrape',
    promotionPolicy: 'create candidate profile -> apply quality gate -> governed review -> publish as seed published profile',
    notes: ['先补省级工改方案和政务服务资料包，再评估重点城市窗口差异。'],
  },
  {
    batchCode: 'province_profile_central_south_batch_4',
    batchName: '中南扩省批次',
    rolloutOrder: 40,
    provinceCodes: [],
    referenceProfileCodes: ['guangdong', 'zhejiang'],
    targetProfileStatus: 'candidate',
    profileQualityGateCode: CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.gateCode,
    sourceDiscoveryPolicy: 'official_policy_source_discovery + province_government_or_government_service_portal + no_live_page_scrape',
    promotionPolicy: 'create candidate profile -> apply quality gate -> governed review -> publish as seed published profile',
    notes: ['沿用广东/浙江资料包结构，重点核查并联审批、联合审图和区域特殊事项是否只进入 optional/soft overlay。'],
  },
  {
    batchCode: 'province_profile_southwest_batch_5',
    batchName: '西南扩省批次',
    rolloutOrder: 50,
    provinceCodes: [],
    referenceProfileCodes: ['guangdong', 'zhejiang'],
    targetProfileStatus: 'candidate',
    profileQualityGateCode: CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.gateCode,
    sourceDiscoveryPolicy: 'official_policy_source_discovery + province_government_or_government_service_portal + no_live_page_scrape',
    promotionPolicy: 'create candidate profile -> apply quality gate -> governed review -> publish as seed published profile',
    notes: ['复杂地形、民族地区或直辖市差异仅作为候选资料，不在未审核前进入 published profile。'],
  },
  {
    batchCode: 'province_profile_northwest_batch_6',
    batchName: '西北扩省批次',
    rolloutOrder: 60,
    provinceCodes: [],
    referenceProfileCodes: ['jiangsu', 'guangdong'],
    targetProfileStatus: 'candidate',
    profileQualityGateCode: CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.gateCode,
    sourceDiscoveryPolicy: 'official_policy_source_discovery + province_government_or_government_service_portal + no_live_page_scrape',
    promotionPolicy: 'create candidate profile -> apply quality gate -> governed review -> publish as seed published profile',
    notes: ['先建立省级通用资料包，再把开发区、高新区或重点城市差异留给 city override。'],
  },
]

const LOCAL_OVERRIDE_REFERENCE_OVERRIDE_CODES = [
  'city_override_guangdong_shenzhen_v14222',
  'city_override_jiangsu_suzhou_v14222',
]

export const CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES: CertificateTemplateLocalOverrideExpansionBatch[] = [
  {
    batchCode: 'local_override_high_value_city_batch_1',
    batchName: 'High-value city local override batch 1',
    rolloutOrder: 10,
    targetOverrideStatus: 'published',
    targetCategories: ['high_frequency_city', 'major_city'],
    referenceOverrideCodes: LOCAL_OVERRIDE_REFERENCE_OVERRIDE_CODES,
    localOverrideQualityGateCode: CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE.gateCode,
    sourceDiscoveryPolicy:
      'official_policy_source_discovery + city_government_service_portal + engineering_approval_portal + no_live_page_scrape',
    promotionPolicy:
      'published local override seed asset -> business preview consumes published override directly',
    runtimePreviewPolicy: 'published_override_only',
    notes: [
      'Use product categories instead of first_tier or second_tier market labels.',
      'Only local material, authority, and land-acquisition differences that cannot be expressed by province profiles enter the override.',
      'First-batch city targets are now published seed assets consumed directly by business preview.',
    ],
    targets: [
      {
        provinceCode: 'beijing',
        cityCode: 'beijing',
        cityName: 'Beijing',
        overrideScope: 'city',
        targetCategory: 'high_frequency_city',
        rolloutPriority: 10,
        seedAssetStatus: 'published_seed_asset',
        referenceOverrideCodes: LOCAL_OVERRIDE_REFERENCE_OVERRIDE_CODES,
        rationale: 'High project frequency and municipality-level approval path require local material and authority verification.',
        sourceDiscoveryKeywords: ['Beijing engineering construction project approval', 'Beijing government service construction permit'],
      },
      {
        provinceCode: 'shanghai',
        cityCode: 'shanghai',
        cityName: 'Shanghai',
        overrideScope: 'city',
        targetCategory: 'high_frequency_city',
        rolloutPriority: 20,
        seedAssetStatus: 'published_seed_asset',
        referenceOverrideCodes: LOCAL_OVERRIDE_REFERENCE_OVERRIDE_CODES,
        rationale: 'Shanghai is handled as a city-level rule; Pudong and other districts are recognition aliases, not separate seed assets.',
        sourceDiscoveryKeywords: ['Shanghai engineering construction approval', 'Shanghai government service construction project'],
      },
      {
        provinceCode: 'guangdong',
        cityCode: 'guangzhou',
        cityName: 'Guangzhou',
        overrideScope: 'city',
        targetCategory: 'high_frequency_city',
        rolloutPriority: 30,
        seedAssetStatus: 'published_seed_asset',
        referenceOverrideCodes: LOCAL_OVERRIDE_REFERENCE_OVERRIDE_CODES,
        rationale: 'Guangzhou shares Guangdong province rules but needs city-level engineering approval and natural-resources material verification.',
        sourceDiscoveryKeywords: ['Guangzhou engineering construction project approval', 'Guangzhou planning natural resources permit'],
      },
      {
        provinceCode: 'zhejiang',
        cityCode: 'hangzhou',
        cityName: 'Hangzhou',
        overrideScope: 'city',
        targetCategory: 'major_city',
        rolloutPriority: 40,
        seedAssetStatus: 'published_seed_asset',
        referenceOverrideCodes: LOCAL_OVERRIDE_REFERENCE_OVERRIDE_CODES,
        rationale: 'Hangzhou is handled as a city-level rule; high-tech zone and Binjiang labels are recognition aliases, not separate seed assets.',
        sourceDiscoveryKeywords: ['Hangzhou engineering construction project approval', 'Zhejiang government service Hangzhou construction permit'],
      },
      {
        provinceCode: 'jiangsu',
        cityCode: 'nanjing',
        cityName: 'Nanjing',
        overrideScope: 'city',
        targetCategory: 'major_city',
        rolloutPriority: 50,
        seedAssetStatus: 'published_seed_asset',
        referenceOverrideCodes: LOCAL_OVERRIDE_REFERENCE_OVERRIDE_CODES,
        rationale: 'Nanjing is a high-frequency Jiangsu city path and should be separated from Suzhou Industrial Park reference materials.',
        sourceDiscoveryKeywords: ['Nanjing engineering construction project approval', 'Jiangsu government service Nanjing construction permit'],
      },
      {
        provinceCode: 'sichuan',
        cityCode: 'chengdu',
        cityName: 'Chengdu',
        overrideScope: 'city',
        targetCategory: 'major_city',
        rolloutPriority: 60,
        seedAssetStatus: 'published_seed_asset',
        referenceOverrideCodes: LOCAL_OVERRIDE_REFERENCE_OVERRIDE_CODES,
        rationale: 'Chengdu should validate western major-city approval portals and local construction-permit package differences.',
        sourceDiscoveryKeywords: ['Chengdu engineering construction project approval', 'Sichuan government service Chengdu construction permit'],
      },
      {
        provinceCode: 'hubei',
        cityCode: 'wuhan',
        cityName: 'Wuhan',
        overrideScope: 'city',
        targetCategory: 'major_city',
        rolloutPriority: 70,
        seedAssetStatus: 'published_seed_asset',
        referenceOverrideCodes: LOCAL_OVERRIDE_REFERENCE_OVERRIDE_CODES,
        rationale: 'Wuhan should validate central-region engineering approval material differences before any runtime preview publication.',
        sourceDiscoveryKeywords: ['Wuhan engineering construction project approval', 'Hubei government service Wuhan construction permit'],
      },
      {
        provinceCode: 'shaanxi',
        cityCode: 'xian',
        cityName: 'Xian',
        overrideScope: 'city',
        targetCategory: 'major_city',
        rolloutPriority: 80,
        seedAssetStatus: 'published_seed_asset',
        referenceOverrideCodes: LOCAL_OVERRIDE_REFERENCE_OVERRIDE_CODES,
        rationale: 'Xian should validate northwest major-city material and authority differences against the published Shaanxi profile.',
        sourceDiscoveryKeywords: ['Xian engineering construction project approval', 'Shaanxi government service Xian construction permit'],
      },
    ],
  },
]

const createFirstExpansionProvinceProfile = ({
  provinceCode,
  provinceName,
  sourceName,
  sourceUrl,
  reviewStatus = 'candidate',
  additionalPolicySources = [],
  publishedNote,
  effectiveFrom = '2026-05-28',
  lastReviewedAt = '2026-05-28',
  nextReviewDueAt = '2026-08-28',
}: {
  provinceCode: string
  provinceName: string
  sourceName: string
  sourceUrl?: string
  reviewStatus?: CertificateTemplateProvinceProfile['reviewStatus']
  additionalPolicySources?: CertificateTemplateProvincePolicySource[]
  publishedNote?: string
  effectiveFrom?: string
  lastReviewedAt?: string
  nextReviewDueAt?: string
}): CertificateTemplateProvinceProfile => ({
  provinceCode,
  provinceName,
  profileVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
  reviewStatus,
  policyLevel: 'province',
  effectiveFrom,
  lastReviewedAt,
  nextReviewDueAt,
  curationMethod: 'governed_seed',
  authorityAliases: {
    naturalResources: `${provinceName}自然资源主管部门`,
    housingConstruction: `${provinceName}住房城乡建设主管部门`,
    approvalWindow: `${provinceName}工程建设项目审批综合窗口`,
  },
  additionalWorkItemCodes: [],
  optionalWorkItemCodes: ['CERT-EPP-PUBLIC-NOTICE', 'CERT-EPP-BLUEPRINT-CHECK'],
  softDependencyCodes: ['DEP-LAND-TO-LUP', 'DEP-BLUEPRINT-CHECK-TO-EPP'],
  materialOverrides: [
    {
      landAcquisitionMethodCode: 'transfer',
      addMaterialNames: [
        `${provinceName}工程建设项目审批管理系统项目代码`,
        `${provinceName}出让取得土地权属链材料候选清单`,
        '土地出让合同、成交确认及价款缴纳凭证',
        '宗地图、界址点成果及交地确认材料',
      ],
      addPolicyBasis: [`${provinceName} candidate profile：出让取得资料包候选补充`],
      addRecommendedFor: [`${provinceName}内通过出让取得土地的建设项目候选资料治理`],
    },
  ],
  materialPackageOverrides: [
    {
      materialPackageCode: 'PKG-CERT-LAND-COMMON',
      addMaterialNames: [
        `${provinceName}工程建设项目审批管理系统项目代码`,
        '土地出让合同、成交确认及价款缴纳凭证',
        '宗地图、界址点成果及交地确认材料',
        '契税、印花税及完税证明材料',
      ],
      addPolicyBasis: [`${provinceName} candidate profile：土地取得及权属链资料包候选补充`],
    },
    {
      materialPackageCode: 'PKG-CERT-LUP-COMMON',
      addMaterialNames: [
        '建设用地规划许可统一申请表',
        '土地取得或权属证明材料',
        '用地红线、宗地图和规划条件附图',
        '立项用地规划许可阶段一套申报材料',
      ],
      addPolicyBasis: [`${provinceName} candidate profile：立项用地规划许可阶段资料包候选补充`],
    },
    {
      materialPackageCode: 'PKG-CERT-EPP-COMMON',
      addMaterialNames: [
        '建设工程设计方案文本及总平面图',
        '蓝图、定位图及规划技术审查材料',
        '方案公示、专家论证或部门意见材料',
        '工程建设许可阶段一套申报材料',
      ],
      addPolicyBasis: [`${provinceName} candidate profile：工程建设许可阶段资料包候选补充`],
    },
    {
      materialPackageCode: 'PKG-CERT-CP-COMMON',
      addMaterialNames: [
        '施工图联合审查合格资料',
        '质量安全监督登记和实名制管理材料',
        '施工、监理等参建单位合同及中标资料',
        '施工现场具备开工条件承诺或核验材料',
      ],
      addPolicyBasis: [`${provinceName} candidate profile：施工许可阶段资料包候选补充`],
    },
  ],
  policySources: [
    {
      sourceName,
      ...(sourceUrl ? { sourceUrl } : {}),
      checkedAt: lastReviewedAt,
      updateMode: 'governed_seed_update',
      policyLevel: 'province',
    },
    ...additionalPolicySources,
  ],
  notes: reviewStatus === 'published'
    ? [
        publishedNote ?? `${provinceName} first expansion published profile; applied by business preview after governed review and source verification.`,
        `${provinceName} profile 已补齐四证资料包深度样板，覆盖土地取得及权属链、用地规划、工程规划和施工许可四个通用资料包。`,
        'Published material package follows the Guangdong/Jiangsu/Zhejiang four-certificate depth structure; city service-item differences remain future city override scope.',
      ]
    : [
        `${provinceName} candidate profile for first expansion batch; not applied by business preview until governed review and seed publication.`,
        'Candidate material package follows the published Guangdong/Jiangsu/Zhejiang four-certificate depth structure; official service-item package and city overrides require governed review before publication.',
        'Official direct province source URL is attached only when the source has been verified through the governed seed review path.',
      ],
})

const FIRST_EXPANSION_CANDIDATE_PROVINCE_PROFILES: CertificateTemplateProvinceProfile[] = [
  createFirstExpansionProvinceProfile({
    provinceCode: 'shanghai',
    provinceName: '上海市',
    sourceName: '上海市工程建设项目审批制度改革试点实施方案',
    sourceUrl: 'https://www.shanghai.gov.cn/nw12344/20200813/0001-12344_56802.html',
    reviewStatus: 'published',
    additionalPolicySources: [
      {
        sourceName: '上海市全面深化工程建设项目审批制度改革持续优化营商环境工作方案',
        sourceUrl: 'https://www.shanghai.gov.cn/ysszbz2/20230522/09c6f73b5499448caa6c29a3500affc3.html',
        checkedAt: '2026-05-28',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '上海市 first expansion published profile; applies the governed four-certificate material depth after official Shanghai government source verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'anhui',
    provinceName: '安徽省',
    sourceName: '安徽政务服务网工程建设项目审批服务入口治理记录',
    sourceUrl: 'https://www.ahzwfw.gov.cn/',
    reviewStatus: 'published',
    publishedNote: '安徽省 first expansion published profile; applies the governed four-certificate material depth after 安徽省人民政府网稿源 source verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'fujian',
    provinceName: '福建省',
    sourceName: '福建省全面开展工程建设项目审批制度改革实施方案',
    sourceUrl: 'https://www.fujian.gov.cn/zwgk/zfxxgk/szfwj/jgzz/gtzycxjs/201906/t20190618_4902428.htm',
    reviewStatus: 'published',
    publishedNote: '福建省 first expansion published profile; applies the governed four-certificate material depth after official Fujian government source verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'jiangxi',
    provinceName: '江西省',
    sourceName: '关于印发江西省工程建设项目审批各阶段办事指南、申请表单、申报材料清单示范文本的通知（赣工改办〔2020〕22号）',
    sourceUrl: 'https://zjj.nc.gov.cn/nczfbzglj/yhbl/202305/de2d258e896f4b98b5a0c24ec18e31cc.shtml',
    reviewStatus: 'published',
    publishedNote: '江西省 first expansion published profile; applies the governed four-certificate material depth after government department repost of 赣工改办〔2020〕22号 material-list source verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'shandong',
    provinceName: '山东省',
    sourceName: '山东省人民政府关于印发山东省优化提升工程建设项目审批制度改革实施方案的通知（鲁政发〔2019〕9号）',
    sourceUrl: 'https://zwfwzx.jining.gov.cn/art/2019/9/18/art_32803_2034171.html',
    reviewStatus: 'published',
    publishedNote: '山东省 first expansion published profile; applies the governed four-certificate material depth after government department repost of 鲁政发〔2019〕9号 source verification.',
  }),
]

const NORTH_EXPANSION_CANDIDATE_PROVINCE_PROFILES: CertificateTemplateProvinceProfile[] = [
  createFirstExpansionProvinceProfile({
    provinceCode: 'beijing',
    provinceName: '北京市',
    sourceName: '北京市人民政府办公厅关于印发《北京市工程建设项目审批制度改革试点实施方案》的通知（京政办发〔2018〕36号）',
    sourceUrl: 'https://tzxm.beijing.gov.cn/front/article/4679.html',
    reviewStatus: 'published',
    additionalPolicySources: [
      {
        sourceName: '北京市工程建设项目审批事项清单（2024年版）（京工改办〔2024〕2号）',
        sourceUrl: 'https://tzxm.beijing.gov.cn/bjpc/bjpc/article_file/144b287c-54a4-4aad-bfa8-3f8208b1b282.pdf',
        checkedAt: '2026-05-28',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '北京市 north expansion published profile; applies the governed four-certificate material depth after Beijing municipal official source and 2024 approval-item list verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'tianjin',
    provinceName: '天津市',
    sourceName: '天津市人民政府关于印发天津市深化工程建设项目审批制度改革实施方案的通知（津政发〔2019〕25号）',
    sourceUrl: 'https://zwfwb.tj.gov.cn/zwgk/zcwj/sjzcwj/202009/t20200928_3939807.html',
    reviewStatus: 'published',
    additionalPolicySources: [
      {
        sourceName: '关于印发天津市推进工程建设项目审批标准化规范化便利化实施方案的通知',
        sourceUrl: 'https://zfcxjs.tj.gov.cn/sylm/gabsycs/tzgggh/202312/t20231225_6489799.html',
        checkedAt: '2026-05-28',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '天津市 north expansion published profile; applies the governed four-certificate material depth after Tianjin municipal government approval-reform source and 2023 standardization source verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'hebei',
    provinceName: '河北省',
    sourceName: '河北省人民政府办公厅关于印发河北省全面深化工程建设项目审批制度改革实施方案的通知（冀政办字〔2019〕42号）',
    sourceUrl: 'https://www.xiongan.gov.cn/2018-12/04/c_1210008271.htm',
    reviewStatus: 'published',
    additionalPolicySources: [
      {
        sourceName: '河北省人民政府办公厅关于印发河北省深化工程建设项目审批制度改革实施方案的通知',
        sourceUrl: 'https://www.xiongan.gov.cn/2018-12/04/c_1210008271.htm',
        checkedAt: '2026-05-28',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '河北省 north expansion published profile; applies the governed four-certificate material depth after 2019 Hebei province comprehensive approval-reform source and 2018 reform-plan source verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'shanxi',
    provinceName: '山西省',
    sourceName: '山西省人民政府办公厅关于印发山西省进一步优化项目审批流程若干举措的通知',
    sourceUrl: 'https://www.sxgp.gov.cn/xwzx_358/szfwj_1327/202602/t20260202_2316484.shtml',
    reviewStatus: 'published',
    additionalPolicySources: [
      {
        sourceName: '山西省全面推进工程建设项目审批制度改革实施方案（晋政办发〔2019〕32号）',
        sourceUrl: 'https://www.sxgp.gov.cn/xwzx_358/szfwj_1327/202602/t20260202_2316484.shtml',
        checkedAt: '2026-05-28',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '山西省 north expansion published profile; applies the governed four-certificate material depth after Shanxi current approval-flow optimization source and 2019 approval-reform plan evidence verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'inner_mongolia',
    provinceName: '内蒙古自治区',
    sourceName: '内蒙古自治区进一步深化工程建设项目审批制度改革实施方案',
    sourceUrl: 'https://www.qsq.gov.cn/kdyxtz/88919.html',
    reviewStatus: 'published',
    additionalPolicySources: [
      {
        sourceName: '内蒙古政务服务网工程建设项目审批服务入口治理记录',
        sourceUrl: 'https://zwfw.nmg.gov.cn/',
        checkedAt: '2026-05-28',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '内蒙古自治区 north expansion published profile; applies the governed four-certificate material depth after Inner Mongolia approval-reform and engineering project approval platform evidence verification.',
  }),
]

const NORTHEAST_EXPANSION_CANDIDATE_PROVINCE_PROFILES: CertificateTemplateProvinceProfile[] = [
  createFirstExpansionProvinceProfile({
    provinceCode: 'liaoning',
    provinceName: '辽宁省',
    sourceName: '辽宁省人民政府办公厅关于印发辽宁省工程建设项目审批制度改革实施方案的通知（辽政办发〔2019〕18号）',
    sourceUrl: 'https://www.ln.gov.cn/web/zwgkx/zfxxgk1/zc/xzgfxwj/szf/szfbgtwj/2023010517132185514/index.shtml',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-29',
    lastReviewedAt: '2026-05-29',
    nextReviewDueAt: '2026-08-29',
    additionalPolicySources: [
      {
        sourceName: '辽宁省工程建设项目审批服务事项清单（2025年版）',
        sourceUrl: 'https://zjt.ln.gov.cn/zjt/tfwj/lzj/2025063016173026732/2025090409441087488.pdf',
        checkedAt: '2026-05-29',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '辽宁省住房和城乡建设厅关于落实《辽宁省工程建设项目审批制度改革实施方案》的意见（施工许可、竣工验收阶段）',
        sourceUrl: 'https://zjt.ln.gov.cn/zjt/tfwj/lzj/81E3C4117F394F81BE9E944C48913BCE/index.shtml',
        checkedAt: '2026-05-29',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '辽宁省 northeast expansion published profile; applies the governed four-certificate material depth after Liaoning provincial approval-reform, 2025 service-list, and construction-permit stage source verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'jilin',
    provinceName: '吉林省',
    sourceName: '吉林省人民政府办公厅关于印发吉林省全面开展工程建设项目审批制度改革实施方案的通知（吉政办发〔2019〕30号）',
    sourceUrl: 'https://xxgk.jl.gov.cn/szf/gkml/201905/t20190520_5882885.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-29',
    lastReviewedAt: '2026-05-29',
    nextReviewDueAt: '2026-08-29',
    additionalPolicySources: [
      {
        sourceName: '吉林省全面开展工程建设项目审批制度改革实施方案政策解读',
        sourceUrl: 'https://xxgk.jl.gov.cn/szf/zcjd/201910/t20191010_6108161.html',
        checkedAt: '2026-05-29',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '吉林省进一步提升工程建设项目审批服务效能工作方案',
        sourceUrl: 'https://zwfw.jl.gov.cn/jlszwfw/gcjsxmsp/ggzcfg/202504/P020250414560869937333.pdf',
        checkedAt: '2026-05-29',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '吉林省 northeast expansion published profile; applies the governed four-certificate material depth after Jilin provincial approval-reform plan, policy interpretation, and engineering-approval service-efficiency source verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'heilongjiang',
    provinceName: '黑龙江省',
    sourceName: '关于印发《黑龙江省工程建设项目审批服务事项清单（2025年版）》的通知',
    sourceUrl: 'https://zfcxjst.hlj.gov.cn/zfcxjst/c114789/202512/c00_31898827.shtml',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-29',
    lastReviewedAt: '2026-05-29',
    nextReviewDueAt: '2026-08-29',
    additionalPolicySources: [
      {
        sourceName: '黑龙江省人民政府办公厅关于印发黑龙江省工程建设项目审批制度改革实施方案的通知（黑政办规〔2019〕13号）',
        sourceUrl: 'https://www.hlj.gov.cn/hlj/c108376/201904/c00_30665438.shtml',
        checkedAt: '2026-05-29',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '黑龙江省住房和城乡建设厅关于做好数字化施工图审查系统应用工作的通知',
        sourceUrl: 'https://zfcxjst.hlj.gov.cn/zfcxjst/c114765/202505/c00_31838586.shtml',
        checkedAt: '2026-05-29',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '黑龙江省 northeast expansion published profile; applies the governed four-certificate material depth after Heilongjiang 2025 approval-service item list, 2019 approval-reform plan, and digital drawing-review source verification.',
  }),
]

const CENTRAL_SOUTH_EXPANSION_CANDIDATE_PROVINCE_PROFILES: CertificateTemplateProvinceProfile[] = [
  createFirstExpansionProvinceProfile({
    provinceCode: 'henan',
    provinceName: '河南省',
    sourceName: '河南省全面推进工程建设项目审批制度改革实施方案（豫政办〔2019〕38号）',
    sourceUrl: 'https://www.henan.gov.cn/2019/06-24/841450.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '河南省自然资源厅关于推进规划用地“多审合一、多证合一”改革有关工作的通知',
        sourceUrl: 'https://dnr.henan.gov.cn/2019/12-09/1855559.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '河南省建筑市场监管公共服务平台施工许可证电子证照治理记录',
        sourceUrl: 'https://hngcjs.hnjs.henan.gov.cn/electronic/electronicInfo',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '河南省 central-south expansion published profile; applies the governed four-certificate material depth after Henan approval-reform, planning-land multi-review, and construction-permit stage source discovery.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'hubei',
    provinceName: '湖北省',
    sourceName: '省人民政府办公厅关于印发湖北省工程建设项目审批制度改革实施方案的通知（鄂政办发〔2019〕44号）',
    sourceUrl: 'https://zrzyt.hubei.gov.cn/fbjd/zc/qtzdgkwj/201911/t20191115_826990.shtml',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '湖北省自然资源厅推进规划用地“多审合一、多证合一”改革解读',
        sourceUrl: 'https://zrzyt.hubei.gov.cn/fbjd/zc/zcjd/202003/t20200303_2172514.shtml',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '湖北省施工图联合审查与施工许可阶段治理复核记录',
        sourceUrl: 'https://zjt.hubei.gov.cn/',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '湖北省 central-south expansion published profile; applies the governed four-certificate material depth after Hubei approval-reform, planning-land multi-review, and construction drawing/permit stage source discovery.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'hunan',
    provinceName: '湖南省',
    sourceName: '湖南省人民政府办公厅关于印发《湖南省工程建设项目审批制度改革工作实施方案》的通知（湘政办发〔2019〕24号）',
    sourceUrl: 'https://www.hunan.gov.cn/xxgk/wjk/szfbgt/201905/t20190515_5339432.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '湖南省工程建设项目审批工作指南',
        sourceUrl: 'https://zjt.hunan.gov.cn/zjt/xxgk/xinxigongkaimulu/tzgg/tzgg2jzgl/201908/t20190822_9942904.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '湖南省工程建设项目审批“一窗受理、集成服务”工作导则',
        sourceUrl: 'https://zjt.hunan.gov.cn/zjt/xxgk/xinxigongkaimulu/tzgg/tzgg2jzgl/201908/t20190822_9942988.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '湖南省 central-south expansion published profile; applies the governed four-certificate material depth after Hunan approval-reform plan, approval work guide, and one-window integrated service guide source discovery.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'guangxi',
    provinceName: '广西壮族自治区',
    sourceName: '自治区工程建设项目审批制度改革领导小组办公室关于印发广西工程建设项目审批制度改革工作进展评分细则（试行）的通知',
    sourceUrl: 'https://zjt.gxzf.gov.cn/zfxxgk/fdzdgknr/wjtz/t1556971.shtml',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '广西壮族自治区住房和城乡建设厅关于深化房屋建筑和市政基础设施施工图审查制度改革的实施意见政策解读',
        sourceUrl: 'https://zjt.gxzf.gov.cn/zfxxgk/fdzdgknr/zcjd/t7562138.shtml',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '广西推动工程建设项目审批制度深层次改革官方转载来源',
        sourceUrl: 'https://www.gov.cn/lianbo/difang/202306/content_6887806.htm',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '广西壮族自治区 central-south expansion published profile; applies the governed four-certificate material depth after Guangxi construction-permit, planning-land multi-review, and approval-reform source discovery.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'hainan',
    provinceName: '海南省',
    sourceName: '海南省人民政府办公厅关于进一步推进工程建设项目极简审批的通知',
    sourceUrl: 'https://www.hainan.gov.cn/hainan/szfbgtwj/202305/919d0e29abcf403386bc378342a0bdd8.shtml',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '海南省工程建设项目立项用地规划许可和工程建设施工许可阶段整合审批资料治理记录',
        sourceUrl: 'https://www.hainan.gov.cn/hainan/szfbgtwj/202305/919d0e29abcf403386bc378342a0bdd8.shtml',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '海南省工程建设项目审批管理系统、电子证照和分阶段施工许可治理复核记录',
        sourceUrl: 'https://www.hainan.gov.cn/hainan/szfbgtwj/202305/919d0e29abcf403386bc378342a0bdd8.shtml',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '海南省 central-south expansion published profile; applies the governed four-certificate material depth after Hainan simplified approval, planning-land stage integration, and staged construction-permit source verification.',
  }),
]

const SOUTHWEST_EXPANSION_CANDIDATE_PROVINCE_PROFILES: CertificateTemplateProvinceProfile[] = [
  createFirstExpansionProvinceProfile({
    provinceCode: 'chongqing',
    provinceName: '重庆市',
    sourceName: '重庆市人民政府关于印发重庆市深化工程建设项目审批制度改革实施方案的通知（渝府发〔2019〕25号）',
    sourceUrl: 'https://www.cq.gov.cn/zwgk/zfxxgkml/szfwj/xzgfxwj/szf/201910/t20191018_8837053.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '重庆市住房城乡建设委员会关于更新建设项目联合验收一件事办事指南的通知',
        sourceUrl: 'https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202601/P020260121598047299306.pdf',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '重庆市住房城乡建设委员会关于更新开工一件事办事指南的通知',
        sourceUrl: 'https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202507/P020250710346857222454.pdf',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '重庆市 southwest expansion published profile; applies the governed four-certificate material depth after Chongqing approval-reform, joint-acceptance, and start-of-construction service-guide source verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'sichuan',
    provinceName: '四川省',
    sourceName: '四川省人民政府办公厅关于印发四川省工程建设项目审批制度改革实施方案的通知',
    sourceUrl: 'https://www.sczwfw.gov.cn/art/2019/5/24/art_15330_87344.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '四川省工程建设项目审批管理系统服务事项与综合窗口治理记录',
        sourceUrl: 'https://gcjs.sczwfw.gov.cn/',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '四川省自然资源厅关于推进规划用地多审合一、多证合一改革有关事项的通知',
        sourceUrl: 'https://dnr.sc.gov.cn/scdnr/xzgfxwj/2019/11/15/3d2ef10ebaf44285926f78fb72ce9d64.shtml',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '四川省 southwest expansion published profile; applies the governed four-certificate material depth after Sichuan approval-reform, engineering-approval service portal, and planning-land multi-review source discovery.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'guizhou',
    provinceName: '贵州省',
    sourceName: '省政府办公厅印发贵州省全面开展工程建设项目审批制度改革工作实施方案',
    sourceUrl: 'https://fgw.guizhou.gov.cn/zwgk/zcwj/zcwj/201905/t20190508_62138785.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '贵州省工程建设项目审批管理系统与贵州政务服务网联通治理记录',
        sourceUrl: 'https://zwfw.guizhou.gov.cn/',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '贵州省自然资源厅关于贯彻落实规划用地“多审合一、多证合一”改革的实施意见',
        sourceUrl: 'https://zrzy.guizhou.gov.cn/wzgb/ztzl/rdzt/yhyshj/jzxk/202404/t20240429_84375111.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '贵州省 southwest expansion published profile; applies the governed four-certificate material depth after Guizhou approval-reform, engineering-approval service portal, and planning-land multi-review source discovery.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'yunnan',
    provinceName: '云南省',
    sourceName: '云南省人民政府办公厅关于印发云南省工程建设项目审批制度改革实施方案的通知（云政办发〔2019〕50号）',
    sourceUrl: 'https://zfcxjst.yn.gov.cn/zhengfuxinxigongkai/zhengcewenjian8775/shangjiwenjian8778/285652.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '云南省工程建设项目审批管理系统与云南政务服务网联通治理记录',
        sourceUrl: 'https://zwfw.yn.gov.cn/',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '云南省自然资源厅关于规划用地“多审合一、多证合一”改革工作的实施意见',
        sourceUrl: 'https://dnr.yn.gov.cn/html/2020/xingzhengguifanxingwenjian_0330/32474.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '云南省 southwest expansion published profile; applies the governed four-certificate material depth after Yunnan approval-reform, engineering-approval service portal, and planning-land multi-review source verification.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'tibet',
    provinceName: '西藏自治区',
    sourceName: '西藏自治区人民政府办公厅关于印发西藏自治区全面开展工程建设项目审批制度改革实施方案的通知',
    sourceUrl: 'https://www.xizang.gov.cn/zwgk/xxfb/zbwj/201911/t20191114_123670.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '西藏政务服务网工程建设项目服务入口治理记录',
        sourceUrl: 'https://www.xzzwfw.gov.cn/index.shtml',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '西藏自治区自然资源厅关于推进规划用地“多审合一、多证合一”改革的实施意见（试行）',
        sourceUrl: 'https://zrzyt.xizang.gov.cn/fw/bszn/202005/t20200528_142190.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '西藏自治区 southwest expansion published profile; applies the governed four-certificate material depth after Tibet approval-reform, government-service engineering portal, and planning-land multi-review source verification.',
  }),
]

const NORTHWEST_EXPANSION_CANDIDATE_PROVINCE_PROFILES: CertificateTemplateProvinceProfile[] = [
  createFirstExpansionProvinceProfile({
    provinceCode: 'shaanxi',
    provinceName: '陕西省',
    sourceName: '陕西省人民政府办公厅关于印发全面开展工程建设项目审批制度改革实施方案的通知',
    sourceUrl: 'https://www.shaanxi.gov.cn/zfxxgk/fdzdgknr/zcwj/nszfbgtwj/szbf/201905/t20190522_1665630.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '陕西政务服务网工程建设项目审批服务入口治理记录',
        sourceUrl: 'https://zwfw.shaanxi.gov.cn/sx/public/index',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '陕西省自然资源厅建设项目用地预审与选址意见书、建设用地规划许可证办理口径治理记录',
        sourceUrl: 'https://zrzyt.shaanxi.gov.cn/',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '陕西省 northwest expansion published profile; applies the governed four-certificate material depth after Shaanxi approval-reform, government-service engineering portal, and planning-land approval source discovery.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'gansu',
    provinceName: '甘肃省',
    sourceName: '甘肃省人民政府办公厅关于进一步推进工程建设项目全流程在线审批的通知（甘政办发〔2021〕36号）',
    sourceUrl: 'https://www.gansu.gov.cn/gsszf/c100055/202106/1551290/files/601b94b7eb2b467eabe020c4a3f5b02d.pdf',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '甘肃省政务服务网工程建设项目审批模块入口治理记录',
        sourceUrl: 'https://zwfw.gansu.gov.cn/',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '甘肃省自然资源厅关于进一步深化规划用地“多审合一、多证合一”改革的通知治理记录',
        sourceUrl: 'https://www.zhangye.gov.cn/zjj/dzdt/tzgg/202402/t20240205_1183084.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '甘肃省 northwest expansion published profile; applies the governed four-certificate material depth after Gansu full-process online approval, government-service engineering portal, and planning-land multi-review source discovery.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'qinghai',
    provinceName: '青海省',
    sourceName: '青海省全面开展工程建设项目审批制度改革实施方案',
    sourceUrl: 'https://www.qhzwfw.gov.cn/ygzw/008001/008001001/008001001001/20231208/aba812a3-d429-49d5-bf22-99ea91ec09f6.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '青海省投资项目在线审批平台与工程建设项目审批综合服务入口治理记录',
        sourceUrl: 'https://tzxm.qinghai.gov.cn/',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '青海省自然资源厅建设项目用地预审与选址意见书公开治理记录',
        sourceUrl: 'https://zrzyt.qinghai.gov.cn/gk/fdzdgknr/gzzdt__gk/fdzdgknr/ytgz/content_8926',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '青海省 northwest expansion published profile; applies the governed four-certificate material depth after Qinghai approval-reform, investment-project and engineering-approval portal, and planning-land pre-review source discovery.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'ningxia',
    provinceName: '宁夏回族自治区',
    sourceName: '自治区人民政府办公厅关于印发宁夏工程建设项目审批制度改革实施方案的通知',
    sourceUrl: 'https://www.nx.gov.cn/zwgk/qzfwj/201906/t20190611_1543929.html',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '宁夏回族自治区住房和城乡建设厅2022年全区工程建设项目审批制度改革工作要点',
        sourceUrl: 'https://jst.nx.gov.cn/ztzl/gcjsxmspzdgg/202202/t20220228_3344784.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '宁夏政务服务网工程建设项目审批服务入口治理记录',
        sourceUrl: 'https://zwfw.nx.gov.cn/',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '宁夏回族自治区 northwest expansion published profile; applies the governed four-certificate material depth after Ningxia approval-reform, housing-construction reform work-point, and government-service portal source discovery.',
  }),
  createFirstExpansionProvinceProfile({
    provinceCode: 'xinjiang',
    provinceName: '新疆维吾尔自治区',
    sourceName: '新疆维吾尔自治区工程建设项目审批制度改革实施方案治理记录',
    sourceUrl: 'https://www.xjtc.gov.cn/',
    reviewStatus: 'published',
    effectiveFrom: '2026-05-30',
    lastReviewedAt: '2026-05-30',
    nextReviewDueAt: '2026-08-30',
    additionalPolicySources: [
      {
        sourceName: '新疆政务服务网工程建设项目审批服务入口治理记录',
        sourceUrl: 'https://zwfw.xinjiang.gov.cn/',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      {
        sourceName: '新疆维吾尔自治区自然资源厅规划用地审批服务事项治理记录',
        sourceUrl: 'https://zrzyt.xinjiang.gov.cn/',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
    ],
    publishedNote: '新疆维吾尔自治区 northwest expansion published profile; applies the governed four-certificate material depth after Xinjiang approval-reform, government-service engineering portal, and planning-land approval source discovery.',
  }),
]

const SHENZHEN_CITY_CERTIFICATE_OVERRIDE: CertificateTemplateCityOverride = {
  overrideCode: 'city_override_guangdong_shenzhen_v14222',
  cityCode: 'shenzhen',
  cityName: '深圳市',
  provinceCode: 'guangdong',
  overrideScope: 'city',
  profileVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
  reviewStatus: 'published',
  policyLevel: 'city',
  effectiveFrom: '2026-05-31',
  lastReviewedAt: '2026-05-31',
  nextReviewDueAt: '2026-08-31',
  curationMethod: 'governed_seed',
  aliases: ['深圳', '深圳市', 'shenzhen', '前海', '南山区'],
  materialOverrides: [
    {
      landAcquisitionMethodCode: 'transfer',
      addMaterialNames: [
        '深圳市出让取得土地权属链补充材料',
        '深圳市土地供应合同及地价缴纳材料',
      ],
      addPolicyBasis: ['深圳市 city override：出让取得土地权属链资料补充'],
      addRecommendedFor: ['深圳市通过出让取得土地的建设项目', '前海、南山等重点片区样板项目'],
    },
  ],
  materialPackageOverrides: [
    {
      materialPackageCode: 'PKG-CERT-LAND-COMMON',
      addMaterialNames: [
        '深圳市工程建设项目审批管理系统项目代码',
        '深圳市土地供应合同及地价缴纳材料',
        '深圳市宗地图、界址点成果及交地确认材料',
      ],
      addPolicyBasis: ['深圳市 city override：土地取得及权属链资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-LUP-COMMON',
      addMaterialNames: [
        '深圳市建设用地规划许可申请表',
        '深圳市宗地图及规划条件附图',
        '深圳市用地红线及规划条件确认材料',
      ],
      addPolicyBasis: ['深圳市 city override：建设用地规划许可资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-EPP-COMMON',
      addMaterialNames: [
        '深圳市建设工程规划许可设计方案图件',
        '深圳市规划技术审查材料',
        '深圳市方案总平面图及单体设计图件',
      ],
      addPolicyBasis: ['深圳市 city override：建设工程规划许可资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-CP-COMMON',
      addMaterialNames: [
        '深圳市施工许可申请表',
        '深圳市质量安全监督与实名制资料',
        '深圳市施工许可阶段参建单位和合同资料',
      ],
      addPolicyBasis: ['深圳市 city override：施工许可资料包补充'],
    },
  ],
  policySources: [
    {
      sourceName: '深圳市工程建设项目审批制度改革治理记录',
      sourceUrl: 'https://www.sz.gov.cn/',
      checkedAt: '2026-05-31',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
    {
      sourceName: '广东政务服务网深圳市工程建设项目审批服务入口治理记录',
      sourceUrl: 'https://www.gdzwfw.gov.cn/',
      checkedAt: '2026-05-31',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
    {
      sourceName: '深圳市规划和自然资源局建设用地规划许可服务事项治理记录',
      sourceUrl: 'https://pnr.sz.gov.cn/',
      checkedAt: '2026-05-31',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
  ],
  notes: [
    '城市 override 只叠加明确市级资料差异，不替代广东省 profile。',
    '第一版仅作为深圳样板打通结构，后续城市必须经官方来源治理、质量门槛和 seed 发布后进入业务 preview。',
    '业务前端展示合成后的地区资料口径，不展示触发原因、未触发原因或人工确认解释。',
  ],
}

const SUZHOU_CITY_CERTIFICATE_OVERRIDE: CertificateTemplateCityOverride = {
  overrideCode: 'city_override_jiangsu_suzhou_v14222',
  cityCode: 'suzhou',
  cityName: '苏州市',
  provinceCode: 'jiangsu',
  overrideScope: 'city',
  profileVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
  reviewStatus: 'published',
  policyLevel: 'city',
  effectiveFrom: '2026-05-31',
  lastReviewedAt: '2026-05-31',
  nextReviewDueAt: '2026-08-31',
  curationMethod: 'governed_seed',
  aliases: ['苏州', '苏州市', '苏州工业园区', '工业园区', 'sip', 'Suzhou Industrial Park'],
  materialOverrides: [
    {
      landAcquisitionMethodCode: 'transfer',
      addMaterialNames: [
        '苏州市土地出让及不动产权属链补充材料',
        '苏州市土地供应合同及交地确认材料',
      ],
      addPolicyBasis: ['苏州市 city override：出让取得土地权属链资料补充'],
      addRecommendedFor: ['苏州市通过出让取得土地的建设项目', '产业载体、研发办公和配套建设项目'],
    },
  ],
  materialPackageOverrides: [
    {
      materialPackageCode: 'PKG-CERT-LAND-COMMON',
      addMaterialNames: [
        '苏州市工程建设项目审批管理系统项目代码',
        '苏州市土地出让及不动产权属链补充材料',
        '苏州市土地供应合同及交地确认材料',
      ],
      addPolicyBasis: ['苏州市 city override：土地取得及权属链资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-LUP-COMMON',
      addMaterialNames: [
        '苏州市建设用地规划许可申请材料',
        '苏州市规划条件及用地红线资料',
        '苏州市宗地图及规划条件附图',
      ],
      addPolicyBasis: ['苏州市 city override：建设用地规划许可资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-EPP-COMMON',
      addMaterialNames: [
        '苏州市建设工程规划许可设计方案材料',
        '苏州市方案总平面图及单体图件',
        '苏州市规划技术审查资料',
      ],
      addPolicyBasis: ['苏州市 city override：建设工程规划许可资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-CP-COMMON',
      addMaterialNames: [
        '苏州市施工许可申请表',
        '苏州市质量安全监督资料',
        '苏州市实名制和参建单位合同资料',
      ],
      addPolicyBasis: ['苏州市 city override：施工许可资料包补充'],
    },
  ],
  policySources: [
    {
      sourceName: '苏州市工程建设项目审批服务治理记录',
      sourceUrl: 'https://www.suzhou.gov.cn/szsrmzf/qxkx/202506/ddce4a24337c41e1ad0441e86b39f8ce.shtml',
      checkedAt: '2026-05-31',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
    {
      sourceName: '江苏政务服务网苏州市工程建设事项治理记录',
      sourceUrl: 'https://www.jszwfw.gov.cn/',
      checkedAt: '2026-05-31',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
    {
      sourceName: '苏州市规划建设审批服务事项治理记录',
      sourceUrl: 'https://www.suzhou.gov.cn/szsrmzf/qxkx/202506/ddce4a24337c41e1ad0441e86b39f8ce.shtml',
      checkedAt: '2026-05-31',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
  ],
  notes: [
    '苏州市 override 是城市级规则；苏州工业园区只作为识别别名，不再作为独立园区 seed 资产。',
    '城市模板只发布已治理的四证资料包差异，不替代江苏省 profile。',
    '业务前端展示合成后的地区资料口径，不展示触发原因、未触发原因或人工确认解释。',
  ],
}

const BEIJING_CITY_CERTIFICATE_OVERRIDE_CANDIDATE: CertificateTemplateCityOverride = createPublishedCityCertificateOverride({
  provinceCode: 'beijing',
  provinceName: '北京市',
  cityCode: 'beijing',
  cityName: '北京市',
  aliases: ['北京', '朝阳区', '海淀区', 'beijing'],
  engineeringApprovalUrl: 'https://tzxm.beijing.gov.cn/',
  planningNaturalResourcesUrl: 'https://ghzrzyw.beijing.gov.cn/',
  housingConstructionUrl: 'https://banshi.beijing.gov.cn/',
  landSupplyUrl: 'https://ghzrzyw.beijing.gov.cn/',
})
const GUANGZHOU_CITY_CERTIFICATE_OVERRIDE_CANDIDATE: CertificateTemplateCityOverride = createPublishedCityCertificateOverride({
  provinceCode: 'guangdong',
  provinceName: '广东省',
  cityCode: 'guangzhou',
  cityName: '广州市',
  aliases: ['广州', '天河区', '黄埔区', 'guangzhou'],
  engineeringApprovalUrl: 'https://www.gz.gov.cn/',
  planningNaturalResourcesUrl: 'https://ghzyj.gz.gov.cn/',
  housingConstructionUrl: 'https://zfcj.gz.gov.cn/',
  landSupplyUrl: 'https://ggzy.gz.gov.cn/',
})
const NANJING_CITY_CERTIFICATE_OVERRIDE_CANDIDATE: CertificateTemplateCityOverride = createPublishedCityCertificateOverride({
  provinceCode: 'jiangsu',
  provinceName: '江苏省',
  cityCode: 'nanjing',
  cityName: '南京市',
  aliases: ['南京', '建邺区', '江北新区', 'nanjing'],
  engineeringApprovalUrl: 'https://www.nanjing.gov.cn/',
  planningNaturalResourcesUrl: 'https://ghj.nanjing.gov.cn/',
  housingConstructionUrl: 'https://sjw.nanjing.gov.cn/',
  landSupplyUrl: 'https://njggzy.nanjing.gov.cn/',
})
const CHENGDU_CITY_CERTIFICATE_OVERRIDE_CANDIDATE: CertificateTemplateCityOverride = createPublishedCityCertificateOverride({
  provinceCode: 'sichuan',
  provinceName: '四川省',
  cityCode: 'chengdu',
  cityName: '成都市',
  aliases: ['成都', '高新区', '天府新区', 'chengdu'],
  engineeringApprovalUrl: 'https://www.chengdu.gov.cn/',
  planningNaturalResourcesUrl: 'https://mpnr.chengdu.gov.cn/',
  housingConstructionUrl: 'https://cdzj.chengdu.gov.cn/',
  landSupplyUrl: 'https://mpnr.chengdu.gov.cn/',
})
const WUHAN_CITY_CERTIFICATE_OVERRIDE_CANDIDATE: CertificateTemplateCityOverride = createPublishedCityCertificateOverride({
  provinceCode: 'hubei',
  provinceName: '湖北省',
  cityCode: 'wuhan',
  cityName: '武汉市',
  aliases: ['武汉', '东湖高新区', '武汉经开区', 'wuhan'],
  engineeringApprovalUrl: 'https://www.wuhan.gov.cn/',
  planningNaturalResourcesUrl: 'https://zrzyhgh.wuhan.gov.cn/',
  housingConstructionUrl: 'https://cjw.wuhan.gov.cn/',
  landSupplyUrl: 'https://zrzyhgh.wuhan.gov.cn/',
})
const XIAN_CITY_CERTIFICATE_OVERRIDE_CANDIDATE: CertificateTemplateCityOverride = createPublishedCityCertificateOverride({
  provinceCode: 'shaanxi',
  provinceName: '陕西省',
  cityCode: 'xian',
  cityName: '西安市',
  aliases: ['西安', '雁塔区', '高新区', 'Xian', 'Xi’an'],
  engineeringApprovalUrl: 'https://www.xa.gov.cn/',
  planningNaturalResourcesUrl: 'https://zygh.xa.gov.cn/',
  housingConstructionUrl: 'https://zjj.xa.gov.cn/',
  landSupplyUrl: 'https://sxggzyjy.xa.gov.cn/',
})
const SHANGHAI_CITY_CERTIFICATE_OVERRIDE: CertificateTemplateCityOverride = {
  overrideCode: 'city_override_shanghai_shanghai_v14222',
  cityCode: 'shanghai',
  cityName: '上海市',
  provinceCode: 'shanghai',
  overrideScope: 'city',
  profileVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
  reviewStatus: 'published',
  policyLevel: 'city',
  effectiveFrom: '2026-06-01',
  lastReviewedAt: '2026-06-01',
  nextReviewDueAt: '2026-09-01',
  curationMethod: 'governed_seed',
  aliases: ['上海浦东新区', '浦东新区', '浦东', 'Pudong New Area', 'shanghai pudong'],
  materialOverrides: [
    {
      landAcquisitionMethodCode: 'transfer',
      addMaterialNames: [
        '上海市出让取得土地权属链补充材料',
        '上海市土地供应合同、成交确认及交地材料',
      ],
      addPolicyBasis: ['上海市城市模板：出让取得土地权属链资料补充'],
      addRecommendedFor: ['上海市通过出让取得国有建设用地使用权的建设项目'],
    },
  ],
  materialPackageOverrides: [
    {
      materialPackageCode: 'PKG-CERT-LAND-COMMON',
      addMaterialNames: [
        '上海市工程建设项目审批系统项目代码',
        '上海市出让取得土地权属链补充材料',
        '上海市土地供应合同、成交确认及交地材料',
      ],
      addPolicyBasis: ['上海市城市模板：土地取得及权属链资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-LUP-COMMON',
      addMaterialNames: [
        '上海市建设用地规划许可申请材料',
        '上海市规划条件、用地红线及宗地图材料',
      ],
      addPolicyBasis: ['上海市城市模板：建设用地规划许可资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-EPP-COMMON',
      addMaterialNames: [
        '上海市建设工程规划许可设计方案材料',
        '上海市规划技术审查及总平面图材料',
      ],
      addPolicyBasis: ['上海市城市模板：建设工程规划许可资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-CP-COMMON',
      addMaterialNames: [
        '上海市施工许可申请材料',
        '上海市质量安全监督登记及参建单位合同材料',
      ],
      addPolicyBasis: ['上海市城市模板：施工许可资料包补充'],
    },
  ],
  policySources: [
    {
      sourceName: '上海市工程建设项目审批服务入口',
      sourceUrl: 'https://www.pudong.gov.cn/zwgk/006002004/2022/302/256924.html',
      checkedAt: '2026-06-01',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
    {
      sourceName: '上海市规划和自然资源主管部门服务入口',
      sourceUrl: 'https://ghzyj.sh.gov.cn/jzxkbszn/20231011/5bc1e811b27f4ac18cb92dbcc9a2f78e.html',
      checkedAt: '2026-06-01',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
    {
      sourceName: '上海市施工许可服务入口',
      sourceUrl: 'https://zwdt.sh.gov.cn/govPortals/power/powerDetail.do?stId=00011710900Y&stItemRegion=SH00SH&zr=0',
      checkedAt: '2026-06-01',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
    {
      sourceName: '上海市土地供应或公共资源交易服务入口',
      sourceUrl: 'https://ghzyj.sh.gov.cn/zcwj/tdgl/20251201/4839ae8a68254048b30ee50e107b28c7.html',
      checkedAt: '2026-06-01',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
  ],
  governedSourceTypes: [
    'engineering_approval_portal',
    'planning_natural_resources',
    'housing_construction_permit',
    'land_supply_or_transaction',
  ],
  governedSourceEvidence: [
    {
      sourceType: 'engineering_approval_portal',
      sourceName: '上海市工程建设项目审批服务入口',
      sourceUrl: 'https://www.pudong.gov.cn/zwgk/006002004/2022/302/256924.html',
      checkedAt: '2026-06-01',
    },
    {
      sourceType: 'planning_natural_resources',
      sourceName: '上海市规划和自然资源主管部门服务入口',
      sourceUrl: 'https://ghzyj.sh.gov.cn/jzxkbszn/20231011/5bc1e811b27f4ac18cb92dbcc9a2f78e.html',
      checkedAt: '2026-06-01',
    },
    {
      sourceType: 'housing_construction_permit',
      sourceName: '上海市施工许可服务入口',
      sourceUrl: 'https://zwdt.sh.gov.cn/govPortals/power/powerDetail.do?stId=00011710900Y&stItemRegion=SH00SH&zr=0',
      checkedAt: '2026-06-01',
    },
    {
      sourceType: 'land_supply_or_transaction',
      sourceName: '上海市土地供应或公共资源交易服务入口',
      sourceUrl: 'https://ghzyj.sh.gov.cn/zcwj/tdgl/20251201/4839ae8a68254048b30ee50e107b28c7.html',
      checkedAt: '2026-06-01',
    },
  ],
  notes: [
    '上海市已作为前期证照城市模板规则发布，项目命中上海市时直接叠加城市资料包，浦东新区只作为识别别名，不再作为独立区级 seed 资产。',
    '城市模板只补充本地资料口径，不替代上海市省级资料包。',
    '普通前端展示合成后的地区资料包，不展示触发解释、未触发解释或人工确认说明。',
  ],
}
const HANGZHOU_CITY_CERTIFICATE_OVERRIDE: CertificateTemplateCityOverride = {
  overrideCode: 'city_override_zhejiang_hangzhou_v14222',
  cityCode: 'hangzhou',
  cityName: '杭州市',
  provinceCode: 'zhejiang',
  overrideScope: 'city',
  profileVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
  reviewStatus: 'published',
  policyLevel: 'city',
  effectiveFrom: '2026-06-01',
  lastReviewedAt: '2026-06-01',
  nextReviewDueAt: '2026-09-01',
  curationMethod: 'governed_seed',
  aliases: ['杭州', '杭州市', '杭州高新区', '滨江高新区', '杭州高新技术产业开发区', 'hangzhou high tech zone', 'binjiang'],
  materialOverrides: [
    {
      landAcquisitionMethodCode: 'transfer',
      addMaterialNames: [
        '杭州市出让取得土地权属链补充材料',
        '杭州市土地供应合同、成交确认及交地材料',
      ],
      addPolicyBasis: ['杭州市城市模板：出让取得土地权属链资料补充'],
      addRecommendedFor: ['杭州市工业、研发、办公及配套项目通过出让取得国有建设用地使用权的情形'],
    },
  ],
  materialPackageOverrides: [
    {
      materialPackageCode: 'PKG-CERT-LAND-COMMON',
      addMaterialNames: [
        '杭州市工程建设项目审批系统项目代码',
        '杭州市出让取得土地权属链补充材料',
        '杭州市土地供应合同、成交确认及交地材料',
      ],
      addPolicyBasis: ['杭州市城市模板：土地取得及权属链资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-LUP-COMMON',
      addMaterialNames: [
        '杭州市建设用地规划许可申请材料',
        '杭州市规划条件、用地红线及宗地图材料',
      ],
      addPolicyBasis: ['杭州市城市模板：建设用地规划许可资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-EPP-COMMON',
      addMaterialNames: [
        '杭州市建设工程规划许可设计方案材料',
        '杭州市规划技术审查及总平面图材料',
      ],
      addPolicyBasis: ['杭州市城市模板：建设工程规划许可资料包补充'],
    },
    {
      materialPackageCode: 'PKG-CERT-CP-COMMON',
      addMaterialNames: [
        '杭州市施工许可申请材料',
        '杭州市质量安全监督登记及参建单位合同材料',
      ],
      addPolicyBasis: ['杭州市城市模板：施工许可资料包补充'],
    },
  ],
  policySources: [
    {
      sourceName: '浙江省投资项目在线审批监管平台',
      sourceUrl: 'https://tzxm.zjzwfw.gov.cn/indexhb.jsp',
      checkedAt: '2026-06-01',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
    {
      sourceName: '杭州市规划和自然资源主管部门服务入口',
      sourceUrl: 'https://www.hangzhou.gov.cn/art/2021/3/31/art_1229492731_59033579.html',
      checkedAt: '2026-06-01',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
    {
      sourceName: '杭州市住房城乡建设主管部门施工许可服务入口',
      sourceUrl: 'https://cxjw.hangzhou.gov.cn/art/2024/11/4/art_1229486199_1846717.html',
      checkedAt: '2026-06-01',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
    {
      sourceName: '杭州市土地供应或公共资源交易服务入口',
      sourceUrl: 'https://zrzyt.zj.gov.cn/art/2025/4/1/art_1229453692_275993.html',
      checkedAt: '2026-06-01',
      updateMode: 'governed_seed_update',
      policyLevel: 'city',
    },
  ],
  governedSourceTypes: [
    'engineering_approval_portal',
    'planning_natural_resources',
    'housing_construction_permit',
    'land_supply_or_transaction',
  ],
  governedSourceEvidence: [
    {
      sourceType: 'engineering_approval_portal',
      sourceName: '浙江省投资项目在线审批监管平台',
      sourceUrl: 'https://tzxm.zjzwfw.gov.cn/indexhb.jsp',
      checkedAt: '2026-06-01',
    },
    {
      sourceType: 'planning_natural_resources',
      sourceName: '杭州市规划和自然资源主管部门服务入口',
      sourceUrl: 'https://www.hangzhou.gov.cn/art/2021/3/31/art_1229492731_59033579.html',
      checkedAt: '2026-06-01',
    },
    {
      sourceType: 'housing_construction_permit',
      sourceName: '杭州市住房城乡建设主管部门施工许可服务入口',
      sourceUrl: 'https://cxjw.hangzhou.gov.cn/art/2024/11/4/art_1229486199_1846717.html',
      checkedAt: '2026-06-01',
    },
    {
      sourceType: 'land_supply_or_transaction',
      sourceName: '杭州市土地供应或公共资源交易服务入口',
      sourceUrl: 'https://zrzyt.zj.gov.cn/art/2025/4/1/art_1229453692_275993.html',
      checkedAt: '2026-06-01',
    },
  ],
  notes: [
    '杭州市已作为前期证照城市模板规则发布，项目命中杭州市时直接叠加城市资料包，杭州高新区只作为识别别名，不再作为独立园区 seed 资产。',
    '城市模板只补充本地资料口径，不替代浙江省省级资料包。',
    '普通前端展示合成后的地区资料包，不展示触发解释、未触发解释或人工确认说明。',
  ],
}
function createPublishedCityCertificateOverride({
  provinceCode,
  provinceName,
  cityCode,
  cityName,
  aliases = [],
  engineeringApprovalUrl,
  planningNaturalResourcesUrl,
  housingConstructionUrl,
  landSupplyUrl,
}: PublishedCityCertificateOverrideInput): CertificateTemplateCityOverride {
  return {
    overrideCode: `city_override_${provinceCode}_${cityCode}_v14222`,
    cityCode,
    cityName,
    provinceCode,
    overrideScope: 'city',
    profileVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
    reviewStatus: 'published',
    policyLevel: 'city',
    effectiveFrom: '2026-06-01',
    lastReviewedAt: '2026-06-01',
    nextReviewDueAt: '2026-09-01',
    curationMethod: 'governed_seed',
    aliases: uniqueSeedStrings([cityName, cityName.replace(/市$/, ''), cityCode, ...aliases]),
    materialOverrides: [
      {
        landAcquisitionMethodCode: 'transfer',
        addMaterialNames: [
          `${cityName}出让取得土地权属链补充材料`,
          `${cityName}土地供应合同、成交确认及交地材料`,
        ],
        addPolicyBasis: [`${cityName}城市模板：出让取得土地权属链资料补充`],
        addRecommendedFor: [`${cityName}通过出让取得国有建设用地使用权的建设项目`],
      },
    ],
    materialPackageOverrides: [
      {
        materialPackageCode: 'PKG-CERT-LAND-COMMON',
        addMaterialNames: [
          `${cityName}工程建设项目审批系统项目代码`,
          `${cityName}出让取得土地权属链补充材料`,
          `${cityName}土地供应合同、成交确认及交地材料`,
        ],
        addPolicyBasis: [`${cityName}城市模板：土地取得及权属链资料包补充`],
      },
      {
        materialPackageCode: 'PKG-CERT-LUP-COMMON',
        addMaterialNames: [
          `${cityName}建设用地规划许可申请材料`,
          `${cityName}规划条件、用地红线及宗地图材料`,
        ],
        addPolicyBasis: [`${cityName}城市模板：建设用地规划许可资料包补充`],
      },
      {
        materialPackageCode: 'PKG-CERT-EPP-COMMON',
        addMaterialNames: [
          `${cityName}建设工程规划许可设计方案材料`,
          `${cityName}规划技术审查及总平面图材料`,
        ],
        addPolicyBasis: [`${cityName}城市模板：建设工程规划许可资料包补充`],
      },
      {
        materialPackageCode: 'PKG-CERT-CP-COMMON',
        addMaterialNames: [
          `${cityName}施工许可申请材料`,
          `${cityName}质量安全监督登记及参建单位合同材料`,
        ],
        addPolicyBasis: [`${cityName}城市模板：施工许可资料包补充`],
      },
    ],
    handlingAuthorityOverrides: {
      land: `${cityName}鑷劧璧勬簮鍜岃鍒掍富绠￠儴闂?`,
      landUsePlanning: `${cityName}鑷劧璧勬簮鍜岃鍒掍富绠￠儴闂?`,
      engineeringPlanning: `${cityName}鑷劧璧勬簮鍜岃鍒掍富绠￠儴闂?`,
      constructionPermit: `${cityName}浣忔埧鍩庝埂寤鸿涓荤閮ㄩ棬`,
    },
    reusableOutputOverrides: {
      landToLandUsePlanning: [
        `${cityName}鍦熷湴渚涘簲鍚堝悓銆佹垚浜ょ‘璁ゅ強浜ゅ湴鏉愭枡`,
        `${cityName}鍦熷湴鏉冨睘閾捐ˉ鍏呮潗鏂?`,
      ],
      landUsePlanningToEngineeringPlanning: [
        `${cityName}寤鸿鐢ㄥ湴瑙勫垝璁稿彲璇佸強瑙勫垝鏉′欢纭鎴愭灉`,
        `${cityName}鐢ㄥ湴绾㈢嚎銆佸畻鍦板浘鍜岃鍒掓潯浠堕檮鍥?`,
      ],
      engineeringPlanningToConstructionPermit: [
        `${cityName}寤鸿宸ョ▼瑙勫垝璁稿彲璇?`,
        `${cityName}鏂规銆佺孩绾垮強瑙勫垝鎶€鏈鏌ユ垚鏋?`,
      ],
      drawingReviewToConstructionPermit: [
        `${cityName}鏂藉伐鍥惧鏌ュ悎鏍艰祫鏂?`,
        `${cityName}璐ㄩ噺瀹夊叏鐩戠潱鐧昏鍙婂疄鍚嶅埗鏉愭枡`,
      ],
    },
    policySources: [
      {
        sourceName: `${cityName}工程建设项目审批服务入口`,
        sourceUrl: engineeringApprovalUrl,
        checkedAt: '2026-06-01',
        updateMode: 'governed_seed_update',
        policyLevel: 'city',
      },
      {
        sourceName: `${cityName}自然资源和规划主管部门服务入口`,
        sourceUrl: planningNaturalResourcesUrl,
        checkedAt: '2026-06-01',
        updateMode: 'governed_seed_update',
        policyLevel: 'city',
      },
      {
        sourceName: `${cityName}住房城乡建设主管部门施工许可服务入口`,
        sourceUrl: housingConstructionUrl,
        checkedAt: '2026-06-01',
        updateMode: 'governed_seed_update',
        policyLevel: 'city',
      },
      {
        sourceName: `${cityName}土地供应或公共资源交易服务入口`,
        sourceUrl: landSupplyUrl,
        checkedAt: '2026-06-01',
        updateMode: 'governed_seed_update',
        policyLevel: 'city',
      },
    ],
    governedSourceTypes: [
      'engineering_approval_portal',
      'planning_natural_resources',
      'housing_construction_permit',
      'land_supply_or_transaction',
    ],
    governedSourceEvidence: [
      {
        sourceType: 'engineering_approval_portal',
        sourceName: `${cityName}工程建设项目审批服务入口`,
        sourceUrl: engineeringApprovalUrl,
        checkedAt: '2026-06-01',
      },
      {
        sourceType: 'planning_natural_resources',
        sourceName: `${cityName}自然资源和规划主管部门服务入口`,
        sourceUrl: planningNaturalResourcesUrl,
        checkedAt: '2026-06-01',
      },
      {
        sourceType: 'housing_construction_permit',
        sourceName: `${cityName}住房城乡建设主管部门施工许可服务入口`,
        sourceUrl: housingConstructionUrl,
        checkedAt: '2026-06-01',
      },
      {
        sourceType: 'land_supply_or_transaction',
        sourceName: `${cityName}土地供应或公共资源交易服务入口`,
        sourceUrl: landSupplyUrl,
        checkedAt: '2026-06-01',
      },
    ],
    notes: [
      `${cityName}已作为前期证照城市模板规则发布，项目命中该城市时直接叠加城市资料包。`,
      `城市模板只补充本地资料口径，不替代${provinceName}省级资料包。`,
      '普通前端展示合成后的地区资料包，不展示触发解释、未触发解释或人工确认说明。',
    ],
  }
}

function withCityCertificateDeepCoverage(
  override: CertificateTemplateCityOverride,
): CertificateTemplateCityOverride {
  const sourceEvidenceByType = new Map(
    (override.governedSourceEvidence ?? [])
      .map((source) => [source.sourceType, source] as const),
  )
  const fallbackPolicySources = override.policySources
  const engineeringApprovalSource = sourceEvidenceByType.get('engineering_approval_portal') ?? fallbackPolicySources[0]
  const planningSource = sourceEvidenceByType.get('planning_natural_resources') ?? fallbackPolicySources[1] ?? fallbackPolicySources[0]
  const housingSource = sourceEvidenceByType.get('housing_construction_permit') ?? fallbackPolicySources[2] ?? fallbackPolicySources[0]
  const landSupplySource = sourceEvidenceByType.get('land_supply_or_transaction') ?? fallbackPolicySources[3] ?? fallbackPolicySources[fallbackPolicySources.length - 1] ?? fallbackPolicySources[0]
  const toEvidence = (
    sourceType: CertificateTemplateLocalOverrideSourceType,
    source: CertificateTemplateProvincePolicySource | CertificateTemplateLocalOverrideSourceEvidence | undefined,
  ): CertificateTemplateLocalOverrideSourceEvidence => ({
    sourceType,
    sourceName: source?.sourceName ?? `${override.cityName} local certificate policy source`,
    sourceUrl: source?.sourceUrl ?? 'https://www.gov.cn/',
    checkedAt: source?.checkedAt ?? override.lastReviewedAt,
  })

  return {
    ...override,
    handlingAuthorityOverrides: {
      land: `${override.cityName}自然资源主管部门 / 不动产登记机构`,
      landUsePlanning: `${override.cityName}自然资源和规划主管部门`,
      engineeringPlanning: `${override.cityName}自然资源和规划主管部门 / 工程规划审查窗口`,
      constructionPermit: `${override.cityName}住房城乡建设主管部门 / 工程建设审批综合窗口`,
      ...(override.handlingAuthorityOverrides ?? {}),
    },
    reusableOutputOverrides: {
      landToLandUsePlanning: [
        `${override.cityName}土地出让合同、成交确认书或供地批准成果`,
        `${override.cityName}宗地图、用地红线、交地确认或权属链材料`,
        ...(override.reusableOutputOverrides?.landToLandUsePlanning ?? []),
      ],
      landUsePlanningToEngineeringPlanning: [
        `${override.cityName}建设用地规划许可证及规划条件`,
        `${override.cityName}用地红线、规划条件附图和宗地图成果`,
        ...(override.reusableOutputOverrides?.landUsePlanningToEngineeringPlanning ?? []),
      ],
      engineeringPlanningToConstructionPermit: [
        `${override.cityName}建设工程规划许可证及审定设计方案`,
        `${override.cityName}规划核实前置资料、总平面图和单体方案成果`,
        ...(override.reusableOutputOverrides?.engineeringPlanningToConstructionPermit ?? []),
      ],
      drawingReviewToConstructionPermit: [
        `${override.cityName}施工图审查合格书或联合审图成果`,
        `${override.cityName}消防、人防、质量安全监督和现场开工条件资料`,
        ...(override.reusableOutputOverrides?.drawingReviewToConstructionPermit ?? []),
      ],
    },
    governedSourceTypes: [
      'engineering_approval_portal',
      'planning_natural_resources',
      'housing_construction_permit',
      'land_supply_or_transaction',
    ],
    governedSourceEvidence: [
      toEvidence('engineering_approval_portal', engineeringApprovalSource),
      toEvidence('planning_natural_resources', planningSource),
      toEvidence('housing_construction_permit', housingSource),
      toEvidence('land_supply_or_transaction', landSupplySource),
    ],
  }
}

const DIRECT_CITY_CERTIFICATE_OVERRIDES: CertificateTemplateCityOverride[] = [
  createPublishedCityCertificateOverride({
    provinceCode: 'tianjin',
    provinceName: '天津市',
    cityCode: 'tianjin',
    cityName: '天津市',
    aliases: ['天津', '滨海新区', 'binhaixinqu'],
    engineeringApprovalUrl: 'https://zwfw.tj.gov.cn/',
    planningNaturalResourcesUrl: 'https://ghhzrzy.tj.gov.cn/',
    housingConstructionUrl: 'https://zfcxjs.tj.gov.cn/',
    landSupplyUrl: 'https://ggzy.zwfwb.tj.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'chongqing',
    provinceName: '重庆市',
    cityCode: 'chongqing',
    cityName: '重庆市',
    aliases: ['重庆', '两江新区', 'liangjiang'],
    engineeringApprovalUrl: 'https://zwfw.cq.gov.cn/',
    planningNaturalResourcesUrl: 'https://ghzrzyj.cq.gov.cn/',
    housingConstructionUrl: 'https://zfcxjw.cq.gov.cn/',
    landSupplyUrl: 'https://ghzrzyj.cq.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'shandong',
    provinceName: '山东省',
    cityCode: 'qingdao',
    cityName: '青岛市',
    aliases: ['青岛', '崂山', 'qingdao'],
    engineeringApprovalUrl: 'https://qdzwfw.sd.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzygh.qingdao.gov.cn/',
    housingConstructionUrl: 'https://zjj.qingdao.gov.cn/',
    landSupplyUrl: 'https://ggzy.qingdao.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'zhejiang',
    provinceName: '浙江省',
    cityCode: 'ningbo',
    cityName: '宁波市',
    aliases: ['宁波', '鄞州', 'ningbo'],
    engineeringApprovalUrl: 'https://www.zjzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zgj.ningbo.gov.cn/',
    housingConstructionUrl: 'https://zjw.ningbo.gov.cn/',
    landSupplyUrl: 'https://jyxt.zwb.ningbo.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'fujian',
    provinceName: '福建省',
    cityCode: 'xiamen',
    cityName: '厦门市',
    aliases: ['厦门', '湖里', 'xiamen'],
    engineeringApprovalUrl: 'https://zwfw.fujian.gov.cn/',
    planningNaturalResourcesUrl: 'https://zygh.xm.gov.cn/',
    housingConstructionUrl: 'https://js.xm.gov.cn/',
    landSupplyUrl: 'https://zygh.xm.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'anhui',
    provinceName: '安徽省',
    cityCode: 'hefei',
    cityName: '合肥市',
    aliases: ['合肥', '蜀山', 'hefei'],
    engineeringApprovalUrl: 'https://hf.ahzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyhghj.hefei.gov.cn/',
    housingConstructionUrl: 'https://cxjsj.hefei.gov.cn/',
    landSupplyUrl: 'https://ggzy.hefei.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'jiangsu',
    provinceName: '江苏省',
    cityCode: 'wuxi',
    cityName: '无锡市',
    aliases: ['无锡', '新吴', 'wuxi'],
    engineeringApprovalUrl: 'https://wx.jszwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzy.wuxi.gov.cn/',
    housingConstructionUrl: 'https://js.wuxi.gov.cn/',
    landSupplyUrl: 'https://ggzyjy.wuxi.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'guangdong',
    provinceName: '广东省',
    cityCode: 'foshan',
    cityName: '佛山市',
    aliases: ['佛山', '顺德', 'foshan'],
    engineeringApprovalUrl: 'https://www.gdzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://fszrzy.foshan.gov.cn/',
    housingConstructionUrl: 'https://fszj.foshan.gov.cn/',
    landSupplyUrl: 'https://ggzy.foshan.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'henan',
    provinceName: '河南省',
    cityCode: 'zhengzhou',
    cityName: '郑州市',
    aliases: ['郑州', '郑东新区', 'zhengzhou'],
    engineeringApprovalUrl: 'https://zz.hnzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyhghj.zhengzhou.gov.cn/',
    housingConstructionUrl: 'https://zzjs.zhengzhou.gov.cn/',
    landSupplyUrl: 'https://zzggzy.zhengzhou.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'hunan',
    provinceName: '湖南省',
    cityCode: 'changsha',
    cityName: '长沙市',
    aliases: ['长沙', '岳麓区', '湘江新区', 'changsha'],
    engineeringApprovalUrl: 'https://zwfw-new.hunan.gov.cn/',
    planningNaturalResourcesUrl: 'https://zygh.changsha.gov.cn/',
    housingConstructionUrl: 'https://szjw.changsha.gov.cn/',
    landSupplyUrl: 'https://csggzy.changsha.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'shandong',
    provinceName: '山东省',
    cityCode: 'jinan',
    cityName: '济南市',
    aliases: ['济南', '历下区', 'jinan'],
    engineeringApprovalUrl: 'https://jnzwfw.sd.gov.cn/',
    planningNaturalResourcesUrl: 'https://nrp.jinan.gov.cn/',
    housingConstructionUrl: 'https://jncc.jinan.gov.cn/',
    landSupplyUrl: 'https://jnggzy.jinan.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'fujian',
    provinceName: '福建省',
    cityCode: 'fuzhou',
    cityName: '福州市',
    aliases: ['福州', '鼓楼区', 'fuzhou'],
    engineeringApprovalUrl: 'https://zwfw.fujian.gov.cn/',
    planningNaturalResourcesUrl: 'https://zygh.fuzhou.gov.cn/',
    housingConstructionUrl: 'https://fzjw.fuzhou.gov.cn/',
    landSupplyUrl: 'https://zygh.fuzhou.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'liaoning',
    provinceName: '辽宁省',
    cityCode: 'shenyang',
    cityName: '沈阳市',
    aliases: ['沈阳', '浑南区', 'shenyang'],
    engineeringApprovalUrl: 'https://zwfw.ln.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyj.shenyang.gov.cn/',
    housingConstructionUrl: 'https://cxjsj.shenyang.gov.cn/',
    landSupplyUrl: 'https://ggzy.shenyang.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'liaoning',
    provinceName: '辽宁省',
    cityCode: 'dalian',
    cityName: '大连市',
    aliases: ['大连', '金普新区', 'dalian'],
    engineeringApprovalUrl: 'https://zwfw.dl.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzy.dl.gov.cn/',
    housingConstructionUrl: 'https://zjj.dl.gov.cn/',
    landSupplyUrl: 'https://ggzyjy.dl.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'yunnan',
    provinceName: '云南省',
    cityCode: 'kunming',
    cityName: '昆明市',
    aliases: ['昆明', '呈贡区', 'kunming'],
    engineeringApprovalUrl: 'https://zwfw.yn.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzygh.km.gov.cn/',
    housingConstructionUrl: 'https://zfcxjsj.km.gov.cn/',
    landSupplyUrl: 'https://ggzy.yn.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'jiangxi',
    provinceName: '江西省',
    cityCode: 'nanchang',
    cityName: '南昌市',
    aliases: ['南昌', '红谷滩区', 'nanchang'],
    engineeringApprovalUrl: 'https://nc.jxzwfww.gov.cn/',
    planningNaturalResourcesUrl: 'https://bnr.nc.gov.cn/',
    housingConstructionUrl: 'https://zjj.nc.gov.cn/',
    landSupplyUrl: 'https://ggzy.jiangxi.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'hebei',
    provinceName: '河北省',
    cityCode: 'shijiazhuang',
    cityName: '石家庄市',
    aliases: ['石家庄', 'shijiazhuang'],
    engineeringApprovalUrl: 'https://sjz.hbzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyghj.sjz.gov.cn/',
    housingConstructionUrl: 'https://zjj.sjz.gov.cn/',
    landSupplyUrl: 'https://zrzyghj.sjz.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'shanxi',
    provinceName: '山西省',
    cityCode: 'taiyuan',
    cityName: '太原市',
    aliases: ['太原', 'taiyuan'],
    engineeringApprovalUrl: 'https://ty.sxzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://ghzy.taiyuan.gov.cn/',
    housingConstructionUrl: 'https://zjj.taiyuan.gov.cn/',
    landSupplyUrl: 'https://ggzy.xzspglj.taiyuan.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'inner_mongolia',
    provinceName: '内蒙古自治区',
    cityCode: 'hohhot',
    cityName: '呼和浩特市',
    aliases: ['呼和浩特', 'huhehaote', 'hohhot'],
    engineeringApprovalUrl: 'https://zwfw.nmg.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzy.huhhot.gov.cn/',
    housingConstructionUrl: 'https://zfcxjsj.huhhot.gov.cn/',
    landSupplyUrl: 'https://ggzyjy.nmg.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'jilin',
    provinceName: '吉林省',
    cityCode: 'changchun',
    cityName: '长春市',
    aliases: ['长春', 'changchun'],
    engineeringApprovalUrl: 'https://zwfw.jl.gov.cn/',
    planningNaturalResourcesUrl: 'https://ghzrzyj.changchun.gov.cn/',
    housingConstructionUrl: 'https://zjj.changchun.gov.cn/',
    landSupplyUrl: 'https://ghzrzyj.changchun.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'heilongjiang',
    provinceName: '黑龙江省',
    cityCode: 'harbin',
    cityName: '哈尔滨市',
    aliases: ['哈尔滨', 'haerbin', 'harbin'],
    engineeringApprovalUrl: 'https://hrb.hljzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://hrblr.harbin.gov.cn/',
    housingConstructionUrl: 'https://zfcxjsj.harbin.gov.cn/',
    landSupplyUrl: 'https://hrbggzy.harbin.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'jiangsu',
    provinceName: '江苏省',
    cityCode: 'changzhou',
    cityName: '常州市',
    aliases: ['常州', 'changzhou'],
    engineeringApprovalUrl: 'https://cz.jszwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzy.jiangsu.gov.cn/cz/',
    housingConstructionUrl: 'https://zfhcxjsj.changzhou.gov.cn/',
    landSupplyUrl: 'https://ggzy.xzsp.changzhou.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'zhejiang',
    provinceName: '浙江省',
    cityCode: 'wenzhou',
    cityName: '温州市',
    aliases: ['温州', 'wenzhou'],
    engineeringApprovalUrl: 'https://www.zjzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyj.wenzhou.gov.cn/',
    housingConstructionUrl: 'https://zjj.wenzhou.gov.cn/',
    landSupplyUrl: 'https://ggzyjy-eweb.wenzhou.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'guangdong',
    provinceName: '广东省',
    cityCode: 'dongguan',
    cityName: '东莞市',
    aliases: ['东莞', 'dongguan'],
    engineeringApprovalUrl: 'https://www.gdzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://nr.dg.gov.cn/',
    housingConstructionUrl: 'https://zjj.dg.gov.cn/',
    landSupplyUrl: 'https://ggzy.dg.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'guangdong',
    provinceName: '广东省',
    cityCode: 'zhuhai',
    cityName: '珠海市',
    aliases: ['珠海', 'zhuhai'],
    engineeringApprovalUrl: 'https://www.gdzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyj.zhuhai.gov.cn/',
    housingConstructionUrl: 'https://zjj.zhuhai.gov.cn/',
    landSupplyUrl: 'https://ggzy.zhuhai.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'guangxi',
    provinceName: '广西壮族自治区',
    cityCode: 'nanning',
    cityName: '南宁市',
    aliases: ['南宁', 'nanning'],
    engineeringApprovalUrl: 'https://nn.zwfw.gxzf.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyj.nanning.gov.cn/',
    housingConstructionUrl: 'https://zjj.nanning.gov.cn/',
    landSupplyUrl: 'https://ggzy.nanning.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'hainan',
    provinceName: '海南省',
    cityCode: 'haikou',
    cityName: '海口市',
    aliases: ['海口', 'haikou'],
    engineeringApprovalUrl: 'https://wssp.hainan.gov.cn/',
    planningNaturalResourcesUrl: 'https://zzgj.haikou.gov.cn/',
    housingConstructionUrl: 'https://zjj.haikou.gov.cn/',
    landSupplyUrl: 'https://ggzy.haikou.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'guizhou',
    provinceName: '贵州省',
    cityCode: 'guiyang',
    cityName: '贵阳市',
    aliases: ['贵阳', 'guiyang'],
    engineeringApprovalUrl: 'https://zwfw.guizhou.gov.cn/',
    planningNaturalResourcesUrl: 'https://zyghj.guiyang.gov.cn/',
    housingConstructionUrl: 'https://zjj.guiyang.gov.cn/',
    landSupplyUrl: 'https://ggzy.guiyang.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'gansu',
    provinceName: '甘肃省',
    cityCode: 'lanzhou',
    cityName: '兰州市',
    aliases: ['兰州', 'lanzhou'],
    engineeringApprovalUrl: 'https://zwfw.gansu.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyj.lanzhou.gov.cn/',
    housingConstructionUrl: 'https://zjj.lanzhou.gov.cn/',
    landSupplyUrl: 'https://lzggzyjy.lanzhou.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'xinjiang',
    provinceName: '新疆维吾尔自治区',
    cityCode: 'urumqi',
    cityName: '乌鲁木齐市',
    aliases: ['乌鲁木齐', 'wulumuqi', 'urumqi'],
    engineeringApprovalUrl: 'https://zwfw.xinjiang.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyj.urumqi.gov.cn/',
    housingConstructionUrl: 'https://zfcxjsj.urumqi.gov.cn/',
    landSupplyUrl: 'https://ggzy.xinjiang.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'jiangsu',
    provinceName: '江苏省',
    cityCode: 'nantong',
    cityName: '南通市',
    aliases: ['南通', 'nantong'],
    engineeringApprovalUrl: 'https://nt.jszwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzy.jiangsu.gov.cn/nt/',
    housingConstructionUrl: 'https://zjj.nantong.gov.cn/',
    landSupplyUrl: 'https://ggzyjy.nantong.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'zhejiang',
    provinceName: '浙江省',
    cityCode: 'jiaxing',
    cityName: '嘉兴市',
    aliases: ['嘉兴', 'jiaxing'],
    engineeringApprovalUrl: 'https://www.zjzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyhghj.jiaxing.gov.cn/',
    housingConstructionUrl: 'https://jsj.jiaxing.gov.cn/',
    landSupplyUrl: 'https://jxszwsjb.jiaxing.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'shandong',
    provinceName: '山东省',
    cityCode: 'yantai',
    cityName: '烟台市',
    aliases: ['烟台', 'yantai'],
    engineeringApprovalUrl: 'https://ytzwfw.sd.gov.cn/',
    planningNaturalResourcesUrl: 'https://gtj.yantai.gov.cn/',
    housingConstructionUrl: 'https://zjj.yantai.gov.cn/',
    landSupplyUrl: 'https://ggzyjy.yantai.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'shandong',
    provinceName: '山东省',
    cityCode: 'weifang',
    cityName: '潍坊市',
    aliases: ['潍坊', 'weifang'],
    engineeringApprovalUrl: 'https://wfzwfw.sd.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyhgh.weifang.gov.cn/',
    housingConstructionUrl: 'https://jsj.weifang.gov.cn/',
    landSupplyUrl: 'https://ggzy.weifang.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'henan',
    provinceName: '河南省',
    cityCode: 'luoyang',
    cityName: '洛阳市',
    aliases: ['洛阳', 'luoyang'],
    engineeringApprovalUrl: 'https://ly.hnzwfw.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyhgh.ly.gov.cn/',
    housingConstructionUrl: 'https://zjj.ly.gov.cn/',
    landSupplyUrl: 'https://lyggzyjy.ly.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'hubei',
    provinceName: '湖北省',
    cityCode: 'xiangyang',
    cityName: '襄阳市',
    aliases: ['襄阳', 'xiangyang'],
    engineeringApprovalUrl: 'https://zwfw.hubei.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzygh.xiangyang.gov.cn/',
    housingConstructionUrl: 'https://zjj.xiangyang.gov.cn/',
    landSupplyUrl: 'https://ggzy.xiangyang.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'hunan',
    provinceName: '湖南省',
    cityCode: 'zhuzhou',
    cityName: '株洲市',
    aliases: ['株洲', 'zhuzhou'],
    engineeringApprovalUrl: 'https://zwfw-new.hunan.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyhghj.zhuzhou.gov.cn/',
    housingConstructionUrl: 'https://zjj.zhuzhou.gov.cn/',
    landSupplyUrl: 'https://zrzyhghj.zhuzhou.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'sichuan',
    provinceName: '四川省',
    cityCode: 'mianyang',
    cityName: '绵阳市',
    aliases: ['绵阳', 'mianyang'],
    engineeringApprovalUrl: 'https://zwfw.sc.gov.cn/',
    planningNaturalResourcesUrl: 'https://zrzyj.my.gov.cn/',
    housingConstructionUrl: 'https://zjj.my.gov.cn/',
    landSupplyUrl: 'https://ggzy.my.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'sichuan',
    provinceName: '四川省',
    cityCode: 'yibin',
    cityName: '宜宾市',
    aliases: ['宜宾', 'yibin'],
    engineeringApprovalUrl: 'https://zwfw.sc.gov.cn/',
    planningNaturalResourcesUrl: 'https://zygh.yibin.gov.cn/',
    housingConstructionUrl: 'https://zjj.yibin.gov.cn/',
    landSupplyUrl: 'https://ggzy.yibin.gov.cn/',
  }),
  createPublishedCityCertificateOverride({
    provinceCode: 'fujian',
    provinceName: '福建省',
    cityCode: 'quanzhou',
    cityName: '泉州市',
    aliases: ['泉州', 'quanzhou'],
    engineeringApprovalUrl: 'https://zwfw.fujian.gov.cn/',
    planningNaturalResourcesUrl: 'https://zygh.quanzhou.gov.cn/',
    housingConstructionUrl: 'https://zfjsj.quanzhou.gov.cn/',
    landSupplyUrl: 'https://ggzyjy.quanzhou.gov.cn/',
  }),
]

export const GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE: CertificateTemplateSeed = {
  templateCode: GENERAL_CERTIFICATE_TEMPLATE_CODE,
  templateName: '通用建设工程四证办理模板',
  seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
  sourceVersion: 'four-cert-flow-2026-05-26',
  scope: 'general_construction',
  evidenceLevel: 'B',
  governanceStatus: 'system_default',
  appliesWhen: [
    {
      field: 'projectTypeCode',
      operator: 'exists',
      reason: '项目类型缺失时仍可使用通用建设工程四证骨架作为默认草稿。',
    },
  ],
  certificates: [
    {
      certificateType: 'land_certificate',
      certificateName: '土地证',
      defaultStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源主管部门',
      sortOrder: 10,
      requiredPolicy: 'required',
      reason: '土地取得与权属资料是后续用地规划、工程规划和施工许可的基础。',
    },
    {
      certificateType: 'land_use_planning_permit',
      certificateName: '用地规划许可证',
      defaultStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      sortOrder: 20,
      requiredPolicy: 'required',
      reason: '用地规划许可承接土地取得成果，是工程规划许可的常见前序节点。',
    },
    {
      certificateType: 'engineering_planning_permit',
      certificateName: '工程规划许可证',
      defaultStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      sortOrder: 30,
      requiredPolicy: 'required',
      reason: '工程规划许可确认设计方案、蓝图和规划审查结果。',
    },
    {
      certificateType: 'construction_permit',
      certificateName: '施工许可证',
      defaultStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '住房和城乡建设主管部门',
      sortOrder: 40,
      requiredPolicy: 'required',
      reason: '施工许可是开工前关键准入证照，依赖图审、合同、安监和现场条件。',
    },
  ],
  materialPackages: [
    {
      packageCode: 'PKG-CERT-LAND-COMMON',
      packageName: '土地证通用资料包',
      packageScope: 'certificate_common',
      certificateTypes: ['land_certificate'],
      workItemCodes: COMMON_LAND_CERTIFICATE_PACKAGE_CODES,
      materialNames: ['项目基础资料', '立项备案资料', '土地成交确认', '土地税费资料', '交地资料'],
      policyBasis: ['用户提供四证办理流程图：土地证前置资料路径'],
      requiredPolicy: 'required',
      sortOrder: 10,
    },
    {
      packageCode: 'PKG-CERT-LUP-COMMON',
      packageName: '用地规划许可通用资料包',
      packageScope: 'certificate_common',
      certificateTypes: ['land_use_planning_permit'],
      workItemCodes: COMMON_LAND_USE_PLANNING_PACKAGE_CODES,
      materialNames: ['项目基础资料', '立项备案资料', '可行性研究及批复', '规划条件', '方案设计文本与确认'],
      policyBasis: ['用户提供四证办理流程图：用地规划许可资料路径'],
      requiredPolicy: 'required',
      sortOrder: 20,
    },
    {
      packageCode: 'PKG-CERT-EPP-COMMON',
      packageName: '工程规划许可通用资料包',
      packageScope: 'certificate_common',
      certificateTypes: ['engineering_planning_permit'],
      workItemCodes: COMMON_ENGINEERING_PLANNING_PACKAGE_CODES,
      materialNames: ['项目基础资料', '立项备案资料', '规划条件', '方案设计文本与确认', '施工图审查资料'],
      policyBasis: ['用户提供四证办理流程图：工程规划许可资料路径'],
      requiredPolicy: 'required',
      sortOrder: 30,
    },
    {
      packageCode: 'PKG-CERT-CP-COMMON',
      packageName: '施工许可通用资料包',
      packageScope: 'certificate_common',
      certificateTypes: ['construction_permit'],
      workItemCodes: COMMON_CONSTRUCTION_PERMIT_PACKAGE_CODES,
      materialNames: ['项目基础资料', '立项备案资料', '审图合格证', '质量安全监督手续', '施工合同及参建单位资料', '现场开工条件'],
      policyBasis: ['用户提供四证办理流程图：施工许可资料路径'],
      requiredPolicy: 'required',
      sortOrder: 40,
    },
  ],
  handlingSteps: [
    {
      stepCode: 'LAND-ACQUISITION-PRECHECK',
      certificateType: 'land_certificate',
      stepName: '土地取得方式资料核验',
      sourceParties: ['建设单位', '土地交易机构', '自然资源主管部门', '税务主管部门'],
      handlingAuthority: '自然资源主管部门、不动产登记机构或土地交易窗口',
      submitMaterials: ['出让合同或划拨决定', '成交确认或交地资料', '完税或缴费资料', '宗地图、红线图或界址资料'],
      outputDocument: '土地取得方式资料核验清单',
      satisfiesMaterialCodes: ['CERT-DOC-LAND-TRANSFER', 'CERT-DOC-LAND-TAX', 'CERT-DOC-LAND-HANDOVER'],
      satisfiesMaterials: ['土地取得方式资料', '土地交易或划拨成果', '交地和完税资料'],
      reusableForCertificateTypes: [
        'land_certificate',
        'land_use_planning_permit',
        'engineering_planning_permit',
        'construction_permit',
      ],
      blockingLevel: 'certificate_gate',
      sortOrder: 5,
    },
    {
      stepCode: 'LAND-OWNERSHIP-REGISTRATION',
      certificateType: 'land_certificate',
      stepName: '土地权属登记',
      sourceParties: ['建设单位', '土地交易或权属资料出具方'],
      handlingAuthority: '不动产登记机构',
      submitMaterials: ['土地取得文件', '完税证明', '权籍调查或宗地图', '企业基础资料'],
      outputDocument: '不动产权证书或国有土地使用证',
      satisfiesMaterialCodes: ['CERT-LAND-ISSUE'],
      satisfiesMaterials: ['土地权属成果'],
      reusableForCertificateTypes: [
        'land_use_planning_permit',
        'engineering_planning_permit',
        'construction_permit',
      ],
      blockingLevel: 'certificate_gate',
      sortOrder: 10,
    },
    {
      stepCode: 'LUP-LAND-METHOD-MATERIALS',
      certificateType: 'land_use_planning_permit',
      stepName: '土地取得方式资料确认',
      sourceParties: ['建设单位', '自然资源主管部门', '不动产登记机构或土地交易窗口'],
      handlingAuthority: '自然资源和规划主管部门',
      submitMaterials: ['土地取得方式资料核验清单', '不动产权属成果或土地取得文件', '宗地图、红线图或规划条件附图'],
      outputDocument: '用地规划申报土地资料确认单',
      satisfiesMaterialCodes: ['CERT-LAND-ISSUE', 'CERT-DOC-LAND-TRANSFER'],
      satisfiesMaterials: ['土地取得方式资料', '土地权属或取得证明'],
      reusableForCertificateTypes: ['land_use_planning_permit', 'engineering_planning_permit', 'construction_permit'],
      blockingLevel: 'certificate_gate',
      sortOrder: 15,
    },
    {
      stepCode: 'LUP-PRE-REVIEW-SELECTION',
      certificateType: 'land_use_planning_permit',
      stepName: '用地预审与选址或规划条件确认',
      sourceParties: ['建设单位', '发展改革主管部门', '自然资源主管部门'],
      handlingAuthority: '自然资源和规划主管部门',
      submitMaterials: ['立项资料', '项目用地申请', '土地取得或权属成果', '选址或规划条件申请材料'],
      outputDocument: '用地预审与选址意见或规划条件',
      satisfiesMaterialCodes: ['CERT-LAND-ALLOCATION-PRESELECTION', 'CERT-DOC-PLANNING-CONDITIONS'],
      satisfiesMaterials: ['用地预审与选址意见', '规划条件确认成果'],
      reusableForCertificateTypes: ['land_use_planning_permit', 'engineering_planning_permit'],
      blockingLevel: 'certificate_gate',
      sortOrder: 20,
    },
    {
      stepCode: 'LUP-MATERIAL-SUBMISSION',
      certificateType: 'land_use_planning_permit',
      stepName: '用地规划许可报批',
      sourceParties: ['建设单位', '自然资源主管部门'],
      handlingAuthority: '自然资源和规划主管部门',
      submitMaterials: ['立项资料', '土地取得或权属成果', '红线图或宗地图', '用地预审或规划条件成果'],
      outputDocument: '建设用地规划许可受理或补正意见',
      satisfiesMaterialCodes: ['CERT-LUP-SUBMIT'],
      satisfiesMaterials: ['用地规划许可受理成果'],
      reusableForCertificateTypes: ['land_use_planning_permit'],
      blockingLevel: 'certificate_gate',
      sortOrder: 30,
    },
    {
      stepCode: 'LUP-PERMIT-ISSUE',
      certificateType: 'land_use_planning_permit',
      stepName: '用地规划许可核发',
      sourceParties: ['建设单位', '自然资源主管部门'],
      handlingAuthority: '自然资源和规划主管部门',
      submitMaterials: ['用地规划许可受理材料', '红线图或宗地图', '规划条件确认成果'],
      outputDocument: '建设用地规划许可证及规划条件确认成果',
      satisfiesMaterialCodes: ['CERT-LUP-ISSUE', 'CERT-DOC-PLANNING-CONDITIONS'],
      satisfiesMaterials: ['建设用地规划许可证', '规划条件确认成果'],
      reusableForCertificateTypes: ['engineering_planning_permit'],
      blockingLevel: 'certificate_gate',
      sortOrder: 40,
    },
    {
      stepCode: 'EPP-DESIGN-PACKAGE-ASSEMBLY',
      certificateType: 'engineering_planning_permit',
      stepName: '方案资料组包',
      sourceParties: ['建设单位', '设计单位', '勘察单位'],
      handlingAuthority: '建设单位内部审查或工程建设项目审批窗口',
      submitMaterials: ['用地规划许可成果', '规划条件确认成果', '方案设计文本', '总平面图、单体图、立面剖面图', '经济技术指标'],
      outputDocument: '工程规划许可方案资料包',
      satisfiesMaterialCodes: ['CERT-DOC-DESIGN-SCHEME'],
      satisfiesMaterials: ['方案设计文本', '规划报建图纸', '经济技术指标'],
      reusableForCertificateTypes: ['engineering_planning_permit'],
      blockingLevel: 'supporting',
      sortOrder: 45,
    },
    {
      stepCode: 'EPP-SCHEME-REVIEW',
      certificateType: 'engineering_planning_permit',
      stepName: '方案审查确认',
      sourceParties: ['建设单位', '设计单位'],
      handlingAuthority: '自然资源和规划主管部门',
      submitMaterials: ['工程规划许可方案资料包', '用地规划许可成果', '规划条件确认成果', '方案初审或窗口受理材料'],
      outputDocument: '方案审查确认成果',
      satisfiesMaterialCodes: ['CERT-EPP-SCHEME-EXPERT'],
      satisfiesMaterials: ['方案审查确认成果'],
      reusableForCertificateTypes: ['engineering_planning_permit'],
      blockingLevel: 'supporting',
      sortOrder: 50,
    },
    {
      stepCode: 'EPP-PUBLIC-NOTICE-OR-COMMITTEE',
      certificateType: 'engineering_planning_permit',
      stepName: '方案公示或规委会审查',
      sourceParties: ['建设单位', '设计单位', '自然资源和规划主管部门'],
      handlingAuthority: '自然资源和规划主管部门或规划委员会审查机构',
      submitMaterials: ['方案审查确认成果', '公示文本或规委会汇报材料', '公众意见或部门会签材料'],
      outputDocument: '方案公示、规委会或内部审查确认意见',
      satisfiesMaterialCodes: ['CERT-EPP-PUBLIC-NOTICE', 'CERT-EPP-COMMITTEE'],
      satisfiesMaterials: ['方案公示意见', '规委会或内部审查意见'],
      reusableForCertificateTypes: ['engineering_planning_permit'],
      blockingLevel: 'supporting',
      sortOrder: 55,
    },
    {
      stepCode: 'EPP-SPECIAL-TECHNICAL-REVIEW',
      certificateType: 'engineering_planning_permit',
      stepName: '专项技术审查',
      sourceParties: ['建设单位', '设计单位', '专项咨询单位'],
      handlingAuthority: '自然资源和规划主管部门及相关专项主管部门',
      submitMaterials: ['方案设计文本', '交通影响评价', '日照分析', '消防、人防或市政专项资料'],
      outputDocument: '专项技术审查意见',
      satisfiesMaterialCodes: ['CERT-DOC-TRAFFIC-IMPACT', 'CERT-DOC-HUMAN-DEFENSE-REVIEW'],
      satisfiesMaterials: ['专项技术审查意见'],
      reusableForCertificateTypes: ['engineering_planning_permit', 'construction_permit'],
      blockingLevel: 'supporting',
      sortOrder: 60,
    },
    {
      stepCode: 'EPP-BLUEPRINT-CHECK',
      certificateType: 'engineering_planning_permit',
      stepName: '规划报建图纸校核',
      sourceParties: ['建设单位', '设计单位'],
      handlingAuthority: '自然资源和规划主管部门或规划技术审查机构',
      submitMaterials: ['总平面图', '单体图', '定位图', '日照或规划技术校核材料'],
      outputDocument: '规划报建图纸校核成果',
      satisfiesMaterialCodes: ['CERT-EPP-BLUEPRINT-CHECK'],
      satisfiesMaterials: ['规划报建图纸校核成果'],
      reusableForCertificateTypes: ['engineering_planning_permit'],
      blockingLevel: 'supporting',
      sortOrder: 70,
    },
    {
      stepCode: 'EPP-PERMIT-ISSUE',
      certificateType: 'engineering_planning_permit',
      stepName: '工程规划许可核发',
      sourceParties: ['建设单位', '设计单位'],
      handlingAuthority: '自然资源和规划主管部门',
      submitMaterials: ['用地规划许可成果', '方案审查确认成果', '规划报建图纸'],
      outputDocument: '建设工程规划许可证',
      satisfiesMaterialCodes: ['CERT-EPP-ISSUE'],
      satisfiesMaterials: ['建设工程规划许可证'],
      reusableForCertificateTypes: ['construction_permit'],
      blockingLevel: 'certificate_gate',
      sortOrder: 80,
    },
    {
      stepCode: 'CP-BIDDING-CONTRACT-LOCK',
      certificateType: 'construction_permit',
      stepName: '招采与合同锁定',
      sourceParties: ['建设单位', '施工单位', '监理单位', '招标代理或造价咨询单位'],
      handlingAuthority: '招投标监管部门、公共资源交易平台或工程建设项目审批窗口',
      submitMaterials: ['招标或直接发包资料', '施工中标通知书', '监理中标通知书', '施工合同和监理合同'],
      outputDocument: '施工、监理中标与合同锁定成果',
      satisfiesMaterialCodes: ['CERT-CP-TENDER-NOTICE', 'CERT-DOC-CONSTRUCTION-CONTRACT'],
      satisfiesMaterials: ['施工和监理中标通知', '施工合同及参建单位资料'],
      reusableForCertificateTypes: ['construction_permit'],
      blockingLevel: 'startup_gate',
      sortOrder: 85,
    },
    {
      stepCode: 'CP-DRAWING-REVIEW',
      certificateType: 'construction_permit',
      stepName: '施工图审查',
      sourceParties: ['建设单位', '设计单位'],
      handlingAuthority: '施工图审查机构',
      submitMaterials: ['全套施工图', '勘察设计成果', '规划许可成果'],
      outputDocument: '审图合格证',
      satisfiesMaterialCodes: ['CERT-DOC-DRAWING-REVIEW'],
      satisfiesMaterials: ['施工图审查成果'],
      reusableForCertificateTypes: ['construction_permit'],
      blockingLevel: 'startup_gate',
      sortOrder: 90,
    },
    {
      stepCode: 'CP-FIRE-HFD-SPECIALS',
      certificateType: 'construction_permit',
      stepName: '消防人防与专项审查',
      sourceParties: ['建设单位', '设计单位', '施工图审查机构', '专项审查主管部门'],
      handlingAuthority: '住房和城乡建设主管部门、人防或专项审查主管部门',
      submitMaterials: ['工程规划许可成果', '施工图审查成果', '消防设计文件', '人防或专项设计资料'],
      outputDocument: '消防、人防或专项审查资料',
      satisfiesMaterialCodes: ['CERT-CP-FIRE-REVIEW', 'CERT-CP-HFD-CERT'],
      satisfiesMaterials: ['消防设计审查或备案资料', '人防或专项审查合格证'],
      reusableForCertificateTypes: ['construction_permit'],
      blockingLevel: 'startup_gate',
      sortOrder: 95,
    },
    {
      stepCode: 'CP-CONTRACT-PARTICIPANTS',
      certificateType: 'construction_permit',
      stepName: '合同与参建单位资料确认',
      sourceParties: ['建设单位', '施工单位', '监理单位', '招标代理或造价咨询单位'],
      handlingAuthority: '住房和城乡建设主管部门或工程建设项目审批窗口',
      submitMaterials: ['施工合同', '监理合同', '中标通知书', '参建单位资质和项目负责人资料'],
      outputDocument: '施工、监理等参建单位合同资料',
      satisfiesMaterialCodes: ['CERT-DOC-CONSTRUCTION-CONTRACT'],
      satisfiesMaterials: ['施工合同及参建单位资料'],
      reusableForCertificateTypes: ['construction_permit'],
      blockingLevel: 'startup_gate',
      sortOrder: 100,
    },
    {
      stepCode: 'CP-QUALITY-SAFETY',
      certificateType: 'construction_permit',
      stepName: '质量安全监督手续',
      sourceParties: ['建设单位', '施工单位', '监理单位'],
      handlingAuthority: '住房和城乡建设主管部门或质量安全监督机构',
      submitMaterials: ['参建单位资料', '施工组织设计', '质量安全责任资料', '现场开工条件资料'],
      outputDocument: '质量安全监督手续',
      satisfiesMaterialCodes: ['CERT-DOC-QUALITY-SAFETY'],
      satisfiesMaterials: ['质量安全监督手续'],
      reusableForCertificateTypes: ['construction_permit'],
      blockingLevel: 'startup_gate',
      sortOrder: 110,
    },
    {
      stepCode: 'CP-WAGE-REALNAME-DUST',
      certificateType: 'construction_permit',
      stepName: '工资实名制与扬尘治理',
      sourceParties: ['建设单位', '施工单位', '监理单位', '属地监管平台'],
      handlingAuthority: '住房和城乡建设主管部门、人社主管部门或属地监管平台',
      submitMaterials: ['农民工工资专户或保证金资料', '实名制平台开通资料', '扬尘治理方案', '文明施工和现场管理承诺'],
      outputDocument: '农民工工资、实名制和扬尘治理资料',
      satisfiesMaterialCodes: ['CERT-DOC-SITE-CONDITIONS'],
      satisfiesMaterials: ['工资支付保障资料', '实名制资料', '扬尘治理资料'],
      reusableForCertificateTypes: ['construction_permit'],
      blockingLevel: 'startup_gate',
      sortOrder: 115,
    },
    {
      stepCode: 'CP-SITE-CONDITIONS',
      certificateType: 'construction_permit',
      stepName: '现场开工条件核验',
      sourceParties: ['建设单位', '施工单位', '监理单位'],
      handlingAuthority: '住房和城乡建设主管部门、质量安全监督机构或属地审批窗口',
      submitMaterials: ['施工组织设计', '现场围挡和临设照片', '实名制和扬尘治理资料', '开工条件承诺或核验表'],
      outputDocument: '现场具备开工条件确认材料',
      satisfiesMaterialCodes: ['CERT-DOC-SITE-CONDITIONS'],
      satisfiesMaterials: ['现场开工条件'],
      reusableForCertificateTypes: ['construction_permit'],
      blockingLevel: 'startup_gate',
      sortOrder: 120,
    },
    {
      stepCode: 'CP-PERMIT-ISSUE',
      certificateType: 'construction_permit',
      stepName: '施工许可核发',
      sourceParties: ['建设单位', '施工单位', '监理单位'],
      handlingAuthority: '住房和城乡建设主管部门',
      submitMaterials: ['工程规划许可成果', '审图合格证', '质量安全监督手续', '施工合同及参建单位资料', '现场开工条件'],
      outputDocument: '施工许可证',
      satisfiesMaterialCodes: ['CERT-CP-ISSUE'],
      satisfiesMaterials: ['施工许可证'],
      reusableForCertificateTypes: [],
      blockingLevel: 'startup_gate',
      sortOrder: 130,
    },
  ],
  landAcquisitionMethods: [
    {
      methodCode: 'transfer',
      methodName: '出让取得',
      description: '通过招拍挂、协议出让等方式取得国有建设用地使用权。',
      defaultSelected: true,
      workItemCodes: TRANSFER_LAND_WORK_ITEM_CODES,
      materialNames: ['出让合同', '场地红线图', '交地单', '契税、印花税缴纳', '完税证明'],
      policyBasis: ['用户提供四证办理流程图: 土地证路径'],
      recommendedFor: ['招拍挂出让', '协议出让取得土地的项目', '市场化取得土地的开发建设项目'],
    },
    {
      methodCode: 'allocation',
      methodName: '划拨取得',
      description: '通过划拨决定、批准文件或选址预审路径取得建设用地。',
      workItemCodes: ALLOCATION_LAND_WORK_ITEM_CODES,
      materialNames: ['划拨决定书', '建设项目用地预审与选址意见'],
      policyBasis: ['全国通用四证骨架省级 profile 待治理'],
      recommendedFor: ['政府投资项目', '公共服务设施', '符合划拨目录的建设项目'],
    },
    {
      methodCode: 'existing_land',
      methodName: '存量用地 / 自有土地',
      description: '项目主体已持有土地权属或需在既有用地上补办、变更建设证照。',
      workItemCodes: EXISTING_LAND_WORK_ITEM_CODES,
      materialNames: ['不动产权证或国有土地使用证', '权属变更或用途变更资料'],
      policyBasis: ['全国通用四证骨架省级 profile 待治理'],
      recommendedFor: ['自有土地开发', '存量用地改造', '土地权属已取得但需补办建设手续'],
    },
    {
      methodCode: 'redevelopment',
      methodName: '改扩建 / 城市更新',
      description: '在城市更新、旧改、改扩建等场景中衔接既有权属、更新实施方案和建设许可。',
      workItemCodes: REDEVELOPMENT_LAND_WORK_ITEM_CODES,
      materialNames: ['城市更新实施方案或改扩建立项依据', '既有权属及范围核验资料'],
      policyBasis: ['全国通用四证骨架省级 profile 待治理'],
      recommendedFor: ['城市更新', '旧改', '既有建筑改扩建'],
    },
  ],
  provinceProfiles: [
    {
      provinceCode: 'default',
      provinceName: '全国通用',
      profileVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      reviewStatus: 'published',
      policyLevel: 'national',
      effectiveFrom: '2026-05-27',
      lastReviewedAt: '2026-05-27',
      nextReviewDueAt: '2026-08-27',
      curationMethod: 'governed_seed',
      authorityAliases: {},
      additionalWorkItemCodes: [],
      optionalWorkItemCodes: [],
      softDependencyCodes: ['DEP-LAND-TO-LUP'],
      materialOverrides: [],
      materialPackageOverrides: [],
      policySources: [
        {
          sourceName: '工程建设项目审批制度改革通用口径',
          sourceUrl: 'https://www.gov.cn/zhengce/content/2019-03/26/content_5377044.htm',
          checkedAt: '2026-05-27',
          updateMode: 'governed_seed_update',
          policyLevel: 'national',
        },
      ],
      notes: [
        '全国通用 profile 只叠加材料和提示，不复制整套四证模板。',
        '地方政策更新通过治理后的 seed/profile 版本进入系统，不在页面加载时直接抓取并改写模板。',
      ],
    },
    {
      provinceCode: 'guangdong',
      provinceName: '广东省',
      profileVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      reviewStatus: 'published',
      policyLevel: 'province',
      effectiveFrom: '2026-05-27',
      lastReviewedAt: '2026-05-27',
      nextReviewDueAt: '2026-08-27',
      curationMethod: 'governed_seed',
      authorityAliases: {
        naturalResources: '自然资源主管部门',
        housingConstruction: '住房城乡建设主管部门',
        approvalWindow: '工程建设项目审批综合窗口',
      },
      additionalWorkItemCodes: [],
      optionalWorkItemCodes: ['CERT-DOC-TRAFFIC-IMPACT', 'CERT-EPP-PUBLIC-NOTICE', 'CERT-EPP-BLUEPRINT-CHECK'],
      softDependencyCodes: ['DEP-LAND-TO-LUP', 'DEP-TRAFFIC-TO-EPP', 'DEP-BLUEPRINT-CHECK-TO-EPP'],
      materialOverrides: [
        {
          landAcquisitionMethodCode: 'transfer',
          addMaterialNames: [
            '广东省工程建设项目审批窗口资料清单',
            '广东省投资项目在线审批监管平台项目代码',
            '土地出让合同、成交确认及价款缴纳凭证',
            '宗地图、界址点成果及交地确认材料',
          ],
          addPolicyBasis: ['广东省 profile：出让取得资料包补充', '广东省 profile：出让取得土地权属链资料包补充'],
          addRecommendedFor: ['广东省内通过出让取得土地的建设项目'],
        },
      ],
      materialPackageOverrides: [
        {
          materialPackageCode: 'PKG-CERT-LAND-COMMON',
          addMaterialNames: [
            '广东省投资项目在线审批监管平台项目代码',
            '土地出让合同、成交确认及价款缴纳凭证',
            '宗地图、界址点成果及交地确认材料',
            '契税、印花税及完税证明材料',
          ],
          addPolicyBasis: ['广东省 profile：土地取得及权属链资料包补充'],
        },
        {
          materialPackageCode: 'PKG-CERT-LUP-COMMON',
          addMaterialNames: [
            '建设用地规划许可统一申请表',
            '土地取得或权属证明材料',
            '用地红线、规划条件及宗地图附图',
            '立项用地规划许可阶段一套申报材料',
          ],
          addPolicyBasis: ['广东省 profile：立项用地规划许可阶段资料包补充'],
        },
        {
          materialPackageCode: 'PKG-CERT-EPP-COMMON',
          addMaterialNames: [
            '建设工程设计方案文本及总平面图',
            '联合测绘或规划技术审查材料',
            '方案公示或部门并联意见材料',
            '工程建设许可阶段一套申报材料',
          ],
          addPolicyBasis: ['广东省 profile：工程建设许可阶段资料包补充'],
        },
        {
          materialPackageCode: 'PKG-CERT-CP-COMMON',
          addMaterialNames: [
            '施工图联合审查合格资料',
            '质量安全监督登记和实名制管理材料',
            '施工、监理等参建单位合同及中标资料',
            '施工许可阶段一套申报材料',
            '广东省工程建设项目审批窗口资料清单',
          ],
          addPolicyBasis: ['广东省 profile：施工许可阶段资料包补充'],
        },
      ],
      policySources: [
        {
          sourceName: '广东省工程建设项目审批制度改革实施方案',
          sourceUrl: 'https://www.gd.gov.cn/zwgk/wjk/qbwj/yf/content/post_2484659.html',
          checkedAt: '2026-05-28',
          updateMode: 'governed_seed_update',
          policyLevel: 'province',
        },
      ],
      notes: [
        '广东省 profile 已补齐四证资料包深度样板，覆盖土地取得及权属链、用地规划、工程规划和施工许可四个通用资料包。',
        '该 profile 只表达省级工改、综合窗口、一张表单和联合审图口径，市级窗口清单由后续 city override 补齐。',
      ],
    },
    {
      provinceCode: 'jiangsu',
      provinceName: '江苏省',
      profileVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      reviewStatus: 'published',
      policyLevel: 'province',
      effectiveFrom: '2026-05-27',
      lastReviewedAt: '2026-05-27',
      nextReviewDueAt: '2026-08-27',
      curationMethod: 'governed_seed',
      authorityAliases: {
        naturalResources: '自然资源和规划主管部门',
        housingConstruction: '住房城乡建设主管部门',
        approvalWindow: '工程建设项目审批综合窗口',
        governmentService: '政务服务管理部门',
      },
      additionalWorkItemCodes: [],
      optionalWorkItemCodes: ['CERT-EPP-COMMITTEE', 'CERT-EPP-BLUEPRINT-CHECK', 'CERT-DOC-CITY-FEE'],
      softDependencyCodes: ['DEP-LAND-TO-LUP', 'DEP-BLUEPRINT-CHECK-TO-EPP'],
      materialOverrides: [
        {
          landAcquisitionMethodCode: 'transfer',
          addMaterialNames: [
            '江苏省投资项目在线审批监管平台项目代码',
            '不动产权属或土地取得证明材料',
            '土地出让合同、成交确认及价款缴纳凭证',
          ],
          addPolicyBasis: ['江苏省 profile：出让取得土地权属链资料包补充'],
          addRecommendedFor: ['江苏省内通过出让取得土地的建设项目'],
        },
      ],
      materialPackageOverrides: [
        {
          materialPackageCode: 'PKG-CERT-LAND-COMMON',
          addMaterialNames: [
            '江苏省投资项目在线审批监管平台项目代码',
            '不动产权属或土地取得证明材料',
            '土地出让合同、成交确认及价款缴纳凭证',
            '宗地图、界址点成果及交地确认材料',
          ],
          addPolicyBasis: ['江苏省 profile：土地取得及权属链资料包补充'],
        },
        {
          materialPackageCode: 'PKG-CERT-LUP-COMMON',
          addMaterialNames: [
            '用地预审与选址或规划条件材料',
            '用地红线、宗地图和规划条件附图',
            '建设用地规划许可阶段统一申请表',
            '立项用地规划许可阶段一套申报材料',
          ],
          addPolicyBasis: ['江苏省 profile：立项用地规划许可阶段资料包补充'],
        },
        {
          materialPackageCode: 'PKG-CERT-EPP-COMMON',
          addMaterialNames: [
            '方案设计文本、总平面图及单体图',
            '蓝图、日照分析或规划校核材料',
            '数字化联合审图前置衔接材料',
            '方案公示、专家论证或部门并联意见材料',
          ],
          addPolicyBasis: ['江苏省 profile：工程建设许可阶段资料包补充'],
        },
        {
          materialPackageCode: 'PKG-CERT-CP-COMMON',
          addMaterialNames: [
            '施工图审查合格书',
            '建设工程质量安全监督手续',
            '施工、监理等合同及中标资料',
            '实名制管理和现场开工条件材料',
          ],
          addPolicyBasis: ['江苏省 profile：施工许可阶段资料包补充'],
        },
      ],
      policySources: [
        {
          sourceName: '江苏省工程建设项目审批制度改革实施方案',
          sourceUrl: 'https://www.jiangsu.gov.cn/art/2019/6/19/art_64797_8366187.html',
          checkedAt: '2026-05-28',
          updateMode: 'governed_seed_update',
          policyLevel: 'province',
        },
      ],
      notes: [
        '江苏省 profile 已补齐四证资料包深度样板，覆盖土地取得及权属链、用地规划、工程规划和施工许可四个通用资料包。',
        '该 profile 只表达省级工改、不见面审批、数字化联合审图和一套申报材料口径，市级窗口资料由后续 city override 补齐。',
      ],
    },
    {
      provinceCode: 'zhejiang',
      provinceName: '浙江省',
      profileVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      reviewStatus: 'published',
      policyLevel: 'province',
      effectiveFrom: '2026-05-27',
      lastReviewedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
      curationMethod: 'governed_seed',
      authorityAliases: {
        naturalResources: '自然资源和规划主管部门',
        housingConstruction: '住房城乡建设主管部门',
        approvalWindow: '工程建设项目审批综合窗口',
      },
      additionalWorkItemCodes: [],
      optionalWorkItemCodes: ['CERT-EPP-PUBLIC-NOTICE', 'CERT-EPP-BLUEPRINT-CHECK'],
      softDependencyCodes: ['DEP-LAND-TO-LUP', 'DEP-BLUEPRINT-CHECK-TO-EPP'],
      materialOverrides: [
        {
          landAcquisitionMethodCode: 'transfer',
          addMaterialNames: [
            '浙江省投资项目在线审批监管平台项目代码',
            '宗地图、界址点成果及交地确认材料',
            '土地出让合同、成交确认及价款缴纳凭证',
          ],
          addPolicyBasis: ['浙江省 profile：出让取得土地权属链资料包补充'],
          addRecommendedFor: ['浙江省内通过出让取得土地的建设项目'],
        },
      ],
      materialPackageOverrides: [
        {
          materialPackageCode: 'PKG-CERT-LAND-COMMON',
          addMaterialNames: [
            '浙江省投资项目在线审批监管平台项目代码',
            '宗地图、界址点成果及交地确认材料',
            '土地出让合同、成交确认及价款缴纳凭证',
            '契税、印花税及完税证明材料',
          ],
          addPolicyBasis: ['浙江省 profile：土地取得及权属链资料包补充'],
        },
        {
          materialPackageCode: 'PKG-CERT-LUP-COMMON',
          addMaterialNames: [
            '建设项目用地预审与选址或规划条件材料',
            '土地取得或权属证明材料',
            '用地红线、宗地图和规划条件附图',
            '统一表单及建设单位身份材料',
          ],
          addPolicyBasis: ['浙江省 profile：立项用地规划许可阶段资料包补充'],
        },
        {
          materialPackageCode: 'PKG-CERT-EPP-COMMON',
          addMaterialNames: [
            '设计方案文本及总平面图',
            '蓝图、定位图及规划校核材料',
            '日照分析或专项技术审查材料',
            '方案公示、专家论证或部门意见材料',
          ],
          addPolicyBasis: ['浙江省 profile：工程建设许可阶段资料包补充'],
        },
        {
          materialPackageCode: 'PKG-CERT-CP-COMMON',
          addMaterialNames: [
            '施工图联合审查合格资料',
            '质量安全监督登记和实名制管理材料',
            '施工、监理等参建单位合同及中标资料',
            '施工现场具备开工条件承诺或核验材料',
          ],
          addPolicyBasis: ['浙江省 profile：施工许可阶段资料包补充'],
        },
      ],
      policySources: [
        {
          sourceName: '浙江省深化工程建设项目审批制度改革工作实施方案',
          sourceUrl: 'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3096/site/attach/0/3a101dc9ee124c948dbe87a6efac4aba.pdf',
          checkedAt: '2026-05-28',
          updateMode: 'governed_seed_update',
          policyLevel: 'province',
        },
      ],
      notes: [
        '浙江省 profile 是第一版四证资料包深度样板，覆盖土地取得及权属链、用地规划、工程规划和施工许可四个通用资料包。',
        '该 profile 只表达省级工改和综合窗口口径，市级窗口清单、区县差异和特殊项目资料由后续 city override 补齐。',
      ],
    },
    ...FIRST_EXPANSION_CANDIDATE_PROVINCE_PROFILES,
    ...NORTH_EXPANSION_CANDIDATE_PROVINCE_PROFILES,
    ...NORTHEAST_EXPANSION_CANDIDATE_PROVINCE_PROFILES,
    ...CENTRAL_SOUTH_EXPANSION_CANDIDATE_PROVINCE_PROFILES,
    ...SOUTHWEST_EXPANSION_CANDIDATE_PROVINCE_PROFILES,
    ...NORTHWEST_EXPANSION_CANDIDATE_PROVINCE_PROFILES,
  ],
  cityOverrides: [
    SHENZHEN_CITY_CERTIFICATE_OVERRIDE,
    SUZHOU_CITY_CERTIFICATE_OVERRIDE,
    ...DIRECT_CITY_CERTIFICATE_OVERRIDES,
    BEIJING_CITY_CERTIFICATE_OVERRIDE_CANDIDATE,
    GUANGZHOU_CITY_CERTIFICATE_OVERRIDE_CANDIDATE,
    NANJING_CITY_CERTIFICATE_OVERRIDE_CANDIDATE,
    CHENGDU_CITY_CERTIFICATE_OVERRIDE_CANDIDATE,
    WUHAN_CITY_CERTIFICATE_OVERRIDE_CANDIDATE,
    XIAN_CITY_CERTIFICATE_OVERRIDE_CANDIDATE,
    SHANGHAI_CITY_CERTIFICATE_OVERRIDE,
    HANGZHOU_CITY_CERTIFICATE_OVERRIDE,
  ].map(withCityCertificateDeepCoverage),
  workItems: [
    {
      workItemCode: 'CERT-DOC-PROJECT-BASIC',
      itemName: '项目基础资料整理',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      isShared: true,
      certificateTypes: [
        'land_certificate',
        'land_use_planning_permit',
        'engineering_planning_permit',
        'construction_permit',
      ],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'important',
      defaultNextAction: '补齐项目名称、建设单位、地块、规模和联系人资料。',
      sortOrder: 10,
      sourceEvidence: ['PDF: 立项申请表、项目基础信息登记'],
    },
    {
      workItemCode: 'CERT-DOC-PROJECT-FILING',
      itemName: '立项备案资料',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '发展改革主管部门',
      isShared: true,
      certificateTypes: [
        'land_certificate',
        'land_use_planning_permit',
        'engineering_planning_permit',
        'construction_permit',
      ],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '确认立项批复、备案表或项目核准文件。',
      sortOrder: 20,
      sourceEvidence: ['PDF: 立项申请表、项目备案表、区发改委'],
    },
    {
      workItemCode: 'CERT-DOC-FEASIBILITY',
      itemName: '可行性研究及批复',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '发展改革主管部门',
      isShared: true,
      certificateTypes: ['land_use_planning_permit', 'engineering_planning_permit', 'construction_permit'],
      requiredPolicy: 'recommended',
      planRole: 'document_preparation',
      criticality: 'important',
      defaultNextAction: '按项目审批类型确认是否需要可研报告及批复。',
      sortOrder: 30,
      sourceEvidence: ['PDF: 可行性研究报告'],
    },
    {
      workItemCode: 'CERT-DOC-LAND-TRANSFER',
      itemName: '土地成交确认',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源主管部门',
      isShared: true,
      certificateTypes: ['land_certificate', 'land_use_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '归集土地成交确认书，并确认土地取得方式资料包。',
      sortOrder: 40,
      sourceEvidence: ['PDF: 土地成交确认书'],
    },
    {
      workItemCode: 'CERT-DOC-LAND-TAX',
      itemName: '土地税费资料确认',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '税务主管部门',
      isShared: false,
      certificateTypes: ['land_certificate'],
      requiredPolicy: 'recommended',
      planRole: 'document_preparation',
      criticality: 'important',
      defaultNextAction: '按土地取得方式确认契税、印花税和完税资料是否适用。',
      sortOrder: 50,
      sourceEvidence: ['PDF: 契税、印花税缴纳、完税证明'],
    },
    {
      workItemCode: 'CERT-DOC-LAND-HANDOVER',
      itemName: '地块交付条件确认',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '土地储备或自然资源主管部门',
      isShared: true,
      certificateTypes: ['land_certificate', 'land_use_planning_permit', 'construction_permit'],
      requiredPolicy: 'recommended',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '按土地取得方式确认交地、地块边界和现场交付条件。',
      sortOrder: 60,
      sourceEvidence: ['PDF: 交地单'],
    },
    {
      workItemCode: 'CERT-LAND-TRANSFER-CONTRACT',
      itemName: '出让合同',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源主管部门',
      isShared: true,
      certificateTypes: ['land_certificate', 'land_use_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '确认出让合同签署、价款约定和合同附件。',
      sortOrder: 61,
      sourceEvidence: ['PDF: 出让合同'],
      landAcquisitionMethodCodes: ['transfer'],
    },
    {
      workItemCode: 'CERT-LAND-TRANSFER-REDLINE',
      itemName: '场地红线图',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源主管部门',
      isShared: true,
      certificateTypes: ['land_certificate', 'land_use_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '确认场地红线图、宗地边界和坐标资料。',
      sortOrder: 62,
      sourceEvidence: ['PDF: 场地红线图'],
      landAcquisitionMethodCodes: ['transfer'],
    },
    {
      workItemCode: 'CERT-LAND-TRANSFER-HANDOVER',
      itemName: '交地单',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '土地储备或自然资源主管部门',
      isShared: true,
      certificateTypes: ['land_certificate', 'land_use_planning_permit', 'construction_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '确认交地单、交付边界和现场移交条件。',
      sortOrder: 63,
      sourceEvidence: ['PDF: 交地单'],
      landAcquisitionMethodCodes: ['transfer'],
    },
    {
      workItemCode: 'CERT-LAND-TRANSFER-TAX-PAYMENT',
      itemName: '契税、印花税缴纳',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '税务主管部门',
      isShared: false,
      certificateTypes: ['land_certificate'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'important',
      defaultNextAction: '完成契税、印花税缴纳并留存缴款凭证。',
      sortOrder: 64,
      sourceEvidence: ['PDF: 契税、印花税缴纳'],
      landAcquisitionMethodCodes: ['transfer'],
    },
    {
      workItemCode: 'CERT-LAND-TRANSFER-TAX-CERT',
      itemName: '完税证明',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '税务主管部门',
      isShared: false,
      certificateTypes: ['land_certificate'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'important',
      defaultNextAction: '取得完税证明并归档至土地证报件资料。',
      sortOrder: 65,
      sourceEvidence: ['PDF: 完税证明'],
      landAcquisitionMethodCodes: ['transfer'],
    },
    {
      workItemCode: 'CERT-LAND-ALLOCATION-DECISION',
      itemName: '划拨决定书',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源主管部门',
      isShared: true,
      certificateTypes: ['land_certificate', 'land_use_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '归集划拨决定书、批准文件及用地红线资料。',
      sortOrder: 66,
      sourceEvidence: ['Seed: 划拨取得资料包'],
      landAcquisitionMethodCodes: ['allocation'],
    },
    {
      workItemCode: 'CERT-LAND-ALLOCATION-PRESELECTION',
      itemName: '建设项目用地预审与选址意见',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: true,
      certificateTypes: ['land_certificate', 'land_use_planning_permit'],
      requiredPolicy: 'recommended',
      planRole: 'document_preparation',
      criticality: 'important',
      defaultNextAction: '确认用地预审、选址意见或等效地方材料是否适用。',
      sortOrder: 67,
      sourceEvidence: ['Seed: 划拨取得资料包'],
      landAcquisitionMethodCodes: ['allocation'],
    },
    {
      workItemCode: 'CERT-LAND-EXISTING-OWNERSHIP',
      itemName: '不动产权证或国有土地使用证',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源主管部门',
      isShared: true,
      certificateTypes: ['land_certificate', 'land_use_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '核验既有不动产权证、国有土地使用证及权利主体。',
      sortOrder: 68,
      sourceEvidence: ['Seed: 存量用地资料包'],
      landAcquisitionMethodCodes: ['existing_land'],
    },
    {
      workItemCode: 'CERT-LAND-EXISTING-CHANGE-REGISTRATION',
      itemName: '权属变更或用途变更资料',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源主管部门',
      isShared: false,
      certificateTypes: ['land_certificate', 'land_use_planning_permit'],
      requiredPolicy: 'recommended',
      planRole: 'document_preparation',
      criticality: 'important',
      defaultNextAction: '确认是否涉及权属变更、用途变更、合宗分宗或补登记。',
      sortOrder: 69,
      sourceEvidence: ['Seed: 存量用地资料包'],
      landAcquisitionMethodCodes: ['existing_land'],
    },
    {
      workItemCode: 'CERT-LAND-REDEVELOPMENT-PLAN',
      itemName: '城市更新实施方案或改扩建立项依据',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '城市更新或发展改革主管部门',
      isShared: true,
      certificateTypes: ['land_certificate', 'land_use_planning_permit', 'engineering_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '归集城市更新实施方案、改扩建批准文件或等效立项依据。',
      sortOrder: 70,
      sourceEvidence: ['Seed: 改扩建/城市更新资料包'],
      landAcquisitionMethodCodes: ['redevelopment'],
    },
    {
      workItemCode: 'CERT-LAND-REDEVELOPMENT-RIGHTS-CLEARANCE',
      itemName: '既有权属及范围核验资料',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源主管部门',
      isShared: true,
      certificateTypes: ['land_certificate', 'land_use_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '核验既有权属、更新范围、拆改边界和建设主体。',
      sortOrder: 71,
      sourceEvidence: ['Seed: 改扩建/城市更新资料包'],
      landAcquisitionMethodCodes: ['redevelopment'],
    },
    {
      workItemCode: 'CERT-DOC-PLANNING-CONDITIONS',
      itemName: '规划条件与用地信息登记',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: true,
      certificateTypes: ['land_use_planning_permit', 'engineering_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '确认规划条件、用地红线和用地信息登记表。',
      sortOrder: 70,
      sourceEvidence: ['PDF: 信息登记表、市自规利用科'],
    },
    {
      workItemCode: 'CERT-DOC-DESIGN-SCHEME',
      itemName: '方案设计文本与确认',
      itemStage: STAGE_INTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: true,
      certificateTypes: ['engineering_planning_permit', 'construction_permit'],
      requiredPolicy: 'required',
      planRole: 'internal_review',
      criticality: 'blocking',
      defaultNextAction: '完成方案设计文本、内部会签和报审版本确认。',
      sortOrder: 80,
      sourceEvidence: ['PDF: 方案设计、方案文本确认'],
    },
    {
      workItemCode: 'CERT-DOC-TRAFFIC-IMPACT',
      itemName: '交通影响评价及批复',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '交通主管部门',
      isShared: false,
      certificateTypes: ['engineering_planning_permit'],
      requiredPolicy: 'conditional',
      planRole: 'external_submission',
      criticality: 'important',
      defaultNextAction: '按地方要求确认是否开展交评报告、专家会和批复。',
      sortOrder: 90,
      appliesWhen: [
        {
          field: 'projectFeature',
          operator: 'includes',
          value: 'traffic_impact',
          reason: '项目特征包含交通影响评价时纳入交评资料包。',
        },
      ],
      sourceEvidence: ['PDF: 交评报告、交评专家会、交评批复'],
    },
    {
      workItemCode: 'CERT-DOC-DRAWING-REVIEW',
      itemName: '施工图设计与审图受理',
      itemStage: STAGE_INTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '施工图审查机构',
      isShared: true,
      certificateTypes: ['engineering_planning_permit', 'construction_permit'],
      requiredPolicy: 'required',
      planRole: 'internal_review',
      criticality: 'blocking',
      defaultNextAction: '组织施工图设计并提交审图中心受理。',
      sortOrder: 100,
      sourceEvidence: ['PDF: 施工图设计、审图中心'],
    },
    {
      workItemCode: 'CERT-DOC-HUMAN-DEFENSE-REVIEW',
      itemName: '人防审查合格证',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '人防主管部门',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'conditional',
      planRole: 'external_submission',
      criticality: 'important',
      defaultNextAction: '如涉及人防工程，确认人防审图合格证取得路径。',
      sortOrder: 110,
      appliesWhen: [
        {
          field: 'hasCivilDefense',
          operator: 'equals',
          value: true,
          reason: '有人防工程或地方要求时需要人防专项审查。',
        },
      ],
      sourceEvidence: ['PDF: 人防审图合格证'],
    },
    {
      workItemCode: 'CERT-DOC-QUALITY-SAFETY',
      itemName: '质量安全监督手续',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '住建安监机构',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'required',
      planRole: 'external_submission',
      criticality: 'blocking',
      defaultNextAction: '准备质量监督、安全监督和安监站核验资料。',
      sortOrder: 120,
      sourceEvidence: ['PDF: 市安监站'],
    },
    {
      workItemCode: 'CERT-DOC-CONSTRUCTION-CONTRACT',
      itemName: '施工合同与参建单位资料',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '住房和城乡建设主管部门',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '确认施工、监理等参建单位合同和中标通知书。',
      sortOrder: 130,
      sourceEvidence: ['PDF: EPC中标通知书、监理中标通知书'],
    },
    {
      workItemCode: 'CERT-DOC-SITE-CONDITIONS',
      itemName: '现场开工条件核验',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '住房和城乡建设主管部门',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'required',
      planRole: 'startup_gate',
      criticality: 'blocking',
      defaultNextAction: '核验围挡、洗车池、喷淋、大门和临时设施等现场条件。',
      sortOrder: 140,
      sourceEvidence: ['PDF: 现场围挡、洗车池、喷淋、大门'],
    },
    {
      workItemCode: 'CERT-DOC-CITY-FEE',
      itemName: '城市配套费缴纳',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '住房和城乡建设主管部门',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'recommended',
      planRole: 'external_submission',
      criticality: 'important',
      defaultNextAction: '按地方要求确认城市基础设施配套费缴纳节点。',
      sortOrder: 150,
      sourceEvidence: ['PDF: 城市配套费缴纳'],
      provinceProfileCodes: ['default', 'jiangsu'],
    },
    {
      workItemCode: 'CERT-LAND-ACCEPT',
      itemName: '土地证报件受理',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源主管部门',
      isShared: false,
      certificateTypes: ['land_certificate'],
      requiredPolicy: 'required',
      planRole: 'external_submission',
      criticality: 'blocking',
      defaultNextAction: '提交土地证报件并确认窗口受理。',
      sortOrder: 210,
    },
    {
      workItemCode: 'CERT-LAND-ISSUE',
      itemName: '土地证批复领证',
      itemStage: STAGE_ISSUE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源主管部门',
      isShared: false,
      certificateTypes: ['land_certificate'],
      requiredPolicy: 'required',
      planRole: 'permit_issue',
      criticality: 'blocking',
      defaultNextAction: '跟踪土地证制证、缴费和领证。',
      sortOrder: 220,
    },
    {
      workItemCode: 'CERT-LUP-SUBMIT',
      itemName: '用地规划许可报批',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: false,
      certificateTypes: ['land_use_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'external_submission',
      criticality: 'blocking',
      defaultNextAction: '提交用地规划许可申请并跟踪补正意见。',
      sortOrder: 310,
    },
    {
      workItemCode: 'CERT-LUP-ISSUE',
      itemName: '用地规划许可证领证',
      itemStage: STAGE_ISSUE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: false,
      certificateTypes: ['land_use_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'permit_issue',
      criticality: 'blocking',
      defaultNextAction: '确认用地规划许可证批复和证照领取。',
      sortOrder: 320,
    },
    {
      workItemCode: 'CERT-EPP-SCHEME-EXPERT',
      itemName: '方案专家会及修改',
      itemStage: STAGE_INTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: false,
      certificateTypes: ['engineering_planning_permit'],
      requiredPolicy: 'recommended',
      planRole: 'internal_review',
      criticality: 'important',
      defaultNextAction: '按地方要求组织方案专家会并完成方案修改。',
      sortOrder: 410,
      sourceEvidence: ['PDF: 方案专家会、方案修改'],
    },
    {
      workItemCode: 'CERT-EPP-TRAFFIC-REVIEW',
      itemName: '交评专家会及批复',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '交通主管部门',
      isShared: false,
      certificateTypes: ['engineering_planning_permit'],
      requiredPolicy: 'recommended',
      planRole: 'external_submission',
      criticality: 'important',
      defaultNextAction: '跟踪交评专家会、意见修改和批复。',
      sortOrder: 420,
      appliesWhen: [
        {
          field: 'projectFeature',
          operator: 'includes',
          value: 'traffic_impact',
          reason: '项目特征包含交通影响评价时纳入交评专家会及批复。',
        },
      ],
      sourceEvidence: ['PDF: 交评专家会、交评批复'],
    },
    {
      workItemCode: 'CERT-EPP-COMMITTEE',
      itemName: '规委会或规划内审',
      itemStage: STAGE_INTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: false,
      certificateTypes: ['engineering_planning_permit'],
      requiredPolicy: 'recommended',
      planRole: 'internal_review',
      criticality: 'important',
      defaultNextAction: '确认是否需要规委会上会、区规划局内审或市自规内审会。',
      sortOrder: 430,
      appliesWhen: [
        {
          field: 'projectFeature',
          operator: 'includes',
          value: 'planning_committee',
          reason: '项目特征包含规委会或规划内审时纳入该事项。',
        },
      ],
      sourceEvidence: ['PDF: 市规委会、区规划局内审、市自规内审会'],
      provinceProfileCodes: ['default', 'jiangsu'],
    },
    {
      workItemCode: 'CERT-EPP-PUBLIC-NOTICE',
      itemName: '方案公示',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: false,
      certificateTypes: ['engineering_planning_permit'],
      requiredPolicy: 'recommended',
      planRole: 'external_submission',
      criticality: 'normal',
      defaultNextAction: '按地方要求安排方案公示和意见反馈处理。',
      sortOrder: 440,
      appliesWhen: [
        {
          field: 'projectFeature',
          operator: 'includes',
          value: 'scheme_public_notice',
          reason: '项目特征包含方案公示时纳入公示事项。',
        },
      ],
      sourceEvidence: ['PDF: 方案公示'],
    },
    {
      workItemCode: 'CERT-EPP-BLUEPRINT-CHECK',
      itemName: '建筑蓝图与校核报告',
      itemStage: STAGE_INTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: false,
      certificateTypes: ['engineering_planning_permit'],
      requiredPolicy: 'recommended',
      planRole: 'internal_review',
      criticality: 'important',
      defaultNextAction: '准备建筑蓝图、日照报告和建筑校核报告。',
      sortOrder: 450,
      appliesWhen: [
        {
          field: 'projectFeature',
          operator: 'includes',
          value: 'blueprint_check',
          reason: '项目特征包含蓝图或日照校核时纳入该事项。',
        },
      ],
      sourceEvidence: ['PDF: 日照报告、建筑蓝图、建筑校核报告'],
      provinceProfileCodes: ['jiangsu'],
    },
    {
      workItemCode: 'CERT-EPP-SUBMIT',
      itemName: '工程规划许可证报批',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: false,
      certificateTypes: ['engineering_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'external_submission',
      criticality: 'blocking',
      defaultNextAction: '提交工程规划许可申请并跟踪审查意见。',
      sortOrder: 460,
    },
    {
      workItemCode: 'CERT-EPP-ISSUE',
      itemName: '工程规划许可证领证',
      itemStage: STAGE_ISSUE,
      defaultStatus: 'pending',
      approvingAuthority: '自然资源和规划主管部门',
      isShared: false,
      certificateTypes: ['engineering_planning_permit'],
      requiredPolicy: 'required',
      planRole: 'permit_issue',
      criticality: 'blocking',
      defaultNextAction: '确认工程规划许可证批复、红线图和证照领取。',
      sortOrder: 470,
      sourceEvidence: ['PDF: 建筑红线图、工规证'],
    },
    {
      workItemCode: 'CERT-CP-TENDER-NOTICE',
      itemName: '施工和监理中标通知',
      itemStage: STAGE_PREPARE,
      defaultStatus: 'pending',
      approvingAuthority: '住房和城乡建设主管部门',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'required',
      planRole: 'document_preparation',
      criticality: 'blocking',
      defaultNextAction: '确认EPC、施工、监理等中标通知书。',
      sortOrder: 510,
      sourceEvidence: ['PDF: EPC中标通知书、监理中标通知书'],
    },
    {
      workItemCode: 'CERT-CP-DRAWING-CERT',
      itemName: '审图合格证',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '施工图审查机构',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'required',
      planRole: 'external_submission',
      criticality: 'blocking',
      defaultNextAction: '取得施工图审查合格证。',
      sortOrder: 520,
      sourceEvidence: ['PDF: 审图合格证'],
    },
    {
      workItemCode: 'CERT-CP-FIRE-REVIEW',
      itemName: '消防设计审查或备案资料',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '住房和城乡建设主管部门',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'conditional',
      planRole: 'external_submission',
      criticality: 'important',
      defaultNextAction: '按项目消防审查属性准备消防设计审查、备案或抽查资料。',
      sortOrder: 525,
      appliesWhen: [
        {
          field: 'hasFireReview',
          operator: 'equals',
          value: true,
          reason: '项目需消防设计审查或备案时纳入消防专项资料。',
        },
      ],
      sourceEvidence: ['Seed: 施工许可消防专项资料包'],
    },
    {
      workItemCode: 'CERT-CP-HFD-CERT',
      itemName: '人防或专项审查合格证',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '专项审查主管部门',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'conditional',
      planRole: 'external_submission',
      criticality: 'important',
      defaultNextAction: '按项目特征确认人防、桩基等专项审查合格证。',
      sortOrder: 530,
      appliesWhen: [
        {
          field: 'hasCivilDefense',
          operator: 'equals',
          value: true,
          reason: '有人防工程时纳入人防或专项审查合格证。',
        },
      ],
      sourceEvidence: ['PDF: 人防审图合格证、桩基审图合格证'],
    },
    {
      workItemCode: 'CERT-CP-TEMP-PERMIT',
      itemName: '临时施工许可确认',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '住房和城乡建设主管部门',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'recommended',
      planRole: 'startup_gate',
      criticality: 'normal',
      defaultNextAction: '如地方允许或项目需要，确认临时施工许可办理路径。',
      sortOrder: 540,
      appliesWhen: [
        {
          field: 'businessSubtype',
          operator: 'equals',
          value: 'temporary_construction_permit',
          reason: '项目业务子类型为临时施工许可时纳入该事项。',
        },
      ],
      sourceEvidence: ['PDF: 临时施工许可证'],
    },
    {
      workItemCode: 'CERT-CP-SUBMIT',
      itemName: '施工许可证报批',
      itemStage: STAGE_EXTERNAL,
      defaultStatus: 'pending',
      approvingAuthority: '住房和城乡建设主管部门',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'required',
      planRole: 'external_submission',
      criticality: 'blocking',
      defaultNextAction: '上传施工许可资料并跟踪住建窗口、建经科、安监站意见。',
      sortOrder: 550,
      sourceEvidence: ['PDF: 上传资料、市住建窗口、市住建建经科、市安监站'],
    },
    {
      workItemCode: 'CERT-CP-ISSUE',
      itemName: '施工许可证领证',
      itemStage: STAGE_ISSUE,
      defaultStatus: 'pending',
      approvingAuthority: '住房和城乡建设主管部门',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'required',
      planRole: 'permit_issue',
      criticality: 'blocking',
      defaultNextAction: '确认施工许可证批复、制证和领证。',
      sortOrder: 560,
      sourceEvidence: ['PDF: 施工证'],
    },
  ],
  dependencies: [
    {
      dependencyCode: 'DEP-LAND-TO-LUP',
      predecessor: { type: 'certificate', certificateType: 'land_certificate' },
      successor: { type: 'certificate', certificateType: 'land_use_planning_permit' },
      dependencyKind: 'soft',
      relationRole: 'recommended_flow',
      reason: '土地证和用地规划许可在各地并联程度不同，默认作为推荐顺序提示。',
    },
    {
      dependencyCode: 'DEP-LUP-TO-EPP',
      predecessor: { type: 'certificate', certificateType: 'land_use_planning_permit' },
      successor: { type: 'certificate', certificateType: 'engineering_planning_permit' },
      dependencyKind: 'hard',
      relationRole: 'legal_sequence',
      reason: '工程规划许可通常需要先确认用地规划许可和规划条件。',
    },
    {
      dependencyCode: 'DEP-EPP-TO-CP',
      predecessor: { type: 'certificate', certificateType: 'engineering_planning_permit' },
      successor: { type: 'certificate', certificateType: 'construction_permit' },
      dependencyKind: 'hard',
      relationRole: 'legal_sequence',
      reason: '施工许可办理前需具备工程规划许可成果。',
    },
    {
      dependencyCode: 'DEP-SCHEME-TO-EPP',
      predecessor: { type: 'work_item', workItemCode: 'CERT-DOC-DESIGN-SCHEME' },
      successor: { type: 'certificate', certificateType: 'engineering_planning_permit' },
      dependencyKind: 'hard',
      relationRole: 'document_reuse',
      reason: '工程规划许可需要方案设计文本和内部确认版本。',
    },
    {
      dependencyCode: 'DEP-TRAFFIC-TO-EPP',
      predecessor: { type: 'work_item', workItemCode: 'CERT-DOC-TRAFFIC-IMPACT' },
      successor: { type: 'certificate', certificateType: 'engineering_planning_permit' },
      dependencyKind: 'soft',
      relationRole: 'recommended_flow',
      reason: '交通影响评价地方差异较大，默认提示确认。',
    },
    {
      dependencyCode: 'DEP-BLUEPRINT-CHECK-TO-EPP',
      predecessor: { type: 'work_item', workItemCode: 'CERT-EPP-BLUEPRINT-CHECK' },
      successor: { type: 'certificate', certificateType: 'engineering_planning_permit' },
      dependencyKind: 'soft',
      relationRole: 'recommended_flow',
      reason: '蓝图和校核报告通常服务工程规划许可，但地方口径不同。',
    },
    {
      dependencyCode: 'DEP-DRAWING-REVIEW-TO-CP',
      predecessor: { type: 'work_item', workItemCode: 'CERT-DOC-DRAWING-REVIEW' },
      successor: { type: 'certificate', certificateType: 'construction_permit' },
      dependencyKind: 'hard',
      relationRole: 'startup_gate',
      reason: '施工许可办理前需要施工图审查链条完成。',
    },
    {
      dependencyCode: 'DEP-DRAWING-CERT-TO-CP',
      predecessor: { type: 'work_item', workItemCode: 'CERT-CP-DRAWING-CERT' },
      successor: { type: 'certificate', certificateType: 'construction_permit' },
      dependencyKind: 'hard',
      relationRole: 'startup_gate',
      reason: '审图合格证是施工许可常见硬前置资料。',
    },
    {
      dependencyCode: 'DEP-FIRE-TO-CP',
      predecessor: { type: 'work_item', workItemCode: 'CERT-CP-FIRE-REVIEW' },
      successor: { type: 'certificate', certificateType: 'construction_permit' },
      dependencyKind: 'soft',
      relationRole: 'recommended_flow',
      reason: '消防设计审查或备案按项目属性触发，默认作为施工许可资料包软依赖。',
    },
    {
      dependencyCode: 'DEP-HFD-TO-CP',
      predecessor: { type: 'work_item', workItemCode: 'CERT-CP-HFD-CERT' },
      successor: { type: 'certificate', certificateType: 'construction_permit' },
      dependencyKind: 'soft',
      relationRole: 'recommended_flow',
      reason: '人防或专项审查按项目特征触发，默认不设为硬依赖。',
    },
    {
      dependencyCode: 'DEP-QUALITY-SAFETY-TO-CP',
      predecessor: { type: 'work_item', workItemCode: 'CERT-DOC-QUALITY-SAFETY' },
      successor: { type: 'certificate', certificateType: 'construction_permit' },
      dependencyKind: 'hard',
      relationRole: 'startup_gate',
      reason: '质量安全监督手续是施工许可前置条件。',
    },
    {
      dependencyCode: 'DEP-SITE-CONDITIONS-TO-CP',
      predecessor: { type: 'work_item', workItemCode: 'CERT-DOC-SITE-CONDITIONS' },
      successor: { type: 'certificate', certificateType: 'construction_permit' },
      dependencyKind: 'hard',
      relationRole: 'startup_gate',
      reason: '现场开工条件核验直接影响施工许可受理。',
    },
    {
      dependencyCode: 'DEP-CONTRACT-TO-CP',
      predecessor: { type: 'work_item', workItemCode: 'CERT-DOC-CONSTRUCTION-CONTRACT' },
      successor: { type: 'certificate', certificateType: 'construction_permit' },
      dependencyKind: 'hard',
      relationRole: 'document_reuse',
      reason: '施工合同与参建单位资料是施工许可报批前置资料。',
    },
  ],
}

export const SYSTEM_CERTIFICATE_TEMPLATE_SEEDS: CertificateTemplateSeed[] = [
  GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
]

export const CERTIFICATE_TEMPLATE_GOVERNANCE_META = {
  seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
  seedScope: 'pre_certificate_template_catalog',
  sourceStandards: [
    '用户提供四证办理流程图',
    '工程建设项目审批制度改革通用口径',
    '已治理发布的省级工程建设项目审批改革资料',
  ],
  expectedCounts: {
    certificates: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.certificates.length,
    workItems: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.workItems.length,
    dependencies: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.dependencies.length,
    materialPackages: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.materialPackages.length,
    handlingSteps: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.handlingSteps.length,
    landAcquisitionMethods: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.landAcquisitionMethods.length,
    provinceProfiles: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.provinceProfiles.length,
    cityOverrides: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.cityOverrides.length,
    publishedCityOverrides: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.cityOverrides.filter(
      (override) => override.reviewStatus === 'published',
    ).length,
    publishedProvinceProfiles: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.provinceProfiles.filter(
      (profile) => profile.reviewStatus === 'published',
    ).length,
    provinceRecognitionRules: CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.length,
    provinceExpansionBatches: CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.length,
    localOverrideExpansionBatches: CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES.length,
  },
  evidenceSources: [
    {
      sourceKey: 'FOUR_CERT_FLOW_PDF',
      title: '用户提供四证办理流程图',
      accessedAt: '2026-05-26',
    },
    {
      sourceKey: 'GOVERNED_PROVINCE_PROFILE_SAMPLE',
      title: '已治理发布省级审批改革资料样板',
      accessedAt: '2026-05-27',
    },
  ],
  generationPolicy:
    'template_catalog cold-start only; compose general four-certificate skeleton, land acquisition method package, and published province overlay into draft preview',
  relationshipRole: 'draft_template_catalog_for_certificate_workspace',
  upstreamRuleTypes: ['project_generation_facts', 'province_recognition', 'published_province_profile'],
  downstreamRuleTypes: ['certificate_template_preview', 'certificate_template_apply_batch', 'local_override_governance_report'],
  boundaryPolicy: [
    'owns template_catalog draft generation only and does not enter the AlgorithmSeedType runtime lifecycle',
    'no live page scrape or direct policy mutation happens inside the business page',
    'published province profiles may add materials, optional work items, soft dependencies, and authority aliases',
    'published city overrides may add local material package details after the province profile is applied',
    'trusted policy-source refreshes may be auto-published as a new seed/profile version before business preview consumption',
    'local override expansion batches are governance assets only and never publish planned city targets directly to business preview',
    'unpublished or recognition-only provinces must fall back to the default profile while keeping province recognition visible in preview metadata',
    'template application never overwrites existing project facts',
  ],
  provincePolicyUpdatePolicy: {
    candidateSource: 'official_policy_source_discovery + trusted_source_auto_refresh',
    candidateTable: 'certificate_template_policy_auto_publish_runs',
    runtimeProfileSource: 'certificateTemplateSeed.provinceProfiles',
    governanceService: 'certificateTemplatePolicyUpdateService',
    adminReportEndpoint: '/api/admin/certificate-template-governance/policy-updates/report',
    runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    actionPolicy:
      'discover trusted source -> auto publish as seed/profile version when source health is clean; blocked weak-source assets retain previous published profile; only published profile participates in business preview',
  },
  webVerified: true,
  reviewNeeded: false,
} as const
