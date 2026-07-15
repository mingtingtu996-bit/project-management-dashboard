import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildMatrix } from './build-v14241-real-env-uat-matrix.mjs'

test('builds executable real-environment UAT/staging/solo-live/live matrix with explicit handoff boundary', async () => {
  const matrix = await buildMatrix({ now: new Date('2026-07-06T00:00:00.000Z') })

  assert.equal(matrix.schemaVersion, 'workbuddy/v14241-real-env-uat-staging-live-matrix/v1')
  assert.equal(matrix.status, 'matrix_ready_execution_blocked_until_real_environment_handoff')
  assert.equal(matrix.boundary.localMockEvidenceCannotClose, true)
  assert.equal(matrix.boundary.liveExecutionRequiresHandoff, true)
  assert.equal(matrix.scenarios.length, 16)

  const ids = matrix.scenarios.map((scenario) => scenario.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('REAL-UAT-01'))
  assert.ok(ids.includes('REAL-UAT-03'))
  assert.ok(ids.includes('REAL-UAT-14'))
  assert.ok(ids.includes('REAL-UAT-16'))

  for (const item of matrix.scenarios) {
    assert.equal(item.status, 'blocked_pending_real_environment_handoff')
    assert.equal(item.executionStatus, 'not_executed')
    assert.ok(item.productionBaselineIds.length > 0, `${item.id} missing baseline mapping`)
    assert.ok(item.gateRefs.length > 0, `${item.id} missing gate refs`)
    assert.ok(item.prerequisites.length > 0, `${item.id} missing prerequisites`)
    assert.ok(item.steps.length > 0, `${item.id} missing steps`)
    assert.ok(item.expected.length > 0, `${item.id} missing expectations`)
    assert.ok(item.failIf.length > 0, `${item.id} missing failIf`)
    assert.ok(item.evidenceContract.requiredArtifacts.length > 0, `${item.id} missing evidence artifacts`)
    assert.ok(item.evidenceContract.requiredMetadata.includes('cleanupOrRollbackReadback'), `${item.id} must require cleanup/rollback readback`)
    assert.ok(item.evidenceContract.rejectIf.includes('mock-api-only'), `${item.id} must reject mock-only evidence`)
    assert.deepEqual(item.tiers.map((tier) => tier.name), ['UAT', 'staging', 'solo-live', 'live'])
    assert.ok(item.tiers.every((tier) => tier.status === 'blocked_missing_handoff'))
  }
})
