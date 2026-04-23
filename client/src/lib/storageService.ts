// 混合存储服务 - 统一存储接口
// 实现本地优先、云端同步的混合存储架构
// 优化: 整合了 offlineCache.ts 的功能，统一处理离线缓存和同步队列

import { 
  User, Project, Task, Risk, Milestone, ProjectMember, Invitation,
  UserSchema, ProjectSchema, TaskSchema, RiskSchema, MilestoneSchema,
  ProjectMemberSchema, InvitationSchema,
  projectDb, taskDb, riskDb, milestoneDb, memberDb, invitationDb
} from './localDb'
import { safeJsonParse, safeStorageGet, safeStorageSet } from '@/lib/browserStorage'

// ============================================
// 存储模式枚举
// ============================================
export enum StorageMode {
  LOCAL = 'local',        // 纯本地模式
  SYNC = 'sync',         // 同步模式（本地 + 云端）
  READONLY = 'readonly', // 只读模式（云端）
}

// ============================================
// 网络状态枚举
// ============================================
export enum NetworkStatus {
  ONLINE = 'online',     // 网络良好
  SLOW = 'slow',        // 网络较慢
  OFFLINE = 'offline',  // 完全离线
}

// ============================================
// 同步队列项类型
// ============================================
export interface SyncQueueItem<T = unknown> {
  id: string
  type: 'project' | 'task' | 'risk' | 'milestone' | 'member' | 'invitation'
  action: 'create' | 'update' | 'delete'
  data: T
  timestamp: number
  retries: number
  status: 'pending' | 'syncing' | 'failed' | 'completed'
}

// ============================================
// 离线操作类型（兼容旧版 offlineCache）
// ============================================
export interface PendingOperation {
  id: string
  type: 'create' | 'update' | 'delete'
  table: string
  data: any
  timestamp: number
}

type MutationAction = PendingOperation['type'] | SyncQueueItem['action']

function getSyncItemEntityId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const record = data as { id?: unknown }
  return typeof record.id === 'string' && record.id ? record.id : null
}

// ============================================
// 同步状态类型（兼容旧版 offlineCache）
// ============================================
export interface SyncStatus {
  isOnline: boolean
  lastSyncTime: number | null
  pendingCount: number
}

// ============================================
// 存储适配器接口
// ============================================
export interface StorageAdapter {
  // 项目操作
  getProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project | null>
  createProject(project: Project): Promise<Project>
  updateProject(id: string, updates: Partial<Project>): Promise<Project | null>
  deleteProject(id: string): Promise<void>

  // 任务操作
  getTasks(projectId?: string): Promise<Task[]>
  createTask(task: Task): Promise<Task>
  updateTask(id: string, updates: Partial<Task>): Promise<Task | null>
  deleteTask(id: string): Promise<void>

  // 风险操作
  getRisks(projectId?: string): Promise<Risk[]>
  createRisk(risk: Risk): Promise<Risk>
  updateRisk(id: string, updates: Partial<Risk>): Promise<Risk | null>
  deleteRisk(id: string): Promise<void>

  // 里程碑操作
  getMilestones(projectId?: string): Promise<Milestone[]>
  createMilestone(milestone: Milestone): Promise<Milestone>
  updateMilestone(id: string, updates: Partial<Milestone>): Promise<Milestone | null>
  deleteMilestone(id: string): Promise<void>

  // 成员操作
  getMembers(projectId?: string): Promise<ProjectMember[]>
  createMember(member: ProjectMember): Promise<ProjectMember>
  updateMember(id: string, updates: Partial<ProjectMember>): Promise<ProjectMember | null>
  deleteMember(id: string): Promise<void>

  // 邀请码操作
  getInvitations(projectId?: string): Promise<Invitation[]>
  createInvitation(invitation: Invitation): Promise<Invitation>
  updateInvitation(id: string, updates: Partial<Invitation>): Promise<Invitation | null>
  deleteInvitation(id: string): Promise<void>

  // 同步状态
  isReady(): boolean
}

// ============================================
// 网络检测结果
// ============================================
export interface ConnectivityResult {
  status: NetworkStatus
  latency: number // 毫秒
  mode: StorageMode
  error?: string
}

// ============================================
// 存储服务配置
// ============================================
export interface StorageServiceConfig {
  mode: StorageMode
  autoSync: boolean
  syncInterval: number // 毫秒
  maxRetries: number
  timeout: number // 毫秒
}

// ============================================
// 默认配置
// ============================================
export const DEFAULT_STORAGE_CONFIG: StorageServiceConfig = {
  mode: StorageMode.LOCAL,
  autoSync: true,
  syncInterval: 30000, // 30秒
  maxRetries: 3,
  timeout: 10000, // 10秒
}

// ============================================
// 存储服务类
// 整合 offlineCache 功能，统一处理离线操作和同步队列
// ============================================
class StorageServiceImpl implements StorageAdapter {
  private mode: StorageMode
  private config: StorageServiceConfig
  private localAdapter: StorageAdapter
  private cloudAdapter?: StorageAdapter
  private syncQueue: SyncQueueItem[] = []
  private pendingOps: PendingOperation[] = []  // 兼容旧版 offlineCache
  private isInitialized = false
  private networkStatus: NetworkStatus = navigator.onLine ? NetworkStatus.ONLINE : NetworkStatus.OFFLINE
  private onlineHandler: () => void
  private offlineHandler: () => void
  private visibilityHandler: () => void
  private syncListeners: Array<(status: SyncStatus) => void> = []  // 兼容旧版 offlineCache
  private lastSyncTime: number | null = null
  private isDocumentVisible = typeof document === 'undefined' ? true : !document.hidden
  private resumeSyncPromise: Promise<void> | null = null

  constructor(config: Partial<StorageServiceConfig> = {}) {
    this.config = { ...DEFAULT_STORAGE_CONFIG, ...config }
    this.mode = this.config.mode
    this.localAdapter = this.createLocalAdapter()
    
    // 绑定事件处理器（用于后续清理）
    this.onlineHandler = () => this.handleOnline()
    this.offlineHandler = () => this.handleOffline()
    this.visibilityHandler = () => this.handleVisibilityChange()
    
    // 监听网络状态变化
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler)
      window.addEventListener('offline', this.offlineHandler)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler)
    }
    
    // 加载同步队列和离线操作
    this.loadSyncQueue()
    this.loadPendingOps()
  }

  private getEntityIdFromPayload(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' && id.trim() ? id.trim() : null
  }

  private getPendingOperationKey(operation: PendingOperation): string | null {
    const entityId = this.getEntityIdFromPayload(operation.data)
    return entityId ? `${operation.table}:${entityId}` : null
  }

  private getSyncQueueEntityKey(item: Pick<SyncQueueItem, 'type' | 'data'>): string | null {
    const entityId = this.getEntityIdFromPayload(item.data)
    return entityId ? `${item.type}:${entityId}` : null
  }

  private mergeMutation(existingAction: MutationAction, existingData: any, incomingAction: MutationAction, incomingData: any) {
    const entityId = this.getEntityIdFromPayload(incomingData) ?? this.getEntityIdFromPayload(existingData)

    if (existingAction === 'create') {
      if (incomingAction === 'delete') {
        return null
      }
      return {
        action: 'create' as MutationAction,
        data: { ...(existingData ?? {}), ...(incomingData ?? {}) },
      }
    }

    if (incomingAction === 'delete') {
      return {
        action: 'delete' as MutationAction,
        data: entityId ? { id: entityId } : { ...(incomingData ?? {}) },
      }
    }

    if (incomingAction === 'create') {
      return {
        action: 'create' as MutationAction,
        data: { ...(existingData ?? {}), ...(incomingData ?? {}) },
      }
    }

    return {
      action: 'update' as MutationAction,
      data: { ...(existingData ?? {}), ...(incomingData ?? {}) },
    }
  }

  private compactPendingOperations(operations: PendingOperation[]): PendingOperation[] {
    const deduped = new Map<string, PendingOperation>()
    const passthrough: PendingOperation[] = []

    for (const operation of [...operations].sort((left, right) => left.timestamp - right.timestamp)) {
      const key = this.getPendingOperationKey(operation)
      if (!key) {
        passthrough.push(operation)
        continue
      }

      const existing = deduped.get(key)
      if (!existing) {
        deduped.set(key, { ...operation })
        continue
      }

      const merged = this.mergeMutation(existing.type, existing.data, operation.type, operation.data)
      if (!merged) {
        deduped.delete(key)
        continue
      }

      deduped.set(key, {
        ...existing,
        id: operation.id,
        timestamp: operation.timestamp,
        type: merged.action as PendingOperation['type'],
        data: merged.data,
      })
    }

    return [...passthrough, ...deduped.values()].sort((left, right) => left.timestamp - right.timestamp)
  }

  private compactSyncQueue(items: SyncQueueItem[]): SyncQueueItem[] {
    const sticky: SyncQueueItem[] = []
    const deduped = new Map<string, SyncQueueItem>()
    const passthrough: SyncQueueItem[] = []

    for (const item of [...items].sort((left, right) => left.timestamp - right.timestamp)) {
      if (item.status === 'syncing' || item.status === 'completed') {
        sticky.push(item)
        continue
      }

      const key = this.getSyncQueueEntityKey(item)
      if (!key) {
        passthrough.push(item)
        continue
      }

      const existing = deduped.get(key)
      if (!existing) {
        deduped.set(key, { ...item })
        continue
      }

      const merged = this.mergeMutation(existing.action, existing.data, item.action, item.data)
      if (!merged) {
        deduped.delete(key)
        continue
      }

      deduped.set(key, {
        ...existing,
        id: item.id,
        timestamp: item.timestamp,
        retries: Math.max(existing.retries, item.retries),
        status: existing.status === 'failed' && item.status === 'failed' ? 'failed' : 'pending',
        action: merged.action as SyncQueueItem['action'],
        data: merged.data,
      })
    }

    return [...sticky, ...passthrough, ...deduped.values()].sort((left, right) => left.timestamp - right.timestamp)
  }

  // 清理事件监听器（防止内存泄漏）
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler)
      window.removeEventListener('offline', this.offlineHandler)
      this.syncQueueAbortController?.abort()
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
    }
    this.syncListeners = []  // 清理所有监听器
    console.log('[StorageService] 已清理事件监听器')
  }

  // ============================================
  // 离线操作兼容方法（从 offlineCache 迁移）
  // ============================================

  /**
   * 添加待同步操作（兼容旧版 offlineCache API）
   * @deprecated 请使用 addToSyncQueue() 替代
   */
  addOperation(type: PendingOperation['type'], table: string, data: any): string {
    const operation: PendingOperation = {
      id: crypto.randomUUID(),
      type,
      table,
      data,
      timestamp: Date.now()
    }

    this.pendingOps = this.compactPendingOperations([...this.pendingOps, operation])
    this.savePendingOps()

    // 如果在线，立即尝试同步
    if (this.isNetworkOnline()) {
      this.syncPendingOps()
    }

    this.notifySyncListeners()
    return operation.id
  }

  /**
   * 同步待处理操作到数据库（兼容旧版 offlineCache）
   */
  async syncPendingOps(): Promise<{ success: number; failed: number }> {
    this.pendingOps = this.compactPendingOperations(this.pendingOps)
    if (!this.isSyncAllowed() || this.pendingOps.length === 0) {
      return { success: 0, failed: 0 }
    }

    console.log(`[StorageService] 开始同步 ${this.pendingOps.length} 个离线操作...`)

    let success = 0
    let failed = 0
    const failedOps: PendingOperation[] = []

    // 按时间顺序执行
    const opsToProcess = [...this.pendingOps].sort((a, b) => a.timestamp - b.timestamp)

    for (const op of opsToProcess) {
      try {
        await this.executePendingOperation(op)
        success++
      } catch (e) {
        console.error(`[StorageService] 同步离线操作失败:`, e)
        failed++
        failedOps.push(op)
      }
    }

    // 更新待同步列表（移除成功的）
    this.pendingOps = failedOps
    this.savePendingOps()
    this.lastSyncTime = Date.now()
    this.notifySyncListeners()

    console.log(`[StorageService] 离线操作同步完成: 成功 ${success}, 失败 ${failed}`)

    return { success, failed }
  }

  /**
   * 执行单个离线操作
   */
  private async executePendingOperation(op: PendingOperation): Promise<void> {
    // 将旧版 table/action 映射到新版 syncQueue 格式
    const typeMap: Record<string, SyncQueueItem['type']> = {
      'tasks': 'task',
      'projects': 'project',
      'milestones': 'milestone',
      'risks': 'risk',
      'members': 'member',
      'invitations': 'invitation'
    }

    const type = typeMap[op.table]
    if (!type) {
      console.warn(`[StorageService] 未知表: ${op.table}`)
      return
    }

    // 使用现有的存储适配器执行操作
    switch (op.table) {
      case 'tasks':
        if (op.type === 'create') await this.createTask(op.data)
        else if (op.type === 'update') await this.updateTask(op.data.id || op.id, op.data)
        else if (op.type === 'delete') await this.deleteTask(op.data.id || op.id)
        break
      case 'projects':
        if (op.type === 'create') await this.createProject(op.data)
        else if (op.type === 'update') await this.updateProject(op.data.id || op.id, op.data)
        else if (op.type === 'delete') await this.deleteProject(op.data.id || op.id)
        break
      case 'milestones':
        if (op.type === 'create') await this.createMilestone(op.data)
        else if (op.type === 'update') await this.updateMilestone(op.data.id || op.id, op.data)
        else if (op.type === 'delete') await this.deleteMilestone(op.data.id || op.id)
        break
      case 'risks':
        if (op.type === 'create') await this.createRisk(op.data)
        else if (op.type === 'update') await this.updateRisk(op.data.id || op.id, op.data)
        else if (op.type === 'delete') await this.deleteRisk(op.data.id || op.id)
        break
    }
  }

  /**
   * 加载本地存储的待同步操作
   */
  private loadPendingOps() {
    try {
      const stored = safeStorageGet(localStorage, 'pending_sync_ops')
      if (stored) {
        this.pendingOps = this.compactPendingOperations(
          safeJsonParse<PendingOperation[]>(stored, [], 'pending sync ops'),
        )
        console.log(`[StorageService] 加载了 ${this.pendingOps.length} 个离线待同步操作`)
      }
    } catch (e) {
      console.error('[StorageService] 加载离线待同步操作失败:', e)
      this.pendingOps = []
    }
  }

  /**
   * 保存待同步操作到本地存储
   */
  private savePendingOps() {
    try {
      this.pendingOps = this.compactPendingOperations(this.pendingOps)
      safeStorageSet(localStorage, 'pending_sync_ops', JSON.stringify(this.pendingOps))
    } catch (e) {
      console.error('[StorageService] 保存离线待同步操作失败:', e)
    }
  }

  /**
   * 获取同步状态（兼容旧版 offlineCache API）
   */
  getSyncStatus(): SyncStatus {
    return {
      isOnline: this.isNetworkOnline(),
      lastSyncTime: this.lastSyncTime,
      pendingCount: this.pendingOps.length + this.syncQueue.filter(i => i.status === 'pending').length
    }
  }

  /**
   * 手动触发同步（兼容旧版 offlineCache API）
   */
  async manualSync(): Promise<{ success: number; failed: number }> {
    if (!this.isSyncAllowed()) {
      return { success: 0, failed: 0 }
    }

    // 同时处理离线操作和同步队列
    const offlineResult = await this.syncPendingOps()
    await this.processSyncQueue()
    return offlineResult
  }

  /**
   * 清除所有待同步操作（兼容旧版 offlineCache API）
   */
  clearPendingOps() {
    this.pendingOps = []
    this.savePendingOps()
    this.syncQueue = this.syncQueue.filter(i => i.status !== 'pending')
    this.persistSyncQueue()
    this.notifySyncListeners()
  }

  /**
   * 获取待同步操作数量（兼容旧版 offlineCache API）
   */
  getPendingCount(): number {
    return this.pendingOps.length + this.syncQueue.filter(i => i.status === 'pending').length
  }

  /**
   * 订阅同步状态变化（兼容旧版 offlineCache API）
   */
  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.syncListeners.push(listener)
    // 立即通知一次当前状态
    listener(this.getSyncStatus())
    return () => {
      this.syncListeners = this.syncListeners.filter(l => l !== listener)
    }
  }

  private notifySyncListeners() {
    const status = this.getSyncStatus()
    this.syncListeners.forEach(listener => listener(status))
  }

  /**
   * 检查网络是否在线
   */
  isNetworkOnline(): boolean {
    return this.networkStatus !== NetworkStatus.OFFLINE && navigator.onLine
  }

  isTabVisible(): boolean {
    return this.isDocumentVisible
  }

  private isSyncAllowed(): boolean {
    return this.isNetworkOnline() && this.isDocumentVisible
  }

  // 网络恢复时触发同步
  private handleOnline() {
    console.log('[StorageService] 网络已恢复在线')
    this.networkStatus = NetworkStatus.ONLINE
    this.notifySyncListeners()

    // 自动同步待处理的队列
    if (this.config.autoSync && this.isDocumentVisible) {
      // 同时处理离线操作和同步队列
      void this.resumeSyncAfterVisibility()
    }
  }

  // 网络断开时
  private handleOffline() {
    console.log('[StorageService] 网络已断开')
    this.networkStatus = NetworkStatus.OFFLINE
    this.notifySyncListeners()
  }

  // 获取当前网络状态
  private handleVisibilityChange() {
    if (typeof document === 'undefined') return

    this.isDocumentVisible = !document.hidden

    if (!this.isDocumentVisible) {
      console.log('[StorageService] Tab hidden, pause sync processing')
      this.syncQueueAbortController?.abort()
      return
    }

    console.log('[StorageService] Tab visible again, reconcile before incremental sync')
    this.notifySyncListeners()

    if (this.config.autoSync) {
      void this.resumeSyncAfterVisibility()
    }
  }

  private async resumeSyncAfterVisibility(): Promise<void> {
    if (this.resumeSyncPromise) {
      return this.resumeSyncPromise
    }

    this.resumeSyncPromise = (async () => {
      this.loadPendingOps()
      this.loadSyncQueue()
      this.notifySyncListeners()

      if (!this.isSyncAllowed()) {
        return
      }

      await this.manualSync()
    })().finally(() => {
      this.resumeSyncPromise = null
    })

    return this.resumeSyncPromise
  }

  getNetworkStatus(): NetworkStatus {
    return this.networkStatus
  }

  // 同步队列处理锁，防止并发执行
  private isProcessingSyncQueue = false
  private syncQueueAbortController: AbortController | null = null

  // 处理同步队列（带并发控制）
  private async processSyncQueue(): Promise<void> {
    this.syncQueue = this.compactSyncQueue(this.syncQueue)
    if (!this.isSyncAllowed()) {
      return
    }

    // 如果正在处理，则取消当前操作并重新启动
    if (this.isProcessingSyncQueue) {
      console.log('[StorageService] 同步队列正在处理中，取消当前操作')
      this.syncQueueAbortController?.abort()
      // 等待一小段时间让之前的操作取消
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.isProcessingSyncQueue = true
    this.syncQueueAbortController = new AbortController()
    const signal = this.syncQueueAbortController.signal

    try {
      const pendingItems = this.syncQueue.filter(item => item.status === 'pending')

      for (const item of pendingItems) {
        if (!this.isSyncAllowed()) {
          break
        }
        // 检查是否被取消
        if (signal.aborted) {
          console.log('[StorageService] 同步队列处理被取消')
          break
        }

        // 检查项目是否仍存在于队列中（可能被其他标签页处理）
        const currentItem = this.syncQueue.find(i => i.id === item.id)
        if (!currentItem || currentItem.status !== 'pending') {
          continue
        }

        item.status = 'syncing'
        this.persistSyncQueue()

        try {
          // 调用云端API进行同步
          await this.syncItemToCloud(item, signal)
          
          // 检查是否被取消
          if (signal.aborted) {
            item.status = 'pending'
            this.persistSyncQueue()
            break
          }

          item.status = 'completed'
          console.log(`[StorageService] 同步成功: ${item.type} ${item.action}`)
        } catch (error) {
          console.error(`[StorageService] 同步失败:`, error)
          item.retries++
          if (item.retries >= this.config.maxRetries) {
            item.status = 'failed'
            // 触发同步失败通知
            this.notifySyncFailure(item, error)
          } else {
            item.status = 'pending'
          }
        }
        
        this.persistSyncQueue()
      }
    } finally {
      this.isProcessingSyncQueue = false
      this.syncQueueAbortController = null
    }
  }

  // 同步单个项目到云端
  private async syncItemToCloud(item: SyncQueueItem, signal: AbortSignal): Promise<void> {
    if (!this.cloudAdapter) {
      throw new Error('云端适配器未初始化')
    }

    const data = item.data as { id: string; [key: string]: unknown }
    
    switch (item.type) {
      case 'task':
        if (item.action === 'create') await this.cloudAdapter.createTask(item.data as Task)
        else if (item.action === 'update') await this.cloudAdapter.updateTask(data.id, item.data as Partial<Task>)
        else if (item.action === 'delete') await this.cloudAdapter.deleteTask(data.id)
        break
      case 'project':
        if (item.action === 'create') await this.cloudAdapter.createProject(item.data as Project)
        else if (item.action === 'update') await this.cloudAdapter.updateProject(data.id, item.data as Partial<Project>)
        else if (item.action === 'delete') await this.cloudAdapter.deleteProject(data.id)
        break
      case 'risk':
        if (item.action === 'create') await this.cloudAdapter.createRisk(item.data as Risk)
        else if (item.action === 'update') await this.cloudAdapter.updateRisk(data.id, item.data as Partial<Risk>)
        else if (item.action === 'delete') await this.cloudAdapter.deleteRisk(data.id)
        break
      case 'milestone':
        if (item.action === 'create') await this.cloudAdapter.createMilestone(item.data as Milestone)
        else if (item.action === 'update') await this.cloudAdapter.updateMilestone(data.id, item.data as Partial<Milestone>)
        else if (item.action === 'delete') await this.cloudAdapter.deleteMilestone(data.id)
        break
      case 'member':
        if (item.action === 'create') await this.cloudAdapter.createMember(item.data as ProjectMember)
        else if (item.action === 'update') await this.cloudAdapter.updateMember(data.id, item.data as Partial<ProjectMember>)
        else if (item.action === 'delete') await this.cloudAdapter.deleteMember(data.id)
        break
      case 'invitation':
        if (item.action === 'create') await this.cloudAdapter.createInvitation(item.data as Invitation)
        else if (item.action === 'update') await this.cloudAdapter.updateInvitation(data.id, item.data as Partial<Invitation>)
        else if (item.action === 'delete') await this.cloudAdapter.deleteInvitation(data.id)
        break
    }

    // 检查是否被取消
    if (signal.aborted) {
      throw new Error('同步被取消')
    }
  }

  // 同步失败通知
  private notifySyncFailure(item: SyncQueueItem, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    console.error(`[StorageService] 同步失败通知: ${item.type} ${item.action} - ${errorMessage}`)
    
    // 触发全局事件，让UI可以显示同步失败提示
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('storage:sync-failed', {
        detail: { item, error: errorMessage }
      }))
    }
  }

  // 重试失败的同步项
  async retryFailedSync(): Promise<{ success: number; failed: number }> {
    const failedItems = this.syncQueue.filter(item => item.status === 'failed')
    let success = 0
    let failed = 0

    for (const item of failedItems) {
      item.status = 'pending'
      item.retries = 0
    }
    
    this.persistSyncQueue()
    await this.processSyncQueue()

    // 统计结果
    for (const item of failedItems) {
      if (item.status === 'completed') success++
      else if (item.status === 'failed') failed++
    }

    return { success, failed }
  }

  // 创建本地存储适配器
  private createLocalAdapter(): StorageAdapter {
    // 使用静态导入的数据库实例
    
    return {
      getProjects: async () => projectDb.getAll(),
      getProject: async (id) => projectDb.getById(id) ?? null,
      createProject: async (p) => projectDb.create(p),
      updateProject: async (id, u) => projectDb.update(id, u),
      deleteProject: async (id) => projectDb.delete(id),
      
      getTasks: async (projectId) => {
        const tasks = taskDb.getAll()
        return projectId ? tasks.filter(t => t.project_id === projectId) : tasks
      },
      createTask: async (t) => taskDb.create(t),
      updateTask: async (id, u) => taskDb.update(id, u),
      deleteTask: async (id) => taskDb.delete(id),
      
      getRisks: async (projectId) => {
        const risks = riskDb.getAll()
        return projectId ? risks.filter(r => r.project_id === projectId) : risks
      },
      createRisk: async (r) => riskDb.create(r),
      updateRisk: async (id, u) => riskDb.update(id, u),
      deleteRisk: async (id) => riskDb.delete(id),
      
      getMilestones: async (projectId) => {
        const milestones = milestoneDb.getAll()
        return projectId ? milestones.filter(m => m.project_id === projectId) : milestones
      },
      createMilestone: async (m) => milestoneDb.create(m),
      updateMilestone: async (id, u) => milestoneDb.update(id, u),
      deleteMilestone: async (id) => milestoneDb.delete(id),
      
      getMembers: async (projectId) => {
        const members = memberDb.getAll()
        return projectId ? members.filter(m => m.project_id === projectId) : members
      },
      createMember: async (m) => memberDb.create(m),
      updateMember: async (id, u) => memberDb.update(id, u),
      deleteMember: async (id) => memberDb.delete(id),
      
      getInvitations: async (projectId) => {
        const invitations = invitationDb.getAll()
        return projectId ? invitations.filter(i => i.project_id === projectId) : invitations
      },
      createInvitation: async (i) => invitationDb.create(i),
      updateInvitation: async (id, u) => invitationDb.update(id, u),
      deleteInvitation: async (id) => invitationDb.delete(id),
      
      isReady: () => true
    }
  }

  // 设置存储模式
  setMode(mode: StorageMode): void {
    this.mode = mode
    safeStorageSet(localStorage, 'storage_mode', mode)
  }

  // 获取当前模式
  getMode(): StorageMode {
    return this.mode
  }

  // 添加到同步队列
  addToSyncQueue<T>(item: Omit<SyncQueueItem<T>, 'id' | 'timestamp' | 'retries' | 'status'>): void {
    const queueItem: SyncQueueItem<T> = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retries: 0,
      status: 'pending'
    }
    this.syncQueue = this.compactSyncQueue([...this.syncQueue, queueItem as SyncQueueItem])
    this.persistSyncQueue()
  }

  // 持久化同步队列
  private persistSyncQueue(): void {
    this.syncQueue = this.compactSyncQueue(this.syncQueue)
    safeStorageSet(localStorage, 'pm_sync_queue', JSON.stringify(this.syncQueue))
  }

  // 加载同步队列
  private loadSyncQueue(): void {
    const data = safeStorageGet(localStorage, 'pm_sync_queue')
    if (data) {
      this.syncQueue = this.compactSyncQueue(safeJsonParse<SyncQueueItem[]>(data, [], 'sync queue'))
    }
  }

  // 获取待同步数量
  getPendingSyncCount(): number {
    return this.syncQueue.filter(item => item.status === 'pending').length
  }

  // 同步队列是否为空
  hasPendingSync(): boolean {
    return this.syncQueue.length > 0
  }

  // 实现 StorageAdapter 接口
  async getProjects(): Promise<Project[]> {
    return this.localAdapter.getProjects()
  }

  async getProject(id: string): Promise<Project | null> {
    return this.localAdapter.getProject(id)
  }

  async createProject(project: Project): Promise<Project> {
    const result = await this.localAdapter.createProject(project)
    
    // 如果是同步模式，添加到队列
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'project',
        action: 'create',
        data: result
      })
    }
    
    return result
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const result = await this.localAdapter.updateProject(id, updates)
    
    if (this.mode === StorageMode.SYNC && result) {
      this.addToSyncQueue({
        type: 'project',
        action: 'update',
        data: { id, ...updates }
      })
    }
    
    return result
  }

  async deleteProject(id: string): Promise<void> {
    await this.localAdapter.deleteProject(id)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'project',
        action: 'delete',
        data: { id }
      })
    }
  }

  async getTasks(projectId?: string): Promise<Task[]> {
    return this.localAdapter.getTasks(projectId)
  }

  async createTask(task: Task): Promise<Task> {
    const result = await this.localAdapter.createTask(task)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'task',
        action: 'create',
        data: result
      })
    }
    
    return result
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const result = await this.localAdapter.updateTask(id, updates)
    
    if (this.mode === StorageMode.SYNC && result) {
      this.addToSyncQueue({
        type: 'task',
        action: 'update',
        data: { id, ...updates }
      })
    }
    
    return result
  }

  async deleteTask(id: string): Promise<void> {
    await this.localAdapter.deleteTask(id)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'task',
        action: 'delete',
        data: { id }
      })
    }
  }

  async getRisks(projectId?: string): Promise<Risk[]> {
    return this.localAdapter.getRisks(projectId)
  }

  async createRisk(risk: Risk): Promise<Risk> {
    const result = await this.localAdapter.createRisk(risk)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'risk',
        action: 'create',
        data: result
      })
    }
    
    return result
  }

  async updateRisk(id: string, updates: Partial<Risk>): Promise<Risk | null> {
    const result = await this.localAdapter.updateRisk(id, updates)
    
    if (this.mode === StorageMode.SYNC && result) {
      this.addToSyncQueue({
        type: 'risk',
        action: 'update',
        data: { id, ...updates }
      })
    }
    
    return result
  }

  async deleteRisk(id: string): Promise<void> {
    await this.localAdapter.deleteRisk(id)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'risk',
        action: 'delete',
        data: { id }
      })
    }
  }

  async getMilestones(projectId?: string): Promise<Milestone[]> {
    return this.localAdapter.getMilestones(projectId)
  }

  async createMilestone(milestone: Milestone): Promise<Milestone> {
    const result = await this.localAdapter.createMilestone(milestone)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'milestone',
        action: 'create',
        data: result
      })
    }
    
    return result
  }

  async updateMilestone(id: string, updates: Partial<Milestone>): Promise<Milestone | null> {
    const result = await this.localAdapter.updateMilestone(id, updates)
    
    if (this.mode === StorageMode.SYNC && result) {
      this.addToSyncQueue({
        type: 'milestone',
        action: 'update',
        data: { id, ...updates }
      })
    }
    
    return result
  }

  async deleteMilestone(id: string): Promise<void> {
    await this.localAdapter.deleteMilestone(id)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'milestone',
        action: 'delete',
        data: { id }
      })
    }
  }

  async getMembers(projectId?: string): Promise<ProjectMember[]> {
    return this.localAdapter.getMembers(projectId)
  }

  async createMember(member: ProjectMember): Promise<ProjectMember> {
    const result = await this.localAdapter.createMember(member)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'member',
        action: 'create',
        data: result
      })
    }
    
    return result
  }

  async updateMember(id: string, updates: Partial<ProjectMember>): Promise<ProjectMember | null> {
    const result = await this.localAdapter.updateMember(id, updates)
    
    if (this.mode === StorageMode.SYNC && result) {
      this.addToSyncQueue({
        type: 'member',
        action: 'update',
        data: { id, ...updates }
      })
    }
    
    return result
  }

  async deleteMember(id: string): Promise<void> {
    await this.localAdapter.deleteMember(id)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'member',
        action: 'delete',
        data: { id }
      })
    }
  }

  async getInvitations(projectId?: string): Promise<Invitation[]> {
    return this.localAdapter.getInvitations(projectId)
  }

  async createInvitation(invitation: Invitation): Promise<Invitation> {
    const result = await this.localAdapter.createInvitation(invitation)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'invitation',
        action: 'create',
        data: result
      })
    }
    
    return result
  }

  async updateInvitation(id: string, updates: Partial<Invitation>): Promise<Invitation | null> {
    const result = await this.localAdapter.updateInvitation(id, updates)
    
    if (this.mode === StorageMode.SYNC && result) {
      this.addToSyncQueue({
        type: 'invitation',
        action: 'update',
        data: { id, ...updates }
      })
    }
    
    return result
  }

  async deleteInvitation(id: string): Promise<void> {
    await this.localAdapter.deleteInvitation(id)
    
    if (this.mode === StorageMode.SYNC) {
      this.addToSyncQueue({
        type: 'invitation',
        action: 'delete',
        data: { id }
      })
    }
  }

  // 获取同步队列
  getSyncQueue(): SyncQueueItem<any>[] {
    return this.syncQueue
  }

  // 处理同步队列项
  async processSyncItem(itemId: string): Promise<void> {
    if (!this.isSyncAllowed()) return

    const item = this.syncQueue.find(i => i.id === itemId)
    if (!item) return

    try {
      // 根据类型和动作执行同步
      const data = item.data as { id: string; [key: string]: unknown }
      const payload = item.data
      switch (item.type) {
        case 'task':
          if (item.action === 'create') await this.cloudAdapter?.createTask(payload as Task)
          else if (item.action === 'update') await this.cloudAdapter?.updateTask(data.id, payload as Partial<Task>)
          else if (item.action === 'delete') await this.cloudAdapter?.deleteTask(data.id)
          break
        case 'project':
          if (item.action === 'create') await this.cloudAdapter?.createProject(payload as Project)
          else if (item.action === 'update') await this.cloudAdapter?.updateProject(data.id, payload as Partial<Project>)
          else if (item.action === 'delete') await this.cloudAdapter?.deleteProject(data.id)
          break
        case 'risk':
          if (item.action === 'create') await this.cloudAdapter?.createRisk(payload as Risk)
          else if (item.action === 'update') await this.cloudAdapter?.updateRisk(data.id, payload as Partial<Risk>)
          else if (item.action === 'delete') await this.cloudAdapter?.deleteRisk(data.id)
          break
        case 'milestone':
          if (item.action === 'create') await this.cloudAdapter?.createMilestone(payload as Milestone)
          else if (item.action === 'update') await this.cloudAdapter?.updateMilestone(data.id, payload as Partial<Milestone>)
          else if (item.action === 'delete') await this.cloudAdapter?.deleteMilestone(data.id)
          break
      }

      // 移除已同步的项目
      this.syncQueue = this.syncQueue.filter(i => i.id !== itemId)
      this.persistSyncQueue()
    } catch (error) {
      console.error('Failed to process sync item:', itemId, error)
      // 增加重试次数
      const index = this.syncQueue.findIndex(i => i.id === itemId)
      if (index !== -1) {
        this.syncQueue[index].retries++
        if (this.syncQueue[index].retries >= 3) {
          this.syncQueue[index].status = 'failed'
        }
      }
      this.persistSyncQueue()
    }
  }

  // 应用合并后的数据
  applyMergedData(entityId: string, mergedData: any): void {
    const type = mergedData.type || this.detectEntityType(mergedData)
    
    switch (type) {
      case 'task':
        taskDb.update(entityId, { ...mergedData, version: (mergedData.version || 1) + 1 })
        break
      case 'project':
        projectDb.update(entityId, { ...mergedData, version: (mergedData.version || 1) + 1 })
        break
      case 'risk':
        riskDb.update(entityId, { ...mergedData, version: (mergedData.version || 1) + 1 })
        break
      case 'milestone':
        milestoneDb.update(entityId, { ...mergedData, version: (mergedData.version || 1) + 1 })
        break
    }
  }

  // 强制使用本地版本（增加版本号后重试）
  forceUpdate(entityId: string): void {
    // 从同步队列中找到该项目，增加版本号后重试
    const item = this.syncQueue.find((queuedItem) => getSyncItemEntityId(queuedItem.data) === entityId)
    if (item && item.data) {
      const d = item.data as { id: string; version?: number }
      d.version = (d.version || 1) + 1
      item.status = 'pending'
      item.retries = 0
      this.persistSyncQueue()
    }
  }

  // 应用服务器数据
  applyServerData(entityId: string): void {
    // 从同步队列中移除该项（因为要使用服务器版本）
    this.syncQueue = this.syncQueue.filter((queuedItem) => getSyncItemEntityId(queuedItem.data) !== entityId)
    this.persistSyncQueue()
  }

  // 检测实体类型
  private detectEntityType(data: any): string {
    if (data.project_id !== undefined) return 'task'
    if (data.description !== undefined && data.impact !== undefined) return 'risk'
    if (data.due_date !== undefined) return 'milestone'
    return 'project'
  }

  isReady(): boolean {
    return this.isInitialized
  }

  // 初始化
  async initialize(): Promise<void> {
    this.loadSyncQueue()

    const configuredMode = (import.meta.env.VITE_STORAGE_MODE || '').trim().toLowerCase()
    if (configuredMode === 'backend') {
      if (import.meta.env.DEV) {
        console.log('[StorageService] backend mode enabled, skip direct Supabase bootstrap')
      }
      this.isInitialized = true
      return
    }
    
    // 尝试连接Supabase
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    
    if (supabaseUrl && supabaseKey) {
      try {
        // 延迟导入避免循环依赖
        const { createSupabaseAdapter } = await import('./supabaseAdapter')
        const supabaseAdapter = createSupabaseAdapter()
        const connected = await supabaseAdapter.testConnection()
        
        if (connected) {
          this.cloudAdapter = supabaseAdapter
          // 自动启用同步模式
          this.setMode(StorageMode.SYNC)
          console.log('Supabase连接成功，已启用同步模式')
        } else {
          console.warn('Supabase连接失败，使用本地模式')
        }
      } catch (error) {
        console.error('Supabase初始化失败:', error)
      }
    } else {
      console.warn('Supabase配置缺失，使用本地模式')
    }
    
    this.isInitialized = true
  }
}

// 单例实例
export const storageService = new StorageServiceImpl()

// 导出类型
export type { StorageAdapter as IStorageAdapter }
