import { describe, expect, it } from 'vitest'

import { buildRiskPipelineStages } from '../services/riskStatisticsService.js'

describe('risk statistics pipeline stages', () => {
  it('maps risk status values into the four disposal pipeline stages', () => {
    expect(buildRiskPipelineStages([
      { status: 'identified' },
      { status: '已识别' },
      { status: 'assessed' },
      { status: 'mitigating' },
      { status: '处理中' },
      { status: 'closed' },
      { status: 'monitoring' },
      { status: 'unexpected-future-status' },
    ])).toEqual({
      identified: 3,
      assessed: 1,
      responded: 2,
      monitored: 2,
    })
  })

  it('keeps the empty-state pipeline stage shape stable for frontend charts', () => {
    expect(buildRiskPipelineStages([])).toEqual({
      identified: 0,
      assessed: 0,
      responded: 0,
      monitored: 0,
    })
  })
})
