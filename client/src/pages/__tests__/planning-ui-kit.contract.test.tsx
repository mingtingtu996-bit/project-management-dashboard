import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PlanningPageShell } from '@/components/planning/PlanningPageShell'
import { PlanningWorkspaceLayers } from '@/components/planning/PlanningWorkspaceLayers'
import { PlanningTreeView } from '@/components/planning/PlanningTreeView'
import { BatchActionBar } from '@/components/planning/BatchActionBar'
import { ValidationPanel } from '@/components/planning/ValidationPanel'
import { ConfirmDialog } from '@/components/planning/ConfirmDialog'

describe('planning-ui-kit contract', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('mounts the planning route shell and shared widgets', () => {
    act(() => {
      root.render(
        <PlanningPageShell
          projectName="项目 P-01"
          title="计划编制"
          description="共享框架"
          tabs={[{ key: 'baseline', label: '项目基线', active: true, onClick: () => {} }]}
        >
          <PlanningWorkspaceLayers
            summary={<div>项目基线</div>}
            main={<div>主树工作区</div>}
            aside={
              <ValidationPanel
                title="异常校核区"
                issues={[{ id: 'i1', level: 'warning', title: '示例警告', detail: '仅用于契约测试' }]}
              />
            }
          />
        </PlanningPageShell>
      )
    })

    expect(container.querySelector('h1')?.textContent).toBe('计划编制')
    expect(container.textContent).toContain('项目基线')
    expect(container.textContent).toContain('异常校核区')
  })

  it('keeps the shared component contracts stable', () => {
    act(() => {
      root.render(
        <PlanningPageShell
          projectName="项目 P-01"
          title="计划编制"
          description="共享框架"
          tabs={[{ key: 'baseline', label: '项目基线', active: true, onClick: () => {} }]}
        >
          <div>shell child</div>
        </PlanningPageShell>
      )
    })

    expect(container.textContent).toContain('shell child')

    act(() => {
      root.render(
        <PlanningTreeView
          title="计划树"
          rows={[{ id: '1', title: '主体结构', depth: 1, selected: true, statusLabel: '已确认' }]}
          selectedCount={1}
        />
      )
    })

    expect(container.textContent).toContain('主体结构')

    act(() => {
      root.render(
        <ValidationPanel
          title="异常校核区"
          issues={[{ id: 'i1', level: 'warning', title: '示例警告', detail: '仅用于契约测试' }]}
        />
      )
    })

    expect(container.textContent).toContain('示例警告')

    act(() => {
      root.render(
        <ConfirmDialog
          open
          title="确认操作"
          description="契约测试"
          confirmLabel="继续"
          onConfirm={() => {}}
          onOpenChange={() => {}}
        />
      )
    })

    expect(document.body.textContent).toContain('确认操作')

    act(() => {
      root.render(
        <BatchActionBar
          selectedCount={1}
          onClear={() => {}}
          actions={[{ label: '确认', onClick: () => {} }]}
        />
      )
    })

    expect(document.body.textContent).toContain('条已选中')
  })
})
