/**
 * 数据缓存模块 - 报表数据缓存机制
 * 减少重复 API 请求，提升页面加载速度
 */

interface CacheItem<T> {
  data: T
  timestamp: number
  expiresAt: number
}

interface CacheConfig {
  /** 缓存过期时间（毫秒），默认 5 分钟 */
  ttl?: number
  /** 最大缓存条目数，默认 50 */
  maxSize?: number
}

class DataCache {
  private cache = new Map<string, CacheItem<unknown>>()
  private defaultTTL = 5 * 60 * 1000 // 5 分钟
  private defaultMaxSize = 50

  /**
   * 生成缓存 key
   */
  private generateKey(namespace: string, params?: Record<string, unknown>): string {
    if (!params) return namespace
    const sortedParams = Object.keys(params).sort()
      .map(key => `${key}=${JSON.stringify(params[key])}`)
      .join('&')
    return `${namespace}?${sortedParams}`
  }

  /**
   * 设置缓存
   */
  set<T>(namespace: string, data: T, config: CacheConfig = {}): void {
    const ttl = config.ttl || this.defaultTTL
    const maxSize = config.maxSize || this.defaultMaxSize

    // 如果缓存已满，先清理最老的条目
    if (this.cache.size >= maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }

    const key = this.generateKey(namespace)
    const now = Date.now()

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl
    })
  }

  /**
   * 获取缓存
   * @returns 缓存数据，如果不存在或已过期返回 null
   */
  get<T>(namespace: string, params?: Record<string, unknown>): T | null {
    const key = this.generateKey(namespace, params)
    const item = this.cache.get(key)

    if (!item) return null

    // 检查是否过期
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return item.data as T
  }

  /**
   * 检查缓存是否存在（未过期）
   */
  has(namespace: string, params?: Record<string, unknown>): boolean {
    const key = this.generateKey(namespace, params)
    const item = this.cache.get(key)

    if (!item) return false
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * 删除指定缓存
   */
  delete(namespace: string, params?: Record<string, unknown>): void {
    const key = this.generateKey(namespace, params)
    this.cache.delete(key)
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 清空指定命名空间的缓存
   */
  clearNamespace(namespace: string): void {
    const prefix = namespace.split('?')[0]
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }

  /**
   * 定期清理过期缓存
   */
  cleanup(): void {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}

// 导出单例
export const dataCache = new DataCache()

// 定期清理定时器（可清理，防止内存泄漏）
let cleanupTimerId: ReturnType<typeof setInterval> | undefined
if (typeof window !== 'undefined') {
  cleanupTimerId = setInterval(() => dataCache.cleanup(), 60 * 1000)
}

/** 停止定期清理（组件卸载时调用） */
export function stopDataCacheCleanup(): void {
  if (cleanupTimerId !== undefined) {
    clearInterval(cleanupTimerId)
    cleanupTimerId = undefined
  }
}

/**
 * 缓存 hook - 用于 React 组件
 */
export function useDataCache<T>(
  namespace: string,
  fetcher: () => Promise<T>,
  config: CacheConfig = {}
): {
  data: T | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
} {
  // 这个 hook 的实现会根据具体使用场景定制
  // 这里只是一个类型定义，实际使用需要在组件中调用
  return {
    data: null,
    loading: false,
    error: null,
    refresh: async () => {}
  }
}
