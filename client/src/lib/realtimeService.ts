// Supabase 实时订阅服务
// 实现项目数据的实时同步和在线状态

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { storageService, NetworkStatus } from './storageService'

// ============================================
// 类型定义
// ============================================

export interface OnlineMember {
  id: string
  display_name: string
  avatar_url?: string
  last_active: string
  is_online: boolean
}

export interface RealtimeEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: any
  old_record?: any
  timestamp: string
}

export type EventCallback = (event: RealtimeEvent) => void
export type PresenceCallback = (members: OnlineMember[]) => void

// ============================================
// 实时订阅服务类
// ============================================

class RealtimeService {
  private client?: SupabaseClient
  private channels: Map<string, RealtimeChannel> = new Map()
  private eventCallbacks: Map<string, Set<EventCallback>> = new Map()
  private presenceCallbacks: Map<string, Set<PresenceCallback>> = new Map()
  private currentUserId: string | null = null
  private isInitialized: boolean = false

  // 初始化
  initialize() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      if (import.meta.env.DEV) console.warn('Supabase配置不完整，跳过实时订阅初始化')
      return
    }

    try {
      this.client = createClient(supabaseUrl, supabaseKey)
      this.isInitialized = true
      if (import.meta.env.DEV) console.log('实时订阅服务初始化成功')
    } catch (error) {
      if (import.meta.env.DEV) console.error('实时订阅服务初始化失败:', error)
    }
  }

  // 设置当前用户
  setCurrentUser(userId: string, displayName: string, avatarUrl?: string) {
    this.currentUserId = userId
    if (!this.isInitialized) {
      this.initialize()
    }
  }

  // 订阅项目数据变更
  subscribeToProject(projectId: string, callback: EventCallback) {
    if (!this.client || !this.isInitialized) {
      if (import.meta.env.DEV) console.warn('实时订阅服务未初始化')
      return () => {}
    }

    const channelName = `project:${projectId}`
    
    // 如果已订阅，先取消
    if (this.channels.has(channelName)) {
      this.unsubscribe(channelName)
    }

    const channel = this.client.channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            table: 'tasks',
            record: payload.new,
            old_record: payload.old,
            timestamp: new Date().toISOString()
          }
          this.notifyEventCallbacks(channelName, event)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'risks',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            table: 'risks',
            record: payload.new,
            old_record: payload.old,
            timestamp: new Date().toISOString()
          }
          this.notifyEventCallbacks(channelName, event)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'milestones',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            table: 'milestones',
            record: payload.new,
            old_record: payload.old,
            timestamp: new Date().toISOString()
          }
          this.notifyEventCallbacks(channelName, event)
        }
      )
      .subscribe((status) => {
        if (import.meta.env.DEV) console.log(`订阅状态: ${status}`)
      })

    this.channels.set(channelName, channel)

    // 注册回调
    if (!this.eventCallbacks.has(channelName)) {
      this.eventCallbacks.set(channelName, new Set())
    }
    this.eventCallbacks.get(channelName)!.add(callback)

    // 返回取消订阅函数
    return () => this.unsubscribe(channelName)
  }

  // 订阅在线成员状态
  subscribeToPresence(projectId: string, callback: PresenceCallback) {
    if (!this.client || !this.isInitialized) {
      if (import.meta.env.DEV) console.warn('实时订阅服务未初始化')
      return () => {}
    }

    const channelName = `presence:${projectId}`

    // 如果已订阅，先取消
    if (this.channels.has(channelName)) {
      this.unsubscribe(channelName)
    }

    const channel = this.client.channel(channelName)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const members: OnlineMember[] = []

        for (const id in state) {
          const presences = state[id] as any[]
          if (presences.length > 0) {
            const presence = presences[0]
            members.push({
              id,
              display_name: presence.display_name || '未知用户',
              avatar_url: presence.avatar_url,
              last_active: presence.last_active || new Date().toISOString(),
              is_online: true
            })
          }
        }

        this.notifyPresenceCallbacks(channelName, members)
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (import.meta.env.DEV) console.log('用户加入:', key, newPresences)
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (import.meta.env.DEV) console.log('用户离开:', key, leftPresences)
      })

    // 跟踪当前用户
    if (this.currentUserId) {
      channel.track({
        user_id: this.currentUserId,
        display_name: '当前用户',
        last_active: new Date().toISOString()
      })
    }

    channel.subscribe((status) => {
      if (import.meta.env.DEV) console.log(`在线状态订阅状态: ${status}`)
    })

    this.channels.set(channelName, channel)

    // 注册回调
    if (!this.presenceCallbacks.has(channelName)) {
      this.presenceCallbacks.set(channelName, new Set())
    }
    this.presenceCallbacks.get(channelName)!.add(callback)

    // 返回取消订阅函数
    return () => this.unsubscribe(channelName)
  }

  // 取消订阅
  unsubscribe(channelName: string) {
    const channel = this.channels.get(channelName)
    if (channel && this.client) {
      this.client.removeChannel(channel)
      this.channels.delete(channelName)
      this.eventCallbacks.delete(channelName)
      this.presenceCallbacks.delete(channelName)
    }
  }

  // 取消所有订阅
  unsubscribeAll() {
    for (const channelName of this.channels.keys()) {
      this.unsubscribe(channelName)
    }
  }

  // 通知事件回调
  private notifyEventCallbacks(channelName: string, event: RealtimeEvent) {
    const callbacks = this.eventCallbacks.get(channelName)
    if (callbacks) {
      callbacks.forEach(callback => callback(event))
    }
  }

  // 通知在线状态回调
  private notifyPresenceCallbacks(channelName: string, members: OnlineMember[]) {
    const callbacks = this.presenceCallbacks.get(channelName)
    if (callbacks) {
      callbacks.forEach(callback => callback(members))
    }
  }

  // 发送数据变更到Supabase（用于本地变更同步）
  async syncChange(
    table: string,
    action: 'INSERT' | 'UPDATE' | 'DELETE',
    data: unknown,
    projectId?: string
  ) {
    if (!this.client || !this.isInitialized) {
      if (import.meta.env.DEV) console.warn('实时订阅服务未初始化，无法同步')
      return
    }

    try {
      switch (action) {
        case 'INSERT':
          await this.client.from(table).insert(data)
          break
        case 'UPDATE':
          if ((data as { id?: string }).id) {
            await this.client.from(table).update(data).eq('id', (data as { id: string }).id)
          }
          break
        case 'DELETE':
          if ((data as { id?: string }).id) {
            await this.client.from(table).delete().eq('id', (data as { id: string }).id)
          }
          break
      }
      if (import.meta.env.DEV) console.log(`数据同步成功: ${action} ${table}`)
    } catch (error) {
      if (import.meta.env.DEV) console.error(`数据同步失败: ${action} ${table}`, error)
      // 可以加入重试队列
    }
  }

  // 更新在线状态
  async updatePresence(projectId: string, status: 'online' | 'offline') {
    if (!this.client || !this.isInitialized || !this.currentUserId) {
      return
    }

    const channelName = `presence:${projectId}`
    const channel = this.channels.get(channelName)

    if (channel) {
      if (status === 'offline') {
        await channel.untrack()
      } else {
        await channel.track({
          user_id: this.currentUserId,
          display_name: '当前用户',
          last_active: new Date().toISOString()
        })
      }
    }
  }

  // 检查是否已初始化
  isReady(): boolean {
    return this.isInitialized
  }
}

// 导出单例
export const realtimeService = new RealtimeService()
