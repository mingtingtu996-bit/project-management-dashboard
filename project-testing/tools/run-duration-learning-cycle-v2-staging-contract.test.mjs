import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const toolsRoot = path.dirname(fileURLToPath(import.meta.url))
const releaseRoot = process.env.RELEASE_ROOT ?? path.resolve(toolsRoot, '..', '..')
const scriptPath = path.join(releaseRoot, 'server', 'scripts', 'workbuddy-staging-duration-learning-cycle-v2.mjs')
const workflowPath = path.join(releaseRoot, '.github', 'workflows', 'staging-duration-learning-cycle-v2.yml')

test('v2 harness is isolated from the retired v1 flow and covers the full matrix', () => {
  const source = fs.readFileSync(scriptPath, 'utf8')
  assert.doesNotMatch(source, /workbuddy-staging-learning-cycle\.mjs/)
  for (const assetKey of [
    'base_duration_benchmark',
    'standard_work_duration_seed',
    'special_work_duration_seed',
    'wbs_reference_days',
    'dependency_rule_candidate',
    'critical_path_rule_candidate',
  ]) assert.match(source, new RegExp(`'${assetKey}'`))
  assert.match(source, /const SCOPE_LEVELS = \['project', 'company', 'industry', 'global'\]/)
  assert.match(source, /runDurationLearningRuntimeLifecycleSweep/)
  assert.match(source, /resolveDurationLearningRuntimePublication/)
  assert.match(source, /recordDurationSuggestionConsumedArtifacts/)
  assert.match(source, /recordProjectRemainingDurationForecastConsumedArtifacts/)
  assert.match(source, /recordWbsTemplateGenerationConsumedArtifacts/)
  assert.match(source, /recordProjectCriticalPathConsumedArtifacts/)
  assert.match(source, /recordScheduleAccelerationConsumedArtifacts/)
  assert.match(source, /recordScheduleAccelerationRuntimeConsumedArtifacts/)
  assert.match(source, /listDurationRuntimeConsumerObservationIntegrationContracts/)
  assert.match(source, /monitorAndStable/)
  assert.match(source, /forcedRollback/)
  assert.match(source, /const rows = await runtimeQueryExec\(/)
  assert.doesNotMatch(source, /const rows = await approvedObservationQueryExec\(\s*`select/)
})

test('real candidate aggregation coverage is mandatory before any controlled mutation', () => {
  const source = fs.readFileSync(scriptPath, 'utf8')
  const runSource = source.slice(source.indexOf('async function runLifecycle()'))
  const floorIndex = runSource.indexOf('assertMandatoryRealAggregationFloor()')
  const assessIndex = runSource.indexOf('await assessRealCandidateAggregationCoverage(')
  const assertIndex = runSource.indexOf('assertCompleteRealCandidateAggregationCoverage(realCandidateAggregationCoverage)')
  const proofIndex = runSource.indexOf('createRealCandidateAggregationCoverageProof(realCandidateAggregationCoverage)')
  const mutationStartIndex = runSource.indexOf('mutationGuard.armAfterRealCoverage(')
  const controlledLifecycleIndex = runSource.indexOf('const selected = buildSelectedCandidates(')

  assert.ok(floorIndex >= 0, 'the real aggregation floor must be mandatory')
  assert.ok(assessIndex > floorIndex, 'the mandatory floor must be asserted before collection')
  assert.ok(assessIndex >= 0, 'real collector coverage assessment is missing')
  assert.ok(assertIndex > assessIndex, 'coverage must be asserted after it is assessed')
  assert.ok(proofIndex > assertIndex, 'a complete coverage proof must be created only after assertion')
  assert.ok(mutationStartIndex > proofIndex, 'mutation cannot start before complete coverage is proven')
  assert.ok(controlledLifecycleIndex > mutationStartIndex, 'controlled lifecycle cannot start before mutation state is armed')
  assert.match(source, /const REQUIRE_REAL_AGGREGATION_FLOOR = true/)
  assert.match(runSource, /const mutationGuard = createMutationGuard\(\)/)
  assert.match(runSource, /const runtimeQueryExec = queryExec\(runtimePool, mutationGuard\)/)
  assert.match(source, /hasCompleteRealCandidateAggregationCoverageProof/)
  assert.match(source, /state\?\.realCandidateAggregationCoverageProof/)
  assert.match(source, /realCoverageProofHash/)
  assert.match(source, /ALLOWED_MUTATION_TABLES/)
  assert.match(source, /database_mutation_outside_learning_v2_boundary/)
  assert.doesNotMatch(source, /(?:client|adminPool|runtimePool)\.query\(\s*`(?:insert|update|delete)/i)
  assert.match(runSource, /report\.realCandidateAggregationCoverage = realCandidateAggregationCoverage/)
  assert.match(runSource, /mutationStatementCount/)
  assert.match(source, /realStableAccuracyNotProvenByControlledFixture:\s*true/)
  assert.doesNotMatch(source, /report\.phases\.aggregationFloor/)
})

test('policy evaluation cannot be handwritten or disabled by source or workflow input', () => {
  const source = fs.readFileSync(scriptPath, 'utf8')
  const workflow = fs.readFileSync(workflowPath, 'utf8')
  const selfTestStart = source.indexOf('async function runSelfTest()')
  const selfTestEnd = source.indexOf('\nasync function cleanupOperation', selfTestStart)
  const operationalSource = `${source.slice(0, selfTestStart)}${source.slice(selfTestEnd)}`
  assert.match(operationalSource, /evaluateDurationLearningAssetAutomationPolicy/)
  assert.match(operationalSource, /decisionMatchesSameShaEvaluator/)
  assert.match(operationalSource, /policyEvaluationRequired === true/)
  assert.match(operationalSource, /REAL_CANDIDATE_POLICY_EVALUATION_INVALID/)
  assert.match(operationalSource, /policyViolations/)
  assert.doesNotMatch(operationalSource, /policyEvaluationRequired\s*:\s*false/)
  assert.doesNotMatch(operationalSource, /automationDecision\s*:\s*\{/)
  assert.match(source.slice(selfTestStart, selfTestEnd), /policyEvaluationRequired\s*:\s*false/)
  assert.match(source.slice(selfTestStart, selfTestEnd), /automationDecision\s*:\s*\{/)
  assert.match(source, /require_real_aggregation_floor/)
  assert.match(source, /real_aggregation_floor_is_mandatory_and_not_configurable/)
  assert.doesNotMatch(workflow, /^\s+require_real_aggregation_floor:/m)
  assert.doesNotMatch(workflow, /inputs\.require_real_aggregation_floor/)
  assert.match(source, /assertControlledFixturePolicyConsistency/)
  assert.match(source, /controlledFixturePolicyEvaluatorConsistent/)
})

test('an attempted real aggregation floor override fails before loading release or database dependencies', () => {
  const result = spawnSync(process.execPath, [
    scriptPath,
    'self-test',
    '--release-root', 'C:\\definitely-missing-release-root',
    '--operation-prefix', 'wb-learning-v2-floor-override-test',
    '--require-real-aggregation-floor', 'false',
  ], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /real_aggregation_floor_is_mandatory_and_not_configurable/)
  assert.doesNotMatch(result.stderr, /Cannot find module|ENOENT/)
})

test('real collector report preserves proposal identity, scope, observed counts, and same-SHA policy evaluation', () => {
  const source = fs.readFileSync(scriptPath, 'utf8')
  const auditSource = source.slice(
    source.indexOf('function realProposalAuditRecord'),
    source.indexOf('\nfunction assertControlledFixturePolicyConsistency'),
  )
  assert.match(source, /const REAL_PROPOSAL_AUDIT_SCHEMA = 'workbuddy-duration-learning-real-proposal-audit\/v1'/)
  assert.match(source, /proposalAuditSchema:\s*REAL_PROPOSAL_AUDIT_SCHEMA/)
  assert.match(source, /collectorOutputHash/)
  assert.match(auditSource, /proposalIdentityHash/)
  assert.match(auditSource, /proposalKeyHash/)
  assert.match(auditSource, /artifactKeyHash/)
  assert.match(auditSource, /scope:\s*\{[\s\S]*?level:[\s\S]*?identityHash:/)
  assert.match(auditSource, /observed:\s*\{[\s\S]*?sampleCount:[\s\S]*?distinctProjectCount:[\s\S]*?distinctCompanyCount:/)
  assert.match(auditSource, /policyEvaluator:\s*\{/)
  assert.match(auditSource, /evaluatedDecisionHash/)
  assert.match(auditSource, /decisionMatchesSameShaEvaluator/)
  assert.match(source, /proposalAuditRecords:\s*proposals/)
})

test('controlled lifecycle is disclosed as a synthetic mechanism fixture, never real aggregation or accuracy', () => {
  const source = fs.readFileSync(scriptPath, 'utf8')
  assert.match(source, /evidenceClass:\s*'synthetic_staging_fixture'/)
  assert.match(source, /purpose:\s*'same_sha_lifecycle_mechanism_validation_only'/)
  assert.match(source, /aggregationClaim:\s*'not_real_candidate_aggregation'/)
  assert.match(source, /accuracyClaim:\s*'not_measured'/)
  assert.match(source, /realCandidateAggregationClaimed:\s*false/)
  assert.match(source, /realAccuracyClaimed:\s*false/)
})

test('v2 cleanup is prefix-scoped and checks every table for zero residue', () => {
  const source = fs.readFileSync(scriptPath, 'utf8')
  for (const table of [
    'duration_learning_runtime_publications',
    'runtime_consumer_observations',
    'runtime_consumer_runtime_calls',
    'duration_algorithm_accuracy_events',
    'duration_plan_network_outcomes',
  ]) assert.match(source, new RegExp(table))
  assert.match(source, /operation_context ->> 'operationId'|observation_context ->> 'operationId'/)
  assert.match(source, /Object\.values\(residue\)\.every\(\(count\) => count === 0\)/)
  assert.match(source, /WORKBUDDY_TARGET_ENVIRONMENT.*staging/s)
  assert.match(source, /I_ACKNOWLEDGE_DISPOSABLE_STAGING_LEARNING_MUTATIONS/)
  assert.match(source, /readLifecycleState/)
  assert.match(source, /allowMutation/)
  assert.match(source, /read_only_no_mutation/)
  assert.match(source, /hasCompleteRealCandidateAggregationCoverageProof\(state\)/)
  const cleanupSource = source.slice(
    source.indexOf('async function cleanupOperation'),
    source.indexOf('async function readResidue'),
  )
  assert.match(cleanupSource, /const deletions = \[/)
  assert.match(cleanupSource, /\[prefix, `\$\{prefix\}:%`\]/)
  assert.match(cleanupSource, /\[`\$\{prefix\}:%`\]/)
  assert.doesNotMatch(cleanupSource, /delete from public\.[a-z_]+\s*(?:;|`)/i)
})

test('workflow is manual, same-SHA bound, and cleanup is always-run', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8')
  const requireFromRelease = createRequire(path.join(releaseRoot, 'package.json'))
  const yaml = requireFromRelease('js-yaml')
  let parsedWorkflow
  assert.doesNotThrow(() => { parsedWorkflow = yaml.load(workflow) })
  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /\n\s+push:/)
  assert.match(workflow, /EXPECTED_RELEASE_SHA/)
  assert.match(workflow, /readyz/)
  assert.match(workflow, /if: always\(\)/)
  assert.match(workflow, / cleanup /)
  assert.match(workflow, /--state "\$STATE_PATH"/)
  assert.match(workflow, /residue/)
  assert.doesNotMatch(workflow, /workbuddy-staging-learning-cycle\.mjs/)
  assert.match(workflow, /industry_args=\(\)/)
  assert.match(workflow, /mutation_approval:/)
  assert.equal(parsedWorkflow.on.workflow_dispatch.inputs.require_real_aggregation_floor, undefined)
  assert.match(workflow, /WORKBUDDY_LEARNING_V2_MUTATION_APPROVED: \$\{\{ inputs\.mutation_approval \}\}/)
  assert.doesNotMatch(
    workflow,
    /WORKBUDDY_LEARNING_V2_MUTATION_APPROVED:\s+I_ACKNOWLEDGE_DISPOSABLE_STAGING_LEARNING_MUTATIONS/,
  )
  assert.match(workflow, /STAGING_SUPABASE_ADVISOR_EXPORT_JSON/)
  assert.match(workflow, /Verify mandatory real aggregation floor and controlled fixture disclosure/)
  assert.match(workflow, /REAL_CANDIDATE_AGGREGATION_COVERAGE_INCOMPLETE/)
  assert.match(workflow, /realCandidateAggregationCoverage/)
  assert.match(workflow, /proposalAuditRecords/)
  assert.match(workflow, /synthetic_staging_fixture/)
  const bashExecutable = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash'
  for (const step of parsedWorkflow.jobs.verify.steps.filter((item) => typeof item.run === 'string')) {
    const syntax = spawnSync(bashExecutable, ['-n'], { input: step.run, encoding: 'utf8' })
    assert.equal(syntax.status, 0, `${step.name} bash syntax failed: ${syntax.stderr}`)
  }
})

test('workflow report acceptance rejects a missing global cell and disabled policy evaluation', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8')
  const requireFromRelease = createRequire(path.join(releaseRoot, 'package.json'))
  const yaml = requireFromRelease('js-yaml')
  const parsedWorkflow = yaml.load(workflow)
  const acceptanceStep = parsedWorkflow.jobs.verify.steps.find((step) => (
    step.name === 'Verify mandatory real aggregation floor and controlled fixture disclosure'
  ))
  assert.equal(typeof acceptanceStep?.run, 'string')

  const assetKeys = [
    'base_duration_benchmark',
    'standard_work_duration_seed',
    'special_work_duration_seed',
    'wbs_reference_days',
    'dependency_rule_candidate',
    'critical_path_rule_candidate',
  ]
  const scopeLevels = ['project', 'company', 'industry', 'global']
  const proposalAuditRecords = assetKeys.flatMap((assetKey) => scopeLevels.map((scopeLevel, index) => ({
    assetKey,
    proposalIdentityHash: `${index}`.padStart(64, 'a').slice(-64),
    scope: { level: scopeLevel },
    enteredCanaryDryRun: true,
    policyEvaluationRequired: true,
    observed: { sampleCount: 1 },
    policyEvaluator: {
      sourceDecisionPresent: true,
      decisionMatchesSameShaEvaluator: true,
      autoPromotionAllowed: true,
      manualReviewRequired: false,
    },
  })))
  const validReport = {
    status: 'pass',
    realCandidateAggregationCoverage: {
      status: 'complete',
      proposalAuditSchema: 'workbuddy-duration-learning-real-proposal-audit/v1',
      proposalAuditRecords,
      matrix: Object.fromEntries(assetKeys.map((assetKey) => [
        assetKey,
        Object.fromEntries(scopeLevels.map((scopeLevel) => [scopeLevel, { eligibleCount: 1 }])),
      ])),
      missingCoverageCells: [],
      policyViolations: [],
      collectorOutputHash: 'b'.repeat(64),
      realCoverageProofHash: 'c'.repeat(64),
    },
    controlledScopeLifecycle: {
      evidenceClass: 'synthetic_staging_fixture',
      aggregationClaim: 'not_real_candidate_aggregation',
      accuracyClaim: 'not_measured',
      realCandidateAggregationClaimed: false,
      realAccuracyClaimed: false,
    },
  }
  const temporaryRoot = fs.mkdtempSync(path.join(process.env.TEMP ?? root, 'wb-learning-v2-r3-'))
  const bashExecutable = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash'
  const runAcceptance = (report) => {
    const reportFile = path.join(temporaryRoot, 'report.json')
    fs.writeFileSync(reportFile, JSON.stringify(report), 'utf8')
    return spawnSync(bashExecutable, ['-c', acceptanceStep.run], {
      encoding: 'utf8',
      env: { ...process.env, REPORT_PATH: reportFile },
    })
  }
  try {
    assert.equal(runAcceptance(validReport).status, 0)

    const missingGlobal = structuredClone(validReport)
    missingGlobal.realCandidateAggregationCoverage.matrix.base_duration_benchmark.global.eligibleCount = 0
    const missingGlobalResult = runAcceptance(missingGlobal)
    assert.notEqual(missingGlobalResult.status, 0)
    assert.match(missingGlobalResult.stderr, /REAL_CANDIDATE_AGGREGATION_COVERAGE_INCOMPLETE/)

    const disabledPolicy = structuredClone(validReport)
    disabledPolicy.realCandidateAggregationCoverage.proposalAuditRecords[0].policyEvaluationRequired = false
    const disabledPolicyResult = runAcceptance(disabledPolicy)
    assert.notEqual(disabledPolicyResult.status, 0)
    assert.match(disabledPolicyResult.stderr, /REAL_CANDIDATE_POLICY_EVALUATION_INVALID/)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('same-SHA release modules pass the pure six-family/four-scope self-test', () => {
  const expectedReleaseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: releaseRoot, encoding: 'utf8' }).trim()
  const output = execFileSync(process.execPath, [
    scriptPath,
    'self-test',
    '--release-root', releaseRoot,
    '--expected-release-sha', expectedReleaseSha,
    '--operation-prefix', 'wb-learning-v2-self-test',
  ], { encoding: 'utf8' })
  const result = JSON.parse(output.trim())
  assert.equal(result.status, 'pass')
  assert.equal(result.publicationCount, 24)
  assert.deepEqual(result.assetKeys.length, 6)
  assert.deepEqual(result.scopeLevels, ['project', 'company', 'industry', 'global'])
  for (const counts of Object.values(result.aggregation)) {
    assert.deepEqual(counts, { project: 24, company: 6, industry: 3, global: 1 })
  }
  assert.equal(result.lifecycleSimulation.candidateResult.canaryPublished, 24)
  assert.equal(result.lifecycleSimulation.stableResult.stablePromoted, 24)
  assert.equal(result.lifecycleSimulation.rollbackResult.rollbackExecuted, 24)
  assert.equal(result.controlledFixturePolicyEvaluatorConsistent, true)
  assert.deepEqual(result.requiredConsumerKeys, [
    'durationSuggestionService',
    'projectCriticalPathService',
    'projectRemainingDurationForecastService',
    'scheduleAccelerationRuntimeService',
    'scheduleAccelerationService',
    'wbsTemplateGenerationService',
  ])
  assert.deepEqual(result.negativeContracts, {
    missingGlobalCoverageRejected: true,
    missingGlobalCoverageMutationCount: 0,
    missingGlobalCoverageLeftMutationDisarmed: true,
    handWrittenAutomationDecisionRejected: true,
    disabledPolicyEvaluationRejected: true,
    floorOverrideRejected: true,
    writeBeforeRealCoverageRejected: true,
    writeBeforeRealCoverageMutationCount: 0,
    cleanupWithoutMutationIsReadOnly: true,
    cleanupMutationStatementCount: 0,
    forgedCleanupWithoutCoverageProofIsReadOnly: true,
    outOfBoundaryMutationRejected: true,
    outOfBoundaryMutationCount: 0,
    crossProjectDatabaseIdentityRejected: true,
    staleAdvisorExportRejected: true,
  })
})

test('preflight binds runtime, migration, readyz, and fresh Advisor evidence to one Supabase project', () => {
  const source = fs.readFileSync(scriptPath, 'utf8')
  assert.match(source, /databaseConnectionIdentity/)
  assert.match(source, /runtimeConnectionIdentity\.projectRef/)
  assert.match(source, /adminConnectionIdentity\.projectRef/)
  assert.match(source, /readyz\?\.build\?\.databaseProjectRef/)
  assert.match(source, /SUPABASE_ADVISOR_EXPORT_JSON/)
  assert.match(source, /advisor_export_stale/)
  assert.doesNotMatch(source, /sameDatabase:\s*runtimeIdentity\.database_name === adminIdentity\.database_name/)
})
