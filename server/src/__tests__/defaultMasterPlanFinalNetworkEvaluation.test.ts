import { describe, expect, it } from 'vitest'
import { buildCandidateNetworkEvaluationFromGeneratedDependencies } from '../services/wbsTemplateGenerationService.js'

function scheduleRow(
  id: string,
  start: string,
  end: string,
  predecessors: string[] = [],
) {
  return {
    clientRowId: id,
    parentClientRowId: null,
    sortOrder: 1,
    rowProjectionMode: 'schedule_row' as const,
    scheduleParticipation: 'primary_schedule' as const,
    predecessorClientRowIds: predecessors,
    predecessorDependencies: predecessors.map((clientRowId) => ({
      clientRowId,
      dependencyType: 'FS' as const,
      lagDays: 0,
      intentCode: 'test_final_master_plan_network',
      source: 'dependency_intent_template' as const,
    })),
    values: {
      title: id,
      planned_start_date: start,
      planned_end_date: end,
      row_projection_mode: 'schedule_row',
      schedule_participation: 'primary_schedule',
      duration_contribution_mode: 'duration_bearing',
      smart_reference_days: Math.round(
        (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
      ) + 1,
    },
  }
}

describe('final executable default master plan network evaluation', () => {
  it('derives critical rows from the final visible dependency network', () => {
    const evaluation = buildCandidateNetworkEvaluationFromGeneratedDependencies([
      scheduleRow('critical-start', '2026-01-01', '2026-01-10'),
      scheduleRow('critical-finish', '2026-01-11', '2026-01-15', ['critical-start']),
      scheduleRow('parallel-short', '2026-01-01', '2026-01-03'),
    ] as any)

    expect(evaluation).toEqual(expect.objectContaining({
      previewEdgeCount: 1,
      projectedNetworkSpanDays: 15,
      criticalGeneratedRowIds: ['critical-start', 'critical-finish'],
    }))
    expect(evaluation?.rowSchedule.find((row) => row.generatedRowId === 'parallel-short'))
      .toEqual(expect.objectContaining({ isCritical: false, totalFloatDays: 12 }))
  })
})
