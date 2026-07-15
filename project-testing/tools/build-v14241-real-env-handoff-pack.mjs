#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultCandidateOutput = join(defaultReleaseDir, 'v14241-real-env-handoff.candidate.json')
const defaultReadinessOutput = join(defaultReleaseDir, 'v14241-real-env-handoff-readiness.json')
const defaultReadinessMarkdownOutput = join(defaultReleaseDir, 'v14241-real-env-handoff-readiness.md')

const ROLE_REFS = ['owner', 'company_admin', 'project_admin', 'editor', 'outsider', 'anon']

const TIER_ENV_REQUIREMENTS = {
  UAT: [
    'baseUrlRef',
    'deploymentVersionRef',
    'artifactRoot',
    'recordingOwner',
    'retentionOwner',
    'roleAccountRefs.owner',
    'roleAccountRefs.company_admin',
    'roleAccountRefs.project_admin',
    'roleAccountRefs.editor',
    'roleAccountRefs.outsider',
    'anonPolicyRef',
  ],
  staging: [
    'apiBaseUrlRef',
    'clientBaseUrlRef',
    'deploymentVersionRef',
    'artifactRoot',
    'writeApprovalRef',
    'cleanupOwner',
    'retentionOwner',
    'roleAccountRefs.company_admin',
    'roleAccountRefs.project_admin',
    'roleAccountRefs.editor',
    'roleAccountRefs.outsider',
    'anonPolicyRef',
  ],
  'solo-live': [
    'baseUrlRef',
    'deploymentVersionRef',
    'selfApprovalRef',
    'rollbackOwner',
    'monitoringOwner',
    'rollbackPlanRef',
    'monitoringPlanRef',
    'artifactRoot',
  ],
  live: [
    'baseUrlRef',
    'deploymentVersionRef',
    'liveHandoffDeclarationRef',
    'approvalRef',
    'rollbackOwner',
    'monitoringOwner',
    'retentionPath',
    'artifactRoot',
  ],
}

const TIER_SCENARIO_REQUIREMENTS = {
  UAT: ['targetRefs.companyIdRef', 'targetRefs.projectIdRef', 'actorRefs.primaryTesterRef'],
  staging: ['targetRefs.companyIdRef', 'targetRefs.projectIdRef', 'actorRefs.primaryTesterRef', 'cleanupRef'],
  'solo-live': ['targetRefs.companyIdRef', 'targetRefs.projectIdRef', 'actorRefs.primaryTesterRef', 'rollbackRef', 'monitoringRef'],
  live: ['targetRefs.companyIdRef', 'targetRefs.projectIdRef', 'actorRefs.primaryTesterRef', 'approvalRef', 'rollbackRef', 'monitoringRef'],
}

const SCENARIO_EXTRA_REQUIREMENTS = {
  'REAL-UAT-01': ['targetRefs.disposableCompanyRef', 'expectedEvidenceRefs.auditRef'],
  'REAL-UAT-02': ['actorRefs.inviterRef', 'actorRefs.invitedMemberRef', 'targetRefs.invitationChannelRef'],
  'REAL-UAT-03': ['targetRefs.secondCompanyRef', 'targetRefs.secondProjectRef', 'actorRefs.roleMatrixAccountRefsRef'],
  'REAL-UAT-04': ['targetRefs.baselineRef', 'targetRefs.publicationRef', 'actorRefs.planOwnerRef', 'rollbackRef'],
  'REAL-UAT-05': ['targetRefs.largeProjectRef', 'targetRefs.criticalPathReadbackRef', 'expectedEvidenceRefs.performanceThresholdRef'],
  'REAL-UAT-06': ['targetRefs.monthlyPlanRef', 'actorRefs.approverRef', 'expectedEvidenceRefs.stateMachineRef'],
  'REAL-UAT-07': ['targetRefs.documentPackageRef', 'targetRefs.storageBucketRef', 'expectedEvidenceRefs.retentionPolicyRef'],
  'REAL-UAT-08': ['targetRefs.materialRiskIssueSeedRef', 'actorRefs.responsibleUserRef', 'expectedEvidenceRefs.notificationChannelRef'],
  'REAL-UAT-09': ['targetRefs.snapshotRef', 'targetRefs.metricRegistryRef', 'expectedEvidenceRefs.exportSampleRef'],
  'REAL-UAT-10': ['targetRefs.importFileSetRef', 'targetRefs.exportValidatorRef', 'expectedEvidenceRefs.permissionNegativeRef'],
  'REAL-UAT-11': ['targetRefs.largeDatasetRef', 'targetRefs.loadWindowRef', 'expectedEvidenceRefs.queryLogRef'],
  'REAL-UAT-12': ['targetRefs.securityWindowRef', 'targetRefs.payloadSetRef', 'expectedEvidenceRefs.headerReadbackRef'],
  'REAL-UAT-13': ['targetRefs.releaseVersionRef', 'targetRefs.healthcheckUrlRef', 'rollbackRef'],
  'REAL-UAT-14': ['targetRefs.backupRef', 'targetRefs.restoreDrillDbRef', 'targetRefs.migrationLedgerRef', 'targetRefs.oldObjectDispositionRef'],
  'REAL-UAT-15': ['targetRefs.alertRecipientRef', 'targetRefs.onCallScheduleRef', 'targetRefs.runbookRef', 'actorRefs.incidentCommanderRef'],
  'REAL-UAT-16': ['targetRefs.ticketRef', 'actorRefs.supportAccountRef', 'targetRefs.auditExportRef', 'targetRefs.compensationToolRef'],
}

const SECRET_VALUE_PATTERNS = [
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /supabase_(?:service|anon)?_?key/i,
  /service_role/i,
]

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

async function readTextIfPresent(path, fallback = '') {
  if (!existsSync(path)) return fallback
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value !== 'string') return true
  const normalized = value.trim()
  if (!normalized) return false
  if (/^<.*>$/.test(normalized)) return false
  if (/^(placeholder|changeme|todo|tbd|example|sample|dummy)$/i.test(normalized)) return false
  return true
}

function getByPath(value, dottedPath) {
  let current = value
  for (const part of dottedPath.split('.')) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined
    current = current[part]
  }
  return current
}

function setByPath(target, dottedPath, value) {
  const parts = dottedPath.split('.')
  let current = target
  for (const part of parts.slice(0, -1)) {
    current[part] ??= {}
    current = current[part]
  }
  current[parts.at(-1)] = value
}

async function parseEnvFile(path) {
  const absolute = resolve(path)
  const text = await readTextIfPresent(absolute)
  const keys = new Set()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const key = line.slice(0, line.indexOf('=')).trim()
    const value = line.slice(line.indexOf('=') + 1).trim()
    if (hasValue(value)) keys.add(key)
  }
  return {
    path: rel(absolute),
    exists: existsSync(absolute),
    keys,
  }
}

function envRef(envInfo, key) {
  return envInfo?.keys?.has(key) ? `env://${envInfo.path}#${key}` : ''
}

function buildEnvironmentTargets({ releaseDir, stagingEnv }) {
  return {
    UAT: {
      baseUrlRef: '',
      deploymentVersionRef: '',
      artifactRoot: `${rel(releaseDir)}/v14241-real-env-evidence/uat`,
      recordingOwner: '',
      retentionOwner: '',
      roleAccountRefs: Object.fromEntries(ROLE_REFS.filter((role) => role !== 'anon').map((role) => [role, ''])),
      anonPolicyRef: '',
    },
    staging: {
      apiBaseUrlRef: envRef(stagingEnv, 'API_BASE_URL'),
      clientBaseUrlRef: envRef(stagingEnv, 'CLIENT_BASE_URL'),
      deploymentVersionRef: '',
      artifactRoot: `${rel(releaseDir)}/v14241-real-env-evidence/staging`,
      writeApprovalRef: '',
      cleanupOwner: '',
      retentionOwner: '',
      roleAccountRefs: {
        company_admin: envRef(stagingEnv, 'TEST_USER_EMAIL'),
        project_admin: '',
        editor: '',
        outsider: '',
      },
      anonPolicyRef: '',
      credentialRefs: {
        testUserEmailRef: envRef(stagingEnv, 'TEST_USER_EMAIL'),
        testUserPasswordRef: envRef(stagingEnv, 'TEST_USER_PASSWORD'),
      },
    },
    'solo-live': {
      baseUrlRef: '',
      deploymentVersionRef: '',
      selfApprovalRef: '',
      rollbackOwner: '',
      monitoringOwner: '',
      rollbackPlanRef: '',
      monitoringPlanRef: '',
      artifactRoot: `${rel(releaseDir)}/v14241-real-env-evidence/solo-live`,
    },
    live: {
      baseUrlRef: '',
      deploymentVersionRef: '',
      liveHandoffDeclarationRef: '',
      approvalRef: '',
      rollbackOwner: '',
      monitoringOwner: '',
      retentionPath: '',
      artifactRoot: `${rel(releaseDir)}/v14241-real-env-evidence/live`,
    },
  }
}

function buildScenarioTierTemplate({ scenario, tierName }) {
  const value = {
    targetRefs: {
      companyIdRef: '',
      projectIdRef: '',
    },
    actorRefs: {
      primaryTesterRef: '',
    },
    expectedEvidenceRefs: Object.fromEntries(
      (scenario.evidenceContract?.requiredArtifacts ?? []).map((artifact) => [artifact, '']),
    ),
    cleanupRef: '',
    approvalRef: '',
    rollbackRef: '',
    monitoringRef: '',
  }
  for (const field of SCENARIO_EXTRA_REQUIREMENTS[scenario.id] ?? []) {
    if (getByPath(value, field) === undefined) {
      setByPath(value, field, '')
    }
  }
  value.tier = tierName
  return value
}

function buildScenarioTemplate(scenario) {
  return {
    id: scenario.id,
    title: scenario.title,
    priority: scenario.priority,
    evidenceOwners: Object.fromEntries((scenario.evidenceOwners ?? []).map((owner) => [owner, ''])),
    tiers: Object.fromEntries(
      (scenario.tiers ?? []).map((tier) => [tier.name, buildScenarioTierTemplate({ scenario, tierName: tier.name })]),
    ),
  }
}

export async function buildHandoffPack({
  matrixFile = defaultMatrixFile,
  releaseDir = defaultReleaseDir,
  stagingEnvFile = join(repoRoot, 'deploy', 'env', 'staging.env'),
  now = new Date(),
} = {}) {
  const absoluteMatrixFile = resolve(matrixFile)
  const absoluteReleaseDir = resolve(releaseDir)
  const matrix = await readJson(absoluteMatrixFile)
  const stagingEnv = await parseEnvFile(stagingEnvFile)
  const handoff = {
    schemaVersion: 'workbuddy/v14241-real-env-handoff/v1',
    generatedAt: now.toISOString(),
    matrixFile: rel(absoluteMatrixFile),
    releaseDir: rel(absoluteReleaseDir),
    status: 'candidate_not_authorized',
    executionBoundary: {
      planningOnly: true,
      commandsExecuted: 0,
      liveMutation: false,
      dbMutation: false,
      stagingMutation: false,
      rawSecretsForbidden: true,
      note: 'This candidate handoff records references only. It does not authorize UAT, staging, live, DB, security-negative, or destructive execution.',
    },
    environmentTargets: buildEnvironmentTargets({ releaseDir: absoluteReleaseDir, stagingEnv }),
    scenarios: Object.fromEntries((matrix.scenarios ?? []).map((scenario) => [scenario.id, buildScenarioTemplate(scenario)])),
  }
  const readiness = evaluateHandoffReadiness({ handoff, matrix, now })
  return { handoff, readiness }
}

function findSecretLeaks(value, path = '') {
  const leaks = []
  if (typeof value === 'string') {
    const key = path.split('.').at(-1) ?? ''
    const nameLooksSecret = /(token|password|secret|serviceRoleKey|databaseUrl|connectionString)$/i.test(key)
      && !/(Ref|Path|Owner|Policy)$/i.test(key)
    const valueLooksSecret = SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))
    if (nameLooksSecret || valueLooksSecret) {
      leaks.push({ path, reason: nameLooksSecret ? 'secret-like field name without Ref suffix' : 'secret-like value' })
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => {
      leaks.push(...findSecretLeaks(item, `${path}.${index}`.replace(/^\./, '')))
    })
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      leaks.push(...findSecretLeaks(child, `${path}.${key}`.replace(/^\./, '')))
    }
  }
  return leaks
}

function evaluateTierReadiness({ handoff, scenario, tierName }) {
  const envTarget = handoff.environmentTargets?.[tierName] ?? {}
  const scenarioTier = handoff.scenarios?.[scenario.id]?.tiers?.[tierName] ?? {}
  const envMissing = (TIER_ENV_REQUIREMENTS[tierName] ?? []).filter((field) => !hasValue(getByPath(envTarget, field)))
  const scenarioFields = [
    ...(TIER_SCENARIO_REQUIREMENTS[tierName] ?? []),
    ...(SCENARIO_EXTRA_REQUIREMENTS[scenario.id] ?? []),
  ]
  const scenarioMissing = scenarioFields.filter((field) => !hasValue(getByPath(scenarioTier, field)))
  const ownerMissing = (scenario.evidenceOwners ?? [])
    .map((owner) => `evidenceOwners.${owner}`)
    .filter((field) => !hasValue(getByPath(handoff.scenarios?.[scenario.id] ?? {}, field)))
  return {
    name: tierName,
    readyToRun: envMissing.length === 0 && scenarioMissing.length === 0 && ownerMissing.length === 0,
    missingEnvironmentFields: envMissing,
    missingScenarioFields: scenarioMissing,
    missingOwnerFields: ownerMissing,
  }
}

export function evaluateHandoffReadiness({ handoff, matrix, now = new Date() } = {}) {
  const secretLeaks = findSecretLeaks(handoff)
  const scenarios = (matrix.scenarios ?? []).map((scenario) => {
    const tiers = (scenario.tiers ?? []).map((tier) => evaluateTierReadiness({ handoff, scenario, tierName: tier.name }))
    return {
      id: scenario.id,
      title: scenario.title,
      readyToRun: tiers.every((tier) => tier.readyToRun),
      tiers,
    }
  })
  const readyScenarioCount = scenarios.filter((scenario) => scenario.readyToRun).length
  const totalTierCount = scenarios.reduce((count, scenario) => count + scenario.tiers.length, 0)
  const readyTierCount = scenarios.flatMap((scenario) => scenario.tiers).filter((tier) => tier.readyToRun).length
  const status = secretLeaks.length === 0 && readyScenarioCount === scenarios.length ? 'pass' : 'fail'
  return {
    schemaVersion: 'workbuddy/v14241-real-env-handoff-readiness/v1',
    evaluatedAt: now.toISOString(),
    status,
    readyToExecuteMatrix: status === 'pass',
    scenarioCount: scenarios.length,
    readyScenarioCount,
    blockedScenarioCount: scenarios.length - readyScenarioCount,
    tierCount: totalTierCount,
    readyTierCount,
    blockedTierCount: totalTierCount - readyTierCount,
    secretLeakCount: secretLeaks.length,
    secretLeaks,
    scenarios,
    decision: {
      mayExecuteWhen: 'All 16 scenarios have ready UAT/staging/solo-live/live tier inputs, owner refs, target refs, approval/rollback/monitoring/cleanup refs, and no inline secrets.',
      mustNotExecuteWhen: 'Any tier is missing target refs, role/account refs, self-approval/live approval, rollback/cleanup/monitoring refs, artifact roots, deployment refs, or contains inline secrets.',
    },
  }
}

export function renderReadinessMarkdown(readiness) {
  const lines = [
    '# v1.4.24.1 Real Environment Matrix Handoff Readiness',
    '',
    `- Evaluated at: ${readiness.evaluatedAt}`,
    `- Status: ${readiness.status}`,
    `- Ready to execute matrix: ${readiness.readyToExecuteMatrix}`,
    `- Ready scenarios: ${readiness.readyScenarioCount}/${readiness.scenarioCount}`,
    `- Ready tiers: ${readiness.readyTierCount}/${readiness.tierCount}`,
    `- Secret leaks: ${readiness.secretLeakCount}`,
    '',
    '## Scenario Readiness',
    '',
    '| ID | Ready | UAT | staging | solo-live | live |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  for (const scenario of readiness.scenarios) {
    const tierMap = Object.fromEntries(scenario.tiers.map((tier) => [tier.name, tier.readyToRun ? 'ready' : 'blocked']))
    lines.push(`| ${scenario.id} | ${scenario.readyToRun ? 'ready' : 'blocked'} | ${tierMap.UAT ?? 'n/a'} | ${tierMap.staging ?? 'n/a'} | ${tierMap['solo-live'] ?? 'n/a'} | ${tierMap.live ?? 'n/a'} |`)
  }
  lines.push('', '## Missing Fields', '')
  for (const scenario of readiness.scenarios) {
    if (scenario.readyToRun) continue
    lines.push(`### ${scenario.id} ${scenario.title}`, '')
    for (const tier of scenario.tiers) {
      if (tier.readyToRun) continue
      lines.push(`- ${tier.name}`)
      if (tier.missingEnvironmentFields.length > 0) lines.push(`  - environment: ${tier.missingEnvironmentFields.join(', ')}`)
      if (tier.missingScenarioFields.length > 0) lines.push(`  - scenario: ${tier.missingScenarioFields.join(', ')}`)
      if (tier.missingOwnerFields.length > 0) lines.push(`  - owners: ${tier.missingOwnerFields.join(', ')}`)
    }
    lines.push('')
  }
  lines.push('## Decision', '')
  lines.push(`- May execute when: ${readiness.decision.mayExecuteWhen}`)
  lines.push(`- Must not execute when: ${readiness.decision.mustNotExecuteWhen}`)
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const matrixFile = resolve(argValue('--matrix-file', join(releaseDir, 'v14241-real-env-uat-staging-live-matrix.json')))
  const candidateOutput = resolve(argValue('--output', defaultCandidateOutput))
  const readinessOutput = resolve(argValue('--readiness-output', defaultReadinessOutput))
  const readinessMarkdownOutput = resolve(argValue('--readiness-md-output', defaultReadinessMarkdownOutput))
  const { handoff, readiness } = await buildHandoffPack({ matrixFile, releaseDir })
  await mkdir(dirname(candidateOutput), { recursive: true })
  await mkdir(dirname(readinessOutput), { recursive: true })
  await writeFile(candidateOutput, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8')
  await writeFile(readinessOutput, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8')
  await writeFile(readinessMarkdownOutput, renderReadinessMarkdown(readiness), 'utf8')
  console.log(JSON.stringify({
    status: readiness.status,
    readyToExecuteMatrix: readiness.readyToExecuteMatrix,
    readyScenarioCount: readiness.readyScenarioCount,
    scenarioCount: readiness.scenarioCount,
    readyTierCount: readiness.readyTierCount,
    tierCount: readiness.tierCount,
    outputs: [rel(candidateOutput), rel(readinessOutput), rel(readinessMarkdownOutput)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
