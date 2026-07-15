#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateHandoffReadiness } from './build-v14241-real-env-handoff-pack.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.operator-fill-template.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')

const VALID_TIERS = ['UAT', 'staging', 'solo-live', 'live']

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
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

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeSelectedTiers(value, allTiers = false) {
  if (allTiers) return VALID_TIERS
  const raw = String(value || 'staging').split(',').map((item) => item.trim()).filter(Boolean)
  const tiers = raw.map((tier) => {
    if (tier.toLowerCase() === 'uat') return 'UAT'
    if (tier.toLowerCase() === 'staging') return 'staging'
    if (tier.toLowerCase() === 'solo-live') return 'solo-live'
    if (tier.toLowerCase() === 'live') return 'live'
    throw new Error(`Unsupported tier: ${tier}. Expected UAT, staging, solo-live, live, or --all-tiers.`)
  })
  return [...new Set(tiers)]
}

function countFields(items, key) {
  const counts = {}
  for (const item of items) {
    for (const field of item[key] ?? []) counts[field] = (counts[field] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([field, count]) => ({ field, count }))
}

function presentFieldPaths(value, prefix = '') {
  const paths = []
  if (!value || typeof value !== 'object') return paths
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      paths.push(...presentFieldPaths(child, path))
    } else if (child !== null && child !== undefined && String(child).trim() && !/^<.*>$/.test(String(child).trim())) {
      paths.push(path)
    }
  }
  return paths.sort()
}

function scenarioById(matrix) {
  return new Map(toArray(matrix.scenarios).map((scenario) => [scenario.id, scenario]))
}

function selectedTierItems(readiness, selectedTiers) {
  return toArray(readiness.scenarios).flatMap((scenario) => {
    return toArray(scenario.tiers)
      .filter((tier) => selectedTiers.includes(tier.name))
      .map((tier) => ({ scenario, tier }))
  })
}

function fillPathsForTier({ scenario, tier, matrixScenario }) {
  const scenarioPrefix = `scenarios.${scenario.id}.tiers.${tier.name}`
  const ownerPrefix = `scenarios.${scenario.id}.evidenceOwners`
  return {
    environment: (tier.missingEnvironmentFields ?? []).map((field) => `environmentTargets.${tier.name}.${field}`),
    scenario: (tier.missingScenarioFields ?? []).map((field) => `${scenarioPrefix}.${field}`),
    owners: (tier.missingOwnerFields ?? []).map((field) => `${ownerPrefix}.${field.replace(/^evidenceOwners\./, '')}`),
    requiredArtifacts: matrixScenario?.evidenceContract?.requiredArtifacts ?? [],
  }
}

function buildTierSummary({ handoff, matrix, readiness, selectedTiers }) {
  const byId = scenarioById(matrix)
  const selected = selectedTierItems(readiness, selectedTiers)
  return selected.map(({ scenario, tier }) => {
    const matrixScenario = byId.get(scenario.id)
    const paths = fillPathsForTier({ scenario, tier, matrixScenario })
    return {
      id: scenario.id,
      title: scenario.title,
      tier: tier.name,
      readyToRun: tier.readyToRun === true,
      missingEnvironmentFields: tier.missingEnvironmentFields ?? [],
      missingScenarioFields: tier.missingScenarioFields ?? [],
      missingOwnerFields: tier.missingOwnerFields ?? [],
      fillPaths: {
        environment: paths.environment,
        scenario: paths.scenario,
        owners: paths.owners,
      },
      requiredArtifacts: paths.requiredArtifacts,
      presentScenarioFields: presentFieldPaths(handoff.scenarios?.[scenario.id]?.tiers?.[tier.name] ?? {}),
      presentOwnerFields: presentFieldPaths(handoff.scenarios?.[scenario.id]?.evidenceOwners ?? {}).map((field) => `evidenceOwners.${field}`),
    }
  })
}

function buildReport({
  handoff,
  matrix,
  readiness,
  selectedTiers,
  handoffFile,
  matrixFile,
  releaseDir,
  now,
}) {
  const tiers = buildTierSummary({ handoff, matrix, readiness, selectedTiers })
  const blocked = tiers.filter((tier) => !tier.readyToRun)
  const readyTierCount = tiers.length - blocked.length
  const selectedScenarioIds = [...new Set(tiers.map((tier) => tier.id))]
  const readyScenarioCount = selectedScenarioIds.filter((id) => {
    const scenarioTiers = tiers.filter((tier) => tier.id === id)
    return scenarioTiers.length > 0 && scenarioTiers.every((tier) => tier.readyToRun)
  }).length
  const environmentTargets = selectedTiers.map((tier) => ({
    tier,
    presentFields: presentFieldPaths(handoff.environmentTargets?.[tier] ?? {}),
    missingFields: [...new Set(blocked.filter((item) => item.tier === tier).flatMap((item) => item.missingEnvironmentFields))].sort(),
  }))
  const report = {
    schemaVersion: 'workbuddy/v14241-real-env-handoff-gap-summary/v1',
    generatedAt: now.toISOString(),
    status: blocked.length === 0 ? 'selected_tiers_handoff_ready' : 'handoff_inputs_required',
    selectedTiers,
    releaseDir: rel(resolve(releaseDir)),
    handoffFile: rel(resolve(handoffFile)),
    matrixFile: rel(resolve(matrixFile)),
    readiness: {
      sourceStatus: readiness.status,
      fullMatrixReadyToExecute: readiness.readyToExecuteMatrix,
      fullMatrixReadyTierCount: readiness.readyTierCount,
      fullMatrixTierCount: readiness.tierCount,
      selectedReadyTierCount: readyTierCount,
      selectedTierCount: tiers.length,
      selectedReadyScenarioCount: readyScenarioCount,
      selectedScenarioCount: selectedScenarioIds.length,
      secretLeakCount: readiness.secretLeakCount,
    },
    environmentTargets,
    groupedMissingFields: {
      environment: countFields(blocked, 'missingEnvironmentFields'),
      scenario: countFields(blocked, 'missingScenarioFields'),
      owners: countFields(blocked, 'missingOwnerFields'),
    },
    tiers,
    nextCommands: {
      checkHandoff: `node project-testing/tools/check-v14241-real-env-handoff-file.mjs --handoff-file ${rel(resolve(handoffFile))} --matrix-file ${rel(resolve(matrixFile))}`,
      attemptSelectedTier: selectedTiers.length === 1
        ? `node project-testing/tools/run-v14241-real-env-scenario-attempts.mjs --tier ${selectedTiers[0]} --handoff-file ${rel(resolve(handoffFile))} --matrix-file ${rel(resolve(matrixFile))} --include-${selectedTiers[0].toLowerCase()} --confirm-real-handoff --allow-write`
        : 'Run one tier at a time after its selectedReadyTierCount equals selectedTierCount.',
      refreshMatrixReport: `node project-testing/tools/run-v14241-real-env-uat-matrix.mjs --release-dir ${rel(resolve(releaseDir))}`,
      refreshGapSummary: `node project-testing/tools/summarize-v14241-real-env-execution-gaps.mjs --release-dir ${rel(resolve(releaseDir))}`,
    },
    executionBoundary: {
      readOnly: true,
      commandsExecuted: 0,
      doesNotAuthorizeExecution: true,
      doesNotMutateEnvironment: true,
      secretValuesOmitted: true,
      supportOnlyDoesNotCloseScenarioTier: true,
    },
  }
  assertNoSecretLikeText(report)
  return report
}

function assertNoSecretLikeText(report) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_v14241_handoff_gap_summary_with_secret_like_text')
  }
}

export async function summarizeHandoffGaps({
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  releaseDir = defaultReleaseDir,
  selectedTiers = ['staging'],
  outputJson = null,
  outputMd = null,
  now = new Date(),
} = {}) {
  const resolvedReleaseDir = resolve(releaseDir)
  const [handoff, matrix] = await Promise.all([readJson(resolve(handoffFile)), readJson(resolve(matrixFile))])
  const readiness = evaluateHandoffReadiness({ handoff, matrix, now })
  const report = buildReport({
    handoff,
    matrix,
    readiness,
    selectedTiers,
    handoffFile,
    matrixFile,
    releaseDir: resolvedReleaseDir,
    now,
  })
  const suffix = selectedTiers.length === 1 ? selectedTiers[0].toLowerCase() : 'selected'
  const jsonPath = resolve(outputJson ?? join(resolvedReleaseDir, `v14241-real-env-handoff-gap-summary.${suffix}.json`))
  const mdPath = resolve(outputMd ?? join(resolvedReleaseDir, `v14241-real-env-handoff-gap-summary.${suffix}.md`))
  await mkdir(dirname(jsonPath), { recursive: true })
  await mkdir(dirname(mdPath), { recursive: true })
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(mdPath, renderMarkdown(report), 'utf8')
  return { report, outputJson: jsonPath, outputMd: mdPath }
}

export function renderMarkdown(report) {
  const lines = [
    '# v1.4.24.1 Real Environment Handoff Gap Summary',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Selected tiers: ${report.selectedTiers.join(', ')}`,
    `- Selected ready tiers: ${report.readiness.selectedReadyTierCount}/${report.readiness.selectedTierCount}`,
    `- Selected ready scenarios: ${report.readiness.selectedReadyScenarioCount}/${report.readiness.selectedScenarioCount}`,
    `- Full matrix ready tiers: ${report.readiness.fullMatrixReadyTierCount}/${report.readiness.fullMatrixTierCount}`,
    `- Secret leaks: ${report.readiness.secretLeakCount}`,
    '',
    '## Environment Targets',
    '',
    '| Tier | Present fields | Missing fields |',
    '| --- | --- | --- |',
  ]
  for (const target of report.environmentTargets) {
    lines.push(`| ${target.tier} | ${target.presentFields.join(', ') || 'none'} | ${target.missingFields.join(', ') || 'none'} |`)
  }
  lines.push('', '## Grouped Missing Fields', '')
  for (const [group, fields] of Object.entries(report.groupedMissingFields)) {
    lines.push(`### ${group}`, '')
    if (fields.length === 0) {
      lines.push('- none', '')
      continue
    }
    for (const item of fields) lines.push(`- ${item.field}: ${item.count}`)
    lines.push('')
  }
  lines.push('## Scenario Tier Checklist', '')
  lines.push('| ID | Tier | Ready | Missing environment | Missing scenario | Missing owners | Required artifacts |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const tier of report.tiers) {
    lines.push(`| ${tier.id} | ${tier.tier} | ${tier.readyToRun ? 'yes' : 'no'} | ${tier.missingEnvironmentFields.join(', ') || 'none'} | ${tier.missingScenarioFields.join(', ') || 'none'} | ${tier.missingOwnerFields.join(', ') || 'none'} | ${tier.requiredArtifacts.join(', ') || 'none'} |`)
  }
  lines.push('', '## Next Commands', '')
  lines.push(`- ${report.nextCommands.checkHandoff}`)
  lines.push(`- ${report.nextCommands.attemptSelectedTier}`)
  lines.push(`- ${report.nextCommands.refreshMatrixReport}`)
  lines.push(`- ${report.nextCommands.refreshGapSummary}`)
  lines.push('', '## Boundary', '')
  lines.push('- This report is read-only and does not authorize real-environment execution.')
  lines.push('- It omits secret values and does not close any UAT/staging/solo-live/live tier by itself.')
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const handoffFile = resolve(argValue('--handoff-file', join(releaseDir, 'v14241-real-env-handoff.operator-fill-template.json')))
  const matrixFile = resolve(argValue('--matrix-file', join(releaseDir, 'v14241-real-env-uat-staging-live-matrix.json')))
  const selectedTiers = normalizeSelectedTiers(argValue('--tier', 'staging'), hasFlag('--all-tiers'))
  const { report, outputJson, outputMd } = await summarizeHandoffGaps({
    handoffFile,
    matrixFile,
    releaseDir,
    selectedTiers,
    outputJson: argValue('--output', null),
    outputMd: argValue('--md-output', null),
  })
  console.log(JSON.stringify({
    status: report.status,
    selectedTiers: report.selectedTiers,
    selectedReadyTierCount: report.readiness.selectedReadyTierCount,
    selectedTierCount: report.readiness.selectedTierCount,
    selectedReadyScenarioCount: report.readiness.selectedReadyScenarioCount,
    selectedScenarioCount: report.readiness.selectedScenarioCount,
    fullMatrixReadyTierCount: report.readiness.fullMatrixReadyTierCount,
    fullMatrixTierCount: report.readiness.fullMatrixTierCount,
    secretLeakCount: report.readiness.secretLeakCount,
    outputs: [rel(outputJson), rel(outputMd)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
