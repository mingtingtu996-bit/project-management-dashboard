import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useConnectionMode, useCurrentUser } from '@/hooks/useStore'
import { safeJsonParse } from '@/lib/browserStorage'
import { getAuthToken } from '@/lib/apiClient'
import { buildRealtimeWebSocketUrl } from '@/lib/realtime'

export type PlanningPresenceMode = 'viewing' | 'editing'

export interface PlanningPresenceCell {
  rowId: string
  field: string
  rowTitle?: string | null
}

export interface PlanningPresenceRecord {
  clientId?: string | null
  userId?: string | null
  userName?: string | null
  resourceType?: string | null
  resourceId?: string | null
  mode?: PlanningPresenceMode | null
  rowId?: string | null
  cellKey?: string | null
  rowTitle?: string | null
  updatedAt?: string | null
}

interface UsePlanningPresenceOptions {
  projectId?: string | null
  resourceType: 'baseline' | 'monthly' | 'task-list'
  resourceId?: string | null
  enabled?: boolean
}

function resolveUserName(user: ReturnType<typeof useCurrentUser>) {
  return user?.display_name || user?.username || user?.email || (user?.id ? `成员 ${String(user.id).slice(0, 4)}` : '协作成员')
}

function isPresencePayload(value: unknown): value is { records?: PlanningPresenceRecord[] } {
  return Boolean(value && typeof value === 'object')
}

export function usePlanningPresence({
  projectId,
  resourceType,
  resourceId,
  enabled = true,
}: UsePlanningPresenceOptions) {
  const currentUser = useCurrentUser()
  const connectionMode = useConnectionMode()
  const socketRef = useRef<WebSocket | null>(null)
  const latestCellRef = useRef<PlanningPresenceCell | null>(null)
  const [records, setRecords] = useState<PlanningPresenceRecord[]>([])

  const resolvedResourceId = resourceId || projectId || resourceType
  const userName = resolveUserName(currentUser)
  const userId = currentUser?.id ?? null

  const sendPresence = useCallback((mode: PlanningPresenceMode | 'idle', cell?: PlanningPresenceCell | null) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !projectId || !resolvedResourceId) return
    const nextCell = cell === undefined ? latestCellRef.current : cell
    socket.send(JSON.stringify({
      type: 'planning.presence.update',
      projectId,
      resourceType,
      resourceId: resolvedResourceId,
      userId,
      userName,
      mode,
      rowId: mode === 'editing' ? nextCell?.rowId ?? null : null,
      cellKey: mode === 'editing' ? nextCell?.field ?? null : null,
      rowTitle: mode === 'editing' ? nextCell?.rowTitle ?? null : null,
    }))
  }, [projectId, resolvedResourceId, resourceType, userId, userName])

  const setEditingCell = useCallback((cell: PlanningPresenceCell | null) => {
    latestCellRef.current = cell
    sendPresence(cell ? 'editing' : 'viewing', cell)
  }, [sendPresence])

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled || connectionMode !== 'websocket' || !projectId || !resolvedResourceId) {
      setRecords([])
      return undefined
    }

    let disposed = false
    const socket = new WebSocket(buildRealtimeWebSocketUrl({ projectId, userId }))
    socketRef.current = socket

    socket.onopen = () => {
      if (disposed) return
      // v1.4.20 SEC-5: send auth token as first message
      const token = getAuthToken()
      if (token && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'auth', token }))
      }
      sendPresence(latestCellRef.current ? 'editing' : 'viewing')
    }

    socket.onmessage = (event) => {
      const payload = safeJsonParse<{
        type?: string
        payload?: unknown
      } | null>(String(event.data ?? ''), null, 'planning-presence')
      if (!payload || payload.type !== 'planning.presence.changed' || !isPresencePayload(payload.payload)) return
      const nextRecords = Array.isArray(payload.payload.records) ? payload.payload.records : []
      setRecords(nextRecords.filter((record) => record.resourceType === resourceType && record.resourceId === resolvedResourceId))
    }

    const timer = window.setInterval(() => {
      sendPresence(latestCellRef.current ? 'editing' : 'viewing')
    }, 8_000)

    return () => {
      disposed = true
      window.clearInterval(timer)
      try {
        sendPresence('idle')
      } catch {
        // no-op
      }
      if (socketRef.current === socket) socketRef.current = null
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'presence teardown')
      }
    }
  }, [connectionMode, enabled, projectId, resolvedResourceId, resourceType, sendPresence, userId])

  return useMemo(() => {
    const currentClientRecords = records.filter((record) => record.userId !== userId)
    const editingByRowId = currentClientRecords.reduce<Record<string, string[]>>((map, record) => {
      if (record.mode !== 'editing' || !record.rowId) return map
      const list = map[record.rowId] ?? []
      const name = record.userName || '协作成员'
      if (!list.includes(name)) list.push(name)
      map[record.rowId] = list
      return map
    }, {})

    return {
      records,
      otherRecords: currentClientRecords,
      viewerCount: records.length,
      viewerNames: currentClientRecords.map((record) => record.userName || '协作成员'),
      editingByRowId,
      setEditingCell,
    }
  }, [records, setEditingCell, userId])
}
