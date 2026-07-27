#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateHandoffReadiness } from './build-v14241-real-env-handoff-pack.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.operator-fill-template.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultDraftOutput = join(defaultReleaseDir, 'v14241-real-env-handoff.staging-ref-draft.json')
const defaultRefsEnvTemplate = join(defaultReleaseDir, 'v14241-real-env-staging-operator.refs.env.template')
const defaultReportJson = join(defaultReleaseDir, 'v14241-real-env-staging-ref-draft-package.json')
const defaultReportMd = join(defaultReleaseDir, 'v14241-real-env-staging-ref-draft-package.md')

const TIER = 'staging'
const STAGING_ENV_REF_FIELDS = [
  'apiBaseUrlRef',
  'clientBaseUrlRef',
  'credentialRefs.testUserEmailRef',
  'credentialRefs.testUserPasswordRef',
  'deploymentVersionRef',
  'writeApprovalRef',
  'cleanupOwner',
  'retentionOwner',
  'anonPolicyRef',
  'roleAccountRefs.company_admin',
  'roleAccountRefs.project_admin',
  'roleAccountRefs.editor',
  'roleAccountRefs.outsider',
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

function clone(value) {
  return JSON.parse(JSON.stringify(value))
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

function hasUsableValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value !== 'string') return true
  const normalized = value.trim()
  return Boolean(normalized) && !/^<.*>$/.test(normalized)
}

function envRef(envTemplatePath, key) {
  return `env://${rel(resolve(envTemplatePath))}#${key}`
}

function ownerRef(owner) {
  return `owner-ref://v14241/staging/${owner}`
}

function normalizeKeyPart(value) {
  return String(value)
    .replace(/^REAL-UAT-/, 'REAL_UAT_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

function commonScenarioEnvKey(field) {
  if (field === 'targetRefs.companyIdRef') return 'V14241_STAGING_COMPANY_ID'
  if (field === 'targetRefs.projectIdRef') return 'V14241_STAGING_PROJECT_ID'
  if (field === 'actorRefs.primaryTesterRef') return 'V14241_STAGING_PRIMARY_TESTER_REF'
  return null
}

function environmentEnvKey(field) {
  const mapped = {
    deploymentVersionRef: 'V14241_STAGING_DEPLOYMENT_VERSION_REF',
    writeApprovalRef: 'V14241_STAGING_WRITE_APPROVAL_REF',
    cleanupOwner: 'V14241_STAGING_CLEANUP_OWNER_REF',
    retentionOwner: 'V14241_STAGING_RETENTION_OWNER_REF',
    anonPolicyRef: 'V14241_STAGING_ANON_POLICY_REF',
    apiBaseUrlRef: 'V14241_STAGING_API_BASE_URL',
    clientBaseUrlRef: 'V14241_STAGING_CLIENT_BASE_URL',
    'credentialRefs.testUserEmailRef': 'V14241_STAGING_TEST_USER_EMAIL_REF',
    'credentialRefs.testUserPasswordRef': 'V14241_STAGING_TEST_USER_PASSWORD_REF',
    'roleAccountRefs.project_admin': 'V14241_STAGING_PROJECT_ADMIN_ACCOUNT_REF',
    'roleAccountRefs.editor': 'V14241_STAGING_EDITOR_ACCOUNT_REF',
    'roleAccountRefs.outsider': 'V14241_STAGING_OUTSIDER_ACCOUNT_REF',
    'roleAccountRefs.company_admin': 'V14241_STAGING_COMPANY_ADMIN_ACCOUNT_REF',
  }
  return mapped[field] ?? `V14241_STAGING_ENV_${normalizeKeyPart(field)}`
}

function scenarioEnvKey(scenarioId, field) {
  return commonScenarioEnvKey(field) ?? `V14241_STAGING_${normalizeKeyPart(scenarioId)}_${normalizeKeyPart(field)}`
}

function pushEnvKey(keys, key, description) {
  if (!keys.has(key)) keys.set(key, description)
}

function fillEnvironment({ draft, fields, envTemplatePath, envKeys, operations }) {
  for (const field of fields) {
    const path = `environmentTargets.${TIER}.${field}`
    const key = environmentEnvKey(field)
    const value = envRef(envTemplatePath, key)
    setByPath(draft, path, value)
    pushEnvKey(envKeys, key, `environmentTargets.${TIER}.${field}`)
    operations.push({ op: 'replace', path, valueKind: 'env-ref', envKey: key })
  }
}

function fillScenarioTier({ draft, scenario, tierReadiness, envTemplatePath, envKeys, operations }) {
  const tierPrefix = `scenarios.${scenario.id}.tiers.${TIER}`
  for (const field of tierReadiness.missingScenarioFields ?? []) {
    const path = `${tierPrefix}.${field}`
    if (hasUsableValue(getByPath(draft, path))) continue
    let value
    let valueKind
    let envKey = null
    if (field === 'cleanupRef') {
      value = `cleanup-ref://v14241/staging/${scenario.id}`
      valueKind = 'cleanup-ref'
    } else {
      envKey = scenarioEnvKey(scenario.id, field)
      value = envRef(envTemplatePath, envKey)
      valueKind = 'env-ref'
      pushEnvKey(envKeys, envKey, `${tierPrefix}.${field}`)
    }
    setByPath(draft, path, value)
    operations.push({ op: 'replace', path, valueKind, ...(envKey ? { envKey } : {}) })
  }
  const scenarioPrefix = `scenarios.${scenario.id}`
  for (const field of tierReadiness.missingOwnerFields ?? []) {
    const owner = field.replace(/^evidenceOwners\./, '')
    const path = `${scenarioPrefix}.evidenceOwners.${owner}`
    if (hasUsableValue(getByPath(draft, path))) continue
    setByPath(draft, path, ownerRef(owner))
    operations.push({ op: 'replace', path, valueKind: 'owner-ref', owner })
  }
}

function selectedTierReadiness(readiness) {
  return (readiness.scenarios ?? []).map((scenario) => ({
    scenario,
    tier: (scenario.tiers ?? []).find((tier) => tier.name === TIER),
  })).filter((item) => item.tier)
}

function summarizeSelected(readiness) {
  const selected = selectedTierReadiness(readiness)
  const ready = selected.filter((item) => item.tier.readyToRun)
  return {
    selectedTier: TIER,
    selectedReadyTierCount: ready.length,
    selectedTierCount: selected.length,
    selectedReadyScenarioCount: ready.length,
    selectedScenarioCount: selected.length,
  }
}

function renderEnvTemplate(envKeys) {
  const lines = [
    '# v1.4.24.1 staging real-environment operator refs',
    '# Fill values outside Git review before running staging scenario attempts.',
    '# Values may be IDs, owner/approval refs, or external secret refs; do not paste raw JWTs, passwords, database URLs, service-role keys, or migration URLs.',
    '',
  ]
  for (const [key, description] of [...envKeys.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`# ${description}`)
    lines.push(`${key}=`)
    lines.push('')
  }
  return lines.join('\n')
}

function assertNoSecretLikeText(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_v14241_staging_handoff_ref_draft_with_secret_like_text')
  }
}

export async function buildStagingHandoffRefDraft({
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  draftOutput = defaultDraftOutput,
  refsEnvTemplate = defaultRefsEnvTemplate,
  reportJson = defaultReportJson,
  reportMd = defaultReportMd,
  now = new Date(),
} = {}) {
  const [handoff, matrix] = await Promise.all([readJson(resolve(handoffFile)), readJson(resolve(matrixFile))])
  const beforeReadiness = evaluateHandoffReadiness({ handoff, matrix, now })
  const draft = clone(handoff)
  draft.status = 'staging_ref_draft_operator_values_required'
  draft.generatedAt = now.toISOString()
  draft.sourceHandoffFile = rel(resolve(handoffFile))
  draft.stagingRefDraftBoundary = {
    templateOnly: true,
    commandsExecuted: 0,
    doesNotAuthorizeExecution: true,
    doesNotMutateEnvironment: true,
    refsEnvTemplate: rel(resolve(refsEnvTemplate)),
  }

  const envKeys = new Map()
  const operations = []
  const selectedBefore = selectedTierReadiness(beforeReadiness)
  const environmentMissing = [...new Set(selectedBefore.flatMap((item) => item.tier.missingEnvironmentFields ?? []))]
  const environmentFields = [...new Set([...STAGING_ENV_REF_FIELDS, ...environmentMissing])]
  fillEnvironment({
    draft,
    fields: environmentFields,
    envTemplatePath: refsEnvTemplate,
    envKeys,
    operations,
  })
  for (const item of selectedBefore) {
    fillScenarioTier({
      draft,
      scenario: item.scenario,
      tierReadiness: item.tier,
      envTemplatePath: refsEnvTemplate,
      envKeys,
      operations,
    })
  }

  const afterReadiness = evaluateHandoffReadiness({ handoff: draft, matrix, now })
  const report = {
    schemaVersion: 'workbuddy/v14241-staging-handoff-ref-draft-package/v1',
    generatedAt: now.toISOString(),
    status: 'staging_ref_draft_written_operator_values_required',
    sourceHandoffFile: rel(resolve(handoffFile)),
    matrixFile: rel(resolve(matrixFile)),
    draftHandoffFile: rel(resolve(draftOutput)),
    refsEnvTemplate: rel(resolve(refsEnvTemplate)),
    before: {
      fullMatrixReadyToExecute: beforeReadiness.readyToExecuteMatrix,
      fullMatrixReadyTierCount: beforeReadiness.readyTierCount,
      fullMatrixTierCount: beforeReadiness.tierCount,
      ...summarizeSelected(beforeReadiness),
    },
    afterDraft: {
      fullMatrixReadyToExecute: afterReadiness.readyToExecuteMatrix,
      fullMatrixReadyTierCount: afterReadiness.readyTierCount,
      fullMatrixTierCount: afterReadiness.tierCount,
      ...summarizeSelected(afterReadiness),
    },
    operationCount: operations.length,
    envKeyCount: envKeys.size,
    operations,
    executionBoundary: {
      draftOnly: true,
      commandsExecuted: 0,
      doesNotAuthorizeExecution: true,
      doesNotMutateEnvironment: true,
      selectedStagingReadinessOnly: true,
      envTemplateValuesRequiredBeforeExecution: true,
    },
    nextCommands: {
      fillRefsEnvTemplate: `Fill ${rel(resolve(refsEnvTemplate))} with real staging refs outside source control.`,
      attemptStagingRefResolution: `node project-testing/tools/run-v14241-real-env-scenario-attempts.mjs --tier staging --handoff-file ${rel(resolve(draftOutput))} --matrix-file ${rel(resolve(matrixFile))} --include-staging --confirm-real-handoff --allow-write`,
      refreshMatrixReport: `node project-testing/tools/run-v14241-real-env-uat-matrix.mjs --release-dir ${rel(dirname(resolve(draftOutput)))}`,
    },
  }
  assertNoSecretLikeText(draft)
  assertNoSecretLikeText(report)
  const envText = renderEnvTemplate(envKeys)
  assertNoSecretLikeText(envText)
  await mkdir(dirname(resolve(draftOutput)), { recursive: true })
  await mkdir(dirname(resolve(refsEnvTemplate)), { recursive: true })
  await writeFile(resolve(draftOutput), `${JSON.stringify(draft, null, 2)}\n`, 'utf8')
  await writeFile(resolve(refsEnvTemplate), envText, 'utf8')
  await writeFile(resolve(reportJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(resolve(reportMd), renderMarkdown(report), 'utf8')
  return { report, draft, draftOutput: resolve(draftOutput), refsEnvTemplate: resolve(refsEnvTemplate), reportJson: resolve(reportJson), reportMd: resolve(reportMd) }
}

export function renderMarkdown(report) {
  const lines = [
    '# v1.4.24.1 Staging Handoff Ref Draft Package',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Draft handoff: ${report.draftHandoffFile}`,
    `- Refs env template: ${report.refsEnvTemplate}`,
    `- Operations: ${report.operationCount}`,
    `- Env keys to fill: ${report.envKeyCount}`,
    '',
    '## Readiness Delta',
    '',
    `- Before selected staging ready tiers: ${report.before.selectedReadyTierCount}/${report.before.selectedTierCount}`,
    `- After draft selected staging ready tiers: ${report.afterDraft.selectedReadyTierCount}/${report.afterDraft.selectedTierCount}`,
    `- After draft full matrix ready tiers: ${report.afterDraft.fullMatrixReadyTierCount}/${report.afterDraft.fullMatrixTierCount}`,
    `- Full matrix ready to execute: ${report.afterDraft.fullMatrixReadyToExecute}`,
    '',
    '## Boundary',
    '',
    '- This is a ref draft only. It does not authorize execution and does not mutate any environment.',
    '- The generated refs env template has empty values. Fill it with real staging refs before attempting scenario execution.',
    '- UAT and live tiers remain unfilled; this draft only prepares the staging tier.',
    '',
    '## Next Commands',
    '',
    `- ${report.nextCommands.fillRefsEnvTemplate}`,
    `- ${report.nextCommands.attemptStagingRefResolution}`,
    `- ${report.nextCommands.refreshMatrixReport}`,
    '',
    '## Operations',
    '',
    '| Path | Value kind | Env key / owner |',
    '| --- | --- | --- |',
  ]
  for (const op of report.operations) {
    lines.push(`| ${op.path} | ${op.valueKind} | ${op.envKey ?? op.owner ?? ''} |`)
  }
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const handoffFile = resolve(argValue('--handoff-file', join(releaseDir, 'v14241-real-env-handoff.operator-fill-template.json')))
  const matrixFile = resolve(argValue('--matrix-file', join(releaseDir, 'v14241-real-env-uat-staging-live-matrix.json')))
  const draftOutput = resolve(argValue('--output', join(releaseDir, 'v14241-real-env-handoff.staging-ref-draft.json')))
  const refsEnvTemplate = resolve(argValue('--refs-env-template', join(releaseDir, 'v14241-real-env-staging-operator.refs.env.template')))
  const reportJson = resolve(argValue('--report-output', join(releaseDir, 'v14241-real-env-staging-ref-draft-package.json')))
  const reportMd = resolve(argValue('--md-output', join(releaseDir, 'v14241-real-env-staging-ref-draft-package.md')))
  const { report } = await buildStagingHandoffRefDraft({
    handoffFile,
    matrixFile,
    draftOutput,
    refsEnvTemplate,
    reportJson,
    reportMd,
  })
  console.log(JSON.stringify({
    status: report.status,
    beforeSelectedReadyTierCount: report.before.selectedReadyTierCount,
    afterDraftSelectedReadyTierCount: report.afterDraft.selectedReadyTierCount,
    selectedTierCount: report.afterDraft.selectedTierCount,
    fullMatrixReadyTierCount: report.afterDraft.fullMatrixReadyTierCount,
    fullMatrixTierCount: report.afterDraft.fullMatrixTierCount,
    envKeyCount: report.envKeyCount,
    operationCount: report.operationCount,
    outputs: [report.draftHandoffFile, report.refsEnvTemplate, rel(resolve(reportJson)), rel(resolve(reportMd))],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
