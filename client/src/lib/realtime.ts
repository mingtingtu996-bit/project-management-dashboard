import type { RealtimeEventRecord } from '@/hooks/useStore'
import { getAuthToken } from '@/lib/apiClient'

export const DEFAULT_REALTIME_CHANNELS = ['notifications', 'project'] as const

export interface BuildRealtimeUrlOptions {
  companyId?: string | null
  projectId?: string | null
  userId?: string | null
  channels?: readonly string[]
}

function resolveRealtimeHost(location: Location) {
  if (
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && location.port === '5173'
  ) {
    return `${location.hostname}:3001`
  }

  return location.host
}

export function buildRealtimeWebSocketUrl(
  options: BuildRealtimeUrlOptions = {},
  locationOverride?: Location,
) {
  const runtimeLocation = locationOverride ?? window.location
  const protocol = runtimeLocation.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(`${protocol}//${resolveRealtimeHost(runtimeLocation)}/ws`)
  const channels = options.channels?.length ? [...options.channels] : [...DEFAULT_REALTIME_CHANNELS]

  url.searchParams.set('channels', channels.join(','))

  if (options.projectId) {
    url.searchParams.set('projectId', options.projectId)
  }

  if (options.companyId) {
    url.searchParams.set('companyId', options.companyId)
  }

  if (options.userId) {
    url.searchParams.set('userId', options.userId)
  }

  // v1.4.20 SEC-5: token no longer passed via URL — sent as auth message after connection
  return url.toString()
}

export function isRealtimeNotificationEvent(
  event: RealtimeEventRecord | null,
  currentProjectId?: string | null,
) {
  if (!event || event.type !== 'notification.changed') {
    return false
  }

  if (!currentProjectId || !event.projectId) {
    return true
  }

  return event.projectId === currentProjectId
}
