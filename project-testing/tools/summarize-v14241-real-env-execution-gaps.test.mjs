import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildExecutionGapSummary,
  renderGapSummaryMarkdown,
} from './summarize-v14241-real-env-execution-gaps.mjs'

function matrixScenario(id = 'REAL-UAT-01') {
  return {
    id,
    title: 'Synthetic scenario',
    priority: 'P0',
    status: 'blocked_missing_real_handoff_inputs_with_supporting_evidence_only',
    realEnvironmentPass: false,
    passedTierCount: 0,
    totalTierCount: 4,
    tiers: [
      {
        name: 'UAT',
        status: 'blocked_missing_real_handoff_inputs',
        mayClaimPass: false,
        missingInputs: ['UAT URL'],
        missingArtifacts: ['real-uat-main.json'],
        missingMetadata: ['environment', 'baseUrl'],
        reason: 'Scenario evidence artifacts are missing for this tier.',
      },
      {
        name: 'staging',
        status: 'blocked_missing_real_handoff_inputs',
        mayClaimPass: false,
        missingInputs: ['staging base URL'],
        missingArtifacts: ['real-uat-main.json'],
        missingMetadata: ['environment', 'baseUrl'],
        reason: 'Scenario evidence artifacts are missing for this tier.',
      },
      {
        name: 'solo-live',
        status: 'blocked_missing_real_handoff_inputs',
        mayClaimPass: false,
        missingInputs: ['solo-live owner and self-approval refs'],
        missingArtifacts: ['real-uat-main.json'],
        missingMetadata: ['environment', 'baseUrl'],
        reason: 'Scenario evidence artifacts are missing for this tier.',
      },
      {
        name: 'live',
        status: 'blocked_missing_real_handoff_inputs',
        mayClaimPass: false,
        missingInputs: ['live handoff declaration'],
        missingArtifacts: ['real-uat-main.json'],
        missingMetadata: ['environment', 'baseUrl'],
        reason: 'Scenario evidence artifacts are missing for this tier.',
      },
    ],
    supportingEvidence: [
      {
        classification: 'local_support_passed',
        status: 'local_support_passed',
        closesRealEnvironmentTier: false,
        artifacts: [{ path: 'project-testing/artifacts/local.json', present: true, status: 'pass' }],
      },
    ],
  }
}

function matrixReport() {
  return {
    schemaVersion: 'test',
    status: 'real_env_matrix_not_executed_support_only',
    summary: {
      scenarioCount: 1,
      tierCount: 4,
      passedTierCount: 0,
      fullyPassedScenarioCount: 0,
      supportOnlyScenarioCount: 1,
      blockedScenarioCount: 1,
    },
    envReadiness: {
      staging: { missingKeys: [] },
      'solo-live': { missingKeys: [] },
      live: { missingKeys: ['LIVE_BASE_URL'] },
    },
    stagingPreflight: {
      status: 'pass',
      targetClass: 'local_runtime_with_staging_env_refs',
      canCloseScenarioTier: false,
    },
    realEnvHandoffReadiness: {
      readyToExecuteMatrix: false,
    },
    scenarios: [matrixScenario()],
  }
}

function blockedReadiness() {
  return {
    status: 'fail',
    readyToExecuteMatrix: false,
    scenarioCount: 1,
    readyScenarioCount: 0,
    tierCount: 4,
    readyTierCount: 0,
    blockedTierCount: 4,
    secretLeakCount: 0,
    scenarios: [
      {
        id: 'REAL-UAT-01',
        title: 'Synthetic scenario',
        readyToRun: false,
        tiers: [
          {
            name: 'UAT',
            readyToRun: false,
            missingEnvironmentFields: ['baseUrlRef'],
            missingScenarioFields: ['targetRefs.companyIdRef'],
            missingOwnerFields: ['evidenceOwners.uat-tester'],
          },
          {
            name: 'staging',
            readyToRun: false,
            missingEnvironmentFields: ['writeApprovalRef'],
            missingScenarioFields: ['cleanupRef'],
            missingOwnerFields: ['evidenceOwners.cleanup-owner'],
          },
          {
            name: 'solo-live',
            readyToRun: false,
            missingEnvironmentFields: ['selfApprovalRef'],
            missingScenarioFields: ['rollbackRef'],
            missingOwnerFields: ['evidenceOwners.solo-live-owner'],
          },
          {
            name: 'live',
            readyToRun: false,
            missingEnvironmentFields: ['liveHandoffDeclarationRef'],
            missingScenarioFields: ['approvalRef'],
            missingOwnerFields: ['evidenceOwners.rollback-owner'],
          },
        ],
      },
    ],
  }
}

test('summarizes a fully blocked v14241 matrix without converting support evidence to pass', () => {
  const report = buildExecutionGapSummary({
    matrixReport: matrixReport(),
    handoffReadiness: blockedReadiness(),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const markdown = renderGapSummaryMarkdown(report)

  assert.equal(report.status, 'blocked_waiting_for_real_environment_handoff')
  assert.equal(report.summary.canExecuteAnyTier, false)
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(report.summary.readyTierCount, 0)
  assert.equal(report.summary.readyUnpassedTierCount, 0)
  assert.equal(report.scenarios[0].supportEvidence[0].closesRealEnvironmentTier, false)
  assert.ok(report.hardBlockers.includes('all_real_environment_tiers_missing_handoff_inputs'))
  assert.ok(report.hardBlockers.includes('staging_env_refs_point_to_local_runtime_not_deployed_staging'))
  assert.match(markdown, /Can execute any real tier now: no/)
  assert.doesNotMatch(JSON.stringify(report), /password=|postgres:\/\//i)
})

test('marks the package ready for partial execution only when a real tier is handoff-ready', () => {
  const readiness = blockedReadiness()
  readiness.readyTierCount = 1
  readiness.blockedTierCount = 3
  readiness.scenarios[0].tiers[1] = {
    name: 'staging',
    readyToRun: true,
    missingEnvironmentFields: [],
    missingScenarioFields: [],
    missingOwnerFields: [],
  }

  const report = buildExecutionGapSummary({
    matrixReport: matrixReport(),
    handoffReadiness: readiness,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'ready_for_partial_real_env_execution')
  assert.equal(report.summary.canExecuteAnyTier, true)
  assert.equal(report.summary.readyUnpassedTierCount, 1)
  assert.equal(report.scenarios[0].tiers.find((tier) => tier.tier === 'staging').readyToRun, true)
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(report.executionBoundary.mayExecuteRealScenarioTierNow, true)
})

test('marks the package partially executed when a tier already passed but other tiers remain blocked', () => {
  const readiness = blockedReadiness()
  readiness.readyTierCount = 1
  readiness.blockedTierCount = 3
  readiness.scenarios[0].tiers[1] = {
    name: 'staging',
    readyToRun: true,
    missingEnvironmentFields: [],
    missingScenarioFields: [],
    missingOwnerFields: [],
  }

  const sourceReport = matrixReport()
  sourceReport.status = 'real_env_matrix_partially_executed_with_blockers'
  sourceReport.summary.passedTierCount = 1
  sourceReport.summary.supportOnlyScenarioCount = 1
  sourceReport.scenarios[0].passedTierCount = 1
  sourceReport.scenarios[0].tiers[1] = {
    ...sourceReport.scenarios[0].tiers[1],
    status: 'passed',
    mayClaimPass: true,
    missingInputs: [],
    missingArtifacts: [],
    missingMetadata: [],
  }

  const report = buildExecutionGapSummary({
    matrixReport: sourceReport,
    handoffReadiness: readiness,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'real_env_matrix_partially_executed_with_remaining_gaps')
  assert.equal(report.summary.passedTierCount, 1)
  assert.equal(report.summary.readyTierCount, 1)
  assert.equal(report.summary.readyUnpassedTierCount, 0)
  assert.equal(report.summary.blockedTierCount, 3)
  assert.equal(report.summary.canExecuteAnyTier, false)
  assert.ok(report.hardBlockers.includes('remaining_real_environment_tiers_missing_handoff_inputs'))
  assert.equal(report.scenarios[0].tiers.find((tier) => tier.tier === 'staging').status, 'passed')
})
