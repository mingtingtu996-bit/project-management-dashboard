import { describe, expect, it } from 'vitest'

import { formatPlanningExportValue, toPlanningCsvText } from '../planningExport'
import { buildTaskExportData, toCsvText } from '../../pages/GanttView/taskExport'
import type { Task } from '../../pages/GanttViewTypes'

describe('spreadsheet export formula hardening', () => {
  it('neutralizes formula-leading values in shared planning xlsx/csv exports', () => {
    expect(formatPlanningExportValue('=HYPERLINK("http://evil.example","click")')).toBe('\'=HYPERLINK("http://evil.example","click")')
    expect(formatPlanningExportValue('+SUM(1,1)')).toBe("'+SUM(1,1)")
    expect(formatPlanningExportValue('-2+3')).toBe("'-2+3")
    expect(formatPlanningExportValue('@SUM(1,1)')).toBe("'@SUM(1,1)")
    expect(formatPlanningExportValue(' safe text ')).toBe('safe text')

    const csv = toPlanningCsvText([
      ['name', 'note'],
      ['=CMD()', '@SUM(1,1)'],
    ])

    expect(csv).toContain("'=CMD()")
    expect(csv).toContain("'@SUM(1,1)")
    expect(csv).not.toContain('\r\n=CMD()')
  })

  it('neutralizes formula-leading task fields in Gantt task exports', () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      wbs_code: '1',
      title: '=HYPERLINK("http://evil.example","click")',
      description: '@SUM(1,1)',
      assignee_name: '+admin',
      participant_unit_name: '-unit',
      status: 'todo',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } satisfies Task

    const rows = buildTaskExportData([task], {}, 'all')
    const exported = rows[1]

    expect(exported).toContain('\'=HYPERLINK("http://evil.example","click")')
    expect(exported).toContain("'@SUM(1,1)")
    expect(exported).toContain("'+admin")
    expect(exported).toContain("'-unit")

    const csv = toCsvText(rows)
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).toContain("'@SUM")
  })
})
