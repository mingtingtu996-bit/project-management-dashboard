import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')
const repoRoot = resolve(serverRoot, '..')

function readServer(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

function readRepo(...segments: string[]) {
  return readFileSync(resolve(repoRoot, ...segments), 'utf8')
}

describe('v1.4-v1.4.6 participant unit hardening contracts', () => {
  it('keeps task writes on participant_unit_id and drops legacy text unit fields in the main chain', () => {
    const writeChain = readServer('src', 'services', 'taskWriteChainService.ts')
    const tasksRoute = readServer('src', 'routes', 'tasks.ts')
    const batchUpdateService = readServer('src', 'services', 'taskBatchUpdateService.ts')

    expect(writeChain).not.toContain('responsible_unit')
    expect(writeChain).not.toContain('assignee_unit')
    expect(writeChain).toContain('persistTaskParticipantUnit')
    expect(writeChain).toContain('participant_unit_id must reference an active participant unit in the current project')

    const batchRoute = tasksRoute.slice(tasksRoute.indexOf("router.post('/batch-update'"))
    expect(batchRoute).toContain('participant_unit_id: participantUnitId')
    expect(batchUpdateService).toContain('patch.participant_unit_id = input.participantUnitId ?? null')
    expect(batchUpdateService).not.toContain('patch.responsible_unit')
    expect(batchUpdateService).not.toContain('patch.assignee_unit')
  })

  it('keeps WBS route updates on participant_unit_id instead of legacy assignee_unit', () => {
    const wbsRoute = readServer('src', 'routes', 'wbs.ts')

    expect(wbsRoute).toContain('participant_unit_id: z.string().trim().optional().nullable()')
    expect(wbsRoute).toContain("'progress', 'assignee', 'participant_unit_id', 'sort_order', 'is_milestone'")
    expect(wbsRoute).not.toContain("assignee_unit: z.string().trim().optional().nullable()")
    expect(wbsRoute).not.toContain("'progress', 'assignee', 'assignee_unit'")
  })

  it('validates participant_unit_id on acceptance plans and task conditions', () => {
    const acceptanceRoute = readServer('src', 'routes', 'acceptance-plans.ts')
    const acceptanceTemplateService = readServer('src', 'services', 'acceptanceTemplateService.ts')
    const conditionsRoute = readServer('src', 'routes', 'task-conditions.ts')

    expect(acceptanceRoute).toContain('applyParticipantUnitConstraint')
    expect(acceptanceRoute).toContain('FROM participant_units WHERE id = ? AND project_id = ? LIMIT 1')
    expect(acceptanceRoute).toContain("unitStatus !== 'active'")
    expect(acceptanceRoute).toContain("'participant_unit_id'")
    expect(acceptanceTemplateService).not.toContain('responsible_unit')

    expect(conditionsRoute).toContain('validateParticipantUnitForProject')
    expect(conditionsRoute).toContain('participant_unit_id must reference an active participant unit in the current project')
    expect(conditionsRoute).toContain("participant_unit_id: 'participant_unit_id'")
  })

  it('keeps Gantt and acceptance timeline frontend writes on participant_unit_id', () => {
    const gantt = readRepo('client', 'src', 'pages', 'GanttView.tsx')
    const conditionApi = readRepo('client', 'src', 'pages', 'GanttView', 'taskConditionApi.ts')
    const conditionActions = readRepo('client', 'src', 'pages', 'GanttView', 'useGanttConditionActions.ts')
    const dialogs = readRepo('client', 'src', 'pages', 'GanttViewDialogs.tsx')
    const filters = readRepo('client', 'src', 'pages', 'GanttViewFilters.tsx')
    const acceptance = readRepo('client', 'src', 'pages', 'AcceptanceTimeline.tsx')

    expect(gantt).toContain('useGanttParticipantUnitActions({')
    expect(conditionActions).toContain('participantUnits.some((unit) => unit.id === draft.participantUnitId)')
    expect(conditionApi).toContain('if (participantUnitId) body.participant_unit_id = participantUnitId')
    expect(conditionApi).not.toContain('body.responsible_unit')

    expect(dialogs).toContain('props.participantUnits.map')
    expect(dialogs).not.toContain('placeholder="输入责任单位或部门"')
    expect(dialogs).not.toContain('<SelectItem value="__manual__">手工输入</SelectItem>')

    expect(filters).toContain('payload.participant_unit_id = participantUnitId')
    expect(filters).not.toContain('payload.responsible_unit')

    expect(acceptance).toContain('{ participant_unit_id: participantUnitId }')
    expect(acceptance).toContain('participant_unit_id: participantUnitId ===')
    expect(acceptance).not.toContain('responsible_unit: responsibleUnit')
  })

  it('keeps Gantt batch date shifting on the same dateShiftDays field at both ends', () => {
    const tasksRoute = readServer('src', 'routes', 'tasks.ts')
    const filters = readRepo('client', 'src', 'pages', 'GanttViewFilters.tsx')

    expect(tasksRoute).toContain('dateShiftDays: z.number().int().optional().nullable()')
    expect(tasksRoute).toContain('dateShiftDays,')
    expect(tasksRoute).toContain('dateShiftDays: Number(dateShiftDays ?? 0) || 0')
    expect(filters).toContain('payload.dateShiftDays = parsedShift')
    expect(filters).not.toContain('date_shift_days')
  })
})
