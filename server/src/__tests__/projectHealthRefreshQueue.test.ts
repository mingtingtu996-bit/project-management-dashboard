import { describe, expect, it, vi } from 'vitest'

import { createProjectHealthRefreshQueue } from '../services/projectHealthRefreshQueue.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('project health refresh queue', () => {
  it('runs one refresh at a time, deduplicates queued projects, and coalesces one active-project rerun', async () => {
    const firstRefresh = deferred()
    const calls: string[] = []
    let active = 0
    let maxActive = 0
    const refresh = vi.fn(async (projectId: string) => {
      calls.push(projectId)
      active += 1
      maxActive = Math.max(maxActive, active)
      if (calls.length === 1) await firstRefresh.promise
      active -= 1
    })
    const queue = createProjectHealthRefreshQueue({ refresh, retryDelayMs: 0 })

    queue.enqueue('project-1', 'task_updated')
    await vi.waitFor(() => expect(queue.getStatus().activeProjectId).toBe('project-1'))
    queue.enqueue('project-2', 'risk_updated')
    queue.enqueue('project-2', 'risk_updated_again')
    queue.enqueue('project-1', 'condition_updated_during_refresh')

    expect(queue.getStatus()).toMatchObject({
      activeProjectId: 'project-1',
      queuedProjectCount: 2,
      failedProjectCount: 0,
      healthy: true,
    })

    firstRefresh.resolve()
    await queue.drain()

    expect(calls).toEqual(['project-1', 'project-2', 'project-1'])
    expect(maxActive).toBe(1)
    expect(queue.getStatus()).toMatchObject({
      activeProjectId: null,
      queuedProjectCount: 0,
      failedProjectCount: 0,
      healthy: true,
    })
  })

  it('retries bounded failures, reports terminal failure, and recovers after a later success', async () => {
    let shouldFail = true
    const refresh = vi.fn(async () => {
      if (shouldFail) throw new Error('database timeout')
    })
    const queue = createProjectHealthRefreshQueue({
      refresh,
      maxAttempts: 3,
      retryDelayMs: 0,
      now: () => new Date('2026-07-14T00:00:00.000Z'),
    })

    queue.enqueue('project-1', 'planning_governance_notification')
    await queue.drain()

    expect(refresh).toHaveBeenCalledTimes(3)
    expect(queue.getStatus()).toMatchObject({
      healthy: false,
      failedProjectCount: 1,
      lastFailure: {
        projectId: 'project-1',
        trigger: 'planning_governance_notification',
        attempts: 3,
        failedAt: '2026-07-14T00:00:00.000Z',
        error: 'database timeout',
      },
    })

    shouldFail = false
    queue.enqueue('project-1', 'manual_recovery')
    await queue.drain()

    expect(refresh).toHaveBeenCalledTimes(4)
    expect(queue.getStatus()).toMatchObject({
      healthy: true,
      failedProjectCount: 0,
      activeProjectId: null,
      queuedProjectCount: 0,
    })
  })
})
