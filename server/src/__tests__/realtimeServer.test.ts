import { createServer, type Server } from 'node:http'
import { once } from 'node:events'

import { WebSocket } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  getAuthUserById: vi.fn(),
  getCurrentCompanyMembership: vi.fn(),
  getProjectPermissionLevel: vi.fn(),
  isCompanySessionRevoked: vi.fn(),
}))
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../auth/jwt.js', () => ({ verifyToken: authMocks.verifyToken }))
vi.mock('../auth/session.js', () => ({ getAuthUserById: authMocks.getAuthUserById }))
vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: authMocks.getCurrentCompanyMembership,
  getProjectPermissionLevel: authMocks.getProjectPermissionLevel,
}))
vi.mock('../auth/companySession.js', () => ({
  isCompanySessionRevoked: authMocks.isCompanySessionRevoked,
}))
vi.mock('../middleware/logger.js', () => ({ logger: loggerMocks }))

import {
  broadcastRealtimeEvent,
  closeRealtimeServer,
  getRealtimeClientCount,
  initializeRealtimeServer,
  parseRealtimeSubscriptionFromRequest,
  resetRealtimeServerStateForTests,
  revalidateRealtimeClientsNow,
  shouldDeliverRealtimeEvent,
} from '../services/realtimeServer.js'

let httpServer: Server | null = null

async function connectRealtime(query = '') {
  if (!httpServer) {
    httpServer = createServer()
    initializeRealtimeServer(httpServer)
    await new Promise<void>((resolve) => httpServer!.listen(0, '127.0.0.1', resolve))
  }
  const address = httpServer.address()
  if (!address || typeof address === 'string') throw new Error('missing realtime test address')

  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws${query}`)
  const messages: Array<Record<string, unknown>> = []
  socket.on('message', (raw) => {
    messages.push(JSON.parse(String(raw)) as Record<string, unknown>)
  })
  await once(socket, 'open')
  return { socket, messages }
}

async function waitForMessage(messages: Array<Record<string, unknown>>, type: string) {
  await vi.waitFor(() => {
    expect(messages.some((message) => message.type === type)).toBe(true)
  }, { timeout: 1_000 })
}

beforeEach(() => {
  authMocks.verifyToken.mockReturnValue({
    userId: 'user-1',
    tokenVersion: 1,
    iat: Math.floor(Date.now() / 1_000) - 5,
    exp: Math.floor(Date.now() / 1_000) + 300,
  })
  authMocks.getAuthUserById.mockResolvedValue({
    id: 'user-1',
    auth_token_version: 1,
    password_reset_required: false,
  })
  authMocks.getCurrentCompanyMembership.mockResolvedValue({
    companyId: 'company-1',
    role: 'regular',
  })
  authMocks.getProjectPermissionLevel.mockResolvedValue('editor')
  authMocks.isCompanySessionRevoked.mockResolvedValue(false)
})

afterEach(async () => {
  resetRealtimeServerStateForTests()
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()))
    httpServer = null
  }
  vi.clearAllMocks()
})

describe('realtime server helpers', () => {
  it('parses channel, project and user subscriptions from the upgrade URL', () => {
    const subscription = parseRealtimeSubscriptionFromRequest({
      url: '/ws?channels=notifications,project&projectId=project-1,project-2&userId=user-1',
    } as any)

    expect([...subscription.channels]).toEqual(['notifications', 'project'])
    expect([...subscription.projectIds]).toEqual(['project-1', 'project-2'])
    expect(subscription.userId).toBe('user-1')
  })

  it('filters out project-scoped events that do not belong to the subscribed project', () => {
    const shouldDeliver = shouldDeliverRealtimeEvent(
      {
        channels: new Set(['project']),
        projectIds: new Set(['project-1']),
        userId: null,
      },
      {
        channel: 'project',
        projectId: 'project-2',
        userId: null,
      },
    )

    expect(shouldDeliver).toBe(false)
  })

  it('does not deliver project-scoped events to clients without the project subscription', () => {
    const shouldDeliver = shouldDeliverRealtimeEvent(
      {
        channels: new Set(['project']),
        companyId: 'company-1',
        projectIds: new Set<string>(),
        userId: null,
      },
      {
        channel: 'project',
        companyId: 'company-1',
        projectId: 'project-1',
        userId: null,
      },
    )

    expect(shouldDeliver).toBe(false)
  })

  it('filters company-scoped events by the subscribed company', () => {
    const shouldDeliver = shouldDeliverRealtimeEvent(
      {
        channels: new Set(['notifications']),
        companyId: 'company-1',
        projectIds: new Set<string>(),
        userId: null,
      },
      {
        channel: 'notifications',
        companyId: 'company-2',
        projectId: null,
        userId: null,
      },
    )

    expect(shouldDeliver).toBe(false)
  })

  it('keeps delivering global notification events to company-scope subscribers', () => {
    const shouldDeliver = shouldDeliverRealtimeEvent(
      {
        channels: new Set(['notifications']),
        companyId: 'company-1',
        projectIds: new Set<string>(),
        userId: null,
      },
      {
        channel: 'notifications',
        projectId: null,
        userId: null,
      },
    )

    expect(shouldDeliver).toBe(true)
  })

  it('does not register or deliver project events to an unauthenticated connection', async () => {
    const { socket, messages } = await connectRealtime('?channels=project&projectId=project-1&userId=user-1')

    expect(getRealtimeClientCount()).toBe(0)
    expect(broadcastRealtimeEvent({
      type: 'project.changed',
      channel: 'project',
      projectId: 'project-1',
      payload: { secret: 'not-for-anonymous' },
    })).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(messages.some((message) => message.type === 'project.changed')).toBe(false)
    socket.close()
  })

  it('rejects a signed token whose token version has been revoked', async () => {
    authMocks.getAuthUserById.mockResolvedValueOnce({
      id: 'user-1',
      auth_token_version: 2,
      password_reset_required: false,
    })
    const { socket } = await connectRealtime('?channels=project&projectId=project-1')
    const closed = once(socket, 'close')

    socket.send(JSON.stringify({ type: 'auth', token: 'revoked-token' }))

    const [code] = await closed
    expect(code).toBe(4001)
    expect(getRealtimeClientCount()).toBe(0)
  })

  it('rejects a token revoked only for the subscribed company', async () => {
    authMocks.isCompanySessionRevoked.mockResolvedValueOnce(true)
    const rejected = await connectRealtime('?channels=project&companyId=company-1&projectId=project-1')
    const rejectedClose = once(rejected.socket, 'close')
    rejected.socket.send(JSON.stringify({ type: 'auth', token: 'company-revoked-token' }))
    expect((await rejectedClose)[0]).toBe(4001)
  })

  it('closes an authenticated connection after its company session is revoked', async () => {
    const active = await connectRealtime('?channels=project&companyId=company-1&projectId=project-1')
    active.socket.send(JSON.stringify({ type: 'auth', token: 'valid-token' }))
    await waitForMessage(active.messages, 'connection.ready')

    authMocks.isCompanySessionRevoked.mockResolvedValue(true)
    const activeClose = once(active.socket, 'close')
    await revalidateRealtimeClientsNow()
    expect((await activeClose)[0]).toBe(4001)
  })

  it('registers only after current-session validation and filters requested projects', async () => {
    const { socket, messages } = await connectRealtime('?channels=project&companyId=company-1&projectId=project-1')

    socket.send(JSON.stringify({ type: 'auth', token: 'valid-token' }))
    await waitForMessage(messages, 'connection.ready')

    expect(getRealtimeClientCount()).toBe(1)
    expect(authMocks.getAuthUserById).toHaveBeenCalledWith('user-1')
    expect(authMocks.getProjectPermissionLevel).toHaveBeenCalledWith('user-1', 'project-1', 'company-1')
    expect(broadcastRealtimeEvent({
      type: 'project.changed',
      channel: 'project',
      projectId: 'project-1',
    })).toBe(1)
    await waitForMessage(messages, 'project.changed')
    socket.close()
  })

  it('starts one heartbeat loop for multiple authenticated clients', async () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    try {
      const first = await connectRealtime('?channels=project&companyId=company-1&projectId=project-1')
      first.socket.send(JSON.stringify({ type: 'auth', token: 'valid-token' }))
      await waitForMessage(first.messages, 'connection.ready')

      const second = await connectRealtime('?channels=project&companyId=company-1&projectId=project-1')
      second.socket.send(JSON.stringify({ type: 'auth', token: 'valid-token' }))
      await waitForMessage(second.messages, 'connection.ready')

      expect(setIntervalSpy.mock.calls.filter(([, delay]) => delay === 25_000)).toHaveLength(1)
      first.socket.close()
      second.socket.close()
    } finally {
      setIntervalSpy.mockRestore()
    }
  })

  it('isolates a client heartbeat error from the remaining clients', async () => {
    let heartbeat: (() => void) | null = null
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockImplementation(((callback: TimerHandler) => {
      heartbeat = callback as () => void
      return { unref: vi.fn() } as unknown as NodeJS.Timeout
    }) as typeof setInterval)
    const pingSpy = vi.spyOn(WebSocket.prototype, 'ping')
    let pingCount = 0
    pingSpy.mockImplementation(() => {
      pingCount += 1
      if (pingCount === 1) throw new Error('heartbeat ping failed')
    })

    try {
      const first = await connectRealtime('?channels=project&companyId=company-1&projectId=project-1')
      first.socket.send(JSON.stringify({ type: 'auth', token: 'valid-token' }))
      await waitForMessage(first.messages, 'connection.ready')
      const second = await connectRealtime('?channels=project&companyId=company-1&projectId=project-1')
      second.socket.send(JSON.stringify({ type: 'auth', token: 'valid-token' }))
      await waitForMessage(second.messages, 'connection.ready')

      expect(heartbeat).toEqual(expect.any(Function))
      expect(() => heartbeat!()).not.toThrow()
      expect(pingCount).toBe(2)
      expect(loggerMocks.warn).toHaveBeenCalledWith(
        'Realtime heartbeat client check failed',
        expect.objectContaining({ error: 'heartbeat ping failed' }),
      )
      first.socket.close()
      second.socket.close()
    } finally {
      pingSpy.mockRestore()
      setIntervalSpy.mockRestore()
    }
  })

  it('stops the heartbeat loop when the final authenticated client disconnects', async () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    try {
      const { socket, messages } = await connectRealtime('?channels=project&companyId=company-1&projectId=project-1')
      socket.send(JSON.stringify({ type: 'auth', token: 'valid-token' }))
      await waitForMessage(messages, 'connection.ready')
      expect(getRealtimeClientCount()).toBe(1)

      const closed = once(socket, 'close')
      socket.close()
      await closed
      await vi.waitFor(() => {
        expect(getRealtimeClientCount()).toBe(0)
      }, { timeout: 1_000 })

      expect(clearIntervalSpy).toHaveBeenCalled()
    } finally {
      clearIntervalSpy.mockRestore()
    }
  })

  it('clears the heartbeat loop during realtime server shutdown', async () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    try {
      const { socket, messages } = await connectRealtime('?channels=project&companyId=company-1&projectId=project-1')
      socket.send(JSON.stringify({ type: 'auth', token: 'valid-token' }))
      await waitForMessage(messages, 'connection.ready')

      await closeRealtimeServer()

      expect(clearIntervalSpy).toHaveBeenCalled()
      expect(getRealtimeClientCount()).toBe(0)
    } finally {
      clearIntervalSpy.mockRestore()
    }
  })

  it('removes an existing project subscription when authorization is revoked', async () => {
    const { socket, messages } = await connectRealtime('?channels=project&companyId=company-1&projectId=project-1')
    socket.send(JSON.stringify({ type: 'auth', token: 'valid-token' }))
    await waitForMessage(messages, 'connection.ready')

    authMocks.getProjectPermissionLevel.mockResolvedValue(null)
    await revalidateRealtimeClientsNow()

    expect(broadcastRealtimeEvent({
      type: 'project.changed',
      channel: 'project',
      projectId: 'project-1',
    })).toBe(0)
    socket.close()
  })
})
