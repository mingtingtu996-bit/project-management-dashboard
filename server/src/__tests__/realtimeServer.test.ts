import { describe, expect, it } from 'vitest'

import {
  parseRealtimeSubscriptionFromRequest,
  shouldDeliverRealtimeEvent,
} from '../services/realtimeServer.js'

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

  it('keeps delivering global notification events to company-scope subscribers', () => {
    const shouldDeliver = shouldDeliverRealtimeEvent(
      {
        channels: new Set(['notifications']),
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
})
