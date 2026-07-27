#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runUat01CompanyCreateSwitch } from './run-v14241-real-uat01-company-create-switch.mjs'
import { runUat02InviteJoinRole } from './run-v14241-real-uat02-invite-join-role.mjs'
import { runUat03RlsRoleMatrix } from './run-v14241-real-uat03-rls-role-matrix.mjs'
import { runUat04WbsBaselinePublication } from './run-v14241-real-uat04-wbs-baseline-publication.mjs'
import { runUat05GanttCriticalPath } from './run-v14241-real-uat05-gantt-critical-path.mjs'
import { runUat06PlanStateMachine } from './run-v14241-real-uat06-plan-state-machine.mjs'
import { runUat07DocumentChain } from './run-v14241-real-uat07-document-chain.mjs'
import { runUat08BusinessLoop } from './run-v14241-real-uat08-business-loop.mjs'
import { runUat09BiSsot } from './run-v14241-real-uat09-bi-ssot.mjs'
import { runUat10ImportExport } from './run-v14241-real-uat10-import-export.mjs'
import { runUat11PerformancePressure } from './run-v14241-real-uat11-performance-pressure.mjs'
import { runUat12SecurityNegative } from './run-v14241-real-uat12-security-negative.mjs'
import { runUat13ReleaseRollback } from './run-v14241-real-uat13-release-rollback.mjs'
import { runUat14BackupMigration } from './run-v14241-real-uat14-backup-migration.mjs'
import { runUat15ObservabilityIncident } from './run-v14241-real-uat15-observability-incident.mjs'
import { runUat16SupportOps } from './run-v14241-real-uat16-support-ops.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.candidate.json')
const defaultOutputJson = join(defaultReleaseDir, 'v14241-real-env-scenario-attempts-summary.json')
const defaultOutputMd = join(defaultReleaseDir, 'v14241-real-env-scenario-attempts-summary.md')

const SCENARIO_RUNNERS = [
  ['REAL-UAT-01', runUat01CompanyCreateSwitch],
  ['REAL-UAT-02', runUat02InviteJoinRole],
  ['REAL-UAT-03', runUat03RlsRoleMatrix],
  ['REAL-UAT-04', runUat04WbsBaselinePublication],
  ['REAL-UAT-05', runUat05GanttCriticalPath],
  ['REAL-UAT-06', runUat06PlanStateMachine],
  ['REAL-UAT-07', runUat07DocumentChain],
  ['REAL-UAT-08', runUat08BusinessLoop],
  ['REAL-UAT-09', runUat09BiSsot],
  ['REAL-UAT-10', runUat10ImportExport],
  ['REAL-UAT-11', runUat11PerformancePressure],
  ['REAL-UAT-12', runUat12SecurityNegative],
  ['REAL-UAT-13', runUat13ReleaseRollback],
  ['REAL-UAT-14', runUat14BackupMigration],
  ['REAL-UAT-15', runUat15ObservabilityIncident],
  ['REAL-UAT-16', runUat16SupportOps],
]

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

function normalizeTier(value) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'UAT' || normalized === 'staging' || normalized === 'solo-live' || normalized === 'live') return normalized
  throw new Error(`Unsupported tier: ${value}. Expected UAT, staging, solo-live, or live.`)
}

function runnerMap() {
  return new Map(SCENARIO_RUNNERS)
}

function selectedScenarioIds(ids) {
  if (!ids || ids.length === 0) return SCENARIO_RUNNERS.map(([id]) => id)
  const known = runnerMap()
  for (const id of ids) {
    if (!known.has(id)) throw new Error(`Unsupported scenario id: ${id}`)
  }
  return ids
}

function assertNoSecretLikeText(report) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_v14241_scenario_attempts_summary_with_secret_like_text')
  }
}

function reportStatus(results) {
  if (results.length === 0) return 'no_scenarios_selected'
  if (results.every((item) => item.status === 'passed' && item.canCloseScenarioTier)) return 'passed'
  if (results.some((item) => item.status === 'passed' && item.canCloseScenarioTier)) return 'partially_passed_with_blockers'
  if (results.some((item) => item.commandsExecuted > 0)) return 'executed_with_blockers'
  return 'blocked_before_execution'
}

function scenarioAttemptOutputPath(artifactRoot, scenarioId) {
  return join(artifactRoot, 'attempts', `${scenarioId.toLowerCase()}.execution.json`)
}

function defaultAuditEnvFileForTier(tier) {
  return tier === 'staging' ? join(repoRoot, 'deploy', 'env', 'staging.env') : null
}

function scenarioDefaultEvidenceOptions(artifactRoot, scenarioId, tier) {
  const readbacks = join(artifactRoot, 'operator-readbacks')
  const evidence = join(artifactRoot, 'operator-evidence')
  switch (scenarioId) {
    case 'REAL-UAT-01':
      return {
        auditReadbackFile: join(readbacks, 'real-uat-01-audit-readback.json'),
        auditEnvFile: defaultAuditEnvFileForTier(tier),
      }
    case 'REAL-UAT-02':
      return {
        auditReadbackFile: join(readbacks, 'real-uat-02-audit-readback.json'),
        auditEnvFile: defaultAuditEnvFileForTier(tier),
        cleanupReadbackFile: join(readbacks, 'real-uat-02-cleanup-readback.json'),
      }
    case 'REAL-UAT-03':
      return {
        cleanupReadbackFile: join(readbacks, 'real-uat-03-cleanup-readback.json'),
        auditEnvFile: defaultAuditEnvFileForTier(tier),
      }
    case 'REAL-UAT-04':
      return {
        wbsBaselineFile: join(evidence, 'real-uat-04-wbs-baseline-publication.json'),
        runtimePublicationReadbackFile: join(evidence, 'real-uat-04-runtime-publication-readback.json'),
        rollbackVerificationFile: join(evidence, 'real-uat-04-rollback-verification.json'),
      }
    case 'REAL-UAT-05':
      return {
        ganttTraceFile: join(evidence, 'real-uat-05-gantt-trace.json'),
        criticalPathReadbackFile: join(evidence, 'real-uat-05-critical-path-readback.json'),
        performanceGanttP95File: join(evidence, 'real-uat-05-performance-gantt-p95.json'),
        cleanupReadbackFile: join(readbacks, 'real-uat-05-cleanup-readback.json'),
      }
    case 'REAL-UAT-06':
      return {
        stateMachineEvidenceFile: join(evidence, 'real-uat-06-state-machine-evidence.json'),
        draftLockReadbackFile: join(evidence, 'real-uat-06-draft-lock-readback.json'),
        approvalAuditFile: join(evidence, 'real-uat-06-approval-audit.json'),
        cleanupReadbackFile: join(readbacks, 'real-uat-06-cleanup-readback.json'),
      }
    default:
      return {}
  }
}

export async function runScenarioAttempts({
  tier = 'staging',
  scenarioIds = [],
  releaseDir = defaultReleaseDir,
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  outputJson = defaultOutputJson,
  outputMd = defaultOutputMd,
  artifactRoot = null,
  evidenceRoot = null,
  evidenceFiles = [],
  publicOrigin = null,
  flags = {},
  now = new Date(),
} = {}) {
  const normalizedTier = normalizeTier(tier)
  const resolvedReleaseDir = resolve(releaseDir)
  const resolvedArtifactRoot = resolve(artifactRoot ?? join(resolvedReleaseDir, 'v14241-real-env-evidence', normalizedTier.toLowerCase()))
  const resolvedEvidenceRoot = resolve(evidenceRoot ?? resolvedArtifactRoot)
  const selected = selectedScenarioIds(scenarioIds)
  const runners = runnerMap()
  const results = []

  for (const scenarioId of selected) {
    const runner = runners.get(scenarioId)
    const scenarioOutput = scenarioAttemptOutputPath(resolvedArtifactRoot, scenarioId)
    const result = await runner({
      tier: normalizedTier,
      releaseDir: resolvedReleaseDir,
      handoffFile: resolve(handoffFile),
      matrixFile: resolve(matrixFile),
      output: scenarioOutput,
      artifactRoot: resolvedArtifactRoot,
      evidenceRoot: resolvedEvidenceRoot,
      evidenceFiles,
      flags,
      now,
      publicOrigin,
      ...scenarioDefaultEvidenceOptions(resolvedArtifactRoot, scenarioId, normalizedTier),
    })
    results.push({
      scenarioId: result.scenarioId,
      tier: result.tier,
      status: result.status,
      commandsExecuted: result.commandsExecuted ?? 0,
      canCloseScenarioTier: result.canCloseScenarioTier === true,
      closesRealEnvironmentTier: result.closesRealEnvironmentTier === true,
      blockerCount: Array.isArray(result.blockers) ? result.blockers.length : 0,
      blockers: Array.isArray(result.blockers) ? result.blockers.slice(0, 20) : [],
      output: result.output ?? null,
    })
  }

  const report = {
    schemaVersion: 'workbuddy/v14241-real-env-scenario-attempts-summary/v1',
    generatedAt: now.toISOString(),
    status: reportStatus(results),
    tier: normalizedTier,
    releaseDir: rel(resolvedReleaseDir),
    handoffFile: rel(resolve(handoffFile)),
    matrixFile: rel(resolve(matrixFile)),
    artifactRoot: rel(resolvedArtifactRoot),
    evidenceRoot: rel(resolvedEvidenceRoot),
    selectedScenarioCount: selected.length,
    summary: {
      passedScenarioCount: results.filter((item) => item.status === 'passed' && item.canCloseScenarioTier).length,
      blockedScenarioCount: results.filter((item) => !(item.status === 'passed' && item.canCloseScenarioTier)).length,
      commandsExecuted: results.reduce((sum, item) => sum + item.commandsExecuted, 0),
      canCloseSelectedTier: results.length > 0 && results.every((item) => item.status === 'passed' && item.canCloseScenarioTier),
      statuses: results.reduce((counts, item) => {
        counts[item.status] = (counts[item.status] ?? 0) + 1
        return counts
      }, {}),
    },
    unlockFlags: flags,
    executionBoundary: {
      realEnvironmentMutationPossibleOnlyWhenUnlocked: true,
      missingHandoffMustRemainBlocked: true,
      supportOnlyDoesNotCloseScenarioTier: true,
    },
    results,
  }

  assertNoSecretLikeText(report)
  await mkdir(dirname(resolve(outputJson)), { recursive: true })
  await mkdir(dirname(resolve(outputMd)), { recursive: true })
  await writeFile(resolve(outputJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(resolve(outputMd), renderScenarioAttemptsMarkdown(report), 'utf8')
  return report
}

export function renderScenarioAttemptsMarkdown(report) {
  const lines = [
    '# v1.4.24.1 Real Environment Scenario Attempts Summary',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Tier: ${report.tier}`,
    `- Release dir: ${report.releaseDir}`,
    `- Handoff file: ${report.handoffFile}`,
    `- Matrix file: ${report.matrixFile}`,
    '',
    '## Verdict',
    '',
    `- Selected scenarios: ${report.selectedScenarioCount}`,
    `- Passed scenarios: ${report.summary.passedScenarioCount}`,
    `- Blocked scenarios: ${report.summary.blockedScenarioCount}`,
    `- Commands executed: ${report.summary.commandsExecuted}`,
    `- Can close selected tier: ${report.summary.canCloseSelectedTier ? 'yes' : 'no'}`,
    `- Statuses: ${JSON.stringify(report.summary.statuses)}`,
    '',
    '## Scenario Results',
    '',
    '| ID | Status | Commands | Can close tier | Blockers |',
    '| --- | --- | ---: | --- | --- |',
  ]
  for (const result of report.results) {
    lines.push(`| ${result.scenarioId} | ${result.status} | ${result.commandsExecuted} | ${result.canCloseScenarioTier ? 'yes' : 'no'} | ${result.blockerCount} |`)
  }
  lines.push('', '## Boundary', '')
  lines.push('- This summary is an execution-attempt summary. It is not a pass unless every selected scenario reports `passed` and `canCloseScenarioTier=true`.')
  lines.push('- Missing handoff, missing unlock flags, or support-only evidence must remain blocked.')
  return `${lines.join('\n')}\n`
}

async function main() {
  const tier = argValue('--tier', 'staging')
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const outputJson = resolve(argValue('--output', join(releaseDir, 'v14241-real-env-scenario-attempts-summary.json')))
  const outputMd = resolve(argValue('--md-output', join(releaseDir, 'v14241-real-env-scenario-attempts-summary.md')))
  const flags = {
    '--include-uat': hasFlag('--include-uat'),
    '--include-staging': hasFlag('--include-staging'),
    '--include-solo-live': hasFlag('--include-solo-live'),
    '--include-live': hasFlag('--include-live'),
    '--confirm-real-handoff': hasFlag('--confirm-real-handoff'),
    '--allow-write': hasFlag('--allow-write'),
  }
  const report = await runScenarioAttempts({
    tier,
    scenarioIds: argValues('--scenario-id'),
    releaseDir,
    handoffFile: resolve(argValue('--handoff-file', join(releaseDir, 'v14241-real-env-handoff.candidate.json'))),
    matrixFile: resolve(argValue('--matrix-file', join(releaseDir, 'v14241-real-env-uat-staging-live-matrix.json'))),
    outputJson,
    outputMd,
    artifactRoot: resolve(argValue('--artifact-root', join(releaseDir, 'v14241-real-env-evidence', String(tier).toLowerCase()))),
    evidenceRoot: resolve(argValue('--evidence-root', join(releaseDir, 'v14241-real-env-evidence', String(tier).toLowerCase()))),
    evidenceFiles: argValues('--evidence-file'),
    publicOrigin: argValue('--public-origin', process.env.PUBLIC_HTTPS_ORIGIN ?? ''),
    flags,
  })
  console.log(JSON.stringify({
    status: report.status,
    tier: report.tier,
    selectedScenarioCount: report.selectedScenarioCount,
    passedScenarioCount: report.summary.passedScenarioCount,
    blockedScenarioCount: report.summary.blockedScenarioCount,
    commandsExecuted: report.summary.commandsExecuted,
    canCloseSelectedTier: report.summary.canCloseSelectedTier,
    outputs: [rel(outputJson), rel(outputMd)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
