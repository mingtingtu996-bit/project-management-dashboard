/**
 * useAsyncData - 通用异步数据加载 Hook
 *
 * 统一 loading / error / data / refetch 状态管理，
 * 消除各页面重复的 API 调用模板代码。
 *
 * @example
 * const { data, loading, error, refetch } = useAsyncData(
 *   () => fetch(`/api/tasks?projectId=${id}`).then(r => r.json()),
 *   [id]
 * )
 */

import { useState, useEffect, useCallback, useRef, DependencyList } from 'react'

export interface AsyncDataState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * 通用异步数据加载 Hook
 * @param fetcher 数据获取函数，返回 Promise<T>
 * @param deps 依赖数组，变化时自动重新加载
 * @param options 配置项
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList = [],
  options: {
    /** 是否在挂载时立即执行（默认 true） */
    immediate?: boolean
    /** 初始数据（在加载完成前展示） */
    initialData?: T | null
  } = {}
): AsyncDataState<T> {
  const { immediate = true, initialData = null } = options

  const [data, setData] = useState<T | null>(initialData)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState<string | null>(null)

  // 用 ref 跟踪是否已卸载，防止 setState 内存泄漏
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      if (mountedRef.current) {
        setData(result)
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : '加载失败')
        if (import.meta.env.DEV) console.error('[useAsyncData]', err)
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (immediate) {
      load()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  return { data, loading, error, refetch: load }
}

export default useAsyncData
