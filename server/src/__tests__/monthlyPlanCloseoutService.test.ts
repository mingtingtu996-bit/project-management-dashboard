import { describe, expect, it } from 'vitest'

import { classifyMonthlyPlanCloseout } from '../services/monthlyPlanCloseoutService.js'

describe('monthlyPlanCloseoutService', () => {
  it('classifies monthly commitments into completed, carryover, cancelled and attention buckets', () => {
    const result = classifyMonthlyPlanCloseout(
      [
        {
          id: 'item-completed',
          project_id: 'project-1',
          monthly_plan_version_id: 'plan-1',
          source_task_id: 'task-completed',
          title: 'completed item',
          target_progress: 80,
          current_progress: 40,
          sort_order: 1,
          commitment_status: 'planned',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'item-carryover',
          project_id: 'project-1',
          monthly_plan_version_id: 'plan-1',
          source_task_id: 'task-active',
          title: 'carryover item',
          target_progress: 100,
          current_progress: 30,
          sort_order: 2,
          commitment_status: 'planned',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'item-cancelled',
          project_id: 'project-1',
          monthly_plan_version_id: 'plan-1',
          source_task_id: 'task-cancelled',
          title: 'cancelled item',
          target_progress: 100,
          current_progress: 0,
          sort_order: 3,
          commitment_status: 'planned',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'item-attention',
          project_id: 'project-1',
          monthly_plan_version_id: 'plan-1',
          title: 'manual pending item',
          target_progress: 100,
          current_progress: 0,
          sort_order: 4,
          commitment_status: 'planned',
          manual_override_fields: { commitment_status: true },
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ],
      [
        { id: 'task-completed', project_id: 'project-1', title: 'done', status: 'in_progress', progress: 100, created_at: '', updated_at: '', priority: 'medium', version: 1 } as any,
        { id: 'task-active', project_id: 'project-1', title: 'active', status: 'blocked', progress: 45, created_at: '', updated_at: '', priority: 'medium', version: 1 } as any,
        { id: 'task-cancelled', project_id: 'project-1', title: 'cancelled', status: 'cancelled', progress: 0, created_at: '', updated_at: '', priority: 'medium', version: 1 } as any,
      ],
      '2026-06-01T00:00:00.000Z',
    )

    expect(result.summary).toMatchObject({
      totalCount: 4,
      processedCount: 3,
      remainingCount: 1,
      autoAdoptableCount: 3,
      completedCount: 1,
      carryoverCount: 1,
      cancelledCount: 1,
      attentionCount: 1,
    })
    expect(result.decisions.map((decision) => [decision.itemId, decision.classification])).toEqual([
      ['item-completed', 'completed'],
      ['item-carryover', 'carryover'],
      ['item-cancelled', 'cancelled'],
      ['item-attention', 'needs_attention'],
    ])
    expect(result.items.find((item) => item.id === 'item-carryover')).toMatchObject({
      commitment_status: 'carried_over',
      current_progress: 45,
      generation_metadata: expect.objectContaining({
        closeout_attention_required: true,
      }),
    })
  })
})
