import {
  DRAWING_PACKAGE_TEMPLATE_SEED,
  DRAWING_PACKAGE_TEMPLATE_SEED_VERSION,
  GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE,
  type DrawingPackageBusinessProfile,
  type DrawingPackageTemplatePackageSeed,
} from '../seeds/drawingPackageTemplateSeed.js'
import { executeSQL, supabase } from './dbService.js'

type QueryRows = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>

export type DrawingPackageExperienceSampleSource =
  | 'completed_project_drawing_board'
  | 'project_manager_correction'
  | 'company_standard_replay'

export interface DrawingPackageExperienceReplaySample {
  sampleKey: string
  projectName: string
  businessTypeCode: string
  provinceCode?: string
  cityCode?: string
  sampleSource: DrawingPackageExperienceSampleSource
  coverageCompleteness: 'final_delivery' | 'stage_delivery' | 'partial_board'
  projectFeatureText?: string
  actualPackageCodes: string[]
  actualPackageNames?: string[]
  actualDrawingNames?: string[]
  evidenceNotes?: string[]
}

export interface DrawingPackageExperienceIterationOptions {
  minimumCalibratedSamples?: number
  minimumOverGeneratedObservations?: number
}

export interface CollectDrawingPackageExperienceReplaySamplesOptions {
  maxSamples?: number
  queryRows?: QueryRows
}

export interface DrawingPackageExperienceCandidate {
  packageCode: string
  packageName: string
  businessTypeCodes: string[]
  observedInSampleKeys: string[]
  observedCount: number
  confidence: 'medium' | 'high'
  proposedAction:
    | 'add_optional_trigger_or_profile_default_candidate'
    | 'review_default_profile_package_candidate'
  evidenceNotes: string[]
}

export interface DrawingPackageExperienceQuality {
  sampleCount: number
  calibratedSampleCount: number
  packageHitRate: number
  missingPackageCandidateCount: number
  overGeneratedPackageCandidateCount: number
  status: 'needs_more_samples' | 'candidate_overlay_ready'
  runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate'
  calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation'
}

export interface DrawingPackageExperienceReplayReport {
  reportCode: 'drawing_package_experience_replay'
  templateCode: string
  seedVersion: string
  quality: DrawingPackageExperienceQuality
  missingPackageCandidates: DrawingPackageExperienceCandidate[]
  overGeneratedPackageCandidates: DrawingPackageExperienceCandidate[]
}

export type DrawingPackageExperienceIterationReport = Omit<DrawingPackageExperienceReplayReport, 'reportCode'> & {
  reportCode: 'drawing_package_experience_iteration_report'
  asOfDate: string
  frontendExposurePolicy: 'backend_admin_api_only'
  sampleSourceSummary: {
    realProjectSampleCount: number
    baselineSampleCount: number
    baselineFallbackUsed: boolean
    sourcePolicy: 'real_project_experience_first_baseline_only_for_cold_start'
  }
  commercialMaturity: {
    assetLevel: 'drawing_package'
    businessProfileCoverage: {
      formalBusinessProfileCount: number
      packagePoolCount: number
      status: 'ready' | 'needs_seed_expansion'
    }
    selfIteration: {
      updateMode: 'real_project_experience_replay'
      networkPolicy: 'disabled_for_drawing_package_seed'
      mutationPolicy: 'candidate_overlay_only_no_silent_seed_mutation'
      runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate'
    }
  }
}

export interface DrawingPackageExperienceOverlay {
  overlayCode: 'drawing_package_experience_overlay'
  sourceReportCode: DrawingPackageExperienceReplayReport['reportCode'] | DrawingPackageExperienceIterationReport['reportCode']
  sourceSeedVersion: string
  additionalPackageCodes: string[]
  runtimeConsumptionPolicy: 'qualified_experience_overlay_after_replay_gate'
  qualityGate: {
    status: 'passed' | 'blocked'
    packageHitRate: number
    calibratedSampleCount: number
    blockReason?: 'experience_replay_quality_gate_not_passed'
  }
}

export interface DrawingPackageExperienceIterationRun {
  runCode: 'drawing_package_experience_iteration_run'
  runId: string
  seedVersion: string
  asOfDate: string
  publicationStatus: 'candidate_overlay_published' | 'held_as_report_only'
  publishedAt: string
  updateMode: 'real_project_experience_replay'
  runtimePreviewPolicy: 'qualified_overlay_available_for_explicit_preview_only'
  promotionGate: 'project_replay_hit_rate_and_sample_count'
  mutationPolicy: 'no_silent_seed_mutation'
  recordVisibilityPolicy: 'backend_admin_audit_only'
  sampleSourceSummary: DrawingPackageExperienceIterationReport['sampleSourceSummary']
  quality: DrawingPackageExperienceQuality
  promotedOverlay: DrawingPackageExperienceOverlay
  missingPackageCandidates: DrawingPackageExperienceCandidate[]
  overGeneratedPackageCandidates: DrawingPackageExperienceCandidate[]
  report: DrawingPackageExperienceIterationReport
}

export interface DrawingPackageExperienceIterationRunRecord {
  run_id: string
  run_code: 'drawing_package_experience_iteration_run'
  seed_version: string
  as_of_date: string
  publication_status: 'candidate_overlay_published' | 'held_as_report_only'
  published_at: string
  update_mode: 'real_project_experience_replay'
  runtime_preview_policy: 'qualified_overlay_available_for_explicit_preview_only'
  promotion_gate: 'project_replay_hit_rate_and_sample_count'
  mutation_policy: 'no_silent_seed_mutation'
  sample_source_summary: DrawingPackageExperienceIterationReport['sampleSourceSummary']
  quality: DrawingPackageExperienceQuality
  promoted_overlay: DrawingPackageExperienceOverlay
  missing_package_candidates: DrawingPackageExperienceCandidate[]
  over_generated_package_candidates: DrawingPackageExperienceCandidate[]
  report_payload: DrawingPackageExperienceIterationReport
  record_visibility_policy: 'backend_admin_audit_only'
}

const DEFAULT_MINIMUM_CALIBRATED_SAMPLES = 8
const DEFAULT_MINIMUM_OVER_GENERATED_OBSERVATIONS = 2
const DEFAULT_COLLECT_SAMPLE_LIMIT = 80
const FINAL_PACKAGE_STATUSES = new Set([
  'readyforacceptance',
  'readyforconstruction',
  'available',
  'completed',
  'archived',
  'passed',
  'ready',
])

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

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 1000) / 1000
}

function normalizeDateInput(value: string | Date | null | undefined) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  const text = normalizeText(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = text ? new Date(text) : new Date()
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

function createExperienceIterationRunId(asOfDate: string) {
  return `drawing-package-experience:${asOfDate}:${Date.now()}`
}

function getPackageByCode() {
  return new Map(DRAWING_PACKAGE_TEMPLATE_SEED.packagePool.map((pkg) => [pkg.packageCode, pkg] as const))
}

function resolveProfile(businessTypeCode: string): DrawingPackageBusinessProfile {
  const normalized = normalizeSearchText(businessTypeCode)
  return DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles.find((profile) => (
    normalizeSearchText(profile.businessTypeCode) === normalized
    || profile.aliases.some((alias) => normalizeSearchText(alias) === normalized)
  )) ?? DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles.find((profile) => profile.businessTypeCode === 'general_civil')!
}

function readProjectGenerationFacts(project: Record<string, unknown>) {
  const metadata = readRecord(project.metadata)
  return readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts)
}

function readProjectFeatures(project: Record<string, unknown>) {
  const metadata = readRecord(project.metadata)
  const facts = readProjectGenerationFacts(project)
  return {
    ...readRecord(metadata.projectFeatures ?? metadata.project_features),
    ...readRecord(facts.projectFeatures ?? facts.project_features),
  }
}

function resolveBusinessTypeFromProject(project: Record<string, unknown>) {
  const metadata = readRecord(project.metadata)
  const facts = readProjectGenerationFacts(project)
  const features = readProjectFeatures(project)
  const candidates = [
    facts.businessTypeCode,
    facts.business_type_code,
    facts.businessType,
    facts.business_type,
    features.businessTypeCode,
    features.business_type_code,
    features.businessType,
    features.business_type,
    metadata.businessTypeCode,
    metadata.business_type_code,
    metadata.businessType,
    metadata.business_type,
    metadata.projectTypeCode,
    metadata.project_type_code,
    metadata.projectType,
    metadata.project_type,
  ]
  for (const candidate of candidates) {
    const value = normalizeText(candidate)
    if (value) return resolveProfile(value).businessTypeCode
  }
  return resolveProfile('general_civil').businessTypeCode
}

function buildFeatureTextFromProject(project: Record<string, unknown>) {
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
  visit(project.name)
  visit(project.metadata)
  return values.map(normalizeText).filter(Boolean).join(' ')
}

function includesAny(searchValue: string, keywords: string[] | undefined) {
  if (!keywords?.length) return false
  const normalizedSearch = normalizeSearchText(searchValue)
  return keywords.some((keyword) => normalizedSearch.includes(normalizeSearchText(keyword)))
}

function shouldIncludePackage(
  packageSeed: DrawingPackageTemplatePackageSeed,
  profile: DrawingPackageBusinessProfile,
  projectFeatureText: string,
) {
  if (profile.defaultPackageCodes.includes(packageSeed.packageCode)) return true
  if (!profile.optionalPackageCodes.includes(packageSeed.packageCode)) return false
  return includesAny(projectFeatureText, packageSeed.triggerKeywords)
}

function expectedPackageCodesForSample(sample: DrawingPackageExperienceReplaySample) {
  const profile = resolveProfile(sample.businessTypeCode)
  const projectFeatureText = [
    sample.projectFeatureText,
    sample.businessTypeCode,
    profile.businessTypeCode,
    profile.businessTypeName,
    ...profile.aliases,
  ].join(' ')
  return new Set(
    DRAWING_PACKAGE_TEMPLATE_SEED.packagePool
      .filter((pkg) => shouldIncludePackage(pkg, profile, projectFeatureText))
      .map((pkg) => pkg.packageCode),
  )
}

function actualKnownPackageCodes(sample: DrawingPackageExperienceReplaySample) {
  const packageByCode = getPackageByCode()
  return new Set(uniqueStrings(sample.actualPackageCodes).filter((packageCode) => packageByCode.has(packageCode)))
}

function pushCandidate(
  candidates: Map<string, DrawingPackageExperienceCandidate>,
  packageSeed: DrawingPackageTemplatePackageSeed,
  sample: DrawingPackageExperienceReplaySample,
  proposedAction: DrawingPackageExperienceCandidate['proposedAction'],
) {
  const existing = candidates.get(packageSeed.packageCode) ?? {
    packageCode: packageSeed.packageCode,
    packageName: packageSeed.packageName,
    businessTypeCodes: [],
    observedInSampleKeys: [],
    observedCount: 0,
    confidence: 'medium' as const,
    proposedAction,
    evidenceNotes: [],
  }
  existing.businessTypeCodes = uniqueStrings([...existing.businessTypeCodes, resolveProfile(sample.businessTypeCode).businessTypeCode])
  existing.observedInSampleKeys = uniqueStrings([...existing.observedInSampleKeys, sample.sampleKey])
  existing.observedCount = existing.observedInSampleKeys.length
  existing.confidence = existing.observedCount >= 2 ? 'high' : 'medium'
  existing.evidenceNotes = uniqueStrings([...existing.evidenceNotes, ...(sample.evidenceNotes ?? [])])
  candidates.set(packageSeed.packageCode, existing)
}

function sortCandidates(candidates: Iterable<DrawingPackageExperienceCandidate>) {
  return [...candidates].sort((left, right) => {
    if (right.observedCount !== left.observedCount) return right.observedCount - left.observedCount
    return left.packageCode.localeCompare(right.packageCode)
  })
}

export function evaluateDrawingPackageExperienceReplay(
  samples: DrawingPackageExperienceReplaySample[],
  options: DrawingPackageExperienceIterationOptions = {},
): DrawingPackageExperienceReplayReport {
  const minimumCalibratedSamples = options.minimumCalibratedSamples ?? DEFAULT_MINIMUM_CALIBRATED_SAMPLES
  const minimumOverGeneratedObservations = options.minimumOverGeneratedObservations ?? DEFAULT_MINIMUM_OVER_GENERATED_OBSERVATIONS
  const packageByCode = getPackageByCode()
  const missingPackageCandidates = new Map<string, DrawingPackageExperienceCandidate>()
  const overGeneratedObservationCounts = new Map<string, DrawingPackageExperienceCandidate>()
  let totalActualPackageCount = 0
  let totalMatchedPackageCount = 0
  let calibratedSampleCount = 0

  for (const sample of samples) {
    const expectedPackageCodes = expectedPackageCodesForSample(sample)
    const actualPackageCodes = actualKnownPackageCodes(sample)
    if (actualPackageCodes.size === 0) continue

    calibratedSampleCount += 1
    totalActualPackageCount += actualPackageCodes.size

    for (const packageCode of actualPackageCodes) {
      if (expectedPackageCodes.has(packageCode)) {
        totalMatchedPackageCount += 1
        continue
      }
      const packageSeed = packageByCode.get(packageCode)
      if (packageSeed) {
        pushCandidate(
          missingPackageCandidates,
          packageSeed,
          sample,
          'add_optional_trigger_or_profile_default_candidate',
        )
      }
    }

    if (sample.coverageCompleteness === 'final_delivery') {
      for (const packageCode of expectedPackageCodes) {
        if (actualPackageCodes.has(packageCode)) continue
        const packageSeed = packageByCode.get(packageCode)
        if (packageSeed) {
          pushCandidate(
            overGeneratedObservationCounts,
            packageSeed,
            sample,
            'review_default_profile_package_candidate',
          )
        }
      }
    }
  }

  const overGeneratedPackageCandidates = sortCandidates(overGeneratedObservationCounts.values())
    .filter((candidate) => candidate.observedCount >= minimumOverGeneratedObservations)
  const missingCandidates = sortCandidates(missingPackageCandidates.values())
  const status: DrawingPackageExperienceQuality['status'] = calibratedSampleCount >= minimumCalibratedSamples
    ? 'candidate_overlay_ready'
    : 'needs_more_samples'

  return {
    reportCode: 'drawing_package_experience_replay',
    templateCode: GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE,
    seedVersion: DRAWING_PACKAGE_TEMPLATE_SEED_VERSION,
    quality: {
      sampleCount: samples.length,
      calibratedSampleCount,
      packageHitRate: roundMetric(totalMatchedPackageCount / totalActualPackageCount),
      missingPackageCandidateCount: missingCandidates.length,
      overGeneratedPackageCandidateCount: overGeneratedPackageCandidates.length,
      status,
      runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate',
      calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
    },
    missingPackageCandidates: missingCandidates,
    overGeneratedPackageCandidates,
  }
}

interface DrawingPackageExperienceProjectRow extends Record<string, unknown> {
  id: string
  name?: string | null
  metadata?: unknown
}

interface DrawingPackageExperiencePackageRow extends Record<string, unknown> {
  project_id?: string | null
  package_code?: string | null
  package_name?: string | null
  status?: string | null
}

function buildSqlPlaceholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ')
}

function packageCoverageCompleteness(rows: DrawingPackageExperiencePackageRow[]): DrawingPackageExperienceReplaySample['coverageCompleteness'] {
  if (rows.length > 0 && rows.every((row) => FINAL_PACKAGE_STATUSES.has(normalizeSearchText(row.status)))) {
    return 'final_delivery'
  }
  return rows.length >= 5 ? 'stage_delivery' : 'partial_board'
}

export async function collectDrawingPackageExperienceReplaySamples(
  options: CollectDrawingPackageExperienceReplaySamplesOptions = {},
): Promise<DrawingPackageExperienceReplaySample[]> {
  const maxSamples = Math.max(1, Math.trunc(options.maxSamples ?? DEFAULT_COLLECT_SAMPLE_LIMIT))
  const queryRows = options.queryRows ?? executeSQL
  const projects = await queryRows(
    'SELECT id, name, metadata FROM projects ORDER BY updated_at DESC LIMIT ?',
    [maxSamples],
  ) as DrawingPackageExperienceProjectRow[]
  const projectIds = uniqueStrings(projects.map((project) => project.id))
  if (projectIds.length === 0) return []

  const packages = await queryRows(
    `SELECT project_id, package_code, package_name, status FROM drawing_packages WHERE project_id IN (${buildSqlPlaceholders(projectIds.length)}) ORDER BY project_id ASC, updated_at ASC`,
    projectIds,
  ) as DrawingPackageExperiencePackageRow[]
  const packagesByProjectId = new Map<string, DrawingPackageExperiencePackageRow[]>()
  for (const row of packages) {
    const projectId = normalizeText(row.project_id)
    if (!projectId) continue
    const rows = packagesByProjectId.get(projectId) ?? []
    rows.push(row)
    packagesByProjectId.set(projectId, rows)
  }

  return projects
    .map((project): DrawingPackageExperienceReplaySample | null => {
      const rows = packagesByProjectId.get(project.id) ?? []
      const actualPackageCodes = uniqueStrings(rows.map((row) => normalizeText(row.package_code)))
      if (actualPackageCodes.length === 0) return null
      return {
        sampleKey: `project:${project.id}`,
        projectName: normalizeText(project.name) || project.id,
        businessTypeCode: resolveBusinessTypeFromProject(project),
        sampleSource: 'completed_project_drawing_board',
        coverageCompleteness: packageCoverageCompleteness(rows),
        projectFeatureText: buildFeatureTextFromProject(project),
        actualPackageCodes,
        actualPackageNames: uniqueStrings(rows.map((row) => normalizeText(row.package_name))),
        evidenceNotes: ['Collected from project drawing_packages final package board facts.'],
      }
    })
    .filter((sample): sample is DrawingPackageExperienceReplaySample => Boolean(sample))
}

export function buildQualifiedDrawingPackageExperienceOverlay(
  report: DrawingPackageExperienceReplayReport | DrawingPackageExperienceIterationReport,
  options: { minimumPackageHitRate?: number } = {},
): DrawingPackageExperienceOverlay {
  const minimumPackageHitRate = options.minimumPackageHitRate ?? 0.9
  const gatePassed = report.quality.status === 'candidate_overlay_ready'
    && report.quality.packageHitRate >= minimumPackageHitRate
  return {
    overlayCode: 'drawing_package_experience_overlay',
    sourceReportCode: report.reportCode,
    sourceSeedVersion: report.seedVersion,
    additionalPackageCodes: gatePassed
      ? uniqueStrings(report.missingPackageCandidates
        .filter((candidate) => candidate.proposedAction === 'add_optional_trigger_or_profile_default_candidate')
        .map((candidate) => candidate.packageCode))
      : [],
    runtimeConsumptionPolicy: 'qualified_experience_overlay_after_replay_gate',
    qualityGate: {
      status: gatePassed ? 'passed' : 'blocked',
      packageHitRate: report.quality.packageHitRate,
      calibratedSampleCount: report.quality.calibratedSampleCount,
      ...(gatePassed ? {} : { blockReason: 'experience_replay_quality_gate_not_passed' as const }),
    },
  }
}

function baselineSample(
  businessTypeCode: string,
  projectName: string,
  featureText: string,
  extraActualPackageCodes: string[] = [],
): DrawingPackageExperienceReplaySample {
  const profile = resolveProfile(businessTypeCode)
  return {
    sampleKey: `baseline:${businessTypeCode}`,
    projectName,
    businessTypeCode,
    sampleSource: 'company_standard_replay',
    coverageCompleteness: 'final_delivery',
    projectFeatureText: featureText,
    actualPackageCodes: uniqueStrings([...profile.defaultPackageCodes, ...extraActualPackageCodes]),
    evidenceNotes: [`Baseline replay aligned to ${profile.businessTypeCode} final package board.`],
  }
}

export const DRAWING_PACKAGE_EXPERIENCE_REPLAY_BASELINE_SAMPLES: DrawingPackageExperienceReplaySample[] = [
  baselineSample('general_civil', 'General civil project final package replay', 'civil residential office commercial'),
  baselineSample('hotel', 'Hotel project final package replay', 'hotel guestroom kitchen laundry back of house fit-out'),
  baselineSample('hospital', 'Hospital project final package replay', 'hospital medical process clean controlled environment'),
  baselineSample('school', 'School project final package replay', 'school campus laboratory canteen sports teaching space'),
  baselineSample('industrial', 'Industrial factory final package replay', 'factory logistics production process environmental facilities'),
  baselineSample('data_center', 'Data center final package replay', 'data center IDC critical power UPS cooling clean room'),
  baselineSample('transportation_hub', 'Transportation hub final package replay', 'transportation hub passenger flow traffic interface'),
  baselineSample('sports_culture', 'Sports culture project final package replay', 'sports culture theater stage acoustic lighting'),
  baselineSample('tod_upper_cover', 'TOD upper cover final package replay', 'TOD upper cover rail interface transfer layer'),
  baselineSample('renovation', 'Renovation project final package replay', 'existing building renovation reinforcement energy retrofit'),
  baselineSample('modular_building', 'Modular building final package replay', 'modular MiC factory assembly transport lifting'),
]

export function buildDrawingPackageExperienceIterationReport(
  options: DrawingPackageExperienceIterationOptions & {
    samples?: DrawingPackageExperienceReplaySample[]
    sampleSourceSummary?: DrawingPackageExperienceIterationReport['sampleSourceSummary']
  } = {},
): DrawingPackageExperienceIterationReport {
  const samples = options.samples ?? DRAWING_PACKAGE_EXPERIENCE_REPLAY_BASELINE_SAMPLES
  const replay = evaluateDrawingPackageExperienceReplay(
    samples,
    options,
  )
  const profileCoverageStatus = DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles.length >= 11
    && DRAWING_PACKAGE_TEMPLATE_SEED.packagePool.length >= 20
    ? 'ready'
    : 'needs_seed_expansion'

  return {
    ...replay,
    reportCode: 'drawing_package_experience_iteration_report',
    asOfDate: new Date().toISOString(),
    frontendExposurePolicy: 'backend_admin_api_only',
    sampleSourceSummary: options.sampleSourceSummary ?? {
      realProjectSampleCount: 0,
      baselineSampleCount: DRAWING_PACKAGE_EXPERIENCE_REPLAY_BASELINE_SAMPLES.length,
      baselineFallbackUsed: options.samples == null,
      sourcePolicy: 'real_project_experience_first_baseline_only_for_cold_start',
    },
    commercialMaturity: {
      assetLevel: 'drawing_package',
      businessProfileCoverage: {
        formalBusinessProfileCount: DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles.length,
        packagePoolCount: DRAWING_PACKAGE_TEMPLATE_SEED.packagePool.length,
        status: profileCoverageStatus,
      },
      selfIteration: {
        updateMode: 'real_project_experience_replay',
        networkPolicy: 'disabled_for_drawing_package_seed',
        mutationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
        runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate',
      },
    },
  }
}

export async function buildDrawingPackageExperienceIterationReportFromProjectExperience(
  options: DrawingPackageExperienceIterationOptions & CollectDrawingPackageExperienceReplaySamplesOptions = {},
): Promise<DrawingPackageExperienceIterationReport> {
  const realProjectSamples = await collectDrawingPackageExperienceReplaySamples(options)
  const baselineFallbackUsed = realProjectSamples.length === 0
  return buildDrawingPackageExperienceIterationReport({
    ...options,
    samples: baselineFallbackUsed ? DRAWING_PACKAGE_EXPERIENCE_REPLAY_BASELINE_SAMPLES : realProjectSamples,
    sampleSourceSummary: {
      realProjectSampleCount: realProjectSamples.length,
      baselineSampleCount: DRAWING_PACKAGE_EXPERIENCE_REPLAY_BASELINE_SAMPLES.length,
      baselineFallbackUsed,
      sourcePolicy: 'real_project_experience_first_baseline_only_for_cold_start',
    },
  })
}

export function publishDrawingPackageExperienceIterationRun(options: {
  report: DrawingPackageExperienceIterationReport | DrawingPackageExperienceReplayReport
  asOfDate?: string | Date | null
  minimumPackageHitRate?: number
}): DrawingPackageExperienceIterationRun {
  const asOfDate = normalizeDateInput(options.asOfDate)
  const iterationReport: DrawingPackageExperienceIterationReport = options.report.reportCode === 'drawing_package_experience_iteration_report'
    ? options.report
    : {
        ...options.report,
        reportCode: 'drawing_package_experience_iteration_report',
        asOfDate: new Date(`${asOfDate}T00:00:00.000Z`).toISOString(),
        frontendExposurePolicy: 'backend_admin_api_only',
        sampleSourceSummary: {
          realProjectSampleCount: 0,
          baselineSampleCount: DRAWING_PACKAGE_EXPERIENCE_REPLAY_BASELINE_SAMPLES.length,
          baselineFallbackUsed: true,
          sourcePolicy: 'real_project_experience_first_baseline_only_for_cold_start',
        },
        commercialMaturity: {
          assetLevel: 'drawing_package',
          businessProfileCoverage: {
            formalBusinessProfileCount: DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles.length,
            packagePoolCount: DRAWING_PACKAGE_TEMPLATE_SEED.packagePool.length,
            status: DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles.length >= 11
              && DRAWING_PACKAGE_TEMPLATE_SEED.packagePool.length >= 20
              ? 'ready'
              : 'needs_seed_expansion',
          },
          selfIteration: {
            updateMode: 'real_project_experience_replay',
            networkPolicy: 'disabled_for_drawing_package_seed',
            mutationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
            runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate',
          },
        },
      }
  const promotedOverlay = buildQualifiedDrawingPackageExperienceOverlay(
    iterationReport,
    { minimumPackageHitRate: options.minimumPackageHitRate },
  )
  const hasPublishedOverlay = promotedOverlay.qualityGate.status === 'passed'
    && promotedOverlay.additionalPackageCodes.length > 0

  return {
    runCode: 'drawing_package_experience_iteration_run',
    runId: createExperienceIterationRunId(asOfDate),
    seedVersion: iterationReport.seedVersion,
    asOfDate,
    publicationStatus: hasPublishedOverlay ? 'candidate_overlay_published' : 'held_as_report_only',
    publishedAt: new Date().toISOString(),
    updateMode: 'real_project_experience_replay',
    runtimePreviewPolicy: 'qualified_overlay_available_for_explicit_preview_only',
    promotionGate: 'project_replay_hit_rate_and_sample_count',
    mutationPolicy: 'no_silent_seed_mutation',
    recordVisibilityPolicy: 'backend_admin_audit_only',
    sampleSourceSummary: iterationReport.sampleSourceSummary,
    quality: iterationReport.quality,
    promotedOverlay,
    missingPackageCandidates: iterationReport.missingPackageCandidates,
    overGeneratedPackageCandidates: iterationReport.overGeneratedPackageCandidates,
    report: iterationReport,
  }
}

export function mapDrawingPackageExperienceIterationRunToRecord(
  run: DrawingPackageExperienceIterationRun,
): DrawingPackageExperienceIterationRunRecord {
  return {
    run_id: run.runId,
    run_code: run.runCode,
    seed_version: run.seedVersion,
    as_of_date: run.asOfDate,
    publication_status: run.publicationStatus,
    published_at: run.publishedAt,
    update_mode: run.updateMode,
    runtime_preview_policy: run.runtimePreviewPolicy,
    promotion_gate: run.promotionGate,
    mutation_policy: run.mutationPolicy,
    sample_source_summary: run.sampleSourceSummary,
    quality: run.quality,
    promoted_overlay: run.promotedOverlay,
    missing_package_candidates: run.missingPackageCandidates,
    over_generated_package_candidates: run.overGeneratedPackageCandidates,
    report_payload: run.report,
    record_visibility_policy: run.recordVisibilityPolicy,
  }
}

export function mapDrawingPackageExperienceIterationRunRecordToRun(
  record: DrawingPackageExperienceIterationRunRecord,
): DrawingPackageExperienceIterationRun {
  return {
    runCode: record.run_code,
    runId: record.run_id,
    seedVersion: record.seed_version,
    asOfDate: record.as_of_date,
    publicationStatus: record.publication_status,
    publishedAt: record.published_at,
    updateMode: record.update_mode,
    runtimePreviewPolicy: record.runtime_preview_policy,
    promotionGate: record.promotion_gate,
    mutationPolicy: record.mutation_policy,
    recordVisibilityPolicy: record.record_visibility_policy,
    sampleSourceSummary: record.sample_source_summary,
    quality: record.quality,
    promotedOverlay: record.promoted_overlay,
    missingPackageCandidates: record.missing_package_candidates,
    overGeneratedPackageCandidates: record.over_generated_package_candidates,
    report: record.report_payload,
  }
}

export async function persistDrawingPackageExperienceIterationRun(
  run: DrawingPackageExperienceIterationRun,
): Promise<DrawingPackageExperienceIterationRunRecord> {
  const record = mapDrawingPackageExperienceIterationRunToRecord(run)
  await executeSQL(
    `INSERT INTO public.drawing_package_experience_iteration_runs (
       run_id,
       run_code,
       seed_version,
       as_of_date,
       publication_status,
       published_at,
       update_mode,
       runtime_preview_policy,
       promotion_gate,
       mutation_policy,
       sample_source_summary,
       quality,
       promoted_overlay,
       missing_package_candidates,
       over_generated_package_candidates,
       report_payload,
       record_visibility_policy
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
       ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?
     )`,
    [
      record.run_id,
      record.run_code,
      record.seed_version,
      record.as_of_date,
      record.publication_status,
      record.published_at,
      record.update_mode,
      record.runtime_preview_policy,
      record.promotion_gate,
      record.mutation_policy,
      JSON.stringify(record.sample_source_summary),
      JSON.stringify(record.quality),
      JSON.stringify(record.promoted_overlay),
      JSON.stringify(record.missing_package_candidates),
      JSON.stringify(record.over_generated_package_candidates),
      JSON.stringify(record.report_payload),
      record.record_visibility_policy,
    ],
  )
  return record
}

export async function loadLatestDrawingPackageExperienceIterationRun() {
  const rows = await executeSQL<DrawingPackageExperienceIterationRunRecord>(
    `SELECT *
       FROM public.drawing_package_experience_iteration_runs
      ORDER BY published_at DESC
      LIMIT 1`,
  )
  if (!rows[0]) return null
  return mapDrawingPackageExperienceIterationRunRecordToRun(rows[0])
}

export async function publishDrawingPackageExperienceIterationRunFromProjectExperience(
  options: DrawingPackageExperienceIterationOptions & CollectDrawingPackageExperienceReplaySamplesOptions & {
    asOfDate?: string | Date | null
    minimumPackageHitRate?: number
  } = {},
) {
  const report = await buildDrawingPackageExperienceIterationReportFromProjectExperience(options)
  const run = publishDrawingPackageExperienceIterationRun({
    report,
    asOfDate: options.asOfDate,
    minimumPackageHitRate: options.minimumPackageHitRate,
  })
  await persistDrawingPackageExperienceIterationRun(run)
  return run
}
