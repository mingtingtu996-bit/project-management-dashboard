import { describe, expect, it, vi } from 'vitest'

import { runScopedBatch } from '../services/scopedBatchRunner.js'

describe('scoped batch runner', () => {
  it('retries only the failed scope and keeps successful scopes single-shot', async () => {
    const attempts = new Map<string, number>()
    const operation = vi.fn(async (scopeId: string) => {
      const attempt = (attempts.get(scopeId) ?? 0) + 1
      attempts.set(scopeId, attempt)
      if (scopeId === 'project-b' && attempt === 1) throw new Error('temporary')
      return `${scopeId}:ok`
    })

    await expect(runScopedBatch({
      operationName: 'demo',
      scopeIds: ['project-a', 'project-b'],
      maxAttempts: 2,
      baseDelayMs: 0,
      operation,
    })).resolves.toEqual({
      values: ['project-a:ok', 'project-b:ok'],
      successfulScopeIds: ['project-a', 'project-b'],
    })
    expect(attempts).toEqual(new Map([
      ['project-a', 1],
      ['project-b', 2],
    ]))
  })

  it('throws structured partial failure evidence after scoped retries are exhausted', async () => {
    const operation = vi.fn(async (scopeId: string) => {
      if (scopeId === 'project-b') throw new Error('permanent')
      return `${scopeId}:ok`
    })

    await expect(runScopedBatch({
      operationName: 'demo',
      scopeIds: ['project-a', 'project-b'],
      maxAttempts: 2,
      baseDelayMs: 0,
      operation,
    })).rejects.toMatchObject({
      code: 'SCOPED_BATCH_PARTIAL_FAILURE',
      successfulScopeIds: ['project-a'],
      failures: [{ scopeId: 'project-b', attempts: 2, errorMessage: 'permanent' }],
    })
  })
})
