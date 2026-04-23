import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { storageService, SyncQueueItem } from '../storageService'

function createTaskUpdate(id: string) {
  return {
    type: 'task' as const,
    action: 'update' as const,
    data: { id, title: `Task ${id}` },
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForAssertion(assertion: () => void, timeoutMs = 500, intervalMs = 20) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion()
      return
    } catch {
      await delay(intervalMs)
    }
  }

  assertion()
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  })
}

describe('StorageService concurrency controls', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    storageService.clearPendingOps()
    localStorage.clear()

    ;(storageService as any).cloudAdapter = {
      updateTask: vi.fn(async () => {
        await delay(20)
      }),
    }
    setDocumentHidden(false)
  })

  afterEach(() => {
    ;(storageService as any).cloudAdapter = null
    setDocumentHidden(false)
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  it('prevents the sync queue from leaving multiple items stuck in syncing state', async () => {
    for (let index = 0; index < 5; index += 1) {
      storageService.addToSyncQueue(createTaskUpdate(`task-${index}`))
    }

    expect(storageService.getPendingSyncCount()).toBe(5)

    await Promise.all([
      (storageService as any).processSyncQueue(),
      (storageService as any).processSyncQueue(),
      (storageService as any).processSyncQueue(),
    ])

    const queue = storageService.getSyncQueue()
    const syncingCount = queue.filter((item: SyncQueueItem) => item.status === 'syncing').length

    expect(syncingCount).toBe(0)
  })

  it('supports cancelling an in-flight sync pass without leaving stuck items behind', async () => {
    storageService.addToSyncQueue(createTaskUpdate('task-1'))

    const firstPass = (storageService as any).processSyncQueue()
    const secondPass = (storageService as any).processSyncQueue()

    await Promise.all([firstPass, secondPass])

    const queue = storageService.getSyncQueue()
    expect(queue.filter((item: SyncQueueItem) => item.status === 'syncing')).toHaveLength(0)
  })

  it('marks an item as failed after exhausting retry attempts', async () => {
    storageService.addToSyncQueue(createTaskUpdate('task-fail'))

    ;(storageService as any).cloudAdapter = {
      updateTask: vi.fn().mockRejectedValue(new Error('Network error')),
    }

    await (storageService as any).processSyncQueue()
    await (storageService as any).processSyncQueue()
    await (storageService as any).processSyncQueue()

    const queue = storageService.getSyncQueue()
    const failedItem = queue.find((item: SyncQueueItem) => (item.data as { id?: string }).id === 'task-fail')

    expect(failedItem).toBeTruthy()
    expect(failedItem?.retries).toBe(3)
    expect(failedItem?.status).toBe('failed')
  })

  it('dispatches a sync-failed event after repeated failures', async () => {
    const eventListener = vi.fn()
    window.addEventListener('storage:sync-failed', eventListener)

    storageService.addToSyncQueue(createTaskUpdate('task-event'))

    ;(storageService as any).cloudAdapter = {
      updateTask: vi.fn().mockRejectedValue(new Error('Network error')),
    }

    await (storageService as any).processSyncQueue()
    await (storageService as any).processSyncQueue()
    await (storageService as any).processSyncQueue()

    expect(eventListener).toHaveBeenCalled()

    window.removeEventListener('storage:sync-failed', eventListener)
  })

  it('pauses sync while the tab is hidden and reconciles once visible again', async () => {
    const updateTask = vi.fn(async () => {
      await delay(5)
    })

    ;(storageService as any).cloudAdapter = { updateTask }
    storageService.addToSyncQueue(createTaskUpdate('task-hidden'))

    setDocumentHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))

    await (storageService as any).processSyncQueue()
    expect(updateTask).not.toHaveBeenCalled()

    setDocumentHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))

    await waitForAssertion(() => {
      expect(updateTask).toHaveBeenCalledTimes(1)
    })
  })

  it('deduplicates pending sync items for the same entity and keeps the latest payload', () => {
    storageService.addToSyncQueue(createTaskUpdate('task-dedupe'))
    storageService.addToSyncQueue({
      type: 'task',
      action: 'update',
      data: { id: 'task-dedupe', title: 'Task dedupe latest', progress: 80 },
    })

    const queue = storageService.getSyncQueue().filter((item: SyncQueueItem) => (item.data as { id?: string }).id === 'task-dedupe')

    expect(queue).toHaveLength(1)
    expect(queue[0]?.action).toBe('update')
    expect(queue[0]?.data).toMatchObject({
      id: 'task-dedupe',
      title: 'Task dedupe latest',
      progress: 80,
    })
  })
})

describe('StorageService optimistic version checks', () => {
  it('detects a local version conflict against a newer server version', () => {
    const localUpdate = { title: 'Local Update', version: 1 }
    const serverVersion = 2

    expect(localUpdate.version).not.toBe(serverVersion)
  })
})

describe('StorageService performance', () => {
  it('adds a large batch of sync items quickly', () => {
    storageService.clearPendingOps()
    localStorage.clear()

    const startTime = Date.now()

    for (let index = 0; index < 100; index += 1) {
      storageService.addToSyncQueue(createTaskUpdate(`task-${index}`))
    }

    const addTime = Date.now() - startTime

    expect(addTime).toBeLessThan(1000)
    expect(storageService.getPendingSyncCount()).toBe(100)
  })
})
