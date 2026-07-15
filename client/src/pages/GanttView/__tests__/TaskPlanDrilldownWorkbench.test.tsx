import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getContext: vi.fn(),
  commitTaskListTable: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/services/taskPlanDrilldownApi', () => ({
  getTaskPlanDrilldownContext: mocks.getContext,
}))

vi.mock('@/services/planningCommitApi', () => ({
  commitTaskListTable: mocks.commitTaskListTable,
}))

vi.mock('@/hooks/usePlanningFieldRegistry', () => ({
  usePlanningFieldRegistry: () => ({
    registry: { registryVersion: 'registry-v1' },
    loading: false,
    error: null,
    refetch: mocks.refetch,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))

vi.mock('@/components/planning/TemplateInlineExpand', () => ({
  TemplateInlineExpand: (props: any) => (
    <div data-testid="drilldown-inline-probe">
      <span>{props.drilldownPreset.templateId}</span>
      <button
        type="button"
        onClick={() => props.onApply({
          generationBatchId: 'batch-1',
          templateId: 'template-1',
          generationDepth: 'process',
          previewRows: [{ clientRowId: 'row-1' }],
          rows: [{ clientRowId: 'row-1' }],
          rowLimitPolicy: 'single_batch',
          generationBatches: [],
        }, {
          templateId: 'template-1',
          templateIds: ['template-1'],
          templateName: '主体模板',
          selectedNodeIds: ['item-work-1'],
          selectedNodesByTemplate: { 'template-1': ['item-work-1'] },
          scope: { building_object_id: 'building-1' },
          plannedStartDate: '2026-05-01',
          generationDepth: 'process',
          includeActivitySteps: false,
          duplicatePolicy: 'skip',
          attachUnderRowId: 'task-1',
          sortOrder: 0,
        })}
      >
        commit drilldown
      </button>
    </div>
  ),
}))

const { TaskPlanDrilldownWorkbench } = await import('../TaskPlanDrilldownWorkbench')

describe('TaskPlanDrilldownWorkbench', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getContext.mockResolvedValue({
      parentTask: {
        id: 'task-1',
        title: '主体结构施工',
        planned_start_date: '2026-05-01',
      },
      scope: { building_object_id: 'building-1' },
      currentLevel: 'master_control',
      nextLevel: 'process_detail',
      generationDepth: 'process',
      includeActivitySteps: false,
      rowLimit: 80,
      recommendation: {
        templateId: 'template-1',
        templateName: '主体模板',
        selectedNodeIds: ['item-work-1'],
        selectedNodeNames: ['主体结构施工'],
        resolutionSource: 'lineage_match',
        confidence: 'high',
      },
      projectTaskCount: 501,
      projectRowLimitExceeded: false,
      warningThreshold: 800,
      projectTotalBlockedByGenerationFuse: false,
      mutationBoundary: 'read_only_context_no_task_or_dependency_write',
    })
    mocks.commitTaskListTable.mockResolvedValue({ rows: [] })
  })

  it('commits the preview as one authoritative template_generate operation', async () => {
    const onCommitted = vi.fn()
    render(
      <TaskPlanDrilldownWorkbench
        projectId="project-1"
        taskId="task-1"
        onClose={vi.fn()}
        onCommitted={onCommitted}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('drilldown-inline-probe')).toBeInTheDocument())
    fireEvent.click(screen.getByText('commit drilldown'))

    await waitFor(() => expect(mocks.commitTaskListTable).toHaveBeenCalledTimes(1))
    expect(mocks.commitTaskListTable).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      fieldRegistryVersion: 'registry-v1',
      operations: [expect.objectContaining({
        type: 'template_generate',
        generationBatchId: 'batch-1',
        attachUnderRowId: 'task-1',
        selectedNodeIds: ['item-work-1'],
        generationDepth: 'process',
        previewRows: [{ clientRowId: 'row-1' }],
      })],
    }))
    expect(onCommitted).toHaveBeenCalledTimes(1)
  })
})
