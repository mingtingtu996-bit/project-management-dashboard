import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PlanningTreeView, type PlanningTreeRow } from '../PlanningTreeView'

const hierarchyRows: PlanningTreeRow[] = [
  { id: 'division', title: 'Division', depth: 1, wbsCode: '1', rowType: 'structure', wbsNodeType: 'division' },
  { id: 'sub-division', title: 'Sub division', depth: 2, wbsCode: '1.1', rowType: 'structure', wbsNodeType: 'sub_division' },
  { id: 'item-work', title: 'Item work', depth: 3, wbsCode: '1.1.1', rowType: 'structure', wbsNodeType: 'item_work' },
  { id: 'process', title: 'Process', depth: 4, wbsCode: '1.1.1.1', rowType: 'leaf', wbsNodeType: 'process' },
  { id: 'activity-step', title: 'Activity step', depth: 5, wbsCode: '1.1.1.1.1', rowType: 'leaf', wbsNodeType: 'activity_step' },
  { id: 'milestone', title: 'Milestone', depth: 5, wbsCode: 'M1', rowType: 'milestone', wbsNodeType: 'activity_step', isMilestone: true },
]

describe('PlanningTreeView shared tree contract', () => {
  it('exposes shared compact density and whole-row hierarchy for five WBS node types plus milestone', () => {
    render(
      <PlanningTreeView
        title="Shared tree"
        rows={hierarchyRows}
        variant="task"
        density="compact"
        rowMode="read"
        viewMode="list"
      />,
    )

    for (const row of hierarchyRows) {
      const renderedRow = screen.getByTestId(`planning-row-${row.id}`)
      expect(renderedRow).toHaveAttribute('data-planning-density', 'compact')
      expect(renderedRow).toHaveAttribute('data-wbs-node-type', row.wbsNodeType)
      expect(screen.getByTestId(`planning-wbs-badge-${row.id}`)).toBeVisible()
    }

    expect(screen.getByTestId('planning-row-division')).toHaveAttribute('data-hierarchy-rank', 'division')
    expect(screen.getByTestId('planning-row-sub-division')).toHaveAttribute('data-hierarchy-rank', 'sub_division')
    expect(screen.getByTestId('planning-row-item-work')).toHaveAttribute('data-hierarchy-rank', 'item_work')
    expect(screen.getByTestId('planning-row-process')).toHaveAttribute('data-hierarchy-rank', 'process')
    expect(screen.getByTestId('planning-row-activity-step')).toHaveAttribute('data-hierarchy-rank', 'activity_step')
    expect(screen.getByTestId('planning-milestone-icon-milestone')).toBeVisible()
  })

  it('keeps edit state, dirty row, dirty cell, and multi-user presence verifiable without changing row height', () => {
    const dirtyCellMap = new Map<string, Set<string>>([
      ['activity-step', new Set(['start'])],
    ])

    render(
      <PlanningTreeView
        title="Baseline tree"
        rows={hierarchyRows}
        variant="baseline"
        density="comfortable"
        rowMode="edit"
        viewMode="list"
        dirtyRowIds={new Set(['activity-step'])}
        dirtyCellMap={dirtyCellMap}
        presence={{ viewerCount: 3, viewerNames: ['Alice', 'Bob'], editingByRowId: { 'activity-step': ['Alice'] } }}
      />,
    )

    const stateBar = screen.getByTestId('planning-edit-state-bar')
    expect(stateBar).toHaveAttribute('data-presence-viewer-state', 'multiple')
    expect(stateBar).toHaveAttribute('data-presence-readonly', 'false')
    expect(screen.getByTestId('planning-dirty-row-activity-step')).toBeVisible()

    const dirtyCell = document.querySelector('[data-planning-cell="activity-step:start"]')
    expect(dirtyCell).toHaveAttribute('data-dirty-cell', 'true')
    expect(screen.getByTestId('planning-row-activity-step')).toHaveAttribute('data-planning-density', 'comfortable')
  })

  it('folds task-list issue chips while preserving traceability and labels the inner filter as table scoped', () => {
    render(
      <PlanningTreeView
        title="Execution tasks"
        rows={[{
          id: 'risk-row',
          title: 'Risk row',
          depth: 1,
          sequenceLabel: '1',
          statusLabel: 'In progress',
          hasBlockages: true,
          hasConditions: true,
          hasAcceptanceLinks: true,
          locked: true,
        }]}
        variant="task"
        rowMode="read"
        viewMode="list"
        toolbarMode="task_read"
      />,
    )

    expect(screen.getByText('In progress')).toBeVisible()
    expect(screen.getByTestId('planning-task-risk-chip-risk-row')).toHaveAttribute('data-risk-count', '3')
    expect(screen.getByText('+2')).toBeVisible()
    expect(screen.getByTestId('planning-task-list-filter-menu')).toHaveAttribute('data-filter-scope', 'table')
  })

  it('keeps task read business actions on a mobile-safe wrapping row without hiding generation entry', () => {
    render(
      <PlanningTreeView
        title="Execution tasks"
        rows={[{
          id: 'toolbar-row',
          title: 'Toolbar row',
          depth: 1,
          sequenceLabel: '1',
          statusLabel: 'In progress',
        }]}
        variant="task"
        rowMode="read"
        viewMode="list"
        toolbarMode="task_read"
        readBusinessActionsSlot={(
          <button type="button" data-testid="gantt-generation-template-menu">
            Generate template
          </button>
        )}
      />,
    )

    const startEdit = screen.getByTestId('planning-start-edit')
    const businessActions = screen.getByTestId('planning-business-actions-read')

    expect(startEdit.compareDocumentPosition(businessActions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(businessActions).toHaveAttribute('data-mobile-toolbar-row', 'business-actions')
    expect(businessActions.className).toContain('w-full')
    expect(businessActions.className).toContain('min-w-0')
    expect(screen.getByTestId('gantt-generation-template-menu')).toBeVisible()
  })
})
