import { v4 as uuidv4 } from 'uuid'
import type { Server as HttpServer, IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'

import { logger } from '../middleware/logger.js'
import { verifyToken } from '../auth/jwt.js'
import { getCurrentCompanyMembership, getProjectPermissionLevel } from '../auth/access.js'
import { getAuthUserById } from '../auth/session.js'
import { isCompanySessionRevoked } from '../auth/companySession.js'

export type RealtimeChannel = 'notifications' | 'project'

export interface RealtimeEvent {
  type: string
  channel: RealtimeChannel
  companyId?: string | null
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
  companyId?: string | null
  projectIds: Set<string>
  userId?: string | null
}

interface RealtimeClientRecord {
  id: string
  socket: WebSocket
  requestedSubscription: RealtimeSubscription
  subscription: RealtimeSubscription
  isAlive: boolean
  authenticated: boolean
  authenticatedTokenVersion: number | null
  tokenIssuedAt: number | null
  tokenExpiresAt: number | null
  lastAuthorizedAt: number | null
}

interface PlanningPresenceRecord {
  clientId: string
  userId?: string | null
  userName?: string | null
  projectId: string
  resourceType: string
  resourceId: string
  mode: 'viewing' | 'editing'
  rowId?: string | null
  cellKey?: string | null
  rowTitle?: string | null
  updatedAt: string
  expiresAt: number
}

const DEFAULT_REALTIME_CHANNELS: RealtimeChannel[] = ['notifications', 'project']
const HEARTBEAT_INTERVAL_MS = 25000
const AUTHENTICATION_TIMEOUT_MS = 10_000
const AUTHORIZATION_MAX_AGE_MS = 30_000

const realtimeClients = new Map<string, RealtimeClientRecord>()
const planningPresenceRecords = new Map<string, PlanningPresenceRecord>()
let websocketServer: WebSocketServer | null = null
let heartbeatTimer: NodeJS.Timeout | null = null
let revalidationInFlight: Promise<void> | null = null

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
    companyId: url.searchParams.get('companyId'),
    projectIds: parseProjectIds(url.searchParams.get('projectId')),
    userId: url.searchParams.get('userId'),
  }
}

async function validateRealtimeToken(token: string) {
  if (!token) return false
  const payload = verifyToken(token)
  if (!payload?.userId || !payload.iat || !payload.exp || payload.exp * 1000 <= Date.now()) return false

  const user = await getAuthUserById(payload.userId)
  if (!user || Boolean(user.password_reset_required)) return false

  const tokenVersion = Number(payload.tokenVersion ?? 0)
  if (Number(user.auth_token_version ?? 0) !== tokenVersion) return false

  return {
    userId: payload.userId,
    tokenVersion,
    tokenIssuedAt: payload.iat,
    tokenExpiresAt: payload.exp * 1000,
  }
}

async function filterAuthorizedProjectIds(userId: string | null | undefined, projectIds: Set<string>, companyId?: string | null) {
  if (!userId || projectIds.size === 0) {
    return new Set<string>()
  }

  const authorized = new Set<string>()
  for (const projectId of projectIds) {
    try {
      const permission = await getProjectPermissionLevel(userId, projectId, companyId)
      if (permission) {
        authorized.add(projectId)
      }
    } catch (error) {
      logger.warn('Realtime project authorization failed', {
        userId,
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return authorized
}

async function refreshClientProjectSubscription(client: RealtimeClientRecord) {
  const requestedCompanyId = client.requestedSubscription.companyId ?? null
  const membership = requestedCompanyId
    ? await getCurrentCompanyMembership(client.subscription.userId ?? '', requestedCompanyId)
    : null
  const authorizedCompanyId = requestedCompanyId && membership?.companyId === requestedCompanyId
    ? requestedCompanyId
    : null

  client.subscription.channels = new Set(client.requestedSubscription.channels)
  client.subscription.companyId = authorizedCompanyId
  if (requestedCompanyId && !authorizedCompanyId) {
    client.subscription.projectIds = new Set()
    return
  }
  client.subscription.projectIds = await filterAuthorizedProjectIds(
    client.subscription.userId,
    client.requestedSubscription.projectIds,
    authorizedCompanyId,
  )
}

async function handleAuthMessage(client: RealtimeClientRecord, token: string) {
  const auth = await validateRealtimeToken(token)
  if (!auth) return false

  const requestedCompanyId = client.requestedSubscription.companyId ?? null
  if (requestedCompanyId && await isCompanySessionRevoked({
    userId: auth.userId,
    companyId: requestedCompanyId,
    tokenIssuedAtSeconds: auth.tokenIssuedAt,
  })) {
    return false
  }

  client.subscription.userId = auth.userId
  client.authenticatedTokenVersion = auth.tokenVersion
  client.tokenIssuedAt = auth.tokenIssuedAt
  client.tokenExpiresAt = auth.tokenExpiresAt
  await refreshClientProjectSubscription(client)
  client.authenticated = true
  client.lastAuthorizedAt = Date.now()
  return true
}

async function revalidateRealtimeClient(client: RealtimeClientRecord) {
  if (
    !client.authenticated
    || !client.subscription.userId
    || client.authenticatedTokenVersion === null
    || client.tokenIssuedAt === null
    || !client.tokenExpiresAt
    || client.tokenExpiresAt <= Date.now()
  ) {
    return false
  }

  const user = await getAuthUserById(client.subscription.userId)
  if (
    !user
    || Boolean(user.password_reset_required)
    || Number(user.auth_token_version ?? 0) !== client.authenticatedTokenVersion
  ) {
    return false
  }

  const requestedCompanyId = client.requestedSubscription.companyId ?? null
  if (requestedCompanyId && await isCompanySessionRevoked({
    userId: client.subscription.userId,
    companyId: requestedCompanyId,
    tokenIssuedAtSeconds: client.tokenIssuedAt,
  })) {
    return false
  }

  await refreshClientProjectSubscription(client)
  client.lastAuthorizedAt = Date.now()
  return true
}

function removeRealtimeClient(client: RealtimeClientRecord) {
  realtimeClients.delete(client.id)
  const presence = planningPresenceRecords.get(getPresenceKey(client.id))
  if (presence) {
    planningPresenceRecords.delete(getPresenceKey(client.id))
    broadcastPlanningPresence(presence.projectId, presence.resourceType, presence.resourceId)
  }
  stopHeartbeatLoopIfIdle()
}

function closeRealtimeClient(client: RealtimeClientRecord, code: number, reason: string) {
  removeRealtimeClient(client)
  if (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING) {
    client.socket.close(code, reason)
  }
}

export function revalidateRealtimeClientsNow(): Promise<void> {
  if (revalidationInFlight) return revalidationInFlight

  const run = Promise.all([...realtimeClients.values()].map(async (client) => {
    try {
      if (!await revalidateRealtimeClient(client)) {
        closeRealtimeClient(client, 4001, 'authorization expired')
      }
    } catch (error) {
      logger.warn('Realtime authorization revalidation failed closed', {
        clientId: client.id,
        userId: client.subscription.userId ?? null,
        error: error instanceof Error ? error.message : String(error),
      })
      closeRealtimeClient(client, 1011, 'authorization unavailable')
    }
  })).then(() => undefined)

  revalidationInFlight = run.finally(() => {
    revalidationInFlight = null
  })
  return revalidationInFlight
}

export function shouldDeliverRealtimeEvent(
  subscription: RealtimeSubscription,
  event: Pick<RealtimeEvent, 'channel' | 'companyId' | 'projectId' | 'userId'>,
) {
  if (!subscription.channels.has(event.channel)) {
    return false
  }

  if (event.companyId && subscription.companyId !== event.companyId) {
    return false
  }

  if (event.projectId && !subscription.projectIds.has(event.projectId)) {
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
    void revalidateRealtimeClientsNow()
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeatLoopIfIdle() {
  if (realtimeClients.size > 0 || !heartbeatTimer) return
  clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

function getPresenceKey(clientId: string) {
  return `planning:${clientId}`
}

function normalizePresenceText(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

function broadcastPlanningPresence(projectId: string, resourceType: string, resourceId: string) {
  const now = Date.now()
  for (const [key, record] of planningPresenceRecords.entries()) {
    if (record.expiresAt <= now) {
      planningPresenceRecords.delete(key)
    }
  }

  const records = [...planningPresenceRecords.values()]
    .filter((record) => record.projectId === projectId && record.resourceType === resourceType && record.resourceId === resourceId)
    .map((record) => ({
      clientId: record.clientId,
      userId: record.userId ?? null,
      userName: record.userName ?? null,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      mode: record.mode,
      rowId: record.rowId ?? null,
      cellKey: record.cellKey ?? null,
      rowTitle: record.rowTitle ?? null,
      updatedAt: record.updatedAt,
    }))

  broadcastRealtimeEvent({
    type: 'planning.presence.changed',
    channel: 'project',
    projectId,
    entityType: resourceType,
    entityId: resourceId,
    payload: {
      resourceType,
      resourceId,
      records,
    },
  })
}

export function initializeRealtimeServer(server: HttpServer) {
  if (websocketServer) {
    return websocketServer
  }

  websocketServer = new WebSocketServer({ server, path: '/ws' })

  websocketServer.on('connection', async (socket, req) => {
    const clientId = uuidv4()
    const requestedSubscription = parseRealtimeSubscriptionFromRequest(req)
    const client: RealtimeClientRecord = {
      id: clientId,
      socket,
      requestedSubscription,
      subscription: {
        channels: new Set(requestedSubscription.channels),
        companyId: null,
        projectIds: new Set(),
        userId: null,
      },
      isAlive: true,
      authenticated: false,
      authenticatedTokenVersion: null,
      tokenIssuedAt: null,
      tokenExpiresAt: null,
      lastAuthorizedAt: null,
    }

    const authenticationTimeout = setTimeout(() => {
      if (!client.authenticated) {
        closeRealtimeClient(client, 4001, 'authentication timeout')
      }
    }, AUTHENTICATION_TIMEOUT_MS)

    logger.info('Realtime client awaiting authentication', {
      clientId,
      requestedChannels: [...requestedSubscription.channels],
      requestedProjectCount: requestedSubscription.projectIds.size,
    })

    socket.on('pong', () => {
      client.isAlive = true
    })

    socket.on('message', async (raw) => {
      try {
        const payload = JSON.parse(String(raw ?? '{}')) as {
          type?: string
          channels?: string[]
          projectIds?: string[]
          userId?: string | null
          projectId?: string | null
          resourceType?: string | null
          resourceId?: string | null
          mode?: string | null
          rowId?: string | null
          cellKey?: string | null
          rowTitle?: string | null
          userName?: string | null
          token?: string | null
        }

        if (payload.type === 'auth') {
          const ok = await handleAuthMessage(client, payload.token ?? '')
          if (!ok) {
            closeRealtimeClient(client, 4001, 'unauthorized')
            return
          }
          clearTimeout(authenticationTimeout)
          realtimeClients.set(clientId, client)
          ensureHeartbeatLoop()
          logger.info('Realtime client authenticated', {
            clientId,
            channels: [...client.subscription.channels],
            projectIds: [...client.subscription.projectIds],
            userId: client.subscription.userId,
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
          return
        }

        if (!client.authenticated) {
          return
        }

        if (payload.type === 'subscribe') {
          const nextProjectIds = parseProjectIds(payload.projectIds?.join(','))
          client.requestedSubscription = {
            channels: parseRealtimeChannels(payload.channels?.join(',')),
            companyId: client.requestedSubscription.companyId ?? null,
            projectIds: nextProjectIds,
            userId: null,
          }
          await refreshClientProjectSubscription(client)
          client.lastAuthorizedAt = Date.now()
          return
        }

        if (payload.type === 'planning.presence.update') {
          const projectId = normalizePresenceText(payload.projectId) ?? [...client.subscription.projectIds][0] ?? null
          const resourceType = normalizePresenceText(payload.resourceType)
          const resourceId = normalizePresenceText(payload.resourceId)
          if (!projectId || !resourceType || !resourceId) return
          if (!client.subscription.projectIds.has(projectId)) return

          const presenceKey = getPresenceKey(clientId)
          if (payload.mode === 'idle') {
            planningPresenceRecords.delete(presenceKey)
            broadcastPlanningPresence(projectId, resourceType, resourceId)
            return
          }

          const mode = payload.mode === 'editing' ? 'editing' : 'viewing'
          planningPresenceRecords.set(presenceKey, {
            clientId,
            userId: client.subscription.userId ?? payload.userId ?? null,
            userName: normalizePresenceText(payload.userName),
            projectId,
            resourceType,
            resourceId,
            mode,
            rowId: normalizePresenceText(payload.rowId),
            cellKey: normalizePresenceText(payload.cellKey),
            rowTitle: normalizePresenceText(payload.rowTitle),
            updatedAt: new Date().toISOString(),
            expiresAt: Date.now() + 20_000,
          })
          broadcastPlanningPresence(projectId, resourceType, resourceId)
        }
      } catch {
        logger.warn('Realtime client sent malformed payload', { clientId })
      }
    })

    socket.on('close', () => {
      clearTimeout(authenticationTimeout)
      removeRealtimeClient(client)
      logger.info('Realtime client disconnected', { clientId })
    })

    const authenticationRequiredEvent: RealtimeEvent = {
      type: 'authentication.required',
      channel: 'project',
      projectId: null,
      userId: null,
      timestamp: new Date().toISOString(),
      payload: {
        clientId,
      },
    }

    socket.send(JSON.stringify(authenticationRequiredEvent))
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
    if (!client.authenticated) continue
    if (!client.tokenExpiresAt || client.tokenExpiresAt <= Date.now()) {
      closeRealtimeClient(client, 4001, 'token expired')
      continue
    }
    if (!client.lastAuthorizedAt || Date.now() - client.lastAuthorizedAt > AUTHORIZATION_MAX_AGE_MS) {
      void revalidateRealtimeClientsNow()
      continue
    }
    if (!shouldDeliverRealtimeEvent(client.subscription, normalizedEvent)) continue
    client.socket.send(serialized)
    deliveredCount += 1
  }

  return deliveredCount
}

export function getRealtimeClientCount() {
  return realtimeClients.size
}

export async function closeRealtimeServer(timeoutMs = 2_000) {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  const clients = [...realtimeClients.values()]
  for (const client of clients) {
    closeRealtimeClient(client, 1001, 'server shutting down')
  }

  const server = websocketServer
  websocketServer = null
  if (!server) return

  await new Promise<void>((resolve) => {
    let completed = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const finish = () => {
      if (completed) return
      completed = true
      if (timeout) clearTimeout(timeout)
      resolve()
    }
    timeout = setTimeout(() => {
      for (const client of clients) {
        client.socket.terminate()
      }
      finish()
    }, Math.max(1, timeoutMs))
    timeout.unref?.()
    server.close(finish)
  })
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
  planningPresenceRecords.clear()

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  if (websocketServer) {
    websocketServer.close()
    websocketServer = null
  }
  revalidationInFlight = null
}
