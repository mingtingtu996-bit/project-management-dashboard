import { describe, expect, it } from 'vitest'
import { isActiveObstacle } from '../obstacleStatus.js'

describe('obstacleStatus utilities', () => {
  it('uses explicit resolution flags before status labels', () => {
    expect(isActiveObstacle({ is_resolved: 1, status: 'active' })).toBe(false)
    expect(isActiveObstacle({ is_resolved: 0, status: 'resolved' })).toBe(true)
  })

  it('treats resolved, closed, and Chinese resolved labels as inactive', () => {
    expect(isActiveObstacle({ status: 'active' })).toBe(true)
    expect(isActiveObstacle({ status: 'resolved' })).toBe(false)
    expect(isActiveObstacle({ status: 'closed' })).toBe(false)
    expect(isActiveObstacle({ status: '已解决' })).toBe(false)
  })
})
