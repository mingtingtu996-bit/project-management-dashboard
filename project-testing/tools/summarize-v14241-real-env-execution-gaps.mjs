#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultMatrixReport = join(defaultReleaseDir, 'v14241-real-env-matrix-execution-report.json')
const defaultHandoffReadiness = join(defaultReleaseDir, 'v14241-real-env-handoff-readiness.json')
const defaultOutputJson = join(defaultReleaseDir, 'v14241-real-env-execution-gap-summary.json')
const defaultOutputMd = join(defaultReleaseDir, 'v14241-real-env-execution-gap-summary.md')

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

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))]
}

function countValues(values) {
  const counts = new Map()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([field, count]) => ({ field, count }))
}

function indexReadiness(readiness) {
  return new Map(toArray(readiness?.scenarios).map((scenario) => [scenario.id, scenario]))
}

function supportSummary(scenario) {
  return toArray(scenario?.supportingEvidence).map((item) => ({
    classification: item.classification,
    status: item.status,
    closesRealEnvironmentTier: item.closesRealEnvironmentTier === true,
    artifacts: toArray(item.artifacts).map((artifact) => ({
      path: artifact.path,
      present: artifact.present === true,
      status: artifact.status ?? null,
    })),
  }))
}

function buildTierGaps(matrixScenario, readinessScenario) {
  const readinessTiers = new Map(toArray(readinessScenario?.tiers).map((tier) => [tier.name, tier]))
  return toArray(matrixScenario?.tiers).map((tier) => {
    const readinessTier = readinessTiers.get(tier.name)
    return {
      tier: tier.name,
      status: tier.status,
      mayClaimPass: tier.mayClaimPass === true,
      readyToRun: readinessTier?.readyToRun === true,
      missingInputs: unique(tier.missingInputs),
      missingArtifacts: unique(tier.missingArtifacts),
      missingMetadata: unique(tier.missingMetadata),
      missingEnvironmentFields: unique(readinessTier?.missingEnvironmentFields),
      missingScenarioFields: unique(readinessTier?.missingScenarioFields),
      missingOwnerFields: unique(readinessTier?.missingOwnerFields),
      reason: tier.reason ?? null,
    }
  })
}

function collectGroupedMissingFields(scenarios) {
  const byTier = {}
  for (const tier of ['UAT', 'staging', 'solo-live', 'live']) {
    const matching = scenarios.flatMap((scenario) => scenario.tiers.filter((item) => item.tier === tier))
    byTier[tier] = {
      blockedTierCount: matching.filter((item) => !item.readyToRun).length,
      environment: countValues(matching.flatMap((item) => item.missingEnvironmentFields)),
      scenario: countValues(matching.flatMap((item) => item.missingScenarioFields)),
      owners: countValues(matching.flatMap((item) => item.missingOwnerFields)),
      artifacts: countValues(matching.flatMap((item) => item.missingArtifacts)),
      metadata: countValues(matching.flatMap((item) => item.missingMetadata)),
    }
  }
  return byTier
}

function buildHardBlockers({ matrixReport, handoffReadiness, canExecuteAnyTier, readyTierCount, passedTierCount, tierCount }) {
  const blockers = []
  if (readyTierCount === 0) blockers.push('all_real_environment_tiers_missing_handoff_inputs')
  if (!canExecuteAnyTier && passedTierCount > 0 && passedTierCount < tierCount) {
    blockers.push('remaining_real_environment_tiers_missing_handoff_inputs')
  }
  if ((handoffReadiness?.secretLeakCount ?? 0) > 0) blockers.push('handoff_contains_inline_secret_like_values')
  if (toArray(matrixReport?.envReadiness?.live?.missingKeys).length > 0) blockers.push('live_environment_refs_missing')
  if (matrixReport?.stagingPreflight?.targetClass === 'local_runtime_with_staging_env_refs') {
    blockers.push('staging_env_refs_point_to_local_runtime_not_deployed_staging')
  }
  if (matrixReport?.realEnvHandoffReadiness?.readyToExecuteMatrix === false) {
    blockers.push('real_env_handoff_readiness_failed')
  }
  return unique(blockers)
}

function executionGapStatus({ passedTierCount, tierCount, canExecuteAnyTier }) {
  if (passedTierCount === tierCount && tierCount > 0) return 'real_env_matrix_executed'
  if (passedTierCount > 0) return 'real_env_matrix_partially_executed_with_remaining_gaps'
  if (canExecuteAnyTier) return 'ready_for_partial_real_env_execution'
  return 'blocked_waiting_for_real_environment_handoff'
}

export function buildExecutionGapSummary({
  matrixReport,
  handoffReadiness,
  matrixReportPath = defaultMatrixReport,
  handoffReadinessPath = defaultHandoffReadiness,
  releaseDir = defaultReleaseDir,
  now = new Date(),
} = {}) {
  const readinessByScenario = indexReadiness(handoffReadiness)
  const scenarios = toArray(matrixReport?.scenarios).map((scenario) => {
    const readinessScenario = readinessByScenario.get(scenario.id)
    return {
      id: scenario.id,
      title: scenario.title,
      priority: scenario.priority,
      status: scenario.status,
      realEnvironmentPass: scenario.realEnvironmentPass === true,
      passedTierCount: scenario.passedTierCount ?? 0,
      totalTierCount: scenario.totalTierCount ?? toArray(scenario.tiers).length,
      supportOnly: toArray(scenario.supportingEvidence).length > 0 && scenario.realEnvironmentPass !== true,
      supportEvidence: supportSummary(scenario),
      tiers: buildTierGaps(scenario, readinessScenario),
    }
  })

  const readyTierCount = handoffReadiness?.readyTierCount ?? scenarios
    .flatMap((scenario) => scenario.tiers)
    .filter((tier) => tier.readyToRun).length
  const tierCount = handoffReadiness?.tierCount ?? matrixReport?.summary?.tierCount ?? scenarios.reduce((sum, scenario) => sum + scenario.totalTierCount, 0)
  const fullyPassedScenarioCount = matrixReport?.summary?.fullyPassedScenarioCount ?? scenarios.filter((scenario) => scenario.realEnvironmentPass).length
  const passedTierCount = matrixReport?.summary?.passedTierCount ?? scenarios.reduce((sum, scenario) => sum + scenario.passedTierCount, 0)
  const readyUnpassedTierCount = scenarios
    .flatMap((scenario) => scenario.tiers)
    .filter((tier) => tier.readyToRun && tier.status !== 'passed').length
  const canExecuteAnyTier = readyUnpassedTierCount > 0

  const report = {
    schemaVersion: 'workbuddy/v14241-real-env-execution-gap-summary/v1',
    generatedAt: now.toISOString(),
    status: executionGapStatus({ passedTierCount, tierCount, canExecuteAnyTier }),
    source: 'summarize-v14241-real-env-execution-gaps',
    paths: {
      releaseDir: rel(resolve(releaseDir)),
      matrixReport: rel(resolve(matrixReportPath)),
      handoffReadiness: rel(resolve(handoffReadinessPath)),
    },
    summary: {
      scenarioCount: matrixReport?.summary?.scenarioCount ?? scenarios.length,
      tierCount,
      passedTierCount,
      fullyPassedScenarioCount,
      supportOnlyScenarioCount: matrixReport?.summary?.supportOnlyScenarioCount ?? scenarios.filter((scenario) => scenario.supportOnly).length,
      blockedScenarioCount: matrixReport?.summary?.blockedScenarioCount ?? scenarios.filter((scenario) => scenario.status?.startsWith('blocked')).length,
      readyTierCount,
      readyUnpassedTierCount,
      blockedTierCount: handoffReadiness?.blockedTierCount ?? tierCount - readyTierCount,
      readyScenarioCount: handoffReadiness?.readyScenarioCount ?? scenarios.filter((scenario) => scenario.tiers.every((tier) => tier.readyToRun)).length,
      readyToExecuteMatrix: handoffReadiness?.readyToExecuteMatrix === true,
      canExecuteAnyTier,
    },
    environmentBoundary: {
      stagingPreflightStatus: matrixReport?.stagingPreflight?.status ?? null,
      stagingTargetClass: matrixReport?.stagingPreflight?.targetClass ?? null,
      stagingCanCloseScenarioTier: matrixReport?.stagingPreflight?.canCloseScenarioTier === true,
      liveMissingEnvKeys: toArray(matrixReport?.envReadiness?.live?.missingKeys),
      soloLiveMissingEnvKeys: toArray(matrixReport?.envReadiness?.['solo-live']?.missingKeys),
      stagingMissingEnvKeys: toArray(matrixReport?.envReadiness?.staging?.missingKeys),
    },
    hardBlockers: buildHardBlockers({ matrixReport, handoffReadiness, canExecuteAnyTier, readyTierCount, passedTierCount, tierCount }),
    groupedMissingFields: collectGroupedMissingFields(scenarios),
    scenarios,
    nextCommands: {
      refreshHandoffReadiness: `node project-testing/tools/build-v14241-real-env-handoff-pack.mjs --release-dir ${rel(resolve(releaseDir))}`,
      refreshMatrixReport: `node project-testing/tools/run-v14241-real-env-uat-matrix.mjs --release-dir ${rel(resolve(releaseDir))}`,
      refreshGapSummary: `node project-testing/tools/summarize-v14241-real-env-execution-gaps.mjs --release-dir ${rel(resolve(releaseDir))}`,
    },
    executionBoundary: {
      mayExecuteRealScenarioTierNow: canExecuteAnyTier,
      mustNotClaimRealCustomerCoverageUntil: 'A scenario tier has ready handoff inputs and real-environment artifacts satisfy its evidence contract.',
      supportEvidencePolicy: 'Support evidence may guide triage only; it never closes UAT/staging/solo-live/live tiers unless the scenario evidence contract is satisfied; solo-live closes personal readiness only, not company-grade productionReady.',
    },
  }

  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_v14241_execution_gap_summary_with_secret_like_text')
  }
  return report
}

export function renderGapSummaryMarkdown(report) {
  const lines = [
    '# v1.4.24.1 Real Environment Execution Gap Summary',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Matrix: ${report.paths.matrixReport}`,
    `- Handoff readiness: ${report.paths.handoffReadiness}`,
    '',
    '## Verdict',
    '',
    `- Passed tiers: ${report.summary.passedTierCount}/${report.summary.tierCount}`,
    `- Ready-to-run tiers: ${report.summary.readyTierCount}/${report.summary.tierCount}`,
    `- Ready unpassed tiers: ${report.summary.readyUnpassedTierCount}/${report.summary.tierCount}`,
    `- Fully passed scenarios: ${report.summary.fullyPassedScenarioCount}/${report.summary.scenarioCount}`,
    `- Support-only scenarios: ${report.summary.supportOnlyScenarioCount}/${report.summary.scenarioCount}`,
    `- Can execute any real tier now: ${report.summary.canExecuteAnyTier ? 'yes' : 'no'}`,
    '',
    '## Hard Blockers',
    '',
    ...report.hardBlockers.map((blocker) => `- ${blocker}`),
    '',
    '## Environment Boundary',
    '',
    `- staging preflight: ${report.environmentBoundary.stagingPreflightStatus || 'unknown'}`,
    `- staging target class: ${report.environmentBoundary.stagingTargetClass || 'unknown'}`,
    `- staging can close scenario tier: ${report.environmentBoundary.stagingCanCloseScenarioTier ? 'yes' : 'no'}`,
    `- solo-live missing env keys: ${report.environmentBoundary.soloLiveMissingEnvKeys.join(', ') || 'none'}`,
    `- live missing env keys: ${report.environmentBoundary.liveMissingEnvKeys.join(', ') || 'none'}`,
    '',
    '## Scenario Table',
    '',
    '| ID | Status | Ready tiers | Passed tiers | Support evidence |',
    '| --- | --- | --- | --- | --- |',
  ]

  for (const scenario of report.scenarios) {
    const readyTierCount = scenario.tiers.filter((tier) => tier.readyToRun).length
    const support = scenario.supportEvidence.map((item) => item.classification).join(', ') || '-'
    lines.push(`| ${scenario.id} | ${scenario.status} | ${readyTierCount}/${scenario.totalTierCount} | ${scenario.passedTierCount}/${scenario.totalTierCount} | ${support} |`)
  }

  lines.push('', '## Top Missing Fields', '')
  for (const tierName of ['UAT', 'staging', 'solo-live', 'live']) {
    const tier = report.groupedMissingFields[tierName]
    lines.push(`### ${tierName}`, '')
    lines.push(`- blocked tiers: ${tier.blockedTierCount}`)
    for (const section of ['environment', 'scenario', 'owners', 'artifacts']) {
      const top = tier[section].slice(0, 8)
      lines.push(`- ${section}: ${top.map((item) => `${item.field} (${item.count})`).join(', ') || 'none'}`)
    }
    lines.push('')
  }

  lines.push('## Next Commands', '')
  lines.push(`- ${report.nextCommands.refreshHandoffReadiness}`)
  lines.push(`- ${report.nextCommands.refreshMatrixReport}`)
  lines.push(`- ${report.nextCommands.refreshGapSummary}`)
  lines.push('', '## Boundary', '')
  lines.push(`- ${report.executionBoundary.mustNotClaimRealCustomerCoverageUntil}`)
  lines.push(`- ${report.executionBoundary.supportEvidencePolicy}`)
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const matrixReportPath = resolve(argValue('--matrix-report', join(releaseDir, 'v14241-real-env-matrix-execution-report.json')))
  const handoffReadinessPath = resolve(argValue('--handoff-readiness', join(releaseDir, 'v14241-real-env-handoff-readiness.json')))
  const outputJson = resolve(argValue('--output', join(releaseDir, 'v14241-real-env-execution-gap-summary.json')))
  const outputMd = resolve(argValue('--md-output', join(releaseDir, 'v14241-real-env-execution-gap-summary.md')))
  const [matrixReport, handoffReadiness] = await Promise.all([
    readJson(matrixReportPath),
    readJson(handoffReadinessPath),
  ])
  const report = buildExecutionGapSummary({
    matrixReport,
    handoffReadiness,
    matrixReportPath,
    handoffReadinessPath,
    releaseDir,
  })
  await mkdir(dirname(outputJson), { recursive: true })
  await mkdir(dirname(outputMd), { recursive: true })
  await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(outputMd, renderGapSummaryMarkdown(report), 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    passedTierCount: report.summary.passedTierCount,
    tierCount: report.summary.tierCount,
    readyTierCount: report.summary.readyTierCount,
    canExecuteAnyTier: report.summary.canExecuteAnyTier,
    hardBlockers: report.hardBlockers,
    outputs: [rel(outputJson), rel(outputMd)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
