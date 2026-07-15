import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assertNoSecretLikeText,
  buildMaterialConditionPayload,
  buildRiskPayload,
  buildRiskSourcedIssuePayload,
  entityCleanupStatus,
} from './collect-v14241-real-uat08-business-loop-evidence.mjs'

test('builds risk, issue, and material-condition payloads bound to one task and project', () => {
  const input = {
    projectId: '11111111-1111-4111-8111-111111111111',
    taskId: '22222222-2222-4222-8222-222222222222',
    riskId: '33333333-3333-4333-8333-333333333333',
    runId: 'uat08-test',
  }

  const risk = buildRiskPayload(input)
  const issue = buildRiskSourcedIssuePayload(input)
  const condition = buildMaterialConditionPayload(input)

  assert.equal(risk.project_id, input.projectId)
  assert.equal(risk.task_id, input.taskId)
  assert.equal(risk.risk_category, 'progress')
  assert.match(risk.title, /uat08-test/)

  assert.equal(issue.project_id, input.projectId)
  assert.equal(issue.task_id, input.taskId)
  assert.equal(issue.source_type, 'risk_converted')
  assert.equal(issue.source_id, input.riskId)
  assert.equal(issue.source_entity_type, 'risk')

  assert.equal(condition.project_id, input.projectId)
  assert.equal(condition.task_id, input.taskId)
  assert.equal(condition.condition_type, 'material')
  assert.equal(condition.is_satisfied, false)
})

test('rejects secret-like business loop reports before writing evidence', () => {
  assert.throws(
    () => assertNoSecretLikeText({ db: 'postgresql://user:pass@example/db' }),
    /refusing_to_write_real_uat08_report_with_secret_like_text/,
  )
})

test('accepts retention cleanup when readback is in a closed or satisfied state', () => {
  const protectedDelete = { ok: false, status: 422, elapsedMs: 12 }

  assert.equal(
    entityCleanupStatus(protectedDelete, { ok: true, status: 200, body: { data: { status: 'resolved' } } }).status,
    'pass',
  )
  assert.equal(
    entityCleanupStatus(protectedDelete, { ok: true, status: 200, body: { data: { status: '已确认', is_satisfied: true } } }).status,
    'pass',
  )
  assert.equal(
    entityCleanupStatus(protectedDelete, { ok: true, status: 200, body: { data: { status: 'open' } } }).status,
    'blocked',
  )
})
