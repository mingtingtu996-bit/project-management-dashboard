import { describe, expect, it } from 'vitest'
import {
  buildConditionSummaryMap,
  groupConditionsByTaskId,
  selectConditionPreview,
  selectConditionsForTask,
  summarizeConditions,
} from '@/lib/taskConditions'

describe('taskConditions helpers', () => {
  const conditions = [
    { id: 'c1', task_id: 't1', title: '条件1', status: 'completed', is_satisfied: true },
    { id: 'c2', task_id: 't1', title: '条件2', status: 'pending', is_satisfied: false },
    { id: 'c3', task_id: 't2', title: '条件3', status: 'pending', is_satisfied: false },
  ]

  it('summarizeConditions counts satisfied items', () => {
    expect(summarizeConditions(conditions)).toEqual({ total: 3, satisfied: 1 })
  })

  it('buildConditionSummaryMap groups by task id', () => {
    const grouped = groupConditionsByTaskId(conditions)
    expect(buildConditionSummaryMap(grouped)).toEqual({
      t1: { total: 2, satisfied: 1 },
      t2: { total: 1, satisfied: 0 },
    })
  })

  it('selectConditionPreview prefers scoped conditions and falls back to preview', () => {
    expect(selectConditionPreview(conditions, 't1', 2).map(item => item.id)).toEqual(['c1', 'c2'])
    expect(selectConditionsForTask(conditions, 't1', 1).map(item => item.id)).toEqual(['c1'])
    expect(selectConditionPreview(conditions, null, 2).map(item => item.id)).toEqual(['c1', 'c2'])
  })
})
