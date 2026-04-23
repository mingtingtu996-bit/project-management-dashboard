import { describe, expect, it } from 'vitest'

import { buildRealtimeWebSocketUrl, isRealtimeNotificationEvent } from '../realtime'

describe('realtime helpers', () => {
  it('builds a websocket URL against the local API server during Vite dev', () => {
    const url = buildRealtimeWebSocketUrl(
      {
        projectId: 'project-1',
        userId: 'user-1',
      },
      {
        protocol: 'http:',
        hostname: 'localhost',
        host: 'localhost:5173',
        port: '5173',
      } as Location,
    )

    expect(url).toBe('ws://localhost:3001/ws?channels=notifications%2Cproject&projectId=project-1&userId=user-1')
  })

  it('matches company scope notification events without a project filter', () => {
    expect(isRealtimeNotificationEvent({
      type: 'notification.changed',
      channel: 'notifications',
      timestamp: '2026-04-19T10:00:00.000Z',
    })).toBe(true)
  })

  it('ignores notification events from other projects when project scope is active', () => {
    expect(isRealtimeNotificationEvent({
      type: 'notification.changed',
      channel: 'notifications',
      projectId: 'project-2',
      timestamp: '2026-04-19T10:00:00.000Z',
    }, 'project-1')).toBe(false)
  })
})
