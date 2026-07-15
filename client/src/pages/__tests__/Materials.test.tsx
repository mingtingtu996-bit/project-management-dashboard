import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Materials from '../Materials'
import { MATERIAL_TEMPLATE_GROUPS } from '@/lib/materialTemplates'
import type { ProjectMaterialRecord } from '@/services/materialsApi'

const permissionState = vi.hoisted(() => ({
  canEdit: true,
  globalRole: 'regular',
}))

const materialsApiMock = vi.hoisted(() => ({
  analyzeLinkedTaskDelayRisk: vi.fn(),
  getSystemArrivalSuggestion: vi.fn(),
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
    name: 'Demo Project',
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

function click(element: Element | null) {
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

async function renderPage(root: Root | null, initialEntry = '/projects/project-1/materials') {
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

const materialOne: ProjectMaterialRecord = {
  id: 'material-1',
  project_id: 'project-1',
  participant_unit_id: 'unit-1',
  participant_unit_name: 'Facade Subcontractor',
  material_name: 'Aluminium profile',
  specialty_type: 'facade',
  requires_sample_confirmation: true,
  sample_confirmed: false,
  expected_arrival_date: '2026-04-22',
  actual_arrival_date: null,
  requires_inspection: false,
  inspection_done: false,
  linked_task_id: 'task-1',
  linked_task_title: 'Facade frame installation',
  linked_task_start_date: '2026-04-26',
  linked_task_status: 'todo',
  linked_task_buffer_days: 4,
  version: 1,
  created_at: '2026-04-19T00:00:00.000Z',
  updated_at: '2026-04-19T00:00:00.000Z',
}

const materialTwo: ProjectMaterialRecord = {
  id: 'material-2',
  project_id: 'project-1',
  participant_unit_id: null,
  participant_unit_name: null,
  material_name: 'Elevator guide rail',
  specialty_type: 'elevator',
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
}

const materialThree: ProjectMaterialRecord = {
  id: 'material-3',
  project_id: 'project-1',
  participant_unit_id: 'unit-2',
  participant_unit_name: 'MEP Subcontractor',
  material_name: 'Fan coil unit',
  specialty_type: 'mep',
  requires_sample_confirmation: false,
  sample_confirmed: false,
  expected_arrival_date: '2026-04-25',
  actual_arrival_date: '2026-04-24',
  requires_inspection: true,
  inspection_done: false,
  linked_task_id: 'task-2',
  linked_task_title: 'MEP equipment installation',
  linked_task_start_date: '2026-04-30',
  linked_task_status: 'in_progress',
  linked_task_buffer_days: 5,
  version: 1,
  created_at: '2026-04-19T00:00:00.000Z',
  updated_at: '2026-04-19T00:00:00.000Z',
}

function makeMaterial(overrides: Partial<ProjectMaterialRecord>): ProjectMaterialRecord {
  return {
    ...materialOne,
    id: 'created-material',
    material_name: 'Created material',
    participant_unit_id: null,
    participant_unit_name: null,
    specialty_type: 'general',
    requires_sample_confirmation: false,
    sample_confirmed: false,
    expected_arrival_date: '2026-04-27',
    actual_arrival_date: null,
    requires_inspection: false,
    inspection_done: false,
    linked_task_id: null,
    linked_task_title: null,
    linked_task_start_date: null,
    linked_task_status: null,
    linked_task_buffer_days: null,
    version: 1,
    ...overrides,
  }
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

    materialsApiMock.list.mockResolvedValue([materialOne, materialTwo, materialThree])
    materialsApiMock.listParticipantUnits.mockResolvedValue([
      { id: 'unit-1', project_id: 'project-1', unit_name: 'Facade Subcontractor', unit_type: 'subcontractor' },
      { id: 'unit-2', project_id: 'project-1', unit_name: 'MEP Subcontractor', unit_type: 'subcontractor' },
    ])
    materialsApiMock.listReminders.mockResolvedValue([
      {
        id: 'reminder-1',
        type: 'material_arrival_reminder',
        title: 'Facade material arrival reminder',
        content: 'Aluminium profile is expected on 2026-04-22.',
        severity: 'warning',
        created_at: '2026-04-20T09:00:00.000Z',
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
      byCategory: [
        { category: 'steel', count: 1, percentage: 33 },
        { category: 'pipe', count: 1, percentage: 33 },
      ],
      monthlyTrend: [],
    })
    materialsApiMock.getSystemArrivalSuggestion.mockResolvedValue({
      id: 'estimate-1',
      task_id: 'task-1',
      project_id: 'project-1',
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      recommendedDurationDays: 12,
      contextualReferenceDays: 12,
      confidence_level: 'high',
      confidence_score: 0.82,
      reasoning: 'Based on similar tasks.',
    })
    materialsApiMock.analyzeLinkedTaskDelayRisk.mockResolvedValue({
      task_id: 'task-1',
      task_title: 'Facade frame installation',
      progress_deviation: -0.1,
      durationOutputCode: 'remaining_forecast',
      durationOutputSemanticFieldName: 'remainingForecastDays',
      remainingForecastDays: 5,
      obstacle_count: 1,
      delay_probability: 68,
      delay_risk: 'medium',
      risk_factors: ['tight schedule'],
      recommendations: ['confirm daily progress'],
    })
    materialsApiMock.listChangeLogs.mockResolvedValue([])
    materialsApiMock.create.mockImplementation(async (_projectId: string, payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      const createRecord = (item: Record<string, unknown>, index: number) => makeMaterial({
        id: `created-material-${index + 1}`,
        participant_unit_id: (item.participant_unit_id as string | null | undefined) ?? null,
        participant_unit_name: item.participant_unit_id === 'unit-2' ? 'MEP Subcontractor' : item.participant_unit_id === 'unit-1' ? 'Facade Subcontractor' : null,
        material_name: String(item.material_name ?? ''),
        specialty_type: (item.specialty_type as string | null | undefined) ?? null,
        expected_arrival_date: String(item.expected_arrival_date ?? '2026-04-27'),
        requires_sample_confirmation: Boolean(item.requires_sample_confirmation),
        requires_inspection: Boolean(item.requires_inspection),
      })

      return Array.isArray(payload)
        ? payload.map((item, index) => createRecord(item, index))
        : createRecord(payload, 0)
    })
    materialsApiMock.remove.mockResolvedValue(undefined)
    materialsApiMock.update.mockImplementation(async (_projectId: string, materialId: string, patch: Record<string, unknown>) => {
      const base = materialId === 'material-3' ? materialThree : materialOne
      return makeMaterial({
        ...base,
        ...patch,
        id: materialId,
        version: base.version + 1,
        updated_at: '2026-04-20T00:00:00.000Z',
      } as Partial<ProjectMaterialRecord>)
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container.remove()
    root = null
    vi.clearAllMocks()
  })

  it('renders grouped materials with final scope semantics only', async () => {
    await renderPage(root)

    expect(container.querySelector('[data-testid="materials-page"]')?.className).toContain('page-shell')
    expect(container.querySelectorAll('[data-testid^="materials-metric-"]')).toHaveLength(4)
    expect(container.querySelector('[data-testid="materials-side-panel"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="materials-category-pie"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="materials-table-row-material-1"]')?.className).toContain('even:bg-slate-50/50')
    expect(container.querySelector('[data-testid="materials-table-row-material-1"]')?.className).toContain('hover:bg-slate-100/60')
    expect(container.textContent).toContain('Facade Subcontractor')
    expect(container.textContent).toContain('Aluminium profile')
    expect(container.textContent).toContain('facade')
    expect(container.textContent).not.toContain('professional_object_id')
  })

  it('filters materials by search keyword and unit query', async () => {
    await renderPage(root)

    const searchInput = container.querySelector('[data-testid="materials-search-input"]') as HTMLInputElement | null
    expect(searchInput).not.toBeNull()

    await act(async () => {
      if (searchInput) setInputValue(searchInput, 'Fan coil')
      await flush()
      await flush()
    })

    expect(container.querySelector('[data-testid="material-detail-trigger-material-3"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="material-detail-trigger-material-1"]')).toBeNull()

    root?.unmount()
    root = createRoot(container)
    await renderPage(root, '/projects/project-1/materials?unit=__unassigned__')

    expect(container.querySelector('[data-testid="material-detail-trigger-material-2"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="material-detail-trigger-material-1"]')).toBeNull()
  })

  it('hides create controls in read-only mode', async () => {
    permissionState.canEdit = false
    permissionState.globalRole = 'company_admin'

    await renderPage(root)

    expect(container.querySelector('[data-testid="materials-create-mode-single"]')).toBeNull()
    expect(container.querySelector('[data-testid="materials-create-mode-template"]')).toBeNull()
    expect(container.querySelector('[data-testid="materials-create-mode-batch"]')).toBeNull()
  })

  it('confirms deletion before removing a material', async () => {
    await renderPage(root)

    await act(async () => {
      click(container.querySelector('[data-testid="material-delete-trigger-material-1"]'))
      await flush()
    })

    const confirmDialog = document.body.querySelector('[data-testid="materials-delete-confirm-dialog"]')
    expect(confirmDialog).not.toBeNull()
    expect(confirmDialog?.textContent).toContain('Aluminium profile')
    expect(materialsApiMock.remove).not.toHaveBeenCalled()

    const confirmButton = [...(confirmDialog?.querySelectorAll('button') ?? [])]
      .at(-1) as HTMLButtonElement | undefined
    expect(confirmButton).toBeTruthy()

    await act(async () => {
      click(confirmButton ?? null)
      await flush()
      await flush()
    })

    expect(materialsApiMock.remove).toHaveBeenCalledWith('project-1', 'material-1')
  })

  it('opens the detail dialog and saves specialty_type without legacy professional object fields', async () => {
    await renderPage(root)

    await act(async () => {
      click(container.querySelector('[data-testid="material-detail-trigger-material-1"]'))
      await flush()
    })

    const dialog = document.body.querySelector('[data-testid="material-detail-dialog"]') as HTMLElement | null
    const nameInput = document.body.querySelector('[data-testid="material-detail-name-input"]') as HTMLInputElement | null
    const specialtyInput = document.body.querySelector('[data-testid="material-detail-specialty-input"]') as HTMLInputElement | null
    const saveButton = document.body.querySelector('[data-testid="material-detail-save"]') as HTMLButtonElement | null

    expect(dialog).not.toBeNull()
    expect(nameInput?.value).toBe('Aluminium profile')
    expect(specialtyInput?.value).toBe('facade')

    await act(async () => {
      if (nameInput) setInputValue(nameInput, 'Aluminium profile review')
      if (specialtyInput) setInputValue(specialtyInput, 'facade-specialty')
      await flush()
    })

    await act(async () => {
      click(saveButton)
      await flush()
      await flush()
    })

    expect(materialsApiMock.update).toHaveBeenCalledWith(
      'project-1',
      'material-1',
      expect.objectContaining({
        material_name: 'Aluminium profile review',
        specialty_type: 'facade-specialty',
      }),
    )
    expect(materialsApiMock.update.mock.calls.at(-1)?.[2]).not.toHaveProperty('professional_object_id')
  })

  it('loads system arrival suggestions and applies the suggested arrival date', async () => {
    await renderPage(root)

    await act(async () => {
      click(container.querySelector('[data-testid="material-detail-trigger-material-1"]'))
      await flush()
      await flush()
    })

    await act(async () => {
      click(document.body.querySelector('[data-testid="materials-arrival-suggestion-fetch"]'))
      await flush()
      await flush()
    })

    expect(materialsApiMock.getSystemArrivalSuggestion).toHaveBeenCalledWith('project-1', 'task-1')
    expect(materialsApiMock.analyzeLinkedTaskDelayRisk).toHaveBeenCalledWith('task-1')
    expect(document.body.textContent).toContain('12')
    expect(document.body.textContent).toContain('2026-04-20')

    await act(async () => {
      click(document.body.querySelector('[data-testid="materials-arrival-suggestion-adopt"]'))
      await flush()
      await flush()
    })

    expect(materialsApiMock.update).toHaveBeenCalledWith(
      'project-1',
      'material-1',
      expect.objectContaining({
        expected_arrival_date: '2026-04-20',
        change_reason: expect.any(String),
      }),
    )
  })

  it('does not show naked recommended duration as material task reference days', async () => {
    materialsApiMock.getSystemArrivalSuggestion.mockResolvedValueOnce({
      id: 'estimate-1',
      task_id: 'task-1',
      project_id: 'project-1',
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      recommendedDurationDays: 97,
      contextualReferenceDays: null,
      confidence_level: 'high',
      confidence_score: 0.82,
      reasoning: 'Governed semantic field is missing.',
    })

    await renderPage(root)

    await act(async () => {
      click(container.querySelector('[data-testid="material-detail-trigger-material-1"]'))
      await flush()
      await flush()
    })

    await act(async () => {
      click(document.body.querySelector('[data-testid="materials-arrival-suggestion-fetch"]'))
      await flush()
      await flush()
    })

    expect(document.body.textContent).not.toContain('97')
  })

  it('only shows sample and inspection completion toggles when the requirement is enabled', async () => {
    await renderPage(root)

    expect(container.querySelector('[data-testid="material-inline-sample-confirmed-material-1"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="material-inline-inspection-done-material-1"]')).toBeNull()
    expect(container.querySelector('[data-testid="material-inline-sample-confirmed-material-2"]')).toBeNull()
    expect(container.querySelector('[data-testid="material-inline-inspection-done-material-2"]')).toBeNull()
    expect(container.querySelector('[data-testid="material-inline-sample-confirmed-material-3"]')).toBeNull()
    expect(container.querySelector('[data-testid="material-inline-inspection-done-material-3"]')).not.toBeNull()

    await act(async () => {
      click(container.querySelector('[data-testid="material-detail-trigger-material-2"]'))
      await flush()
    })

    expect(document.body.querySelector('[data-testid="material-detail-sample-confirmed-toggle"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="material-detail-inspection-done-toggle"]')).toBeNull()
  })

  it('creates materials from template mode with template-derived specialty and flags', async () => {
    await renderPage(root)

    await act(async () => {
      click(container.querySelector('[data-testid="materials-create-mode-template"]'))
      await flush()
    })

    const unitValueInput = container.querySelector('[data-testid="materials-template-unit-value"]') as HTMLInputElement | null
    const dateInput = container.querySelector('[data-testid="materials-template-arrival-date"]') as HTMLInputElement | null
    const templateGroup = MATERIAL_TEMPLATE_GROUPS[0]
    const [firstTemplateItem, secondTemplateItem] = templateGroup.items
    const aluminiumCheckbox = container.querySelector(
      `[data-testid="materials-template-item-${templateGroup.specialtyType}-${firstTemplateItem.name}"]`,
    ) as HTMLInputElement | null
    const glassCheckbox = container.querySelector(
      `[data-testid="materials-template-item-${templateGroup.specialtyType}-${secondTemplateItem.name}"]`,
    ) as HTMLInputElement | null

    expect(unitValueInput).not.toBeNull()
    expect(dateInput).not.toBeNull()
    expect(aluminiumCheckbox).not.toBeNull()
    expect(glassCheckbox).not.toBeNull()

    await act(async () => {
      if (unitValueInput) setInputValue(unitValueInput, 'unit-1')
      if (dateInput) setInputValue(dateInput, '2026-04-26')
      click(aluminiumCheckbox)
      click(glassCheckbox)
      await flush()
    })

    await act(async () => {
      click(container.querySelector('[data-testid="materials-template-submit"]'))
      await flush()
      await flush()
    })

    expect(materialsApiMock.create).toHaveBeenCalledWith(
      'project-1',
      expect.arrayContaining([
        expect.objectContaining({
          material_name: firstTemplateItem.name,
          specialty_type: templateGroup.specialtyType,
          participant_unit_id: 'unit-1',
          expected_arrival_date: '2026-04-26',
          requires_sample_confirmation: true,
          requires_inspection: false,
        }),
        expect.objectContaining({
          material_name: secondTemplateItem.name,
          specialty_type: templateGroup.specialtyType,
          participant_unit_id: 'unit-1',
          expected_arrival_date: '2026-04-26',
          requires_sample_confirmation: true,
          requires_inspection: true,
        }),
      ]),
    )
    expect(materialsApiMock.create.mock.calls.at(-1)?.[1]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ professional_object_id: expect.anything() })]),
    )
  })

  it('supports batch row add, delete, clear, and submit using specialty_type', async () => {
    await renderPage(root)

    await act(async () => {
      click(container.querySelector('[data-testid="materials-create-mode-batch"]'))
      await flush()
    })

    const getBatchRows = () => [...container.querySelectorAll('[data-testid^="materials-batch-row-"]')]
    const getRowId = (row: Element) => row.getAttribute('data-testid')?.replace('materials-batch-row-', '') ?? ''

    expect(getBatchRows()).toHaveLength(1)

    await act(async () => {
      click(container.querySelector('[data-testid="materials-batch-add-row"]'))
      await flush()
    })

    expect(getBatchRows()).toHaveLength(2)

    const [firstRow, secondRow] = getBatchRows()
    const firstRowId = getRowId(firstRow)
    const secondRowId = getRowId(secondRow)

    await act(async () => {
      setInputValue(container.querySelector(`[data-testid="materials-batch-name-${firstRowId}"]`) as HTMLInputElement, 'batch-material-1')
      setInputValue(container.querySelector(`[data-testid="materials-batch-name-${secondRowId}"]`) as HTMLInputElement, 'batch-material-2')
      await flush()
    })

    await act(async () => {
      click(container.querySelector(`[data-testid="materials-batch-delete-${secondRowId}"]`))
      await flush()
    })

    expect(getBatchRows()).toHaveLength(1)
    expect((container.querySelector(`[data-testid="materials-batch-name-${firstRowId}"]`) as HTMLInputElement | null)?.value).toBe('batch-material-1')

    await act(async () => {
      click(container.querySelector('[data-testid="materials-batch-clear"]'))
      await flush()
    })

    expect(getBatchRows()).toHaveLength(1)
    const clearedRowId = getRowId(getBatchRows()[0])
    expect((container.querySelector(`[data-testid="materials-batch-name-${clearedRowId}"]`) as HTMLInputElement | null)?.value).toBe('')

    await act(async () => {
      click(container.querySelector('[data-testid="materials-batch-add-row"]'))
      await flush()
    })

    const [submitRowOne, submitRowTwo] = getBatchRows()
    const submitRowOneId = getRowId(submitRowOne)
    const submitRowTwoId = getRowId(submitRowTwo)

    await act(async () => {
      setInputValue(container.querySelector(`[data-testid="materials-batch-name-${submitRowOneId}"]`) as HTMLInputElement, 'batch-submit-1')
      setInputValue(container.querySelector(`[data-testid="materials-batch-specialty-${submitRowOneId}"]`) as HTMLInputElement, 'facade')
      setInputValue(container.querySelector(`[data-testid="materials-batch-date-${submitRowOneId}"]`) as HTMLInputElement, '2026-04-27')
      click(container.querySelector(`[data-testid="materials-batch-sample-${submitRowOneId}"]`))

      setInputValue(container.querySelector(`[data-testid="materials-batch-name-${submitRowTwoId}"]`) as HTMLInputElement, 'batch-submit-2')
      setInputValue(container.querySelector(`[data-testid="materials-batch-specialty-${submitRowTwoId}"]`) as HTMLInputElement, 'mep')
      setInputValue(container.querySelector(`[data-testid="materials-batch-date-${submitRowTwoId}"]`) as HTMLInputElement, '2026-04-28')
      click(container.querySelector(`[data-testid="materials-batch-inspection-${submitRowTwoId}"]`))
      await flush()
    })

    await act(async () => {
      click(container.querySelector('[data-testid="materials-batch-submit"]'))
      await flush()
      await flush()
    })

    expect(materialsApiMock.create).toHaveBeenCalledWith(
      'project-1',
      [
        expect.objectContaining({
          material_name: 'batch-submit-1',
          specialty_type: 'facade',
          expected_arrival_date: '2026-04-27',
          requires_sample_confirmation: true,
          requires_inspection: false,
        }),
        expect.objectContaining({
          material_name: 'batch-submit-2',
          specialty_type: 'mep',
          expected_arrival_date: '2026-04-28',
          requires_sample_confirmation: false,
          requires_inspection: true,
        }),
      ],
    )
  })
})
