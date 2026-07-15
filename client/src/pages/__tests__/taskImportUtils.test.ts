import { describe, expect, it } from 'vitest'

import { parseTaskImportFile } from '../GanttView/taskImportUtils'

describe('task import utils', () => {
  it('parses common plan columns into planning tree clipboard rows', async () => {
    const file = new File([
      [
        'WBS Code,Title,Start,End,Progress,Assignee,Unit,Scope,Milestone',
        '1,Foundation,2026-01-01,2026-01-05,0.5,Alice,General Contractor,Basement,no',
        '1.1,Foundation acceptance,2026-01-06,2026-01-06,100%,Bob,Supervision,Basement,yes',
      ].join('\n'),
    ], 'plan.csv', { type: 'text/csv' })

    const rows = await parseTaskImportFile(file)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      title: 'Foundation',
      plannedStartDate: '2026-01-01',
      plannedEndDate: '2026-01-05',
      targetProgress: 50,
      assigneeLabel: 'Alice',
      unitLabel: 'General Contractor',
      scopeLabel: 'Basement',
      depth: 1,
      isMilestone: false,
    })
    expect(rows[1]).toMatchObject({
      title: 'Foundation acceptance',
      targetProgress: 100,
      depth: 2,
      isMilestone: true,
    })
  })

  it('falls back to the first column when no title header is present', async () => {
    const file = new File([
      [
        'Task Name,Level,Progress',
        'Structure,1,25%',
      ].join('\n'),
    ], 'fallback.csv', { type: 'text/csv' })

    const rows = await parseTaskImportFile(file)

    expect(rows).toEqual([
      expect.objectContaining({
        title: 'Structure',
        depth: 1,
        targetProgress: 25,
      }),
    ])
  })
})
