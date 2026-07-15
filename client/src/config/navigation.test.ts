import { describe, expect, it } from 'vitest'

import { resolveNotificationTarget } from './navigation'

describe('resolveNotificationTarget', () => {
  it('routes progress deviation notifications to the progress deviation report view', () => {
    const target = resolveNotificationTarget({
      projectId: 'project-1',
      sourceEntityType: 'progress_deviation',
      title: '进度偏差分析提醒',
      content: '建议进入报表分析查看最新进度偏差',
    })

    expect(target).toMatchObject({
      key: 'reports',
      href: '/projects/project-1/reports?view=progress_deviation',
    })
  })
})
