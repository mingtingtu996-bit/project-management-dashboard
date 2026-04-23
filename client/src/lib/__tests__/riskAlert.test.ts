import { describe, expect, it } from 'vitest'
import { analyzeRisks, getRiskStatistics } from '../riskAlert'

describe('riskAlert critical path downgrade', () => {
  it('no longer tracks critical_path as a risk type', () => {
    const alerts = analyzeRisks([
      {
        id: 'task-1',
        title: '测试任务',
        status: 'in_progress',
        start_date: '2026-04-10',
        end_date: '2026-04-17',
        progress: 20,
        dependencies: [],
      } as never,
    ])

    expect(alerts.map((alert) => alert.type)).not.toContain('critical_path')
    expect(alerts.some((alert) => alert.type === 'deadline')).toBe(true)
    expect('critical_path' in getRiskStatistics(alerts).byType).toBe(false)
  })
})
