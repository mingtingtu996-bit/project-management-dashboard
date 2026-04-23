import { v4 as uuidv4 } from 'uuid'
import type { Server as HttpServer, IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'

import { logger } from '../middleware/logger.js'
import { verifyToken } from '../auth/jwt.js'

export type RealtimeChannel = 'notifications' | 'project'

export interface RealtimeEvent {
  type: string
  channel: RealtimeChannel
  projectId?: string | null
  userId?: string | null
  entityType?: string | null
  entityId?: string | null
  ids?: string[]
  payload?: Record<string, unknown> | null
  timestamp: string
}

export interface RealtimeSubscription {
  channels: Set<RealtimeChannel>
  projectIds: Set<string>
  userId?: string | null
}

interface RealtimeClientRecord {
  id: string
  socket: WebSocket
  subscription: RealtimeSubscription
  isAlive: boolean
}

const DEFAULT_REALTIME_CHANNELS: RealtimeChannel[] = ['notifications', 'project']
const HEARTBEAT_INTERVAL_MS = 25000
const IS_DEV = process.env.NODE_ENV === 'development'
const IS_TEST = process.env.NODE_ENV === 'test'

const realtimeClients = new Map<string, RealtimeClientRecord>()
let websocketServer: WebSocketServer | null = null
let heartbeatTimer: NodeJS.Timeout | null = null

function parseRealtimeChannels(value?: string | null): Set<RealtimeChannel> {
  const entries = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const supported = new Set<RealtimeChannel>(DEFAULT_REALTIME_CHANNELS)
  const requested = entries.filter((item): item is RealtimeChannel => supported.has(item as RealtimeChannel))

  return new Set(requested.length > 0 ? requested : DEFAULT_REALTIME_CHANNELS)
}

function parseProjectIds(value?: string | null): Set<string> {
  return new Set(
    String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

export function parseRealtimeSubscriptionFromRequest(req: IncomingMessage): RealtimeSubscription {
  const url = new URL(req.url ?? '/ws', 'http://localhost')
  return {
    channels: parseRealtimeChannels(url.searchParams.get('channels')),
    projectIds: parseProjectIds(url.searchParams.get('projectId')),
    userId: url.searchParams.get('userId'),
  }
}

function resolveRealtimeUserId(req: IncomingMessage) {
  const url = new URL(req.url ?? '/ws', 'http://localhost')
  const token = url.searchParams.get('token')
  if (token) {
    const payload = verifyToken(token)
    return payload?.userId ?? null
  }

  if (IS_DEV || IS_TEST) {
    return url.searchParams.get('userId')
  }

  return null
}

export function shouldDeliverRealtimeEvent(
  subscription: RealtimeSubscription,
  event: Pick<RealtimeEvent, 'channel' | 'projectId' | 'userId'>,
) {
  if (!subscription.channels.has(event.channel)) {
    return false
  }

  if (subscription.projectIds.size > 0 && event.projectId && !subscription.projectIds.has(event.projectId)) {
    return false
  }

  if (subscription.userId && event.userId && subscription.userId !== event.userId) {
    return false
  }

  return true
}

function ensureHeartbeatLoop() {
  if (heartbeatTimer) return

  heartbeatTimer = setInterval(() => {
    for (const [clientId, client] of realtimeClients.entries()) {
      if (!client.isAlive) {
        client.socket.terminate()
        realtimeClients.delete(clientId)
        continue
      }

      client.isAlive = false
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.ping()
      }
    }
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeatLoopIfIdle() {
  if (realtimeClients.size > 0 || !heartbeatTimer) return
  clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

export function initializeRealtimeServer(server: HttpServer) {
  if (websocketServer) {
    return websocketServer
  }

  websocketServer = new WebSocketServer({ server, path: '/ws' })
  ensureHeartbeatLoop()

  websocketServer.on('connection', (socket, req) => {
    const authenticatedUserId = resolveRealtimeUserId(req)
    if (!authenticatedUserId && !IS_DEV && !IS_TEST) {
      socket.close(4001, 'unauthorized')
      return
    }

    const clientId = uuidv4()
    const subscription = parseRealtimeSubscriptionFromRequest(req)
    if (authenticatedUserId) {
      subscription.userId = authenticatedUserId
    }
    const client: RealtimeClientRecord = {
      id: clientId,
      socket,
      subscription,
      isAlive: true,
    }

    realtimeClients.set(clientId, client)
    logger.info('Realtime client connected', {
      clientId,
      channels: [...client.subscription.channels],
      projectIds: [...client.subscription.projectIds],
      userId: client.subscription.userId ?? null,
    })

    socket.on('pong', () => {
      client.isAlive = true
    })

    socket.on('message', (raw) => {
      try {
        const payload = JSON.parse(String(raw ?? '{}')) as {
          type?: string
          channels?: string[]
          projectIds?: string[]
          userId?: string | null
        }

        if (payload.type === 'subscribe') {
          client.subscription = {
            channels: parseRealtimeChannels(payload.channels?.join(',')),
            projectIds: parseProjectIds(payload.projectIds?.join(',')),
            userId: payload.userId ?? client.subscription.userId ?? null,
          }
        }
      } catch {
        logger.warn('Realtime client sent malformed payload', { clientId })
      }
    })

    socket.on('close', () => {
      realtimeClients.delete(clientId)
      stopHeartbeatLoopIfIdle()
      logger.info('Realtime client disconnected', { clientId })
    })

    const readyEvent: RealtimeEvent = {
      type: 'connection.ready',
      channel: 'project',
      projectId: [...client.subscription.projectIds][0] ?? null,
      userId: client.subscription.userId ?? null,
      timestamp: new Date().toISOString(),
      payload: {
        clientId,
        channels: [...client.subscription.channels],
      },
    }

    socket.send(JSON.stringify(readyEvent))
  })

  return websocketServer
}

export function broadcastRealtimeEvent(event: Omit<RealtimeEvent, 'timestamp'> & { timestamp?: string }) {
  if (realtimeClients.size === 0) {
    return 0
  }

  const normalizedEvent: RealtimeEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  }
  const serialized = JSON.stringify(normalizedEvent)
  let deliveredCount = 0

  for (const client of realtimeClients.values()) {
    if (client.socket.readyState !== WebSocket.OPEN) continue
    if (!shouldDeliverRealtimeEvent(client.subscription, normalizedEvent)) continue
    client.socket.send(serialized)
    deliveredCount += 1
  }

  return deliveredCount
}

export function getRealtimeClientCount() {
  return realtimeClients.size
}

export function resetRealtimeServerStateForTests() {
  for (const client of realtimeClients.values()) {
    try {
      client.socket.close()
    } catch {
      // no-op
    }
  }
  realtimeClients.clear()

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  if (websocketServer) {
    websocketServer.close()
    websocketServer = null
  }
}
