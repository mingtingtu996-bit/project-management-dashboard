import { useEffect, useRef, useState } from 'react'

function readTodayKey() {
  return new Date().toISOString().slice(0, 10)
}

export function useDurationForecastRefreshKey(enabled = true) {
  const [refreshKey, setRefreshKey] = useState(0)
  const todayRef = useRef(readTodayKey())

  useEffect(() => {
    if (!enabled) return undefined

    const refreshIfDateChanged = () => {
      const today = readTodayKey()
      if (today === todayRef.current) return
      todayRef.current = today
      setRefreshKey((current) => current + 1)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfDateChanged()
    }

    window.addEventListener('focus', refreshIfDateChanged)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const timer = window.setInterval(refreshIfDateChanged, 60_000)

    return () => {
      window.removeEventListener('focus', refreshIfDateChanged)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(timer)
    }
  }, [enabled])

  return refreshKey
}
