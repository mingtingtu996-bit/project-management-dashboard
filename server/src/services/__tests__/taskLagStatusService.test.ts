import { describe, expect, it } from 'vitest'

import {
  attachTaskLagStatus,
  attachTasksLagStatus,
  getTaskLagLevel,
  getTaskLagStatus,
} from '../taskLagStatusService.js'

describe('taskLagStatusService', () => {
  it('derives lag level and status from explicit lag fields', () => {
    expect(
      getTaskLagLevel({ status: 'pending', progress: 0, lagLevel: 'mild' }),
    ).toBe('mild')
    expect(
      getTaskLagStatus({ status: 'pending', progress: 0, lagLevel: 'mild' }),
    ).toBe('轻度滞后')

    expect(
      getTaskLagLevel({ status: 'pending', progress: 0, lagStatus: '严重滞后' }),
    ).toBe('severe')
    expect(
      getTaskLagStatus({ status: 'pending', progress: 0, lagStatus: '严重滞后' }),
    ).toBe('严重滞后')
  })

  it('attaches normalized lag fields to individual tasks and batches', () => {
    expect(
      attachTaskLagStatus({ status: 'pending', progress: 0, lagLevel: 'moderate' }),
    ).toMatchObject({
      lagLevel: 'moderate',
      lagStatus: '中度滞后',
    })

    expect(
      attachTaskLagStatus({ status: 'pending', progress: 0, lagStatus: '轻度滞后' }),
    ).toMatchObject({
      lagLevel: 'mild',
      lagStatus: '轻度滞后',
    })

    expect(
      attachTasksLagStatus([
        { status: 'pending', progress: 0, lagLevel: 'severe' },
        { status: 'pending', progress: 0, lagStatus: '正常' },
      ]),
    ).toEqual([
      { status: 'pending', progress: 0, lagLevel: 'severe', lagStatus: '严重滞后' },
      { status: 'pending', progress: 0, lagLevel: 'none', lagStatus: '正常' },
    ])
  })
})
