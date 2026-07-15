#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultOutputJson = join(defaultReleaseDir, 'v14241-real-env-attempts-current-state.json')
const defaultOutputMd = join(defaultReleaseDir, 'v14241-real-env-attempts-current-state.md')

const DEFAULT_ATTEMPT_FILES = {
  UAT: 'v14241-real-env-scenario-attempts-summary.uat.json',
  staging: 'v14241-real-env-scenario-attempts-summary.staging.full.json',
  'solo-live': 'v14241-real-env-scenario-attempts-summary.solo-live.json',
  live: 'v14241-real-env-scenario-attempts-summary.live.json',
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

async function readJsonIfPresent(path) {
  if (!existsSync(path)) return null
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function tierStatusFromAttempt(attempt) {
  if (!attempt) return 'missing_attempt_summary'
  if (attempt.summary?.canCloseSelectedTier === true) return 'passed'
  if ((attempt.summary?.commandsExecuted ?? 0) > 0) return 'executed_with_blockers'
  return 'blocked_before_execution'
}

function firstBlockingStatus(statuses) {
  const entries = Object.entries(statuses ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return entries[0]?.[0] ?? null
}

function summarizeAttempt(tier, path, attempt) {
  const resultOutputs = toArray(attempt?.results).map((item) => item.output).filter(Boolean)
  const uniqueOutputs = [...new Set(resultOutputs)]
  const outputCollisionCount = resultOutputs.length - uniqueOutputs.length
  return {
    tier,
    path: rel(path),
    present: attempt !== null,
    status: tierStatusFromAttempt(attempt),
    selectedScenarioCount: attempt?.selectedScenarioCount ?? 0,
    passedScenarioCount: attempt?.summary?.passedScenarioCount ?? 0,
    blockedScenarioCount: attempt?.summary?.blockedScenarioCount ?? 0,
    commandsExecuted: attempt?.summary?.commandsExecuted ?? 0,
    canCloseSelectedTier: attempt?.summary?.canCloseSelectedTier === true,
    statuses: attempt?.summary?.statuses ?? {},
    firstBlockingStatus: firstBlockingStatus(attempt?.summary?.statuses),
    outputCollisionCount,
    sampleOutputs: uniqueOutputs.slice(0, 5),
  }
}

function attemptBlockerForTier(tier, tierSummary, refsReadiness) {
  if (!tierSummary.present) return `${tier}:attempt_summary_missing`
  if (tierSummary.canCloseSelectedTier) return null
  if (tier === 'staging' && refsReadiness?.executionBoundary?.mayAttemptStagingScenarioResolution === false) {
    return `staging:operator_refs_missing:${refsReadiness.missingKeyCount ?? 'unknown'}`
  }
  if (tierSummary.firstBlockingStatus) return `${tier}:${tierSummary.firstBlockingStatus}`
  return `${tier}:not_closed`
}

function overallStatus(tiers) {
  if (tiers.every((tier) => tier.canCloseSelectedTier)) return 'real_env_matrix_attempts_passed'
  if (tiers.some((tier) => tier.commandsExecuted > 0)) return 'real_env_matrix_attempts_executed_with_blockers'
  if (tiers.some((tier) => tier.present)) return 'real_env_matrix_blocked_before_execution'
  return 'real_env_matrix_attempt_summaries_missing'
}

function assertNoSecretLikeText(report) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=|service[_-]?role\s*=/i.test(text)) {
    throw new Error('refusing_to_write_v14241_real_env_attempts_current_state_with_secret_like_text')
  }
}

export async function summarizeRealEnvAttempts({
  releaseDir = defaultReleaseDir,
  outputJson = defaultOutputJson,
  outputMd = defaultOutputMd,
  now = new Date(),
} = {}) {
  const resolvedReleaseDir = resolve(releaseDir)
  const attemptPaths = Object.fromEntries(
    Object.entries(DEFAULT_ATTEMPT_FILES).map(([tier, file]) => [tier, join(resolvedReleaseDir, file)]),
  )
  const [uatAttempt, stagingAttempt, soloLiveAttempt, liveAttempt, refsReadiness, stagingPreflight, targetDiscovery] = await Promise.all([
    readJsonIfPresent(attemptPaths.UAT),
    readJsonIfPresent(attemptPaths.staging),
    readJsonIfPresent(attemptPaths['solo-live']),
    readJsonIfPresent(attemptPaths.live),
    readJsonIfPresent(join(resolvedReleaseDir, 'v14241-real-env-staging-operator-refs-readiness.json')),
    readJsonIfPresent(join(resolvedReleaseDir, 'v14241-staging-connectivity-preflight.json')),
    readJsonIfPresent(join(resolvedReleaseDir, 'v14241-real-env-target-discovery.json')),
  ])
  const tiers = [
    summarizeAttempt('UAT', attemptPaths.UAT, uatAttempt),
    summarizeAttempt('staging', attemptPaths.staging, stagingAttempt),
    summarizeAttempt('solo-live', attemptPaths['solo-live'], soloLiveAttempt),
    summarizeAttempt('live', attemptPaths.live, liveAttempt),
  ]
  const blockers = [
    ...tiers.map((tier) => attemptBlockerForTier(tier.tier, tier, refsReadiness)).filter(Boolean),
    ...toArray(targetDiscovery?.blockers).map((blocker) => `target:${blocker}`),
  ]
  const report = {
    schemaVersion: 'workbuddy/v14241-real-env-attempts-current-state/v1',
    generatedAt: now.toISOString(),
    source: 'summarize-v14241-real-env-attempts',
    releaseDir: rel(resolvedReleaseDir),
    status: overallStatus(tiers),
    summary: {
      tierCount: tiers.length,
      closedTierCount: tiers.filter((tier) => tier.canCloseSelectedTier).length,
      selectedScenarioCount: tiers.reduce((sum, tier) => sum + tier.selectedScenarioCount, 0),
      passedScenarioCount: tiers.reduce((sum, tier) => sum + tier.passedScenarioCount, 0),
      blockedScenarioCount: tiers.reduce((sum, tier) => sum + tier.blockedScenarioCount, 0),
      commandsExecuted: tiers.reduce((sum, tier) => sum + tier.commandsExecuted, 0),
      outputCollisionCount: tiers.reduce((sum, tier) => sum + tier.outputCollisionCount, 0),
    },
    tiers,
    stagingOperatorRefs: refsReadiness
      ? {
          path: rel(join(resolvedReleaseDir, 'v14241-real-env-staging-operator-refs-readiness.json')),
          status: refsReadiness.status,
          requiredKeyCount: refsReadiness.requiredKeyCount,
          filledKeyCount: refsReadiness.filledKeyCount,
          missingKeyCount: refsReadiness.missingKeyCount,
          placeholderKeyCount: refsReadiness.placeholderKeyCount,
          secretLeakCount: refsReadiness.secretLeakCount,
          mayAttemptStagingScenarioResolution: refsReadiness.executionBoundary?.mayAttemptStagingScenarioResolution === true,
        }
      : null,
    stagingTargetBoundary: stagingPreflight
      ? {
          path: rel(join(resolvedReleaseDir, 'v14241-staging-connectivity-preflight.json')),
          status: stagingPreflight.status,
          targetClass: stagingPreflight.targetClass,
          canCloseScenarioTier: stagingPreflight.canCloseScenarioTier === true,
        }
      : null,
    targetDiscovery: targetDiscovery
      ? {
          path: rel(join(resolvedReleaseDir, 'v14241-real-env-target-discovery.json')),
          status: targetDiscovery.status,
          localRuntimeWithStagingDataSource: targetDiscovery.targets?.localRuntimeWithStagingDataSource?.available === true,
          deployedStaging: targetDiscovery.targets?.deployedStaging?.available === true,
          liveProduction: targetDiscovery.targets?.liveProduction?.available === true,
          blockerCount: toArray(targetDiscovery.blockers).length,
        }
      : null,
    blockers,
    executionBoundary: {
      summaryOnly: true,
      commandsExecuted: 0,
      doesNotMutateEnvironment: true,
      supportOnlyDoesNotCloseScenarioTier: true,
      mayClaimMatrixExecuted: tiers.every((tier) => tier.canCloseSelectedTier),
    },
    nextRequiredActions: [
      'Provide UAT handoff refs before UAT tier can execute.',
      'Fill staging operator refs with a deployed staging target and scenario refs before staging tier can execute.',
      'Fill solo-live owner/self-approval/rollback/monitoring refs before the personal real-environment tier can execute.',
      'Provide live handoff, approval, rollback, monitoring, and retention refs before live tier can execute.',
      'Keep per-tier scenario attempt artifacts separated under v14241-real-env-evidence/<tier>/attempts.',
    ],
  }
  assertNoSecretLikeText(report)
  await mkdir(dirname(resolve(outputJson)), { recursive: true })
  await mkdir(dirname(resolve(outputMd)), { recursive: true })
  await writeFile(resolve(outputJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(resolve(outputMd), renderMarkdown(report), 'utf8')
  return report
}

export function renderMarkdown(report) {
  const lines = [
    '# v1.4.24.1 Real Environment Attempts Current State',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Release dir: ${report.releaseDir}`,
    '',
    '## Summary',
    '',
    `- Closed tiers: ${report.summary.closedTierCount}/${report.summary.tierCount}`,
    `- Selected scenarios across tiers: ${report.summary.selectedScenarioCount}`,
    `- Passed scenarios: ${report.summary.passedScenarioCount}`,
    `- Blocked scenarios: ${report.summary.blockedScenarioCount}`,
    `- Commands executed by attempts: ${report.summary.commandsExecuted}`,
    `- Per-scenario output collisions: ${report.summary.outputCollisionCount}`,
    '',
    '## Tiers',
    '',
    '| Tier | Status | Passed | Blocked | Commands | Can close | First blocker |',
    '| --- | --- | ---: | ---: | ---: | --- | --- |',
  ]
  for (const tier of report.tiers) {
    lines.push(`| ${tier.tier} | ${tier.status} | ${tier.passedScenarioCount} | ${tier.blockedScenarioCount} | ${tier.commandsExecuted} | ${tier.canCloseSelectedTier ? 'yes' : 'no'} | ${tier.firstBlockingStatus ?? ''} |`)
  }
  lines.push('', '## Staging Refs', '')
  if (report.stagingOperatorRefs) {
    lines.push(`- Status: ${report.stagingOperatorRefs.status}`)
    lines.push(`- Filled keys: ${report.stagingOperatorRefs.filledKeyCount}/${report.stagingOperatorRefs.requiredKeyCount}`)
    lines.push(`- Missing keys: ${report.stagingOperatorRefs.missingKeyCount}`)
    lines.push(`- Secret-like values: ${report.stagingOperatorRefs.secretLeakCount}`)
    lines.push(`- May attempt staging scenario resolution: ${report.stagingOperatorRefs.mayAttemptStagingScenarioResolution ? 'yes' : 'no'}`)
  } else {
    lines.push('- Missing staging operator refs readiness report.')
  }
  lines.push('', '## Target Discovery', '')
  if (report.targetDiscovery) {
    lines.push(`- Status: ${report.targetDiscovery.status}`)
    lines.push(`- Local runtime with staging data source: ${report.targetDiscovery.localRuntimeWithStagingDataSource ? 'yes' : 'no'}`)
    lines.push(`- Deployed staging discovered: ${report.targetDiscovery.deployedStaging ? 'yes' : 'no'}`)
    lines.push(`- Live production discovered: ${report.targetDiscovery.liveProduction ? 'yes' : 'no'}`)
    lines.push(`- Target blockers: ${report.targetDiscovery.blockerCount}`)
  } else {
    lines.push('- Missing target discovery report.')
  }
  lines.push('', '## Blockers', '')
  for (const blocker of report.blockers) lines.push(`- ${blocker}`)
  lines.push('', '## Boundary', '')
  lines.push('- This is a summary-only report. It does not execute UAT, staging, solo-live, or live.')
  lines.push('- A tier is not closed unless its scenario attempt summary reports all selected scenarios passed and canCloseSelectedTier=true.')
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const outputJson = resolve(argValue('--output', join(releaseDir, 'v14241-real-env-attempts-current-state.json')))
  const outputMd = resolve(argValue('--md-output', join(releaseDir, 'v14241-real-env-attempts-current-state.md')))
  const report = await summarizeRealEnvAttempts({ releaseDir, outputJson, outputMd })
  console.log(JSON.stringify({
    status: report.status,
    closedTierCount: report.summary.closedTierCount,
    tierCount: report.summary.tierCount,
    selectedScenarioCount: report.summary.selectedScenarioCount,
    passedScenarioCount: report.summary.passedScenarioCount,
    blockedScenarioCount: report.summary.blockedScenarioCount,
    commandsExecuted: report.summary.commandsExecuted,
    outputCollisionCount: report.summary.outputCollisionCount,
    blockers: report.blockers,
    outputs: [rel(outputJson), rel(outputMd)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
