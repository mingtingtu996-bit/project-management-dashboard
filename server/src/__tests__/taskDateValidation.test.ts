import { describe, expect, it } from 'vitest'
import {
  taskSchema,
  taskUpdateSchema,
  validateTaskDateWindow,
} from '../middleware/validation.js'

describe('task date validation', () => {
  it('requires canonical start/end dates on task creation', () => {
    const result = taskSchema.safeParse({
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      title: '主体结构施工',
      progress: 0,
      start_date: '2026-04-01',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toContain('end_date 不能为空')
  })

  it('requires the merged task window to remain valid on updates', () => {
    const result = validateTaskDateWindow(
      {
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-03-31',
      },
      { requireBothDates: true },
    )

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'planned_end_date',
          message: 'planned_end_date 不能早于 planned_start_date',
        }),
      ]),
    )
  })

  it('keeps update schema lenient for non-date patches but strict once date fields are touched', () => {
    const titleOnly = taskUpdateSchema.safeParse({ title: '更新标题', version: 2 })
    expect(titleOnly.success).toBe(true)

    const invalidDatePatch = taskUpdateSchema.safeParse({
      planned_end_date: '2026-04-10',
      version: 2,
    })

    expect(invalidDatePatch.success).toBe(false)
    expect(invalidDatePatch.error?.issues.map((issue) => issue.message)).toContain('planned_start_date 不能为空')
  })
})
