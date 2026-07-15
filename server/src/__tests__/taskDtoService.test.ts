import { describe, expect, it } from 'vitest'
import { sanitizeTaskForClient } from '../services/taskDtoService.js'

describe('taskDtoService critical path projection fields', () => {
  it('keeps CPM task projection fields in read DTOs for downstream engines', () => {
    const task = sanitizeTaskForClient({
      id: 'task-1',
      title: 'Structure work',
      is_critical: true,
      total_float_days: 0,
      free_float_days: 0,
      criticality_weight: 1.35,
      task_code: 'legacy-task-code',
    })

    expect(task).toMatchObject({
      id: 'task-1',
      is_critical: true,
      total_float_days: 0,
      free_float_days: 0,
      criticality_weight: 1.35,
    })
    expect(task).not.toHaveProperty('task_code')
  })

  it('strips deleted scope-object technical fields from ordinary task read DTOs', () => {
    const task = sanitizeTaskForClient({
      id: 'task-legacy-scope',
      title: 'Legacy scope task',
      physical_zone_object_id: 'physical-zone-1',
      zone_object_id: 'legacy-zone-1',
      professional_object_id: 'legacy-professional-1',
      scope_dimensions: [{ type: 'zone', value: 'A区' }],
      project_scope_dimensions: [{ type: 'professional', value: '机电' }],
      legacy_object_type: 'zone',
    })

    expect(task).toMatchObject({
      id: 'task-legacy-scope',
      physical_zone_object_id: 'physical-zone-1',
    })
    expect(task).not.toHaveProperty('zone_object_id')
    expect(task).not.toHaveProperty('professional_object_id')
    expect(task).not.toHaveProperty('scope_dimensions')
    expect(task).not.toHaveProperty('project_scope_dimensions')
    expect(task).not.toHaveProperty('legacy_object_type')
  })

  it('promotes generated duration P20/P50/P80 risk range from metadata into task read DTOs', () => {
    const task = sanitizeTaskForClient({
      id: 'task-duration-risk',
      title: '主体结构施工',
      standard_task_metadata: {
        durationSuggestion: {
          riskP20DurationDays: 210,
          riskP50DurationDays: 240,
          riskP80DurationDays: 285,
          durationRiskRange: {
            p20Days: 210,
            p50Days: 240,
            p80Days: 285,
            source: 'standard_work_duration_seed+t2_division_rhythm_template',
          },
        },
      },
    })

    expect(task).toMatchObject({
      duration_risk_p20_days: 210,
      duration_risk_p50_days: 240,
      duration_risk_p80_days: 285,
      duration_risk_range: {
        p20_days: 210,
        p50_days: 240,
        p80_days: 285,
        source: 'standard_work_duration_seed+t2_division_rhythm_template',
      },
    })
  })
})
