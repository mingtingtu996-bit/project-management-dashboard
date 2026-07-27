import { v4 as uuidv4 } from 'uuid'

import { getClient } from '../database.js'
import { executeSQL, executeSQLOne } from './dbService.js'
import { insertRowReturning } from './transactionInsertService.js'
import type { DrawingPackage, DrawingPackageItem } from '../types/db.js'
import {
  DRAWING_PACKAGE_TEMPLATE_SEED,
  DRAWING_PACKAGE_TEMPLATE_SEED_VERSION,
  GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE,
  type DrawingPackageBusinessProfile,
  type DrawingPackageTemplatePackageSeed,
} from '../seeds/drawingPackageTemplateSeed.js'
import type { DrawingPackageExperienceOverlay } from './drawingPackageExperienceIterationService.js'

export type DrawingPackageTemplatePreviewAction = 'will_create' | 'will_skip_existing'

export interface DrawingPackageTemplatePreviewItem {
  itemCode: string
  itemName: string
  disciplineType: string
  isRequired: boolean
  sortOrder: number
}

export interface DrawingPackageTemplatePreviewPackage {
  packageCode: string
  packageName: string
  disciplineType: string
  documentPurpose: string
  reviewMode: string
  reviewBasis: string
  scopeLevel: DrawingPackageTemplatePackageSeed['scopeLevel']
  deliverableRole: DrawingPackageTemplatePackageSeed['deliverableRole']
  linkedConstructionStage: string
  linkedAcceptancePurpose: string
  items: DrawingPackageTemplatePreviewItem[]
  action: DrawingPackageTemplatePreviewAction
  selected: boolean
  existingPackageId: string | null
  overlaySource?: 'experience_replay_candidate'
}

export interface DrawingPackageTemplatePreview {
  templateCode: string
  templateName: string
  seedVersion: string
  projectId: string
  summary: {
    packageCreateCount: number
    packageSkipExistingCount: number
    itemCreateCount: number
  }
  templateBoundary: {
    assetLevel: 'drawing_package'
    mainPageLogic: 'preserved'
    applyPolicy: 'create_missing_packages_only'
  }
  businessProfile: {
    businessTypeCode: string
    businessTypeName: string
    source: 'project_generation_facts' | 'project_metadata' | 'project_field' | 'default'
    defaultPackageCodes: string[]
    optionalPackageCodes: string[]
    sourcePolicyHints: string[]
  }
  packages: DrawingPackageTemplatePreviewPackage[]
  experienceOverlay: DrawingPackageExperienceOverlay | null
  warnings: Array<{
    code: string
    message: string
    severity: 'info' | 'warning'
  }>
}

export interface ApplyDrawingPackageTemplateRequest {
  templateCode: string
  seedVersion: string
  selectedPackageCodes: string[]
  duplicatePolicy: 'skip_existing'
}

export interface BuildDrawingPackageTemplatePreviewOptions {
  experienceOverlay?: DrawingPackageExperienceOverlay | null
}

export interface ApplyDrawingPackageTemplateResult {
  templateCode: string
  seedVersion: string
  projectId: string
  createdPackageIds: string[]
  createdItemIds: string[]
  skippedExisting: Array<{
    entityType: 'package'
    key: string
    reason: string
  }>
}

export class DrawingPackageTemplateError extends Error {
  constructor(
    public code:
      | 'DRAWING_PACKAGE_TEMPLATE_NOT_FOUND'
      | 'DRAWING_PACKAGE_TEMPLATE_VERSION_MISMATCH'
      | 'DRAWING_PACKAGE_TEMPLATE_INVALID_SELECTION'
      | 'DRAWING_PACKAGE_TEMPLATE_APPLY_CONFLICT',
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
  const normalized = normalizeText(value)
  return normalized ? [normalized] : []
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

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function includesAny(searchValue: string, keywords: string[] | undefined) {
  if (!keywords?.length) return false
  const normalizedSearch = normalizeSearchText(searchValue)
  return keywords.some((keyword) => normalizedSearch.includes(normalizeSearchText(keyword)))
}

function getTemplate(templateCode = GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE) {
  const template = DRAWING_PACKAGE_TEMPLATE_SEED.templateCode === templateCode ? DRAWING_PACKAGE_TEMPLATE_SEED : null
  if (!template) {
    throw new DrawingPackageTemplateError(
      'DRAWING_PACKAGE_TEMPLATE_NOT_FOUND',
      '系统施工图纸包模板不存在或已下线',
      404,
      { templateCode },
    )
  }
  return template
}

export function loadDrawingPackageTemplateSeed() {
  return DRAWING_PACKAGE_TEMPLATE_SEED
}

function resolveBusinessProfile(project: Record<string, unknown> | null): {
  profile: DrawingPackageBusinessProfile
  source: DrawingPackageTemplatePreview['businessProfile']['source']
} {
  const metadata = readProjectMetadata(project)
  const facts = readProjectGenerationFacts(project)
  const features = readProjectFeatures(project)
  const candidates = [
    { value: facts.businessType ?? facts.business_type ?? facts.businessTypeCode ?? facts.business_type_code, source: 'project_generation_facts' as const },
    { value: facts.businessSubtype ?? facts.business_subtype ?? facts.businessSubtypeCode ?? facts.business_subtype_code, source: 'project_generation_facts' as const },
    { value: features.businessType ?? features.business_type ?? features.businessTypeCode ?? features.business_type_code, source: 'project_generation_facts' as const },
    { value: features.businessSubtype ?? features.business_subtype ?? features.businessSubtypeCode ?? features.business_subtype_code, source: 'project_generation_facts' as const },
    { value: metadata.businessType ?? metadata.business_type ?? metadata.businessTypeCode ?? metadata.business_type_code, source: 'project_metadata' as const },
    { value: metadata.businessSubtype ?? metadata.business_subtype ?? metadata.businessSubtypeCode ?? metadata.business_subtype_code, source: 'project_metadata' as const },
    { value: project?.business_type ?? project?.businessType ?? project?.project_type ?? project?.projectType, source: 'project_field' as const },
  ]

  for (const candidate of candidates) {
    for (const value of readStringArray(candidate.value)) {
      const normalizedValue = normalizeSearchText(value)
      const matched = DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles.find((profile) =>
        normalizeSearchText(profile.businessTypeCode) === normalizedValue
        || profile.aliases.some((alias) => normalizeSearchText(alias) === normalizedValue),
      )
      if (matched) return { profile: matched, source: candidate.source }
    }
  }

  const fallback = DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles
    .find((profile) => profile.businessTypeCode === 'general_civil')
    ?? DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles[0]!
  return { profile: fallback, source: 'default' }
}

function buildProjectFeatureSearchValue(project: Record<string, unknown> | null) {
  const metadata = readProjectMetadata(project)
  const facts = readProjectGenerationFacts(project)
  const features = readProjectFeatures(project)
  const values: string[] = []

  const visit = (value: unknown) => {
    if (value == null) return
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      values.push(String(value))
      return
    }
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(visit)
    }
  }

  visit(project?.name)
  visit(project?.business_type)
  visit(project?.project_type)
  visit(metadata)
  visit(facts)
  visit(features)
  return values.map(normalizeText).filter(Boolean).join(' ')
}

async function loadProjectFacts(projectId: string) {
  const [project, packages] = await Promise.all([
    executeSQLOne<Record<string, unknown>>('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]),
    executeSQL<DrawingPackage>('SELECT * FROM drawing_packages WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
  ])
  return {
    project: project ?? null,
    packages: packages ?? [],
  }
}

function existingPackageKey(row: DrawingPackage) {
  return normalizeSearchText(row.package_code ?? row.package_name ?? `${row.discipline_type}:${row.document_purpose}`)
}

function shouldIncludePackage(
  packageSeed: DrawingPackageTemplatePackageSeed,
  profile: DrawingPackageBusinessProfile,
  projectFeatureSearchValue: string,
) {
  if (profile.defaultPackageCodes.includes(packageSeed.packageCode)) return true
  if (!profile.optionalPackageCodes.includes(packageSeed.packageCode)) return false
  return includesAny(projectFeatureSearchValue, packageSeed.triggerKeywords)
}

function buildPackagePreview(
  existingPackages: DrawingPackage[],
  profile: DrawingPackageBusinessProfile,
  projectFeatureSearchValue: string,
  experienceOverlay: DrawingPackageExperienceOverlay | null = null,
) {
  const existingByKey = new Map(
    existingPackages.map((row) => [existingPackageKey(row), row] as const).filter(([key]) => Boolean(key)),
  )
  const overlayPackageCodes = new Set(
    (experienceOverlay?.qualityGate.status === 'passed' ? experienceOverlay.additionalPackageCodes : [])
      .map(normalizeText)
      .filter(Boolean),
  )

  return DRAWING_PACKAGE_TEMPLATE_SEED.packagePool
    .filter((packageSeed) => shouldIncludePackage(packageSeed, profile, projectFeatureSearchValue) || overlayPackageCodes.has(packageSeed.packageCode))
    .map((packageSeed): DrawingPackageTemplatePreviewPackage => {
      const includedByProfile = shouldIncludePackage(packageSeed, profile, projectFeatureSearchValue)
      const includedByOverlay = overlayPackageCodes.has(packageSeed.packageCode) && !includedByProfile
      const existing = existingByKey.get(normalizeSearchText(packageSeed.packageCode))
        ?? existingByKey.get(normalizeSearchText(packageSeed.packageName))
      const action: DrawingPackageTemplatePreviewAction = existing ? 'will_skip_existing' : 'will_create'
      return {
        packageCode: packageSeed.packageCode,
        packageName: packageSeed.packageName,
        disciplineType: packageSeed.disciplineType,
        documentPurpose: packageSeed.documentPurpose,
        reviewMode: packageSeed.reviewMode,
        reviewBasis: packageSeed.reviewBasis,
        scopeLevel: packageSeed.scopeLevel,
        deliverableRole: packageSeed.deliverableRole,
        linkedConstructionStage: packageSeed.linkedConstructionStage,
        linkedAcceptancePurpose: packageSeed.linkedAcceptancePurpose,
        items: packageSeed.items.map((item) => ({
          itemCode: item.itemCode,
          itemName: item.itemName,
          disciplineType: item.disciplineType ?? packageSeed.disciplineType,
          isRequired: item.isRequired,
          sortOrder: item.sortOrder,
        })),
        action,
        selected: action === 'will_create',
        existingPackageId: normalizeText(existing?.id) || null,
        ...(includedByOverlay ? { overlaySource: 'experience_replay_candidate' as const } : {}),
      }
    })
    .sort((left, right) => {
      const leftIndex = DRAWING_PACKAGE_TEMPLATE_SEED.packagePool.findIndex((item) => item.packageCode === left.packageCode)
      const rightIndex = DRAWING_PACKAGE_TEMPLATE_SEED.packagePool.findIndex((item) => item.packageCode === right.packageCode)
      return leftIndex - rightIndex
    })
}

function summarizePreview(packages: DrawingPackageTemplatePreviewPackage[]) {
  return {
    packageCreateCount: packages.filter((pkg) => pkg.action === 'will_create').length,
    packageSkipExistingCount: packages.filter((pkg) => pkg.action === 'will_skip_existing').length,
    itemCreateCount: packages
      .filter((pkg) => pkg.action === 'will_create')
      .reduce((total, pkg) => total + pkg.items.filter((item) => item.isRequired).length, 0),
  }
}

export async function buildDrawingPackageTemplatePreview(
  projectId: string,
  options: BuildDrawingPackageTemplatePreviewOptions = {},
): Promise<DrawingPackageTemplatePreview> {
  const template = getTemplate(GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE)
  const facts = await loadProjectFacts(projectId)
  const { profile, source } = resolveBusinessProfile(facts.project)
  const projectFeatureSearchValue = [
    buildProjectFeatureSearchValue(facts.project),
    profile.businessTypeCode,
    profile.businessTypeName,
    ...profile.aliases,
  ].join(' ')
  const experienceOverlay = options.experienceOverlay ?? null
  const packages = buildPackagePreview(facts.packages, profile, projectFeatureSearchValue, experienceOverlay)

  return {
    templateCode: template.templateCode,
    templateName: template.templateName,
    seedVersion: template.seedVersion,
    projectId,
    summary: summarizePreview(packages),
    templateBoundary: {
      assetLevel: 'drawing_package',
      mainPageLogic: 'preserved',
      applyPolicy: 'create_missing_packages_only',
    },
    businessProfile: {
      businessTypeCode: profile.businessTypeCode,
      businessTypeName: profile.businessTypeName,
      source,
      defaultPackageCodes: [...profile.defaultPackageCodes],
      optionalPackageCodes: [...profile.optionalPackageCodes],
      sourcePolicyHints: [...profile.sourcePolicyHints],
    },
    packages,
    experienceOverlay,
    warnings: [
      {
        code: 'DRAWING_PACKAGE_TEMPLATE_MAIN_PAGE_UNCHANGED',
        message: '模板只预制施工图纸包和包内目录项；图纸版本、审查状态、缺图判断、任务/验收联动仍由施工图纸主页面维护。',
        severity: 'info',
      },
    ],
  }
}

function assertApplyRequest(request: ApplyDrawingPackageTemplateRequest) {
  if (request.templateCode !== GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE) {
    throw new DrawingPackageTemplateError(
      'DRAWING_PACKAGE_TEMPLATE_NOT_FOUND',
      '系统施工图纸包模板不存在或已下线',
      404,
      { templateCode: request.templateCode },
    )
  }
  if (request.seedVersion !== DRAWING_PACKAGE_TEMPLATE_SEED_VERSION) {
    throw new DrawingPackageTemplateError(
      'DRAWING_PACKAGE_TEMPLATE_VERSION_MISMATCH',
      '施工图纸包模板版本已更新，请刷新预览后再应用',
      409,
      { expected: DRAWING_PACKAGE_TEMPLATE_SEED_VERSION, received: request.seedVersion },
    )
  }
  if (request.duplicatePolicy !== 'skip_existing') {
    throw new DrawingPackageTemplateError(
      'DRAWING_PACKAGE_TEMPLATE_APPLY_CONFLICT',
      '施工图纸包模板只支持跳过已有包的应用策略',
      409,
      { duplicatePolicy: request.duplicatePolicy },
    )
  }
}

function assertSelectionKnown(selectedPackageCodes: string[], packages: DrawingPackageTemplatePreviewPackage[]) {
  const available = new Set(packages.map((pkg) => pkg.packageCode))
  const unknown = selectedPackageCodes.filter((packageCode) => !available.has(packageCode))
  if (unknown.length > 0) {
    throw new DrawingPackageTemplateError(
      'DRAWING_PACKAGE_TEMPLATE_INVALID_SELECTION',
      'selectedPackageCodes 包含无效选择',
      422,
      { unknown },
    )
  }
}

function selectedSet(values: string[]) {
  return new Set(values.map(normalizeText).filter(Boolean))
}

function toSkipped(preview: DrawingPackageTemplatePreview): ApplyDrawingPackageTemplateResult['skippedExisting'] {
  return preview.packages
    .filter((pkg) => pkg.action === 'will_skip_existing')
    .map((pkg) => ({
      entityType: 'package' as const,
      key: pkg.packageCode,
      reason: '项目已存在同 package_code 图纸包，系统模板不会重复创建。',
    }))
}

function nowForSql() {
  return new Date().toISOString()
}

export async function applyDrawingPackageTemplate(
  projectId: string,
  request: ApplyDrawingPackageTemplateRequest,
  _actorUserId?: string | null,
): Promise<ApplyDrawingPackageTemplateResult> {
  assertApplyRequest(request)
  const preview = await buildDrawingPackageTemplatePreview(projectId)
  assertSelectionKnown(request.selectedPackageCodes, preview.packages)

  const packageCodes = selectedSet(request.selectedPackageCodes)
  const selectedPackages = preview.packages.filter((pkg) => packageCodes.has(pkg.packageCode) && pkg.action === 'will_create')
  const createdPackageIds: string[] = []
  const createdItemIds: string[] = []
  const now = nowForSql()
  const client = await getClient()

  try {
    await client.query('BEGIN')

    for (const pkgPreview of selectedPackages) {
      const requiredItemCount = pkgPreview.items.filter((item) => item.isRequired).length
      const packageRow = await insertRowReturning<DrawingPackage>(client, 'drawing_packages', {
        id: uuidv4(),
        project_id: projectId,
        package_code: pkgPreview.packageCode,
        package_name: pkgPreview.packageName,
        discipline_type: pkgPreview.disciplineType,
        document_purpose: pkgPreview.documentPurpose,
        status: 'pending',
        requires_review: pkgPreview.reviewMode !== 'none' ? true : false,
        review_mode: pkgPreview.reviewMode,
        review_basis: pkgPreview.reviewBasis,
        completeness_ratio: 0,
        missing_required_count: requiredItemCount,
        current_version_drawing_id: null,
        has_change: false,
        schedule_impact_flag: false,
        is_ready_for_construction: false,
        is_ready_for_acceptance: false,
        created_at: now,
        updated_at: now,
      })
      const packageId = normalizeText(packageRow.id)
      if (packageId) createdPackageIds.push(packageId)

      for (const item of pkgPreview.items) {
        const itemRow = await insertRowReturning<DrawingPackageItem>(client, 'drawing_package_items', {
          id: uuidv4(),
          package_id: packageId,
          item_code: item.itemCode,
          item_name: item.itemName,
          discipline_type: item.disciplineType,
          is_required: item.isRequired,
          current_drawing_id: null,
          current_version: null,
          status: 'missing',
          notes: `system_template:${preview.templateCode}@${preview.seedVersion};package:${pkgPreview.packageCode}`,
          sort_order: item.sortOrder,
          created_at: now,
          updated_at: now,
        })
        const itemId = normalizeText(itemRow.id)
        if (itemId) createdItemIds.push(itemId)
      }
    }

    await client.query('COMMIT')

    return {
      templateCode: preview.templateCode,
      seedVersion: preview.seedVersion,
      projectId,
      createdPackageIds,
      createdItemIds,
      skippedExisting: toSkipped(preview),
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export { DRAWING_PACKAGE_TEMPLATE_SEED_VERSION, GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE }
