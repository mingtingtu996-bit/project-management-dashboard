import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  isDatabaseTransactionActive: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
  isDatabaseTransactionActive: mocks.isDatabaseTransactionActive,
}))

import {
  buildTaskCommitReplaySummary,
  completeTaskCommitRequest,
  reserveTaskCommitRequest,
} from '../services/taskCommitIdempotencyService.js'

describe('task commit idempotency service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDatabaseTransactionActive.mockReturnValue(true)
  })

  it('builds commit mutation counts outside the route layer', () => {
    expect(buildTaskCommitReplaySummary({
      changedTaskIds: new Set(['created-task-1', 'updated-task-1']),
      deletedTaskIds: new Set(['deleted-task-1']),
      tempIdMap: new Map([['tmp-1', 'created-task-1']]),
      deletionResults: [{ rowId: 'deleted-task-1', action: 'deleted' }],
    })).toEqual({
      createdRowCount: 1,
      deletedRowCount: 1,
      changedRowCount: 3,
      tempIdMap: { 'tmp-1': 'created-task-1' },
      deletionResults: [{ rowId: 'deleted-task-1', action: 'deleted' }],
    })
  })

  it('returns a stored successful summary without reserving duplicate work', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          id: 'commit-1',
          project_id: 'project-1',
          request_id: 'request-1',
          request_hash: 'hash-1',
          status: 'succeeded',
          result_summary: {
            createdRowCount: 1,
            deletedRowCount: 0,
            changedRowCount: 1,
            tempIdMap: { 'tmp-1': 'task-1' },
            deletionResults: [],
          },
        }],
        rowCount: 1,
      })

    await expect(reserveTaskCommitRequest({
      projectId: 'project-1',
      requestId: 'request-1',
      requestHash: 'hash-1',
      requestedBy: 'user-1',
    })).resolves.toMatchObject({
      kind: 'replay',
      summary: {
        createdRowCount: 1,
        tempIdMap: { 'tmp-1': 'task-1' },
      },
    })
  })

  it('rejects an idempotency key reused for a different commit payload', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          id: 'commit-1', project_id: 'project-1', request_id: 'request-1',
          request_hash: 'another-hash', status: 'succeeded', result_summary: {},
        }],
        rowCount: 1,
      })

    await expect(reserveTaskCommitRequest({
      projectId: 'project-1',
      requestId: 'request-1',
      requestHash: 'hash-1',
      requestedBy: 'user-1',
    })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      statusCode: 409,
    })
  })

  it('marks the reservation succeeded with its replay summary in the same transaction', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 'commit-1' }], rowCount: 1 })

    await completeTaskCommitRequest({
      projectId: 'project-1',
      requestId: 'request-1',
      requestHash: 'hash-1',
      summary: {
        createdRowCount: 1,
        deletedRowCount: 0,
        changedRowCount: 1,
        tempIdMap: { 'tmp-1': 'task-1' },
        deletionResults: [],
      },
    })

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'succeeded'"),
      expect.arrayContaining(['project-1', 'request-1', 'hash-1']),
    )
  })
})
