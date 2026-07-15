import { describe, expect, it } from 'vitest'

import { detectProgressAnomalySignals, detectProgressQualitySignals } from '../services/progressAnomalyService.js'

describe('progressAnomalyService', () => {
  it('detects month-end burst, progress jump, and stuck finishing signals', () => {
    const burstAndJump = detectProgressAnomalySignals([
      { task_id: 'task-1', progress: 20, snapshot_date: '2026-05-27', created_at: '2026-05-27T08:00:00.000Z' },
      { task_id: 'task-1', progress: 82, snapshot_date: '2026-05-29', created_at: '2026-05-29T08:00:00.000Z' },
    ])

    expect(burstAndJump.map((signal) => signal.code).sort()).toEqual(['month_end_burst', 'progress_jump'])
    expect(burstAndJump.every((signal) => signal.confidenceAction === 'confidence_only')).toBe(true)
    expect(burstAndJump.every((signal) => signal.excludedFromVelocityLearning)).toBe(true)

    const stuck = detectProgressAnomalySignals([
      { task_id: 'task-2', progress: 90, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z' },
      { task_id: 'task-2', progress: 90, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ])

    expect(stuck).toHaveLength(1)
    expect(stuck[0]).toMatchObject({
      code: 'stuck_finishing',
      severity: 'warning',
      excludedFromVelocityLearning: true,
    })
  })

  it('keeps acknowledged anomalies visible but marked as acknowledged', () => {
    const signals = detectProgressAnomalySignals([
      { task_id: 'task-1', progress: 10, snapshot_date: '2026-05-28', created_at: '2026-05-28T08:00:00.000Z' },
      { task_id: 'task-1', progress: 70, snapshot_date: '2026-05-29', created_at: '2026-05-29T08:00:00.000Z', notes: 'confirmed by site manager' },
    ])

    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((signal) => signal.acknowledged)).toBe(true)
  })

  it('treats month-end weekend days as effective construction days', () => {
    const signals = detectProgressAnomalySignals([
      { task_id: 'task-1', progress: 20, snapshot_date: '2026-05-28', created_at: '2026-05-28T08:00:00.000Z' },
      { task_id: 'task-1', progress: 58, snapshot_date: '2026-05-30', created_at: '2026-05-30T08:00:00.000Z' },
    ])

    expect(signals.some((signal) => signal.code === 'month_end_burst')).toBe(true)
    expect(signals.find((signal) => signal.code === 'month_end_burst')?.summary).toContain('effective construction days')
  })

  it('detects structured progress quality signals beyond classic anomalies', () => {
    const lowSourceSignals = detectProgressQualitySignals([
      { task_id: 'task-low', progress: 20, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z', event_source: 'excel_import' },
      { task_id: 'task-low', progress: 35, snapshot_date: '2026-05-02', created_at: '2026-05-02T08:00:00.000Z', event_source: 'batch_update' },
    ])
    expect(lowSourceSignals.some((signal) => signal.code === 'source_low_confidence')).toBe(true)

    const rollbackSignals = detectProgressQualitySignals([
      { task_id: 'task-rollback', progress: 70, snapshot_date: '2026-05-03', created_at: '2026-05-03T08:00:00.000Z', event_source: 'manual' },
      { task_id: 'task-rollback', progress: 45, snapshot_date: '2026-05-04', created_at: '2026-05-04T08:00:00.000Z', event_source: 'manual' },
    ])
    expect(rollbackSignals.find((signal) => signal.code === 'progress_rollback')).toMatchObject({
      severity: 'critical',
      excludedFromVelocityLearning: true,
    })

    const duplicateSignals = detectProgressQualitySignals([
      { task_id: 'task-duplicate', progress: 45, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z', event_source: 'manual' },
      { task_id: 'task-duplicate', progress: 45, snapshot_date: '2026-05-03', created_at: '2026-05-03T08:00:00.000Z', event_source: 'manual' },
      { task_id: 'task-duplicate', progress: 45, snapshot_date: '2026-05-06', created_at: '2026-05-06T08:00:00.000Z', event_source: 'manual' },
    ])
    expect(duplicateSignals.find((signal) => signal.code === 'duplicate_progress_fill')).toMatchObject({
      severity: 'warning',
      excludedFromVelocityLearning: false,
    })
  })
})
