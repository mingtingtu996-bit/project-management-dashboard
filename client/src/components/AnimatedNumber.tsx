import { useEffect, useMemo, useRef, useState } from 'react'

import { formatNumber } from '@/lib/formatters'

interface AnimatedNumberProps {
  value: number
  className?: string
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const safeValue = Number.isFinite(value) ? value : 0
  const [displayValue, setDisplayValue] = useState(safeValue)
  const previousValueRef = useRef(safeValue)
  const formatter = useMemo(() => new Intl.NumberFormat('zh-CN'), [])

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplayValue(safeValue)
      previousValueRef.current = safeValue
      return
    }

    const start = previousValueRef.current
    const delta = safeValue - start
    previousValueRef.current = safeValue
    const duration = 300
    const startedAt = performance.now()
    let frameId = 0

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(start + delta * eased)
      if (progress < 1) frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [safeValue])

  return (
    <span className={className}>
      {Number.isInteger(safeValue) ? formatter.format(Math.round(displayValue)) : formatNumber(displayValue)}
    </span>
  )
}
