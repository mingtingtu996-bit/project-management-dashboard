import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  executeSQL: vi.fn(async () => {
    mocks.events.push('INSERT_NOTIFICATION')
    return []
  }),
  executeSQLOne: vi.fn(async () => ({ company_id: 'company-1' })),
  broadcastRealtimeEvent: vi.fn(() => {
    mocks.events.push('BROADCAST_NOTIFICATION')
  }),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
}))

vi.mock('../services/realtimeServer.js', () => ({
  broadcastRealtimeEvent: mocks.broadcastRealtimeEvent,
}))

const { runWithDatabaseTransactionClient } = await import('../database.js')
const { insertNotification } = await import('../services/notificationStore.js')

function createTransactionClient() {
  return {
    query: vi.fn(async (sql: string) => {
      mocks.events.push(String(sql).trim())
      return { rows: [], rowCount: 1 }
    }),
    release: vi.fn(() => mocks.events.push('RELEASE')),
  }
}

async function insertDrawingNotification() {
  return insertNotification({
    id: 'notification-transactional',
    project_id: 'project-1',
    user_id: 'user-1',
    type: 'drawing_version_updated',
    title: 'Drawing updated',
    content: 'Drawing D-001 is now version 2.0',
  } as any)
}

describe('notification transaction post-commit effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.events.splice(0)
  })

  it('broadcasts a transactional notification only after commit and client release', async () => {
    await runWithDatabaseTransactionClient(createTransactionClient(), async () => {
      await insertDrawingNotification()
      expect(mocks.broadcastRealtimeEvent).not.toHaveBeenCalled()
      mocks.events.push('WORK_COMPLETE')
    })

    expect(mocks.events).toEqual([
      'BEGIN',
      'INSERT_NOTIFICATION',
      'WORK_COMPLETE',
      'COMMIT',
      'RELEASE',
      'BROADCAST_NOTIFICATION',
    ])
  })

  it('drops the pending notification broadcast when the transaction rolls back', async () => {
    await expect(runWithDatabaseTransactionClient(createTransactionClient(), async () => {
      await insertDrawingNotification()
      throw new Error('injected downstream drawing failure')
    })).rejects.toThrow('injected downstream drawing failure')

    expect(mocks.events).toEqual([
      'BEGIN',
      'INSERT_NOTIFICATION',
      'ROLLBACK',
      'RELEASE',
    ])
    expect(mocks.broadcastRealtimeEvent).not.toHaveBeenCalled()
  })
})
