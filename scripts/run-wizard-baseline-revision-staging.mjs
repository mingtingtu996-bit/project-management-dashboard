import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { resolvePublicHttpsOrigin } from './public-origin.mjs'
import { cleanupWizardDiagnosticProject } from './wizard-diagnostic-project-cleanup.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(scriptDir, '..')

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      values.set(key, 'true')
      continue
    }
    values.set(key, next)
    index += 1
  }
  return values
}

function loadEnvFile(filePath) {
  const env = {}
  for (const sourceLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function requireValue(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 500) }
  }
}

function apiFailure(label, response, body) {
  const code = body?.error?.code ?? body?.code ?? body?.error_code ?? body?.error ?? 'UNKNOWN'
  const message = body?.error?.message ?? body?.message ?? body?.error_description ?? body?.msg ?? 'request failed'
  const error = new Error(`${label} failed: HTTP ${response.status}, code=${code}, message=${message}`)
  const rawDetails = body?.error?.details ?? body?.details
  const detailKeys = ['requestId', 'request_id', 'field', 'reason', 'resource', 'operation', 'constraint', 'retryable']
  const safeDetails = rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails)
    ? Object.fromEntries(detailKeys
        .filter((key) => Object.prototype.hasOwnProperty.call(rawDetails, key))
        .map((key) => [key, rawDetails[key]])
        .filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value))
        .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : value]))
    : {}
  error.details = Object.keys(safeDetails).length > 0 ? safeDetails : null
  return error
}

const args = parseArgs(process.argv.slice(2))
const envPath = path.resolve(workspaceRoot, args.get('env-file') ?? 'deploy/env/staging.env')
const env = loadEnvFile(envPath)
const apiBaseUrl = requireValue(args.get('api-base-url') ?? 'http://127.0.0.1:3107', 'api-base-url').replace(/\/$/, '')
const publicOrigin = resolvePublicHttpsOrigin({
  apiBaseUrl,
  publicOrigin: args.get('public-origin'),
})
const targetEnvironment = String(args.get('target-environment') ?? 'staging').trim()
if (!['staging', 'production'].includes(targetEnvironment)) {
  throw new Error('target-environment must be staging or production')
}
const productionLive = targetEnvironment === 'production'
const productionMutationApproval = String(args.get('production-mutation-approval') ?? '').trim()
const PRODUCTION_MUTATION_APPROVAL = 'I_APPROVE_DISPOSABLE_PRODUCTION_WIZARD_SMOKE'
if (productionLive && productionMutationApproval !== PRODUCTION_MUTATION_APPROVAL) {
  throw new Error(`production-mutation-approval must equal ${PRODUCTION_MUTATION_APPROVAL}`)
}
const deployedStagingCode = args.get('deployed-staging-code') === 'true'
const releaseSha = String(args.get('release-sha') ?? '').trim()
if ((deployedStagingCode || productionLive) && !/^[0-9a-f]{40}$/i.test(releaseSha)) {
  throw new Error('release-sha must be a 40-character Git SHA for deployed code')
}
const requestedCompanyId = String(args.get('company-id') ?? '').trim()
let companyId = ''
const reportPath = path.resolve(
  workspaceRoot,
  args.get('report')
    ?? 'runtime-evidence/staging-smoke/staging-wizard-baseline-revision-current.json',
)
const cleanupSourceReportPath = args.get('cleanup-report')
  ? path.resolve(workspaceRoot, args.get('cleanup-report'))
  : null
const supabaseUrl = requireValue(env.SUPABASE_URL, 'SUPABASE_URL')
const supabaseProjectRef = new URL(supabaseUrl).hostname.split('.')[0].toLowerCase()
const expectedProjectRefInput = String(args.get('expected-project-ref') ?? '').trim().toLowerCase()
const expectedProjectRef = expectedProjectRefInput || supabaseProjectRef
const diagnosticCleanupDatabaseUrl = String(
  process.env.WORKBUDDY_DIAGNOSTIC_CLEANUP_DATABASE_URL ?? '',
).trim()
const diagnosticCleanupTlsCaCertificate = String(
  process.env.WORKBUDDY_DIAGNOSTIC_CLEANUP_TLS_CA_CERT ?? '',
).trim()
const migrationBackedCleanupRequired = deployedStagingCode || productionLive
if (migrationBackedCleanupRequired && !diagnosticCleanupDatabaseUrl) {
  throw new Error('deployed wizard cleanup requires WORKBUDDY_DIAGNOSTIC_CLEANUP_DATABASE_URL')
}
if (deployedStagingCode && !diagnosticCleanupTlsCaCertificate) {
  throw new Error('deployed staging wizard cleanup requires WORKBUDDY_DIAGNOSTIC_CLEANUP_TLS_CA_CERT')
}
if ((productionLive || deployedStagingCode || expectedProjectRefInput)
  && !/^[a-z0-9]{20}$/.test(expectedProjectRef)) {
  throw new Error('expected-project-ref must be a 20-character Supabase project ref')
}
if (supabaseProjectRef !== expectedProjectRef) {
  throw new Error('SUPABASE_URL does not match expected-project-ref')
}
let deployedReadiness = null
if (productionLive) {
  const deployedReadinessFile = requireValue(args.get('deployed-readiness-file'), 'deployed-readiness-file')
  const readinessDocument = JSON.parse(fs.readFileSync(path.resolve(workspaceRoot, deployedReadinessFile), 'utf8'))
  deployedReadiness = {
    releaseSha: String(readinessDocument?.build?.releaseSha ?? '').trim().toLowerCase(),
    deployTarget: String(readinessDocument?.build?.deployTarget ?? '').trim(),
    supabaseProjectRef: String(readinessDocument?.build?.supabaseProjectRef ?? '').trim().toLowerCase(),
    databaseProjectRef: String(readinessDocument?.build?.databaseProjectRef ?? '').trim().toLowerCase(),
  }
  if (deployedReadiness.releaseSha !== releaseSha.toLowerCase()
    || deployedReadiness.deployTarget !== 'production'
    || deployedReadiness.supabaseProjectRef !== expectedProjectRef
    || deployedReadiness.databaseProjectRef !== expectedProjectRef) {
    throw new Error('deployed-readiness-file identity does not match production release and project ref')
  }
}
const testUsername = requireValue(env.TEST_USERNAME, 'TEST_USERNAME')
const testUserPassword = requireValue(env.TEST_USER_PASSWORD, 'TEST_USER_PASSWORD')
const requestTimeoutMs = Number(args.get('request-timeout-ms') ?? 120_000)
if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1_000 || requestTimeoutMs > 300_000) {
  throw new Error('request-timeout-ms must be an integer between 1000 and 300000')
}
const recoveryAttempts = Number(args.get('recovery-attempts') ?? 30)
const recoveryDelayMs = Number(args.get('recovery-delay-ms') ?? 2_000)
if (!Number.isInteger(recoveryAttempts) || recoveryAttempts < 1 || recoveryAttempts > 150) {
  throw new Error('recovery-attempts must be an integer between 1 and 150')
}
if (!Number.isInteger(recoveryDelayMs) || recoveryDelayMs < 10 || recoveryDelayMs > 10_000) {
  throw new Error('recovery-delay-ms must be an integer between 10 and 10000')
}
const generationPollAttempts = Number(args.get('generation-poll-attempts') ?? 180)
const generationPollDelayMs = Number(args.get('generation-poll-delay-ms') ?? 2_000)
if (!Number.isInteger(generationPollAttempts) || generationPollAttempts < 1 || generationPollAttempts > 300) {
  throw new Error('generation-poll-attempts must be an integer between 1 and 300')
}
if (!Number.isInteger(generationPollDelayMs) || generationPollDelayMs < 10 || generationPollDelayMs > 10_000) {
  throw new Error('generation-poll-delay-ms must be an integer between 10 and 10000')
}
const generationStatusRetryAttempts = Number(args.get('generation-status-retry-attempts') ?? 5)
const generationStatusRetryDelayMs = Number(args.get('generation-status-retry-delay-ms') ?? 1_000)
if (!Number.isInteger(generationStatusRetryAttempts) || generationStatusRetryAttempts < 1 || generationStatusRetryAttempts > 30) {
  throw new Error('generation-status-retry-attempts must be an integer between 1 and 30')
}
if (!Number.isInteger(generationStatusRetryDelayMs) || generationStatusRetryDelayMs < 10 || generationStatusRetryDelayMs > 10_000) {
  throw new Error('generation-status-retry-delay-ms must be an integer between 10 and 10000')
}
const cleanupGenerationAttempts = Number(args.get('cleanup-generation-attempts') ?? 30)
const cleanupGenerationDelayMs = Number(args.get('cleanup-generation-delay-ms') ?? 2_000)
if (!Number.isInteger(cleanupGenerationAttempts) || cleanupGenerationAttempts < 1 || cleanupGenerationAttempts > 150) {
  throw new Error('cleanup-generation-attempts must be an integer between 1 and 150')
}
if (!Number.isInteger(cleanupGenerationDelayMs) || cleanupGenerationDelayMs < 10 || cleanupGenerationDelayMs > 10_000) {
  throw new Error('cleanup-generation-delay-ms must be an integer between 10 and 10000')
}
const runId = `${targetEnvironment}-baseline-${Date.now()}`
const diagnosticProjectName = `Disposable Residential Baseline ${runId}`
const plannedProjectId = String(args.get('project-id') ?? randomUUID()).trim()
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(plannedProjectId)) {
  throw new Error('project-id must be a UUID when provided')
}

const BUSINESS_TYPE_PREVIEW_CASES = [
  {
    businessType: 'general_civil',
    businessSubtype: 'civil_residential',
    markerPrefix: 'RMP-',
    functionalUsageCodes: ['residential'],
    functionalCategoryCodes: ['residential'],
    specialRoomTypeCodes: [],
    physicalZoneTypeCodes: ['outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    hardConstraintCodes: [],
    buildingCount: 3,
    standardFloorCount: 24,
    basementLevelCount: 2,
  },
  {
    businessType: 'hotel',
    businessSubtype: null,
    markerPrefix: 'BTMP-HTL-',
    functionalUsageCodes: ['hotel'],
    functionalCategoryCodes: ['hotel'],
    specialRoomTypeCodes: ['guestroom', 'lobby', 'kitchen'],
    physicalZoneTypeCodes: ['podium', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    hardConstraintCodes: [],
    buildingCount: 1,
    standardFloorCount: 22,
    basementLevelCount: 3,
  },
  {
    businessType: 'hospital',
    businessSubtype: null,
    markerPrefix: 'BTMP-HSP-',
    functionalUsageCodes: ['医技楼', '住院楼', '门诊楼', '综合楼'],
    functionalCategoryCodes: ['手术区'],
    specialRoomTypeCodes: ['cleanroom', 'operating_room'],
    physicalZoneTypeCodes: [
      'liquid_oxygen_station',
      'sewage_treatment_station',
      'hyperbaric_oxygen_chamber',
      'medical_waste_holding',
      'outdoor_site',
    ],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    hardConstraintCodes: [],
    buildingCount: 4,
    standardFloorCount: 12,
    basementLevelCount: 3,
  },
  {
    businessType: 'school',
    businessSubtype: null,
    markerPrefix: 'BTMP-SCH-',
    functionalUsageCodes: ['school'],
    functionalCategoryCodes: ['education'],
    specialRoomTypeCodes: ['classroom', 'laboratory'],
    physicalZoneTypeCodes: ['outdoor_site', 'playground'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    hardConstraintCodes: [],
    buildingCount: 3,
    standardFloorCount: 6,
    basementLevelCount: 1,
  },
  {
    businessType: 'industrial',
    businessSubtype: 'industrial_general',
    markerPrefix: 'BTMP-IND-',
    functionalUsageCodes: ['industrial'],
    functionalCategoryCodes: ['factory'],
    specialRoomTypeCodes: ['workshop', 'equipment_foundation'],
    physicalZoneTypeCodes: ['outdoor_site', 'logistics_yard'],
    methodVariantCodes: ['pile_foundation', 'steel_frame', 'industrial_superflat_floor'],
    hardConstraintCodes: [],
    buildingCount: 3,
    standardFloorCount: 2,
    basementLevelCount: 1,
  },
  {
    businessType: 'data_center',
    businessSubtype: null,
    markerPrefix: 'BTMP-DTC-',
    functionalUsageCodes: ['机房楼', '运维楼'],
    functionalCategoryCodes: ['data_center'],
    specialRoomTypeCodes: ['computer_room', 'battery_room'],
    physicalZoneTypeCodes: ['substation', 'generator_yard', 'cooling_plant', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'steel_frame', 'no_horizontal_strut'],
    hardConstraintCodes: [],
    buildingCount: 2,
    standardFloorCount: 5,
    basementLevelCount: 1,
  },
  {
    businessType: 'transportation_hub',
    businessSubtype: 'transport_multimodal',
    markerPrefix: 'BTMP-TRH-',
    functionalUsageCodes: ['transportation_hub'],
    functionalCategoryCodes: ['transportation'],
    specialRoomTypeCodes: ['concourse', 'platform_interface'],
    physicalZoneTypeCodes: ['railway_operation_zone', 'transfer_passage', 'traffic_connection_zone', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'steel_frame', 'no_horizontal_strut'],
    hardConstraintCodes: ['non_stop_operation'],
    buildingCount: 1,
    standardFloorCount: 3,
    basementLevelCount: 2,
  },
  {
    businessType: 'sports_culture',
    businessSubtype: 'sports_stadium',
    markerPrefix: 'BTMP-SPC-',
    functionalUsageCodes: ['sports_culture'],
    functionalCategoryCodes: ['large_span_public'],
    specialRoomTypeCodes: ['arena', 'auditorium'],
    physicalZoneTypeCodes: ['large_span_hall', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'steel_frame', 'large_span_roof'],
    hardConstraintCodes: [],
    buildingCount: 1,
    standardFloorCount: 4,
    basementLevelCount: 2,
  },
  {
    businessType: 'tod_upper_cover',
    businessSubtype: null,
    markerPrefix: 'BTMP-TOD-',
    functionalUsageCodes: ['转换层', '上盖塔楼'],
    functionalCategoryCodes: ['tod'],
    specialRoomTypeCodes: ['podium', 'metro_interface'],
    physicalZoneTypeCodes: ['railway_operation_zone', 'transfer_passage', 'traffic_connection_zone', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'steel_frame', 'no_horizontal_strut'],
    hardConstraintCodes: ['non_stop_operation'],
    buildingCount: 2,
    standardFloorCount: 26,
    basementLevelCount: 2,
  },
  {
    businessType: 'renovation',
    businessSubtype: 'renovation_energy',
    markerPrefix: 'BTMP-RNV-',
    functionalUsageCodes: ['renovation'],
    functionalCategoryCodes: ['renovation'],
    specialRoomTypeCodes: [],
    physicalZoneTypeCodes: ['renovation_zone', 'outdoor_site'],
    methodVariantCodes: ['cast_in_situ', 'vertical_retaining_support'],
    hardConstraintCodes: ['occupied_renovation'],
    buildingCount: 2,
    standardFloorCount: 8,
    basementLevelCount: 1,
  },
  {
    businessType: 'modular_building',
    businessSubtype: null,
    markerPrefix: 'BTMP-MOD-',
    functionalUsageCodes: ['modular_building'],
    functionalCategoryCodes: ['modular_building'],
    specialRoomTypeCodes: [],
    physicalZoneTypeCodes: ['outdoor_site'],
    methodVariantCodes: ['modular_mic', 'modular_prefab', 'pile_foundation'],
    hardConstraintCodes: [],
    buildingCount: 3,
    standardFloorCount: 18,
    basementLevelCount: 1,
  },
]

const WIZARD_MUTATION_CASE = {
  ...BUSINESS_TYPE_PREVIEW_CASES[0],
  physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site'],
  buildingCount: 1,
  standardFloorCount: 22,
}

function buildPhysicalZoneMetadata(physicalCategory) {
  if (physicalCategory === 'outdoor_site') {
    return {
      physicalSpaceKind: 'outdoor_site',
      physicalCategory: 'outdoor_site_plan',
    }
  }
  if (physicalCategory === 'podium') {
    return {
      physicalSpaceKind: 'shared_podium',
      physicalCategory: 'shared_podium',
      structuralRole: 'podium',
      sharedScopeCandidate: true,
    }
  }
  if (physicalCategory === 'tower') {
    return { physicalCategory, structuralRole: 'tower' }
  }
  if (physicalCategory === 'basement') return { physicalCategory }
  return {
    physicalSpaceKind: 'independent_engineering_zone',
    physicalCategory,
  }
}

function buildBusinessPreviewScopeTree(previewCase, totalAreaM2, basementAreaM2, options = {}) {
  const canonicalScope = options.canonicalScope !== false
  const aboveGroundAreaM2 = totalAreaM2 - basementAreaM2
  const buildings = Array.from({ length: previewCase.buildingCount }, (_, index) => ({
    id: `${previewCase.businessType}-building-${index + 1}`,
    type: 'building',
    name: `${previewCase.businessType} building ${index + 1}`,
    metadata: {
      functionalUsage: previewCase.functionalUsageCodes[index % previewCase.functionalUsageCodes.length],
      standardFloorCount: previewCase.standardFloorCount,
      areaM2: Math.round(aboveGroundAreaM2 / previewCase.buildingCount),
      methodVariantCodes: previewCase.methodVariantCodes,
      childrenComplete: true,
      ...(canonicalScope ? {
        coverageRole: 'exclusive_scope',
        areaAccountingMode: 'counted',
      } : {}),
    },
    children: [],
  }))
  const functionalAreas = [
    ...previewCase.functionalCategoryCodes.map((functionalCategory, index) => ({
      id: `${previewCase.businessType}-functional-category-${index + 1}`,
      type: 'functional_area',
      name: `${functionalCategory} functional area`,
      metadata: {
        functionalCategory,
        partitionMode: 'trigger_tag',
        coverageRole: 'overlay_trigger',
        areaAccountingMode: 'not_counted',
      },
      children: [],
    })),
    ...previewCase.specialRoomTypeCodes.map((specialRoomType, index) => ({
      id: `${previewCase.businessType}-special-room-${index + 1}`,
      type: 'functional_area',
      name: `${specialRoomType} special room`,
      metadata: {
        specialRoomType,
        partitionMode: 'trigger_tag',
        coverageRole: 'overlay_trigger',
        areaAccountingMode: 'not_counted',
      },
      children: [],
    })),
  ]
  const physicalCategories = canonicalScope
    ? [...new Set([...previewCase.physicalZoneTypeCodes, 'outdoor_site'])]
      .filter((physicalCategory) => !['tower', 'basement'].includes(physicalCategory))
    : previewCase.physicalZoneTypeCodes
  const physicalZones = physicalCategories.map((physicalCategory, index) => ({
    id: `${previewCase.businessType}-physical-zone-${index + 1}`,
    type: 'physical_zone',
    name: `${physicalCategory} zone`,
    metadata: {
      ...(canonicalScope ? buildPhysicalZoneMetadata(physicalCategory) : { physicalCategory }),
      coverageRole: canonicalScope ? 'exclusive_scope' : 'overlay_trigger',
      areaAccountingMode: canonicalScope ? 'counted' : 'not_counted',
      ...(canonicalScope ? { childrenComplete: true } : {}),
    },
    children: [],
  }))
  const basement = previewCase.basementLevelCount > 0
    ? [{
        id: `${previewCase.businessType}-basement-1`,
        type: 'basement',
        name: `${previewCase.businessType} basement`,
        metadata: {
          basementLevelCount: previewCase.basementLevelCount,
          basementAreaM2,
          foundationDepthM: previewCase.basementLevelCount * 4.5,
          childrenComplete: true,
          ...(canonicalScope ? {
            coverageRole: 'exclusive_scope',
            areaAccountingMode: 'counted',
          } : {}),
        },
        children: [],
      }]
    : []
  return [...buildings, ...basement, ...functionalAreas, ...physicalZones]
}

function buildBusinessPreviewPayload(
  previewCase,
  projectName = `${diagnosticProjectName} Preview ${previewCase.businessType}`,
  options = {},
) {
  const totalAreaM2 = Math.max(18_000, previewCase.buildingCount * previewCase.standardFloorCount * 1_200)
  const basementAreaM2 = previewCase.basementLevelCount > 0
    ? Math.max(3_000, previewCase.buildingCount * previewCase.basementLevelCount * 1_000)
    : 0
  const projectFeatures = {
    standardFloorCount: previewCase.standardFloorCount,
    basementLevelCount: previewCase.basementLevelCount,
    ...(previewCase.methodVariantCodes.includes('steel_frame') ? { integral_lifting: true } : {}),
    ...(previewCase.businessType === 'sports_culture' ? { large_span: 60 } : {}),
    ...(previewCase.hardConstraintCodes.includes('non_stop_operation') ? { non_stop_operation: true, near_metro: true } : {}),
    ...(previewCase.hardConstraintCodes.includes('occupied_renovation') ? { occupied_renovation: true } : {}),
  }
  return {
    step: 6,
    mode: 'new',
    projectName,
    location: 'Shanghai',
    plannedStartDate: '2026-08-01',
    plannedEndDate: '2030-12-31',
    planScopeCaliber: 'full_project_master',
    deliveryStandard: 'full_fitout',
    terminalEvent: 'owner_handover',
    totalAreaM2,
    aboveGroundAreaM2: totalAreaM2 - basementAreaM2,
    basementAreaM2: Math.max(1, basementAreaM2),
    siteAreaM2: Math.max(9_000, Math.round(totalAreaM2 * 0.45)),
    businessType: previewCase.businessType,
    ...(previewCase.businessSubtype ? { businessSubtype: previewCase.businessSubtype } : {}),
    buildingCount: previewCase.buildingCount,
    detailLevel: 'overview',
    methodVariantCodes: previewCase.methodVariantCodes,
    prefabSystemCodes: previewCase.businessType === 'modular_building' ? ['modular_mic'] : [],
    projectFeatures,
    scopeTree: buildBusinessPreviewScopeTree(previewCase, totalAreaM2, basementAreaM2, options),
  }
}

const result = {
  generatedAt: new Date().toISOString(),
  source: 'wizard_baseline_revision_live_probe',
  environmentClassification: productionLive
    ? 'deployed_production_private_server'
    : deployedStagingCode
      ? 'deployed_staging_private_server'
      : 'staging_db_with_local_current_workspace_code',
  targetEnvironment,
  supabaseProjectRef,
  stagingProjectRef: targetEnvironment === 'staging' ? supabaseProjectRef : null,
  deployedStagingCode,
  deployedReadiness,
  releaseSha: releaseSha || null,
  cleanupSourceReleaseSha: null,
  productionLive,
  mutationBoundary: productionLive
    ? 'explicitly_approved_disposable_production_project_only_created_adjusted_confirmed_revised_then_physically_deleted'
    : deployedStagingCode
      ? 'disposable_staging_project_only_created_adjusted_confirmed_revised_then_physically_deleted'
      : 'disposable_staging_project_only_created_adjusted_confirmed_revised_then_api_unreadable_physical_deletion_unverified',
  diagnosticRunId: runId,
  projectName: diagnosticProjectName,
  createRequestOutcome: 'not_started',
  status: 'running',
  companyId: null,
  projectId: plannedProjectId,
  generationBatchId: null,
  baselineId: null,
  revisionId: null,
  steps: {},
  cleanup: { status: 'not_started' },
  error: null,
}

let accessToken = null
let projectId = plannedProjectId
let createRequestOutcome = 'not_started'
let activeGenerationAttemptId = null
let activeGenerationTerminal = false
let cleanupSourceReleaseSha = releaseSha

function writeResultReport() {
  result.generatedAt = new Date().toISOString()
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
}

async function apiRequest(method, requestPath, body, extraHeaders = {}) {
  const response = await fetch(`${apiBaseUrl}${requestPath}`, {
    method,
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Origin: publicOrigin,
      'X-Forwarded-Proto': 'https',
      'X-Company-Id': companyId,
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { response, body: await readJsonResponse(response) }
}

function assertApi(label, apiResult, allowedStatuses) {
  if (!allowedStatuses.includes(apiResult.response.status)) {
    throw apiFailure(label, apiResult.response, apiResult.body)
  }
  return apiResult.body?.data
}

async function readWizardGenerationStatus(targetProjectId, attemptId, retryAttempts = generationStatusRetryAttempts) {
  let statusCall = null
  for (let retry = 1; retry <= retryAttempts; retry += 1) {
    statusCall = await apiRequest(
      'GET',
      `/api/projects/${targetProjectId}/wizard/generation/${encodeURIComponent(attemptId)}`,
    )
    const isTransientServerError = statusCall.response.status >= 500 && statusCall.response.status <= 599
    if (!isTransientServerError || retry === retryAttempts) return statusCall

    result.steps.commitWizardGeneration = {
      ...result.steps.commitWizardGeneration,
      status: 'running',
      transientStatusRetryCount: retry,
      lastTransientStatusHttpStatus: statusCall.response.status,
    }
    writeResultReport()
    await new Promise((resolveDelay) => setTimeout(resolveDelay, generationStatusRetryDelayMs))
  }
  return statusCall
}

async function waitForWizardGeneration(targetProjectId, attemptId) {
  let lastState = 'queued'
  for (let attempt = 1; attempt <= generationPollAttempts; attempt += 1) {
    const statusCall = await readWizardGenerationStatus(targetProjectId, attemptId)
    const generation = assertApi('read wizard generation status', statusCall, [200])
    const observedAttemptId = requireValue(generation?.attemptId, 'wizard generation status attempt id')
    if (observedAttemptId !== attemptId) {
      throw new Error('wizard generation status returned a different attempt id')
    }

    lastState = requireValue(generation?.state, 'wizard generation state')
    result.steps.commitWizardGeneration = {
      ...result.steps.commitWizardGeneration,
      status: lastState === 'failed' ? 'fail' : 'running',
      generationState: lastState,
      generationPollCount: attempt,
    }
    if (lastState === 'completed') {
      activeGenerationTerminal = true
      return { generation, attempts: attempt }
    }
    if (lastState === 'failed') {
      activeGenerationTerminal = true
      const errorCode = String(generation?.errorCode ?? 'WIZARD_GENERATION_FAILED').trim()
        || 'WIZARD_GENERATION_FAILED'
      result.steps.commitWizardGeneration.errorCode = errorCode
      writeResultReport()
      throw new Error(`wizard generation failed: code=${errorCode}`)
    }
    if (!['queued', 'running'].includes(lastState)) {
      throw new Error(`wizard generation returned unsupported state: ${lastState}`)
    }
    if (attempt < generationPollAttempts) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, generationPollDelayMs))
    }
  }

  result.steps.commitWizardGeneration = {
    ...result.steps.commitWizardGeneration,
    status: 'fail',
    generationState: lastState,
    generationPollCount: generationPollAttempts,
    errorCode: 'WIZARD_GENERATION_TIMEOUT',
  }
  writeResultReport()
  throw new Error(
    `wizard generation did not complete after ${generationPollAttempts} status checks; lastState=${lastState}`,
  )
}

async function waitForGenerationToSettleBeforeCleanup(targetProjectId) {
  if (!activeGenerationAttemptId || activeGenerationTerminal) {
    return { required: false, settled: true, attempts: 0, state: null }
  }

  let lastHttpStatus = null
  let lastState = null
  let lastError = null
  for (let attempt = 1; attempt <= cleanupGenerationAttempts; attempt += 1) {
    try {
      const statusCall = await readWizardGenerationStatus(targetProjectId, activeGenerationAttemptId, 1)
      lastHttpStatus = statusCall.response.status
      const generation = assertApi('read wizard generation before cleanup', statusCall, [200])
      const observedAttemptId = requireValue(generation?.attemptId, 'wizard cleanup generation attempt id')
      if (observedAttemptId !== activeGenerationAttemptId) {
        throw new Error('wizard cleanup generation status returned a different attempt id')
      }
      lastState = requireValue(generation?.state, 'wizard cleanup generation state')
      if (lastState === 'completed' || lastState === 'failed') {
        activeGenerationTerminal = true
        result.steps.generationCleanupWait = {
          status: 'pass',
          state: lastState,
          attempts: attempt,
          httpStatus: lastHttpStatus,
        }
        return { required: true, settled: true, attempts: attempt, state: lastState }
      }
      if (!['queued', 'running'].includes(lastState)) {
        throw new Error(`wizard cleanup generation returned unsupported state: ${lastState}`)
      }
      lastError = null
    } catch (error) {
      lastError = error
    }
    if (attempt < cleanupGenerationAttempts) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, cleanupGenerationDelayMs))
    }
  }

  result.steps.generationCleanupWait = {
    status: 'blocked',
    attempts: cleanupGenerationAttempts,
    lastState,
    lastHttpStatus,
    message: lastError instanceof Error ? lastError.message : 'generation did not reach a terminal state',
  }
  return { required: true, settled: false, attempts: cleanupGenerationAttempts, state: lastState }
}

async function authenticate(expectedCompanyId = requestedCompanyId) {
  const authResponse = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      'Content-Type': 'application/json',
      Origin: publicOrigin,
      'X-Forwarded-Proto': 'https',
    },
    body: JSON.stringify({ username: testUsername, password: testUserPassword }),
  })
  const authBody = await readJsonResponse(authResponse)
  if (!authResponse.ok || !authBody?.data?.token) {
    throw apiFailure('staging auth', authResponse, authBody)
  }
  accessToken = authBody.data.token
  const activeCompanyId = requireValue(
    authBody?.data?.user?.currentCompanyId,
    'authenticated active company id',
  )
  if (expectedCompanyId && expectedCompanyId !== activeCompanyId) {
    throw new Error('company-id does not match the authenticated active company')
  }
  companyId = activeCompanyId
  result.companyId = companyId
}

async function readDurationAccuracySummary() {
  const accuracyCall = await apiRequest('GET', '/api/admin/duration-accuracy/summary')
  const accuracyErrorCode = String(accuracyCall.body?.error?.code ?? '').trim()
  const accuracyErrorMessage = String(accuracyCall.body?.error?.message ?? '').trim()
  const isExpectedStagingAdminOnlyDenial = targetEnvironment === 'staging'
    && accuracyCall.response.status === 403
    && accuracyErrorCode === 'FORBIDDEN'
    && accuracyErrorMessage === 'Duration accuracy diagnostics are available to company administrators only.'
  if (isExpectedStagingAdminOnlyDenial) {
    result.steps.durationAccuracyReadback = {
      status: 'unavailable',
      httpStatus: accuracyCall.response.status,
      dataState: 'forbidden_company_admin_required',
      nonBlocking: true,
      claimBoundary: 'wizard_business_smoke_only_no_accuracy_readback_claim',
      metricCount: null,
      totalSampleCount: null,
      metricsWithMae: null,
      metricsWithMape: null,
      metrics: [],
    }
    return
  }
  const accuracySummary = assertApi('read staging duration accuracy summary', accuracyCall, [200])
  const metrics = accuracySummary?.metrics
  if (!Array.isArray(metrics)) {
    throw new Error('duration accuracy summary metrics are unavailable')
  }

  const metricSummaries = metrics.map((metric) => {
    const sampleCount = Number(metric?.sampleCount ?? 0)
    const maeDays = metric?.maeDays == null ? null : Number(metric.maeDays)
    const mape = metric?.mape == null ? null : Number(metric.mape)
    return {
      engineCode: String(metric?.engineCode ?? '').trim() || null,
      source: String(metric?.source ?? '').trim() || null,
      status: String(metric?.status ?? '').trim() || null,
      sampleCount: Number.isFinite(sampleCount) && sampleCount > 0 ? sampleCount : 0,
      maeDays: Number.isFinite(maeDays) ? maeDays : null,
      mape: Number.isFinite(mape) ? mape : null,
    }
  })
  const totalSampleCount = metricSummaries.reduce((sum, metric) => sum + metric.sampleCount, 0)
  const metricsWithMae = metricSummaries.filter((metric) => metric.maeDays !== null).length
  const metricsWithMape = metricSummaries.filter((metric) => metric.mape !== null).length

  result.steps.durationAccuracyReadback = {
    status: 'pass',
    httpStatus: accuracyCall.response.status,
    dataState: totalSampleCount > 0
      ? 'staging_accuracy_rows_available'
      : 'empty_no_completed_samples',
    claimBoundary: 'readback_only_not_accuracy_acceptance',
    metricCount: metricSummaries.length,
    totalSampleCount,
    metricsWithMae,
    metricsWithMape,
    metrics: metricSummaries,
  }
}

async function cleanupProject(targetProjectId = projectId) {
  if (!targetProjectId || !accessToken) return
  try {
    const generationSettlement = await waitForGenerationToSettleBeforeCleanup(targetProjectId)
    if (generationSettlement.required && !generationSettlement.settled) {
      result.cleanup = {
        status: 'fail',
        generationSettlement: 'not_proven_terminal',
        projectPhysicallyDeleted: false,
        projectUnreadable: false,
      }
      result.status = 'fail'
      return
    }
    const runMigrationBackedCleanup = async () => {
      if (!diagnosticCleanupDatabaseUrl) return null
      return cleanupWizardDiagnosticProject({
        connectionString: diagnosticCleanupDatabaseUrl,
        expectedProjectRef,
        targetEnvironment,
        projectId: targetProjectId,
        companyId,
        diagnosticRunId: result.diagnosticRunId,
        projectName: result.projectName,
        releaseSha,
        diagnosticReleaseSha: cleanupSourceReleaseSha,
        actorUsername: testUsername,
        tlsCaCertificate: diagnosticCleanupTlsCaCertificate || undefined,
      })
    }
    if (migrationBackedCleanupRequired) {
      const directCleanup = await runMigrationBackedCleanup()
      if (!directCleanup) {
        throw new Error('migration-backed diagnostic cleanup did not return deletion evidence')
      }
      const finalCleanupRead = await apiRequest('GET', `/api/projects/${targetProjectId}`)
      const physicallyDeleted = directCleanup.projectPhysicallyDeleted === true
        && finalCleanupRead.response.status === 404
      result.cleanup = {
        status: physicallyDeleted ? 'pass' : 'fail',
        deleteHttpStatus: null,
        directCleanupStrategy: directCleanup.strategy,
        databaseProjectRefVerified: directCleanup.databaseProjectRefVerified,
        postDeleteReadHttpStatus: finalCleanupRead.response.status,
        projectPhysicallyDeleted: physicallyDeleted,
        projectUnreadable: finalCleanupRead.response.status === 404,
        entityAlreadyAbsent: directCleanup.entityAlreadyAbsent,
      }
      if (!physicallyDeleted) result.status = 'fail'
      return
    }

    const preDeleteReadCall = await apiRequest('GET', `/api/projects/${targetProjectId}`)
    if (preDeleteReadCall.response.status === 404) {
      result.cleanup = {
        status: 'api_unreadable_unverified',
        deleteHttpStatus: null,
        postDeleteReadHttpStatus: 404,
        projectPhysicallyDeleted: null,
        projectUnreadable: true,
        entityAlreadyAbsent: true,
        directCleanupStrategy: null,
        databaseProjectRefVerified: null,
        physicalDeletionEvidence: 'unavailable_without_migration_readback',
      }
      return
    }
    const projectBeforeDelete = assertApi('read diagnostic project before cleanup', preDeleteReadCall, [200])
    if (!projectMatchesDiagnosticRun(projectBeforeDelete, result.diagnosticRunId, result.projectName)) {
      throw new Error('cleanup refused because the project diagnostic identity does not match')
    }

    let deleteCall = await apiRequest(
      'DELETE',
      `/api/projects/${targetProjectId}`,
      undefined,
      { 'X-WorkBuddy-Confirm-Action': `delete-project:${targetProjectId}` },
    )
    const initialDeleteHttpStatus = deleteCall.response.status
    let rollbackHttpStatus = null
    let draftDeleteHttpStatus = null
    if (![200, 204, 404].includes(deleteCall.response.status)) {
      const rollbackCall = await apiRequest('POST', `/api/projects/${targetProjectId}/wizard/rollback`, {})
      rollbackHttpStatus = rollbackCall.response.status
      const draftDeleteCall = await apiRequest('DELETE', `/api/projects/${targetProjectId}/wizard/draft`)
      draftDeleteHttpStatus = draftDeleteCall.response.status
      if ([200, 204, 404].includes(draftDeleteCall.response.status)) deleteCall = draftDeleteCall
    }
    const finalCleanupRead = await apiRequest('GET', `/api/projects/${targetProjectId}`)
    const apiCleanupAccepted = [200, 204, 404].includes(deleteCall.response.status)
      && finalCleanupRead.response.status === 404
    result.cleanup = {
      status: apiCleanupAccepted ? 'api_unreadable_unverified' : 'fail',
      deleteHttpStatus: initialDeleteHttpStatus,
      rollbackHttpStatus,
      draftDeleteHttpStatus,
      directCleanupStrategy: null,
      databaseProjectRefVerified: null,
      postDeleteReadHttpStatus: finalCleanupRead.response.status,
      projectPhysicallyDeleted: null,
      projectUnreadable: finalCleanupRead.response.status === 404,
      physicalDeletionEvidence: 'unavailable_without_migration_readback',
    }
    if (!apiCleanupAccepted) result.status = 'fail'
  } catch (cleanupError) {
    result.cleanup = {
      status: 'fail',
      message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    }
    result.status = 'fail'
  }
}

function readProjectMetadata(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function projectMatchesDiagnosticRun(project, expectedRunId, expectedProjectName) {
  const metadata = readProjectMetadata(project?.metadata)
  const metadataRunId = String(metadata.diagnosticRunId ?? '').trim()
  if (metadataRunId) return metadataRunId === expectedRunId
  return String(project?.name ?? '').trim() === expectedProjectName
}

async function recoverProjectIdByDiagnosticRunId(expectedRunId, expectedProjectName) {
  let lastHttpStatus = null
  for (let attempt = 1; attempt <= recoveryAttempts; attempt += 1) {
    const listCall = await apiRequest('GET', '/api/projects')
    lastHttpStatus = listCall.response.status
    const projects = assertApi('recover diagnostic wizard project', listCall, [200])
    const matches = Array.isArray(projects)
      ? projects.filter((candidate) => projectMatchesDiagnosticRun(candidate, expectedRunId, expectedProjectName))
      : []
    if (matches.length > 1) {
      throw new Error(`diagnostic project recovery matched ${matches.length} projects`)
    }
    if (matches.length === 1) {
      const recoveredId = requireValue(matches[0]?.id, 'recovered project id')
      projectId = recoveredId
      result.projectId = recoveredId
      result.steps.projectRecovery = {
        status: 'pass',
        strategy: 'authenticated_company_project_list_diagnostic_run_id',
        attempt,
        httpStatus: listCall.response.status,
        projectId: recoveredId,
      }
      writeResultReport()
      return recoveredId
    }
    if (attempt < recoveryAttempts) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, recoveryDelayMs))
    }
  }

  result.steps.projectRecovery = {
    status: 'fail',
    strategy: 'authenticated_company_project_list_diagnostic_run_id',
    attempts: recoveryAttempts,
    lastHttpStatus,
    projectId: null,
  }
  writeResultReport()
  return null
}

async function waitForUncertainProjectCreation(targetProjectId) {
  for (let attempt = 1; attempt <= recoveryAttempts; attempt += 1) {
    const readCall = await apiRequest('GET', `/api/projects/${targetProjectId}`)
    if (readCall.response.status === 200) {
      const recoveredProject = assertApi('read recovered diagnostic wizard project', readCall, [200])
      if (!projectMatchesDiagnosticRun(recoveredProject, result.diagnosticRunId, result.projectName)) {
        throw new Error('preallocated project id resolved to a different diagnostic project')
      }
      result.steps.projectRecovery = {
        status: 'pass',
        strategy: 'preallocated_project_id_readback_after_uncertain_create_response',
        attempt,
        httpStatus: readCall.response.status,
        projectId: targetProjectId,
      }
      writeResultReport()
      return true
    }
    if (readCall.response.status !== 404) {
      throw apiFailure('recover preallocated diagnostic wizard project', readCall.response, readCall.body)
    }
    if (attempt < recoveryAttempts) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, recoveryDelayMs))
    }
  }
  result.steps.projectRecovery = {
    status: 'fail',
    strategy: 'preallocated_project_id_readback_after_uncertain_create_response',
    attempts: recoveryAttempts,
    projectId: targetProjectId,
    message: 'project was not observable before the recovery window closed',
  }
  writeResultReport()
  return false
}

if (cleanupSourceReportPath) {
  try {
    const previousResult = JSON.parse(fs.readFileSync(cleanupSourceReportPath, 'utf8'))
    cleanupSourceReleaseSha = String(previousResult?.releaseSha ?? '').trim().toLowerCase()
    if (!/^[0-9a-f]{40}$/.test(cleanupSourceReleaseSha)) {
      throw new Error('cleanup report release SHA must be a 40-character Git SHA')
    }
    result.cleanupSourceReleaseSha = cleanupSourceReleaseSha
    projectId = String(previousResult?.projectId ?? '').trim() || null
    result.projectId = projectId
    result.diagnosticRunId = requireValue(previousResult?.diagnosticRunId, 'cleanup report diagnostic run id')
    result.projectName = String(previousResult?.projectName ?? '').trim()
      || `Disposable Residential Baseline ${result.diagnosticRunId}`
    result.createRequestOutcome = String(previousResult?.createRequestOutcome ?? 'unknown')
    activeGenerationAttemptId = String(previousResult?.steps?.commitWizardGeneration?.attemptId ?? '').trim() || null
    activeGenerationTerminal = ['completed', 'failed'].includes(
      String(previousResult?.steps?.commitWizardGeneration?.generationState ?? '').trim(),
    )
    await authenticate(String(previousResult?.companyId ?? '').trim())
    if (!projectId) {
      await recoverProjectIdByDiagnosticRunId(result.diagnosticRunId, result.projectName)
    } else if (
      result.createRequestOutcome === 'awaiting_response'
      && previousResult?.steps?.projectRecovery?.status !== 'pass'
    ) {
      const observed = await waitForUncertainProjectCreation(projectId)
      if (!observed) {
        await cleanupProject(projectId)
        throw new Error('cleanup could not prove that the uncertain project creation settled')
      }
    }
    if (!projectId) throw new Error('cleanup could not recover the diagnostic project id')
    await cleanupProject(projectId)
    result.status = result.cleanup?.status === 'pass' ? 'pass' : 'fail'
  } catch (error) {
    result.status = 'fail'
    result.error = {
      message: error instanceof Error ? error.message : String(error),
      details: error && typeof error === 'object' ? error.details ?? null : null,
    }
  } finally {
    writeResultReport()
    process.stdout.write(`${JSON.stringify({ status: result.status, reportPath, projectId: result.projectId, cleanup: result.cleanup })}\n`)
  }
} else {
function isValidIsoDate(value) {
  const normalized = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && Number.isFinite(Date.parse(`${normalized}T00:00:00.000Z`))
}

function assertPreviewCondition(condition, message, details) {
  if (condition) return
  const error = new Error(message)
  error.details = details
  throw error
}

const PREVIEW_ISSUE_DETAIL_KEYS = [
  'itemPackPattern',
  'effect',
  'targetObjectType',
  'matchMetadata',
  'matchObjectName',
  'missingObjectLabel',
  'matchedRowCount',
  'matchedStableCodes',
  'preflight',
  'directlyTriggered',
  'triggeredByTemplateId',
  'nodeCode',
]
const PREVIEW_ISSUE_MATCH_METADATA_KEYS = [
  'physicalSpaceKind',
  'physicalCategory',
  'floorUsage',
  'functionalCategory',
  'functionalUsage',
  'structuralRole',
]

function sanitizePreviewIssueDetail(key, value) {
  if (key === 'matchMetadata') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return Object.fromEntries(PREVIEW_ISSUE_MATCH_METADATA_KEYS
      .filter((metadataKey) => Object.prototype.hasOwnProperty.call(value, metadataKey))
      .map((metadataKey) => [metadataKey, value[metadataKey]])
      .filter(([, metadataValue]) => ['string', 'number', 'boolean'].includes(typeof metadataValue)))
  }
  if (key === 'matchedStableCodes') {
    if (!Array.isArray(value)) return undefined
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20)
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) return value
  if (value === null) return null
  return undefined
}

function sanitizePreviewIssues(issues) {
  if (!Array.isArray(issues)) return []
  return issues.map((issue) => {
    const issueRecord = issue && typeof issue === 'object' ? issue : {}
    const rawDetails = issueRecord.details && typeof issueRecord.details === 'object'
      ? issueRecord.details
      : {}
    const details = Object.fromEntries(PREVIEW_ISSUE_DETAIL_KEYS
      .filter((key) => Object.prototype.hasOwnProperty.call(rawDetails, key))
      .map((key) => [key, sanitizePreviewIssueDetail(key, rawDetails[key])])
      .filter(([, value]) => value !== undefined))
    return {
      code: String(issueRecord.code ?? '').trim() || 'UNKNOWN_PREVIEW_ISSUE',
      severity: String(issueRecord.severity ?? '').trim() || 'unknown',
      details: Object.keys(details).length > 0 ? details : null,
    }
  })
}

function readRequiredString(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function readRequiredBoolean(value) {
  return typeof value === 'boolean' ? value : null
}

function readRequiredFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readRequiredNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function readRequiredStringArray(value) {
  if (!Array.isArray(value)) return null
  const normalized = []
  for (const item of value) {
    const text = readRequiredString(item)
    if (!text) return null
    normalized.push(text)
  }
  return normalized
}

function readOptionalIsoDate(value) {
  const normalized = readRequiredString(value)
  return normalized && isValidIsoDate(normalized) ? normalized : null
}

function readOptionalNonNegativeNumber(value) {
  const normalized = readRequiredFiniteNumber(value)
  return normalized !== null && normalized >= 0 ? normalized : null
}

function validateBusinessTypePreview(previewCase, preview, httpStatus) {
  const identity = preview?.profile?.identity ?? {}
  const generation = preview?.profile?.generation ?? {}
  const masterPlanProfile = generation.masterPlanProfile ?? {}
  const assembly = generation.executableDefaultMasterPlanAssembly ?? {}
  const executablePreview = generation.executableDefaultMasterPlanPreview ?? {}
  const quality = generation.planQualityDiagnostics ?? {}
  const rawProfileRange = Array.isArray(masterPlanProfile.rowCountRange)
    ? masterPlanProfile.rowCountRange.map(readRequiredNonNegativeInteger)
    : []
  const profileRange = rawProfileRange.length === 2 && rawProfileRange.every((value) => value !== null && value > 0)
    ? rawProfileRange
    : []
  const scheduleRowCount = readRequiredNonNegativeInteger(executablePreview.scheduleRowCount)
  const assemblyScheduleRowCount = readRequiredNonNegativeInteger(assembly.scheduleRowCount)
  const visibleDependencyCount = readRequiredNonNegativeInteger(assembly.visibleDependencyCount)
  const visibleDependencyCoverageRate = readRequiredFiniteNumber(assembly.visibleDependencyCoverageRate)
  const rows = Array.isArray(executablePreview.rows) ? executablePreview.rows : []
  const expectedSubtype = previewCase.businessSubtype ?? null
  const observedBusinessType = readRequiredString(identity.businessType)
  const observedSubtype = identity.businessSubtype === null
    ? null
    : readRequiredString(identity.businessSubtype)
  const observedSubtypeValid = expectedSubtype === null
    ? identity.businessSubtype === null
    : observedSubtype === expectedSubtype
  const profileIssues = sanitizePreviewIssues(preview?.profile?.issues)
  const assemblyStatus = readRequiredString(assembly.status)
  const readyForWizardCommit = readRequiredBoolean(assembly.readyForWizardCommit)
  const assetAuthority = readRequiredString(assembly.assetAuthority)
  const minimumScheduleRowCount = readRequiredNonNegativeInteger(assembly.minimumScheduleRowCount)
  const operationalRowFloor = readRequiredNonNegativeInteger(assembly.operationalRowFloor)
  const availableScheduleRowCount = readRequiredNonNegativeInteger(assembly.availableScheduleRowCount)
  const assetInventoryShortfallAccepted = readRequiredBoolean(assembly.assetInventoryShortfallAccepted)
  const missingExecutionPhases = readRequiredStringArray(assembly.missingExecutionPhases)
  const invalidDurationRowCount = readRequiredNonNegativeInteger(assembly.invalidDurationRowCount)
  const methodConflictCount = readRequiredNonNegativeInteger(assembly.methodConflictCount)
  const durationAssetSemanticMismatchCount = readRequiredNonNegativeInteger(assembly.durationAssetSemanticMismatchCount)
  const dependencyCycleRowCount = readRequiredNonNegativeInteger(assembly.dependencyCycleRowCount)
  const schedulePropagationCycleRowCount = readRequiredNonNegativeInteger(assembly.schedulePropagationCycleRowCount)
  const networkComponentCount = readRequiredNonNegativeInteger(assembly.networkComponentCount)
  const networkRootCount = readRequiredNonNegativeInteger(assembly.networkRootCount)
  const networkSinkCount = readRequiredNonNegativeInteger(assembly.networkSinkCount)
  const readinessReasonCodes = readRequiredStringArray(assembly.readinessReasonCodes)
  const unresolvedDependencyCount = readRequiredNonNegativeInteger(quality.unresolvedDependencyCount)
  const runtimeApprovalRequired = readRequiredBoolean(quality.runtimeApprovalRequired)
  const blocksWizardCommit = readRequiredBoolean(quality.blocksWizardCommit)
  const previewOnly = readRequiredBoolean(executablePreview.previewOnly)
  const mutationBoundary = readRequiredString(executablePreview.mutationBoundary)
  const projectStartDate = readRequiredString(executablePreview.projectStartDate)
  const projectEndDate = readRequiredString(executablePreview.projectEndDate)
  const details = {
    businessType: previewCase.businessType,
    expectedSubtype,
    observedIdentity: {
      businessType: observedBusinessType,
      businessSubtype: observedSubtype,
    },
    profileRowCountRange: profileRange,
    assemblyStatus,
    readyForWizardCommit,
    assetAuthority,
    minimumScheduleRowCount,
    operationalRowFloor,
    availableScheduleRowCount,
    assetInventoryShortfallAccepted,
    scheduleRowCount,
    assemblyScheduleRowCount,
    visibleDependencyCount,
    visibleDependencyCoverageRate,
    missingExecutionPhases,
    invalidDurationRowCount,
    methodConflictCount,
    durationAssetSemanticMismatchCount,
    dependencyCycleRowCount,
    schedulePropagationCycleRowCount,
    networkComponentCount,
    networkRootCount,
    networkSinkCount,
    readinessReasonCodes,
    unresolvedDependencyCount,
    runtimeApprovalRequired,
    blocksWizardCommit,
    previewOnly,
    mutationBoundary,
    projectStartDate,
    projectEndDate,
    profileIssues,
  }

  assertPreviewCondition(httpStatus === 200, `${previewCase.businessType} preview did not return HTTP 200`, details)
  assertPreviewCondition(observedBusinessType === previewCase.businessType, `${previewCase.businessType} preview returned a different canonical business type`, details)
  assertPreviewCondition(observedSubtypeValid, `${previewCase.businessType} preview returned a different canonical business subtype`, details)
  assertPreviewCondition(assemblyStatus === 'executable_default_master_plan_ready', `${previewCase.businessType} preview assembly is not ready`, details)
  assertPreviewCondition(readyForWizardCommit === true, `${previewCase.businessType} preview is not ready for wizard commit`, details)
  assertPreviewCondition(assetAuthority === 'system_standard_seed', `${previewCase.businessType} preview asset authority is unavailable`, details)
  assertPreviewCondition(Number.isInteger(scheduleRowCount) && scheduleRowCount >= 60 && scheduleRowCount <= 300, `${previewCase.businessType} preview row count is outside 60-300`, details)
  assertPreviewCondition(assemblyScheduleRowCount === scheduleRowCount, `${previewCase.businessType} preview assembly row count is inconsistent`, details)
  assertPreviewCondition(profileRange.length === 2, `${previewCase.businessType} preview profile range is unavailable`, details)
  assertPreviewCondition(scheduleRowCount <= profileRange[1], `${previewCase.businessType} preview row count exceeds its profile maximum`, details)
  assertPreviewCondition(Number.isInteger(minimumScheduleRowCount) && scheduleRowCount >= minimumScheduleRowCount, `${previewCase.businessType} preview is below its governed minimum row count`, details)
  assertPreviewCondition(Number.isInteger(operationalRowFloor) && scheduleRowCount >= operationalRowFloor, `${previewCase.businessType} preview is below its operational row floor`, details)
  assertPreviewCondition(Number.isInteger(availableScheduleRowCount) && availableScheduleRowCount >= scheduleRowCount, `${previewCase.businessType} preview available row count is inconsistent`, details)
  assertPreviewCondition(assetInventoryShortfallAccepted === false, `${previewCase.businessType} preview relies on an asset inventory shortfall`, details)
  assertPreviewCondition(Number.isFinite(visibleDependencyCount) && visibleDependencyCount > 0, `${previewCase.businessType} preview has no visible dependencies`, details)
  assertPreviewCondition(Number.isFinite(visibleDependencyCoverageRate) && visibleDependencyCoverageRate >= 0.9, `${previewCase.businessType} preview dependency coverage is below 0.9`, details)
  assertPreviewCondition(missingExecutionPhases !== null && missingExecutionPhases.length === 0, `${previewCase.businessType} preview is missing execution phase evidence or coverage`, details)
  assertPreviewCondition(invalidDurationRowCount === 0, `${previewCase.businessType} preview contains invalid durations or missing evidence`, details)
  assertPreviewCondition(methodConflictCount === 0, `${previewCase.businessType} preview contains method conflicts or missing evidence`, details)
  assertPreviewCondition(durationAssetSemanticMismatchCount === 0, `${previewCase.businessType} preview contains duration asset semantic mismatches or missing evidence`, details)
  assertPreviewCondition(networkComponentCount === 1, `${previewCase.businessType} preview network is disconnected`, details)
  assertPreviewCondition(networkRootCount === 1, `${previewCase.businessType} preview network root is not unique`, details)
  assertPreviewCondition(networkSinkCount === 1, `${previewCase.businessType} preview network sink is not unique`, details)
  assertPreviewCondition(readinessReasonCodes !== null && readinessReasonCodes.length === 0, `${previewCase.businessType} preview has readiness blockers or missing evidence`, details)
  assertPreviewCondition(unresolvedDependencyCount === 0, `${previewCase.businessType} preview has unresolved dependencies or missing evidence`, details)
  assertPreviewCondition(dependencyCycleRowCount === 0, `${previewCase.businessType} preview has dependency cycles or missing evidence`, details)
  assertPreviewCondition(schedulePropagationCycleRowCount === 0, `${previewCase.businessType} preview has schedule propagation cycles or missing evidence`, details)
  assertPreviewCondition(runtimeApprovalRequired === false, `${previewCase.businessType} preview unexpectedly requires runtime approval`, details)
  assertPreviewCondition(blocksWizardCommit === false, `${previewCase.businessType} preview blocks wizard commit`, details)
  assertPreviewCondition(previewOnly === true, `${previewCase.businessType} response is not marked preview-only`, details)
  assertPreviewCondition(mutationBoundary === 'preview_only_no_db_write', `${previewCase.businessType} response does not attest the preview mutation boundary`, details)
  assertPreviewCondition(isValidIsoDate(projectStartDate) && isValidIsoDate(projectEndDate), `${previewCase.businessType} preview project dates are invalid`, details)
  assertPreviewCondition(projectStartDate <= projectEndDate, `${previewCase.businessType} preview project dates are reversed`, details)
  assertPreviewCondition(rows.length > 0 && rows.every((row) => (
    isValidIsoDate(row.plannedStartDate)
    && isValidIsoDate(row.plannedEndDate)
    && row.plannedStartDate <= row.plannedEndDate
  )), `${previewCase.businessType} preview contains an invalid row date`, details)

  const businessMarkerEvidence = rows.reduce((match, row) => {
    if (match) return match
    const wbsCode = readRequiredString(row?.wbsCode)
    const standardWorkDurationSeedStableCode = readRequiredString(row?.standardWorkDurationSeedStableCode)
    const t2RhythmTemplateId = readRequiredString(row?.t2RhythmTemplateId)
    if (!wbsCode?.startsWith(previewCase.markerPrefix) || !standardWorkDurationSeedStableCode || !t2RhythmTemplateId) {
      return null
    }
    return { wbsCode, standardWorkDurationSeedStableCode, t2RhythmTemplateId }
  }, null)
  assertPreviewCondition(Boolean(businessMarkerEvidence), `${previewCase.businessType} preview did not consume its business marker, T2 rhythm, and duration seed together`, details)

  return {
    businessType: previewCase.businessType,
    businessSubtype: expectedSubtype,
    httpStatus,
    profileRowCountRange: profileRange,
    scheduleRowCount,
    assemblyStatus,
    readyForWizardCommit,
    assetAuthority,
    minimumScheduleRowCount,
    operationalRowFloor,
    availableScheduleRowCount,
    assetInventoryShortfallAccepted,
    visibleDependencyCount,
    visibleDependencyCoverageRate,
    missingExecutionPhaseCount: missingExecutionPhases.length,
    invalidDurationRowCount,
    methodConflictCount,
    durationAssetSemanticMismatchCount,
    networkComponentCount,
    networkRootCount,
    networkSinkCount,
    unresolvedDependencyCount,
    runtimeApprovalRequired,
    blocksWizardCommit,
    projectStartDate,
    projectEndDate,
    businessMarkerCode: businessMarkerEvidence.wbsCode,
    standardWorkDurationSeedStableCode: businessMarkerEvidence.standardWorkDurationSeedStableCode,
    t2RhythmTemplateId: businessMarkerEvidence.t2RhythmTemplateId,
    previewOnly,
    mutationBoundary,
  }
}

const wizardPayload = buildBusinessPreviewPayload(
  WIZARD_MUTATION_CASE,
  diagnosticProjectName,
  { canonicalScope: !productionLive },
)

try {
  await authenticate()
  await readDurationAccuracySummary()
  writeResultReport()

  result.steps.previewBusinessTypeMatrix = {
    status: 'running',
    previewCount: 0,
    expectedPreviewCount: BUSINESS_TYPE_PREVIEW_CASES.length,
    canonicalBusinessTypes: BUSINESS_TYPE_PREVIEW_CASES.map((previewCase) => previewCase.businessType),
    mutationBoundary: 'authenticated_preview_only_no_project_fact_write',
    cases: [],
  }
  writeResultReport()
  let canonicalResidentialPreview = null
  for (const previewCase of BUSINESS_TYPE_PREVIEW_CASES) {
    const previewPayload = buildBusinessPreviewPayload(
      previewCase,
      previewCase.businessType === 'general_civil'
        ? diagnosticProjectName
        : `${diagnosticProjectName} Preview ${previewCase.businessType}`,
    )
    const previewCall = await apiRequest('POST', '/api/projects/wizard/preview', previewPayload)
    const preview = assertApi(`preview ${previewCase.businessType} wizard candidate plan`, previewCall, [200])
    const evidence = validateBusinessTypePreview(previewCase, preview, previewCall.response.status)
    result.steps.previewBusinessTypeMatrix.cases.push(evidence)
    result.steps.previewBusinessTypeMatrix.previewCount = result.steps.previewBusinessTypeMatrix.cases.length
    if (previewCase.businessType === 'general_civil') canonicalResidentialPreview = preview
    writeResultReport()
  }
  result.steps.previewBusinessTypeMatrix.status = 'pass'
  result.steps.previewBusinessTypeMatrix.allCanonicalTypesReady = true
  result.steps.previewBusinessTypeMatrix.allPreviewsReadOnly = true

  const previewGeneration = canonicalResidentialPreview?.profile?.generation ?? {}
  const previewQualityDiagnostics = previewGeneration.planQualityDiagnostics ?? {}
  const previewTargetAlignment = previewQualityDiagnostics.targetAlignmentSnapshot
    ?? canonicalResidentialPreview?.profile?.targetFeasibility
    ?? null
  result.steps.previewCandidatePlan = {
    status: 'pass',
    httpStatus: 200,
    canonicalBusinessType: wizardPayload.businessType,
    canonicalBusinessSubtype: wizardPayload.businessSubtype,
    estimatedRowCount: readRequiredNonNegativeInteger(canonicalResidentialPreview?.estimatedRowCount),
    generatedScheduleRowCount: readRequiredNonNegativeInteger(previewGeneration.durationAssetUtilizationSummary?.scheduleRowCount),
    assemblyStatus: readRequiredString(previewGeneration.executableDefaultMasterPlanAssembly?.status),
    planQualityStatus: readRequiredString(previewQualityDiagnostics.status),
    runtimeApprovalRequired: readRequiredBoolean(previewQualityDiagnostics.runtimeApprovalRequired),
    blocksWizardCommit: readRequiredBoolean(previewQualityDiagnostics.blocksWizardCommit),
    unresolvedDependencyCount: readRequiredNonNegativeInteger(previewQualityDiagnostics.unresolvedDependencyCount),
    targetEndDate: readOptionalIsoDate(previewTargetAlignment?.targetEndDate),
    naturalEndDate: readOptionalIsoDate(previewTargetAlignment?.naturalEndDate),
    targetOvershootDays: readOptionalNonNegativeNumber(previewTargetAlignment?.overshootDays),
    targetUnrecoverableDays: readOptionalNonNegativeNumber(previewTargetAlignment?.unrecoverableDays),
  }
  writeResultReport()

  const createRequest = {
    newProjectId: projectId,
    companyId,
    name: wizardPayload.projectName,
    location: wizardPayload.location,
    total_area: wizardPayload.totalAreaM2,
    planned_start_date: wizardPayload.plannedStartDate,
    planned_end_date: wizardPayload.plannedEndDate,
    metadata: {
      diagnosticRunId: runId,
      diagnosticSource: 'wizard_baseline_revision_live_probe',
      diagnosticProjectName,
      diagnosticReleaseSha: releaseSha || null,
    },
    wizardPayload,
    commit: false,
  }
  createRequestOutcome = 'awaiting_response'
  result.createRequestOutcome = createRequestOutcome
  writeResultReport()
  const createdCall = await apiRequest('POST', '/api/projects/wizard', createRequest)
  createRequestOutcome = 'response_received'
  result.createRequestOutcome = createRequestOutcome
  const created = assertApi('create wizard draft', createdCall, [201])
  const createdProjectId = requireValue(created?.projectId ?? created?.id, 'created project id')
  if (createdProjectId !== projectId) throw new Error('wizard draft returned a different project id')
  result.projectId = projectId
  result.steps.createWizardDraft = {
    status: 'pass',
    httpStatus: createdCall.response.status,
    projectId,
  }
  writeResultReport()

  const asyncGeneration = !productionLive
  const committedCall = await apiRequest('POST', '/api/projects/wizard', {
    ...createRequest,
    newProjectId: undefined,
    projectId,
    commit: true,
    asyncGeneration,
  })
  const committed = assertApi('commit wizard generation', committedCall, asyncGeneration ? [202] : [200])
  let generation = committed?.generation ?? {}
  let generationAttemptId = null
  let generationPollCount = null
  if (asyncGeneration) {
    generationAttemptId = requireValue(generation.attemptId, 'wizard generation attempt id')
    activeGenerationAttemptId = generationAttemptId
    const queuedState = requireValue(generation.state, 'queued wizard generation state')
    if (queuedState !== 'queued') {
      throw new Error(`queued wizard generation returned unexpected state: ${queuedState}`)
    }
    result.steps.commitWizardGeneration = {
      status: 'running',
      httpStatus: committedCall.response.status,
      asyncGeneration: true,
      attemptId: generationAttemptId,
      generationState: queuedState,
      generationPollCount: 0,
      generationBatchId: null,
    }
    writeResultReport()
    const completedGeneration = await waitForWizardGeneration(projectId, generationAttemptId)
    generation = completedGeneration.generation
    generationPollCount = completedGeneration.attempts
  }
  result.generationBatchId = requireValue(generation.generationBatchId, 'generation batch id')
  result.steps.commitWizardGeneration = {
    status: 'pass',
    httpStatus: committedCall.response.status,
    asyncGeneration,
    attemptId: generationAttemptId,
    generationState: asyncGeneration ? generation.state : 'completed',
    generationPollCount,
    generationBatchId: result.generationBatchId,
    generatedRowCount: generation.generatedRowCount ?? null,
    createdTaskCount: generation.createdTaskCount ?? null,
    assemblyStatus: generation.executableDefaultMasterPlanAssembly?.status ?? null,
    assetInventoryShortfallAccepted: generation.executableDefaultMasterPlanAssembly?.assetInventoryShortfallAccepted ?? null,
    planQualityStatus: generation.planQualityDiagnostics?.status ?? null,
    runtimeApprovalRequired: generation.planQualityDiagnostics?.runtimeApprovalRequired ?? null,
    blocksWizardCommit: generation.planQualityDiagnostics?.blocksWizardCommit ?? null,
  }

  const inventoryCall = await apiRequest('GET', `/api/projects/${projectId}/wizard/artifact-inventory`)
  const inventory = assertApi('read wizard artifact inventory', inventoryCall, [200])
  const baselineId = requireValue(
    inventory?.candidateBaselineIds?.[0]
      ?? generation.candidateBaseline?.baselineId,
    'candidate baseline id',
  )
  result.baselineId = baselineId
  result.steps.artifactInventory = {
    status: 'pass',
    httpStatus: inventoryCall.response.status,
    generatedTaskCount: inventory.generatedTaskCount,
    primaryScheduleTaskCount: inventory.generatedPrimaryScheduleTaskCount,
    primaryScheduleExecutableTaskCount: inventory.generatedPrimaryScheduleExecutableTaskCount,
    primaryScheduleRecordOnlyTaskCount: inventory.generatedPrimaryScheduleRecordOnlyTaskCount,
    nonPrimaryTaskCount: inventory.generatedNonPrimaryTaskCount,
    candidateBaselineCount: inventory.candidateBaselinesRemaining,
    candidateBaselineItemCount: inventory.candidateBaselineItemCount,
    candidateBaselineMappedItemCount: inventory.candidateBaselineMappedItemCount,
    candidateBaselineId: baselineId,
    dependencyCount: inventory.dependenciesRemaining,
  }

  const generatedTaskCount = Number(inventory.generatedTaskCount ?? 0)
  const inventoryDependencyCount = Number(inventory.dependenciesRemaining ?? 0)
  if (!Number.isFinite(generatedTaskCount) || generatedTaskCount <= 0) {
    throw new Error('wizard task readback is empty')
  }
  if (!Number.isFinite(inventoryDependencyCount) || inventoryDependencyCount <= 0) {
    throw new Error('wizard dependency readback is empty')
  }

  const taskReadCall = await apiRequest(
    'GET',
    `/api/tasks?projectId=${encodeURIComponent(projectId)}&surface=task_list&acceptance_impact=false`,
  )
  const taskRows = assertApi('read wizard tasks and dependencies', taskReadCall, [200])
  if (!Array.isArray(taskRows) || taskRows.length === 0) {
    throw new Error('wizard task readback is empty')
  }
  const taskIdSet = new Set(taskRows.map((task) => String(task?.id ?? '').trim()).filter(Boolean))
  const dependencyPairs = taskRows.flatMap((task) => {
    const taskId = String(task?.id ?? '').trim()
    const dependencies = Array.isArray(task?.dependencies) ? task.dependencies : []
    return dependencies
      .map((dependencyTaskId) => String(dependencyTaskId ?? '').trim())
      .filter(Boolean)
      .map((dependencyTaskId) => ({ taskId, dependencyTaskId }))
  })
  const dependencyReadbackCount = dependencyPairs.length
  if (dependencyReadbackCount === 0) {
    throw new Error('wizard dependency readback is empty')
  }
  const danglingDependencyIds = [...new Set(
    dependencyPairs
      .filter(({ taskId, dependencyTaskId }) => !taskIdSet.has(taskId) || !taskIdSet.has(dependencyTaskId))
      .map(({ dependencyTaskId }) => dependencyTaskId),
  )]
  if (danglingDependencyIds.length > 0) {
    const error = new Error('wizard dependency readback contains dangling task ids')
    error.details = { danglingDependencyIds }
    throw error
  }
  result.steps.taskDependencyReadback = {
    status: 'pass',
    httpStatus: taskReadCall.response.status,
    taskCount: taskRows.length,
    inventoryTaskCount: generatedTaskCount,
    dependencyReadbackCount,
    inventoryDependencyCount,
    danglingDependencyCount: 0,
  }

  const criticalPathCall = await apiRequest('GET', `/api/projects/${projectId}/critical-path`)
  const criticalPath = assertApi('read wizard critical path', criticalPathCall, [200])
  if (String(criticalPath?.projectId ?? '').trim() !== projectId) {
    throw new Error('critical path project id does not match wizard project')
  }
  if (criticalPath?.calculationStatus === 'empty_after_failure') {
    const error = new Error('critical path calculation failed')
    error.details = {
      calculationFailureMessage: criticalPath?.calculationFailureMessage ?? null,
      calculationFailedAt: criticalPath?.calculationFailedAt ?? null,
    }
    throw error
  }
  const criticalPathTasks = Array.isArray(criticalPath?.tasks) ? criticalPath.tasks : []
  if (criticalPathTasks.length === 0) {
    throw new Error('critical path task readback is empty')
  }
  const criticalPathEdges = Array.isArray(criticalPath?.edges) ? criticalPath.edges : []
  const dependencyEdges = criticalPathEdges.filter((edge) => edge?.source === 'dependency')
  const dependencyEdgeCount = dependencyEdges.length
  if (dependencyEdgeCount === 0) {
    throw new Error('critical path dependency edge readback is empty')
  }
  const projectDurationDays = Number(criticalPath?.projectDurationDays ?? 0)
  if (!Number.isFinite(projectDurationDays) || projectDurationDays <= 0) {
    throw new Error('critical path project duration is empty')
  }
  result.steps.criticalPathReadback = {
    status: 'pass',
    httpStatus: criticalPathCall.response.status,
    projectId: criticalPath.projectId,
    calculationStatus: criticalPath.calculationStatus ?? null,
    taskCount: criticalPathTasks.length,
    displayTaskCount: Array.isArray(criticalPath?.displayTaskIds) ? criticalPath.displayTaskIds.length : 0,
    edgeCount: criticalPathEdges.length,
    dependencyEdgeCount,
    projectDurationDays,
    calculatedAt: criticalPath.calculatedAt ?? null,
    dependencyInputHash: criticalPath?.networkLineage?.dependencyInputHash ?? null,
  }

  const baselinePath = `/api/task-baselines/${baselineId}?project_id=${encodeURIComponent(projectId)}`
  const baselineCall = await apiRequest('GET', baselinePath)
  const baseline = assertApi('read candidate baseline', baselineCall, [200])
  const baselineItems = Array.isArray(baseline?.items) ? baseline.items : []
  if (baselineItems.length === 0) throw new Error('candidate baseline has no items')
  result.steps.readCandidateBaseline = {
    status: 'pass',
    httpStatus: baselineCall.response.status,
    baselineStatus: baseline.status,
    itemCount: baselineItems.length,
    version: baseline.version ?? null,
  }

  const adjustedItemId = requireValue(baselineItems[0]?.id, 'adjusted item id')
  const noteBefore = String(baselineItems[0]?.notes ?? '')
  const noteAfter = `User plan adjustment ${runId}`
  const fieldRegistryCall = await apiRequest(
    'GET',
    `/api/planning/field-registry?projectId=${encodeURIComponent(projectId)}&surface=baseline`,
  )
  const fieldRegistry = assertApi('read baseline field registry', fieldRegistryCall, [200])
  const fieldRegistryVersion = requireValue(fieldRegistry?.registryVersion, 'baseline field registry version')
  result.steps.baselineFieldRegistryReadback = {
    status: 'pass',
    httpStatus: fieldRegistryCall.response.status,
    fieldRegistryVersion,
  }

  const saveCall = await apiRequest('POST', `/api/task-baselines/${baselineId}/commit`, {
    projectId,
    surface: 'baseline',
    resourceId: baselineId,
    baseVersion: baseline.version ?? undefined,
    fieldRegistryVersion,
    operations: [{
      type: 'update_row',
      rowId: adjustedItemId,
      values: { notes: noteAfter },
    }],
  })
  const saved = assertApi('save plan adjustment', saveCall, [200])
  result.steps.savePlanAdjustment = {
    status: 'pass',
    httpStatus: saveCall.response.status,
    itemCount: Array.isArray(saved?.rows) ? saved.rows.length : null,
    adjustedItemId,
    noteBefore,
    noteAfter,
  }

  const readBackCall = await apiRequest('GET', baselinePath)
  const readBack = assertApi('read back plan adjustment', readBackCall, [200])
  const adjustmentPersisted = readBack?.items?.find((item) => item.id === adjustedItemId)?.notes === noteAfter
  if (!adjustmentPersisted) throw new Error('plan adjustment was not persisted')
  result.steps.readBackPlanAdjustment = {
    status: 'pass',
    httpStatus: readBackCall.response.status,
    adjustmentPersisted,
    itemCount: readBack?.items?.length ?? null,
  }

  const publishCall = await apiRequest('POST', `/api/task-baselines/${baselineId}/publish`, {
    version: readBack.version ?? null,
    cause_code: 'other',
    change_reason: noteAfter,
  })
  const published = assertApi('publish edited baseline', publishCall, [200])
  if (published?.status !== 'confirmed') throw new Error(`published baseline status is ${published?.status ?? 'missing'}`)
  result.steps.publishBaseline = {
    status: 'pass',
    httpStatus: publishCall.response.status,
    baselineStatus: published.status,
    version: published.version ?? null,
    causeCode: 'other',
    changeReason: noteAfter,
  }

  const revisionIdempotencyKey = `${runId}-revision`
  const revisionRequest = {
    reason: `Baseline revision smoke ${runId}`,
    source_candidate_ids: [],
  }
  const revisionCall = await apiRequest(
    'POST',
    `/api/task-baselines/${baselineId}/revisions`,
    revisionRequest,
    { 'Idempotency-Key': revisionIdempotencyKey },
  )
  const revision = assertApi('start baseline revision', revisionCall, [201])
  const revisionId = requireValue(revision?.revision_id, 'revision id')
  result.revisionId = revisionId

  const retryCall = await apiRequest(
    'POST',
    `/api/task-baselines/${baselineId}/revisions`,
    revisionRequest,
    { 'Idempotency-Key': revisionIdempotencyKey },
  )
  const retriedRevision = assertApi('retry baseline revision idempotently', retryCall, [201])
  if (retriedRevision?.revision_id !== revisionId) throw new Error('idempotent revision retry returned a different revision id')
  result.steps.startRevision = {
    status: 'pass',
    httpStatus: revisionCall.response.status,
    retryHttpStatus: retryCall.response.status,
    revisionId,
    retryRevisionId: retriedRevision.revision_id,
    idempotent: true,
  }

  const revisionPath = `/api/task-baselines/${revisionId}?project_id=${encodeURIComponent(projectId)}`
  const revisionReadCall = await apiRequest('GET', revisionPath)
  const revisionRead = assertApi('read revision draft', revisionReadCall, [200])
  if (revisionRead?.status !== 'revising') throw new Error(`revision draft status is ${revisionRead?.status ?? 'missing'}`)
  if (revisionRead?.source_version_id !== baselineId) throw new Error('revision draft source baseline does not match')
  result.steps.readRevisionDraft = {
    status: 'pass',
    httpStatus: revisionReadCall.response.status,
    revisionStatus: revisionRead.status,
    sourceVersionId: revisionRead.source_version_id,
    sourceItemCount: readBack.items.length,
    itemCount: revisionRead?.items?.length ?? null,
    itemCountMatchesSource: revisionRead?.items?.length === readBack.items.length,
  }
  if (revisionRead?.items?.length !== readBack.items.length) {
    result.steps.readRevisionDraft.status = 'fail'
    throw new Error('revision draft item count does not match source baseline')
  }

  const rollbackCall = await apiRequest('DELETE', `/api/task-baselines/${revisionId}`)
  assertApi('rollback revision draft', rollbackCall, [200])
  const postRollbackCall = await apiRequest('GET', revisionPath)
  if (postRollbackCall.response.status !== 404) {
    throw new Error(`revision draft remained readable after rollback: HTTP ${postRollbackCall.response.status}`)
  }
  const confirmedReadCall = await apiRequest('GET', baselinePath)
  const confirmedRead = assertApi('read confirmed baseline after revision rollback', confirmedReadCall, [200])
  if (confirmedRead?.status !== 'confirmed') throw new Error('confirmed baseline changed during revision rollback')
  result.steps.rollbackRevisionDraft = {
    status: 'pass',
    deleteHttpStatus: rollbackCall.response.status,
    postDeleteReadHttpStatus: postRollbackCall.response.status,
    revisionPhysicallyDeleted: true,
    confirmedBaselineStatus: confirmedRead.status,
    confirmedBaselineVersion: confirmedRead.version ?? null,
  }

  result.status = 'pass'
} catch (error) {
  result.status = 'fail'
  result.error = {
    message: error instanceof Error ? error.message : String(error),
    details: error && typeof error === 'object' ? error.details ?? null : null,
  }
} finally {
  if (createRequestOutcome === 'awaiting_response' && projectId && accessToken) {
    try {
      await waitForUncertainProjectCreation(projectId)
    } catch (recoveryError) {
      result.steps.projectRecovery = {
        status: 'fail',
        strategy: 'preallocated_project_id_readback_after_uncertain_create_response',
        message: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
      }
    }
  } else if (!projectId && accessToken) {
    try {
      await recoverProjectIdByDiagnosticRunId(result.diagnosticRunId, result.projectName)
    } catch (recoveryError) {
      result.steps.projectRecovery = {
        status: 'fail',
        strategy: 'authenticated_company_project_list_diagnostic_run_id',
        message: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
      }
    }
  }
  await cleanupProject()
  writeResultReport()
  process.stdout.write(`${JSON.stringify({ status: result.status, reportPath, projectId: result.projectId, baselineId: result.baselineId, revisionId: result.revisionId, cleanup: result.cleanup })}\n`)
}
}

if (result.status !== 'pass') process.exitCode = 1
