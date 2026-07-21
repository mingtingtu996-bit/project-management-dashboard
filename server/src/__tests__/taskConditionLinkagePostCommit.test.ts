import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  enqueueProjectHealthUpdate: vi.fn((projectId: string, trigger: string) => {
    mocks.events.push(`ENQUEUE_HEALTH:${projectId}:${trigger}`)
  }),
}))

vi.mock('../services/projectHealthService.js', () => ({
  enqueueProjectHealthUpdate: mocks.enqueueProjectHealthUpdate,
}))

const { runWithDatabaseTransactionClient } = await import('../database.js')
const { autoSatisfyDrawingPackageConditions } = await import('../services/taskConditionLinkageService.js')

function createTransactionClient() {
  return {
    query: vi.fn(async (sql: string) => {
      const normalized = String(sql).trim()
      if (normalized.startsWith('SELECT id') && normalized.includes('FROM public.task_conditions')) {
        mocks.events.push('READ_CONDITIONS')
        return { rows: [{ id: '11111111-1111-4111-8111-111111111111' }], rowCount: 1 }
      }
      if (normalized.startsWith('UPDATE public.task_conditions')) {
        mocks.events.push('UPDATE_CONDITIONS')
        return { rows: [], rowCount: 1 }
      }
      mocks.events.push(normalized)
      return { rows: [], rowCount: 1 }
    }),
    release: vi.fn(() => mocks.events.push('RELEASE')),
  }
}

async function autoSatisfyDrawingCondition() {
  return autoSatisfyDrawingPackageConditions({
    projectId: 'project-1',
    drawingPackageId: 'package-1',
    drawingPackageCode: 'PKG-001',
    satisfiedAt: '2026-07-21',
    confirmedBy: 'user-1',
  })
}

describe('task condition linkage post-commit health refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.events.splice(0)
  })

  it('enqueues project health only after the condition transaction commits and releases', async () => {
    await runWithDatabaseTransactionClient(createTransactionClient(), async () => {
      await expect(autoSatisfyDrawingCondition()).resolves.toBe(1)
      expect(mocks.enqueueProjectHealthUpdate).not.toHaveBeenCalled()
      mocks.events.push('WORK_COMPLETE')
    })

    expect(mocks.events).toEqual([
      'BEGIN',
      'READ_CONDITIONS',
      'UPDATE_CONDITIONS',
      'WORK_COMPLETE',
      'COMMIT',
      'RELEASE',
      'ENQUEUE_HEALTH:project-1:task_condition_auto_satisfied',
    ])
  })

  it('drops the pending project health refresh when the transaction rolls back', async () => {
    await expect(runWithDatabaseTransactionClient(createTransactionClient(), async () => {
      await autoSatisfyDrawingCondition()
      throw new Error('injected drawing rollback')
    })).rejects.toThrow('injected drawing rollback')

    expect(mocks.events).toEqual([
      'BEGIN',
      'READ_CONDITIONS',
      'UPDATE_CONDITIONS',
      'ROLLBACK',
      'RELEASE',
    ])
    expect(mocks.enqueueProjectHealthUpdate).not.toHaveBeenCalled()
  })
})
