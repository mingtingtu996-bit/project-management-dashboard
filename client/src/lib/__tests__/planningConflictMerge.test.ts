import { describe, expect, it } from 'vitest'

import {
  buildPlanningConflictFieldGroups,
  canAutoMergePlanningUpdate,
  getPlanningConflictFieldGroup,
  mergePlanningItemsBeforeSave,
} from '../planningConflictMerge'

describe('planningConflictMerge', () => {
  const fieldGroups = buildPlanningConflictFieldGroups([
    { key: 'title', mergeGroup: 'identity' },
    { key: 'planned_start_date', mergeGroup: 'schedule' },
    { key: 'planned_end_date', mergeGroup: 'schedule' },
    { key: 'start_date', mergeGroup: 'schedule' },
    { key: 'end_date', mergeGroup: 'schedule' },
    { key: 'responsible_unit', mergeGroup: 'responsible_unit' },
  ])

  it('auto merges when local and server changed different field groups', () => {
    const base = {
      id: 'task-1',
      title: 'Original task',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-10',
      responsible_unit: 'A',
    }

    expect(
      canAutoMergePlanningUpdate(
        base,
        { title: 'Local task name' },
        { ...base, responsible_unit: 'B' },
        { fieldGroups },
      ),
    ).toBe(true)
  })

  it('blocks automatic merge when local and server changed the same field group', () => {
    const base = {
      id: 'task-1',
      title: 'Original task',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-10',
    }

    expect(
      canAutoMergePlanningUpdate(
        base,
        { planned_start_date: '2026-04-02' },
        { ...base, planned_end_date: '2026-04-12' },
        { fieldGroups },
      ),
    ).toBe(false)
  })

  it('treats planned and current dates as one date group', () => {
    expect(getPlanningConflictFieldGroup('planned_start_date', fieldGroups)).toContain('planned_end_date')
    expect(getPlanningConflictFieldGroup('start_date', fieldGroups)).toContain('end_date')
  })

  it('returns merged items and keeps server-side unrelated changes', () => {
    const baseItems = [
      {
        id: 'row-1',
        title: 'Original task',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-10',
        responsible_unit: 'A',
      },
    ]
    const localItems = [
      {
        ...baseItems[0],
        title: 'Local task name',
      },
    ]
    const serverItems = [
      {
        ...baseItems[0],
        responsible_unit: 'B',
      },
    ]

    const result = mergePlanningItemsBeforeSave(baseItems, localItems, serverItems, { fieldGroups })

    expect(result.conflictCount).toBe(0)
    expect(result.mergedCount).toBe(1)
    expect(result.items).toEqual([
      {
        ...baseItems[0],
        title: 'Local task name',
        responsible_unit: 'B',
      },
    ])
  })

  it('reports business-row conflicts for same group edits', () => {
    const baseItems = [
      {
        id: 'row-1',
        title: 'Concrete pouring',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-10',
      },
    ]
    const localItems = [
      {
        ...baseItems[0],
        planned_start_date: '2026-04-02',
      },
    ]
    const serverItems = [
      {
        ...baseItems[0],
        planned_end_date: '2026-04-12',
      },
    ]

    const result = mergePlanningItemsBeforeSave(baseItems, localItems, serverItems, { fieldGroups })

    expect(result.conflictCount).toBe(1)
    expect(result.conflictLabels).toEqual(['Concrete pouring'])
  })

  it('keeps new server rows when local edits do not overlap', () => {
    const baseItems = [
      {
        id: 'row-1',
        title: 'Original task',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-10',
      },
    ]
    const localItems = [
      {
        ...baseItems[0],
        title: 'Local task name',
      },
    ]
    const serverItems = [
      baseItems[0],
      {
        id: 'row-2',
        title: 'Server inserted task',
        planned_start_date: '2026-04-11',
        planned_end_date: '2026-04-20',
      },
    ]

    const result = mergePlanningItemsBeforeSave(baseItems, localItems, serverItems, { fieldGroups })

    expect(result.conflictCount).toBe(0)
    expect(result.mergedCount).toBe(1)
    expect(result.items.map((item) => item.id)).toEqual(['row-1', 'row-2'])
  })

  it('reports conflicts when an edited local row was removed on the server', () => {
    const baseItems = [
      {
        id: 'row-1',
        title: 'Removed task',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-10',
      },
    ]
    const localItems = [
      {
        ...baseItems[0],
        title: 'Edited removed task',
      },
    ]

    const result = mergePlanningItemsBeforeSave(baseItems, localItems, [], { fieldGroups })

    expect(result.conflictCount).toBe(1)
    expect(result.conflictLabels).toEqual(['Edited removed task'])
  })
})
