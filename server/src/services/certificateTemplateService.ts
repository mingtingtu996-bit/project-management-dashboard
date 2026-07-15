import { createHash } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'

import { getClient } from '../database.js'
import {
  CERTIFICATE_TEMPLATE_SEED_VERSION,
  CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES,
  GENERAL_CERTIFICATE_TEMPLATE_CODE,
  SYSTEM_CERTIFICATE_TEMPLATE_SEEDS,
  type CertificateTemplateCondition,
  type CertificateTemplateCityOverride,
  type CertificateTemplateDependency,
  type CertificateTemplateHandlingStep,
  type CertificateTemplateLandAcquisitionMethod,
  type CertificateTemplateMaterialPackage,
  type CertificateTemplateProvincePolicySource,
  type CertificateTemplateProvinceProfile,
  type CertificateTemplateProvinceRecognitionRule,
  type CertificateTemplateSeed,
  type CertificateTemplateWorkItem,
  type LandAcquisitionMethodCode,
} from '../seeds/certificateTemplateSeed.js'
import { executeSQL, executeSQLOne } from './dbService.js'
import { insertRowReturning } from './transactionInsertService.js'
import { markPreMilestoneProjectChanged } from './preMilestoneReadCache.js'
import { logger } from '../middleware/logger.js'
import {
  getLatestCertificatePolicyAutoPublishRun,
  getLatestStableCertificatePolicyAutoPublishRun,
  loadLatestCertificatePolicyAutoPublishRun,
  loadLatestStableCertificatePolicyAutoPublishRun,
  type CertificatePolicyAutoPublishRun,
  type CertificatePolicyPublishedRuleOverlay,
} from './certificateTemplatePolicyUpdateService.js'
import type {
  CertificateDependency,
  CertificateDependencyKind,
  CertificateDependencyTargetType,
  CertificateType,
  CertificateWorkItem,
  KnownCertificateType,
  PreMilestone,
} from '../types/db.js'

export type CertificateTemplatePreviewAction = 'will_create' | 'will_skip_existing' | 'needs_confirmation'

export interface CertificateTemplatePreviewCertificate {
  key: KnownCertificateType
  certificateType: KnownCertificateType
  certificateName: string
  defaultStage: string
  defaultStatus: string
  approvingAuthority: string
  requiredPolicy: string
  reason: string
  sortOrder: number
  action: CertificateTemplatePreviewAction
  selected: boolean
  existingId?: string | null
  skipReason?: string | null
}

export interface CertificateTemplatePreviewWorkItem {
  workItemCode: string
  itemName: string
  itemStage: string
  defaultStatus: string
  approvingAuthority?: string | null
  isShared: boolean
  certificateTypes: KnownCertificateType[]
  requiredPolicy: string
  planRole: CertificateTemplateWorkItem['planRole']
  criticality: CertificateTemplateWorkItem['criticality']
  defaultNextAction: string
  sortOrder: number
  action: CertificateTemplatePreviewAction
  selected: boolean
  existingId?: string | null
  skipReason?: string | null
  sourceEvidence?: string[]
  landAcquisitionMethodCodes?: LandAcquisitionMethodCode[]
  provinceProfileCodes?: string[]
}

export interface CertificateTemplatePreviewDependency extends CertificateTemplateDependency {
  action: CertificateTemplatePreviewAction
  selected: boolean
  skipReason?: string | null
  provinceProfileCodes?: string[]
}

export interface CertificateTemplatePreviewMaterialPackage {
  packageCode: string
  packageName: string
  packageScope: 'certificate_common' | 'land_acquisition_method' | 'province_overlay' | 'city_overlay'
  certificateTypes: KnownCertificateType[]
  workItemCodes: string[]
  materialNames: string[]
  policyBasis: string[]
  requiredPolicy: string
  sortOrder: number
  source: 'seed' | 'land_acquisition_method' | 'province_profile' | 'city_override'
  selected: boolean
  methodCode?: LandAcquisitionMethodCode
  provinceCode?: string
  cityCode?: string
}

export interface CertificateTemplateMaterialEvidenceChain {
  materialCode: string
  materialName: string
  certificateType: KnownCertificateType
  handlingStepCode: string
  handlingStepName: string
  sourceParties: string[]
  handlingAuthority: string
  requiredSubmitMaterials: string[]
  outputDocument: string
  linkedWorkItemCodes: string[]
  linkedWorkItemNames: string[]
  materialPackageCodes: string[]
  materialPackageNames: string[]
  reusableForCertificateTypes: KnownCertificateType[]
  blockingLevel: CertificateTemplateHandlingStep['blockingLevel']
}

export interface CertificateTemplatePreviewProvinceProfile {
  provinceCode: string
  provinceName: string
  profileVersion: string
  authorityAliases: Record<string, string>
  additionalWorkItemCodes: string[]
  optionalWorkItemCodes: string[]
  softDependencyCodes: string[]
  policySources: Array<Omit<CertificateTemplateProvincePolicySource, 'policyLevel'>>
  notes: string[]
  source: 'project_static_profile' | 'project_metadata' | 'project_location' | 'default'
  applied: boolean
  appliedWorkItemCodes: string[]
  appliedSoftDependencyCodes: string[]
}

export interface CertificateTemplatePreviewProvinceRuleSource {
  recognizedProvinceCode: string
  recognizedProvinceName: string
  appliedProfileCode: string
  appliedProfileName: string
  source: 'project_static_profile' | 'project_metadata' | 'project_location' | 'default'
  recognitionAccuracy: 'profile_code' | 'province_alias' | 'default'
  updateMode: 'governed_seed_update'
  policyUpdatePolicy: 'trusted_source_auto_publish'
  sourceCheckedAt: string | null
  nextReviewDueAt: string | null
}

export interface CertificateTemplatePreviewCityOverride {
  overrideCode: string
  cityCode: string
  cityName: string
  provinceCode: string
  overrideScope: 'city'
  profileVersion: string
  aliases: string[]
  handlingAuthorityOverrides?: Record<string, string>
  reusableOutputOverrides?: Record<string, string[]>
  policySources: Array<Omit<CertificateTemplateProvincePolicySource, 'policyLevel'>>
  notes: string[]
  source: 'project_static_profile' | 'project_metadata' | 'project_location'
  applied: boolean
}

interface CertificateTemplateResolvedProvinceProfile extends CertificateTemplatePreviewProvinceProfile {
  lastReviewedAt: string
  nextReviewDueAt: string
  materialOverrides: CertificateTemplateProvinceProfile['materialOverrides']
  materialPackageOverrides: CertificateTemplateProvinceProfile['materialPackageOverrides']
  policySources: CertificateTemplateProvincePolicySource[]
}

interface CertificateTemplateResolvedCityOverride extends CertificateTemplatePreviewCityOverride {
  lastReviewedAt: string
  nextReviewDueAt: string
  materialOverrides: CertificateTemplateCityOverride['materialOverrides']
  materialPackageOverrides: CertificateTemplateCityOverride['materialPackageOverrides']
  policySources: CertificateTemplateProvincePolicySource[]
}

interface CertificateTemplateProvinceResolution {
  recognition: CertificateTemplateProvinceRecognitionRule
  profile: CertificateTemplateResolvedProvinceProfile | null
  source: CertificateTemplatePreviewProvinceRuleSource['source']
  recognitionAccuracy: CertificateTemplatePreviewProvinceRuleSource['recognitionAccuracy']
}

interface CertificateTemplateCityOverrideResolution {
  override: CertificateTemplateResolvedCityOverride | null
  source: CertificateTemplatePreviewCityOverride['source'] | null
}

export interface CertificateTemplatePreview {
  templateCode: string
  templateName: string
  seedVersion: string
  projectId: string
  summary: {
    certificateCreateCount: number
    workItemCreateCount: number
    dependencyCreateCount: number
    skippedExistingCount: number
    needsConfirmationCount: number
  }
  certificates: CertificateTemplatePreviewCertificate[]
  workItems: CertificateTemplatePreviewWorkItem[]
  dependencies: CertificateTemplatePreviewDependency[]
  materialPackages: CertificateTemplatePreviewMaterialPackage[]
  materialEvidenceChains: CertificateTemplateMaterialEvidenceChain[]
  handlingSteps: CertificateTemplateHandlingStep[]
  landAcquisition: {
    selectedMethodCode: LandAcquisitionMethodCode
    source: 'preview_option' | 'project_metadata' | 'default'
    methods: CertificateTemplateLandAcquisitionMethod[]
  }
  provinceProfile: CertificateTemplatePreviewProvinceProfile | null
  provinceRuleSource: CertificateTemplatePreviewProvinceRuleSource
  cityOverride: CertificateTemplatePreviewCityOverride | null
  warnings: Array<{
    code: string
    message: string
    severity: 'info' | 'warning'
  }>
}

export interface BuildCertificateTemplatePreviewOptions {
  landAcquisitionMethodCode?: LandAcquisitionMethodCode | string | null
}

export interface ApplyCertificateTemplateRequest {
  templateCode: string
  seedVersion: string
  selectedCertificateKeys: string[]
  selectedWorkItemCodes: string[]
  selectedDependencyCodes: string[]
  duplicatePolicy: 'skip_existing'
  landAcquisitionMethodCode?: LandAcquisitionMethodCode
  idempotencyKey?: string
}

export interface ApplyCertificateTemplateResult {
  templateCode: string
  seedVersion: string
  projectId: string
  createdCertificateIds: string[]
  createdWorkItemIds: string[]
  createdDependencyIds: string[]
  skippedExisting: Array<{
    entityType: 'certificate' | 'work_item' | 'dependency'
    key: string
    reason: string
  }>
}

export class CertificateTemplateError extends Error {
  constructor(
    public code:
      | 'CERTIFICATE_TEMPLATE_NOT_FOUND'
      | 'CERTIFICATE_TEMPLATE_VERSION_MISMATCH'
      | 'CERTIFICATE_TEMPLATE_INVALID_SELECTION'
      | 'CERTIFICATE_TEMPLATE_IDEMPOTENCY_CONFLICT'
      | 'CERTIFICATE_TEMPLATE_APPLY_CONFLICT',
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

function readProjectStaticLocationFacts(project: Record<string, unknown> | null): Record<string, unknown> {
  const metadata = readRecord(project?.metadata)
  const generationFacts = readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts)
  const projectFeatures = readRecord(generationFacts.projectFeatures ?? generationFacts.project_features)
  const metadataProjectFeatures = readRecord(metadata.projectFeatures ?? metadata.project_features)
  const candidates = [
    readRecord(generationFacts.locationFacts ?? generationFacts.location_facts),
    readRecord(projectFeatures.locationFacts ?? projectFeatures.location_facts),
    readRecord(metadata.wizard_location_facts),
    readRecord(metadata.locationFacts ?? metadata.location_facts),
    readRecord(metadataProjectFeatures.locationFacts ?? metadataProjectFeatures.location_facts),
  ]
  return candidates.find((candidate) => Object.keys(candidate).length > 0) ?? {}
}

function buildLocationFactsSearchValue(locationFacts: Record<string, unknown>) {
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
    locationFacts.district,
    locationFacts.zone,
    locationFacts.rawLocation,
    locationFacts.raw_location,
  ].map(normalizeText).filter(Boolean).join(' ')
}

function normalizeDateTimeForSql(value = new Date()) {
  return value.toISOString()
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
}

function readProjectFact(project: Record<string, unknown> | null, field: CertificateTemplateCondition['field']) {
  const metadata = readRecord(project?.metadata)
  const snakeField = toSnakeCase(field)
  return metadata[field] ?? metadata[snakeField] ?? project?.[field] ?? project?.[snakeField]
}

function isEmptyFact(value: unknown) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function evaluateCondition(project: Record<string, unknown> | null, condition: CertificateTemplateCondition) {
  const factValue = readProjectFact(project, condition.field)
  if (condition.operator === 'exists') return !isEmptyFact(factValue)
  if (condition.operator === 'not_exists') return isEmptyFact(factValue)
  if (condition.operator === 'equals') return factValue === condition.value
  if (condition.operator === 'includes') {
    if (Array.isArray(factValue)) return factValue.includes(condition.value)
    return normalizeText(factValue).includes(normalizeText(condition.value))
  }
  return false
}

function appliesToProjectFacts(
  item: Pick<CertificateTemplateWorkItem, 'appliesWhen' | 'excludesWhen'>,
  project: Record<string, unknown> | null,
) {
  if (item.appliesWhen?.length && !item.appliesWhen.every((condition) => evaluateCondition(project, condition))) {
    return false
  }
  if (item.excludesWhen?.some((condition) => evaluateCondition(project, condition))) {
    return false
  }
  return true
}

function getTemplate(templateCode = GENERAL_CERTIFICATE_TEMPLATE_CODE): CertificateTemplateSeed {
  const template = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find((seed) => seed.templateCode === templateCode)
  if (!template) {
    throw new CertificateTemplateError(
      'CERTIFICATE_TEMPLATE_NOT_FOUND',
      '系统证照模板不存在或已下线',
      404,
      { templateCode },
    )
  }
  return template
}

export function loadCertificateTemplateSeeds() {
  return SYSTEM_CERTIFICATE_TEMPLATE_SEEDS
}

export async function resolveCertificateTemplateForProject(_projectId: string) {
  return getTemplate(GENERAL_CERTIFICATE_TEMPLATE_CODE)
}

function resolveDefaultLandAcquisitionMethod(template: CertificateTemplateSeed): LandAcquisitionMethodCode {
  return (
    template.landAcquisitionMethods.find((method) => method.defaultSelected)?.methodCode ??
    template.landAcquisitionMethods[0]?.methodCode ??
    'transfer'
  )
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
}

function normalizeLandAcquisitionMethodCode(
  template: CertificateTemplateSeed,
  value: unknown,
): LandAcquisitionMethodCode | null {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return null
  const found = template.landAcquisitionMethods.find((method) => method.methodCode === normalized)
  return found?.methodCode ?? null
}

function buildLandAcquisitionMethods(
  template: CertificateTemplateSeed,
  provinceProfile: CertificateTemplateResolvedProvinceProfile | null,
  cityOverride: CertificateTemplateResolvedCityOverride | null = null,
): CertificateTemplateLandAcquisitionMethod[] {
  return template.landAcquisitionMethods.map((method) => {
    const overrides = [
      ...(provinceProfile?.materialOverrides ?? []),
      ...(cityOverride?.materialOverrides ?? []),
    ].filter(
      (override) => override.landAcquisitionMethodCode === method.methodCode,
    )
    if (overrides.length === 0) return method

    return overrides.reduce<CertificateTemplateLandAcquisitionMethod>((current, override) => {
      const removed = new Set(override.removeMaterialNames ?? [])
      const baseMaterials = override.replaceMaterialNames ?? current.materialNames
      return {
        ...current,
        materialNames: uniqueStrings([
          ...baseMaterials.filter((material) => !removed.has(material)),
          ...(override.addMaterialNames ?? []),
        ]),
        policyBasis: uniqueStrings([
          ...current.policyBasis,
          ...(override.addPolicyBasis ?? []),
        ]),
        recommendedFor: uniqueStrings([
          ...current.recommendedFor,
          ...(override.addRecommendedFor ?? []),
        ]),
      }
    }, method)
  })
}

function applyProvinceMaterialPackageOverrides(
  materialPackage: CertificateTemplateMaterialPackage,
  provinceProfile: CertificateTemplateResolvedProvinceProfile | null,
  cityOverride: CertificateTemplateResolvedCityOverride | null = null,
): CertificateTemplateMaterialPackage {
  const overrides = [
    ...(provinceProfile?.materialPackageOverrides ?? []),
    ...(cityOverride?.materialPackageOverrides ?? []),
  ].filter(
    (override) => override.materialPackageCode === materialPackage.packageCode,
  )
  if (overrides.length === 0) return materialPackage

  return overrides.reduce<CertificateTemplateMaterialPackage>((current, override) => {
    const removed = new Set(override.removeMaterialNames ?? [])
    const baseMaterials = override.replaceMaterialNames ?? current.materialNames
    return {
      ...current,
      materialNames: uniqueStrings([
        ...baseMaterials.filter((material) => !removed.has(material)),
        ...(override.addMaterialNames ?? []),
      ]),
      policyBasis: uniqueStrings([
        ...current.policyBasis,
        ...(override.addPolicyBasis ?? []),
      ]),
    }
  }, materialPackage)
}

function toPreviewMaterialPackage(
  materialPackage: CertificateTemplateMaterialPackage,
): CertificateTemplatePreviewMaterialPackage {
  return {
    ...materialPackage,
    packageScope: materialPackage.packageScope,
    source: 'seed',
    selected: true,
  }
}

function buildMaterialPackagePreview(
  template: CertificateTemplateSeed,
  landAcquisition: CertificateTemplatePreview['landAcquisition'],
  provinceProfile: CertificateTemplateResolvedProvinceProfile | null,
  cityOverride: CertificateTemplateResolvedCityOverride | null,
): CertificateTemplatePreviewMaterialPackage[] {
  const certificatePackages = template.materialPackages
    .map((materialPackage) => applyProvinceMaterialPackageOverrides(materialPackage, provinceProfile, cityOverride))
    .map(toPreviewMaterialPackage)

  const selectedMethod = landAcquisition.methods.find((method) => method.methodCode === landAcquisition.selectedMethodCode)
  const methodPackage: CertificateTemplatePreviewMaterialPackage[] = selectedMethod
    ? [
        {
          packageCode: `PKG-LAND-METHOD-${selectedMethod.methodCode.toUpperCase()}`,
          packageName: `${selectedMethod.methodName}资料包`,
          packageScope: 'land_acquisition_method',
          certificateTypes: ['land_certificate', 'land_use_planning_permit'],
          workItemCodes: selectedMethod.workItemCodes,
          materialNames: selectedMethod.materialNames,
          policyBasis: selectedMethod.policyBasis,
          requiredPolicy: 'required',
          sortOrder: 100,
          source: 'land_acquisition_method',
          selected: true,
          methodCode: selectedMethod.methodCode,
        },
      ]
    : []

  const provincePackages = (provinceProfile?.materialOverrides ?? [])
    .filter((override) => override.landAcquisitionMethodCode === landAcquisition.selectedMethodCode)
    .flatMap((override, index): CertificateTemplatePreviewMaterialPackage[] => {
      const materialNames = uniqueStrings([
        ...(override.replaceMaterialNames ?? []),
        ...(override.addMaterialNames ?? []),
      ])
      if (materialNames.length === 0) return []
      return [
        {
          packageCode: `PKG-PROVINCE-${provinceProfile?.provinceCode.toUpperCase()}-${landAcquisition.selectedMethodCode.toUpperCase()}`,
          packageName: `${provinceProfile?.provinceName ?? ''}${selectedMethod?.methodName ?? ''}补充资料包`,
          packageScope: 'province_overlay',
          certificateTypes: ['land_certificate', 'land_use_planning_permit'],
          workItemCodes: selectedMethod?.workItemCodes ?? [],
          materialNames,
          policyBasis: override.addPolicyBasis ?? [],
          requiredPolicy: 'recommended',
          sortOrder: 200 + index,
          source: 'province_profile',
          selected: true,
          methodCode: landAcquisition.selectedMethodCode,
          provinceCode: provinceProfile?.provinceCode,
        },
      ]
    })

  const cityPackages = (cityOverride?.materialOverrides ?? [])
    .filter((override) => override.landAcquisitionMethodCode === landAcquisition.selectedMethodCode)
    .flatMap((override, index): CertificateTemplatePreviewMaterialPackage[] => {
      const materialNames = uniqueStrings([
        ...(override.replaceMaterialNames ?? []),
        ...(override.addMaterialNames ?? []),
      ])
      if (materialNames.length === 0) return []
      const overridePackageCode = cityOverride.cityCode.toUpperCase()
      const overrideDisplayName = cityOverride.cityName
      return [
        {
          packageCode: `PKG-CITY-${overridePackageCode}-${landAcquisition.selectedMethodCode.toUpperCase()}`,
          packageName: `${overrideDisplayName}${selectedMethod?.methodName ?? ''}补充资料包`,
          packageScope: 'city_overlay',
          certificateTypes: ['land_certificate', 'land_use_planning_permit'],
          workItemCodes: selectedMethod?.workItemCodes ?? [],
          materialNames,
          policyBasis: override.addPolicyBasis ?? [],
          requiredPolicy: 'recommended',
          sortOrder: 300 + index,
          source: 'city_override',
          selected: true,
          methodCode: landAcquisition.selectedMethodCode,
          provinceCode: cityOverride.provinceCode,
          cityCode: cityOverride.cityCode,
        },
      ]
    })

  return [...certificatePackages, ...methodPackage, ...provincePackages, ...cityPackages]
}

function buildMaterialEvidenceChains(
  handlingSteps: CertificateTemplateHandlingStep[],
  workItems: CertificateTemplatePreviewWorkItem[],
  materialPackages: CertificateTemplatePreviewMaterialPackage[],
): CertificateTemplateMaterialEvidenceChain[] {
  const materialNameByCode = new Map<string, string>()
  materialPackages
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .forEach((materialPackage) => {
      materialPackage.workItemCodes.forEach((workItemCode, index) => {
        const normalizedCode = normalizeText(workItemCode).toUpperCase()
        const materialName = materialPackage.materialNames[index]
        if (normalizedCode && materialName && !materialNameByCode.has(normalizedCode)) {
          materialNameByCode.set(normalizedCode, materialName)
        }
      })
    })

  return handlingSteps.flatMap((step) =>
    step.satisfiesMaterialCodes.map((materialCode, index): CertificateTemplateMaterialEvidenceChain => {
      const linkedWorkItems = workItems.filter((item) => item.workItemCode === materialCode)
      const linkedPackages = materialPackages.filter((materialPackage) =>
        materialPackage.workItemCodes.includes(materialCode) ||
        materialPackage.materialNames.includes(step.satisfiesMaterials[index] ?? ''),
      )

      return {
        materialCode,
        materialName: step.satisfiesMaterials[index] ?? step.outputDocument,
        certificateType: step.certificateType,
        handlingStepCode: step.stepCode,
        handlingStepName: step.stepName,
        sourceParties: [...step.sourceParties],
        handlingAuthority: step.handlingAuthority,
        requiredSubmitMaterials: [...step.submitMaterials],
        outputDocument: step.outputDocument,
        linkedWorkItemCodes: linkedWorkItems.map((item) => item.workItemCode),
        linkedWorkItemNames: linkedWorkItems.map((item) =>
          materialNameByCode.get(normalizeText(item.workItemCode).toUpperCase()) ?? item.itemName,
        ),
        materialPackageCodes: linkedPackages.map((materialPackage) => materialPackage.packageCode),
        materialPackageNames: linkedPackages.map((materialPackage) => materialPackage.packageName),
        reusableForCertificateTypes: [...step.reusableForCertificateTypes],
        blockingLevel: step.blockingLevel,
      }
    }),
  )
}

function resolveLandAcquisition(
  template: CertificateTemplateSeed,
  project: Record<string, unknown> | null,
  options: BuildCertificateTemplatePreviewOptions,
  provinceProfile: CertificateTemplateResolvedProvinceProfile | null,
  cityOverride: CertificateTemplateResolvedCityOverride | null = null,
): CertificateTemplatePreview['landAcquisition'] {
  const metadata = readRecord(project?.metadata)
  const optionMethod = normalizeLandAcquisitionMethodCode(template, options.landAcquisitionMethodCode)
  const metadataMethod = normalizeLandAcquisitionMethodCode(
    template,
    metadata.landAcquisitionMethodCode ?? metadata.land_acquisition_method_code,
  )
  const selectedMethodCode = optionMethod ?? metadataMethod ?? resolveDefaultLandAcquisitionMethod(template)
  const source = optionMethod ? 'preview_option' : metadataMethod ? 'project_metadata' : 'default'

  return {
    selectedMethodCode,
    source,
    methods: buildLandAcquisitionMethods(template, provinceProfile, cityOverride),
  }
}

function buildDefaultProvinceRecognition(): CertificateTemplateProvinceRecognitionRule {
  return {
    provinceCode: 'default',
    provinceName: '全国通用',
    aliases: ['default', '全国通用'],
    profileCode: 'default',
    profileStatus: 'published_profile',
  }
}

function matchProvinceRecognition(value: unknown): CertificateTemplateProvinceRecognitionRule | null {
  const normalized = normalizeSearchText(value)
  if (!normalized) return null
  return CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) =>
    [rule.provinceCode, rule.provinceName, ...rule.aliases].some((alias) => {
      const normalizedAlias = normalizeSearchText(alias)
      return normalizedAlias && normalized.includes(normalizedAlias)
    }),
  ) ?? null
}

function resolveProvinceRecognition(project: Record<string, unknown> | null): {
  recognition: CertificateTemplateProvinceRecognitionRule
  source: CertificateTemplatePreviewProvinceRuleSource['source']
  recognitionAccuracy: CertificateTemplatePreviewProvinceRuleSource['recognitionAccuracy']
} {
  const metadata = readRecord(project?.metadata)
  const locationFacts = readProjectStaticLocationFacts(project)
  const staticLocationValue = buildLocationFactsSearchValue(locationFacts)
  const staticLocationRecognition = matchProvinceRecognition(staticLocationValue)
  if (staticLocationRecognition) {
    const explicitProfileValue =
      locationFacts.provinceCode ??
      locationFacts.province_code ??
      locationFacts.profileCode ??
      locationFacts.profile_code
    const explicitProfileSearch = normalizeSearchText(explicitProfileValue)
    const isProfileCode = Boolean(explicitProfileSearch)
      && explicitProfileSearch === normalizeSearchText(staticLocationRecognition.profileCode)
    return {
      recognition: staticLocationRecognition,
      source: 'project_static_profile',
      recognitionAccuracy: isProfileCode ? 'profile_code' : 'province_alias',
    }
  }

  const metadataValue =
    metadata.provinceCode ??
    metadata.province_code ??
    metadata.province ??
    metadata.locationProvince ??
    metadata.location_province
  const metadataRecognition = matchProvinceRecognition(metadataValue)
  if (metadataRecognition) {
    const metadataSearch = normalizeSearchText(metadataValue)
    const isProfileCode = metadataSearch === normalizeSearchText(metadataRecognition.profileCode)
    return {
      recognition: metadataRecognition,
      source: 'project_metadata',
      recognitionAccuracy: isProfileCode ? 'profile_code' : 'province_alias',
    }
  }

  const projectValue = [
    project?.province,
    project?.locationProvince,
    project?.location_province,
    project?.location,
    project?.address,
  ].map(normalizeText).filter(Boolean).join(' ')
  const projectRecognition = matchProvinceRecognition(projectValue)
  if (projectRecognition) {
    return {
      recognition: projectRecognition,
      source: 'project_location',
      recognitionAccuracy: 'province_alias',
    }
  }

  return {
    recognition: buildDefaultProvinceRecognition(),
    source: 'default',
    recognitionAccuracy: 'default',
  }
}

function toResolvedProvinceProfile(
  profile: CertificateTemplateProvinceProfile,
  source: CertificateTemplatePreviewProvinceProfile['source'],
  latestAutoPublishRun?: CertificatePolicyAutoPublishRun | null,
): CertificateTemplateResolvedProvinceProfile {
  const autoPublishedVersion = resolveAutoPublishedPolicyVersion(
    `province_profile:${profile.provinceCode}`,
    latestAutoPublishRun,
  )
  const publishedRuleOverlay = resolveAutoPublishedPolicyRuleOverlay(
    `province_profile:${profile.provinceCode}`,
    latestAutoPublishRun,
  )
  return {
    provinceCode: profile.provinceCode,
    provinceName: profile.provinceName,
    profileVersion: autoPublishedVersion ?? profile.profileVersion,
    lastReviewedAt: profile.lastReviewedAt,
    nextReviewDueAt: profile.nextReviewDueAt,
    authorityAliases: {
      ...profile.authorityAliases,
      ...(publishedRuleOverlay?.authorityAliases ?? {}),
    },
    additionalWorkItemCodes: profile.additionalWorkItemCodes,
    optionalWorkItemCodes: profile.optionalWorkItemCodes,
    softDependencyCodes: profile.softDependencyCodes,
    materialOverrides: profile.materialOverrides,
    materialPackageOverrides: [
      ...profile.materialPackageOverrides,
      ...(publishedRuleOverlay?.materialPackageOverrides ?? []),
    ],
    policySources: profile.policySources,
    notes: profile.notes,
    source,
    applied: true,
    appliedWorkItemCodes: [],
    appliedSoftDependencyCodes: [],
  }
}

function toPreviewPolicySources(policySources: CertificateTemplateProvincePolicySource[]) {
  return policySources.map(({ policyLevel: _policyLevel, ...source }) => source)
}

function toPreviewProvinceProfile(
  profile: CertificateTemplateResolvedProvinceProfile,
): CertificateTemplatePreviewProvinceProfile {
  const {
    lastReviewedAt: _lastReviewedAt,
    nextReviewDueAt: _nextReviewDueAt,
    materialOverrides: _materialOverrides,
    materialPackageOverrides: _materialPackageOverrides,
    ...previewProfile
  } = profile
  return {
    ...previewProfile,
    policySources: toPreviewPolicySources(previewProfile.policySources),
  }
}

function toResolvedCityOverride(
  override: CertificateTemplateCityOverride,
  source: CertificateTemplatePreviewCityOverride['source'],
  latestAutoPublishRun?: CertificatePolicyAutoPublishRun | null,
): CertificateTemplateResolvedCityOverride {
  const autoPublishedVersion = resolveAutoPublishedPolicyVersion(
    `city_override:${override.overrideCode}`,
    latestAutoPublishRun,
  )
  const publishedRuleOverlay = resolveAutoPublishedPolicyRuleOverlay(
    `city_override:${override.overrideCode}`,
    latestAutoPublishRun,
  )
  return {
    overrideCode: override.overrideCode,
    cityCode: override.cityCode,
    cityName: override.cityName,
    provinceCode: override.provinceCode,
    overrideScope: override.overrideScope,
    profileVersion: autoPublishedVersion ?? override.profileVersion,
    aliases: override.aliases,
    handlingAuthorityOverrides: override.handlingAuthorityOverrides,
    reusableOutputOverrides: override.reusableOutputOverrides,
    lastReviewedAt: override.lastReviewedAt,
    nextReviewDueAt: override.nextReviewDueAt,
    materialOverrides: override.materialOverrides,
    materialPackageOverrides: [
      ...override.materialPackageOverrides,
      ...(publishedRuleOverlay?.materialPackageOverrides ?? []),
    ],
    policySources: override.policySources,
    notes: override.notes,
    source,
    applied: true,
  }
}

function resolveAutoPublishedPolicyUpdate(
  assetCode: string,
  latestAutoPublishRun?: CertificatePolicyAutoPublishRun | null,
) {
  const latestRun = latestAutoPublishRun ?? getLatestStableCertificatePolicyAutoPublishRun()
  if (!latestRun || latestRun.publicationStatus !== 'published') return null
  return latestRun.autoPublishedUpdates.find((update) => update.assetCode === assetCode) ?? null
}

function resolveAutoPublishedPolicyVersion(
  assetCode: string,
  latestAutoPublishRun?: CertificatePolicyAutoPublishRun | null,
) {
  return resolveAutoPublishedPolicyUpdate(assetCode, latestAutoPublishRun)?.publishedProfileVersion ?? null
}

function resolveAutoPublishedPolicyRuleOverlay(
  assetCode: string,
  latestAutoPublishRun?: CertificatePolicyAutoPublishRun | null,
): CertificatePolicyPublishedRuleOverlay | null {
  return resolveAutoPublishedPolicyUpdate(assetCode, latestAutoPublishRun)?.publishedRuleOverlay ?? null
}

async function resolveLatestCertificatePolicyAutoPublishRun() {
  try {
    return await loadLatestStableCertificatePolicyAutoPublishRun()
  } catch {
    return null
  }
}

function toPreviewCityOverride(
  override: CertificateTemplateResolvedCityOverride,
): CertificateTemplatePreviewCityOverride {
  const {
    lastReviewedAt: _lastReviewedAt,
    nextReviewDueAt: _nextReviewDueAt,
    materialOverrides: _materialOverrides,
    materialPackageOverrides: _materialPackageOverrides,
    ...previewOverride
  } = override
  return {
    ...previewOverride,
    policySources: toPreviewPolicySources(previewOverride.policySources),
  }
}

function resolveProvinceProfile(
  template: CertificateTemplateSeed,
  project: Record<string, unknown> | null,
  latestAutoPublishRun?: CertificatePolicyAutoPublishRun | null,
): CertificateTemplateProvinceResolution {
  const resolved = resolveProvinceRecognition(project)
  const publishedProfiles = template.provinceProfiles.filter((profile) => profile.reviewStatus === 'published')
  const targetProfileCode = resolved.recognition.profileStatus === 'published_profile'
    ? resolved.recognition.profileCode
    : 'default'
  const profile = (
    publishedProfiles.find((profile) => profile.provinceCode === targetProfileCode) ??
    publishedProfiles.find((profile) => profile.provinceCode === 'default') ??
    null
  )
  return {
    ...resolved,
    profile: profile ? toResolvedProvinceProfile(profile, resolved.source, latestAutoPublishRun) : null,
  }
}

function matchCityOverride(value: unknown, overrides: CertificateTemplateCityOverride[]) {
  const normalized = normalizeSearchText(value)
  if (!normalized) return null
  return overrides.find((override) =>
    [override.cityCode, override.cityName, ...override.aliases]
      .filter(Boolean)
      .some((alias) => {
        const normalizedAlias = normalizeSearchText(alias)
        return normalizedAlias && normalized.includes(normalizedAlias)
      }),
  ) ?? null
}

function resolveCityOverride(
  template: CertificateTemplateSeed,
  project: Record<string, unknown> | null,
  provinceProfile: CertificateTemplateResolvedProvinceProfile | null,
  latestAutoPublishRun?: CertificatePolicyAutoPublishRun | null,
): CertificateTemplateCityOverrideResolution {
  if (!provinceProfile || provinceProfile.provinceCode === 'default') {
    return { override: null, source: null }
  }
  const publishedOverrides = template.cityOverrides.filter(
    (override) => override.reviewStatus === 'published' && override.provinceCode === provinceProfile.provinceCode,
  )
  if (publishedOverrides.length === 0) return { override: null, source: null }

  const metadata = readRecord(project?.metadata)
  const staticLocationValue = buildLocationFactsSearchValue(readProjectStaticLocationFacts(project))
  const staticLocationOverride = matchCityOverride(staticLocationValue, publishedOverrides)
  if (staticLocationOverride) {
    return {
      override: toResolvedCityOverride(staticLocationOverride, 'project_static_profile', latestAutoPublishRun),
      source: 'project_static_profile',
    }
  }

  const metadataValue = [
    metadata.cityCode,
    metadata.city_code,
    metadata.city,
    metadata.locationCity,
    metadata.location_city,
    metadata.district,
    metadata.zone,
  ].map(normalizeText).filter(Boolean).join(' ')
  const metadataOverride = matchCityOverride(metadataValue, publishedOverrides)
  if (metadataOverride) {
    return {
      override: toResolvedCityOverride(metadataOverride, 'project_metadata', latestAutoPublishRun),
      source: 'project_metadata',
    }
  }

  const projectValue = [
    project?.city,
    project?.cityCode,
    project?.city_code,
    project?.district,
    project?.zone,
    project?.locationCity,
    project?.location_city,
    project?.location,
    project?.address,
  ].map(normalizeText).filter(Boolean).join(' ')
  const projectOverride = matchCityOverride(projectValue, publishedOverrides)
  if (projectOverride) {
    return {
      override: toResolvedCityOverride(projectOverride, 'project_location', latestAutoPublishRun),
      source: 'project_location',
    }
  }

  return { override: null, source: null }
}

function buildProvinceRuleSource(
  resolution: CertificateTemplateProvinceResolution,
): CertificateTemplatePreviewProvinceRuleSource {
  const checkedDates = resolution.profile?.policySources
    .map((source) => source.checkedAt)
    .filter(Boolean)
    .sort() ?? []
  const sourceCheckedAt = checkedDates[checkedDates.length - 1] ?? null
  return {
    recognizedProvinceCode: resolution.recognition.provinceCode,
    recognizedProvinceName: resolution.recognition.provinceName,
    appliedProfileCode: resolution.profile?.provinceCode ?? 'default',
    appliedProfileName: resolution.profile?.provinceName ?? '全国通用',
    source: resolution.source,
    recognitionAccuracy: resolution.recognitionAccuracy,
    updateMode: 'governed_seed_update',
    policyUpdatePolicy: 'trusted_source_auto_publish',
    sourceCheckedAt,
    nextReviewDueAt: resolution.profile?.nextReviewDueAt ?? null,
  }
}

async function loadOptionalProjectFacts<T>(projectId: string, label: string, sql: string): Promise<T[]> {
  try {
    // execute-sql-dynamic-approved: certificate template optional fact loader owns only fixed SQL strings passed by local call sites below.
    return await executeSQL<T>(sql, [projectId])
  } catch (error) {
    logger.warn('[certificateTemplateService] optional project facts unavailable; continuing with empty facts', {
      projectId,
      label,
      error,
    })
    return []
  }
}

async function loadOptionalProjectBaseFact(projectId: string): Promise<Record<string, unknown> | null> {
  try {
    return await executeSQLOne('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]) as Record<string, unknown> | null
  } catch (error) {
    logger.warn('[certificateTemplateService] project base facts unavailable; continuing with default template facts', {
      projectId,
      error,
    })
    return null
  }
}

async function loadProjectFacts(projectId: string, options: { allowUnavailableFacts?: boolean } = {}) {
  const loadFacts = options.allowUnavailableFacts
    ? loadOptionalProjectFacts
    // execute-sql-dynamic-approved: certificate template fact loader owns only fixed SQL strings passed by local call sites below.
    : <T>(_projectId: string, _label: string, sql: string) => executeSQL<T>(sql, [_projectId])
  const [project, certificates, workItems, dependencies] = await Promise.all([
    options.allowUnavailableFacts
      ? loadOptionalProjectBaseFact(projectId)
      : executeSQLOne('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]) as Promise<Record<string, unknown> | null>,
    loadFacts<PreMilestone>(
      projectId,
      'pre_milestones',
      'SELECT * FROM pre_milestones WHERE project_id = ? ORDER BY created_at ASC',
    ),
    loadFacts<CertificateWorkItem>(
      projectId,
      'certificate_work_items',
      'SELECT * FROM certificate_work_items WHERE project_id = ? ORDER BY sort_order ASC',
    ),
    loadFacts<CertificateDependency>(
      projectId,
      'certificate_dependencies',
      'SELECT * FROM certificate_dependencies WHERE project_id = ? ORDER BY created_at ASC',
    ),
  ])

  return {
    project,
    certificates,
    workItems,
    dependencies,
  }
}

function getCertificateType(row: Partial<PreMilestone>) {
  return normalizeText(row.certificate_type ?? row.milestone_type).toLowerCase()
}

function applyProvinceAuthorityAlias(authority: string | undefined, profile: CertificateTemplatePreviewProvinceProfile | null) {
  const value = normalizeText(authority)
  if (!value || !profile) return authority
  const naturalResourcesAlias = profile.authorityAliases.naturalResources
  const housingConstructionAlias = profile.authorityAliases.housingConstruction
  if (naturalResourcesAlias && value.includes('自然资源主管部门')) {
    return value.replaceAll('自然资源主管部门', naturalResourcesAlias)
  }
  if (housingConstructionAlias && value.includes('住房和城乡建设主管部门')) {
    return value.replaceAll('住房和城乡建设主管部门', housingConstructionAlias)
  }
  return authority
}

function buildProvinceManagedWorkItemCodes(template: CertificateTemplateSeed) {
  return new Set(
    template.provinceProfiles.filter((profile) => profile.reviewStatus === 'published').flatMap((profile) => [
      ...profile.additionalWorkItemCodes,
      ...profile.optionalWorkItemCodes,
    ]),
  )
}

function getAppliedProvinceWorkItemCodes(
  profile: CertificateTemplatePreviewProvinceProfile | null,
  previewWorkItemCodes: Set<string>,
) {
  if (!profile) return []
  return [...new Set([...profile.additionalWorkItemCodes, ...profile.optionalWorkItemCodes])]
    .filter((code) => previewWorkItemCodes.has(code))
}

function buildCertificatePreview(
  template: CertificateTemplateSeed,
  existingCertificates: PreMilestone[],
  provinceProfile: CertificateTemplatePreviewProvinceProfile | null,
): CertificateTemplatePreviewCertificate[] {
  const existingByType = new Map(
    existingCertificates
      .map((certificate) => [getCertificateType(certificate), certificate] as const)
      .filter(([type]) => Boolean(type)),
  )

  return template.certificates.map((certificate) => {
    const existing = existingByType.get(certificate.certificateType)
    const action: CertificateTemplatePreviewAction = existing ? 'will_skip_existing' : 'will_create'
    return {
      key: certificate.certificateType,
      certificateType: certificate.certificateType,
      certificateName: certificate.certificateName,
      defaultStage: certificate.defaultStage,
      defaultStatus: certificate.defaultStatus,
      approvingAuthority: applyProvinceAuthorityAlias(certificate.approvingAuthority, provinceProfile) ?? certificate.approvingAuthority,
      requiredPolicy: certificate.requiredPolicy,
      reason: certificate.reason,
      sortOrder: certificate.sortOrder,
      action,
      selected: action === 'will_create',
      existingId: existing?.id ?? null,
      skipReason: existing ? '项目已存在同类型证照，系统模板不会覆盖。' : null,
    }
  })
}

function buildWorkItemPreview(
  template: CertificateTemplateSeed,
  project: Record<string, unknown> | null,
  existingWorkItems: CertificateWorkItem[],
  selectedLandAcquisitionMethodCode: LandAcquisitionMethodCode,
  provinceProfile: CertificateTemplatePreviewProvinceProfile | null,
): CertificateTemplatePreviewWorkItem[] {
  const existingByCode = new Map(
    existingWorkItems
      .map((item) => [normalizeText(item.item_code).toUpperCase(), item] as const)
      .filter(([code]) => Boolean(code)),
  )
  const existingByName = new Map(
    existingWorkItems
      .map((item) => [normalizeText(item.item_name), item] as const)
      .filter(([name]) => Boolean(name)),
  )

  const provinceManagedCodes = buildProvinceManagedWorkItemCodes(template)
  const currentProvinceCodes = new Set([
    ...(provinceProfile?.additionalWorkItemCodes ?? []),
    ...(provinceProfile?.optionalWorkItemCodes ?? []),
  ])

  return template.workItems.filter((item) => {
    const selectedByProvinceProfile = currentProvinceCodes.has(item.workItemCode)
    if (item.landAcquisitionMethodCodes?.length && !item.landAcquisitionMethodCodes.includes(selectedLandAcquisitionMethodCode)) {
      return false
    }
    if (!selectedByProvinceProfile && !appliesToProjectFacts(item, project)) {
      return false
    }
    const canEnterByProjectFacts = Boolean(item.appliesWhen?.length || item.excludesWhen?.length)
    if (provinceManagedCodes.has(item.workItemCode) && !selectedByProvinceProfile && !canEnterByProjectFacts) {
      return false
    }
    return true
  }).map((item) => {
    const existingByStableCode = existingByCode.get(item.workItemCode.toUpperCase())
    const existingByTitleOnly = existingByName.get(item.itemName)
    const action: CertificateTemplatePreviewAction = existingByStableCode
      ? 'will_skip_existing'
      : existingByTitleOnly
        ? 'needs_confirmation'
        : 'will_create'
    const existing = existingByStableCode ?? existingByTitleOnly

    return {
      workItemCode: item.workItemCode,
      itemName: item.itemName,
      itemStage: item.itemStage,
      defaultStatus: item.defaultStatus,
      approvingAuthority: applyProvinceAuthorityAlias(item.approvingAuthority, provinceProfile) ?? null,
      isShared: item.isShared,
      certificateTypes: item.certificateTypes,
      requiredPolicy: item.requiredPolicy,
      planRole: item.planRole,
      criticality: item.criticality,
      defaultNextAction: item.defaultNextAction,
      sortOrder: item.sortOrder,
      action,
      selected: action === 'will_create',
      existingId: existing?.id ?? null,
      skipReason: existingByStableCode
        ? '项目已存在同编码办理事项，系统模板不会重复创建。'
        : existingByTitleOnly
          ? '项目存在同名但缺少模板编码的办理事项，本次暂不自动生成。'
          : null,
      sourceEvidence: item.sourceEvidence ?? [],
      landAcquisitionMethodCodes: item.landAcquisitionMethodCodes ?? [],
      provinceProfileCodes: currentProvinceCodes.has(item.workItemCode)
        ? [provinceProfile?.provinceCode ?? 'default']
        : item.provinceProfileCodes ?? [],
    }
  })
}

function endpointKey(endpoint: CertificateTemplateDependency['predecessor']) {
  if (endpoint.type === 'certificate') return `certificate:${endpoint.certificateType}`
  return `work_item:${endpoint.workItemCode}`
}

function buildDependencyPreview(
  template: CertificateTemplateSeed,
  certificatePreview: CertificateTemplatePreviewCertificate[],
  workItemPreview: CertificateTemplatePreviewWorkItem[],
  existingDependencies: CertificateDependency[],
  provinceProfile: CertificateTemplatePreviewProvinceProfile | null,
): CertificateTemplatePreviewDependency[] {
  const certificateActionByType = new Map(certificatePreview.map((item) => [item.certificateType, item.action]))
  const workItemActionByCode = new Map(workItemPreview.map((item) => [item.workItemCode, item.action]))
  const availableWorkItemCodes = new Set(workItemPreview.map((item) => item.workItemCode))
  const existingDependencyKeys = new Set(
    existingDependencies.map((dependency) => [
      dependency.predecessor_type,
      dependency.predecessor_id,
      dependency.successor_type,
      dependency.successor_id,
      dependency.dependency_kind,
    ].join(':')),
  )

  return template.dependencies.filter((dependency) => {
    const endpoints = [dependency.predecessor, dependency.successor]
    return endpoints.every((endpoint) => endpoint.type === 'certificate' || availableWorkItemCodes.has(endpoint.workItemCode))
  }).map((dependency) => {
    const predecessorAction = dependency.predecessor.type === 'certificate'
      ? certificateActionByType.get(dependency.predecessor.certificateType)
      : workItemActionByCode.get(dependency.predecessor.workItemCode)
    const successorAction = dependency.successor.type === 'certificate'
      ? certificateActionByType.get(dependency.successor.certificateType)
      : workItemActionByCode.get(dependency.successor.workItemCode)
    const cannotResolve =
      predecessorAction === 'needs_confirmation' ||
      successorAction === 'needs_confirmation'
    const allExisting =
      predecessorAction === 'will_skip_existing' &&
      successorAction === 'will_skip_existing'
    const syntheticKey = [
      dependency.predecessor.type,
      endpointKey(dependency.predecessor),
      dependency.successor.type,
      endpointKey(dependency.successor),
      dependency.dependencyKind,
    ].join(':')
    const action: CertificateTemplatePreviewAction = cannotResolve
      ? 'needs_confirmation'
      : allExisting || existingDependencyKeys.has(syntheticKey)
        ? 'will_skip_existing'
        : 'will_create'

    return {
      ...dependency,
      action,
      selected: action === 'will_create',
      provinceProfileCodes: provinceProfile?.softDependencyCodes.includes(dependency.dependencyCode)
        ? [provinceProfile.provinceCode]
        : [],
      skipReason: action === 'needs_confirmation'
        ? '依赖端点存在暂不生成的事项，本次暂不自动创建。'
        : action === 'will_skip_existing'
          ? '依赖关系已存在或端点均为已有项目事实。'
          : null,
    }
  })
}

function summarizePreview(
  certificates: CertificateTemplatePreviewCertificate[],
  workItems: CertificateTemplatePreviewWorkItem[],
  dependencies: CertificateTemplatePreviewDependency[],
) {
  const allItems = [...certificates, ...workItems, ...dependencies]
  return {
    certificateCreateCount: certificates.filter((item) => item.action === 'will_create').length,
    workItemCreateCount: workItems.filter((item) => item.action === 'will_create').length,
    dependencyCreateCount: dependencies.filter((item) => item.action === 'will_create').length,
    skippedExistingCount: allItems.filter((item) => item.action === 'will_skip_existing').length,
    needsConfirmationCount: allItems.filter((item) => item.action === 'needs_confirmation').length,
  }
}

export async function buildCertificateTemplatePreview(
  projectId: string,
  options: BuildCertificateTemplatePreviewOptions = {},
): Promise<CertificateTemplatePreview> {
  const template = await resolveCertificateTemplateForProject(projectId)
  const facts = await loadProjectFacts(projectId, { allowUnavailableFacts: true })
  const latestAutoPublishRun = await resolveLatestCertificatePolicyAutoPublishRun()
  const provinceResolution = resolveProvinceProfile(template, facts.project, latestAutoPublishRun)
  const provinceProfile = provinceResolution.profile
  const cityResolution = resolveCityOverride(template, facts.project, provinceProfile, latestAutoPublishRun)
  const cityOverride = cityResolution.override
  const landAcquisition = resolveLandAcquisition(template, facts.project, options, provinceProfile, cityOverride)
  const certificates = buildCertificatePreview(template, facts.certificates, provinceProfile)
  const workItems = buildWorkItemPreview(template, facts.project, facts.workItems, landAcquisition.selectedMethodCode, provinceProfile)
  const dependencies = buildDependencyPreview(template, certificates, workItems, facts.dependencies, provinceProfile)
  const materialPackages = buildMaterialPackagePreview(template, landAcquisition, provinceProfile, cityOverride)
  const handlingSteps = template.handlingSteps.map((step) => ({
    ...step,
    sourceParties: [...step.sourceParties],
    submitMaterials: [...step.submitMaterials],
    satisfiesMaterialCodes: [...step.satisfiesMaterialCodes],
    satisfiesMaterials: [...step.satisfiesMaterials],
    reusableForCertificateTypes: [...step.reusableForCertificateTypes],
  }))
  const materialEvidenceChains = buildMaterialEvidenceChains(handlingSteps, workItems, materialPackages)
  const previewWorkItemCodes = new Set(workItems.map((item) => item.workItemCode))
  const previewDependencyCodes = new Set(dependencies.map((dependency) => dependency.dependencyCode))
  const resolvedProvinceProfile = provinceProfile
    ? toPreviewProvinceProfile({
        ...provinceProfile,
        appliedWorkItemCodes: getAppliedProvinceWorkItemCodes(provinceProfile, previewWorkItemCodes),
        appliedSoftDependencyCodes: provinceProfile.softDependencyCodes.filter((code) => previewDependencyCodes.has(code)),
      })
    : null

  return {
    templateCode: template.templateCode,
    templateName: template.templateName,
    seedVersion: template.seedVersion,
    projectId,
    summary: summarizePreview(certificates, workItems, dependencies),
    certificates,
    workItems,
    dependencies,
    materialPackages,
    materialEvidenceChains,
    handlingSteps,
    landAcquisition,
    provinceProfile: resolvedProvinceProfile,
    provinceRuleSource: buildProvinceRuleSource(provinceResolution),
    cityOverride: cityOverride ? toPreviewCityOverride(cityOverride) : null,
    warnings: [
      {
        code: 'GENERAL_TEMPLATE_PROVINCE_PROFILE_PENDING',
        message: provinceProfile?.provinceCode && provinceProfile.provinceCode !== 'default'
          ? `当前按通用四证骨架生成草稿，并叠加${provinceProfile.provinceName}${cityOverride ? `、${cityOverride.cityName}` : ''}资料口径。`
          : '当前按通用建设工程四证模板生成草稿，地方材料清单和窗口名称请在办理事项中微调。',
        severity: 'info',
      },
    ],
  }
}

function assertApplyRequest(template: CertificateTemplateSeed, request: ApplyCertificateTemplateRequest) {
  if (request.templateCode !== template.templateCode) {
    throw new CertificateTemplateError('CERTIFICATE_TEMPLATE_NOT_FOUND', '系统证照模板不存在或已下线', 404)
  }
  if (request.seedVersion !== template.seedVersion) {
    throw new CertificateTemplateError(
      'CERTIFICATE_TEMPLATE_VERSION_MISMATCH',
      '系统证照模板版本已更新，请刷新预览后再应用',
      409,
      { expected: template.seedVersion, received: request.seedVersion },
    )
  }
  if (request.duplicatePolicy !== 'skip_existing') {
    throw new CertificateTemplateError(
      'CERTIFICATE_TEMPLATE_INVALID_SELECTION',
      '当前版本仅支持 skip_existing 重复策略',
      400,
    )
  }

  const certificateTypes = new Set(template.certificates.map((certificate) => certificate.certificateType))
  const workItemCodes = new Set(template.workItems.map((item) => item.workItemCode))
  const dependencyCodes = new Set(template.dependencies.map((dependency) => dependency.dependencyCode))
  const landMethodCodes = new Set(template.landAcquisitionMethods.map((method) => method.methodCode))
  const invalidSelections = [
    ...request.selectedCertificateKeys.filter((key) => !certificateTypes.has(key as KnownCertificateType)),
    ...request.selectedWorkItemCodes.filter((key) => !workItemCodes.has(key)),
    ...request.selectedDependencyCodes.filter((key) => !dependencyCodes.has(key)),
    request.landAcquisitionMethodCode && !landMethodCodes.has(request.landAcquisitionMethodCode)
      ? request.landAcquisitionMethodCode
      : null,
  ].filter((item): item is string => Boolean(item))
  if (invalidSelections.length > 0) {
    throw new CertificateTemplateError(
      'CERTIFICATE_TEMPLATE_INVALID_SELECTION',
      '模板应用选择项不属于当前系统模板',
      400,
      { invalidSelections },
    )
  }
}

function getSelectedPreview<T extends { action: CertificateTemplatePreviewAction; selected: boolean }>(
  items: T[],
) {
  return items.filter((item) => item.selected && item.action === 'will_create')
}

function resolveSelectedPreview(request: ApplyCertificateTemplateRequest, preview: CertificateTemplatePreview) {
  const certificateKeys = new Set(request.selectedCertificateKeys)
  const workItemCodes = new Set(request.selectedWorkItemCodes)
  const dependencyCodes = new Set(request.selectedDependencyCodes)
  return {
    certificates: getSelectedPreview(
      preview.certificates.map((item) => ({
        ...item,
        selected: certificateKeys.has(item.certificateType) && item.action === 'will_create',
      })),
    ),
    workItems: getSelectedPreview(
      preview.workItems.map((item) => ({
        ...item,
        selected: workItemCodes.has(item.workItemCode) && item.action === 'will_create',
      })),
    ),
    dependencies: getSelectedPreview(
      preview.dependencies.map((item) => ({
        ...item,
        selected: dependencyCodes.has(item.dependencyCode) && item.action === 'will_create',
      })),
    ),
  }
}

function toTemplateSkipped(preview: CertificateTemplatePreview): ApplyCertificateTemplateResult['skippedExisting'] {
  return [
    ...preview.certificates
      .filter((item) => item.action !== 'will_create')
      .map((item) => ({
        entityType: 'certificate' as const,
        key: item.certificateType,
        reason: item.skipReason ?? '项目已有证照或本次暂不生成',
      })),
    ...preview.workItems
      .filter((item) => item.action !== 'will_create')
      .map((item) => ({
        entityType: 'work_item' as const,
        key: item.workItemCode,
        reason: item.skipReason ?? '项目已有办理事项或本次暂不生成',
      })),
    ...preview.dependencies
      .filter((item) => item.action !== 'will_create')
      .map((item) => ({
        entityType: 'dependency' as const,
        key: item.dependencyCode,
        reason: item.skipReason ?? '依赖已存在或本次暂不生成',
      })),
  ]
}

function mapEndpointToPersistedId(
  endpoint: CertificateTemplateDependency['predecessor'],
  certificateIds: Map<CertificateType, string>,
  workItemIds: Map<string, string>,
) {
  if (endpoint.type === 'certificate') return certificateIds.get(endpoint.certificateType) ?? null
  return workItemIds.get(endpoint.workItemCode) ?? null
}

function buildExistingCertificateIdMap(certificates: PreMilestone[]) {
  return new Map(
    certificates
      .map((certificate) => [getCertificateType(certificate), certificate.id] as const)
      .filter(([type, id]) => Boolean(type) && Boolean(id)),
  )
}

function buildExistingWorkItemIdMap(workItems: CertificateWorkItem[]) {
  const byCode = workItems
    .map((item) => [normalizeText(item.item_code).toUpperCase(), item.id] as const)
    .filter(([code, id]) => Boolean(code) && Boolean(id))
  return new Map(byCode)
}

function mergeEndpointIdMaps<T extends string>(created: Map<T, string>, existing: Map<string, string>) {
  const merged = new Map<T, string>(created)
  for (const [key, value] of existing) {
    if (!merged.has(key as T)) merged.set(key as T, value)
  }
  return merged
}

function mapEndpointType(endpoint: CertificateTemplateDependency['predecessor']): CertificateDependencyTargetType {
  return endpoint.type === 'certificate' ? 'certificate' : 'work_item'
}

type CertificateTemplateApplyBatchReplayRow = {
  project_id?: string | null
  template_code?: string | null
  seed_version?: string | null
  request_fingerprint?: string | null
  created_certificate_ids?: unknown
  created_work_item_ids?: unknown
  created_dependency_ids?: unknown
  skipped_existing?: unknown
}

function stableSelection(values: string[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean))).sort()
}

function buildApplyRequestFingerprint(projectId: string, request: ApplyCertificateTemplateRequest) {
  const canonical = JSON.stringify({
    projectId: normalizeText(projectId),
    templateCode: normalizeText(request.templateCode),
    seedVersion: normalizeText(request.seedVersion),
    selectedCertificateKeys: stableSelection(request.selectedCertificateKeys),
    selectedWorkItemCodes: stableSelection(request.selectedWorkItemCodes),
    selectedDependencyCodes: stableSelection(request.selectedDependencyCodes),
    duplicatePolicy: request.duplicatePolicy,
    landAcquisitionMethodCode: normalizeText(request.landAcquisitionMethodCode) || null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

function resolveApplyIdempotencyKey(request: ApplyCertificateTemplateRequest, fingerprint: string) {
  const explicit = normalizeText(request.idempotencyKey)
  if (explicit.length > 200) {
    throw new CertificateTemplateError(
      'CERTIFICATE_TEMPLATE_INVALID_SELECTION',
      '幂等键长度不能超过 200 个字符',
      400,
    )
  }
  return explicit || `derived:${fingerprint}`
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function replayApplyBatch(
  row: CertificateTemplateApplyBatchReplayRow,
  projectId: string,
  expectedFingerprint: string,
): ApplyCertificateTemplateResult {
  const storedFingerprint = normalizeText(row.request_fingerprint)
  if (storedFingerprint && storedFingerprint !== expectedFingerprint) {
    throw new CertificateTemplateError(
      'CERTIFICATE_TEMPLATE_IDEMPOTENCY_CONFLICT',
      '该幂等键已用于不同的证照模板应用请求',
      409,
    )
  }
  return {
    projectId,
    templateCode: normalizeText(row.template_code),
    seedVersion: normalizeText(row.seed_version),
    createdCertificateIds: stringArray(row.created_certificate_ids),
    createdWorkItemIds: stringArray(row.created_work_item_ids),
    createdDependencyIds: stringArray(row.created_dependency_ids),
    skippedExisting: Array.isArray(row.skipped_existing)
      ? row.skipped_existing as ApplyCertificateTemplateResult['skippedExisting']
      : [],
  }
}

export async function applyCertificateTemplate(
  projectId: string,
  request: ApplyCertificateTemplateRequest,
  actorUserId?: string | null,
): Promise<ApplyCertificateTemplateResult> {
  const template = getTemplate(request.templateCode)
  assertApplyRequest(template, request)

  const createdCertificateIds: string[] = []
  const createdWorkItemIds: string[] = []
  const createdDependencyIds: string[] = []
  const certificateIds = new Map<CertificateType, string>()
  const workItemIds = new Map<string, string>()
  const now = normalizeDateTimeForSql()
  const requestFingerprint = buildApplyRequestFingerprint(projectId, request)
  const idempotencyKey = resolveApplyIdempotencyKey(request, requestFingerprint)
  const client = await getClient()

  try {
    await client.query('BEGIN')
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`certificate_template_apply:${projectId}`],
    )

    const existingBatch = await client.query<CertificateTemplateApplyBatchReplayRow>(
      `SELECT project_id, template_code, seed_version, request_fingerprint,
              created_certificate_ids, created_work_item_ids, created_dependency_ids, skipped_existing
         FROM public.certificate_template_apply_batches
        WHERE project_id = $1
          AND idempotency_key = $2
        LIMIT 1`,
      [projectId, idempotencyKey],
    )
    const replayRow = existingBatch.rows[0]
    if (
      replayRow
      && normalizeText(replayRow.project_id) === projectId
      && normalizeText(replayRow.template_code)
      && normalizeText(replayRow.seed_version)
    ) {
      const replay = replayApplyBatch(replayRow, projectId, requestFingerprint)
      await client.query('COMMIT')
      return replay
    }

    const preview = await buildCertificateTemplatePreview(projectId, {
      landAcquisitionMethodCode: request.landAcquisitionMethodCode,
    })
    const selected = resolveSelectedPreview(request, preview)
    const facts = await loadProjectFacts(projectId)

    for (const certificate of selected.certificates) {
      const row = await insertRowReturning<PreMilestone>(client, 'pre_milestones', {
        id: uuidv4(),
        project_id: projectId,
        milestone_type: certificate.certificateType,
        milestone_name: certificate.certificateName,
        certificate_type: certificate.certificateType,
        certificate_name: certificate.certificateName,
        status: certificate.defaultStatus,
        certificate_no: null,
        issue_date: null,
        expiry_date: null,
        current_stage: certificate.defaultStage,
        planned_finish_date: null,
        actual_finish_date: null,
        approving_authority: certificate.approvingAuthority,
        issuing_authority: certificate.approvingAuthority,
        next_action: null,
        next_action_due_date: null,
        is_blocked: false,
        block_reason: null,
        latest_record_at: now,
        description: certificate.reason,
        sort_order: certificate.sortOrder,
        notes: `system_template:${template.templateCode}@${template.seedVersion}`,
        created_by: actorUserId ?? null,
        created_at: now,
        updated_at: now,
      })
      createdCertificateIds.push(row.id)
      certificateIds.set(certificate.certificateType, row.id)
    }

    for (const workItem of selected.workItems) {
      const row = await insertRowReturning<CertificateWorkItem>(client, 'certificate_work_items', {
        id: uuidv4(),
        project_id: projectId,
        item_code: workItem.workItemCode,
        item_name: workItem.itemName,
        item_stage: workItem.itemStage,
        status: workItem.defaultStatus,
        planned_finish_date: null,
        actual_finish_date: null,
        approving_authority: workItem.approvingAuthority ?? null,
        is_shared: workItem.isShared,
        next_action: workItem.defaultNextAction,
        next_action_due_date: null,
        is_blocked: false,
        block_reason: null,
        sort_order: workItem.sortOrder,
        notes: `system_template:${template.templateCode}@${template.seedVersion}`,
        latest_record_at: now,
        created_at: now,
        updated_at: now,
      })
      createdWorkItemIds.push(row.id)
      workItemIds.set(workItem.workItemCode, row.id)
    }

    const dependencyCertificateIds = mergeEndpointIdMaps(certificateIds, buildExistingCertificateIdMap(facts.certificates))
    const dependencyWorkItemIds = mergeEndpointIdMaps(workItemIds, buildExistingWorkItemIdMap(facts.workItems))
    for (const dependency of selected.dependencies) {
      const predecessorId = mapEndpointToPersistedId(dependency.predecessor, dependencyCertificateIds, dependencyWorkItemIds)
      const successorId = mapEndpointToPersistedId(dependency.successor, dependencyCertificateIds, dependencyWorkItemIds)
      if (!predecessorId || !successorId) continue

      const row = await insertRowReturning<CertificateDependency>(client, 'certificate_dependencies', {
        id: uuidv4(),
        project_id: projectId,
        predecessor_type: mapEndpointType(dependency.predecessor),
        predecessor_id: predecessorId,
        successor_type: mapEndpointType(dependency.successor),
        successor_id: successorId,
        dependency_kind: dependency.dependencyKind as CertificateDependencyKind,
        notes: `${dependency.dependencyCode}: ${dependency.reason}`,
        created_at: now,
      })
      createdDependencyIds.push(row.id)
    }

    const summary = {
      createdCertificateCount: createdCertificateIds.length,
      createdWorkItemCount: createdWorkItemIds.length,
      createdDependencyCount: createdDependencyIds.length,
      skippedExistingCount: toTemplateSkipped(preview).length,
    }
    await insertRowReturning(client, 'certificate_template_apply_batches', {
      id: uuidv4(),
      project_id: projectId,
      template_code: template.templateCode,
      seed_version: template.seedVersion,
      applied_by: actorUserId ?? null,
      apply_mode: 'system_preview_apply',
      duplicate_policy: request.duplicatePolicy,
      idempotency_key: idempotencyKey,
      request_fingerprint: requestFingerprint,
      summary,
      created_certificate_ids: createdCertificateIds,
      created_work_item_ids: createdWorkItemIds,
      created_dependency_ids: createdDependencyIds,
      skipped_existing: toTemplateSkipped(preview),
      created_at: now,
    })

    await client.query('COMMIT')
    markPreMilestoneProjectChanged(projectId)

    return {
      templateCode: template.templateCode,
      seedVersion: template.seedVersion,
      projectId,
      createdCertificateIds,
      createdWorkItemIds,
      createdDependencyIds,
      skippedExisting: toTemplateSkipped(preview),
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export { CERTIFICATE_TEMPLATE_SEED_VERSION, GENERAL_CERTIFICATE_TEMPLATE_CODE }
