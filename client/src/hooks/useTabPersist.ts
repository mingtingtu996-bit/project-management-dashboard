/**
 * useTabPersist — Tab 激活状态持久化 Hook（F01）
 *
 * 使用 sessionStorage 存储各页面最后激活的 Tab key，
 * 页面返回时自动恢复上次位置。
 *
 * 使用示例：
 * const [activeTab, setActiveTab] = useTabPersist('risk-page', 'all')
 *
 * @param storageKey  唯一标识该页面 Tab 的存储 key
 * @param defaultTab  默认 Tab（没有历史记录时使用）
 */
import { useState, useCallback } from 'react'

export function useTabPersist(
  storageKey: string,
  defaultTab: string
): [string, (tab: string) => void] {
  const sessionKey = `tab_persist_${storageKey}`

  const [activeTab, setActiveTabState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(sessionKey) ?? defaultTab
    } catch {
      return defaultTab
    }
  })

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab)
    try {
      sessionStorage.setItem(sessionKey, tab)
    } catch {
      // sessionStorage 不可用时静默失败
    }
  }, [sessionKey])

  return [activeTab, setActiveTab]
}
