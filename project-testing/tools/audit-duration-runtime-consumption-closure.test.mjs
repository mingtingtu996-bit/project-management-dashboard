import assert from 'node:assert/strict'
import test from 'node:test'

import {
  auditDurationRuntimeConsumptionClosure,
} from './audit-duration-runtime-consumption-closure.mjs'

const REQUIRED_CONSUMERS = [
  'wizard_master_plan',
  'task_plan_drilldown_rhythm',
  'critical_path_cpm',
  'project_remaining_duration_forecast',
  'schedule_acceleration_runtime',
]

function receipt(consumer, overrides = {}) {
  return {
    consumer,
    assetType: 'standard_work_duration_seed',
    stableCode: `asset:${consumer}`,
    role: 'stable_runtime',
    effectiveSource: 'active_seed',
    versionId: 'seed-v1',
    publicationKey: null,
    status: 'effective_applied',
    changedFields: ['duration'],
    targetRowIds: [`row:${consumer}`],
    reasonCodes: [],
    rollbackTarget: null,
    ...overrides,
  }
}

function validInput() {
  return {
    schemaVersion: 'duration-runtime-consumption-closure.v1',
    generatedAt: '2026-07-11T12:00:00.000Z',
    codeDigest: 'sha256:local-code',
    simulation: {
      status: 'pass',
      environmentTarget: 'local_static',
      mutationBoundary: 'report_files_only_no_db_writes',
      masterPlanSimpleAndControlFocused: true,
      drilldownUsesGovernedT2Assets: true,
    },
    receipts: [
      ...REQUIRED_CONSUMERS.map((consumer) => receipt(consumer)),
      receipt('durationSuggestionService', {
        assetType: 'base_duration_benchmark',
        stableCode: 'duration.benchmark_blend_weight',
        effectiveSource: 'stable_runtime_publication',
        versionId: null,
        publicationKey: 'publication-stable-1',
        rollbackTarget: 'publication-stable-0',
      }),
    ],
    requiredConsumers: REQUIRED_CONSUMERS,
    revisionResults: [{
      status: 'revision_draft_created',
      confirmationRequired: true,
      autoConfirmed: false,
      revisionStatus: 'revising',
    }],
    localVerification: {
      focusedTestsPassed: true,
      scopedTypecheckPassed: true,
      globalTypecheckStatus: 'blocked_unrelated',
      globalTypecheckBlockers: [
        'authRegistrationService.test.ts',
        'pdfRenderPool.test.ts',
      ],
      scopedRegistryGuardPassed: true,
      globalRegistryGuardStatus: 'blocked_unrelated',
      globalRegistryGuardBlockers: ['readyz', 'parallelService'],
      scopedWorkspaceIsolationGuardPassed: true,
      globalWorkspaceIsolationGuardStatus: 'blocked_unrelated',
      globalWorkspaceIsolationGuardBlockers: ['activeProjectService.listActiveProjectIds'],
      retainedRegressionPassed: true,
      accuracy: {
        sampleCount: 8,
        lineageCompleteCount: 8,
        meanAbsoluteErrorDays: 1.75,
        meanAbsolutePercentageError: 16,
        meanAbsolutePercentageErrorUnit: 'percent',
        overcompensationRate: 0.125,
        thresholds: {
          minimumSampleCount: 6,
          maximumMeanAbsoluteErrorDays: 3,
          maximumMeanAbsolutePercentageError: 25,
          maximumOvercompensationRate: 0.2,
        },
      },
    },
    environments: {
      staging: null,
      productionLive: { claimedStatus: 'closed' },
    },
  }
}

test('closes candidate/read-only while keeping staging and production/live unverified without fresh environment evidence', () => {
  const audit = auditDurationRuntimeConsumptionClosure(validInput())

  assert.equal(audit.candidateReadonly.status, 'closed')
  assert.equal(audit.staging.status, 'unable_to_verify')
  assert.equal(audit.productionLive.status, 'not_closed')
  assert.ok(audit.productionLive.reasonCodes.includes('fresh_production_live_evidence_required'))
})

test('rejects metadata-only utilization', () => {
  const input = validInput()
  input.receipts = input.receipts.map((item) => ({
    ...item,
    status: 'evidence_only',
    changedFields: [],
  }))

  const audit = auditDurationRuntimeConsumptionClosure(input)
  assert.equal(audit.candidateReadonly.status, 'not_closed')
  assert.equal(audit.gates.effectiveConsumption.status, 'fail')
})

test('rejects a missing downstream consumer', () => {
  const input = validInput()
  input.receipts = input.receipts.filter((item) => item.consumer !== 'schedule_acceleration_runtime')

  const audit = auditDurationRuntimeConsumptionClosure(input)
  assert.equal(audit.gates.downstreamConsumers.status, 'fail')
  assert.deepEqual(audit.gates.downstreamConsumers.missingConsumers, ['schedule_acceleration_runtime'])
})

test('rejects a consumed runtime publication without a rollback target', () => {
  const input = validInput()
  input.receipts = input.receipts.map((item) => item.publicationKey
    ? { ...item, rollbackTarget: null }
    : item)

  const audit = auditDurationRuntimeConsumptionClosure(input)
  assert.equal(audit.gates.rollback.status, 'fail')
  assert.deepEqual(audit.gates.rollback.missingRollbackPublicationKeys, ['publication-stable-1'])
})

test('rejects evidence that has no consumed runtime publication', () => {
  const input = validInput()
  input.receipts = input.receipts.filter((item) => !item.publicationKey)

  const audit = auditDurationRuntimeConsumptionClosure(input)
  assert.equal(audit.gates.rollback.status, 'fail')
  assert.ok(audit.gates.rollback.reasonCodes.includes('runtime_publication_consumption_receipt_required'))
})

test('accepts scoped typecheck while exposing unrelated global blockers', () => {
  const audit = auditDurationRuntimeConsumptionClosure(validInput())

  assert.equal(audit.gates.localVerification.status, 'pass')
  assert.equal(audit.gates.localVerification.globalTypecheckStatus, 'blocked_unrelated')
  assert.deepEqual(audit.gates.localVerification.globalTypecheckBlockers, [
    'authRegistrationService.test.ts',
    'pdfRenderPool.test.ts',
  ])
})

test('accepts the scoped registry guard while exposing unrelated global registry blockers', () => {
  const audit = auditDurationRuntimeConsumptionClosure(validInput())

  assert.equal(audit.gates.localVerification.status, 'pass')
  assert.equal(audit.gates.localVerification.globalRegistryGuardStatus, 'blocked_unrelated')
  assert.deepEqual(audit.gates.localVerification.globalRegistryGuardBlockers, ['readyz', 'parallelService'])
})

test('rejects a failed scoped workspace isolation guard while exposing global blockers separately', () => {
  const input = validInput()
  input.localVerification.scopedWorkspaceIsolationGuardPassed = false
  const audit = auditDurationRuntimeConsumptionClosure(input)

  assert.equal(audit.gates.localVerification.status, 'fail')
  assert.ok(audit.gates.localVerification.reasonCodes.includes('scoped_workspace_isolation_guard_not_passed'))
  assert.equal(audit.gates.localVerification.globalWorkspaceIsolationGuardStatus, 'blocked_unrelated')
})

test('rejects an automatically confirmed revision', () => {
  const input = validInput()
  input.revisionResults = [{
    status: 'revision_draft_created',
    confirmationRequired: false,
    autoConfirmed: true,
    revisionStatus: 'confirmed',
  }]

  const audit = auditDurationRuntimeConsumptionClosure(input)
  assert.equal(audit.gates.revisionSafety.status, 'fail')
  assert.ok(audit.gates.revisionSafety.reasonCodes.includes('auto_confirmed_revision_forbidden'))
})

test('verifies staging only when target, digest, timestamp and all runtime checks match', () => {
  const input = validInput()
  input.environments.staging = {
    target: 'staging',
    codeDigest: input.codeDigest,
    executedAt: '2026-07-11T12:30:00.000Z',
    checks: {
      migrationsApplied: true,
      authenticatedWizardPreviewCommit: true,
      retryIdempotency: true,
      postCommitRecovery: true,
      runtimeConsumptionObserved: true,
      canaryPublication: true,
      monitoring: true,
      rollback: true,
      tenantIsolation: true,
    },
  }

  const audit = auditDurationRuntimeConsumptionClosure(input)
  assert.equal(audit.staging.status, 'verified')
})
