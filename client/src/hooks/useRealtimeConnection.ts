import { useEffect } from 'react'

import {
  useConnectionMode,
  useCurrentProject,
  useCurrentUser,
  useSetLastRealtimeEvent,
  useSetRealtimeConnectionState,
} from '@/hooks/useStore'
import type { RealtimeEventRecord } from '@/hooks/useStore'
import { safeJsonParse } from '@/lib/browserStorage'
import { buildRealtimeWebSocketUrl } from '@/lib/realtime'

const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 15000

interface UseRealtimeConnectionOptions {
  enabled?: boolean
  authenticatedUserId?: string | null
}

function getReconnectDelay(attempt: number) {
  return Math.min(RECONNECT_BASE_DELAY_MS * (2 ** attempt), RECONNECT_MAX_DELAY_MS)
}

export function useRealtimeConnection(options: UseRealtimeConnectionOptions = {}) {
  const connectionMode = useConnectionMode()
  const currentProject = useCurrentProject()
  const currentUser = useCurrentUser()
  const setRealtimeConnectionState = useSetRealtimeConnectionState()
  const setLastRealtimeEvent = useSetLastRealtimeEvent()
  const enabled = options.enabled ?? true
  const userId = options.authenticatedUserId ?? currentUser?.id ?? null

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!enabled) {
      setRealtimeConnectionState('idle')
      return
    }

    if (connectionMode !== 'websocket') {
      setRealtimeConnectionState('polling')
      return
    }

    let disposed = false
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const connect = () => {
      if (disposed) return

      clearReconnectTimer()
      setRealtimeConnectionState(reconnectAttempt === 0 ? 'connecting' : 'reconnecting')

      try {
        socket = new window.WebSocket(
          buildRealtimeWebSocketUrl({
            projectId: currentProject?.id ?? null,
            userId,
          }),
        )
      } catch {
        setRealtimeConnectionState('disconnected')
        reconnectTimer = window.setTimeout(() => {
          reconnectAttempt += 1
          connect()
        }, getReconnectDelay(reconnectAttempt))
        return
      }

      socket.onopen = () => {
        reconnectAttempt = 0
        setRealtimeConnectionState('connected')
      }

      socket.onmessage = (event) => {
        const payload = safeJsonParse<RealtimeEventRecord | null>(
          String(event.data ?? ''),
          null,
          'realtime-event',
        )
        if (payload && typeof payload.type === 'string' && typeof payload.timestamp === 'string') {
          setLastRealtimeEvent(payload)
        }
      }

      socket.onerror = () => {
        setRealtimeConnectionState('reconnecting')
      }

      socket.onclose = () => {
        socket = null
        if (disposed) {
          setRealtimeConnectionState('idle')
          return
        }

        setRealtimeConnectionState('reconnecting')
        reconnectTimer = window.setTimeout(() => {
          reconnectAttempt += 1
          connect()
        }, getReconnectDelay(reconnectAttempt))
      }
    }

    const handleOffline = () => {
      if (disposed) return
      setRealtimeConnectionState('disconnected')
      clearReconnectTimer()
      if (socket && socket.readyState === window.WebSocket.OPEN) {
        socket.close(4000, 'offline')
      }
    }

    const handleOnline = () => {
      if (disposed) return
      clearReconnectTimer()
      reconnectAttempt = 0
      if (!socket || socket.readyState !== window.WebSocket.OPEN) {
        connect()
      }
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    connect()

    return () => {
      disposed = true
      clearReconnectTimer()
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      if (socket && socket.readyState === window.WebSocket.OPEN) {
        socket.close(1000, 'client teardown')
      }
      setRealtimeConnectionState('idle')
    }
  }, [
    connectionMode,
    currentProject?.id,
    enabled,
    setLastRealtimeEvent,
    setRealtimeConnectionState,
    userId,
  ])
}

export default useRealtimeConnection
