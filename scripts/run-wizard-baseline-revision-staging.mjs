import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

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
  error.details = body?.error?.details ?? body?.details ?? null
  return error
}

const args = parseArgs(process.argv.slice(2))
const envPath = path.resolve(workspaceRoot, args.get('env-file') ?? 'deploy/env/staging.env')
const env = loadEnvFile(envPath)
const apiBaseUrl = requireValue(args.get('api-base-url') ?? 'http://127.0.0.1:3107', 'api-base-url').replace(/\/$/, '')
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
    physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    hardConstraintCodes: [],
    buildingCount: 1,
    standardFloorCount: 22,
    basementLevelCount: 2,
  },
  {
    businessType: 'hotel',
    businessSubtype: null,
    markerPrefix: 'BTMP-HTL-',
    functionalUsageCodes: ['hotel'],
    functionalCategoryCodes: ['hotel'],
    specialRoomTypeCodes: ['guestroom', 'lobby', 'kitchen'],
    physicalZoneTypeCodes: ['tower', 'basement', 'podium', 'outdoor_site'],
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
    functionalUsageCodes: ['hospital'],
    functionalCategoryCodes: ['cleanroom'],
    specialRoomTypeCodes: ['cleanroom', 'operating_room'],
    physicalZoneTypeCodes: ['tower', 'basement'],
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
    physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site', 'playground'],
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
    physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site', 'logistics_yard'],
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
    functionalUsageCodes: ['data_center'],
    functionalCategoryCodes: ['data_center'],
    specialRoomTypeCodes: ['computer_room', 'battery_room'],
    physicalZoneTypeCodes: ['tower', 'basement'],
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
    physicalZoneTypeCodes: ['tower', 'basement', 'metro_interface', 'outdoor_site'],
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
    physicalZoneTypeCodes: ['large_span_hall', 'basement', 'outdoor_site'],
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
    functionalUsageCodes: ['tod_upper_cover'],
    functionalCategoryCodes: ['tod'],
    specialRoomTypeCodes: ['podium', 'metro_interface'],
    physicalZoneTypeCodes: ['tower', 'basement', 'metro_interface', 'outdoor_site'],
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
    buildingCount: 1,
    standardFloorCount: 6,
    basementLevelCount: 1,
  },
  {
    businessType: 'modular_building',
    businessSubtype: null,
    markerPrefix: 'BTMP-MOD-',
    functionalUsageCodes: ['modular_building'],
    functionalCategoryCodes: ['modular_building'],
    specialRoomTypeCodes: [],
    physicalZoneTypeCodes: ['tower', 'basement'],
    methodVariantCodes: ['modular_mic', 'modular_prefab', 'pile_foundation'],
    hardConstraintCodes: [],
    buildingCount: 1,
    standardFloorCount: 18,
    basementLevelCount: 1,
  },
]

function buildBusinessPreviewScopeTree(previewCase, totalAreaM2, basementAreaM2) {
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
  const physicalZones = previewCase.physicalZoneTypeCodes.map((physicalCategory, index) => ({
    id: `${previewCase.businessType}-physical-zone-${index + 1}`,
    type: 'physical_zone',
    name: `${physicalCategory} zone`,
    metadata: {
      physicalCategory,
      coverageRole: 'overlay_trigger',
      areaAccountingMode: 'not_counted',
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
        },
        children: [],
      }]
    : []
  return [...buildings, ...basement, ...functionalAreas, ...physicalZones]
}

function buildBusinessPreviewPayload(previewCase, projectName = `${diagnosticProjectName} Preview ${previewCase.businessType}`) {
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
    scopeTree: buildBusinessPreviewScopeTree(previewCase, totalAreaM2, basementAreaM2),
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
  productionLive,
  mutationBoundary: productionLive
    ? 'explicitly_approved_disposable_production_project_only_created_adjusted_confirmed_revised_then_physically_deleted'
    : 'disposable_staging_project_only_created_adjusted_confirmed_revised_then_physically_deleted',
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

async function authenticate(expectedCompanyId = requestedCompanyId) {
  const authResponse = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      'Content-Type': 'application/json',
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
    const preDeleteReadCall = await apiRequest('GET', `/api/projects/${targetProjectId}`)
    if (preDeleteReadCall.response.status === 404) {
      result.cleanup = {
        status: 'pass',
        deleteHttpStatus: null,
        postDeleteReadHttpStatus: 404,
        projectPhysicallyDeleted: true,
        projectUnreadable: true,
        entityAlreadyAbsent: true,
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
    const readCall = await apiRequest('GET', `/api/projects/${targetProjectId}`)
    const physicallyDeleted = [200, 204, 404].includes(deleteCall.response.status)
      && readCall.response.status === 404
    result.cleanup = {
      status: physicallyDeleted ? 'pass' : 'fail',
      deleteHttpStatus: initialDeleteHttpStatus,
      rollbackHttpStatus,
      draftDeleteHttpStatus,
      postDeleteReadHttpStatus: readCall.response.status,
      projectPhysicallyDeleted: physicallyDeleted,
      projectUnreadable: readCall.response.status === 404,
    }
    if (!physicallyDeleted) result.status = 'fail'
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
    projectId = String(previousResult?.projectId ?? '').trim() || null
    result.projectId = projectId
    result.diagnosticRunId = requireValue(previousResult?.diagnosticRunId, 'cleanup report diagnostic run id')
    result.projectName = String(previousResult?.projectName ?? '').trim()
      || `Disposable Residential Baseline ${result.diagnosticRunId}`
    result.createRequestOutcome = String(previousResult?.createRequestOutcome ?? 'unknown')
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

function validateBusinessTypePreview(previewCase, preview, httpStatus) {
  const identity = preview?.profile?.identity ?? {}
  const generation = preview?.profile?.generation ?? {}
  const masterPlanProfile = generation.masterPlanProfile ?? {}
  const assembly = generation.executableDefaultMasterPlanAssembly ?? {}
  const executablePreview = generation.executableDefaultMasterPlanPreview ?? {}
  const quality = generation.planQualityDiagnostics ?? {}
  const profileRange = Array.isArray(masterPlanProfile.rowCountRange)
    ? masterPlanProfile.rowCountRange.map(Number)
    : []
  const scheduleRowCount = Number(executablePreview.scheduleRowCount ?? assembly.scheduleRowCount)
  const visibleDependencyCount = Number(assembly.visibleDependencyCount ?? executablePreview.visibleDependencyCount)
  const visibleDependencyCoverageRate = Number(assembly.visibleDependencyCoverageRate)
  const rows = Array.isArray(executablePreview.rows) ? executablePreview.rows : []
  const expectedSubtype = previewCase.businessSubtype ?? null
  const observedSubtype = identity.businessSubtype ?? null
  const details = {
    businessType: previewCase.businessType,
    expectedSubtype,
    identity,
    masterPlanProfile,
    assembly,
    quality,
    executablePreview: {
      ...executablePreview,
      rows: undefined,
    },
  }

  assertPreviewCondition(httpStatus === 200, `${previewCase.businessType} preview did not return HTTP 200`, details)
  assertPreviewCondition(identity.businessType === previewCase.businessType, `${previewCase.businessType} preview returned a different canonical business type`, details)
  assertPreviewCondition(observedSubtype === expectedSubtype, `${previewCase.businessType} preview returned a different canonical business subtype`, details)
  assertPreviewCondition(assembly.status === 'executable_default_master_plan_ready', `${previewCase.businessType} preview assembly is not ready`, details)
  assertPreviewCondition(assembly.readyForWizardCommit === true, `${previewCase.businessType} preview is not ready for wizard commit`, details)
  assertPreviewCondition(Number.isInteger(scheduleRowCount) && scheduleRowCount >= 60 && scheduleRowCount <= 300, `${previewCase.businessType} preview row count is outside 60-300`, details)
  assertPreviewCondition(profileRange.length === 2 && profileRange.every(Number.isFinite), `${previewCase.businessType} preview profile range is unavailable`, details)
  assertPreviewCondition(scheduleRowCount >= profileRange[0] && scheduleRowCount <= profileRange[1], `${previewCase.businessType} preview row count is outside its profile range`, details)
  assertPreviewCondition(Number.isFinite(visibleDependencyCount) && visibleDependencyCount > 0, `${previewCase.businessType} preview has no visible dependencies`, details)
  assertPreviewCondition(Number.isFinite(visibleDependencyCoverageRate) && visibleDependencyCoverageRate >= 0.9, `${previewCase.businessType} preview dependency coverage is below 0.9`, details)
  assertPreviewCondition(Number(quality.unresolvedDependencyCount ?? 0) === 0, `${previewCase.businessType} preview has unresolved dependencies`, details)
  assertPreviewCondition(Number(assembly.dependencyCycleRowCount ?? executablePreview.dependencyCycleRowCount ?? 0) === 0, `${previewCase.businessType} preview has dependency cycles`, details)
  assertPreviewCondition(Number(assembly.schedulePropagationCycleRowCount ?? executablePreview.schedulePropagationCycleRowCount ?? 0) === 0, `${previewCase.businessType} preview has schedule propagation cycles`, details)
  assertPreviewCondition(quality.runtimeApprovalRequired === false, `${previewCase.businessType} preview unexpectedly requires runtime approval`, details)
  assertPreviewCondition(quality.blocksWizardCommit === false, `${previewCase.businessType} preview blocks wizard commit`, details)
  assertPreviewCondition(executablePreview.previewOnly === true, `${previewCase.businessType} response is not marked preview-only`, details)
  assertPreviewCondition(executablePreview.mutationBoundary === 'preview_only_no_db_write', `${previewCase.businessType} response does not attest the preview mutation boundary`, details)
  assertPreviewCondition(isValidIsoDate(executablePreview.projectStartDate) && isValidIsoDate(executablePreview.projectEndDate), `${previewCase.businessType} preview project dates are invalid`, details)
  assertPreviewCondition(executablePreview.projectStartDate <= executablePreview.projectEndDate, `${previewCase.businessType} preview project dates are reversed`, details)
  assertPreviewCondition(rows.length > 0 && rows.every((row) => (
    isValidIsoDate(row.plannedStartDate)
    && isValidIsoDate(row.plannedEndDate)
    && row.plannedStartDate <= row.plannedEndDate
  )), `${previewCase.businessType} preview contains an invalid row date`, details)

  const businessMarkerRow = rows.find((row) => (
    String(row.wbsCode ?? '').startsWith(previewCase.markerPrefix)
    && String(row.standardWorkDurationSeedStableCode ?? '').trim()
    && String(row.t2RhythmTemplateId ?? '').trim()
  ))
  assertPreviewCondition(Boolean(businessMarkerRow), `${previewCase.businessType} preview did not consume its business marker, T2 rhythm, and duration seed together`, details)

  return {
    businessType: previewCase.businessType,
    businessSubtype: expectedSubtype,
    httpStatus,
    profileRowCountRange: profileRange,
    scheduleRowCount,
    assemblyStatus: assembly.status,
    readyForWizardCommit: assembly.readyForWizardCommit,
    visibleDependencyCount,
    visibleDependencyCoverageRate,
    unresolvedDependencyCount: Number(quality.unresolvedDependencyCount ?? 0),
    runtimeApprovalRequired: quality.runtimeApprovalRequired,
    blocksWizardCommit: quality.blocksWizardCommit,
    projectStartDate: executablePreview.projectStartDate,
    projectEndDate: executablePreview.projectEndDate,
    businessMarkerCode: businessMarkerRow.wbsCode,
    standardWorkDurationSeedStableCode: businessMarkerRow.standardWorkDurationSeedStableCode,
    t2RhythmTemplateId: businessMarkerRow.t2RhythmTemplateId,
    previewOnly: executablePreview.previewOnly,
    mutationBoundary: executablePreview.mutationBoundary,
  }
}

const wizardPayload = buildBusinessPreviewPayload(BUSINESS_TYPE_PREVIEW_CASES[0], diagnosticProjectName)

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
    estimatedRowCount: canonicalResidentialPreview?.estimatedRowCount ?? null,
    generatedScheduleRowCount: previewGeneration.durationAssetUtilizationSummary?.scheduleRowCount ?? null,
    assemblyStatus: previewGeneration.executableDefaultMasterPlanAssembly?.status ?? null,
    planQualityStatus: previewQualityDiagnostics.status ?? null,
    runtimeApprovalRequired: previewQualityDiagnostics.runtimeApprovalRequired ?? null,
    blocksWizardCommit: previewQualityDiagnostics.blocksWizardCommit ?? null,
    unresolvedDependencyCount: previewQualityDiagnostics.unresolvedDependencyCount ?? null,
    targetEndDate: previewTargetAlignment?.targetEndDate ?? null,
    naturalEndDate: previewTargetAlignment?.naturalEndDate ?? null,
    targetOvershootDays: previewTargetAlignment?.overshootDays ?? null,
    targetUnrecoverableDays: previewTargetAlignment?.unrecoverableDays ?? null,
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

  const committedCall = await apiRequest('POST', '/api/projects/wizard', {
    ...createRequest,
    newProjectId: undefined,
    projectId,
    commit: true,
    asyncGeneration: false,
  })
  const committed = assertApi('commit wizard generation', committedCall, [200])
  const generation = committed?.generation ?? {}
  result.generationBatchId = requireValue(generation.generationBatchId, 'generation batch id')
  result.steps.commitWizardGeneration = {
    status: 'pass',
    httpStatus: committedCall.response.status,
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
  const adjustedItems = baselineItems.map((item, index) => index === 0 ? { ...item, notes: noteAfter } : item)
  const saveCall = await apiRequest('PUT', `/api/task-baselines/${baselineId}`, {
    title: baseline.title,
    description: baseline.description ?? null,
    effective_from: baseline.effective_from ?? null,
    effective_to: baseline.effective_to ?? null,
    items: adjustedItems,
  })
  const saved = assertApi('save plan adjustment', saveCall, [200])
  result.steps.savePlanAdjustment = {
    status: 'pass',
    httpStatus: saveCall.response.status,
    itemCount: saved?.items?.length ?? null,
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
  })
  const published = assertApi('publish edited baseline', publishCall, [200])
  if (published?.status !== 'confirmed') throw new Error(`published baseline status is ${published?.status ?? 'missing'}`)
  result.steps.publishBaseline = {
    status: 'pass',
    httpStatus: publishCall.response.status,
    baselineStatus: published.status,
    version: published.version ?? null,
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
