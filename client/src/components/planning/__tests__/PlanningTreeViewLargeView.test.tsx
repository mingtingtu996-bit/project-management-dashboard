import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PlanningTreeView, type PlanningTreeRow } from '../PlanningTreeView'

const rows: PlanningTreeRow[] = [
  {
    id: 'row-1',
    title: '土方开挖',
    depth: 1,
    sequenceLabel: '1',
    startDateLabel: '2026-05-01',
    endDateLabel: '2026-05-03',
    durationLabel: '3天',
    progressLabel: '30%',
    assigneeLabel: '张三',
    unitLabel: '总包单位',
    scopeLabel: '1号楼',
  },
  {
    id: 'row-2',
    title: '基础验槽',
    depth: 1,
    sequenceLabel: '2',
    isMilestone: true,
    startDateLabel: '2026-05-04',
    endDateLabel: '2026-05-04',
    durationLabel: '1天',
    progressLabel: '0%',
  },
]

describe('PlanningTreeView large view mode', () => {
  it('keeps task-list ordinary toolbar lightweight and moves heavy editing controls into the workspace', () => {
    const { rerender } = render(
      <PlanningTreeView
        title="执行任务表"
        rows={rows}
        variant="task"
        rowMode="read"
        viewMode="list"
      />,
    )

    expect(screen.getByTestId('planning-start-edit')).toBeVisible()
    expect(screen.getByTestId('planning-view-list')).toBeVisible()
    expect(screen.queryByTestId('planning-task-list-more-tools')).toBeNull()
    expect(screen.getByTestId('planning-task-list-filter-menu')).toHaveAttribute('data-filter-scope', 'table')
    expect(screen.getByRole('button', { name: '表内筛选' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
    expect(screen.queryByRole('button', { name: '粘贴' })).toBeNull()
    expect(screen.queryByTestId('planning-more-columns-trigger')).toBeNull()
    expect(screen.queryByTestId('planning-keyboard-shortcuts')).toBeNull()
    expect(screen.queryByRole('button', { name: '排序' })).toBeNull()
    expect(screen.queryByRole('button', { name: '全部' })).toBeNull()
    expect(screen.queryByRole('button', { name: '全选当前视图' })).toBeNull()

    fireEvent.click(screen.getByTestId('planning-start-edit'))
    rerender(
      <PlanningTreeView
        title="执行任务表"
        rows={rows}
        variant="task"
        rowMode="edit"
        viewMode="list"
        onPasteRows={() => undefined}
        onUpdateCells={() => undefined}
      />,
    )

    const dialog = screen.getByTestId('planning-large-view-dialog')
    expect(within(dialog).getByTestId('planning-more-columns-trigger')).toBeVisible()
    expect(within(dialog).getByTestId('planning-keyboard-shortcuts')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: '复制' })).toBeVisible()
    expect(within(dialog).getByRole('button', { name: '粘贴' })).toBeVisible()
  })

  it('shows large-view as a primary toolbar action and enlarges the current table in-place', () => {
    render(
      <PlanningTreeView
        title="执行任务表"
        rows={rows}
        variant="task"
        rowMode="read"
        viewMode="list"
      />,
    )

    expect(screen.queryByRole('button', { name: '大图' })).toBeNull()
    expect(screen.queryByTestId('planning-large-view-trigger')).toBeNull()
  })

  it('keeps large-view out of the edit toolbar', () => {
    render(
      <PlanningTreeView
        title="执行任务表"
        rows={rows}
        variant="task"
        rowMode="edit"
        viewMode="list"
      />,
    )

    expect(screen.queryByRole('button', { name: '大图' })).toBeNull()
  })

  it('opens task-list editing inside the large-view workspace', () => {
    const onStartEdit = vi.fn()
    const onSave = vi.fn()
    const onCancelEdit = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()

    const { rerender } = render(
      <PlanningTreeView
        title="执行任务表"
        rows={rows}
        variant="task"
        rowMode="read"
        viewMode="list"
        onStartEdit={onStartEdit}
        onSave={onSave}
        onCancelEdit={onCancelEdit}
        onUndo={onUndo}
        onRedo={onRedo}
      />,
    )

    fireEvent.click(screen.getByTestId('planning-start-edit'))

    expect(onStartEdit).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('planning-large-view-dialog')).toBeVisible()

    rerender(
      <PlanningTreeView
        title="执行任务表"
        rows={rows}
        variant="task"
        rowMode="edit"
        viewMode="list"
        onStartEdit={onStartEdit}
        onSave={onSave}
        onCancelEdit={onCancelEdit}
        onUndo={onUndo}
        onRedo={onRedo}
      />,
    )

    const dialog = screen.getByTestId('planning-large-view-dialog')
    expect(within(dialog).getByText('计划表工作台')).toBeVisible()
    expect(within(dialog).getByTestId('planning-save')).toBeVisible()
    expect(within(dialog).getByTestId('planning-cancel')).toBeVisible()
    expect(within(dialog).getByTestId('planning-undo')).toBeVisible()
    expect(within(dialog).getByTestId('planning-redo')).toBeVisible()
    expect(screen.getAllByTestId('planning-save')).toHaveLength(1)
  })

  it('keeps baseline editing in the page instead of opening large-view', () => {
    const onStartEdit = vi.fn()

    render(
      <PlanningTreeView
        title="基线计划"
        rows={rows}
        variant="baseline"
        rowMode="read"
        viewMode="list"
        onStartEdit={onStartEdit}
      />,
    )

    fireEvent.click(screen.getByTestId('planning-start-edit'))

    expect(onStartEdit).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('planning-large-view-dialog')).toBeNull()
  })

  it('keeps the large-view workspace open when async save fails', async () => {
    const onStartEdit = vi.fn()
    const onSave = vi.fn(async () => {
      throw new Error('save failed')
    })

    const { rerender } = render(
      <PlanningTreeView
        title="执行任务表"
        rows={rows}
        variant="task"
        rowMode="read"
        viewMode="list"
        onStartEdit={onStartEdit}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByTestId('planning-start-edit'))

    rerender(
      <PlanningTreeView
        title="执行任务表"
        rows={rows}
        variant="task"
        rowMode="edit"
        viewMode="list"
        onStartEdit={onStartEdit}
        onSave={onSave}
      />,
    )

    fireEvent.click(within(screen.getByTestId('planning-large-view-dialog')).getByTestId('planning-save'))
    await expect(onSave.mock.results[0]?.value).rejects.toThrow('save failed')

    expect(screen.getByTestId('planning-large-view-dialog')).toBeVisible()
  })

  it('requires confirmation before closing an unsaved task-list workspace', () => {
    const onStartEdit = vi.fn()
    const onCancelEdit = vi.fn()
    const onSave = vi.fn()

    const { rerender } = render(
      <PlanningTreeView
        title="执行任务表"
        rows={rows}
        variant="task"
        rowMode="read"
        viewMode="list"
        onStartEdit={onStartEdit}
        onCancelEdit={onCancelEdit}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByTestId('planning-start-edit'))

    rerender(
      <PlanningTreeView
        title="执行任务表"
        rows={rows}
        variant="task"
        rowMode="edit"
        viewMode="list"
        dirtyRowIds={new Set(['row-1'])}
        onStartEdit={onStartEdit}
        onCancelEdit={onCancelEdit}
        onSave={onSave}
      />,
    )

    fireEvent.keyDown(screen.getByTestId('planning-large-view-dialog'), { key: 'Escape' })

    expect(onCancelEdit).not.toHaveBeenCalled()
    expect(screen.getByTestId('planning-large-view-dialog')).toBeVisible()
    expect(screen.getByTestId('planning-unsaved-edit-guard')).toBeVisible()
    expect(screen.getByText('保存并退出')).toBeVisible()
    expect(screen.getByText('放弃更改')).toBeVisible()
    expect(screen.getByText('继续编辑')).toBeVisible()

    fireEvent.click(screen.getByText('继续编辑'))
    expect(screen.queryByTestId('planning-unsaved-edit-guard')).toBeNull()
    expect(screen.getByTestId('planning-large-view-dialog')).toBeVisible()
  })
})
