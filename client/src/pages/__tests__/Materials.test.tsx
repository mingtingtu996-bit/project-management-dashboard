import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Materials from '../Materials'

const permissionState = vi.hoisted(() => ({
  canEdit: true,
  globalRole: 'regular',
}))

const materialsApiMock = vi.hoisted(() => ({
  analyzeLinkedTaskDelayRisk: vi.fn(),
  estimateLinkedTaskDuration: vi.fn(),
  getSummary: vi.fn(),
  getWeeklyDigest: vi.fn(),
  list: vi.fn(),
  listChangeLogs: vi.fn(),
  listReminders: vi.fn(),
  create: vi.fn(),
  listParticipantUnits: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: vi.fn(() => ({
    canEdit: permissionState.canEdit,
    globalRole: permissionState.globalRole,
  })),
}))

vi.mock('@/hooks/useStore', () => ({
  useCurrentProject: vi.fn(() => ({
    id: 'project-1',
    name: '示例项目',
  })),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/services/materialsApi', () => ({
  MaterialsApiService: materialsApiMock,
}))

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function setInputValue(input: HTMLInputElement, value: string) {
  const prototype = Object.getPrototypeOf(input)
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function renderPage(root: Root | null, initialEntry: string) {
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/projects/:id/materials" element={<Materials />} />
        </Routes>
      </MemoryRouter>,
    )
    await flush()
    await flush()
  })
}

describe('Materials page', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    permissionState.canEdit = true
    permissionState.globalRole = 'regular'

    materialsApiMock.list.mockResolvedValue([
      {
        id: 'material-1',
        project_id: 'project-1',
        participant_unit_id: 'unit-1',
        participant_unit_name: '幕墙单位',
        material_name: '铝型材',
        specialty_type: '幕墙',
        requires_sample_confirmation: true,
        sample_confirmed: false,
        expected_arrival_date: '2026-04-22',
        actual_arrival_date: null,
        requires_inspection: false,
        inspection_done: false,
        linked_task_id: 'task-1',
        linked_task_title: '幕墙龙骨安装',
        linked_task_start_date: '2026-04-26',
        linked_task_status: 'todo',
        linked_task_buffer_days: 4,
        version: 1,
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z',
      },
      {
        id: 'material-2',
        project_id: 'project-1',
        participant_unit_id: null,
        participant_unit_name: null,
        material_name: '电梯导轨',
        specialty_type: '电梯',
        requires_sample_confirmation: false,
        sample_confirmed: false,
        expected_arrival_date: '2026-04-18',
        actual_arrival_date: null,
        requires_inspection: false,
        inspection_done: false,
        linked_task_id: null,
        linked_task_title: null,
        linked_task_start_date: null,
        linked_task_status: null,
        linked_task_buffer_days: null,
        version: 1,
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z',
      },
      {
        id: 'material-3',
        project_id: 'project-1',
        participant_unit_id: 'unit-2',
        participant_unit_name: '机电单位',
        material_name: '风机盘管',
        specialty_type: '机电',
        requires_sample_confirmation: false,
        sample_confirmed: false,
        expected_arrival_date: '2026-04-25',
        actual_arrival_date: '2026-04-24',
        requires_inspection: true,
        inspection_done: false,
        linked_task_id: 'task-2',
        linked_task_title: '机电设备安装',
        linked_task_start_date: '2026-04-30',
        linked_task_status: 'in_progress',
        linked_task_buffer_days: 5,
        version: 1,
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z',
      },
    ])
    materialsApiMock.listParticipantUnits.mockResolvedValue([
      { id: 'unit-1', project_id: 'project-1', unit_name: '幕墙单位', unit_type: '分包' },
      { id: 'unit-2', project_id: 'project-1', unit_name: '机电单位', unit_type: '分包' },
    ])
    materialsApiMock.listReminders.mockResolvedValue([
      {
        id: 'reminder-1',
        type: 'material_arrival_reminder',
        title: '幕墙单位材料到场提醒',
        content: '铝型材预计 2026-04-22 到场，请提前确认。',
        severity: 'warning',
        created_at: '2026-04-20T09:00:00.000Z',
      },
      {
        id: 'reminder-2',
        type: 'material_arrival_overdue',
        title: '机电单位材料逾期未到',
        content: '风机盘管已逾期，请尽快核实到场时间。',
        severity: 'critical',
        created_at: '2026-04-21T09:00:00.000Z',
      },
    ])
    materialsApiMock.getWeeklyDigest.mockResolvedValue({
      id: 'digest-1',
      project_id: 'project-1',
      week_start: '2026-04-20',
      generated_at: '2026-04-22T08:30:00.000Z',
      overall_progress: 62,
      health_score: 78,
    })
    materialsApiMock.getSummary.mockResolvedValue({
      overview: {
        totalExpectedCount: 3,
        onTimeCount: 1,
        arrivalRate: 33,
      },
      byUnit: [],
      monthlyTrend: [],
    })
    materialsApiMock.estimateLinkedTaskDuration.mockResolvedValue({
      id: 'estimate-1',
      task_id: 'task-1',
      project_id: 'project-1',
      estimated_duration: 12,
      confidence_level: 'high',
      confidence_score: 0.82,
      reasoning: '基于历史同类任务估算',
    })
    materialsApiMock.analyzeLinkedTaskDelayRisk.mockResolvedValue({
      task_id: 'task-1',
      task_title: '幕墙龙骨安装',
      progress_deviation: -0.1,
      remaining_days: 5,
      obstacle_count: 1,
      delay_probability: 68,
      delay_risk: 'medium',
      risk_factors: ['工期紧张'],
      recommendations: ['制定详细的进度计划，监控每日进展'],
    })
    materialsApiMock.listChangeLogs.mockResolvedValue([
      {
        id: 'log-1',
        entity_type: 'project_material',
        entity_id: 'material-1',
        field_name: 'expected_arrival_date',
        old_value: '2026-04-18',
        new_value: '2026-04-22',
        change_reason: '材料创建',
        change_source: 'manual_adjusted',
        changed_at: '2026-04-22T09:00:00.000Z',
        changed_by: 'user-1',
      },
    ])
    materialsApiMock.create.mockImplementation(async (_projectId: string, payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      const createRecord = (item: Record<string, unknown>, index: number) => ({
        id: `created-material-${index + 1}`,
        project_id: 'project-1',
        participant_unit_id: item.participant_unit_id ?? null,
        participant_unit_name: item.participant_unit_id === 'unit-2' ? '机电单位' : item.participant_unit_id === 'unit-1' ? '幕墙单位' : null,
        material_name: item.material_name,
        specialty_type: item.specialty_type ?? null,
        requires_sample_confirmation: item.requires_sample_confirmation ?? false,
        sample_confirmed: item.sample_confirmed ?? false,
        expected_arrival_date: item.expected_arrival_date,
        actual_arrival_date: item.actual_arrival_date ?? null,
        requires_inspection: item.requires_inspection ?? false,
        inspection_done: item.inspection_done ?? false,
        linked_task_id: item.participant_unit_id === 'unit-2' ? 'task-2' : item.participant_unit_id === 'unit-1' ? 'task-1' : null,
        linked_task_title: item.participant_unit_id === 'unit-2' ? '机电设备安装' : item.participant_unit_id === 'unit-1' ? '幕墙龙骨安装' : null,
        linked_task_start_date: item.participant_unit_id === 'unit-2' ? '2026-04-30' : item.participant_unit_id === 'unit-1' ? '2026-04-26' : null,
        linked_task_status: item.participant_unit_id === 'unit-2' ? 'in_progress' : item.participant_unit_id === 'unit-1' ? 'todo' : null,
        linked_task_buffer_days: item.participant_unit_id === 'unit-2' ? 5 : item.participant_unit_id === 'unit-1' ? 4 : null,
        version: 1,
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z',
      })

      if (Array.isArray(payload)) {
        return payload.map((item, index) => createRecord(item, index))
      }

      return createRecord(payload, 0)
    })
    materialsApiMock.remove.mockResolvedValue(undefined)
    materialsApiMock.update.mockImplementation(async (_projectId: string, materialId: string, patch: Record<string, unknown>) => ({
      id: materialId,
      project_id: 'project-1',
      participant_unit_id: patch.participant_unit_id ?? (materialId === 'material-3' ? 'unit-2' : 'unit-1'),
      participant_unit_name: (patch.participant_unit_id ?? (materialId === 'material-3' ? 'unit-2' : 'unit-1')) === 'unit-2' ? '机电单位' : '幕墙单位',
      material_name: patch.material_name ?? (materialId === 'material-3' ? '风机盘管' : '铝型材'),
      specialty_type: patch.specialty_type ?? (materialId === 'material-3' ? '机电' : '幕墙'),
      requires_sample_confirmation: patch.requires_sample_confirmation ?? (materialId === 'material-3' ? false : true),
      sample_confirmed: patch.sample_confirmed ?? false,
      expected_arrival_date: patch.expected_arrival_date ?? (materialId === 'material-3' ? '2026-04-25' : '2026-04-22'),
      actual_arrival_date: patch.actual_arrival_date ?? (materialId === 'material-3' ? '2026-04-24' : null),
      requires_inspection: patch.requires_inspection ?? (materialId === 'material-3'),
      inspection_done: patch.inspection_done ?? false,
      linked_task_id: materialId === 'material-3' ? 'task-2' : 'task-1',
      linked_task_title: materialId === 'material-3' ? '机电设备安装' : '幕墙龙骨安装',
      linked_task_start_date: materialId === 'material-3' ? '2026-04-30' : '2026-04-26',
      linked_task_status: materialId === 'material-3' ? 'in_progress' : 'todo',
      linked_task_buffer_days: materialId === 'material-3' ? 5 : 4,
      version: 2,
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z',
    }))
  })

  afterEach(() => {
    root?.unmount()
    container.remove()
    root = null
    vi.clearAllMocks()
  })

  it('renders grouped materials and shows the unassigned banner', async () => {
    await renderPage(root, '/projects/project-1/materials')

    expect(container.textContent).toContain('材料管控')
    expect(container.textContent).toContain('周报摘要')
    expect(container.textContent).toContain('提醒列表')
    expect(container.textContent).toContain('幕墙单位材料到场提醒')
    expect(container.textContent).toContain('幕墙单位')
    expect(container.textContent).toContain('无归属单位')
    expect(container.textContent).toContain('以下材料所属分包商已删除，请重新关联')
    expect(container.textContent).toContain('铝型材')
    expect(container.textContent).toContain('电梯导轨')
    expect(container.textContent).toContain('关联任务：幕墙龙骨安装')
  })

  it('filters materials by search keyword', async () => {
    await renderPage(root, '/projects/project-1/materials')

    const searchInput = container.querySelector('[data-testid="materials-search-input"]') as HTMLInputElement | null
    expect(searchInput).not.toBeNull()

    await act(async () => {
      if (searchInput) {
        setInputValue(searchInput, '风机')
      }
      await flush()
      await flush()
    })

    expect(container.querySelector('[data-testid="material-detail-trigger-material-3"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="material-detail-trigger-material-1"]')).toBeNull()
    expect(container.querySelector('[data-testid="material-detail-trigger-material-2"]')).toBeNull()
  })

  it('respects the unit query filter', async () => {
    await renderPage(root, '/projects/project-1/materials?unit=__unassigned__')

    expect(container.querySelector('[data-testid="material-detail-trigger-material-2"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="material-detail-trigger-material-1"]')).toBeNull()
    expect(container.querySelector('[data-testid="material-detail-trigger-material-3"]')).toBeNull()
  })

  it('hides create controls in read only mode', async () => {
    permissionState.canEdit = false
    permissionState.globalRole = 'company_admin'

    await renderPage(root, '/projects/project-1/materials')

    expect(container.textContent).not.toContain('单条新增')
    expect(container.textContent).not.toContain('模板预填')
    expect(container.textContent).not.toContain('批量录入')
  })

  it('opens the detail dialog and saves changes', async () => {
    await renderPage(root, '/projects/project-1/materials')

    const trigger = container.querySelector('[data-testid="material-detail-trigger-material-1"]') as HTMLButtonElement | null
    expect(trigger).not.toBeNull()

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const dialog = document.body.querySelector('[data-testid="material-detail-dialog"]') as HTMLElement | null
    expect(dialog).not.toBeNull()

    const nameInput = document.body.querySelector('[data-testid="material-detail-name-input"]') as HTMLInputElement | null
    const saveButton = document.body.querySelector('[data-testid="material-detail-save"]') as HTMLButtonElement | null
    expect(nameInput?.value).toBe('铝型材')
    expect(saveButton).not.toBeNull()

    await act(async () => {
      if (nameInput) {
        setInputValue(nameInput, '铝型材-复核')
      }
      await flush()
    })

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
      await flush()
    })

    expect(materialsApiMock.update).toHaveBeenCalledWith(
      'project-1',
      'material-1',
      expect.objectContaining({
        material_name: '铝型材-复核',
      }),
    )
  })

  it('shows material change logs in the detail dialog', async () => {
    await renderPage(root, '/projects/project-1/materials')

    const trigger = container.querySelector('[data-testid="material-detail-trigger-material-1"]') as HTMLButtonElement | null
    expect(trigger).not.toBeNull()

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
      await flush()
    })

    expect(materialsApiMock.listChangeLogs).toHaveBeenCalledWith('project-1', 'material-1')
    expect(document.body.textContent).toContain('变更日志')
    expect(document.body.textContent).toContain('预计到场日期')
    expect(document.body.textContent).toContain('材料创建')
  })

  it('loads AI suggestions and applies the suggested arrival date', async () => {
    await renderPage(root, '/projects/project-1/materials')

    const trigger = container.querySelector('[data-testid="material-detail-trigger-material-1"]') as HTMLButtonElement | null
    expect(trigger).not.toBeNull()

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
      await flush()
    })

    const fetchButton = document.body.querySelector('[data-testid="materials-ai-fetch"]') as HTMLButtonElement | null
    expect(fetchButton).not.toBeNull()

    await act(async () => {
      fetchButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
      await flush()
    })

    expect(materialsApiMock.estimateLinkedTaskDuration).toHaveBeenCalledWith('project-1', 'task-1')
    expect(materialsApiMock.analyzeLinkedTaskDelayRisk).toHaveBeenCalledWith('task-1')
    expect(document.body.textContent).toContain('AI 工期估算：12 天')
    expect(document.body.textContent).toContain('建议预计到场日：2026-04-20')

    const adoptButton = document.body.querySelector('[data-testid="materials-ai-adopt"]') as HTMLButtonElement | null
    expect(adoptButton).not.toBeNull()

    await act(async () => {
      adoptButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
      await flush()
    })

    expect(materialsApiMock.update).toHaveBeenCalledWith(
      'project-1',
      'material-1',
      expect.objectContaining({
        expected_arrival_date: '2026-04-20',
        change_reason: '采纳 AI 排程建议',
      }),
    )
  })

  it('only shows sample and inspection completion toggles when the requirement is enabled', async () => {
    await renderPage(root, '/projects/project-1/materials')

    expect(container.querySelector('[data-testid="material-inline-sample-confirmed-material-1"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="material-inline-inspection-done-material-1"]')).toBeNull()
    expect(container.querySelector('[data-testid="material-inline-sample-confirmed-material-2"]')).toBeNull()
    expect(container.querySelector('[data-testid="material-inline-inspection-done-material-2"]')).toBeNull()
    expect(container.querySelector('[data-testid="material-inline-sample-confirmed-material-3"]')).toBeNull()
    expect(container.querySelector('[data-testid="material-inline-inspection-done-material-3"]')).not.toBeNull()

    const noRequirementTrigger = container.querySelector('[data-testid="material-detail-trigger-material-2"]') as HTMLButtonElement | null
    expect(noRequirementTrigger).not.toBeNull()

    await act(async () => {
      noRequirementTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(document.body.querySelector('[data-testid="material-detail-sample-confirmed-toggle"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="material-detail-inspection-done-toggle"]')).toBeNull()

    const cancelButton = document.body.querySelector('[data-testid="material-detail-cancel"]') as HTMLButtonElement | null
    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const inspectionTrigger = container.querySelector('[data-testid="material-detail-trigger-material-3"]') as HTMLButtonElement | null
    expect(inspectionTrigger).not.toBeNull()

    await act(async () => {
      inspectionTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(document.body.querySelector('[data-testid="material-detail-sample-confirmed-toggle"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="material-detail-inspection-done-toggle"]')).not.toBeNull()
  })

  it('creates materials from template mode with template-derived flags', async () => {
    await renderPage(root, '/projects/project-1/materials')

    const templateModeButton = container.querySelector('[data-testid="materials-create-mode-template"]') as HTMLButtonElement | null
    expect(templateModeButton).not.toBeNull()

    await act(async () => {
      templateModeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const unitSelect = container.querySelector('[data-testid="materials-template-unit"]') as HTMLSelectElement | null
    const dateInput = container.querySelector('[data-testid="materials-template-arrival-date"]') as HTMLInputElement | null
    const aluminiumCheckbox = container.querySelector('[data-testid="materials-template-item-幕墙-铝型材"]') as HTMLInputElement | null
    const glassCheckbox = container.querySelector('[data-testid="materials-template-item-幕墙-Low-E 玻璃"]') as HTMLInputElement | null
    const submitButton = container.querySelector('[data-testid="materials-template-submit"]') as HTMLButtonElement | null

    expect(unitSelect).not.toBeNull()
    expect(dateInput).not.toBeNull()
    expect(aluminiumCheckbox).not.toBeNull()
    expect(glassCheckbox).not.toBeNull()
    expect(submitButton).not.toBeNull()

    await act(async () => {
      if (unitSelect) {
        setInputValue(unitSelect as unknown as HTMLInputElement, 'unit-1')
      }
      if (dateInput) {
        setInputValue(dateInput, '2026-04-26')
      }
      aluminiumCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      glassCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
      await flush()
    })

    expect(materialsApiMock.create).toHaveBeenCalledWith(
      'project-1',
      expect.arrayContaining([
        expect.objectContaining({
          material_name: '铝型材',
          specialty_type: '幕墙',
          participant_unit_id: 'unit-1',
          expected_arrival_date: '2026-04-26',
          requires_sample_confirmation: true,
          requires_inspection: false,
        }),
        expect.objectContaining({
          material_name: 'Low-E 玻璃',
          specialty_type: '幕墙',
          participant_unit_id: 'unit-1',
          expected_arrival_date: '2026-04-26',
          requires_sample_confirmation: true,
          requires_inspection: true,
        }),
      ]),
    )
  })

  it('supports batch row add, delete, clear, and submit', async () => {
    await renderPage(root, '/projects/project-1/materials')

    const batchModeButton = container.querySelector('[data-testid="materials-create-mode-batch"]') as HTMLButtonElement | null
    expect(batchModeButton).not.toBeNull()

    await act(async () => {
      batchModeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const getBatchRows = () => [...container.querySelectorAll('[data-testid^="materials-batch-row-"]')]
    const getRowId = (row: Element) => row.getAttribute('data-testid')?.replace('materials-batch-row-', '') ?? ''

    expect(getBatchRows()).toHaveLength(1)

    const addRowButton = container.querySelector('[data-testid="materials-batch-add-row"]') as HTMLButtonElement | null
    expect(addRowButton).not.toBeNull()

    await act(async () => {
      addRowButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(getBatchRows()).toHaveLength(2)

    const [firstRow, secondRow] = getBatchRows()
    const firstRowId = getRowId(firstRow)
    const secondRowId = getRowId(secondRow)
    const firstNameInput = container.querySelector(`[data-testid="materials-batch-name-${firstRowId}"]`) as HTMLInputElement | null
    const secondNameInput = container.querySelector(`[data-testid="materials-batch-name-${secondRowId}"]`) as HTMLInputElement | null

    await act(async () => {
      if (firstNameInput) setInputValue(firstNameInput, 'batch-material-1')
      if (secondNameInput) setInputValue(secondNameInput, 'batch-material-2')
      await flush()
    })

    const secondDeleteButton = container.querySelector(`[data-testid="materials-batch-delete-${secondRowId}"]`) as HTMLButtonElement | null
    expect(secondDeleteButton).not.toBeNull()

    await act(async () => {
      secondDeleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(getBatchRows()).toHaveLength(1)
    expect((container.querySelector(`[data-testid="materials-batch-name-${firstRowId}"]`) as HTMLInputElement | null)?.value).toBe('batch-material-1')

    await act(async () => {
      addRowButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const clearButton = container.querySelector('[data-testid="materials-batch-clear"]') as HTMLButtonElement | null
    expect(clearButton).not.toBeNull()

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(getBatchRows()).toHaveLength(1)
    const clearedRowId = getRowId(getBatchRows()[0])
    expect((container.querySelector(`[data-testid="materials-batch-name-${clearedRowId}"]`) as HTMLInputElement | null)?.value).toBe('')

    await act(async () => {
      addRowButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const [submitRowOne, submitRowTwo] = getBatchRows()
    const submitRowOneId = getRowId(submitRowOne)
    const submitRowTwoId = getRowId(submitRowTwo)

    await act(async () => {
      setInputValue(container.querySelector(`[data-testid="materials-batch-name-${submitRowOneId}"]`) as HTMLInputElement, 'batch-submit-1')
      setInputValue(container.querySelector(`[data-testid="materials-batch-specialty-${submitRowOneId}"]`) as HTMLInputElement, '幕墙')
      setInputValue(container.querySelector(`[data-testid="materials-batch-date-${submitRowOneId}"]`) as HTMLInputElement, '2026-04-27')
      ;(container.querySelector(`[data-testid="materials-batch-sample-${submitRowOneId}"]`) as HTMLInputElement | null)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      setInputValue(container.querySelector(`[data-testid="materials-batch-name-${submitRowTwoId}"]`) as HTMLInputElement, 'batch-submit-2')
      setInputValue(container.querySelector(`[data-testid="materials-batch-specialty-${submitRowTwoId}"]`) as HTMLInputElement, '机电')
      setInputValue(container.querySelector(`[data-testid="materials-batch-date-${submitRowTwoId}"]`) as HTMLInputElement, '2026-04-28')
      ;(container.querySelector(`[data-testid="materials-batch-inspection-${submitRowTwoId}"]`) as HTMLInputElement | null)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const submitButton = container.querySelector('[data-testid="materials-batch-submit"]') as HTMLButtonElement | null
    expect(submitButton).not.toBeNull()

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
      await flush()
    })

    expect(materialsApiMock.create).toHaveBeenCalledWith(
      'project-1',
      [
        expect.objectContaining({
          material_name: 'batch-submit-1',
          specialty_type: '幕墙',
          expected_arrival_date: '2026-04-27',
          requires_sample_confirmation: true,
          requires_inspection: false,
        }),
        expect.objectContaining({
          material_name: 'batch-submit-2',
          specialty_type: '机电',
          expected_arrival_date: '2026-04-28',
          requires_sample_confirmation: false,
          requires_inspection: true,
        }),
      ],
    )
  })
})
