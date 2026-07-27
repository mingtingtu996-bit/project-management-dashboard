#!/usr/bin/env node

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateHandoffReadiness } from './build-v14241-real-env-handoff-pack.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.candidate.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')

export const SUPPORTED_SCENARIOS = {
  'REAL-UAT-07': {
    slug: 'uat07-document-chain',
    outputFile: 'v14241-real-uat07-document-chain.execution.json',
    exportName: 'runUat07DocumentChain',
    mutationBoundary: 'Runs document package, drawing/license/acceptance responsibility-chain, storage permission, retention/delete, and cleanup/readback evidence checks only after real-environment handoff and explicit execution unlock.',
    extraRefs: {
      documentPackageId: 'targetRefs.documentPackageRef',
      storageBucketRef: 'targetRefs.storageBucketRef',
      retentionPolicyRef: 'expectedEvidenceRefs.retentionPolicyRef',
    },
  },
  'REAL-UAT-08': {
    slug: 'uat08-business-loop',
    outputFile: 'v14241-real-uat08-business-loop.execution.json',
    exportName: 'runUat08BusinessLoop',
    mutationBoundary: 'Runs materials, risk, issue, todo, notification, responsibility, and cleanup/readback evidence checks only after real-environment handoff and explicit execution unlock.',
    extraRefs: {
      materialRiskIssueSeedRef: 'targetRefs.materialRiskIssueSeedRef',
      responsibleUserRef: 'actorRefs.responsibleUserRef',
      notificationChannelRef: 'expectedEvidenceRefs.notificationChannelRef',
    },
  },
  'REAL-UAT-09': {
    slug: 'uat09-bi-ssot',
    outputFile: 'v14241-real-uat09-bi-ssot.execution.json',
    exportName: 'runUat09BiSsot',
    mutationBoundary: 'Runs Dashboard, CompanyCockpit, Reports, metric registry, snapshot lineage, export sample, and cleanup/readback evidence checks only after real-environment handoff and explicit execution unlock.',
    extraRefs: {
      snapshotRef: 'targetRefs.snapshotRef',
      metricRegistryRef: 'targetRefs.metricRegistryRef',
      exportSampleRef: 'expectedEvidenceRefs.exportSampleRef',
    },
  },
  'REAL-UAT-10': {
    slug: 'uat10-import-export',
    outputFile: 'v14241-real-uat10-import-export.execution.json',
    exportName: 'runUat10ImportExport',
    mutationBoundary: 'Runs import file set, PDF/XLSX export validation, permission-negative, reader validation, and cleanup/readback evidence checks only after real-environment handoff and explicit execution unlock.',
    extraRefs: {
      importFileSetRef: 'targetRefs.importFileSetRef',
      exportValidatorRef: 'targetRefs.exportValidatorRef',
      permissionNegativeRef: 'expectedEvidenceRefs.permissionNegativeRef',
    },
  },
  'REAL-UAT-11': {
    slug: 'uat11-performance-pressure',
    outputFile: 'v14241-real-uat11-performance-pressure.execution.json',
    exportName: 'runUat11PerformancePressure',
    mutationBoundary: 'Runs large-dataset, load-window, p95/p99, DB query-log, browser trace, hot-spot protection, and cleanup/readback evidence checks only after real-environment handoff and explicit execution unlock.',
    extraRefs: {
      largeDatasetRef: 'targetRefs.largeDatasetRef',
      loadWindowRef: 'targetRefs.loadWindowRef',
      queryLogRef: 'expectedEvidenceRefs.queryLogRef',
    },
  },
  'REAL-UAT-12': {
    slug: 'uat12-security-negative',
    outputFile: 'v14241-real-uat12-security-negative.execution.json',
    exportName: 'runUat12SecurityNegative',
    mutationBoundary: 'Runs XSS/CSRF/SSRF/rate-limit/malicious-file/header/advisor security-negative evidence checks only after real-environment handoff and explicit execution unlock.',
    extraRefs: {
      securityWindowRef: 'targetRefs.securityWindowRef',
      payloadSetRef: 'targetRefs.payloadSetRef',
      headerReadbackRef: 'expectedEvidenceRefs.headerReadbackRef',
    },
  },
  'REAL-UAT-13': {
    slug: 'uat13-release-rollback',
    outputFile: 'v14241-real-uat13-release-rollback.execution.json',
    exportName: 'runUat13ReleaseRollback',
    mutationBoundary: 'Runs release version, healthcheck, frontend deploy rollback, DB migration rollback/no-op, approval, monitoring, and rollback evidence checks only after real-environment handoff and explicit execution unlock.',
    extraRefs: {
      releaseVersionRef: 'targetRefs.releaseVersionRef',
      healthcheckUrlRef: 'targetRefs.healthcheckUrlRef',
      rollbackRef: 'rollbackRef',
    },
  },
  'REAL-UAT-14': {
    slug: 'uat14-backup-migration',
    outputFile: 'v14241-real-uat14-backup-migration.execution.json',
    exportName: 'runUat14BackupMigration',
    mutationBoundary: 'Runs backup restore, migration governance, schema drift, old-object disposition, post-restore smoke, and cleanup/readback evidence checks only after real-environment handoff and explicit execution unlock.',
    extraRefs: {
      backupRef: 'targetRefs.backupRef',
      restoreDrillDbRef: 'targetRefs.restoreDrillDbRef',
      migrationLedgerRef: 'targetRefs.migrationLedgerRef',
      oldObjectDispositionRef: 'targetRefs.oldObjectDispositionRef',
    },
  },
  'REAL-UAT-15': {
    slug: 'uat15-observability-incident',
    outputFile: 'v14241-real-uat15-observability-incident.execution.json',
    exportName: 'runUat15ObservabilityIncident',
    mutationBoundary: 'Runs observability, alert delivery, on-call, runbook, incident response, review, and cleanup/readback evidence checks only after real-environment handoff and explicit execution unlock.',
    extraRefs: {
      alertRecipientRef: 'targetRefs.alertRecipientRef',
      onCallScheduleRef: 'targetRefs.onCallScheduleRef',
      runbookRef: 'targetRefs.runbookRef',
      incidentCommanderRef: 'actorRefs.incidentCommanderRef',
    },
  },
  'REAL-UAT-16': {
    slug: 'uat16-support-ops',
    outputFile: 'v14241-real-uat16-support-ops.execution.json',
    exportName: 'runUat16SupportOps',
    mutationBoundary: 'Runs admin/support ticket, support account, audit export, data compensation, before/after readback, access review, and cleanup/readback evidence checks only after real-environment handoff and explicit execution unlock.',
    extraRefs: {
      ticketRef: 'targetRefs.ticketRef',
      supportAccountRef: 'actorRefs.supportAccountRef',
      auditExportRef: 'targetRefs.auditExportRef',
      compensationToolRef: 'targetRefs.compensationToolRef',
    },
  },
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function argValues(name) {
  const values = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1])
  }
  return values
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

async function readJsonIfPresent(path, fallback = null) {
  if (!path || !existsSync(path)) return fallback
  return readJson(path)
}

async function readTextIfPresent(path) {
  if (!existsSync(path)) return ''
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
}

function normalizeTier(value) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'UAT' || normalized === 'staging' || normalized === 'solo-live' || normalized === 'live') return normalized
  throw new Error(`Unsupported tier: ${value}. Expected UAT, staging, solo-live, or live.`)
}

function scenarioConfig(scenarioId) {
  const config = SUPPORTED_SCENARIOS[scenarioId]
  if (!config) {
    throw new Error(`Unsupported scenario: ${scenarioId}. Expected one of ${Object.keys(SUPPORTED_SCENARIOS).join(', ')}.`)
  }
  return config
}

function getByPath(value, dottedPath) {
  let current = value
  for (const part of dottedPath.split('.')) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined
    current = current[part]
  }
  return current
}

function readEnvText(text) {
  const values = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const key = line.slice(0, line.indexOf('=')).trim()
    values[key] = line.slice(line.indexOf('=') + 1).trim()
  }
  return values
}

async function resolveEnvRef(ref) {
  const value = String(ref ?? '').trim()
  const match = /^env:\/\/(.+)#([A-Z0-9_]+)$/i.exec(value)
  if (!match) return { status: 'unsupported_ref', ref }
  const envPath = resolve(repoRoot, match[1])
  const key = match[2]
  const env = readEnvText(await readTextIfPresent(envPath))
  const resolved = env[key] ?? ''
  return resolved
    ? { status: 'resolved', ref, value: resolved, path: rel(envPath), key }
    : { status: 'missing_env_value', ref, path: rel(envPath), key }
}

function scenarioRefs(handoff, scenarioId, tier) {
  return handoff.scenarios?.[scenarioId]?.tiers?.[tier] ?? {}
}

function selectTierReadiness(readiness, scenarioId, tier) {
  const scenario = readiness.scenarios.find((item) => item.id === scenarioId)
  const tierReadiness = scenario?.tiers.find((item) => item.name === tier)
  return { scenario, tier: tierReadiness }
}

function tierUnlockIssues(tier, flags) {
  const requiredFlag = tier === 'UAT' ? '--include-uat' : tier === 'staging' ? '--include-staging' : tier === 'solo-live' ? '--include-solo-live' : '--include-live'
  return [
    flags[requiredFlag] ? null : `missing ${requiredFlag}`,
    flags['--confirm-real-handoff'] ? null : 'missing --confirm-real-handoff',
    flags['--allow-write'] ? null : 'missing --allow-write',
  ].filter(Boolean)
}

async function listFiles(root) {
  if (!root || !existsSync(root)) return []
  const rootStat = await stat(root)
  if (!rootStat.isDirectory()) return rootStat.isFile() ? [root] : []
  const entries = []
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const absolute = join(dir, item.name)
      if (item.isDirectory()) {
        await walk(absolute)
      } else if (item.isFile()) {
        entries.push(absolute)
      }
    }
  }
  await walk(root)
  return entries
}

function pathSegments(path) {
  return path.split(/[\\/]+/).filter(Boolean)
}

function wildcardToRegex(pattern) {
  const escaped = pathSegments(pattern)
    .join('/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
  return new RegExp(`(^|/)${escaped}$`, 'i')
}

function matchesArtifactPattern(path, pattern) {
  return wildcardToRegex(pattern).test(path.replace(/\\/g, '/'))
}

async function resolveArtifactEvidence({ requiredArtifacts, evidenceRoot, explicitEvidenceFiles }) {
  const explicit = explicitEvidenceFiles.map((item) => resolve(item))
  const discovered = await listFiles(evidenceRoot)
  const all = [...new Set([...explicit, ...discovered])]
  return requiredArtifacts.map((artifact) => {
    const matches = all.filter((path) => matchesArtifactPattern(path, artifact))
    return {
      artifact,
      present: matches.length > 0,
      paths: matches.map(rel),
    }
  })
}

function evidenceStatus(doc) {
  return doc?.status === 'pass' || doc?.status === 'passed'
}

function environmentMatchesTier(value, tier) {
  const text = String(value ?? '').toLowerCase()
  if (!text) return false
  if (tier === 'UAT') return text.includes('uat')
  if (tier === 'staging') return text.includes('staging') || text.includes('stage')
  if (tier === 'live') return text.includes('live') || text.includes('production') || text.includes('prod')
  return false
}

function metadataPresentInDocs(docs, key) {
  return docs.some((doc) => getByPath(doc, key) !== undefined)
}

function verifiedExecutionCount(doc) {
  const explicitCount = Number(doc?.commandsExecuted)
  const traceCounts = ['apiTrace', 'checks', 'readbacks', 'operations', 'requests']
    .map((key) => Array.isArray(doc?.[key]) ? doc[key].length : 0)
  return Math.max(Number.isFinite(explicitCount) && explicitCount > 0 ? explicitCount : 0, ...traceCounts)
}

async function validateEvidenceContract({ scenario, tier, evidenceRoot, explicitEvidenceFiles }) {
  const requiredArtifacts = scenario.evidenceContract?.requiredArtifacts ?? []
  const requiredMetadata = scenario.evidenceContract?.requiredMetadata ?? []
  const artifacts = await resolveArtifactEvidence({ requiredArtifacts, evidenceRoot, explicitEvidenceFiles })
  const jsonDocs = []
  for (const artifact of artifacts) {
    for (const path of artifact.paths) {
      if (!path.toLowerCase().endsWith('.json')) continue
      const doc = await readJsonIfPresent(resolve(repoRoot, path), null)
      if (doc) jsonDocs.push(doc)
    }
  }
  const missingArtifacts = artifacts.filter((item) => !item.present).map((item) => item.artifact)
  const missingMetadata = requiredMetadata.filter((key) => !metadataPresentInDocs(jsonDocs, key))
  const nonPassingJson = jsonDocs
    .filter((doc) => doc?.status !== undefined && !evidenceStatus(doc))
    .map((doc) => doc?.status)
  const tierEnvironmentMatched = jsonDocs.some((doc) => environmentMatchesTier(doc?.environment ?? doc?.metadata?.environment, tier))
  const executionEvidenceCount = Math.max(0, ...jsonDocs.map(verifiedExecutionCount))
  return {
    status: missingArtifacts.length === 0
      && missingMetadata.length === 0
      && nonPassingJson.length === 0
      && tierEnvironmentMatched
      && executionEvidenceCount > 0
      ? 'pass'
      : 'blocked',
    artifacts,
    missingArtifacts,
    missingMetadata,
    nonPassingJson,
    tierEnvironmentMatched,
    executionEvidenceCount,
    jsonDocumentCount: jsonDocs.length,
  }
}

function buildExecutionRefs({ handoff, scenarioId, tier }) {
  const config = scenarioConfig(scenarioId)
  const envTarget = handoff.environmentTargets?.[tier] ?? {}
  const scenarioTier = scenarioRefs(handoff, scenarioId, tier)
  const credentials = envTarget.credentialRefs ?? {}
  const targetRefs = scenarioTier.targetRefs ?? {}
  const actorRefs = scenarioTier.actorRefs ?? {}
  const common = {
    apiBase: tier === 'staging' ? envTarget.apiBaseUrlRef : envTarget.apiBaseUrlRef || envTarget.baseUrlRef,
    clientBase: tier === 'staging' ? envTarget.clientBaseUrlRef : envTarget.clientBaseUrlRef || envTarget.baseUrlRef,
    username: credentials.testUserEmailRef || envTarget.roleAccountRefs?.project_admin || envTarget.roleAccountRefs?.company_admin || actorRefs.primaryTesterRef,
    password: credentials.testUserPasswordRef,
    companyId: targetRefs.companyIdRef,
    projectId: targetRefs.projectIdRef,
  }
  const extras = Object.fromEntries(
    Object.entries(config.extraRefs).map(([key, path]) => [key, getByPath(scenarioTier, path)]),
  )
  return { ...common, ...extras }
}

async function resolveExecutionRefs({ handoff, scenarioId, tier }) {
  const refs = buildExecutionRefs({ handoff, scenarioId, tier })
  const resolved = {}
  const issues = []
  for (const [key, ref] of Object.entries(refs)) {
    const result = await resolveEnvRef(ref)
    resolved[key] = result
    if (result.status !== 'resolved') issues.push(`${key}:${result.status}`)
  }
  return { resolved, issues }
}

function buildBaseReport({ scenarioId, scenarioTitle, now, tier, handoffFile, matrixFile, output, artifactRoot, flags }) {
  const config = scenarioConfig(scenarioId)
  return {
    schemaVersion: `workbuddy/v14241-real-${config.slug}-execution/v1`,
    generatedAt: now.toISOString(),
    scenarioId,
    scenarioTitle,
    tier,
    status: 'blocked',
    handoffFile: rel(resolve(handoffFile)),
    matrixFile: rel(resolve(matrixFile)),
    output: rel(resolve(output)),
    artifactRoot: rel(resolve(artifactRoot)),
    mutationBoundary: config.mutationBoundary,
    commandsExecuted: 0,
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
    unlockFlags: flags,
    blockers: [],
    checks: [],
  }
}

function assertNoSecretLikeText(report, scenarioId) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error(`refusing_to_write_${scenarioId.toLowerCase().replace(/-/g, '_')}_report_with_secret_like_text`)
  }
}

async function writeReport(report, output) {
  assertNoSecretLikeText(report, report.scenarioId)
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

export async function runRealUatScenarioContract({
  scenarioId,
  tier = 'staging',
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  releaseDir = defaultReleaseDir,
  output = null,
  artifactRoot = null,
  evidenceRoot = null,
  evidenceFiles = [],
  flags = {},
  now = new Date(),
} = {}) {
  const config = scenarioConfig(scenarioId)
  const normalizedTier = normalizeTier(tier)
  const resolvedReleaseDir = resolve(releaseDir)
  const resolvedArtifactRoot = resolve(artifactRoot ?? join(resolvedReleaseDir, 'v14241-real-env-evidence', normalizedTier.toLowerCase()))
  const resolvedEvidenceRoot = resolve(evidenceRoot ?? resolvedArtifactRoot)
  const resolvedOutput = resolve(output ?? join(resolvedReleaseDir, config.outputFile))

  const [handoff, matrix] = await Promise.all([readJson(resolve(handoffFile)), readJson(resolve(matrixFile))])
  const matrixScenario = (matrix.scenarios ?? []).find((item) => item.id === scenarioId)
  const report = buildBaseReport({
    scenarioId,
    scenarioTitle: matrixScenario?.title ?? scenarioId,
    now,
    tier: normalizedTier,
    handoffFile,
    matrixFile,
    output: resolvedOutput,
    artifactRoot: resolvedArtifactRoot,
    flags,
  })

  if (!matrixScenario) {
    report.status = 'blocked_scenario_missing_from_matrix'
    report.blockers.push('matrix_scenario_missing')
    return writeReport(report, resolvedOutput)
  }

  const readiness = evaluateHandoffReadiness({ handoff, matrix, now })
  const selected = selectTierReadiness(readiness, scenarioId, normalizedTier)
  report.handoffReadiness = {
    status: readiness.status,
    readyToExecuteMatrix: readiness.readyToExecuteMatrix,
    scenarioReadyToRun: selected.scenario?.readyToRun === true,
    tierReadyToRun: selected.tier?.readyToRun === true,
    tierMissingEnvironmentFields: selected.tier?.missingEnvironmentFields ?? [],
    tierMissingScenarioFields: selected.tier?.missingScenarioFields ?? [],
    tierMissingOwnerFields: selected.tier?.missingOwnerFields ?? [],
  }

  if (!selected.tier?.readyToRun) {
    report.status = 'blocked_missing_real_handoff_inputs'
    report.blockers.push(
      ...report.handoffReadiness.tierMissingEnvironmentFields.map((field) => `environment:${field}`),
      ...report.handoffReadiness.tierMissingScenarioFields.map((field) => `scenario:${field}`),
      ...report.handoffReadiness.tierMissingOwnerFields.map((field) => `owner:${field}`),
    )
    return writeReport(report, resolvedOutput)
  }

  const unlockIssues = tierUnlockIssues(normalizedTier, flags)
  if (unlockIssues.length > 0) {
    report.status = 'blocked_missing_execution_unlock'
    report.blockers.push(...unlockIssues)
    return writeReport(report, resolvedOutput)
  }

  const resolvedRefs = await resolveExecutionRefs({ handoff, scenarioId, tier: normalizedTier })
  report.resolvedRefs = Object.fromEntries(Object.entries(resolvedRefs.resolved).map(([key, value]) => [
    key,
    {
      status: value.status,
      ref: value.ref,
      path: value.path ?? null,
      key: value.key ?? null,
      valueWrittenToReport: false,
    },
  ]))
  if (resolvedRefs.issues.length > 0) {
    report.status = 'blocked_unresolvable_execution_refs'
    report.blockers.push(...resolvedRefs.issues)
    return writeReport(report, resolvedOutput)
  }

  const evidence = await validateEvidenceContract({
    scenario: matrixScenario,
    tier: normalizedTier,
    evidenceRoot: resolvedEvidenceRoot,
    explicitEvidenceFiles: evidenceFiles,
  })
  report.checks.push({
    id: 'scenario-evidence-contract',
    status: evidence.status,
    evidenceRoot: rel(resolvedEvidenceRoot),
    artifactResults: evidence.artifacts,
    missingArtifacts: evidence.missingArtifacts,
    missingMetadata: evidence.missingMetadata,
    nonPassingJson: evidence.nonPassingJson,
    tierEnvironmentMatched: evidence.tierEnvironmentMatched,
    executionEvidenceCount: evidence.executionEvidenceCount,
    jsonDocumentCount: evidence.jsonDocumentCount,
  })

  report.commandsExecuted = evidence.executionEvidenceCount

  if (evidence.status === 'pass') {
    report.status = 'passed'
    report.canCloseScenarioTier = true
    report.closesRealEnvironmentTier = true
  } else {
    report.status = 'blocked_required_scenario_evidence_missing'
    report.blockers.push(
      ...evidence.missingArtifacts.map((item) => `artifact:${item}`),
      ...evidence.missingMetadata.map((item) => `metadata:${item}`),
      ...evidence.nonPassingJson.map((item) => `evidence_status:${item}`),
      ...(evidence.tierEnvironmentMatched ? [] : [`environment:${normalizedTier}:missing_or_mismatched`]),
      ...(evidence.executionEvidenceCount > 0 ? [] : ['execution:commandsExecuted=0']),
    )
  }

  return writeReport(report, resolvedOutput)
}

export async function mainForScenario(scenarioId) {
  const tier = argValue('--tier', 'staging')
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const handoffFile = resolve(argValue('--handoff-file', join(releaseDir, 'v14241-real-env-handoff.candidate.json')))
  const matrixFile = resolve(argValue('--matrix-file', join(releaseDir, 'v14241-real-env-uat-staging-live-matrix.json')))
  const output = resolve(argValue('--output', join(releaseDir, scenarioConfig(scenarioId).outputFile)))
  const artifactRoot = resolve(argValue('--artifact-root', join(releaseDir, 'v14241-real-env-evidence', String(tier).toLowerCase())))
  const evidenceRoot = resolve(argValue('--evidence-root', artifactRoot))
  const flags = {
    '--include-uat': hasFlag('--include-uat'),
    '--include-staging': hasFlag('--include-staging'),
    '--include-solo-live': hasFlag('--include-solo-live'),
    '--include-live': hasFlag('--include-live'),
    '--confirm-real-handoff': hasFlag('--confirm-real-handoff'),
    '--allow-write': hasFlag('--allow-write'),
  }
  const report = await runRealUatScenarioContract({
    scenarioId,
    tier,
    handoffFile,
    matrixFile,
    releaseDir,
    output,
    artifactRoot,
    evidenceRoot,
    evidenceFiles: argValues('--evidence-file'),
    flags,
  })
  console.log(JSON.stringify({
    status: report.status,
    scenarioId: report.scenarioId,
    tier: report.tier,
    commandsExecuted: report.commandsExecuted,
    canCloseScenarioTier: report.canCloseScenarioTier,
    blockers: report.blockers,
    output: rel(output),
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scenarioId = argValue('--scenario-id', null)
  if (!scenarioId) {
    console.error(`Missing --scenario-id. Expected one of ${Object.keys(SUPPORTED_SCENARIOS).join(', ')}`)
    process.exit(1)
  }
  mainForScenario(scenarioId).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
