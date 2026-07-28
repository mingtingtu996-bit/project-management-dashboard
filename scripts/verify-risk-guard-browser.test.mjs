import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMockResponse,
  extractRiskGuardEntityIdFromDetailTestId,
  preparePendingRiskFixture,
  resolveRiskGuardProjectId,
} from './verify-risk-guard-browser.mjs'

test('proxy risk-guard verification resolves the standard full-app fixture project', () => {
  const projectId = resolveRiskGuardProjectId({
    envProjectId: '',
    mockApi: false,
    currentProjectId: 'legacy-project',
    manifest: {
      projects: {
        standard: { id: 'standard-project' },
        large: { id: 'large-project' },
      },
    },
  })

  assert.equal(projectId, 'standard-project')
})

test('risk-guard verification extracts dynamic risk ids from detail trigger test ids', () => {
  assert.equal(
    extractRiskGuardEntityIdFromDetailTestId('risk-detail-open-risk-2f21ad5c-dynamic'),
    '2f21ad5c-dynamic',
  )
})

test('risk-guard verification prepares the same stale pending-risk fixture in mock mode', () => {
  const prepared = preparePendingRiskFixture([
    { id: 'risk-active', title: 'active', version: 2, pending_manual_close: false },
    { id: 'risk-pending', title: 'pending', version: 4, pending_manual_close: true },
  ])

  assert.deepEqual(prepared.pendingRisk, {
    id: 'risk-pending',
    title: 'pending',
    originalVersion: 4,
    staleVersion: 3,
  })
  assert.equal(prepared.staleVersionInjected, true)
  assert.equal(prepared.patchedRisks[1].version, 3)
})

test('risk-guard mock exposes a controlled taxonomy for structured closure', () => {
  const response = buildMockResponse('http://127.0.0.1:3001/api/cause-attributions/taxonomy', 'GET')
  const body = JSON.parse(response.body)

  assert.equal(body.success, true)
  assert.equal(body.data.entries.some((entry) => entry.code === 'other'), true)
})
