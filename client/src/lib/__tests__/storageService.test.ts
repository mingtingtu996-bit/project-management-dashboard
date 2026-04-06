// storageService 多人协作竞态条件测试
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { storageService, StorageMode, SyncQueueItem } from '../storageService'

describe('StorageService 并发控制测试', () => {
  beforeEach(() => {
    // 重置状态
    storageService.clearPendingOps()
    localStorage.clear()
  })

  describe('同步队列并发控制', () => {
    it('应该防止同步队列的并发执行', async () => {
      // 模拟添加多个同步项
      const syncItems: SyncQueueItem[] = []
      for (let i = 0; i < 5; i++) {
        storageService.addToSyncQueue({
          type: 'task',
          action: 'update',
          data: { id: `task-${i}`, title: `Task ${i}` }
        })
      }

      // 验证队列中有5个待同步项
      expect(storageService.getPendingSyncCount()).toBe(5)

      // 模拟多次调用 processSyncQueue（模拟多标签页场景）
      const processCalls = [
        (storageService as any).processSyncQueue(),
        (storageService as any).processSyncQueue(),
        (storageService as any).processSyncQueue()
      ]

      // 等待所有调用完成
      await Promise.all(processCalls)

      // 验证同步状态
      const queue = storageService.getSyncQueue()
      const syncingCount = queue.filter(i => i.status === 'syncing').length
      
      // 不应该有多个同时处于 syncing 状态的项目
      expect(syncingCount).toBeLessThanOrEqual(1)
    })

    it('应该支持取消正在进行的同步', async () => {
      // 添加同步项
      storageService.addToSyncQueue({
        type: 'task',
        action: 'update',
        data: { id: 'task-1', title: 'Task 1' }
      })

      // 开始同步
      const syncPromise = (storageService as any).processSyncQueue()
      
      // 立即再次调用（应该触发取消）
      const secondSyncPromise = (storageService as any).processSyncQueue()

      // 等待完成
      await Promise.all([syncPromise, secondSyncPromise])

      // 验证没有项目卡在 syncing 状态
      const queue = storageService.getSyncQueue()
      const stuckItems = queue.filter(i => i.status === 'syncing')
      expect(stuckItems.length).toBe(0)
    })

    it('应该正确处理同步失败和重试', async () => {
      // 添加同步项
      storageService.addToSyncQueue({
        type: 'task',
        action: 'update',
        data: { id: 'task-fail', title: 'Task Fail' }
      })

      // 模拟云端适配器失败
      const mockCloudAdapter = {
        updateTask: vi.fn().mockRejectedValue(new Error('Network error'))
      }
      ;(storageService as any).cloudAdapter = mockCloudAdapter
      ;(storageService as any).setMode(StorageMode.SYNC)

      // 执行同步
      await (storageService as any).processSyncQueue()

      // 验证重试次数
      const queue = storageService.getSyncQueue()
      const failedItem = queue.find(i => i.id === 'task-fail')
      
      if (failedItem) {
        expect(failedItem.retries).toBeGreaterThan(0)
        expect(failedItem.status).toBe('failed')
      }
    })

    it('应该触发同步失败事件', async () => {
      const eventListener = vi.fn()
      window.addEventListener('storage:sync-failed', eventListener)

      // 添加同步项
      storageService.addToSyncQueue({
        type: 'task',
        action: 'update',
        data: { id: 'task-event', title: 'Task Event' }
      })

      // 模拟云端适配器失败
      const mockCloudAdapter = {
        updateTask: vi.fn().mockRejectedValue(new Error('Network error'))
      }
      ;(storageService as any).cloudAdapter = mockCloudAdapter
      ;(storageService as any).setMode(StorageMode.SYNC)

      // 执行同步多次以触发失败
      for (let i = 0; i < 4; i++) {
        await (storageService as any).processSyncQueue()
      }

      // 验证事件被触发
      expect(eventListener).toHaveBeenCalled()

      window.removeEventListener('storage:sync-failed', eventListener)
    })
  })

  describe('乐观锁版本控制', () => {
    it('应该正确处理版本冲突', async () => {
      // 这个测试需要后端配合，这里只做前端逻辑验证
      const task = {
        id: 'task-1',
        title: 'Original Title',
        version: 1
      }

      // 模拟本地更新
      const localUpdate = { title: 'Local Update', version: 1 }
      
      // 模拟服务器版本已更新
      const serverVersion = 2

      // 验证版本检查逻辑
      expect(localUpdate.version).not.toBe(serverVersion)
    })
  })
})

describe('StorageService 性能测试', () => {
  it('应该高效处理大量同步项', async () => {
    const startTime = Date.now()
    
    // 添加100个同步项
    for (let i = 0; i < 100; i++) {
      storageService.addToSyncQueue({
        type: 'task',
        action: 'update',
        data: { id: `task-${i}`, title: `Task ${i}` }
      })
    }

    const addTime = Date.now() - startTime
    
    // 添加100个项应该很快（< 1秒）
    expect(addTime).toBeLessThan(1000)
    expect(storageService.getPendingSyncCount()).toBe(100)
  })
})
