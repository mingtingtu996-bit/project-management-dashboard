#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness')
const DEFAULT_HANDOFF = path.join(DEFAULT_OUTPUT_ROOT, 'operator-handoff.json')
const DEFAULT_PREFLIGHT = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-execution-preflight.json')
const DEFAULT_EXECUTION = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-execution.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-authorization-package.json')
const DEFAULT_TEMPLATE_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-authorization.operator-fill-template.json')
const REQUIRED_UNLOCK = 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH'

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoff: DEFAULT_HANDOFF,
    preflight: DEFAULT_PREFLIGHT,
    execution: DEFAULT_EXECUTION,
    output: DEFAULT_OUTPUT,
    templateOutput: DEFAULT_TEMPLATE_OUTPUT,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }
    if (arg === '--handoff') options.handoff = path.resolve(nextValue())
    else if (arg === '--preflight') options.preflight = path.resolve(nextValue())
    else if (arg === '--execution') options.execution = path.resolve(nextValue())
    else if (arg === '--output') options.output = path.resolve(nextValue())
    else if (arg === '--template-output') options.templateOutput = path.resolve(nextValue())
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export async function buildDefaultMasterPlanCandidateRefreshAuthorizationPackage({
  handoff = DEFAULT_HANDOFF,
  preflight = DEFAULT_PREFLIGHT,
  execution = DEFAULT_EXECUTION,
  output = DEFAULT_OUTPUT,
  templateOutput = DEFAULT_TEMPLATE_OUTPUT,
  now = new Date(),
} = {}) {
  const handoffPath = path.resolve(handoff)
  const preflightPath = path.resolve(preflight)
  const executionPath = path.resolve(execution)
  const outputPath = path.resolve(output)
  const templatePath = path.resolve(templateOutput)
  const [handoffPayload, preflightPayload, executionPayload] = await Promise.all([
    readJsonIfPresent(handoffPath),
    readJsonIfPresent(preflightPath),
    readJsonIfPresent(executionPath),
  ])

  const baselineId = firstText(handoffPayload.baselineId, preflightPayload.baselineId, executionPayload.baselineId)
  const projectId = firstText(handoffPayload.projectId, preflightPayload.projectId, executionPayload.projectId)
  const businessType = firstText(preflightPayload.businessType, executionPayload.businessType)
  const publicationKey = text(handoffPayload.publicationKey)
  const executionPlan = readRecord(preflightPayload.executionPlan)
  const executionControl = readRecord(executionPayload.executionControl)
  const executionGatePlan = readRecord(executionPayload.executionGatePlan ?? handoffPayload.candidateRefreshExecution?.executionGatePlan)
  const dbRepairPlan = readRecord(executionPayload.dbRepairPlan ?? handoffPayload.candidateRefreshExecution?.dbRepairPlan)
  const environment = firstText(executionPlan.environment, executionControl.environment, handoffPayload.environment, 'staging')
  const refreshedBy = firstText(executionPlan.refreshedBy, executionControl.refreshedBy, '<human-user-id>')
  const operatorApprovalRef = firstText(executionPlan.operatorApprovalRef, executionControl.operatorApprovalRef, '<approval-ref>')
  const refreshPackagePath = refreshPackagePathFromPreflight(preflightPayload, preflightPath)
  const preflightReady = text(preflightPayload.status) === 'ready_for_execute' && preflightPayload.mayExecuteCandidateRefresh === true
  const executionCompleted = text(executionPayload.status) === 'candidate_refresh_execution_completed'
  const packageReadinessBlockers = unique([
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    Object.keys(handoffPayload).length > 0 ? null : 'operator_handoff_required',
    Object.keys(preflightPayload).length > 0 ? null : 'candidate_refresh_preflight_required',
    preflightReady || executionCompleted ? null : 'candidate_refresh_preflight_not_ready_for_execute',
    refreshPackagePath ? null : 'candidate_refresh_package_path_required',
    text(operatorApprovalRef) && operatorApprovalRef !== '<approval-ref>' ? null : 'candidate_refresh_operator_approval_ref_required',
    text(refreshedBy) && refreshedBy !== '<human-user-id>' ? null : 'candidate_refresh_refreshed_by_required',
  ])
  const executionCommand = buildExecutionCommand({
    refreshPackagePath,
    preflightPath,
    authorizationPackagePath: outputPath,
    readinessSealPath: path.join(path.dirname(outputPath), 'candidate-refresh-execution-readiness-seal.json'),
    environment,
    refreshedBy,
    operatorApprovalRef,
  })
  const operatorTemplate = buildOperatorTemplate({
    generatedAt: now.toISOString(),
    baselineId,
    projectId,
    businessType,
    publicationKey,
    environment,
    refreshPackagePath,
    preflightPath,
    refreshedBy,
    operatorApprovalRef,
    executionCommand,
    preflightRef: `candidate_refresh_execution_preflight:${repoRelative(preflightPath)}`,
    executionRef: `candidate_refresh_execution:${repoRelative(executionPath)}`,
  })
  const status = executionCompleted
    ? 'authorization_not_required_execution_completed'
    : packageReadinessBlockers.length === 0
      ? 'authorization_package_ready'
      : 'authorization_package_blocked'
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-authorization-package/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-candidate-refresh-authorization-package',
    status,
    productionReady: false,
    baselineId,
    projectId,
    businessType,
    publicationKey,
    environment,
    executionTarget: normalizeTarget(preflightPayload.executionTarget),
    handoffRef: `operator_handoff:${repoRelative(handoffPath)}`,
    preflightRef: `candidate_refresh_execution_preflight:${repoRelative(preflightPath)}`,
    executionRef: `candidate_refresh_execution:${repoRelative(executionPath)}`,
    operatorTemplateRef: `candidate_refresh_authorization_template:${repoRelative(templatePath)}`,
    preflightReady,
    executionStatus: text(executionPayload.status) || 'not_generated',
    executionCompleted,
    executionBlockers: arrayOfStrings(executionPayload.blockers),
    packageReadinessBlockers,
    executionGatePlan: normalizePlan(executionGatePlan),
    dbRepairPlan: normalizePlan(dbRepairPlan),
    operatorFillTemplate: operatorTemplate,
    nextCommands: {
      setUnlockPowerShell: `$env:${REQUIRED_UNLOCK}='1'`,
      setUnlockCmd: `set ${REQUIRED_UNLOCK}=1`,
      executeCandidateRefresh: executionCommand,
      refreshOperatorHandoff: 'npm.cmd run evidence:default-master-plan:operator-handoff',
      refreshOperatorHandoffPreflight: 'npm.cmd run evidence:default-master-plan:operator-handoff-preflight',
      refreshRealEvidenceGaps: 'npm.cmd run evidence:default-master-plan:real-evidence-gaps',
    },
    mutationBoundary: {
      packageOnly: true,
      commandsExecuted: 0,
      doesNotAuthorizeExecution: true,
      doesNotMutateDatabase: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      candidateRefreshExecutionMayWriteCandidateTaskBaselineItemsOnlyAfterOperatorRunsCommand: true,
    },
  }

  assertNoSecretLikeText(report)
  assertNoSecretLikeText(operatorTemplate)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await mkdir(path.dirname(templatePath), { recursive: true })
  await writeFile(templatePath, `${JSON.stringify(operatorTemplate, null, 2)}\n`, 'utf8')
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function buildOperatorTemplate({
  generatedAt,
  baselineId,
  projectId,
  businessType,
  publicationKey,
  environment,
  refreshPackagePath,
  preflightPath,
  refreshedBy,
  operatorApprovalRef,
  executionCommand,
  preflightRef,
  executionRef,
}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-authorization/v1',
    generatedAt,
    status: 'operator_confirmation_required',
    templateOnly: true,
    baselineId,
    projectId,
    businessType,
    publicationKey,
    environment,
    preflightRef,
    executionRef,
    requiredUnlock: {
      variable: REQUIRED_UNLOCK,
      requiredValue: '1',
      storagePolicy: 'environment_only_not_repository_or_report_secret',
    },
    approval: {
      operatorApprovalRef,
      refreshedBy,
      approvalBoundary: 'candidate_task_baseline_items_refresh_only',
    },
    execution: {
      refreshPackagePath: repoRelative(refreshPackagePath),
      preflightPath: repoRelative(preflightPath),
      mode: 'execute',
      allowRefresh: true,
      command: executionCommand,
    },
    afterExecutionCommands: [
      'npm.cmd run evidence:default-master-plan:operator-handoff',
      'npm.cmd run evidence:default-master-plan:operator-handoff-preflight',
      'npm.cmd run evidence:default-master-plan:real-evidence-gaps',
    ],
    forbidden: [
      'Do not add raw DB URLs, passwords, privileged Supabase keys, JWTs, or migration URLs to this file.',
      'Do not run production/live publication from this package.',
      'Do not treat candidate refresh as production-ready evidence.',
    ],
  }
}

function buildExecutionCommand({
  refreshPackagePath,
  preflightPath,
  authorizationPackagePath,
  readinessSealPath,
  environment,
  refreshedBy,
  operatorApprovalRef,
}) {
  const args = [
    'node',
    'project-testing/tools/run-default-master-plan-candidate-refresh-execution.mjs',
    '--refresh-package',
    repoRelative(refreshPackagePath) || '<candidate-refresh-package.json>',
    '--preflight',
    repoRelative(preflightPath) || '<candidate-refresh-execution-preflight.json>',
    '--authorization-package',
    repoRelative(authorizationPackagePath) || '<candidate-refresh-authorization-package.json>',
    '--readiness-seal',
    repoRelative(readinessSealPath) || '<candidate-refresh-execution-readiness-seal.json>',
    '--environment',
    environment || 'staging',
    '--refreshed-by',
    refreshedBy || '<human-user-id>',
    '--operator-approval-ref',
    operatorApprovalRef || '<approval-ref>',
    '--mode',
    'execute',
    '--allow-refresh',
  ]
  return args.map(shellArg).join(' ')
}

function normalizeTarget(value) {
  const target = readRecord(value)
  return {
    envFileRef: text(target.envFileRef) || null,
    envFileSha256: text(target.envFileSha256) || null,
    connectionCredentialSha256: text(target.connectionCredentialSha256) || null,
    supabaseProjectRef: text(target.supabaseProjectRef) || null,
    databaseHost: text(target.databaseHost) || null,
    databasePort: text(target.databasePort) || null,
    databaseName: text(target.databaseName) || null,
    databaseUser: text(target.databaseUser) || null,
    targetFingerprint: text(target.targetFingerprint) || null,
    connectionSource: text(target.connectionSource) || null,
    readable: target.readable === true,
  }
}

function refreshPackagePathFromPreflight(preflightPayload, preflightPath) {
  const ref = text(preflightPayload.refreshPackageRef)
  const match = ref.match(/^candidate_refresh_package:(.+?)(?:#sha256=[a-f0-9]{64})?$/)
  if (match) return path.resolve(REPO_ROOT, match[1])
  const sameDirFallback = path.join(path.dirname(preflightPath), 'candidate-refresh-package.json')
  return sameDirFallback
}

function normalizePlan(plan) {
  const record = readRecord(plan)
  const orderedSteps = Array.isArray(record.orderedSteps)
    ? record.orderedSteps.map((step) => ({
      id: text(step?.id),
      status: text(step?.status),
      blockerCodes: arrayOfStrings(step?.blockerCodes),
      title: text(step?.title),
      commands: arrayOfStrings(step?.commands),
      verificationCommands: arrayOfStrings(step?.verificationCommands),
      notes: arrayOfStrings(step?.notes),
    }))
    : []
  return {
    status: text(record.status),
    requiredStepIds: arrayOfStrings(record.requiredStepIds),
    blockedStepIds: arrayOfStrings(record.blockedStepIds),
    orderedStepCount: number(record.orderedStepCount ?? orderedSteps.length),
    orderedSteps,
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Candidate Refresh Authorization Package',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId || 'missing'}`,
    `- projectId: ${report.projectId || 'missing'}`,
    `- businessType: ${report.businessType || 'missing'}`,
    `- environment: ${report.environment || 'missing'}`,
    `- preflightReady: ${report.preflightReady}`,
    `- executionStatus: ${report.executionStatus}`,
    `- executionCompleted: ${report.executionCompleted}`,
    `- operatorTemplateRef: ${report.operatorTemplateRef}`,
    '',
    '## Package Readiness Blockers',
    '',
    ...markdownList(report.packageReadinessBlockers),
    '',
    '## Execution Blockers',
    '',
    ...markdownList(report.executionBlockers),
    '',
    '## Operator Steps',
    '',
    `- setUnlockPowerShell: ${report.nextCommands.setUnlockPowerShell}`,
    `- executeCandidateRefresh: ${report.nextCommands.executeCandidateRefresh}`,
    `- refreshOperatorHandoff: ${report.nextCommands.refreshOperatorHandoff}`,
    `- refreshOperatorHandoffPreflight: ${report.nextCommands.refreshOperatorHandoffPreflight}`,
    `- refreshRealEvidenceGaps: ${report.nextCommands.refreshRealEvidenceGaps}`,
    '',
    '## Execution Gate Plan',
    '',
    `- status: ${report.executionGatePlan.status || 'unknown'}`,
    `- requiredStepIds: ${report.executionGatePlan.requiredStepIds.join(', ') || 'none'}`,
    `- blockedStepIds: ${report.executionGatePlan.blockedStepIds.join(', ') || 'none'}`,
    '',
    '## DB Repair Plan',
    '',
    `- status: ${report.dbRepairPlan.status || 'unknown'}`,
    `- requiredStepIds: ${report.dbRepairPlan.requiredStepIds.join(', ') || 'none'}`,
    `- blockedStepIds: ${report.dbRepairPlan.blockedStepIds.join(', ') || 'none'}`,
    '',
    '## Mutation Boundary',
    '',
    `- packageOnly: ${report.mutationBoundary.packageOnly}`,
    `- commandsExecuted: ${report.mutationBoundary.commandsExecuted}`,
    `- doesNotAuthorizeExecution: ${report.mutationBoundary.doesNotAuthorizeExecution}`,
    `- doesNotMutateDatabase: ${report.mutationBoundary.doesNotMutateDatabase}`,
    `- writesProductionTables: ${report.mutationBoundary.writesProductionTables}`,
    `- writesRuntimePublication: ${report.mutationBoundary.writesRuntimePublication}`,
    '',
  ]
  return `${lines.join('\n')}\n`
}

function markdownList(values) {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ['- none']
}

function assertNoSecretLikeText(value) {
  const serialized = JSON.stringify(value)
  if (/postgres(?:ql)?:\/\/|password\s*=|service[_-]?role|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i.test(serialized)) {
    throw new Error('refusing_to_write_candidate_refresh_authorization_package_with_secret_like_text')
  }
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value)
    if (normalized) return normalized
  }
  return ''
}

function text(value) {
  return String(value ?? '').trim()
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function repoRelative(filePath) {
  if (!filePath) return ''
  const relativePath = path.relative(REPO_ROOT, path.resolve(filePath)).replaceAll('\\', '/')
  return relativePath.startsWith('..') ? path.resolve(filePath).replaceAll('\\', '/') : relativePath
}

function shellArg(value) {
  const raw = String(value ?? '')
  return /^[A-Za-z0-9_./:@=+-]+$/.test(raw) ? raw : JSON.stringify(raw)
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const options = parseArgs()
  if (options.help) {
    console.log([
      'Usage: node project-testing/tools/build-default-master-plan-candidate-refresh-authorization-package.mjs',
      '  [--handoff <operator-handoff.json>]',
      '  [--preflight <candidate-refresh-execution-preflight.json>]',
      '  [--execution <candidate-refresh-execution.json>]',
      '  [--output <candidate-refresh-authorization-package.json>]',
      '  [--template-output <candidate-refresh-authorization.operator-fill-template.json>]',
    ].join('\n'))
  } else {
    buildDefaultMasterPlanCandidateRefreshAuthorizationPackage(options)
      .then((report) => {
        console.log(JSON.stringify({
          status: report.status,
          productionReady: report.productionReady,
          baselineId: report.baselineId,
          projectId: report.projectId,
          packageReadinessBlockers: report.packageReadinessBlockers,
          output: repoRelative(options.output),
          templateOutput: repoRelative(options.templateOutput),
        }, null, 2))
      })
      .catch((error) => {
        console.error(error?.stack || error?.message || String(error))
        process.exitCode = 1
      })
  }
}
