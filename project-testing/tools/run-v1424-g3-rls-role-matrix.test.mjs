import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTenantAccessMatrix,
  containsSecretLikeText,
} from './run-v1424-g3-rls-role-matrix.mjs'

test('builds tenant access matrix with same-company outsider rejection', () => {
  const report = {
    generatedAt: '2026-07-04T00:00:00.000Z',
    apiBase: 'http://127.0.0.1:3106',
    status: 'pass',
    coverageSummary: {
      blockers: [],
    },
    cases: [
      { id: 'G3-OWNER-PROJECT-READ', status: 'pass', httpStatus: 200 },
      { id: 'G3-OWNER-PROJECT-WRITE', status: 'pass', httpStatus: 201 },
      { id: 'G3-COMPANY-ADMIN-PROJECT-READ', status: 'pass', httpStatus: 200 },
      { id: 'G3-COMPANY-ADMIN-PROJECT-PATCH', status: 'pass', httpStatus: 200 },
      { id: 'G3-EDITOR-TASK-LIST', status: 'pass', httpStatus: 200 },
      { id: 'G3-EDITOR-TASK-WRITE', status: 'pass', httpStatus: 200 },
      { id: 'G3-EDITOR-PROJECT-PATCH-REJECTED', status: 'pass', httpStatus: 403, errorCode: 'FORBIDDEN' },
      { id: 'G3-OUTSIDER-MEMBERSHIP-REJECTED', status: 'pass', httpStatus: 403, errorCode: 'FORBIDDEN' },
      { id: 'G3-OUTSIDER-TASK-LIST-REJECTED', status: 'pass', httpStatus: 403, errorCode: 'FORBIDDEN' },
      { id: 'G3-OUTSIDER-TASK-WRITE-REJECTED', status: 'pass', httpStatus: 403, errorCode: 'FORBIDDEN' },
      { id: 'G3-OUTSIDER-PROJECT-PATCH-REJECTED', status: 'pass', httpStatus: 403, errorCode: 'FORBIDDEN' },
      { id: 'G3-ANON-PROJECT-CREATE-REJECTED', status: 'pass', httpStatus: 401, errorCode: 'UNAUTHORIZED' },
      { id: 'G3-INVALID-TOKEN-PROJECT-LIST-REJECTED', status: 'pass', httpStatus: 401, errorCode: 'INVALID_TOKEN' },
      { id: 'G3-CROSS-TENANT-OWN-PROJECT-WRITE', status: 'pass', httpStatus: 201 },
      { id: 'G3-CROSS-TENANT-STANDARD-PROJECT-READ-REJECTED', status: 'pass', httpStatus: 403, errorCode: 'FORBIDDEN' },
      { id: 'G3-CROSS-TENANT-PROJECT-LIST-ISOLATED', status: 'pass', httpStatus: 200 },
      { id: 'G3-CROSS-TENANT-STANDARD-TASK-WRITE-REJECTED', status: 'pass', httpStatus: 403, errorCode: 'FORBIDDEN' },
    ],
  }

  const matrix = buildTenantAccessMatrix(report)
  const outsiderRow = matrix.matrix.find((row) => row.actor === 'outsider')
  const crossTenantRow = matrix.matrix.find((row) => row.actor === 'cross_company_user')

  assert.equal(matrix.status, 'pass')
  assert.deepEqual(matrix.blockers, [])
  assert.equal(outsiderRow.membershipRejected.status, 'pass')
  assert.equal(outsiderRow.readRejected.status, 'pass')
  assert.equal(outsiderRow.writeRejected.status, 'pass')
  assert.equal(crossTenantRow.crossReadRejected.httpStatus, 403)
  assert.equal(crossTenantRow.crossWriteRejected.httpStatus, 403)
})

test('detects secret-like text before writing release reports', () => {
  assert.equal(containsSecretLikeText({ token: 'eyJhbGciOi.fake.payload' }), true)
  assert.equal(containsSecretLikeText({ header: 'Bearer abc.def.ghi' }), true)
  assert.equal(containsSecretLikeText({ key: 'SUPABASE_SERVICE_KEY=abc' }), true)
  assert.equal(containsSecretLikeText({ rawTokenWrittenToReport: false, status: 'blocked' }), false)
})
