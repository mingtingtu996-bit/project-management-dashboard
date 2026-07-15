import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const STAGING_CHECKS = [
  'migrationsApplied',
  'authenticatedWizardPreviewCommit',
  'retryIdempotency',
  'postCommitRecovery',
  'runtimeConsumptionObserved',
  'canaryPublication',
  'monitoring',
  'rollback',
  'tenantIsolation',
]

const PRODUCTION_CHECKS = [
  ...STAGING_CHECKS,
  'acceptedRealSamples',
  'accuracyOutcome',
  'browserSmoke',
]

function text(value) {
  return String(value ?? '').trim()
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function pass(status, detail = {}) {
  return { status: status ? 'pass' : 'fail', ...detail }
}

function validateAccuracy(value) {
  const accuracy = record(value)
  const thresholds = record(accuracy.thresholds)
  const sampleCount = Number(accuracy.sampleCount)
  const lineageCompleteCount = Number(accuracy.lineageCompleteCount)
  const mae = Number(accuracy.meanAbsoluteErrorDays)
  const mape = Number(accuracy.meanAbsolutePercentageError)
  const overcompensationRate = Number(accuracy.overcompensationRate)
  const minimumSampleCount = Number(thresholds.minimumSampleCount)
  const maximumMae = Number(thresholds.maximumMeanAbsoluteErrorDays)
  const maximumMape = Number(thresholds.maximumMeanAbsolutePercentageError)
  const maximumOvercompensation = Number(thresholds.maximumOvercompensationRate)
  const finite = [
    sampleCount,
    lineageCompleteCount,
    mae,
    mape,
    overcompensationRate,
    minimumSampleCount,
    maximumMae,
    maximumMape,
    maximumOvercompensation,
  ].every(Number.isFinite)
  const reasonCodes = unique([
    !finite ? 'accuracy_metrics_or_thresholds_missing' : null,
    finite && sampleCount < minimumSampleCount ? 'accuracy_sample_count_below_minimum' : null,
    finite && lineageCompleteCount !== sampleCount ? 'accuracy_sample_lineage_incomplete' : null,
    finite && mae > maximumMae ? 'accuracy_mae_above_threshold' : null,
    finite && mape > maximumMape ? 'accuracy_mape_above_threshold' : null,
    finite && overcompensationRate > maximumOvercompensation
      ? 'accuracy_overcompensation_above_threshold'
      : null,
  ])
  return pass(reasonCodes.length === 0, {
    reasonCodes,
    metrics: {
      sampleCount,
      lineageCompleteCount,
      meanAbsoluteErrorDays: mae,
      meanAbsolutePercentageError: mape,
      overcompensationRate,
    },
    thresholds,
  })
}

function validateEnvironmentEvidence(level, evidenceValue, codeDigest) {
  const evidence = record(evidenceValue)
  const requiredChecks = level === 'staging' ? STAGING_CHECKS : PRODUCTION_CHECKS
  const expectedTarget = level === 'staging' ? 'staging' : 'production_live'
  const checks = record(evidence.checks)
  const missingChecks = requiredChecks.filter((key) => checks[key] !== true)
  const reasonCodes = unique([
    text(evidence.target) !== expectedTarget ? `${expectedTarget}_target_evidence_required` : null,
    !text(evidence.executedAt) ? `${expectedTarget}_execution_timestamp_required` : null,
    !text(evidence.codeDigest) || text(evidence.codeDigest) !== text(codeDigest)
      ? `${expectedTarget}_code_digest_mismatch_or_missing`
      : null,
    ...missingChecks.map((key) => `${expectedTarget}_check_missing:${key}`),
  ])
  if (level === 'staging') {
    return {
      status: reasonCodes.length === 0 ? 'verified' : 'unable_to_verify',
      reasonCodes: reasonCodes.length > 0 ? reasonCodes : [],
      missingChecks,
      evidenceTarget: text(evidence.target) || null,
      executedAt: text(evidence.executedAt) || null,
    }
  }
  return {
    status: reasonCodes.length === 0 ? 'verified' : 'not_closed',
    reasonCodes: unique([
      ...reasonCodes,
      ...(reasonCodes.length > 0 ? ['fresh_production_live_evidence_required'] : []),
    ]),
    missingChecks,
    evidenceTarget: text(evidence.target) || null,
    executedAt: text(evidence.executedAt) || null,
  }
}

export function auditDurationRuntimeConsumptionClosure(inputValue) {
  const input = record(inputValue)
  const receipts = list(input.receipts)
  const effectiveReceipts = receipts.filter((receipt) => (
    receipt?.status === 'effective_applied'
    && list(receipt.changedFields).length > 0
  ))
  const requiredConsumers = unique(list(input.requiredConsumers))
  const effectiveConsumers = new Set(effectiveReceipts.map((receipt) => text(receipt.consumer)).filter(Boolean))
  const missingConsumers = requiredConsumers.filter((consumer) => !effectiveConsumers.has(consumer))
  const runtimePublicationReceipts = effectiveReceipts.filter((receipt) => text(receipt.publicationKey))
  const missingRollbackPublicationKeys = unique(runtimePublicationReceipts
    .filter((receipt) => !text(receipt.rollbackTarget))
    .map((receipt) => receipt.publicationKey))
  const revisionResults = list(input.revisionResults)
  const unsafeRevisions = revisionResults.filter((revision) => (
    revision?.autoConfirmed === true
    || revision?.confirmationRequired !== true
    || text(revision?.revisionStatus) === 'confirmed'
  ))
  const simulation = record(input.simulation)
  const localVerification = record(input.localVerification)
  const accuracy = validateAccuracy(localVerification.accuracy)

  const gates = {
    simulation: pass(
      simulation.status === 'pass'
      && simulation.environmentTarget === 'local_static'
      && simulation.masterPlanSimpleAndControlFocused === true
      && simulation.drilldownUsesGovernedT2Assets === true,
      {
        reasonCodes: unique([
          simulation.status !== 'pass' ? 'local_simulation_not_passed' : null,
          simulation.environmentTarget !== 'local_static' ? 'local_static_target_required' : null,
          simulation.masterPlanSimpleAndControlFocused !== true ? 'simple_control_master_plan_not_proved' : null,
          simulation.drilldownUsesGovernedT2Assets !== true ? 'governed_t2_drilldown_not_proved' : null,
        ]),
      },
    ),
    effectiveConsumption: pass(effectiveReceipts.length > 0, {
      effectiveReceiptCount: effectiveReceipts.length,
      metadataOnlyReceiptCount: receipts.filter((receipt) => receipt?.status === 'evidence_only').length,
      reasonCodes: effectiveReceipts.length > 0 ? [] : ['effective_output_change_receipt_required'],
    }),
    downstreamConsumers: pass(missingConsumers.length === 0, {
      requiredConsumers,
      effectiveConsumers: [...effectiveConsumers].sort(),
      missingConsumers,
      reasonCodes: missingConsumers.map((consumer) => `effective_consumer_missing:${consumer}`),
    }),
    rollback: pass(
      runtimePublicationReceipts.length > 0 && missingRollbackPublicationKeys.length === 0,
      {
      runtimePublicationReceiptCount: runtimePublicationReceipts.length,
      missingRollbackPublicationKeys,
      reasonCodes: unique([
        runtimePublicationReceipts.length === 0
          ? 'runtime_publication_consumption_receipt_required'
          : null,
        ...missingRollbackPublicationKeys.map((key) => `rollback_target_missing:${key}`),
      ]),
      },
    ),
    revisionSafety: pass(revisionResults.length > 0 && unsafeRevisions.length === 0, {
      revisionResultCount: revisionResults.length,
      unsafeRevisionCount: unsafeRevisions.length,
      reasonCodes: unique([
        revisionResults.length === 0 ? 'revision_bridge_result_required' : null,
        unsafeRevisions.some((revision) => revision?.autoConfirmed === true)
          ? 'auto_confirmed_revision_forbidden'
          : null,
        unsafeRevisions.some((revision) => revision?.confirmationRequired !== true)
          ? 'pm_confirmation_requirement_missing'
          : null,
        unsafeRevisions.some((revision) => text(revision?.revisionStatus) === 'confirmed')
          ? 'revision_draft_must_not_be_confirmed'
          : null,
      ]),
    }),
    localVerification: pass([
      localVerification.focusedTestsPassed,
      localVerification.scopedTypecheckPassed,
      localVerification.scopedRegistryGuardPassed,
      localVerification.scopedWorkspaceIsolationGuardPassed,
      localVerification.retainedRegressionPassed,
    ].every((value) => value === true), {
      globalTypecheckStatus: text(localVerification.globalTypecheckStatus) || null,
      globalTypecheckBlockers: unique(list(localVerification.globalTypecheckBlockers)),
      globalRegistryGuardStatus: text(localVerification.globalRegistryGuardStatus) || null,
      globalRegistryGuardBlockers: unique(list(localVerification.globalRegistryGuardBlockers)),
      globalWorkspaceIsolationGuardStatus: text(localVerification.globalWorkspaceIsolationGuardStatus) || null,
      globalWorkspaceIsolationGuardBlockers: unique(list(localVerification.globalWorkspaceIsolationGuardBlockers)),
      reasonCodes: unique([
        localVerification.focusedTestsPassed !== true ? 'focused_tests_not_passed' : null,
        localVerification.scopedTypecheckPassed !== true ? 'scoped_typecheck_not_passed' : null,
        localVerification.scopedRegistryGuardPassed !== true ? 'scoped_registry_guard_not_passed' : null,
        localVerification.scopedWorkspaceIsolationGuardPassed !== true
          ? 'scoped_workspace_isolation_guard_not_passed'
          : null,
        localVerification.retainedRegressionPassed !== true ? 'retained_regression_not_passed' : null,
      ]),
    }),
    accuracy,
  }
  const candidateGateFailures = Object.entries(gates)
    .filter(([, gate]) => gate.status !== 'pass')
    .map(([key]) => key)
  const environments = record(input.environments)

  return {
    schemaVersion: 'duration-runtime-consumption-closure-audit.v1',
    auditedAt: new Date().toISOString(),
    sourceGeneratedAt: text(input.generatedAt) || null,
    codeDigest: text(input.codeDigest) || null,
    gates,
    candidateReadonly: {
      status: candidateGateFailures.length === 0 ? 'closed' : 'not_closed',
      failedGates: candidateGateFailures,
      boundary: 'local_candidate_readonly_only_no_real_db_or_runtime_claim',
    },
    staging: validateEnvironmentEvidence('staging', environments.staging, input.codeDigest),
    productionLive: validateEnvironmentEvidence('production_live', environments.productionLive, input.codeDigest),
  }
}

export function renderDurationRuntimeConsumptionClosureMarkdown(audit) {
  const gateLines = Object.entries(audit.gates).map(([key, gate]) => (
    `| ${key} | ${String(gate.status).toUpperCase()} | ${list(gate.reasonCodes).join(', ') || '-'} |`
  ))
  return [
    '# Duration Runtime Consumption Closure',
    '',
    `- Audited at: ${audit.auditedAt}`,
    `- Code digest: ${audit.codeDigest ?? 'missing'}`,
    `- Candidate/read-only: **${audit.candidateReadonly.status}**`,
    `- Staging: **${audit.staging.status}**`,
    `- Production/live: **${audit.productionLive.status}**`,
    '',
    '| Gate | Status | Reasons |',
    '| --- | --- | --- |',
    ...gateLines,
    '',
    '## Environment Boundary',
    '',
    `- Staging reasons: ${audit.staging.reasonCodes.join(', ') || '-'}`,
    `- Production/live reasons: ${audit.productionLive.reasonCodes.join(', ') || '-'}`,
    '- Local simulation and tests do not prove staging or production/live execution.',
    '',
  ].join('\n')
}

function parseArgs(argv) {
  const args = { input: null, outputJson: null, outputMarkdown: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') args.input = path.resolve(argv[++index])
    else if (arg === '--output-json') args.outputJson = path.resolve(argv[++index])
    else if (arg === '--output-md') args.outputMarkdown = path.resolve(argv[++index])
    else if (arg === '--help') {
      console.log('Usage: node project-testing/tools/audit-duration-runtime-consumption-closure.mjs --input <json> [--output-json <json>] [--output-md <md>]')
      process.exit(0)
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.input) throw new Error('--input is required')
  return args
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const input = JSON.parse(await fs.readFile(args.input, 'utf8'))
  const audit = auditDurationRuntimeConsumptionClosure(input)
  if (args.outputJson) {
    await fs.mkdir(path.dirname(args.outputJson), { recursive: true })
    await fs.writeFile(args.outputJson, `${JSON.stringify(audit, null, 2)}\n`, 'utf8')
  }
  if (args.outputMarkdown) {
    await fs.mkdir(path.dirname(args.outputMarkdown), { recursive: true })
    await fs.writeFile(args.outputMarkdown, renderDurationRuntimeConsumptionClosureMarkdown(audit), 'utf8')
  }
  console.log(JSON.stringify(audit, null, 2))
  if (audit.candidateReadonly.status !== 'closed') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
