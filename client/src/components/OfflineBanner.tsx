import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-[1680px] items-center gap-2">
        <WifiOff className="h-4 w-4" />
        <span>离线模式中，当前无法保存或提交内容，请恢复网络后再继续操作。</span>
      </div>
    </div>
  )
}

