#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_SOURCE_ROOT = DEFAULT_OUTPUT_ROOT
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports')

const READINESS_SCRIPT = path.join(__dirname, 'check-default-master-plan-production-readiness.mjs')
const OPERATOR_HANDOFF_SCRIPT = path.join(__dirname, 'build-default-master-plan-production-operator-handoff.mjs')
const OPERATOR_HANDOFF_PREFLIGHT_SCRIPT = path.join(__dirname, 'check-default-master-plan-operator-handoff-preflight.mjs')
const GAP_SUMMARY_SCRIPT = path.join(__dirname, 'summarize-default-master-plan-real-evidence-gaps.mjs')
const READ_ONLY_QUEUE_PLAN_SCRIPT = path.join(__dirname, 'plan-default-master-plan-read-only-evidence-queue.mjs')
const BLOCKED_GATE_ACTION_CHECKLIST_SCRIPT = path.join(__dirname, 'build-default-master-plan-blocked-gate-action-checklist.mjs')
const BLOCKED_GATE_ACTION_CHECKLIST_FRESHNESS_SCRIPT = path.join(__dirname, 'check-default-master-plan-blocked-gate-action-checklist-freshness.mjs')
const RELEASE_DASHBOARD_SCRIPT = path.join(__dirname, 'run-release-dashboard.mjs')

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    sourceRoot: DEFAULT_SOURCE_ROOT,
    reportRoot: DEFAULT_REPORT_ROOT,
    json: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`)
      }
      index += 1
      return value
    }

    if (arg === '--output-root') {
      args.outputRoot = path.resolve(nextValue())
    } else if (arg === '--source-root') {
      args.sourceRoot = path.resolve(nextValue())
    } else if (arg === '--report-root') {
      args.reportRoot = path.resolve(nextValue())
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

export async function refreshDefaultMasterPlanReadinessDashboard({
  argv = process.argv.slice(2),
  now = new Date(),
  cwd = REPO_ROOT,
  runCommand = runCommandDefault,
} = {}) {
  const args = parseArgs(argv)
  if (args.help) {
    return {
      help: renderHelp(),
      status: 'help',
      productionReady: false,
      steps: [],
    }
  }

  await mkdir(args.outputRoot, { recursive: true })
  await mkdir(args.reportRoot, { recursive: true })

  const outputs = {
    readinessJson: path.join(args.outputRoot, 'readiness.json'),
    readinessMarkdown: path.join(args.outputRoot, 'readiness.md'),
    operatorHandoffJson: path.join(args.outputRoot, 'operator-handoff.json'),
    operatorHandoffPreflightJson: path.join(args.outputRoot, 'operator-handoff-preflight.json'),
    gapSummaryJson: path.join(args.outputRoot, 'real-evidence-gap-summary.json'),
    gapSummaryMarkdown: path.join(args.outputRoot, 'real-evidence-gap-summary.md'),
    readOnlyEvidenceQueuePlanJson: path.join(args.outputRoot, 'read-only-evidence-queue-plan.json'),
    readOnlyEvidenceQueuePlanMarkdown: path.join(args.outputRoot, 'read-only-evidence-queue-plan.md'),
    blockedGateActionChecklistJson: path.join(args.outputRoot, 'blocked-gate-action-checklist.json'),
    blockedGateActionChecklistMarkdown: path.join(args.outputRoot, 'blocked-gate-action-checklist.md'),
    blockedGateActionChecklistFreshnessJson: path.join(args.outputRoot, 'blocked-gate-action-checklist-freshness.json'),
    blockedGateActionChecklistFreshnessMarkdown: path.join(args.outputRoot, 'blocked-gate-action-checklist-freshness.md'),
    refreshJson: path.join(args.outputRoot, 'readiness-dashboard-refresh.json'),
    refreshMarkdown: path.join(args.outputRoot, 'readiness-dashboard-refresh.md'),
  }
  const sourceInputs = buildSourceInputs(args.sourceRoot)
  const sourceInputChecks = await inspectSourceInputs(sourceInputs)
  const sourceInputSummary = summarizeSourceInputChecks(sourceInputChecks)

  const steps = []
  let readinessSummary = {}
  let gapSummary = {}
  let readOnlyQueuePlanSummary = {}
  let blockedGateActionChecklistSummary = {}
  let blockedGateActionChecklistFreshnessSummary = {}
  let dashboardSummary = {}

  const readinessStep = await runRefreshStep({
    id: 'production_readiness',
    command: process.execPath,
      args: [
        READINESS_SCRIPT,
        '--output-root',
        args.outputRoot,
        '--review-evidence',
        sourceInputs.reviewEvidence,
        '--runtime-seed-evidence-pipeline',
        sourceInputs.runtimeSeedEvidencePipeline,
        '--duration-sample-collection-package',
        sourceInputs.durationSampleCollectionPackage,
        '--duration-sample-coverage-evidence',
        sourceInputs.durationSampleCoverageEvidence,
        '--duration-calibration-evidence',
        sourceInputs.durationCalibrationEvidence,
        '--dependency-writer-evidence',
        sourceInputs.dependencyWriterEvidence,
        '--runtime-publication-evidence',
        sourceInputs.runtimePublicationEvidence,
        '--post-publish-smoke-rollback-evidence',
        sourceInputs.postPublishSmokeRollbackEvidence,
        '--source-manifest',
        sourceInputs.sourceManifest,
      ],
      runCommand,
  })
  steps.push(readinessStep)
  readinessSummary = readinessStep.parsedStdout

  if (readinessStep.exitCode === 0) {
    const operatorHandoffStep = await runRefreshStep({
      id: 'operator_handoff',
      command: process.execPath,
      args: [
        OPERATOR_HANDOFF_SCRIPT,
        '--readiness',
        outputs.readinessJson,
        '--discovery',
        sourceInputs.discovery,
        '--duration-gap-plan',
        sourceInputs.durationGapPlan,
        '--evidence-bundle',
        sourceInputs.evidenceBundle,
        '--review-evidence',
        sourceInputs.reviewEvidence,
        '--duration-calibration-evidence',
        sourceInputs.durationCalibrationEvidence,
        '--review-package',
        sourceInputs.reviewPackage,
        '--review-record-preflight',
        sourceInputs.reviewRecordPreflight,
        '--candidate-hygiene',
        sourceInputs.candidateHygiene,
        '--candidate-refresh-package',
        sourceInputs.candidateRefreshPackage,
        '--duration-asset-utilization',
        sourceInputs.durationAssetUtilization,
        '--candidate-refresh-execution',
        sourceInputs.candidateRefreshExecution,
        '--candidate-refresh-authorization-package',
        sourceInputs.candidateRefreshAuthorizationPackage,
        '--candidate-baseline-materialization',
        sourceInputs.candidateBaselineMaterialization,
        '--runtime-seed-evidence-pipeline',
        sourceInputs.runtimeSeedEvidencePipeline,
        '--runtime-seed-import-execution',
        sourceInputs.runtimeSeedImportExecution,
        '--completed-task-export-report',
        sourceInputs.completedTaskExportReport,
        '--runtime-candidate-alignment-preflight',
        sourceInputs.runtimeCandidateAlignmentPreflight,
        '--runtime-task-alignment-refresh-package',
        sourceInputs.runtimeTaskAlignmentRefreshPackage,
        '--runtime-task-alignment-review-evidence',
        sourceInputs.runtimeTaskAlignmentReviewEvidence,
        '--duration-sample-collection-package',
        sourceInputs.durationSampleCollectionPackage,
        '--duration-sample-coverage-evidence',
        sourceInputs.durationSampleCoverageEvidence,
        '--runtime-material-package',
        sourceInputs.runtimeMaterialPackage,
        '--real-production-outcome-package',
        sourceInputs.realProductionOutcomePackage,
        '--staging-authorization',
        sourceInputs.stagingAuthorization,
        '--output',
        outputs.operatorHandoffJson,
      ],
      runCommand,
    })
    steps.push(operatorHandoffStep)
  }

  if (steps.every((step) => step.exitCode === 0)) {
    const operatorHandoffPreflightStep = await runRefreshStep({
      id: 'operator_handoff_preflight',
      command: process.execPath,
      args: [
        OPERATOR_HANDOFF_PREFLIGHT_SCRIPT,
        '--handoff',
        outputs.operatorHandoffJson,
        '--output',
        outputs.operatorHandoffPreflightJson,
      ],
      runCommand,
    })
    steps.push(operatorHandoffPreflightStep)
  }

  if (steps.every((step) => step.exitCode === 0)) {
    const gapStep = await runRefreshStep({
      id: 'real_evidence_gap_summary',
      command: process.execPath,
      args: [
        GAP_SUMMARY_SCRIPT,
        '--readiness',
        outputs.readinessJson,
        '--evidence-sources',
        sourceInputs.evidenceSources,
        '--review-evidence',
        sourceInputs.reviewEvidence,
        '--duration-calibration-evidence',
        sourceInputs.durationCalibrationEvidence,
        '--runtime-seed-evidence-pipeline',
        sourceInputs.runtimeSeedEvidencePipeline,
        '--runtime-seed-import-readiness-seal',
        sourceInputs.runtimeSeedImportReadinessSeal,
        '--duration-sample-collection-package',
        sourceInputs.durationSampleCollectionPackage,
        '--real-duration-sample-material-template',
        sourceInputs.realDurationSampleMaterialTemplate,
        '--real-duration-sample-collection-kit',
        sourceInputs.realDurationSampleCollectionKit,
        '--real-duration-sample-collection-kit-preflight',
        sourceInputs.realDurationSampleCollectionKitPreflight,
        '--real-duration-sample-material-preflight',
        sourceInputs.realDurationSampleMaterialPreflight,
        '--real-duration-sample-source-export',
        sourceInputs.realDurationSampleSourceExport,
        '--real-duration-sample-source-export-report',
        sourceInputs.realDurationSampleSourceExportReport,
        '--duration-asset-utilization',
        sourceInputs.durationAssetUtilization,
        '--completed-task-export-report',
        sourceInputs.completedTaskExportReport,
        '--runtime-candidate-alignment-preflight',
        sourceInputs.runtimeCandidateAlignmentPreflight,
        '--runtime-task-alignment-refresh-package',
        sourceInputs.runtimeTaskAlignmentRefreshPackage,
        '--operator-handoff',
        outputs.operatorHandoffJson,
        '--operator-handoff-preflight',
        outputs.operatorHandoffPreflightJson,
        '--candidate-refresh-authorization-package',
        sourceInputs.candidateRefreshAuthorizationPackage,
        '--candidate-refresh-execution-readiness-seal',
        sourceInputs.candidateRefreshExecutionReadinessSeal,
        '--candidate-baseline-materialization-readiness-seal',
        sourceInputs.candidateBaselineMaterializationReadinessSeal,
        '--real-production-outcome-package',
        sourceInputs.realProductionOutcomePackage,
        '--output',
        outputs.gapSummaryMarkdown,
        '--json-output',
        outputs.gapSummaryJson,
        '--json',
      ],
      runCommand,
    })
    steps.push(gapStep)
    gapSummary = await persistGapSummarySourceInputSummary({
      gapSummaryPath: outputs.gapSummaryJson,
      gapSummary: gapStep.parsedStdout,
      sourceInputSummary,
    })
  }

  if (steps.every((step) => step.exitCode === 0)) {
    const readOnlyQueuePlanStep = await runRefreshStep({
      id: 'read_only_evidence_queue_plan',
      command: process.execPath,
      args: [
        READ_ONLY_QUEUE_PLAN_SCRIPT,
        '--input',
        outputs.gapSummaryJson,
        '--output',
        outputs.readOnlyEvidenceQueuePlanJson,
        '--markdown',
        outputs.readOnlyEvidenceQueuePlanMarkdown,
        '--plan-only',
        '--json',
      ],
      runCommand,
    })
    steps.push(readOnlyQueuePlanStep)
    readOnlyQueuePlanSummary = readOnlyQueuePlanStep.parsedStdout
  }

  if (steps.every((step) => step.exitCode === 0)) {
    const blockedGateActionChecklistStep = await runRefreshStep({
      id: 'blocked_gate_action_checklist',
      command: process.execPath,
      args: [
        BLOCKED_GATE_ACTION_CHECKLIST_SCRIPT,
        '--input',
        outputs.gapSummaryJson,
        '--output',
        outputs.blockedGateActionChecklistJson,
        '--markdown',
        outputs.blockedGateActionChecklistMarkdown,
        '--json',
      ],
      runCommand,
    })
    steps.push(blockedGateActionChecklistStep)
    blockedGateActionChecklistSummary = blockedGateActionChecklistStep.parsedStdout
  }

  if (steps.every((step) => step.exitCode === 0)) {
    const blockedGateActionChecklistFreshnessStep = await runRefreshStep({
      id: 'blocked_gate_action_checklist_freshness',
      command: process.execPath,
      args: [
        BLOCKED_GATE_ACTION_CHECKLIST_FRESHNESS_SCRIPT,
        '--gap-summary',
        outputs.gapSummaryJson,
        '--checklist',
        outputs.blockedGateActionChecklistJson,
        '--output',
        outputs.blockedGateActionChecklistFreshnessJson,
        '--markdown',
        outputs.blockedGateActionChecklistFreshnessMarkdown,
        '--json',
      ],
      runCommand,
    })
    steps.push(blockedGateActionChecklistFreshnessStep)
    blockedGateActionChecklistFreshnessSummary = blockedGateActionChecklistFreshnessStep.parsedStdout
  }

  if (steps.every((step) => step.exitCode === 0)) {
    const dashboardStep = await runRefreshStep({
      id: 'release_dashboard_default_master_plan',
      command: process.execPath,
      args: [
        RELEASE_DASHBOARD_SCRIPT,
        '--profile',
        'release-local',
        '--gate',
        'default-master-plan-evidence-source-kit',
        '--dry-run',
        '--report-root',
        args.reportRoot,
        '--default-master-plan-gap-summary',
        outputs.gapSummaryJson,
      ],
      runCommand,
      parseStdout: parseDashboardStdout,
    })
    steps.push(dashboardStep)
    dashboardSummary = dashboardStep.parsedStdout
  }

  const failedStepCount = steps.filter((step) => step.exitCode !== 0).length
  const gateSummary = normalizeGateSummary(gapSummary.gateSummary ?? readinessSummary.gateSummary)
  const status = failedStepCount > 0
    ? 'refresh_failed'
    : String(gapSummary.status ?? readinessSummary.status ?? 'unknown')

  const report = {
    schemaVersion: 'workbuddy-default-master-plan-readiness-dashboard-refresh/v1',
    generatedAt: now.toISOString(),
    source: 'refresh-default-master-plan-readiness-dashboard',
    status,
    productionReady: Boolean(gapSummary.productionReady ?? readinessSummary.productionReady),
    gateSummary,
    completionRate: gateSummary.completionRate,
    blockedGateActionCoverageSummary: normalizeBlockedGateActionCoverageSummary(
      gapSummary.blockedGateActionCoverageSummary
        ?? dashboardSummary.defaultMasterPlanActionHandoff?.blockedGateActionCoverageSummary,
    ),
    operatorUnblockRequirementSummary: normalizeOperatorUnblockRequirementSummary(
      gapSummary.operatorUnblockRequirementSummary
        ?? dashboardSummary.defaultMasterPlanActionHandoff?.operatorUnblockRequirementSummary,
    ),
    operatorCommandPlanSummary: normalizeOperatorCommandPlanSummary(
      gapSummary.operatorCommandPlanSummary
        ?? dashboardSummary.defaultMasterPlanActionHandoff?.operatorCommandPlanSummary,
    ),
    operatorCommandExecutionPlanSummary: normalizeOperatorCommandExecutionPlanSummary(
      gapSummary.operatorCommandExecutionPlanSummary
        ?? dashboardSummary.defaultMasterPlanActionHandoff?.operatorCommandExecutionPlanSummary,
    ),
    operatorCommandExecutionPlan: normalizeOperatorCommandExecutionPlan(
      gapSummary.operatorCommandExecutionPlan
        ?? dashboardSummary.defaultMasterPlanActionHandoff?.operatorCommandExecutionPlan,
    ),
    operatorCommandExecutionQueueSummary: normalizeOperatorCommandExecutionQueueSummary(
      gapSummary.operatorCommandExecutionQueueSummary
        ?? dashboardSummary.defaultMasterPlanActionHandoff?.operatorCommandExecutionQueueSummary,
    ),
    operatorCommandExecutionQueues: normalizeOperatorCommandExecutionQueues(
      gapSummary.operatorCommandExecutionQueues
        ?? dashboardSummary.defaultMasterPlanActionHandoff?.operatorCommandExecutionQueues,
    ),
    readOnlyEvidenceQueuePlanStatus: String(readOnlyQueuePlanSummary.status ?? '').trim() || 'unknown',
    readOnlyEvidenceQueuePlanSummary: normalizeReadOnlyEvidenceQueuePlanSummary(readOnlyQueuePlanSummary.summary),
    readOnlyEvidenceQueueExecutionEvidenceBoundary: normalizeReadOnlyQueueExecutionEvidenceBoundary(
      readOnlyQueuePlanSummary.executionEvidenceBoundary
        ?? readOnlyQueuePlanSummary.execution_evidence_boundary,
    ),
    blockedGateActionChecklistStatus: String(blockedGateActionChecklistSummary.status ?? '').trim() || 'unknown',
    blockedGateActionChecklistSummary: normalizeBlockedGateActionChecklistSummary(
      blockedGateActionChecklistSummary.summary,
    ),
    blockedGateActionChecklistInputDigest: normalizeInputDigest(
      blockedGateActionChecklistSummary.inputDigest
        ?? blockedGateActionChecklistSummary.input_digest,
    ),
    blockedGateActionChecklistEvidenceBoundary: normalizeChecklistEvidenceBoundary(
      blockedGateActionChecklistSummary.evidenceBoundary
        ?? blockedGateActionChecklistSummary.evidence_boundary,
    ),
    blockedGateActionChecklistCompactActionItems: normalizeBlockedGateActionChecklistCompactActionItems(
      blockedGateActionChecklistSummary.actionChecklist
        ?? blockedGateActionChecklistSummary.action_checklist,
    ),
    blockedGateActionChecklistFreshnessStatus: String(blockedGateActionChecklistFreshnessSummary.status ?? '').trim() || 'unknown',
    blockedGateActionChecklistFreshnessSummary: normalizeChecklistFreshnessSummary(
      blockedGateActionChecklistFreshnessSummary.summary,
    ),
    blockedGateActionChecklistFreshnessCurrentGapSummaryDigest: normalizeInputDigest(
      blockedGateActionChecklistFreshnessSummary.currentGapSummaryDigest
        ?? blockedGateActionChecklistFreshnessSummary.current_gap_summary_digest,
    ),
    blockedGateActionChecklistFreshnessEvidenceBoundary: normalizeChecklistEvidenceBoundary(
      blockedGateActionChecklistFreshnessSummary.evidenceBoundary
        ?? blockedGateActionChecklistFreshnessSummary.evidence_boundary,
    ),
    failedStepCount,
    outputs: Object.fromEntries(Object.entries({
      ...outputs,
      dashboardReportDir: dashboardSummary.reportDir ?? '',
    }).map(([key, value]) => [key, repoRelative(value)])),
    sourceInputs: Object.fromEntries(Object.entries(sourceInputs).map(([key, value]) => [key, repoRelative(value)])),
    sourceInputSummary,
    sourceInputChecks,
    steps: steps.map((step) => ({
      id: step.id,
      command: repoRelative(step.args[0] ?? step.command),
      args: step.args.slice(1).map((value) => path.isAbsolute(value) ? repoRelative(value) : value),
      exitCode: step.exitCode,
      durationMs: step.durationMs,
      parsedStdout: step.parsedStdout,
      stderrTail: tail(step.stderr),
    })),
    mutationBoundary: {
      runsReadOnlyEvidenceScripts: true,
      writesReportFilesOnly: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
      writesDurationSamples: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  }

  await writeFile(outputs.refreshJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(outputs.refreshMarkdown, renderMarkdown(report), 'utf8')

  return report
}

async function runRefreshStep({ id, command, args, runCommand, parseStdout = parseJsonStdout }) {
  const result = await runCommand(command, args)
  return {
    id,
    command,
    args,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    parsedStdout: parseStdout(result.stdout),
  }
}

async function persistGapSummarySourceInputSummary({ gapSummaryPath, gapSummary, sourceInputSummary }) {
  let fileSummary = null
  try {
    const raw = await readFile(gapSummaryPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      fileSummary = parsed
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const baseSummary = fileSummary
    ?? (gapSummary && typeof gapSummary === 'object' && !Array.isArray(gapSummary) ? gapSummary : {})
  const enrichedSummary = {
    ...baseSummary,
    sourceInputSummary,
  }

  await writeFile(gapSummaryPath, `${JSON.stringify(enrichedSummary, null, 2)}\n`, 'utf8')
  return enrichedSummary
}

function runCommandDefault(command, args) {
  const startedAt = Date.now()
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: process.env,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${error.stack || error.message}`,
        durationMs: Date.now() - startedAt,
      })
    })
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
      })
    })
  })
}

function parseJsonStdout(stdout) {
  const text = String(stdout ?? '').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function parseDashboardStdout(stdout) {
  const text = String(stdout ?? '')
  const match = text.match(/Release dashboard report:\s*(.+)/)
  return {
    reportDir: match ? match[1].trim() : '',
  }
}

function buildSourceInputs(sourceRoot) {
  const root = path.resolve(sourceRoot || DEFAULT_SOURCE_ROOT)
  const profileRoot = path.join(path.dirname(root), 'default-master-plan-profiles')
  return {
    discovery: path.join(root, 'candidate-discovery.json'),
    durationGapPlan: path.join(root, 'duration-sample-gap-plan-school.json'),
    evidenceBundle: path.join(root, 'evidence-bundle.json'),
    evidenceSources: path.join(root, 'evidence-sources-report.json'),
    reviewEvidence: path.join(root, 'pm-review-evidence.json'),
    reviewPackage: path.join(root, 'pm-review-package.json'),
    reviewRecordPreflight: path.join(root, 'pm-review-record-preflight.json'),
    candidateHygiene: path.join(root, 'candidate-export-hygiene.json'),
    candidateRefreshPackage: path.join(root, 'candidate-refresh-package.json'),
    durationCalibrationEvidence: path.join(root, 'duration-calibration-evidence.json'),
    runtimeSeedEvidencePipeline: path.join(root, 'runtime-seed-evidence-pipeline.json'),
    runtimeSeedImportExecution: path.join(root, 'runtime-seed-import-execution.json'),
    runtimeSeedImportReadinessSeal: path.join(profileRoot, 'runtime-seed-import-readiness-seal.json'),
    durationSampleCollectionPackage: path.join(root, 'duration-sample-collection-package.json'),
    durationSampleCoverageEvidence: path.join(root, 'duration-sample-coverage-evidence.json'),
    realDurationSampleMaterialTemplate: path.join(root, 'real-duration-sample-material.template.json'),
    realDurationSampleCollectionKit: path.join(root, 'real-duration-sample-collection-kit.json'),
    realDurationSampleCollectionKitPreflight: path.join(root, 'real-duration-sample-collection-kit-preflight.json'),
    realDurationSampleMaterialPreflight: path.join(root, 'real-duration-sample-material-preflight.json'),
    realDurationSampleSourceExport: path.join(root, 'source-exports', 'duration-experience-samples-export.json'),
    realDurationSampleSourceExportReport: path.join(root, 'source-exports', 'duration-experience-samples-export.report.json'),
    durationAssetUtilization: path.join(root, 'duration-asset-utilization-report.json'),
    candidateRefreshExecution: path.join(root, 'candidate-refresh-execution.json'),
    candidateBaselineMaterialization: path.join(root, 'candidate-baseline-materialization.json'),
    completedTaskExportReport: path.join(root, 'source-exports', 'completed-task-export.report.json'),
    runtimeCandidateAlignmentPreflight: path.join(root, 'runtime-candidate-alignment-preflight.json'),
    runtimeTaskAlignmentRefreshPackage: path.join(root, 'runtime-task-alignment-refresh-package.json'),
    runtimeTaskAlignmentReviewEvidence: path.join(root, 'runtime-task-alignment-review-evidence.json'),
    candidateRefreshAuthorizationPackage: path.join(root, 'candidate-refresh-authorization-package.json'),
    candidateRefreshExecutionReadinessSeal: path.join(root, 'candidate-refresh-execution-readiness-seal.json'),
    candidateBaselineMaterializationReadinessSeal: path.join(root, 'candidate-baseline-materialization-readiness-seal.json'),
    runtimeMaterialPackage: path.join(root, 'runtime-material-package.json'),
    realProductionOutcomePackage: path.join(root, 'real-production-outcome-package.json'),
    dependencyWriterEvidence: path.join(root, 'dependency-writer-evidence.json'),
    runtimePublicationEvidence: path.join(root, 'runtime-publication-evidence.json'),
    postPublishSmokeRollbackEvidence: path.join(root, 'post-publish-smoke-rollback-evidence.json'),
    stagingAuthorization: path.join(root, 'staging-runtime', 'staging-authorization.json'),
    sourceManifest: path.join(root, 'source-exports', 'source-exports-manifest.json'),
  }
}

async function inspectSourceInputs(sourceInputs) {
  const entries = await Promise.all(Object.entries(sourceInputs).map(async ([key, filePath]) => [
    key,
    await inspectSourceInput(filePath),
  ]))
  return Object.fromEntries(entries)
}

async function inspectSourceInput(filePath) {
  const normalizedPath = path.resolve(filePath)
  try {
    const fileStat = await stat(normalizedPath)
    if (!fileStat.isFile()) {
      return {
        path: repoRelative(normalizedPath),
        exists: false,
        sizeBytes: 0,
        sha256: '',
        issue: 'not_a_file',
      }
    }
    const content = await readFile(normalizedPath)
    return {
      path: repoRelative(normalizedPath),
      exists: true,
      sizeBytes: fileStat.size,
      sha256: createHash('sha256').update(content).digest('hex'),
      issue: '',
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        path: repoRelative(normalizedPath),
        exists: false,
        sizeBytes: 0,
        sha256: '',
        issue: 'missing',
      }
    }
    throw error
  }
}

function summarizeSourceInputChecks(sourceInputChecks) {
  const entries = Object.entries(sourceInputChecks)
  const missingKeys = entries
    .filter(([, value]) => value?.exists !== true)
    .map(([key]) => key)
  const present = entries.length - missingKeys.length
  const hashed = entries.filter(([, value]) => (
    value?.exists === true
    && typeof value.sha256 === 'string'
    && value.sha256.length > 0
  )).length
  return {
    total: entries.length,
    present,
    missing: missingKeys.length,
    hashed,
    ready: entries.length > 0 && missingKeys.length === 0 && hashed === present,
    missingKeys,
  }
}

function normalizeGateSummary(value) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const total = readNumber(record.total)
  const pass = readNumber(record.pass)
  const blocked = readNumber(record.blocked)
  const fail = readNumber(record.fail)
  const suppliedCompletionRate = Number(record.completionRate ?? record.completion_rate)
  return {
    total,
    pass,
    blocked,
    fail,
    completionRate: Number.isFinite(suppliedCompletionRate)
      ? suppliedCompletionRate
      : total > 0
        ? Number(((pass / total) * 100).toFixed(1))
        : 0,
  }
}

function readNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
}

function arrayOfObjects(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : []
}

function normalizeBlockedGateActionCoverageSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const totalBlockedGateCount = readNumber(summary.totalBlockedGateCount ?? summary.total_blocked_gate_count)
  const coveredBlockedGateCount = readNumber(summary.coveredBlockedGateCount ?? summary.covered_blocked_gate_count)
  const suppliedCoverageRate = Number(summary.coverageRate ?? summary.coverage_rate)
  const uncoveredBlockedGateCount = Number.isFinite(Number(summary.uncoveredBlockedGateCount ?? summary.uncovered_blocked_gate_count))
    ? Number(summary.uncoveredBlockedGateCount ?? summary.uncovered_blocked_gate_count)
    : Math.max(totalBlockedGateCount - coveredBlockedGateCount, 0)
  return {
    totalBlockedGateCount,
    coveredBlockedGateCount,
    uncoveredBlockedGateCount,
    coverageRate: Number.isFinite(suppliedCoverageRate)
      ? suppliedCoverageRate
      : totalBlockedGateCount > 0
        ? Number(((coveredBlockedGateCount / totalBlockedGateCount) * 100).toFixed(1))
        : 100,
    coveredBlockedGateIds: arrayOfStrings(summary.coveredBlockedGateIds ?? summary.covered_blocked_gate_ids),
    uncoveredBlockedGateIds: arrayOfStrings(summary.uncoveredBlockedGateIds ?? summary.uncovered_blocked_gate_ids),
    coveringActionGroupIds: arrayOfStrings(summary.coveringActionGroupIds ?? summary.covering_action_group_ids),
  }
}

function normalizeOperatorUnblockRequirementSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    actionGroupCount: readNumber(summary.actionGroupCount ?? summary.action_group_count),
    blockedActionGroupCount: readNumber(summary.blockedActionGroupCount ?? summary.blocked_action_group_count),
    deferredActionGroupCount: readNumber(summary.deferredActionGroupCount ?? summary.deferred_action_group_count),
    operatorRequirementActionCount: readNumber(summary.operatorRequirementActionCount ?? summary.operator_requirement_action_count),
    envUnlockCount: readNumber(summary.envUnlockCount ?? summary.env_unlock_count),
    requiredFlagCount: readNumber(summary.requiredFlagCount ?? summary.required_flag_count),
    operatorFieldCount: readNumber(summary.operatorFieldCount ?? summary.operator_field_count),
    evidenceInputCount: readNumber(summary.evidenceInputCount ?? summary.evidence_input_count),
    environmentTargetCount: readNumber(summary.environmentTargetCount ?? summary.environment_target_count),
    verificationCommandCount: readNumber(summary.verificationCommandCount ?? summary.verification_command_count),
    repairRequiredStepCount: readNumber(summary.repairRequiredStepCount ?? summary.repair_required_step_count),
    dbRepairRequiredStepCount: readNumber(summary.dbRepairRequiredStepCount ?? summary.db_repair_required_step_count),
    blockedPlanStepCount: readNumber(summary.blockedPlanStepCount ?? summary.blocked_plan_step_count),
    envUnlockVariables: arrayOfStrings(summary.envUnlockVariables ?? summary.env_unlock_variables),
    requiredFlags: arrayOfStrings(summary.requiredFlags ?? summary.required_flags),
    operatorFields: arrayOfStrings(summary.operatorFields ?? summary.operator_fields),
    evidenceInputArtifacts: arrayOfStrings(summary.evidenceInputArtifacts ?? summary.evidence_input_artifacts),
    requiredEnvironmentTargets: arrayOfStrings(summary.requiredEnvironmentTargets ?? summary.required_environment_targets),
    verificationCommands: arrayOfStrings(summary.verificationCommands ?? summary.verification_commands),
    repairRequiredStepIds: arrayOfStrings(summary.repairRequiredStepIds ?? summary.repair_required_step_ids),
    dbRepairRequiredStepIds: arrayOfStrings(summary.dbRepairRequiredStepIds ?? summary.db_repair_required_step_ids),
    blockedPlanStepIds: arrayOfStrings(summary.blockedPlanStepIds ?? summary.blocked_plan_step_ids),
  }
}

function normalizeOperatorCommandPlanSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    actionGroupCount: readNumber(summary.actionGroupCount ?? summary.action_group_count),
    totalCommandCount: readNumber(summary.totalCommandCount ?? summary.total_command_count),
    blockedCommandCount: readNumber(summary.blockedCommandCount ?? summary.blocked_command_count),
    deferredCommandCount: readNumber(summary.deferredCommandCount ?? summary.deferred_command_count),
    readOnlyEvidenceCommandCount: readNumber(summary.readOnlyEvidenceCommandCount ?? summary.read_only_evidence_command_count),
    guardedWriteOrLiveCommandCount: readNumber(summary.guardedWriteOrLiveCommandCount ?? summary.guarded_write_or_live_command_count),
    manualPrerequisiteCommandCount: readNumber(summary.manualPrerequisiteCommandCount ?? summary.manual_prerequisite_command_count),
  }
}

function normalizeOperatorCommandExecutionPlanSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    actionGroupCount: readNumber(summary.actionGroupCount ?? summary.action_group_count),
    rawCommandCount: readNumber(summary.rawCommandCount ?? summary.raw_command_count),
    uniqueCommandCount: readNumber(summary.uniqueCommandCount ?? summary.unique_command_count),
    duplicateCommandCount: readNumber(summary.duplicateCommandCount ?? summary.duplicate_command_count),
    blockedCommandCount: readNumber(summary.blockedCommandCount ?? summary.blocked_command_count),
    deferredCommandCount: readNumber(summary.deferredCommandCount ?? summary.deferred_command_count),
    readOnlyEvidenceCommandCount: readNumber(summary.readOnlyEvidenceCommandCount ?? summary.read_only_evidence_command_count),
    guardedWriteOrLiveCommandCount: readNumber(summary.guardedWriteOrLiveCommandCount ?? summary.guarded_write_or_live_command_count),
    manualPrerequisiteCommandCount: readNumber(summary.manualPrerequisiteCommandCount ?? summary.manual_prerequisite_command_count),
  }
}

function normalizeOperatorCommandExecutionPlan(value) {
  return Array.isArray(value)
    ? value.map((entry) => {
        const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}
        return {
          command: String(record.command ?? '').trim().replace(/\s+/g, ' '),
          executionReadiness: String(record.executionReadiness ?? record.execution_readiness ?? '').trim(),
          commandKind: String(record.commandKind ?? record.command_kind ?? '').trim(),
          actionGroupIds: arrayOfStrings(record.actionGroupIds ?? record.action_group_ids),
          commandSources: arrayOfStrings(record.commandSources ?? record.command_sources),
          duplicateCount: readNumber(record.duplicateCount ?? record.duplicate_count),
        }
      }).filter((entry) => entry.command)
    : []
}

function normalizeOperatorCommandExecutionQueueSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    totalUniqueCommandCount: readNumber(summary.totalUniqueCommandCount ?? summary.total_unique_command_count),
    readOnlyEvidenceCommandCount: readNumber(summary.readOnlyEvidenceCommandCount ?? summary.read_only_evidence_command_count),
    manualPrerequisiteCommandCount: readNumber(summary.manualPrerequisiteCommandCount ?? summary.manual_prerequisite_command_count),
    guardedWriteOrLiveCommandCount: readNumber(summary.guardedWriteOrLiveCommandCount ?? summary.guarded_write_or_live_command_count),
    autoRunAllowedCommandCount: readNumber(summary.autoRunAllowedCommandCount ?? summary.auto_run_allowed_command_count),
    autoRunForbiddenCommandCount: readNumber(summary.autoRunForbiddenCommandCount ?? summary.auto_run_forbidden_command_count),
    queueIds: arrayOfStrings(summary.queueIds ?? summary.queue_ids),
  }
}

function normalizeOperatorCommandExecutionQueues(value) {
  const queues = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    readOnlyEvidence: normalizeOperatorCommandExecutionQueueEntries(queues.readOnlyEvidence ?? queues.read_only_evidence),
    manualPrerequisite: normalizeOperatorCommandExecutionQueueEntries(queues.manualPrerequisite ?? queues.manual_prerequisite),
    guardedWriteOrLive: normalizeOperatorCommandExecutionQueueEntries(queues.guardedWriteOrLive ?? queues.guarded_write_or_live),
  }
}

function normalizeOperatorCommandExecutionQueueEntries(value) {
  return Array.isArray(value)
    ? value.map((entry) => {
        const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}
        return {
          command: String(record.command ?? '').trim().replace(/\s+/g, ' '),
          executionReadiness: String(record.executionReadiness ?? record.execution_readiness ?? '').trim(),
          commandKind: String(record.commandKind ?? record.command_kind ?? '').trim(),
          actionGroupIds: arrayOfStrings(record.actionGroupIds ?? record.action_group_ids),
          commandSources: arrayOfStrings(record.commandSources ?? record.command_sources),
          duplicateCount: readNumber(record.duplicateCount ?? record.duplicate_count),
          queueId: String(record.queueId ?? record.queue_id ?? '').trim(),
          autoRunAllowed: record.autoRunAllowed === true || record.auto_run_allowed === true,
        }
      }).filter((entry) => entry.command)
    : []
}

function normalizeReadOnlyEvidenceQueuePlanSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    sourceReadOnlyEvidenceCommandCount: readNumber(summary.sourceReadOnlyEvidenceCommandCount ?? summary.source_read_only_evidence_command_count),
    plannedCommandCount: readNumber(summary.plannedCommandCount ?? summary.planned_command_count),
    rejectedReadOnlyQueueCommandCount: readNumber(summary.rejectedReadOnlyQueueCommandCount ?? summary.rejected_read_only_queue_command_count),
    excludedManualPrerequisiteCommandCount: readNumber(summary.excludedManualPrerequisiteCommandCount ?? summary.excluded_manual_prerequisite_command_count),
    excludedGuardedWriteOrLiveCommandCount: readNumber(summary.excludedGuardedWriteOrLiveCommandCount ?? summary.excluded_guarded_write_or_live_command_count),
    excludedForbiddenCommandCount: readNumber(summary.excludedForbiddenCommandCount ?? summary.excluded_forbidden_command_count),
    executionRequested: summary.executionRequested === true || summary.execution_requested === true,
    executionAllowed: summary.executionAllowed === true || summary.execution_allowed === true,
    planOnly: summary.planOnly !== false && summary.plan_only !== false,
  }
}

function normalizeReadOnlyQueueExecutionEvidenceBoundary(value) {
  const boundary = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    evidenceTier: String(boundary.evidenceTier ?? boundary.evidence_tier ?? '').trim() || 'unknown',
    canCloseProductionReadinessGates:
      boundary.canCloseProductionReadinessGates === true
      || boundary.can_close_production_readiness_gates === true,
    nonClosingEvidenceBoundary: arrayOfStrings(
      boundary.nonClosingEvidenceBoundary ?? boundary.non_closing_evidence_boundary,
    ),
    cannotCloseGateIds: arrayOfStrings(boundary.cannotCloseGateIds ?? boundary.cannot_close_gate_ids),
  }
}

function normalizeBlockedGateActionChecklistSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    blockedGateCount: readNumber(summary.blockedGateCount ?? summary.blocked_gate_count),
    coveredBlockedGateCount: readNumber(summary.coveredBlockedGateCount ?? summary.covered_blocked_gate_count),
    uncoveredBlockedGateCount: readNumber(summary.uncoveredBlockedGateCount ?? summary.uncovered_blocked_gate_count),
    actionGroupCount: readNumber(summary.actionGroupCount ?? summary.action_group_count),
    blockedActionGroupCount: readNumber(summary.blockedActionGroupCount ?? summary.blocked_action_group_count),
    deferredActionGroupCount: readNumber(summary.deferredActionGroupCount ?? summary.deferred_action_group_count),
    readOnlyEvidenceCommandCount: readNumber(summary.readOnlyEvidenceCommandCount ?? summary.read_only_evidence_command_count),
    manualPrerequisiteCommandCount: readNumber(summary.manualPrerequisiteCommandCount ?? summary.manual_prerequisite_command_count),
    guardedWriteOrLiveCommandCount: readNumber(summary.guardedWriteOrLiveCommandCount ?? summary.guarded_write_or_live_command_count),
    autoRunnableCommandCount: readNumber(summary.autoRunnableCommandCount ?? summary.auto_runnable_command_count),
    productionClosingCommandCount: readNumber(summary.productionClosingCommandCount ?? summary.production_closing_command_count),
  }
}

function normalizeBlockedGateActionChecklistCompactActionItems(value) {
  return arrayOfObjects(value)
    .map((entry) => {
      const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}
      const commandQueues = record.commandQueues ?? record.command_queues
      const queues = commandQueues && typeof commandQueues === 'object' && !Array.isArray(commandQueues)
        ? commandQueues
        : {}
      const blockers = arrayOfStrings(record.blockers).slice(0, 5)
      return {
        actionGroupId: String(record.actionGroupId ?? record.action_group_id ?? '').trim(),
        priority: readNumber(record.priority),
        status: String(record.status ?? '').trim() || 'unknown',
        coveredGateIds: arrayOfStrings(record.coveredGateIds ?? record.covered_gate_ids),
        nextAction: String(record.nextAction ?? record.next_action ?? '').trim(),
        envUnlockVariables: arrayOfStrings(record.envUnlockVariables ?? record.env_unlock_variables),
        requiredFlags: arrayOfStrings(record.requiredFlags ?? record.required_flags),
        operatorFields: arrayOfStrings(record.operatorFields ?? record.operator_fields),
        evidenceInputArtifacts: arrayOfStrings(record.evidenceInputArtifacts ?? record.evidence_input_artifacts),
        requiredEnvironmentTargets: arrayOfStrings(record.requiredEnvironmentTargets ?? record.required_environment_targets),
        blockerCount: arrayOfStrings(record.blockers).length,
        blockers,
        commandCounts: {
          readOnlyEvidence: arrayOfObjects(queues.readOnlyEvidence ?? queues.read_only_evidence).length,
          manualPrerequisite: arrayOfObjects(queues.manualPrerequisite ?? queues.manual_prerequisite).length,
          guardedWriteOrLive: arrayOfObjects(queues.guardedWriteOrLive ?? queues.guarded_write_or_live).length,
        },
      }
    })
    .filter((entry) => entry.actionGroupId)
    .sort((a, b) => a.priority - b.priority)
}

function normalizeChecklistEvidenceBoundary(value) {
  const boundary = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    evidenceTier: String(boundary.evidenceTier ?? boundary.evidence_tier ?? '').trim() || 'unknown',
    canCloseProductionReadinessGates:
      boundary.canCloseProductionReadinessGates === true
      || boundary.can_close_production_readiness_gates === true,
    nonClosingEvidenceBoundary: arrayOfStrings(
      boundary.nonClosingEvidenceBoundary ?? boundary.non_closing_evidence_boundary,
    ),
  }
}

function normalizeChecklistFreshnessSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    fresh: summary.fresh === true,
    digestAvailable: summary.digestAvailable === true || summary.digest_available === true,
    algorithmMatches: summary.algorithmMatches === true || summary.algorithm_matches === true,
    sha256Matches: summary.sha256Matches === true || summary.sha256_matches === true,
    sizeBytesMatches: summary.sizeBytesMatches === true || summary.size_bytes_matches === true,
  }
}

function normalizeInputDigest(value) {
  const digest = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    algorithm: String(digest.algorithm ?? '').trim() || 'sha256',
    sha256: String(digest.sha256 ?? '').trim(),
    sizeBytes: readNumber(digest.sizeBytes ?? digest.size_bytes),
  }
}

function renderCompactActionItems(items) {
  const actionItems = Array.isArray(items) ? items : []
  if (!actionItems.length) {
    return ['- No blocked gate action items were projected from the checklist.']
  }

  const lines = []
  for (const item of actionItems) {
    lines.push(`- action_group: ${item.priority} | ${item.status} | ${item.actionGroupId}`)
    lines.push(`  - covered_gates: ${item.coveredGateIds.length ? item.coveredGateIds.join(', ') : 'none'}`)
    lines.push(`  - next_action: ${item.nextAction || 'not available'}`)
    lines.push(`  - commands: read_only=${item.commandCounts.readOnlyEvidence}, manual_prerequisite=${item.commandCounts.manualPrerequisite}, guarded=${item.commandCounts.guardedWriteOrLive}`)
    if (item.envUnlockVariables.length) lines.push(`  - env_unlocks: ${item.envUnlockVariables.join(', ')}`)
    if (item.requiredFlags.length) lines.push(`  - required_flags: ${item.requiredFlags.join(', ')}`)
    if (item.operatorFields.length) lines.push(`  - operator_fields: ${item.operatorFields.join(', ')}`)
    if (item.evidenceInputArtifacts.length) lines.push(`  - evidence_inputs: ${item.evidenceInputArtifacts.join(', ')}`)
    if (item.requiredEnvironmentTargets.length) lines.push(`  - environment_targets: ${item.requiredEnvironmentTargets.join(', ')}`)
    if (item.blockers.length) lines.push(`  - blockers: ${item.blockers.join(', ')}`)
  }
  return lines
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Readiness Dashboard Refresh',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Production ready: ${report.productionReady ? 'yes' : 'no'}`,
    `Gate completion: ${report.gateSummary.pass}/${report.gateSummary.total} (${report.gateSummary.completionRate}%)`,
    `Gate blockers: blocked=${report.gateSummary.blocked}, fail=${report.gateSummary.fail}`,
    `Blocked gate action coverage: ${report.blockedGateActionCoverageSummary.coveredBlockedGateCount}/${report.blockedGateActionCoverageSummary.totalBlockedGateCount} (${report.blockedGateActionCoverageSummary.coverageRate}%), uncovered=${report.blockedGateActionCoverageSummary.uncoveredBlockedGateCount}`,
    `Operator unblock requirements: actions=${report.operatorUnblockRequirementSummary.operatorRequirementActionCount}, env_unlocks=${report.operatorUnblockRequirementSummary.envUnlockCount}, flags=${report.operatorUnblockRequirementSummary.requiredFlagCount}, operator_fields=${report.operatorUnblockRequirementSummary.operatorFieldCount}, evidence_inputs=${report.operatorUnblockRequirementSummary.evidenceInputCount}, environment_targets=${report.operatorUnblockRequirementSummary.environmentTargetCount}, verification_commands=${report.operatorUnblockRequirementSummary.verificationCommandCount}`,
    `Operator command plan: total=${report.operatorCommandPlanSummary.totalCommandCount}, blocked=${report.operatorCommandPlanSummary.blockedCommandCount}, deferred=${report.operatorCommandPlanSummary.deferredCommandCount}, read_only=${report.operatorCommandPlanSummary.readOnlyEvidenceCommandCount}, guarded=${report.operatorCommandPlanSummary.guardedWriteOrLiveCommandCount}, manual_prerequisite=${report.operatorCommandPlanSummary.manualPrerequisiteCommandCount}`,
    `Operator command execution plan: raw=${report.operatorCommandExecutionPlanSummary.rawCommandCount}, unique=${report.operatorCommandExecutionPlanSummary.uniqueCommandCount}, duplicates=${report.operatorCommandExecutionPlanSummary.duplicateCommandCount}, blocked=${report.operatorCommandExecutionPlanSummary.blockedCommandCount}, deferred=${report.operatorCommandExecutionPlanSummary.deferredCommandCount}, read_only=${report.operatorCommandExecutionPlanSummary.readOnlyEvidenceCommandCount}, guarded=${report.operatorCommandExecutionPlanSummary.guardedWriteOrLiveCommandCount}, manual_prerequisite=${report.operatorCommandExecutionPlanSummary.manualPrerequisiteCommandCount}`,
    `Operator command execution queues: read_only=${report.operatorCommandExecutionQueueSummary.readOnlyEvidenceCommandCount}, manual_prerequisite=${report.operatorCommandExecutionQueueSummary.manualPrerequisiteCommandCount}, guarded=${report.operatorCommandExecutionQueueSummary.guardedWriteOrLiveCommandCount}, auto_allowed=${report.operatorCommandExecutionQueueSummary.autoRunAllowedCommandCount}, auto_forbidden=${report.operatorCommandExecutionQueueSummary.autoRunForbiddenCommandCount}`,
    `Read-only evidence queue plan: status=${report.readOnlyEvidenceQueuePlanStatus}, planned=${report.readOnlyEvidenceQueuePlanSummary.plannedCommandCount}, rejected=${report.readOnlyEvidenceQueuePlanSummary.rejectedReadOnlyQueueCommandCount}, manual_excluded=${report.readOnlyEvidenceQueuePlanSummary.excludedManualPrerequisiteCommandCount}, guarded_excluded=${report.readOnlyEvidenceQueuePlanSummary.excludedGuardedWriteOrLiveCommandCount}, execution_allowed=${report.readOnlyEvidenceQueuePlanSummary.executionAllowed ? 'yes' : 'no'}`,
    `Read-only execution evidence boundary: tier=${report.readOnlyEvidenceQueueExecutionEvidenceBoundary.evidenceTier}, can_close_production_gates=${report.readOnlyEvidenceQueueExecutionEvidenceBoundary.canCloseProductionReadinessGates ? 'yes' : 'no'}`,
    `Read-only queue cannot close gates: ${report.readOnlyEvidenceQueueExecutionEvidenceBoundary.cannotCloseGateIds.length ? report.readOnlyEvidenceQueueExecutionEvidenceBoundary.cannotCloseGateIds.join(', ') : 'not available'}`,
    `Blocked gate action checklist: status=${report.blockedGateActionChecklistStatus}, action_groups=${report.blockedGateActionChecklistSummary.actionGroupCount}, blocked_groups=${report.blockedGateActionChecklistSummary.blockedActionGroupCount}, deferred_groups=${report.blockedGateActionChecklistSummary.deferredActionGroupCount}, read_only=${report.blockedGateActionChecklistSummary.readOnlyEvidenceCommandCount}, manual_prerequisite=${report.blockedGateActionChecklistSummary.manualPrerequisiteCommandCount}, guarded=${report.blockedGateActionChecklistSummary.guardedWriteOrLiveCommandCount}`,
    `Blocked gate checklist action items: count=${report.blockedGateActionChecklistCompactActionItems.length}`,
    `Blocked gate action checklist input: sha256=${report.blockedGateActionChecklistInputDigest.sha256 || 'not available'}, size_bytes=${report.blockedGateActionChecklistInputDigest.sizeBytes}`,
    `Blocked gate checklist evidence boundary: tier=${report.blockedGateActionChecklistEvidenceBoundary.evidenceTier}, can_close_production_gates=${report.blockedGateActionChecklistEvidenceBoundary.canCloseProductionReadinessGates ? 'yes' : 'no'}`,
    `Blocked gate checklist freshness: status=${report.blockedGateActionChecklistFreshnessStatus}, fresh=${report.blockedGateActionChecklistFreshnessSummary.fresh ? 'yes' : 'no'}, digest_available=${report.blockedGateActionChecklistFreshnessSummary.digestAvailable ? 'yes' : 'no'}, sha256_match=${report.blockedGateActionChecklistFreshnessSummary.sha256Matches ? 'yes' : 'no'}, size_match=${report.blockedGateActionChecklistFreshnessSummary.sizeBytesMatches ? 'yes' : 'no'}`,
    `Blocked gate checklist current gap digest: sha256=${report.blockedGateActionChecklistFreshnessCurrentGapSummaryDigest.sha256 || 'not available'}, size_bytes=${report.blockedGateActionChecklistFreshnessCurrentGapSummaryDigest.sizeBytes}`,
    `Blocked gate checklist freshness boundary: tier=${report.blockedGateActionChecklistFreshnessEvidenceBoundary.evidenceTier}, can_close_production_gates=${report.blockedGateActionChecklistFreshnessEvidenceBoundary.canCloseProductionReadinessGates ? 'yes' : 'no'}`,
    `Source input coverage: ${report.sourceInputSummary.present}/${report.sourceInputSummary.total}`,
    `Failed steps: ${report.failedStepCount}`,
    '',
    '## Blocked Gate Checklist Action Items',
    '',
    ...renderCompactActionItems(report.blockedGateActionChecklistCompactActionItems),
    '',
    '## Outputs',
    '',
    ...Object.entries(report.outputs).map(([key, value]) => `- ${key}: ${value || 'not available'}`),
    '',
    '## Source Inputs',
    '',
    ...Object.entries(report.sourceInputs ?? {}).map(([key, value]) => `- ${key}: ${value || 'not available'}`),
    '',
    '## Source Input Checks',
    '',
    '| Key | Path | Exists | Size bytes | SHA-256 |',
    '|---|---|---|---:|---|',
    ...Object.entries(report.sourceInputChecks ?? {}).map(([key, value]) => {
      const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      return `| ${key} | ${record.path || 'not available'} | ${record.exists ? 'yes' : 'no'} | ${record.sizeBytes || 0} | ${record.sha256 || ''} |`
    }),
    '',
    '## Steps',
    '',
    '| Step | Exit | Duration ms |',
    '|---|---:|---:|',
    ...report.steps.map((step) => `| ${step.id} | ${step.exitCode} | ${step.durationMs} |`),
    '',
    'Mutation boundary: this refresh runs read-only evidence/dashboard scripts and writes report files only. It does not write production tables, tasks, task_dependencies, runtime publication, baselines, duration samples, or rollback state.',
    '',
  ]
  return `${lines.join('\n')}\n`
}

function tail(value, maxLength = 1200) {
  const text = String(value ?? '')
  return text.length > maxLength ? text.slice(-maxLength) : text
}

function repoRelative(filePath) {
  if (!filePath) return ''
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function renderHelp() {
  return [
    'Usage: node project-testing/tools/refresh-default-master-plan-readiness-dashboard.mjs [--output-root <dir>] [--source-root <dir>] [--report-root <dir>] [--json]',
    '',
    'Runs the no-write default master-plan status refresh chain:',
    '1. check-default-master-plan-production-readiness.mjs',
    '2. build-default-master-plan-production-operator-handoff.mjs',
    '3. check-default-master-plan-operator-handoff-preflight.mjs',
    '4. summarize-default-master-plan-real-evidence-gaps.mjs --json',
    '5. plan-default-master-plan-read-only-evidence-queue.mjs --plan-only',
    '6. build-default-master-plan-blocked-gate-action-checklist.mjs',
    '7. check-default-master-plan-blocked-gate-action-checklist-freshness.mjs',
    '8. run-release-dashboard.mjs --profile release-local --gate default-master-plan-evidence-source-kit --dry-run',
  ].join('\n')
}

export function buildRefreshCliSummary(report) {
  return {
    status: report.status,
    productionReady: report.productionReady,
    gateSummary: report.gateSummary,
    completionRate: report.completionRate,
    blockedGateActionCoverageSummary: report.blockedGateActionCoverageSummary,
    operatorUnblockRequirementSummary: report.operatorUnblockRequirementSummary,
    operatorCommandPlanSummary: report.operatorCommandPlanSummary,
    operatorCommandExecutionPlanSummary: report.operatorCommandExecutionPlanSummary,
    operatorCommandExecutionQueueSummary: report.operatorCommandExecutionQueueSummary,
    readOnlyEvidenceQueuePlanStatus: report.readOnlyEvidenceQueuePlanStatus,
    readOnlyEvidenceQueuePlanSummary: report.readOnlyEvidenceQueuePlanSummary,
    readOnlyEvidenceQueueExecutionEvidenceBoundary: report.readOnlyEvidenceQueueExecutionEvidenceBoundary,
    blockedGateActionChecklistStatus: report.blockedGateActionChecklistStatus,
    blockedGateActionChecklistSummary: report.blockedGateActionChecklistSummary,
    blockedGateActionChecklistInputDigest: report.blockedGateActionChecklistInputDigest,
    blockedGateActionChecklistEvidenceBoundary: report.blockedGateActionChecklistEvidenceBoundary,
    blockedGateActionChecklistCompactActionItems: report.blockedGateActionChecklistCompactActionItems,
    blockedGateActionChecklistFreshnessStatus: report.blockedGateActionChecklistFreshnessStatus,
    blockedGateActionChecklistFreshnessSummary: report.blockedGateActionChecklistFreshnessSummary,
    blockedGateActionChecklistFreshnessCurrentGapSummaryDigest: report.blockedGateActionChecklistFreshnessCurrentGapSummaryDigest,
    blockedGateActionChecklistFreshnessEvidenceBoundary: report.blockedGateActionChecklistFreshnessEvidenceBoundary,
    sourceInputSummary: report.sourceInputSummary,
    failedStepCount: report.failedStepCount,
    outputs: report.outputs,
  }
}

async function main() {
  try {
    const report = await refreshDefaultMasterPlanReadinessDashboard()
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
      console.log(renderHelp())
      return
    }
    const summary = buildRefreshCliSummary(report)
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2))
    } else {
      console.log(`Status: ${summary.status}`)
      console.log(`Production ready: ${summary.productionReady ? 'yes' : 'no'}`)
      console.log(`Gate completion: ${summary.gateSummary.pass}/${summary.gateSummary.total} (${summary.gateSummary.completionRate}%)`)
      console.log(`Blocked gate action coverage: ${summary.blockedGateActionCoverageSummary.coveredBlockedGateCount}/${summary.blockedGateActionCoverageSummary.totalBlockedGateCount} (${summary.blockedGateActionCoverageSummary.coverageRate}%), uncovered=${summary.blockedGateActionCoverageSummary.uncoveredBlockedGateCount}`)
      console.log(`Operator unblock requirements: actions=${summary.operatorUnblockRequirementSummary.operatorRequirementActionCount}, env_unlocks=${summary.operatorUnblockRequirementSummary.envUnlockCount}, flags=${summary.operatorUnblockRequirementSummary.requiredFlagCount}, operator_fields=${summary.operatorUnblockRequirementSummary.operatorFieldCount}, evidence_inputs=${summary.operatorUnblockRequirementSummary.evidenceInputCount}, environment_targets=${summary.operatorUnblockRequirementSummary.environmentTargetCount}, verification_commands=${summary.operatorUnblockRequirementSummary.verificationCommandCount}`)
      console.log(`Operator command plan: total=${summary.operatorCommandPlanSummary.totalCommandCount}, blocked=${summary.operatorCommandPlanSummary.blockedCommandCount}, deferred=${summary.operatorCommandPlanSummary.deferredCommandCount}, read_only=${summary.operatorCommandPlanSummary.readOnlyEvidenceCommandCount}, guarded=${summary.operatorCommandPlanSummary.guardedWriteOrLiveCommandCount}, manual_prerequisite=${summary.operatorCommandPlanSummary.manualPrerequisiteCommandCount}`)
      console.log(`Operator command execution plan: raw=${summary.operatorCommandExecutionPlanSummary.rawCommandCount}, unique=${summary.operatorCommandExecutionPlanSummary.uniqueCommandCount}, duplicates=${summary.operatorCommandExecutionPlanSummary.duplicateCommandCount}, blocked=${summary.operatorCommandExecutionPlanSummary.blockedCommandCount}, deferred=${summary.operatorCommandExecutionPlanSummary.deferredCommandCount}, read_only=${summary.operatorCommandExecutionPlanSummary.readOnlyEvidenceCommandCount}, guarded=${summary.operatorCommandExecutionPlanSummary.guardedWriteOrLiveCommandCount}, manual_prerequisite=${summary.operatorCommandExecutionPlanSummary.manualPrerequisiteCommandCount}`)
      console.log(`Operator command execution queues: read_only=${summary.operatorCommandExecutionQueueSummary.readOnlyEvidenceCommandCount}, manual_prerequisite=${summary.operatorCommandExecutionQueueSummary.manualPrerequisiteCommandCount}, guarded=${summary.operatorCommandExecutionQueueSummary.guardedWriteOrLiveCommandCount}, auto_allowed=${summary.operatorCommandExecutionQueueSummary.autoRunAllowedCommandCount}, auto_forbidden=${summary.operatorCommandExecutionQueueSummary.autoRunForbiddenCommandCount}`)
      console.log(`Read-only evidence queue plan: status=${summary.readOnlyEvidenceQueuePlanStatus}, planned=${summary.readOnlyEvidenceQueuePlanSummary.plannedCommandCount}, rejected=${summary.readOnlyEvidenceQueuePlanSummary.rejectedReadOnlyQueueCommandCount}, manual_excluded=${summary.readOnlyEvidenceQueuePlanSummary.excludedManualPrerequisiteCommandCount}, guarded_excluded=${summary.readOnlyEvidenceQueuePlanSummary.excludedGuardedWriteOrLiveCommandCount}, execution_allowed=${summary.readOnlyEvidenceQueuePlanSummary.executionAllowed ? 'yes' : 'no'}`)
      console.log(`Read-only execution evidence boundary: tier=${summary.readOnlyEvidenceQueueExecutionEvidenceBoundary.evidenceTier}, can_close_production_gates=${summary.readOnlyEvidenceQueueExecutionEvidenceBoundary.canCloseProductionReadinessGates ? 'yes' : 'no'}`)
      console.log(`Blocked gate action checklist: status=${summary.blockedGateActionChecklistStatus}, action_groups=${summary.blockedGateActionChecklistSummary.actionGroupCount}, blocked_groups=${summary.blockedGateActionChecklistSummary.blockedActionGroupCount}, deferred_groups=${summary.blockedGateActionChecklistSummary.deferredActionGroupCount}, read_only=${summary.blockedGateActionChecklistSummary.readOnlyEvidenceCommandCount}, manual_prerequisite=${summary.blockedGateActionChecklistSummary.manualPrerequisiteCommandCount}, guarded=${summary.blockedGateActionChecklistSummary.guardedWriteOrLiveCommandCount}`)
      console.log(`Blocked gate checklist action items: count=${summary.blockedGateActionChecklistCompactActionItems.length}`)
      console.log(`Blocked gate action checklist input: sha256=${summary.blockedGateActionChecklistInputDigest.sha256 || 'not available'}, size_bytes=${summary.blockedGateActionChecklistInputDigest.sizeBytes}`)
      console.log(`Blocked gate checklist evidence boundary: tier=${summary.blockedGateActionChecklistEvidenceBoundary.evidenceTier}, can_close_production_gates=${summary.blockedGateActionChecklistEvidenceBoundary.canCloseProductionReadinessGates ? 'yes' : 'no'}`)
      console.log(`Blocked gate checklist freshness: status=${summary.blockedGateActionChecklistFreshnessStatus}, fresh=${summary.blockedGateActionChecklistFreshnessSummary.fresh ? 'yes' : 'no'}, digest_available=${summary.blockedGateActionChecklistFreshnessSummary.digestAvailable ? 'yes' : 'no'}, sha256_match=${summary.blockedGateActionChecklistFreshnessSummary.sha256Matches ? 'yes' : 'no'}, size_match=${summary.blockedGateActionChecklistFreshnessSummary.sizeBytesMatches ? 'yes' : 'no'}`)
      console.log(`Blocked gate checklist freshness boundary: tier=${summary.blockedGateActionChecklistFreshnessEvidenceBoundary.evidenceTier}, can_close_production_gates=${summary.blockedGateActionChecklistFreshnessEvidenceBoundary.canCloseProductionReadinessGates ? 'yes' : 'no'}`)
      console.log(`Failed steps: ${summary.failedStepCount}`)
      console.log(`Refresh report: ${summary.outputs.refreshJson}`)
    }
    if (report.failedStepCount > 0) process.exitCode = 1
  } catch (error) {
    console.error(error.stack || error.message)
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
