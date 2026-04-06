// 通用防抖 hook
// 用法：
//   const debouncedSearch = useDebounce(searchText, 300)
//   useMemo/useEffect 依赖 debouncedSearch 而非 searchText，减少不必要的过滤/请求

import { useState, useEffect } from 'react'

/**
 * useDebounce — 对值做防抖处理
 * @param value  原始值（通常是受控输入的 state）
 * @param delay  防抖延迟，单位 ms，默认 300ms
 * @returns      防抖后的值，只有在 delay 内无新变化时才更新
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
