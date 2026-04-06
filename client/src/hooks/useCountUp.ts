/**
 * useCountUp.ts
 * 数字从 0 增长到目标值的滚动动画 hook
 *
 * 用法：
 *   const displayValue = useCountUp(targetValue, { duration: 800 })
 *
 * @param target  目标数字
 * @param options 动画配置
 */

import { useState, useEffect, useRef } from 'react'

interface CountUpOptions {
  /** 动画时长（ms），默认 800 */
  duration?: number
  /** 动画延迟（ms），默认 0 */
  delay?: number
  /** easing 函数，默认 easeOutQuad */
  easing?: (t: number) => number
}

function easeOutQuad(t: number): number {
  return t * (2 - t)
}

export function useCountUp(
  target: number,
  options: CountUpOptions = {}
): number {
  const { duration = 800, delay = 0, easing = easeOutQuad } = options

  const [current, setCurrent] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const prevTargetRef = useRef<number>(0)

  useEffect(() => {
    // 目标值未变化时不重新触发
    if (target === prevTargetRef.current) return
    prevTargetRef.current = target

    const startValue = 0
    let delayTimer: ReturnType<typeof setTimeout> | null = null

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp
      }

      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easing(progress)

      setCurrent(Math.round(startValue + (target - startValue) * easedProgress))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setCurrent(target)
      }
    }

    // 重置
    setCurrent(0)
    startTimeRef.current = null

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    delayTimer = setTimeout(() => {
      rafRef.current = requestAnimationFrame(animate)
    }, delay)

    return () => {
      if (delayTimer) clearTimeout(delayTimer)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, delay]) // eslint-disable-line react-hooks/exhaustive-deps

  return current
}
