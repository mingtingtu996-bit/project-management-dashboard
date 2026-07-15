import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const engineeringObjectsApiMock = vi.hoisted(() => ({
  createEngineeringObject: vi.fn(),
  deleteEngineeringObject: vi.fn(),
  listEngineeringObjects: vi.fn(),
  updateEngineeringObject: vi.fn(),
}))

vi.mock('@/services/engineeringObjectsApi', () => ({
  createEngineeringObject: engineeringObjectsApiMock.createEngineeringObject,
  deleteEngineeringObject: engineeringObjectsApiMock.deleteEngineeringObject,
  listEngineeringObjects: engineeringObjectsApiMock.listEngineeringObjects,
  updateEngineeringObject: engineeringObjectsApiMock.updateEngineeringObject,
}))

import { EngineeringObjectsDialog } from '../GanttView/EngineeringObjectsDialog'

const buildingObject = {
  id: 'building-1',
  projectId: 'project-1',
  objectType: 'building',
  objectCode: 'BLD-001',
  objectName: '1#楼',
  parentId: null,
  path: '/building-1',
  level: 1,
  sortOrder: 1,
  status: 'active',
  metadata: {},
} as const

const floorObject = {
  id: 'floor-1',
  projectId: 'project-1',
  objectType: 'floor',
  objectCode: 'FL-001',
  objectName: 'L1',
  parentId: 'building-1',
  path: '/building-1/floor-1',
  level: 2,
  sortOrder: 1,
  status: 'active',
  metadata: {},
} as const

const zoneObject = {
  id: 'zone-1',
  projectId: 'project-1',
  objectType: 'physical_zone',
  objectCode: 'PZ-001',
  objectName: '中心广场',
  parentId: null,
  path: '/zone-1',
  level: 1,
  sortOrder: 1,
  status: 'active',
  metadata: {},
} as const

describe('EngineeringObjectsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    engineeringObjectsApiMock.listEngineeringObjects.mockResolvedValue([])
    engineeringObjectsApiMock.createEngineeringObject.mockResolvedValue(buildingObject)
    engineeringObjectsApiMock.updateEngineeringObject.mockResolvedValue(buildingObject)
    engineeringObjectsApiMock.deleteEngineeringObject.mockResolvedValue(undefined)
  })

  it('renders the engineering object tree instead of the old scope-dimension manager', async () => {
    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(engineeringObjectsApiMock.listEngineeringObjects).toHaveBeenCalledWith('project-1')
    })

    expect(screen.getByTestId('gantt-engineering-objects-dialog')).toBeInTheDocument()
    expect(screen.getByText('工程对象树')).toBeInTheDocument()
    expect(screen.queryByText('范围维度树')).not.toBeInTheDocument()
    expect(screen.getByTestId('scope-root')).toHaveTextContent('项目根')
    expect(screen.getByTestId('scope-root-add-phase')).toHaveTextContent('分期')
    expect(screen.getByTestId('scope-root-add-section')).toHaveTextContent('标段')
    expect(screen.getByTestId('scope-root-add-building')).toHaveTextContent('单体')
    expect(screen.getByTestId('scope-root-add-physical_zone')).toHaveTextContent('工程区域')
    expect(screen.queryByTestId('scope-root-add-floor')).not.toBeInTheDocument()
    expect(screen.queryByText('专业')).not.toBeInTheDocument()
    expect(screen.queryByText('子项目')).not.toBeInTheDocument()
    expect(screen.queryByText('自定义')).not.toBeInTheDocument()
  })

  it('renders cached allowed objects as one hierarchy and filters malformed object types', () => {
    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        initialObjectsLoaded
        initialObjects={[
          buildingObject,
          floorObject,
          {
            id: 'malformed-object',
            projectId: 'project-1',
            objectType: 'not_a_range_type',
            objectCode: 'BAD-001',
            objectName: '土建',
            parentId: null,
            path: '/malformed-object',
            level: 1,
            sortOrder: 2,
            status: 'active',
            metadata: {},
          } as any,
        ]}
      />,
    )

    expect(screen.getByText('1#楼')).toBeInTheDocument()
    expect(screen.getByText('L1')).toBeInTheDocument()
    expect(screen.queryByText('土建')).not.toBeInTheDocument()
    expect(engineeringObjectsApiMock.listEngineeringObjects).not.toHaveBeenCalled()
  })

  it('does not publish unchanged cached objects back to parent repeatedly', () => {
    const onObjectsChange = vi.fn()

    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        onObjectsChange={onObjectsChange}
        initialObjectsLoaded
        initialObjects={[buildingObject]}
      />,
    )

    expect(onObjectsChange).not.toHaveBeenCalled()
  })

  it('creates only seven-type range objects from the root tree actions', async () => {
    const createdBuilding = {
      ...buildingObject,
      id: 'building-2',
      objectCode: 'BLD-002',
      objectName: '2#楼',
      sortOrder: 1,
    }
    engineeringObjectsApiMock.createEngineeringObject.mockResolvedValueOnce(createdBuilding)
    engineeringObjectsApiMock.listEngineeringObjects.mockResolvedValueOnce([createdBuilding])

    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        initialObjectsLoaded
      />,
    )

    fireEvent.click(screen.getByTestId('scope-root-add-building'))
    fireEvent.change(screen.getByTestId('scope-add-name'), { target: { value: '2#楼' } })
    fireEvent.change(screen.getByLabelText('功能用途（必填）'), { target: { value: '住宅楼' } })
    fireEvent.click(screen.getByTestId('scope-add-submit'))

    await waitFor(() => {
      expect(engineeringObjectsApiMock.createEngineeringObject).toHaveBeenCalledWith(expect.objectContaining({
        projectId: 'project-1',
        objectType: 'building',
        objectName: '2#楼',
        parentId: null,
        metadata: expect.objectContaining({ functionalUsage: '住宅楼' }),
      }))
    })
    expect(JSON.stringify(engineeringObjectsApiMock.createEngineeringObject.mock.calls)).not.toContain('professional')
    expect(JSON.stringify(engineeringObjectsApiMock.createEngineeringObject.mock.calls)).not.toContain('subproject')
    expect(JSON.stringify(engineeringObjectsApiMock.createEngineeringObject.mock.calls)).not.toContain('custom')
  })

  it('keeps create-node forms lightweight and writes building method as methodVariantCodes', async () => {
    const createdBuilding = {
      ...buildingObject,
      id: 'building-2',
      objectCode: 'BLD-002',
      objectName: '2#楼',
      metadata: { functionalUsage: '住宅楼', methodVariantCodes: ['steel_frame'] },
    }
    engineeringObjectsApiMock.createEngineeringObject.mockResolvedValueOnce(createdBuilding)
    engineeringObjectsApiMock.listEngineeringObjects.mockResolvedValueOnce([createdBuilding])

    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        initialObjectsLoaded
      />,
    )

    fireEvent.click(screen.getByTestId('scope-root-add-building'))
    expect(screen.getByLabelText('名称')).toBeInTheDocument()
    expect(screen.getByLabelText('功能用途（必填）')).toBeInTheDocument()
    expect(screen.queryByLabelText('总高度 (m)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('地下深度 (m)')).not.toBeInTheDocument()

    expect(screen.getByTestId('scope-add-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('scope-add-name'), { target: { value: '2#楼' } })
    expect(screen.getByTestId('scope-add-submit')).toBeEnabled()
    fireEvent.click(screen.getByTestId('scope-add-submit'))
    expect(screen.getByText('请先为单体选择功能用途')).toBeInTheDocument()
    expect(engineeringObjectsApiMock.createEngineeringObject).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('功能用途（必填）'), { target: { value: '住宅楼' } })
    fireEvent.click(screen.getByRole('button', { name: '高级属性' }))
    fireEvent.change(screen.getByLabelText('工法（可覆盖项目默认）'), { target: { value: 'steel_frame' } })
    fireEvent.click(screen.getByTestId('scope-add-submit'))

    await waitFor(() => {
      expect(engineeringObjectsApiMock.createEngineeringObject).toHaveBeenCalledWith(expect.objectContaining({
        objectType: 'building',
        metadata: expect.objectContaining({
          functionalUsage: '住宅楼',
          methodVariantCodes: ['steel_frame'],
        }),
      }))
    })
    expect(engineeringObjectsApiMock.createEngineeringObject.mock.calls[0][0].metadata).not.toHaveProperty('methodVariantCode')
  })

  it('keeps physical-zone create-node metadata optional and collapsed by default', () => {
    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        initialObjectsLoaded
      />,
    )

    fireEvent.click(screen.getByTestId('scope-root-add-physical_zone'))

    expect(screen.getByLabelText('名称')).toBeInTheDocument()
    expect(screen.queryByLabelText('功能分类')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('关键房间标签')).not.toBeInTheDocument()

    expect(screen.queryByRole('button', { name: '高级属性' })).not.toBeInTheDocument()
  })

  it('keeps selected physical-zone metadata optional and collapsed by default', () => {
    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        initialObjectsLoaded
        initialObjects={[zoneObject]}
      />,
    )

    fireEvent.click(screen.getByTestId('scope-node-physical_zone-中心广场'))

    expect(screen.getByLabelText('名称')).toBeInTheDocument()
    expect(screen.queryByLabelText('功能分类')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('关键房间标签')).not.toBeInTheDocument()

    expect(screen.queryByRole('button', { name: '高级属性' })).not.toBeInTheDocument()
  })

  it('adds legal child nodes from the contextual side panel and edits selected node attributes', async () => {
    const buildingWithUsage = { ...buildingObject, metadata: { functionalUsage: '住宅楼' } }
    const updatedBuilding = { ...buildingWithUsage, objectName: '1#住院楼' }
    engineeringObjectsApiMock.createEngineeringObject.mockResolvedValueOnce(floorObject)
    engineeringObjectsApiMock.listEngineeringObjects.mockResolvedValueOnce([buildingWithUsage, floorObject])
    engineeringObjectsApiMock.updateEngineeringObject.mockResolvedValueOnce(updatedBuilding)
    engineeringObjectsApiMock.listEngineeringObjects.mockResolvedValueOnce([updatedBuilding, floorObject])

    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        initialObjectsLoaded
        initialObjects={[buildingWithUsage]}
      />,
    )

    const row = screen.getByTestId('scope-node-building-1#楼')
    fireEvent.click(row)
    expect(screen.getByTestId('scope-add-sibling')).toHaveTextContent('新增同级单体')
    expect(screen.getByTestId('scope-add-child-floor')).toHaveTextContent('新增下级楼层')
    fireEvent.click(screen.getByTestId('scope-add-child-floor'))
    expect(screen.getByText('在 1#楼 下新增楼层')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('scope-add-name'), { target: { value: 'L1' } })
    fireEvent.click(screen.getByTestId('scope-add-submit'))

    await waitFor(() => {
      expect(engineeringObjectsApiMock.createEngineeringObject).toHaveBeenCalledWith(expect.objectContaining({
        objectType: 'floor',
        objectName: 'L1',
        parentId: 'building-1',
      }))
    })

    const refreshedRow = screen.getByTestId('scope-node-building-1#楼')
    fireEvent.click(refreshedRow)
    fireEvent.change(screen.getByTestId('scope-edit-name'), { target: { value: '1#住院楼' } })
    expect(screen.queryByLabelText('排序')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('scope-edit-submit'))

    await waitFor(() => {
      expect(engineeringObjectsApiMock.updateEngineeringObject).toHaveBeenCalledWith('building-1', expect.objectContaining({
        objectName: '1#住院楼',
      }))
    })
  })

  it('supports adding a physical-zone child under a building for tower and podium decomposition', async () => {
    const buildingWithUsage = { ...buildingObject, metadata: { functionalUsage: 'residential' } }
    const podiumZone = {
      ...zoneObject,
      id: 'zone-podium',
      objectName: 'podium-zone',
      parentId: 'building-1',
      path: '/building-1/zone-podium',
      metadata: { physicalCategory: 'podium', childrenComplete: true },
    }
    engineeringObjectsApiMock.createEngineeringObject.mockResolvedValueOnce(podiumZone)
    engineeringObjectsApiMock.listEngineeringObjects.mockResolvedValueOnce([buildingWithUsage, podiumZone])

    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        initialObjectsLoaded
        initialObjects={[buildingWithUsage]}
      />,
    )

    fireEvent.click(screen.getByText(buildingObject.objectName))
    expect(screen.getByTestId('scope-add-child-floor')).toBeInTheDocument()
    expect(screen.getByTestId('scope-add-child-physical_zone')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('scope-add-child-physical_zone'))
    fireEvent.change(screen.getByTestId('scope-add-name'), { target: { value: 'podium-zone' } })
    fireEvent.click(screen.getByTestId('scope-add-submit'))

    await waitFor(() => {
      expect(engineeringObjectsApiMock.createEngineeringObject).toHaveBeenCalledWith(expect.objectContaining({
        objectType: 'physical_zone',
        objectName: 'podium-zone',
        parentId: 'building-1',
        metadata: expect.objectContaining({
          coverageRole: 'exclusive_scope',
          areaAccountingMode: 'counted',
          childrenComplete: true,
        }),
      }))
    })
  })

  it('hides physical-zone child action when a building is already decomposed by floors', () => {
    const buildingWithFloor = {
      ...buildingObject,
      metadata: { functionalUsage: 'residential', decompositionMode: 'by_floor' },
    }

    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        initialObjectsLoaded
        initialObjects={[buildingWithFloor, floorObject]}
      />,
    )

    fireEvent.click(screen.getByText(buildingObject.objectName))
    expect(screen.getByTestId('scope-add-child-floor')).toBeInTheDocument()
    expect(screen.queryByTestId('scope-add-child-physical_zone')).not.toBeInTheDocument()
  })

  it('adds same-level nodes from the contextual side panel without nesting them under the selected node', async () => {
    const createdBuilding = {
      ...buildingObject,
      id: 'building-2',
      objectCode: 'BLD-002',
      objectName: '2#楼',
      sortOrder: 2,
    }
    engineeringObjectsApiMock.createEngineeringObject.mockResolvedValueOnce(createdBuilding)
    engineeringObjectsApiMock.listEngineeringObjects.mockResolvedValueOnce([buildingObject, createdBuilding])

    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        initialObjectsLoaded
        initialObjects={[buildingObject]}
      />,
    )

    fireEvent.click(screen.getByTestId('scope-node-building-1#楼'))
    fireEvent.click(screen.getByTestId('scope-add-sibling'))
    expect(screen.getByText('与 1#楼 同级新增单体')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('scope-add-name'), { target: { value: '2#楼' } })
    fireEvent.change(screen.getByLabelText('功能用途（必填）'), { target: { value: '住宅楼' } })
    fireEvent.click(screen.getByTestId('scope-add-submit'))

    await waitFor(() => {
      expect(engineeringObjectsApiMock.createEngineeringObject).toHaveBeenCalledWith(expect.objectContaining({
        objectType: 'building',
        objectName: '2#楼',
        parentId: null,
        metadata: expect.objectContaining({ functionalUsage: '住宅楼' }),
      }))
    })
  })

  it('keeps a newly created child visible when the immediate refresh is stale', async () => {
    const onObjectsChange = vi.fn()
    engineeringObjectsApiMock.createEngineeringObject.mockResolvedValueOnce(floorObject)
    engineeringObjectsApiMock.listEngineeringObjects.mockResolvedValueOnce([buildingObject])

    render(
      <EngineeringObjectsDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
        onObjectsChange={onObjectsChange}
        initialObjectsLoaded
        initialObjects={[buildingObject]}
      />,
    )

    fireEvent.click(screen.getByText(buildingObject.objectName))
    fireEvent.click(screen.getByTestId('scope-add-child-floor'))
    fireEvent.change(screen.getByTestId('scope-add-name'), { target: { value: 'L1' } })
    fireEvent.click(screen.getByTestId('scope-add-submit'))

    await waitFor(() => {
      expect(engineeringObjectsApiMock.createEngineeringObject).toHaveBeenCalledWith(expect.objectContaining({
        objectType: 'floor',
        objectName: 'L1',
        parentId: 'building-1',
      }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('scope-node-floor-L1')).toBeInTheDocument()
    })
    expect(onObjectsChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'floor-1', objectName: 'L1', parentId: 'building-1' }),
    ]))
  })
})
