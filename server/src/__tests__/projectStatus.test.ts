import { describe, expect, it } from 'vitest'

import { isProjectActiveStatus, normalizeProjectStatus } from '../utils/projectStatus.js'

describe('projectStatus helpers', () => {
  it('normalizes legacy active values to in-progress projects', () => {
    expect(normalizeProjectStatus('active')).toBe('进行中')
    expect(normalizeProjectStatus('in_progress')).toBe('进行中')
    expect(normalizeProjectStatus('进行中')).toBe('进行中')
  })

  it('treats only normalized in-progress projects as active', () => {
    expect(isProjectActiveStatus('active')).toBe(true)
    expect(isProjectActiveStatus('进行中')).toBe(true)
    expect(isProjectActiveStatus('已完成')).toBe(false)
    expect(isProjectActiveStatus('archived')).toBe(false)
  })
})
