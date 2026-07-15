import { describe, expect, it } from 'vitest'

import { mountSurface, type PlanningTreeHarnessFieldRegistry } from './planningTreeHarness'

const fieldRegistry: PlanningTreeHarnessFieldRegistry = {
  registryVersion: 'v1.4.7.6',
  fields: [
    { key: 'title', editableIn: ['baseline', 'monthly_plan', 'task_list'] },
    { key: 'planned_start_date', dataType: 'date', editableIn: ['baseline', 'monthly_plan', 'task_list'] },
    {
      key: 'planned_end_date',
      dataType: 'date',
      editableIn: ['baseline', 'monthly_plan', 'task_list'],
      validators: [{ type: 'date_after', params: { afterField: 'planned_start_date' }, severity: 'block_save' }],
    },
    {
      key: 'progress',
      dataType: 'percent',
      editableIn: ['task_list'],
      validators: [{ type: 'range', params: { min: 0, max: 100 }, severity: 'block_save' }],
    },
  ],
}

describe('planningTreeHarness', () => {
  it('builds the shared commit envelope from task-list edits', async () => {
    const harness = mountSurface(
      'task_list',
      [{ id: 'task-1', project_id: 'project-1', title: 'Task', progress: 0 }],
      { fieldRegistry },
    )

    await harness.enterEdit()
    await harness.editCell('task-1', 'progress', 35)
    const commitRequest = await harness.clickSave()

    expect(commitRequest).toMatchObject({
      projectId: 'project-1',
      surface: 'task_list',
      fieldRegistryVersion: 'v1.4.7.6',
      operations: [
        {
          type: 'update_row',
          rowId: 'task-1',
          values: { progress: 35 },
        },
      ],
    })
  })

  it('uses the same registry rules to block fields outside a surface', async () => {
    const harness = mountSurface(
      'baseline',
      [{ id: 'row-1', project_id: 'project-1', title: 'Baseline row', progress: 0 }],
      { fieldRegistry },
    )

    await harness.enterEdit()
    await expect(harness.editCell('row-1', 'progress', 35)).rejects.toThrow(
      'Field "progress" is not editable on baseline',
    )
  })

  it('supports undo, redo, delete, and server result adoption through one API', async () => {
    const harness = mountSurface(
      'monthly_plan',
      [
        { id: 'item-1', project_id: 'project-1', title: 'Item A' },
        { id: 'item-2', project_id: 'project-1', title: 'Item B' },
      ],
      { fieldRegistry, serverState: { resourceId: 'monthly-1' } },
    )

    await harness.enterEdit()
    await harness.deleteRow('item-2')
    expect(harness.getRows().map((row) => row.id)).toEqual(['item-1'])

    await harness.undo()
    expect(harness.getRows().map((row) => row.id)).toEqual(['item-1', 'item-2'])

    await harness.redo()
    const commitRequest = await harness.clickSave()
    expect(commitRequest).toMatchObject({
      surface: 'monthly_plan',
      resourceId: 'monthly-1',
      operations: [{ type: 'delete_row', rowId: 'item-2' }],
    })

    await harness.applyServerResult({
      rows: [{ id: 'item-1', project_id: 'project-1', title: 'Item A saved' }],
    })
    expect(harness.getRows()).toEqual([{ id: 'item-1', project_id: 'project-1', title: 'Item A saved' }])
  })

  it('runs field-registry validators before returning a commit request', async () => {
    const harness = mountSurface(
      'task_list',
      [{
        id: 'task-1',
        project_id: 'project-1',
        title: 'Task',
        planned_start_date: '2026-05-10',
        planned_end_date: '2026-05-12',
        progress: 0,
      }],
      { fieldRegistry },
    )

    await harness.enterEdit()
    await harness.editCell('task-1', 'progress', 120)
    await expect(harness.clickSave()).rejects.toThrow('task-1.progress:range')

    await harness.undo()
    await harness.editCell('task-1', 'planned_end_date', '2026-05-01')
    await expect(harness.clickSave()).rejects.toThrow('task-1.planned_end_date:date_after')
  })

  it('requires edit mode for mutating operations and clears pending changes on cancel', async () => {
    const harness = mountSurface(
      'task_list',
      [{ id: 'task-1', project_id: 'project-1', title: 'Task', progress: 0 }],
      { fieldRegistry },
    )

    await expect(harness.editCell('task-1', 'progress', 10)).rejects.toThrow('Planning surface is not in edit mode')
    await expect(harness.pasteAt('task-1', 'progress', '10')).rejects.toThrow('Planning surface is not in edit mode')
    await expect(harness.fillDown({ field: 'progress', rowIds: ['task-1'] }, 10)).rejects.toThrow(
      'Planning surface is not in edit mode',
    )
    await expect(harness.deleteRow('task-1')).rejects.toThrow('Planning surface is not in edit mode')
    await expect(harness.clickSave()).rejects.toThrow('Planning surface is not in edit mode')

    await harness.enterEdit()
    await harness.editCell('task-1', 'progress', 10)
    await harness.cancelEdit()
    expect(harness.getRows()).toEqual([{ id: 'task-1', project_id: 'project-1', title: 'Task', progress: 0 }])

    await harness.redo()
    expect(harness.getRows()).toEqual([{ id: 'task-1', project_id: 'project-1', title: 'Task', progress: 0 }])
    await expect(harness.clickSave()).rejects.toThrow('Planning surface is not in edit mode')
  })

  it('pastes TSV from the focused cell using registry field order', async () => {
    const harness = mountSurface(
      'task_list',
      [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'Task A',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-03',
          progress: 0,
        },
        {
          id: 'task-2',
          project_id: 'project-1',
          title: 'Task B',
          planned_start_date: '2026-05-02',
          planned_end_date: '2026-05-04',
          progress: 0,
        },
      ],
      { fieldRegistry },
    )

    await harness.enterEdit()
    await harness.pasteAt('task-1', 'planned_start_date', '2026-06-01\t2026-06-03\t25\n2026-06-02\t2026-06-04\t30')

    expect(harness.getRows()).toEqual([
      {
        id: 'task-1',
        project_id: 'project-1',
        title: 'Task A',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-03',
        progress: '25',
      },
      {
        id: 'task-2',
        project_id: 'project-1',
        title: 'Task B',
        planned_start_date: '2026-06-02',
        planned_end_date: '2026-06-04',
        progress: '30',
      },
    ])

    const commitRequest = await harness.clickSave()
    expect(commitRequest.operations).toEqual([
      {
        type: 'update_row',
        rowId: 'task-1',
        values: {
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-03',
          progress: '25',
        },
      },
      {
        type: 'update_row',
        rowId: 'task-2',
        values: {
          planned_start_date: '2026-06-02',
          planned_end_date: '2026-06-04',
          progress: '30',
        },
      },
    ])
  })

  it('keeps TSV paste atomic when a target field is not editable', async () => {
    const harness = mountSurface(
      'baseline',
      [{
        id: 'row-1',
        project_id: 'project-1',
        title: 'Baseline row',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-03',
        progress: 0,
      }],
      { fieldRegistry },
    )

    await harness.enterEdit()
    await expect(
      harness.pasteAt('row-1', 'planned_start_date', '2026-06-01\t2026-06-03\t25'),
    ).rejects.toThrow('Field "progress" is not editable on baseline')

    expect(harness.getRows()).toEqual([{
      id: 'row-1',
      project_id: 'project-1',
      title: 'Baseline row',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-03',
      progress: 0,
    }])
  })

  it('fills selected rows only and preserves resource metadata in the commit request', async () => {
    const harness = mountSurface(
      'task_list',
      [
        { id: 'task-1', project_id: 'project-1', title: 'Task A', progress: 10 },
        { id: 'task-2', project_id: 'project-1', title: 'Task B', progress: 20 },
        { id: 'task-3', project_id: 'project-1', title: 'Task C', progress: 30 },
      ],
      {
        fieldRegistry,
        serverState: { projectId: 'project-42', resourceId: 'task-list-1', baseRevision: 'rev-3' },
      },
    )

    await harness.enterEdit()
    await harness.fillDown({ field: 'progress', rowIds: ['task-1', 'task-3'] }, 80)

    expect(harness.getRows().map((row) => ({ id: row.id, progress: row.progress }))).toEqual([
      { id: 'task-1', progress: 80 },
      { id: 'task-2', progress: 20 },
      { id: 'task-3', progress: 80 },
    ])

    const commitRequest = await harness.clickSave()
    expect(commitRequest).toMatchObject({
      projectId: 'project-42',
      surface: 'task_list',
      resourceId: 'task-list-1',
      baseRevision: 'rev-3',
      operations: [
        { type: 'update_row', rowId: 'task-1', values: { progress: 80 } },
        { type: 'update_row', rowId: 'task-3', values: { progress: 80 } },
      ],
    })
  })

  it('treats local rows as create operations with parent and sort order', async () => {
    const harness = mountSurface(
      'monthly_plan',
      [{
        id: 'local-1',
        project_id: 'project-1',
        parent_item_id: 'parent-1',
        title: 'New monthly item',
        planned_start_date: '2026-05-10',
        planned_end_date: '2026-05-12',
      }],
      { fieldRegistry, serverState: { resourceId: 'monthly-1', baseRevision: 7 } },
    )

    await harness.enterEdit()
    const commitRequest = await harness.clickSave()

    expect(commitRequest).toMatchObject({
      projectId: 'project-1',
      surface: 'monthly_plan',
      resourceId: 'monthly-1',
      baseRevision: 7,
      operations: [{
        type: 'create_row',
        clientRowId: 'local-1',
        parentId: 'parent-1',
        sortOrder: 0,
        values: expect.objectContaining({
          project_id: 'project-1',
          parent_item_id: 'parent-1',
          title: 'New monthly item',
        }),
      }],
    })
  })

  it('adopts nested server result rows and exits edit mode after save', async () => {
    const harness = mountSurface(
      'task_list',
      [{ id: 'task-1', project_id: 'project-1', title: 'Task', progress: 0 }],
      { fieldRegistry },
    )

    await harness.enterEdit()
    await harness.editCell('task-1', 'progress', 50)
    await harness.applyServerResult({
      data: {
        rows: [{ id: 'task-1', project_id: 'project-1', title: 'Task saved', progress: 50 }],
      },
    })

    expect(harness.getRows()).toEqual([{ id: 'task-1', project_id: 'project-1', title: 'Task saved', progress: 50 }])
    await expect(harness.clickSave()).rejects.toThrow('Planning surface is not in edit mode')

    await harness.enterEdit()
    await expect(harness.clickSave()).resolves.toMatchObject({ operations: [] })
  })
})
