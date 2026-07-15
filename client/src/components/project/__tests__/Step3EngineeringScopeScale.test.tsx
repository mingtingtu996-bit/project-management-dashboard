import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Step3EngineeringScopeScale } from '@/components/project/wizard/Step3EngineeringScopeScale'
import type { WizardDraftPayload } from '@/components/project/wizard/types'

type ScopeNodeForTest = {
  id?: string
  type: string
  name: string
  parentId?: string | null
  children?: ScopeNodeForTest[]
  metadata?: Record<string, unknown>
}

const draft: WizardDraftPayload = {
  step: 2,
  mode: 'new',
  businessType: 'hospital',
  detailLevel: 'standard',
}

function collectTypes(nodes: ScopeNodeForTest[]): string[] {
  return nodes.flatMap((node) => [node.type, ...collectTypes(node.children ?? [])])
}

function clickTreeNode(type: string, name: string) {
  fireEvent.click(screen.getAllByTestId(`scope-node-${type}-${name}`)[0])
}

function enableAdvancedTreeEdit() {
  fireEvent.click(screen.getByRole('button', { name: '高级树编辑' }))
}

function goToFloorConfig() {
  goToProjectSpaces()
  goToSpaceSubdivision()
}

function goToFloorUsage() {
  fireEvent.click(screen.getByRole('button', { name: /3确认范围/ }))
}

function goToProjectSpaces() {
  fireEvent.click(screen.getByRole('button', { name: /1项目空间/ }))
}

function goToPhysicalSpaces() {
  goToProjectSpaces()
}

function goToAssignment() {
  goToProjectSpaces()
}

function openOrganizationSettings() {
  fireEvent.click(screen.getByRole('button', { name: '分期/标段设置' }))
}

function goToSpaceSubdivision() {
  const nextButton = screen.queryByRole('button', { name: '下一步：细化空间' })
  fireEvent.click(nextButton ?? screen.getByRole('button', { name: /2细化空间/ }))
}

describe('Step3EngineeringScopeScale', () => {
  it('uses a commercial 3-step scope flow with organization and service range handled in context', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    const steps = screen.getByLabelText('范围体量建模步骤')
    expect(steps).toHaveTextContent('1项目空间')
    expect(steps).toHaveTextContent('2细化空间')
    expect(steps).toHaveTextContent('3确认范围')
    expect(steps).not.toHaveTextContent('组织划分')
    expect(steps).not.toHaveTextContent('服务范围')

    expect(screen.getByRole('heading', { name: '项目空间' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分期/标段设置' })).toBeInTheDocument()
    expect(screen.queryByLabelText('组织类型')).not.toBeInTheDocument()
    expect(screen.queryByText('机电标')).not.toBeInTheDocument()
    expect(screen.queryByText('精装标')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '细化空间' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '确认范围' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '分期/标段设置' }))
    expect(screen.getByLabelText('组织类型')).toHaveTextContent('分期')
    expect(screen.getByLabelText('组织类型')).toHaveTextContent('施工区域标段')
    const physicalType = screen.getByLabelText('物理空间类型')
    expect(physicalType).toHaveTextContent('单体建筑')
    expect(physicalType).toHaveTextContent('地下空间')
    expect(physicalType).toHaveTextContent('室外总平')
    expect(physicalType).toHaveTextContent('独立工程区')
    expect(screen.queryByText('室外/物理区域')).not.toBeInTheDocument()
  })

  it('groups project spaces into above-ground, underground, outdoor and independent-zone bands', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '室外总平' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'outdoor_site' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'independent_zone' } })
    fireEvent.change(screen.getByLabelText('独立工程区类型'), { target: { value: 'liquid_oxygen_station' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    const spaceMap = screen.getByLabelText('项目空间关系图')
    expect(within(spaceMap).getByLabelText('项目空间剖面图')).toBeInTheDocument()
    expect(within(screen.getByLabelText('项目空间剖面图')).getByText('现场空间剖面')).toBeInTheDocument()
    expect(within(screen.getByLabelText('项目空间剖面图')).getByText('地下底板 / 地下空间')).toBeInTheDocument()
    expect(within(screen.getByLabelText('项目空间剖面图')).getByText('室外场地范围')).toBeInTheDocument()
    expect(within(spaceMap).getByLabelText('项目空间明细')).toBeInTheDocument()
    expect(within(spaceMap).getByText('地上单体')).toBeInTheDocument()
    expect(within(spaceMap).getByText('楼栋、塔楼等主要竖向空间')).toBeInTheDocument()
    expect(within(spaceMap).getByText('道路、园建、管网等场地范围')).toBeInTheDocument()
    expect(within(spaceMap).getByText('地下空间')).toBeInTheDocument()
    expect(within(spaceMap).getAllByText('室外总平').length).toBeGreaterThan(0)
    expect(within(spaceMap).getAllByText('独立工程区').length).toBeGreaterThan(0)
    expect(within(screen.getByLabelText('地上单体空间带')).getByText('1#楼')).toBeInTheDocument()
    expect(within(screen.getByLabelText('地下空间空间带')).getByText('地下室')).toBeInTheDocument()
    expect(within(screen.getByLabelText('室外总平空间带')).getAllByText('室外总平').length).toBeGreaterThan(0)
    expect(within(screen.getByLabelText('独立工程区空间带')).getAllByText('液氧站').length).toBeGreaterThan(0)
  })

  it('keeps outdoor site and independent engineering zones distinct and defaults independent-zone names from subtype', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'hospital' }} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'outdoor_site' } })
    expect(screen.queryByLabelText('独立工程区类型')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '室外总平' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    let nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree[0]).toMatchObject({
      type: 'physical_zone',
      name: '室外总平',
      metadata: expect.objectContaining({
        physicalSpaceKind: 'outdoor_site',
        physicalCategory: 'outdoor_site_plan',
      }),
    })

    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'independent_zone' } })
    expect(screen.getByLabelText('独立工程区类型')).toHaveTextContent('液氧站')
    expect(screen.getByLabelText('独立工程区类型')).toHaveTextContent('可自动排程')
    expect(screen.getByLabelText('独立工程区类型')).toHaveTextContent('医疗废物暂存点')
    expect(screen.getByLabelText('独立工程区类型')).toHaveTextContent('其他独立工程区')
    expect(screen.getByText('已匹配专项模板或工效规则，生成时可触发对应工序包。')).toBeInTheDocument()
    expect(screen.queryByText('罐区')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('独立工程区类型'), { target: { value: 'liquid_oxygen_station' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree[1]).toMatchObject({
      type: 'physical_zone',
      name: '液氧站',
      metadata: expect.objectContaining({
        physicalSpaceKind: 'independent_engineering_zone',
        physicalCategory: 'liquid_oxygen_station',
        templateSupport: 'supported',
      }),
    })
  })

  it('filters building usages and independent engineering zones by selected business type', () => {
    const onUpdate = vi.fn()
    const { rerender } = render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'hospital' }} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    expect(screen.getByLabelText('功能用途')).toHaveTextContent('住院楼')
    expect(screen.getByLabelText('功能用途')).toHaveTextContent('医技楼')
    expect(screen.getByLabelText('功能用途')).toHaveTextContent('门诊楼')
    expect(screen.getByLabelText('功能用途')).not.toHaveTextContent('机房楼')
    expect(screen.getByLabelText('功能用途')).not.toHaveTextContent('主厂房')

    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'independent_zone' } })
    expect(screen.getByLabelText('独立工程区类型')).toHaveTextContent('液氧站')
    expect(screen.getByLabelText('独立工程区类型')).toHaveTextContent('医疗废物暂存点')
    expect(screen.getByLabelText('独立工程区类型')).not.toHaveTextContent('柴发区')
    expect(screen.getByText('独立工程区按场地设施或独立构筑物录入，不作为楼栋单体统计。')).toBeInTheDocument()

    rerender(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'data_center' }} onUpdate={onUpdate} />)
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'building' } })
    expect(screen.getByLabelText('功能用途')).toHaveTextContent('机房楼')
    expect(screen.getByLabelText('功能用途')).toHaveTextContent('运维楼')
    expect(screen.getByLabelText('功能用途')).not.toHaveTextContent('住院楼')

    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'independent_zone' } })
    expect(screen.getByLabelText('独立工程区类型')).toHaveTextContent('变电站')
    expect(screen.getByLabelText('独立工程区类型')).toHaveTextContent('柴发区')
    expect(screen.getByLabelText('独立工程区类型')).not.toHaveTextContent('液氧站')
  })

  it('marks unsupported independent engineering zones as manual supplements', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'general_civil' }} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'independent_zone' } })
    fireEvent.change(screen.getByLabelText('独立工程区类型'), { target: { value: 'custom_independent_zone' } })
    expect(screen.getByText('模板暂未直接覆盖，可先作为物理范围保留，后续在专项特征或任务清单中手工补充。')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '临时危废间' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree[0]).toMatchObject({
      type: 'physical_zone',
      name: '临时危废间',
      metadata: expect.objectContaining({
        physicalSpaceKind: 'independent_engineering_zone',
        physicalCategory: 'custom_independent_zone',
        templateSupport: 'manual',
      }),
    })
  })

  it('creates construction sections under phases and places physical spaces under the selected organization', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    openOrganizationSettings()
    fireEvent.change(screen.getByLabelText('组织名称'), { target: { value: '一期' } })
    fireEvent.click(screen.getByRole('button', { name: '添加组织' }))
    fireEvent.change(screen.getByLabelText('组织类型'), { target: { value: 'section' } })
    expect(screen.getByLabelText('所属分期')).toHaveTextContent('一期')
    fireEvent.change(screen.getByLabelText('组织名称'), { target: { value: 'A标' } })
    fireEvent.click(screen.getByRole('button', { name: '添加组织' }))

    goToPhysicalSpaces()
    expect(screen.getByLabelText('挂载位置')).toHaveTextContent('一期 / A标')
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(collectTypes(nextScopeTree)).toEqual(['phase', 'section', 'basement'])
    expect(JSON.stringify(nextScopeTree).match(/地下室/g)).toHaveLength(1)
  })

  it('uses project description as the fast draft path for organization and physical spaces', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'hospital' }} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    expect(screen.queryByRole('button', { name: '采用并编辑推荐草稿' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('项目范围描述'), {
      target: { value: '一期A标：1#住院楼22层，2#医技楼5层，B2地下室，室外总平。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '从描述生成空间草稿' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const serialized = JSON.stringify(nextScopeTree)
    expect(serialized).toContain('一期')
    expect(serialized).toContain('A标')
    expect(serialized).toContain('1#住院楼')
    expect(serialized).toContain('2#医技楼')
    expect(serialized).toContain('地下室')
    expect(serialized).toContain('室外总平')
    expect(collectTypes(nextScopeTree)).toContain('phase')
    expect(collectTypes(nextScopeTree)).toContain('section')
  })

  it('can mount basement and outdoor site at project overall even when phase and section exist', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    openOrganizationSettings()
    fireEvent.change(screen.getByLabelText('组织名称'), { target: { value: '一期' } })
    fireEvent.click(screen.getByRole('button', { name: '添加组织' }))
    fireEvent.change(screen.getByLabelText('组织类型'), { target: { value: 'section' } })
    fireEvent.change(screen.getByLabelText('组织名称'), { target: { value: 'A标' } })
    fireEvent.click(screen.getByRole('button', { name: '添加组织' }))

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    fireEvent.change(screen.getByLabelText('挂载位置'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'outdoor_site' } })
    fireEvent.change(screen.getByLabelText('挂载位置'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '室外总平' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree.map((node) => node.name)).toEqual(expect.arrayContaining(['一期', '地下室', '室外总平']))
    expect(nextScopeTree[0].children?.[0].name).toBe('A标')
    expect(JSON.stringify(nextScopeTree[0].children?.[0])).not.toContain('地下室')
    expect(JSON.stringify(nextScopeTree[0].children?.[0])).not.toContain('室外总平')
  })

  it('sets service range inline when shared spaces are added instead of using a standalone service step', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'building' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })

    expect(screen.getByLabelText('地下室服务对象')).toHaveTextContent('服务全部单体和独立工程区')
    expect(screen.getByLabelText('地下室服务对象')).toHaveTextContent('指定对象')
    fireEvent.click(screen.getByRole('radio', { name: '指定对象' }))
    expect(screen.getByLabelText('指定地下室服务对象')).toHaveTextContent('1#楼')
    fireEvent.click(screen.getByRole('checkbox', { name: '1#楼' }))
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const basement = nextScopeTree.find((node) => node.name === '地下室')
    expect(basement?.metadata?.serviceTargetNames).toEqual(['1#楼'])
    expect(basement?.metadata?.serviceTargetKinds).toEqual(['building'])
    expect(JSON.stringify(nextScopeTree)).toContain('"servedByScopeNames":["地下室"]')
    expect(screen.queryByRole('heading', { name: '服务对象设置' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('归属分期')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('归属施工区域标段')).not.toBeInTheDocument()
  })

  it('records inline service ranges against buildings and independent engineering zones with visible save feedback', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'building' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '2#楼' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'building' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'independent_zone' } })
    fireEvent.change(screen.getByLabelText('独立工程区类型'), { target: { value: 'liquid_oxygen_station' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    fireEvent.change(screen.getByLabelText('挂载位置'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.click(screen.getByRole('radio', { name: '指定对象' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '1#楼' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '液氧站' }))
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    expect(screen.getByText('地下室服务对象已随项目空间保存')).toBeInTheDocument()

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const basement = nextScopeTree.find((node) => node.name === '地下室')
    expect(basement?.metadata?.serviceTargetNames).toEqual(['1#楼', '液氧站'])
    expect(basement?.metadata?.serviceTargetKinds).toEqual(['building', 'independent_engineering_zone'])
    expect(basement?.metadata).not.toHaveProperty('sharedSectionNames')
    expect(JSON.stringify(nextScopeTree)).toContain('"servedByScopeNames":["地下室"]')
  })

  it('uses coverage language for outdoor site instead of basement service wording', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'building' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '室外总平' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'outdoor_site' } })

    expect(screen.getByLabelText('室外覆盖对象')).toHaveTextContent('覆盖全部单体和独立工程区')
    expect(screen.getByLabelText('室外覆盖对象')).toHaveTextContent('指定对象')
    expect(screen.queryByLabelText('地下室服务对象')).not.toBeInTheDocument()
  })

  it('switches selected physical-space cards immediately when users click an added space', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '2#楼' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    fireEvent.click(screen.getByRole('button', { name: /^1#楼$/ }))
    expect(screen.getByRole('button', { name: /^1#楼$/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^2#楼$/ }))
    expect(screen.getByRole('button', { name: /^2#楼$/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('uses space subdivision for vertical levels and horizontal work zones, while floor usage stays in node properties', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '室外总平' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'outdoor_site' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToAssignment()
    goToSpaceSubdivision()
    expect(screen.getByRole('heading', { name: '细化空间' })).toBeInTheDocument()
    expect(screen.getByLabelText('细分方式')).toHaveTextContent('水平施工分区')
    expect(screen.queryByLabelText('起始层')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('室外分区类型')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('分区名称'), { target: { value: '东区' } })
    fireEvent.click(screen.getByRole('button', { name: '生成分区' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree[0].children?.[0]).toMatchObject({
      type: 'physical_zone',
      name: '东区',
      metadata: expect.objectContaining({
        physicalSpaceKind: 'horizontal_work_zone',
        physicalCategory: 'outdoor_physical_zone',
        physicalCategoryLabel: '室外水平分区',
      }),
    })
    expect(nextScopeTree[0].children?.[0].metadata).not.toHaveProperty('decompositionMode')

    expect(screen.queryByRole('heading', { name: '确认范围' })).not.toBeInTheDocument()
  })

  it('selects subdivision targets from space cards instead of an object dropdown', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToSpaceSubdivision()

    expect(screen.queryByLabelText('配置对象')).not.toBeInTheDocument()
    const targetCards = screen.getByLabelText('可细分主空间')
    expect(within(targetCards).getByRole('button', { name: '配置 1#楼' })).toBeInTheDocument()
    expect(within(targetCards).getByRole('button', { name: '配置 地下室' })).toBeInTheDocument()

    fireEvent.click(within(targetCards).getByRole('button', { name: '配置 地下室' }))

    expect(within(targetCards).getByRole('button', { name: '配置 地下室' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('当前配置：地下室')).toBeInTheDocument()
    expect(screen.getByLabelText('细分方式')).toHaveTextContent('地下层')
  })

  it('keeps node properties out of working steps and edits them during scope review', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    clickTreeNode('building', '1#楼')
    expect(screen.queryByLabelText('名称')).not.toBeInTheDocument()

    goToFloorUsage()
    clickTreeNode('building', '1#楼')
    expect(screen.getByLabelText('名称')).toHaveValue('1#楼')
  })

  it('lets users review incomplete scope but clearly blocks WBS readiness until all spaces are configured', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'building' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToSpaceSubdivision()
    goToFloorUsage()

    expect(screen.getByRole('heading', { name: '确认范围' })).toBeInTheDocument()
    expect(screen.getByText('仍有 WBS 必要信息待补充，暂不能生成 WBS')).toBeInTheDocument()
    expect(screen.getAllByText('1#楼 · 缺少楼层信息').length).toBeGreaterThan(0)
    expect(screen.getByTestId('scope-readiness-blocked')).toBeInTheDocument()
  })

  it('shows a business-ready review checklist for generation, missing facts, and manual task supplements', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'general_civil' }} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'building' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'independent_zone' } })
    fireEvent.change(screen.getByLabelText('独立工程区类型'), { target: { value: 'custom_independent_zone' } })
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '临时危废间' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToFloorUsage()

    const checklist = screen.getByLabelText('生成前业务核对')
    expect(checklist).toHaveTextContent('生成前业务核对')
    expect(checklist).toHaveTextContent('可以自动排程')
    expect(checklist).toHaveTextContent('地下室')
    expect(checklist).toHaveTextContent('需要先补体量')
    expect(checklist).toHaveTextContent('1#楼 · 补充楼层信息')
    expect(checklist).toHaveTextContent('生成后补任务')
    expect(checklist).toHaveTextContent('临时危废间 · 后续补充或复核专项任务')
    expect(checklist).toHaveTextContent('返回项目空间修改空间')
    expect(checklist).toHaveTextContent('返回细化空间补楼层/地下层')
  })

  it('presents a commercial stepwise modeling flow with consistent wizard icons', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    expect(screen.getByLabelText('范围体量建模步骤')).toHaveTextContent('1项目空间')
    expect(screen.getByLabelText('范围体量建模步骤')).toHaveTextContent('2细化空间')
    expect(screen.getByLabelText('范围体量建模步骤')).toHaveTextContent('3确认范围')
    expect(screen.getByLabelText('范围树结果')).toBeInTheDocument()
    expect(screen.queryByLabelText('范围实时预览')).not.toBeInTheDocument()
    expect(screen.getByText('请先在上方物理空间添加范围')).toBeInTheDocument()
    expect(screen.queryByText(/左侧/)).not.toBeInTheDocument()
    expect(screen.queryByText(/右侧/)).not.toBeInTheDocument()

    goToPhysicalSpaces()
    expect(screen.getByLabelText('项目空间操作区')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '从描述生成空间草稿' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '从描述生成空间草稿' })).toBeInTheDocument()
    expect(screen.queryByText('推荐物理空间草稿')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '采用并编辑推荐草稿' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '从空白开始' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '项目空间' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '细化空间' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '确认范围' })).not.toBeInTheDocument()
    expect(screen.queryByText('结构体清单')).not.toBeInTheDocument()
    expect(screen.queryByText('结构体内部分解')).not.toBeInTheDocument()
    expect(screen.queryByText('空间闭合')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('项目范围描述'), {
      target: { value: '1#住宅楼26层，B2地下室，室外总平。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '从描述生成空间草稿' }))
    expect(screen.getAllByTestId('wizard-icon-building').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('wizard-icon-basement').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('wizard-icon-physical-zone').length).toBeGreaterThan(0)
  })

  it('generates an editable draft from a one-sentence project scope description', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'general_civil' }} onUpdate={onUpdate} />)

    expect(screen.getByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '项目空间' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分期/标段设置' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '组织划分' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('组织类型')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '细化空间' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '确认范围' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '项目整体规模' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('项目范围描述')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '一键按业态默认生成' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '从描述生成范围树' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('项目范围描述'), {
      target: {
        value: '一期A标：1#-3#住宅楼26层，4层共享商业裙房，B2地下室，室外总平；二期B标：4#楼18层。',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '从描述生成空间草稿' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree.map((node) => node.name)).toEqual(['一期', '二期'])
    const firstPhase = nextScopeTree[0]
    const firstSection = firstPhase.children?.[0]
    expect(firstSection?.name).toBe('A标')
    expect(firstSection?.children?.map((node) => node.name)).toEqual([
      '1#住宅楼',
      '2#住宅楼',
      '3#住宅楼',
      '共享裙房',
      '地下室',
      '室外总平',
    ])
    const sharedPodium = firstSection?.children?.find((node) => node.name === '共享裙房')
    expect(sharedPodium).toMatchObject({
      type: 'physical_zone',
      parentId: firstSection?.id,
      metadata: expect.objectContaining({
        physicalSpaceKind: 'shared_podium',
        structuralRole: 'podium',
        sharedScopeCandidate: true,
        serviceTargetNames: ['1#住宅楼', '2#住宅楼', '3#住宅楼'],
      }),
    })
    expect(sharedPodium?.children?.map((node) => node.name)).toEqual(['L1', 'L2', 'L3', 'L4'])
    expect(firstSection?.children?.find((node) => node.name === '地下室')?.metadata).toEqual(expect.objectContaining({
      basementLevelCount: 2,
    }))
    expect(nextScopeTree[1].children?.[0].children?.[0]).toMatchObject({
      name: '4#楼',
      metadata: expect.objectContaining({
        standardFloorCount: 18,
      }),
    })
    expect(screen.getByText(/已生成 2 个分期/)).toBeInTheDocument()
  })

  it('parses business-style phase section assignments and shared basements into an editable draft', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'general_civil' }} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('项目范围描述'), {
      target: {
        value: '项目有3期，1期有2个标段，2期有3个标段，3期不分段，一共15栋楼，其中1-3#在1期1标段，4#、5#在1期2标段，6#-8#在2期1标段，9#-13#在2期2标段，2期3标段就一个开闭所，14#、15#是3期，地下室有2个，1号地下室是1-8#共用，一共3层，2号地下室是12#-15#共用，一共5层，室外总平覆盖全部楼栋',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '从描述生成空间草稿' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const flat = (nodes: ScopeNodeForTest[]): ScopeNodeForTest[] => nodes.flatMap((node) => [node, ...flat(node.children ?? [])])
    const allNodes = flat(nextScopeTree)
    const findNode = (name: string) => allNodes.find((node) => node.name === name)

    expect(nextScopeTree.map((node) => node.name)).toEqual(['1期', '2期', '3期', '1号地下室', '2号地下室', '室外总平'])
    expect(nextScopeTree[0].children?.map((node) => node.name)).toEqual(['1标段', '2标段'])
    expect(nextScopeTree[1].children?.map((node) => node.name)).toEqual(['1标段', '2标段', '3标段'])
    expect(nextScopeTree[2].children?.map((node) => node.name)).toEqual(['14#住宅楼', '15#住宅楼'])
    expect(nextScopeTree[0].children?.[0].children?.map((node) => node.name)).toEqual(['1#住宅楼', '2#住宅楼', '3#住宅楼'])
    expect(nextScopeTree[0].children?.[1].children?.map((node) => node.name)).toEqual(['4#住宅楼', '5#住宅楼'])
    expect(nextScopeTree[1].children?.[0].children?.map((node) => node.name)).toEqual(['6#住宅楼', '7#住宅楼', '8#住宅楼'])
    expect(nextScopeTree[1].children?.[1].children?.map((node) => node.name)).toEqual(['9#住宅楼', '10#住宅楼', '11#住宅楼', '12#住宅楼', '13#住宅楼'])
    expect(nextScopeTree[1].children?.[2].children?.[0]).toMatchObject({
      name: '开闭所',
      type: 'physical_zone',
      metadata: expect.objectContaining({
        physicalSpaceKind: 'independent_engineering_zone',
        physicalCategory: 'switching_station',
        templateSupport: 'supported',
      }),
    })

    const buildingNodes = allNodes.filter((node) => node.type === 'building')
    expect(buildingNodes).toHaveLength(15)
    expect(buildingNodes.find((node) => node.name === '1#住宅楼')?.metadata).toEqual(expect.objectContaining({
      buildingNumber: 1,
      parsedFromDescription: true,
    }))
    expect(buildingNodes.find((node) => node.name === '1#住宅楼')?.metadata).not.toHaveProperty('standardFloorCount')

    expect(findNode('1号地下室')).toMatchObject({
      type: 'basement',
      metadata: expect.objectContaining({
        basementLevelCount: 3,
        serviceTargetNames: ['1#住宅楼', '2#住宅楼', '3#住宅楼', '4#住宅楼', '5#住宅楼', '6#住宅楼', '7#住宅楼', '8#住宅楼'],
      }),
    })
    expect(findNode('2号地下室')).toMatchObject({
      type: 'basement',
      metadata: expect.objectContaining({
        basementLevelCount: 5,
        serviceTargetNames: ['12#住宅楼', '13#住宅楼', '14#住宅楼', '15#住宅楼'],
      }),
    })
    expect(findNode('室外总平')).toMatchObject({
      type: 'physical_zone',
      metadata: expect.objectContaining({
        physicalSpaceKind: 'outdoor_site',
        physicalCategory: 'outdoor_site_plan',
        serviceTargetNames: expect.arrayContaining([...buildingNodes.map((node) => node.name), '开闭所']),
      }),
    })
    expect(buildingNodes.find((node) => node.name === '1#住宅楼')?.metadata?.servedByScopeNames).toEqual(expect.arrayContaining(['1号地下室']))
    expect(buildingNodes.find((node) => node.name === '12#住宅楼')?.metadata?.servedByScopeNames).toEqual(expect.arrayContaining(['2号地下室']))
    expect(screen.getByText(/已生成 3 个分期、5 个标段、15 栋单体、0 个共享裙房、2 个地下空间、1 个室外总平/)).toBeInTheDocument()
  })

  it('recognizes explicitly named supported independent zones even when the business type filter would not show them', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'general_civil' }} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('项目范围描述'), {
      target: {
        value: '项目有1期，1期有1个标段，1#在1期1标段，1期1标段有轨行区。',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '从描述生成空间草稿' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const flat = (nodes: ScopeNodeForTest[]): ScopeNodeForTest[] => nodes.flatMap((node) => [node, ...flat(node.children ?? [])])
    const railwayZone = flat(nextScopeTree).find((node) => node.name === '轨行区')

    expect(railwayZone).toMatchObject({
      type: 'physical_zone',
      metadata: expect.objectContaining({
        physicalSpaceKind: 'independent_engineering_zone',
        physicalCategory: 'railway_operation_zone',
        templateSupport: 'supported',
      }),
    })
  })

  it('treats floor counts parsed from description as WBS-ready without forcing users to expand every floor', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'general_civil' }} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('项目范围描述'), {
      target: {
        value: '一期A标：1#住宅楼26层，B2地下室，室外总平。',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '从描述生成空间草稿' }))
    fireEvent.click(screen.getByRole('button', { name: /3确认范围/ }))

    expect(screen.getByText('生成 WBS 的必要信息已具备，可以进入 WBS 生成。')).toBeInTheDocument()
    expect(screen.queryByTestId('scope-readiness-blocked')).not.toBeInTheDocument()
    expect(screen.getByLabelText('范围树结果')).toHaveTextContent('1#住宅楼')
    expect(screen.getByLabelText('范围树结果')).not.toHaveTextContent('L26')
  })

  it('explains which WBS task groups will be generated from physical-space facts during scope review', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      businessType: 'general_civil',
      scopeTree: [
        {
          id: 'building-1',
          type: 'building',
          name: '1#楼',
          parentId: null,
          expanded: true,
          metadata: { standardFloorCount: 26 },
          children: [{
            id: 'floor-refuge',
            type: 'floor',
            name: 'L13',
            parentId: 'building-1',
            expanded: true,
            metadata: { floorUsage: 'refuge' },
            children: [],
          }],
        },
        {
          id: 'basement-1',
          type: 'basement',
          name: '地下室',
          parentId: null,
          expanded: true,
          metadata: { basementLevelCount: 2 },
          children: [],
        },
        {
          id: 'outdoor-1',
          type: 'physical_zone',
          name: '室外总平',
          parentId: null,
          expanded: true,
          metadata: {
            physicalSpaceKind: 'outdoor_site',
            physicalCategory: 'outdoor_site_plan',
          },
          children: [],
        },
        {
          id: 'switching-1',
          type: 'physical_zone',
          name: '开闭所',
          parentId: null,
          expanded: true,
          metadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'switching_station',
            physicalCategoryLabel: '开闭所',
            templateSupport: 'supported',
          },
          children: [],
        },
        {
          id: 'pump-1',
          type: 'physical_zone',
          name: '消防水池泵房',
          parentId: null,
          expanded: true,
          metadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'fire_pump_room',
            physicalCategoryLabel: '消防水池泵房',
            templateSupport: 'supported',
          },
          children: [],
        },
        {
          id: 'railway-zone-1',
          type: 'physical_zone',
          name: '轨行区',
          parentId: null,
          expanded: true,
          metadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'railway_operation_zone',
            physicalCategoryLabel: '轨行区',
            templateSupport: 'supported',
          },
          children: [],
        },
        {
          id: 'manual-1',
          type: 'physical_zone',
          name: '临时堆场',
          parentId: null,
          expanded: true,
          metadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'custom_independent_zone',
            physicalCategoryLabel: '其他独立工程区',
            templateSupport: 'manual',
          },
          children: [],
        },
      ],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)
    goToFloorUsage()

    const generationBasis = screen.getByLabelText('WBS 自动生成依据')
    expect(within(generationBasis).getByText('系统将自动生成')).toBeInTheDocument()
    expect(within(generationBasis).getByText('地下室防水 / 基坑')).toBeInTheDocument()
    expect(within(generationBasis).getByText('室外工程')).toBeInTheDocument()
    expect(within(generationBasis).getByText('避难层专项')).toBeInTheDocument()
    expect(within(generationBasis).getByText('开闭所：电气供配电')).toBeInTheDocument()
    expect(within(generationBasis).getByText('消防水池泵房：泵房设备 / 消防联动')).toBeInTheDocument()
    expect(within(generationBasis).getByText('轨行区：营业线防护 / 轨道保护')).toBeInTheDocument()
    expect(within(generationBasis).getByText('未自动覆盖的空间需在后续任务清单中补充')).toBeInTheDocument()
  })

  it('parses quantity-based project descriptions into editable spaces instead of requiring manual half-day modeling', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'hospital' }} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('项目范围描述'), {
      target: {
        value: '一期A标：3栋26层住宅楼，1栋5层医技楼，4层共享商业裙房，B2地下室，室外总平。',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '从描述生成空间草稿' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const sectionChildren = nextScopeTree[0].children?.[0].children ?? []
    expect(sectionChildren.map((node) => node.name)).toEqual([
      '1#住宅楼',
      '2#住宅楼',
      '3#住宅楼',
      '4#医技楼',
      '共享裙房',
      '地下室',
      '室外总平',
    ])
    expect(sectionChildren.find((node) => node.name === '1#住宅楼')?.metadata?.standardFloorCount).toBe(26)
    expect(sectionChildren.find((node) => node.name === '4#医技楼')?.metadata?.standardFloorCount).toBe(5)
    expect(sectionChildren.find((node) => node.name === '共享裙房')?.parentId).toBe(nextScopeTree[0].children?.[0].id)
    expect(sectionChildren.find((node) => node.name === '地下室')?.metadata?.basementLevelCount).toBe(2)
  })

  it('guides scope modeling through inner steps while keeping the scope tree below the active task', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    expect(screen.getByLabelText('范围体量建模步骤')).toHaveTextContent('1项目空间')
    expect(screen.getByLabelText('范围树结果')).toBeInTheDocument()
    expect(screen.queryByLabelText('范围实时预览')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('总建筑面积 (m²)')).not.toBeInTheDocument()

    goToPhysicalSpaces()
    expect(screen.getByRole('heading', { name: '项目空间' })).toBeInTheDocument()

    goToAssignment()
    expect(screen.getByRole('heading', { name: '项目空间' })).toBeInTheDocument()

    goToSpaceSubdivision()
    expect(screen.getByRole('heading', { name: '细化空间' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '项目空间' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回项目空间' })).toBeInTheDocument()

    goToFloorUsage()
    expect(screen.getByRole('heading', { name: '确认范围' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回细化空间' })).toBeInTheDocument()
  })

  it('can delete added top-level spaces directly from the project-space cards', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    expect(screen.getByText((_, element) => element?.textContent === '已录入 1 个物理空间')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '删除 1#楼' }))

    expect(onUpdate.mock.calls.at(-1)?.[0]?.scopeTree).toEqual([])
    expect(screen.getByText('暂无项目空间')).toBeInTheDocument()
  })

  it('creates MECE scope tree from structured rows and marks special floors without direct tree editing', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'general_civil' }} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'building' } })
    fireEvent.change(screen.getByLabelText('功能用途'), { target: { value: '住宅楼' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToFloorConfig()
    fireEvent.change(screen.getByLabelText('细分方式'), { target: { value: 'by_floor' } })
    fireEvent.change(screen.getByLabelText('起始层'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('结束层'), { target: { value: '26' } })
    fireEvent.change(screen.getByLabelText('跳过层'), { target: { value: '13' } })
    fireEvent.click(screen.getByRole('button', { name: '生成楼层' }))

    goToFloorUsage()
    expect(screen.queryByLabelText('特殊楼层')).not.toBeInTheDocument()
    clickTreeNode('floor', 'L1')
    fireEvent.change(screen.getByLabelText('楼层性质'), { target: { value: 'ground_pilotis' } })

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const [building] = nextScopeTree
    expect(building).toMatchObject({
      type: 'building',
      name: '1#楼',
      metadata: expect.objectContaining({
        functionalUsage: '住宅楼',
        decompositionMode: 'by_floor',
        childrenComplete: true,
      }),
    })
    expect(building.children?.filter((node) => node.type === 'floor')).toHaveLength(25)
    expect(JSON.stringify(building)).not.toContain('L13')
    expect(JSON.stringify(building)).toContain('"floorUsage":"ground_pilotis"')
  })

  it('requires a floor-count fact before WBS generation but does not force full floor expansion', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    const initialTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(initialTree[0].metadata).not.toHaveProperty('childrenComplete')
    expect(screen.getAllByText('缺少楼层信息').length).toBeGreaterThan(0)

    goToFloorConfig()
    fireEvent.change(screen.getByLabelText('细分方式'), { target: { value: 'by_floor' } })
    fireEvent.change(screen.getByLabelText('起始层'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('结束层'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '生成楼层' }))

    const decomposedTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(decomposedTree[0].metadata).toEqual(expect.objectContaining({ childrenComplete: true }))
    expect(decomposedTree[0].metadata).toEqual(expect.objectContaining({ standardFloorCount: 2 }))
  })

  it('requires basement level count as the base fact but does not require horizontal subdivision for WBS readiness', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'basement-without-levels',
        type: 'basement',
        name: '地下室',
        parentId: null,
        children: [],
        expanded: true,
        metadata: { childrenComplete: true },
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorUsage()
    expect(screen.getByText('仍有 WBS 必要信息待补充，暂不能生成 WBS')).toBeInTheDocument()
    expect(screen.getByTestId('scope-readiness-blocked')).toHaveTextContent('地下室')
    expect(screen.getByTestId('scope-readiness-blocked')).toHaveTextContent('缺少地下层数')

    goToProjectSpaces()
    fireEvent.click(screen.getByRole('button', { name: '地下室' }))
    fireEvent.change(screen.getByLabelText('地下层数'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    goToFloorUsage()

    expect(screen.getByText('生成 WBS 的必要信息已具备，可以进入 WBS 生成。')).toBeInTheDocument()
  })

  it('shows entered structures as a structured ledger and reports scope closure diagnostics', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    expect(screen.getByText('待添加项目空间')).toBeInTheDocument()
    expect(screen.getByText('暂无项目空间')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'building' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    const structureLedger = screen.getByRole('table', { name: '已添加项目空间清单' })
    expect(structureLedger).toBeInTheDocument()
    expect(within(structureLedger).getByRole('cell', { name: '1#楼' })).toBeInTheDocument()
    expect(within(structureLedger).getByText('缺少楼层信息')).toBeInTheDocument()

    goToFloorConfig()
    fireEvent.change(screen.getByLabelText('细分方式'), { target: { value: 'by_floor' } })
    fireEvent.change(screen.getByLabelText('起始层'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('结束层'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '生成楼层' }))

    expect(screen.getAllByText(/WBS 信息已满足/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('1#楼').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/3 个楼层/).length).toBeGreaterThan(0)
  })

  it('can add a child floor under a selected building without deprecated object types', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    clickTreeNode('building', '1#楼')
    expect(screen.queryByTestId('scope-add-sibling')).not.toBeInTheDocument()
    expect(screen.queryByTestId('scope-add-child-floor')).not.toBeInTheDocument()
    enableAdvancedTreeEdit()
    expect(screen.queryByTitle('添加楼层')).not.toBeInTheDocument()
    expect(screen.getByTestId('scope-add-sibling')).toHaveTextContent('新增同级单体')
    fireEvent.click(screen.getByTestId('scope-add-child-floor'))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree
    expect(JSON.stringify(nextScopeTree)).toContain('floor')
    expect(JSON.stringify(nextScopeTree)).not.toContain('professional')
  })

  it('keeps structure list structural only and collects basement area on the basement node', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    expect(screen.queryByLabelText('地下室面积 (m²)')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    expect(screen.getByLabelText('地下层数')).toBeInTheDocument()
    expect(screen.queryByLabelText('地下室面积 (m²)')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    expect(screen.queryByLabelText('地下室面积 (m²)')).not.toBeInTheDocument()
    goToFloorUsage()
    expect(screen.getByLabelText('地下室面积 (m²)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('地下室面积 (m²)'), { target: { value: '45000' } })
    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree[0]).toMatchObject({
      type: 'basement',
      name: '地下室',
      metadata: expect.objectContaining({
        basementLevelCount: 2,
        basementAreaM2: 45000,
      }),
    })
  })

  it('supports tower/podium decomposition as physical zones under a building and floor batches under the zone', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    clickTreeNode('building', '1#楼')
    enableAdvancedTreeEdit()
    expect(screen.getByTestId('scope-add-child-floor')).toBeInTheDocument()
    expect(screen.getByTestId('scope-add-child-physical_zone')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('scope-add-child-physical_zone'))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '塔楼区' } })
    expect(screen.getByRole('button', { name: '批量生成楼层' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '批量生成楼层' }))
    fireEvent.change(document.getElementById('scope-floor-start') as HTMLInputElement, { target: { value: '5' } })
    fireEvent.change(document.getElementById('scope-floor-end') as HTMLInputElement, { target: { value: '22' } })
    fireEvent.change(document.getElementById('scope-floor-skip') as HTMLInputElement, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /生成 18 条楼层记录/ }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const serialized = JSON.stringify(nextScopeTree)
    expect(serialized).toContain('"type":"physical_zone"')
    expect(serialized).toContain('塔楼区')
    expect(serialized).toContain('"type":"floor"')
    expect(serialized).toContain('L5')
    expect(serialized).toContain('L22')
    expect(serialized).toContain('"decompositionMode":"by_physical_zone"')
    expect(serialized).toContain('"childrenComplete":true')
  })

  it('creates a shared podium service range that can serve multiple towers', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      businessType: 'general_civil',
      scopeTree: [{
        id: 'tower-1',
        type: 'building',
        name: '1#塔楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: { functionalUsage: '住宅楼' },
      }, {
        id: 'tower-2',
        type: 'building',
        name: '2#塔楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: { functionalUsage: '酒店客房楼' },
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorConfig()
    fireEvent.click(screen.getByRole('button', { name: '配置 1#塔楼' }))
    fireEvent.change(screen.getByLabelText('细分方式'), { target: { value: 'tower_podium' } })
    fireEvent.change(screen.getByLabelText('起始层'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('结束层'), { target: { value: '22' } })
    fireEvent.click(screen.getByRole('button', { name: '生成楼层' }))

    let nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const tower = nextScopeTree.find((node) => node.name === '1#塔楼')
    const podium = nextScopeTree.find((node) => node.name === '共享裙房')
    expect(tower?.children?.map((node) => node.name)).toEqual(['塔楼区'])
    expect(podium?.metadata).toEqual(expect.objectContaining({
      physicalSpaceKind: 'shared_podium',
      structuralRole: 'podium',
      sharedScopeCandidate: true,
      serviceTargetNames: ['1#塔楼'],
    }))
    expect(podium?.parentId).toBeNull()
    expect(screen.getByTestId('scope-node-physical_zone-共享裙房')).toHaveClass('border-l-4')

    clickTreeNode('physical_zone', '共享裙房')
    fireEvent.click(screen.getByRole('checkbox', { name: '2#塔楼' }))
    fireEvent.click(screen.getByRole('button', { name: '保存共享服务对象' }))

    nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const nextPodium = nextScopeTree.find((node) => node.name === '共享裙房')
    expect(nextPodium?.metadata?.serviceTargetNames).toEqual(['1#塔楼', '2#塔楼'])
    expect(JSON.stringify(nextScopeTree)).toContain('"servedByScopeNames":["共享裙房"]')
    expect(screen.getByText('共享服务对象已保存')).toBeInTheDocument()
    expect(screen.getByTestId('scope-node-physical_zone-共享裙房')).toHaveTextContent('服务：1#塔楼、2#塔楼')
  })

  it('does not expose shared service editing for tower zones created by tower-podium decomposition', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      businessType: 'general_civil',
      scopeTree: [{
        id: 'tower-1',
        type: 'building',
        name: '1#塔楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: { functionalUsage: '住宅楼' },
      }, {
        id: 'tower-2',
        type: 'building',
        name: '2#塔楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: { functionalUsage: '住宅楼' },
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorConfig()
    fireEvent.click(screen.getByRole('button', { name: '配置 1#塔楼' }))
    fireEvent.change(screen.getByLabelText('细分方式'), { target: { value: 'tower_podium' } })
    fireEvent.change(screen.getByLabelText('起始层'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('结束层'), { target: { value: '22' } })
    fireEvent.click(screen.getByRole('button', { name: '生成楼层' }))

    clickTreeNode('physical_zone', '塔楼区')
    expect(screen.queryByRole('button', { name: '保存共享服务对象' })).not.toBeInTheDocument()
    expect(screen.queryByText('共享服务对象')).not.toBeInTheDocument()

    clickTreeNode('physical_zone', '共享裙房')
    expect(screen.getByRole('button', { name: '已保存' })).toBeInTheDocument()
  })

  it('adds multiple custom physical-zone rows under outdoor site without professional-engineering tags', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '室外总平' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'outdoor_site' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToFloorConfig()
    fireEvent.change(screen.getByLabelText('细分方式'), { target: { value: 'by_physical_zone' } })
    expect(screen.queryByLabelText('室外分区类型')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('分区名称'), { target: { value: 'A区' } })
    fireEvent.click(screen.getByRole('button', { name: '生成分区' }))

    fireEvent.change(screen.getByLabelText('分区名称'), { target: { value: 'B区' } })
    fireEvent.click(screen.getByRole('button', { name: '生成分区' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const zones = nextScopeTree[0].children?.filter((node) => node.type === 'physical_zone') ?? []
    expect(zones.map((zone) => zone.name)).toEqual(['A区', 'B区'])
    expect(zones[0].children ?? []).toHaveLength(0)
    expect(zones[1].children ?? []).toHaveLength(0)
    expect(zones[0].metadata?.physicalCategory).toBe('outdoor_physical_zone')
    expect(screen.getByRole('table', { name: '空间细分结果清单' })).toHaveTextContent('A区')
    expect(screen.getByRole('table', { name: '空间细分结果清单' })).toHaveTextContent('B区')
  })

  it('treats basement and outdoor physical-zone structure rows as closed terminal scope when no deeper split is needed', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    fireEvent.change(screen.getByLabelText('地下层数'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '室外总平' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'outdoor_site' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    expect(screen.getAllByText(/WBS 信息已满足/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('地下室').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2 层地下/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('室外总平').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/室外总平整体/).length).toBeGreaterThan(0)
  })

  it('loads an existing physical space into the entry form for editing from the relationship diagram', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    fireEvent.change(screen.getByLabelText('地下层数'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    const undergroundBand = screen.getByLabelText('地下空间空间带')
    fireEvent.click(within(undergroundBand).getByRole('button', { name: '地下室' }))

    expect(screen.getByRole('heading', { name: '编辑当前空间' })).toBeInTheDocument()
    expect(screen.getByLabelText('空间名称')).toHaveValue('地下室')
    expect(screen.getByLabelText('物理空间类型')).toHaveValue('basement')
    expect(screen.getByLabelText('地下层数')).toHaveValue(2)
    expect(screen.getByRole('button', { name: '保存修改' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('地下层数'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree[0].metadata?.basementLevelCount).toBe(3)
    expect(screen.getAllByText(/3 层地下/).length).toBeGreaterThan(0)
    expect(screen.getByText('修改已保存')).toBeInTheDocument()
  })

  it('generates basement floor names as underground levels when a basement is decomposed', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    fireEvent.change(screen.getByLabelText('地下层数'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToFloorConfig()
    fireEvent.change(screen.getByLabelText('细分方式'), { target: { value: 'by_floor' } })
    expect(screen.queryByLabelText('起始层')).not.toBeInTheDocument()
    expect(screen.getByText('按已录入的 2 层地下室生成 B1-B2，不需要重复填写层数。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '生成地下层' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree[0].children?.map((node) => node.name)).toEqual(['B1', 'B2'])
    expect(JSON.stringify(nextScopeTree[0])).toContain('"floorOrder":-1')
    expect(JSON.stringify(nextScopeTree[0])).toContain('"floorOrder":-2')
  })

  it('splits basement by underground floors first and then horizontal zones under each floor', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '地下室' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'basement' } })
    fireEvent.change(screen.getByLabelText('地下层数'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToFloorConfig()
    fireEvent.change(screen.getByLabelText('细分方式'), { target: { value: 'by_floor' } })
    expect(screen.queryByLabelText('起始层')).not.toBeInTheDocument()
    expect(screen.getByText('按已录入的 2 层地下室生成 B1-B2，不需要重复填写层数。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '生成地下层' }))

    const targetCards = screen.getByLabelText('可细分主空间')
    expect(within(targetCards).queryByRole('button', { name: '配置 地下室 / B1' })).not.toBeInTheDocument()
    const childTargets = screen.getByLabelText('当前空间下级可继续划分')
    fireEvent.click(within(childTargets).getByRole('button', { name: '继续划分 B1' }))
    expect(within(childTargets).getByRole('button', { name: '继续划分 B1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('当前配置：地下室 / B1')).toBeInTheDocument()
    expect(screen.getByLabelText('细分方式')).toHaveTextContent('水平施工分区')

    fireEvent.change(screen.getByLabelText('分区名称'), { target: { value: 'A区' } })
    fireEvent.click(screen.getByRole('button', { name: '生成分区' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree).toHaveLength(1)
    expect(nextScopeTree[0].name).toBe('地下室')
    expect(nextScopeTree[0].children?.map((node) => node.name)).toEqual(['B1', 'B2'])
    expect(nextScopeTree[0].children?.[0].children?.map((node) => node.name)).toEqual(['A区'])
    expect(nextScopeTree[0].children?.[0].children?.[0].type).toBe('physical_zone')
    expect(nextScopeTree[0].children?.[0].children?.[0].parentId).toBe(nextScopeTree[0].children?.[0].id)
    expect(nextScopeTree[0].children?.[0].children?.[0].parentId).not.toBe(nextScopeTree[0].id)
  })

  it('keeps generated floors and tower-podium zones out of the primary subdivision cards', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToFloorConfig()
    fireEvent.change(screen.getByLabelText('细分方式'), { target: { value: 'tower_podium' } })
    fireEvent.change(screen.getByLabelText('起始层'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('结束层'), { target: { value: '22' } })
    fireEvent.click(screen.getByRole('button', { name: '生成楼层' }))

    const targetCards = screen.getByLabelText('可细分主空间')
    expect(within(targetCards).getByRole('button', { name: '配置 1#楼' })).toBeInTheDocument()
    expect(within(targetCards).queryByRole('button', { name: '配置 1#楼 / 塔楼区' })).not.toBeInTheDocument()
    expect(within(targetCards).queryByRole('button', { name: '配置 共享裙房' })).not.toBeInTheDocument()
    expect(within(targetCards).queryByRole('button', { name: '配置 1#楼 / 塔楼区 / L5' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('范围树结果')).toHaveTextContent('塔楼区')
    expect(screen.getByLabelText('范围树结果')).toHaveTextContent('共享裙房')
  })

  it('batch-marks special floors from the subdivision step and writes schedule-readable metadata', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'general_civil' }} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToFloorConfig()
    fireEvent.change(screen.getByLabelText('细分方式'), { target: { value: 'by_floor' } })
    fireEvent.change(screen.getByLabelText('起始层'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('结束层'), { target: { value: '22' } })
    fireEvent.click(screen.getByRole('button', { name: '生成楼层' }))

    const floorPicker = screen.getByLabelText('可标注楼层')
    fireEvent.click(within(floorPicker).getByRole('button', { name: 'L1' }))
    fireEvent.click(within(floorPicker).getByRole('button', { name: 'L13' }))
    expect(screen.getByLabelText('要标注的楼层')).toHaveValue('L1,L13')
    expect(screen.getByText('已选择 2 层 · 将标注为 避难层')).toBeInTheDocument()
    expect(screen.queryByLabelText('标注为')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '标注为避难层' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const floors = nextScopeTree[0].children ?? []
    expect(floors.find((node) => node.name === 'L1')?.metadata).toEqual(expect.objectContaining({ floorUsage: 'refuge' }))
    expect(floors.find((node) => node.name === 'L13')?.metadata).toEqual(expect.objectContaining({ floorUsage: 'refuge' }))
    expect(floors.find((node) => node.name === 'L2')?.metadata).not.toHaveProperty('floorUsage')
    expect(screen.getByRole('table', { name: '已标注特殊楼层' })).toHaveTextContent('L1')
    expect(screen.getByRole('table', { name: '已标注特殊楼层' })).toHaveTextContent('避难层')
    expect(screen.getByTestId('scope-node-floor-L1')).toHaveClass('border-l-4')
  })

  it('auto-expands known floor-count buildings when users mark special floors from a fast description draft', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={{ ...draft, businessType: 'general_civil' }} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('项目范围描述'), {
      target: { value: '一期A标：1#住宅楼26层，B2地下室，室外总平。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '从描述生成空间草稿' }))

    goToFloorConfig()
    fireEvent.click(screen.getByRole('button', { name: '配置 一期 / A标 / 1#住宅楼' }))

    expect(screen.getByText('当前空间已记录 26 层，但尚未展开楼层。输入 L1、L13 或 B1 后标注，系统会自动生成楼层记录。')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('要标注的楼层'), { target: { value: 'L13' } })
    fireEvent.click(screen.getByRole('button', { name: '标注为避难层' }))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const building = nextScopeTree[0].children?.[0].children?.find((node) => node.name === '1#住宅楼')
    expect(building?.children).toHaveLength(26)
    expect(building?.children?.find((node) => node.name === 'L13')?.metadata).toEqual(expect.objectContaining({ floorUsage: 'refuge' }))
    expect(screen.getByText('已自动展开 26 层，并标注 1 个特殊楼层。')).toBeInTheDocument()
    expect(screen.getByTestId('scope-node-floor-L13')).toHaveTextContent('避难层')
  })

  it('keeps independent engineering zones terminal by default and only subdivides outdoor site horizontally', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    goToPhysicalSpaces()
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'independent_zone' } })
    fireEvent.change(screen.getByLabelText('独立工程区类型'), { target: { value: 'liquid_oxygen_station' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '室外总平' } })
    fireEvent.change(screen.getByLabelText('物理空间类型'), { target: { value: 'outdoor_site' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    goToFloorConfig()

    const targetCards = screen.getByLabelText('可细分主空间')
    expect(within(targetCards).getByRole('button', { name: '配置 室外总平' })).toBeInTheDocument()
    expect(within(targetCards).queryByRole('button', { name: '配置 液氧站' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('细分方式')).toHaveTextContent('水平施工分区')
    expect(screen.queryByLabelText('起始层')).not.toBeInTheDocument()
  })

  it('does not allow direct floors and physical zones to be mixed under the same spatial parent', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        expanded: true,
        metadata: {},
        children: [{
          id: 'floor-1',
          type: 'floor',
          name: 'L1',
          parentId: 'building-1',
          expanded: true,
          metadata: { floorOrder: 1 },
          children: [],
        }],
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    clickTreeNode('building', '1#楼')
    enableAdvancedTreeEdit()
    expect(screen.getByTestId('scope-add-child-floor')).toBeInTheDocument()
    expect(screen.queryByTestId('scope-add-child-physical_zone')).not.toBeInTheDocument()
  })

  it('keeps the node property panel limited to node-owned facts', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      methodVariantCodes: ['cast_in_situ', 'steel_frame'],
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorUsage()
    clickTreeNode('building', '1#楼')

    expect(screen.getByLabelText('名称')).toBeInTheDocument()
    expect(screen.queryByLabelText('功能用途（必填）')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('标准层数')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('标准层面积 (m²)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('最大跨度 (m)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('高支模高度 (m)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('塔吊数量')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('施工电梯数量')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('范围核算方式')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('覆盖角色')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '高级属性' }))
    fireEvent.change(screen.getByLabelText('工法（可覆盖项目默认）'), { target: { value: 'steel_frame' } })
    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as Array<{ metadata: Record<string, unknown> }>
    expect(nextScopeTree[0].metadata.methodVariantCodes).toEqual(['steel_frame'])
    expect(nextScopeTree[0].metadata).not.toHaveProperty('methodVariantCode')
  })

  it('keeps functional area metadata optional and collapsed by default', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'functional-area-1',
        type: 'functional_area',
        name: '中心广场',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorUsage()
    clickTreeNode('functional_area', '中心广场')

    expect(screen.getByLabelText('名称')).toBeInTheDocument()
    expect(screen.queryByLabelText('功能分类')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('特殊房间类型')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '高级属性' }))
    expect(screen.getByLabelText('功能分类')).toBeInTheDocument()
    expect(screen.getByLabelText('特殊房间类型')).toBeInTheDocument()
  })

  it('derives scope accounting metadata internally instead of exposing technical ledger fields', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'physical-zone-1',
        type: 'physical_zone',
        name: '地下室一区',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }, {
        id: 'functional-area-1',
        type: 'functional_area',
        name: 'ICU',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorUsage()
    clickTreeNode('physical_zone', '地下室一区')
    expect(screen.queryByLabelText('范围核算方式')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('覆盖角色')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('区域面积 (m²)'), { target: { value: '12000' } })
    let serialized = JSON.stringify(onUpdate.mock.calls.at(-1)?.[0]?.scopeTree)
    expect(serialized).toContain('"areaAccountingMode":"counted"')
    expect(serialized).toContain('"coverageRole":"exclusive_scope"')
    expect(serialized).toContain('"areaM2":12000')

    clickTreeNode('functional_area', 'ICU')
    expect(screen.queryByLabelText('范围核算方式')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('覆盖角色')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '高级属性' }))
    fireEvent.change(screen.getByLabelText('功能分类'), { target: { value: '洁净区' } })
    serialized = JSON.stringify(onUpdate.mock.calls.at(-1)?.[0]?.scopeTree)
    expect(serialized).toContain('"areaAccountingMode":"not_counted"')
    expect(serialized).toContain('"coverageRole":"overlay_trigger"')
    expect(serialized).toContain('"functionalCategory":"洁净区"')
  })

  it('resets advanced metadata when switching selected scope nodes', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'floor-1',
        type: 'floor',
        name: 'L5',
        parentId: null,
        children: [],
        expanded: true,
        metadata: { floorOrder: 5 },
      }, {
        id: 'functional-area-1',
        type: 'functional_area',
        name: '中心广场',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorUsage()
    clickTreeNode('floor', 'L5')
    expect(screen.queryByLabelText('楼层序号')).not.toBeInTheDocument()
    expect(screen.getByLabelText('楼层性质')).toBeInTheDocument()

    clickTreeNode('functional_area', '中心广场')
    expect(screen.queryByLabelText('功能分类')).not.toBeInTheDocument()
  })

  it('captures special floor usage as schedule-readable floor metadata', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'floor-refuge',
        type: 'floor',
        name: 'L13 避难层',
        parentId: null,
        children: [],
        expanded: true,
        metadata: { floorOrder: 13 },
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorUsage()
    clickTreeNode('floor', 'L13 避难层')
    fireEvent.change(screen.getByLabelText('楼层性质'), { target: { value: 'refuge' } })

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree[0].metadata).toEqual(expect.objectContaining({
      floorOrder: 13,
      floorUsage: 'refuge',
    }))
  })

  it('marks special floor usage by floor node id when different buildings share the same floor name', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-a',
        type: 'building',
        name: '1#楼',
        parentId: null,
        expanded: true,
        metadata: {},
        children: [{
          id: 'floor-a-l1',
          type: 'floor',
          name: 'L1',
          parentId: 'building-a',
          children: [],
          expanded: true,
          metadata: { floorOrder: 1 },
        }],
      }, {
        id: 'building-b',
        type: 'building',
        name: '2#楼',
        parentId: null,
        expanded: true,
        metadata: {},
        children: [{
          id: 'floor-b-l1',
          type: 'floor',
          name: 'L1',
          parentId: 'building-b',
          children: [],
          expanded: true,
          metadata: { floorOrder: 1 },
        }],
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorUsage()
    fireEvent.click(screen.getAllByTestId('scope-node-floor-L1')[1])
    fireEvent.change(screen.getByLabelText('楼层性质'), { target: { value: 'refuge' } })

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const firstFloor = nextScopeTree[0].children?.[0]
    const secondFloor = nextScopeTree[1].children?.[0]
    expect(firstFloor?.metadata).not.toHaveProperty('floorUsage')
    expect(secondFloor?.metadata).toEqual(expect.objectContaining({ floorUsage: 'refuge' }))
    expect(screen.queryByRole('table', { name: '已标注特殊楼层' })).not.toBeInTheDocument()
  })

  it('can add a same-level building from the selected node context panel without nesting it', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    clickTreeNode('building', '1#楼')
    enableAdvancedTreeEdit()
    fireEvent.click(screen.getByTestId('scope-add-sibling'))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree).toHaveLength(2)
    expect(nextScopeTree[1].type).toBe('building')
    expect(nextScopeTree[0].children ?? []).toHaveLength(0)
  })

  it('supports floor batch generation with skipped floors', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    clickTreeNode('building', '1#楼')
    enableAdvancedTreeEdit()
    fireEvent.click(screen.getByRole('button', { name: '批量生成楼层' }))
    fireEvent.change(document.getElementById('scope-floor-start') as HTMLInputElement, { target: { value: '5' } })
    fireEvent.change(document.getElementById('scope-floor-end') as HTMLInputElement, { target: { value: '14' } })
    fireEvent.change(document.getElementById('scope-floor-skip') as HTMLInputElement, { target: { value: '13' } })
    fireEvent.click(screen.getByRole('button', { name: /生成 9 条楼层记录/ }))

    const serialized = JSON.stringify(onUpdate.mock.calls.at(-1)?.[0]?.scopeTree)
    expect(serialized).toContain('L12')
    expect(serialized).toContain('L14')
    expect(serialized).not.toContain('L13')
  })

  it('ignores skipped floors outside the selected batch range when counting records', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    clickTreeNode('building', '1#楼')
    enableAdvancedTreeEdit()
    fireEvent.click(screen.getByRole('button', { name: '批量生成楼层' }))
    fireEvent.change(document.getElementById('scope-floor-start') as HTMLInputElement, { target: { value: '1' } })
    fireEvent.change(document.getElementById('scope-floor-end') as HTMLInputElement, { target: { value: '3' } })
    fireEvent.change(document.getElementById('scope-floor-skip') as HTMLInputElement, { target: { value: '13' } })

    expect(screen.getByRole('button', { name: '生成 3 条楼层记录' })).toBeInTheDocument()
  })

  it('can duplicate a configured building and keeps deep floor usage editable', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        expanded: true,
        metadata: { functionalUsage: '住宅楼' },
        children: [{
          id: 'floor-1',
          type: 'floor',
          name: 'L5',
          parentId: 'building-1',
          children: [],
          expanded: true,
          metadata: { floorOrder: 5 },
        }],
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    clickTreeNode('building', '1#楼')
    enableAdvancedTreeEdit()
    fireEvent.click(screen.getByTitle('复制单体'))
    expect(JSON.stringify(onUpdate.mock.calls.at(-1)?.[0]?.scopeTree)).toContain('1#楼 副本')

    clickTreeNode('floor', 'L5')
    expect(screen.queryByLabelText('楼层序号')).not.toBeInTheDocument()
    expect(screen.getByLabelText('楼层性质')).toBeInTheDocument()
  })

  it('scrubs service relations when deleting a referenced scope object', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        expanded: true,
        metadata: {
          standardFloorCount: 10,
          servedByScopeObjectIds: ['basement-1'],
          servedByScopeNames: ['地下室'],
        },
        children: [],
      }, {
        id: 'basement-1',
        type: 'basement',
        name: '地下室',
        parentId: null,
        expanded: true,
        metadata: {
          basementLevelCount: 2,
          serviceTargetObjectIds: ['building-1'],
          serviceTargetNames: ['1#楼'],
          serviceTargetKinds: ['building'],
          serviceRangeSavedAt: '2026-06-01T00:00:00.000Z',
        },
        children: [],
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByTitle('删除 1#楼'))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    expect(nextScopeTree).toHaveLength(1)
    expect(nextScopeTree[0].name).toBe('地下室')
    expect(nextScopeTree[0].metadata).not.toHaveProperty('serviceTargetObjectIds')
    expect(nextScopeTree[0].metadata).not.toHaveProperty('serviceTargetNames')
    expect(nextScopeTree[0].metadata).not.toHaveProperty('serviceTargetKinds')
    expect(nextScopeTree[0].metadata).not.toHaveProperty('serviceRangeSavedAt')
  })

  it('duplicates buildings without carrying old service relation metadata', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        expanded: true,
        metadata: {
          functionalUsage: '住宅楼',
          servedByScopeObjectIds: ['basement-1'],
          servedByScopeNames: ['地下室'],
        },
        children: [{
          id: 'floor-1',
          type: 'floor',
          name: 'L5',
          parentId: 'building-1',
          children: [],
          expanded: true,
          metadata: {
            floorOrder: 5,
            serviceTargetObjectIds: ['legacy-target'],
            servedByScopeObjectIds: ['legacy-scope'],
          },
        }],
      }, {
        id: 'basement-1',
        type: 'basement',
        name: '地下室',
        parentId: null,
        expanded: true,
        metadata: {
          basementLevelCount: 2,
          serviceTargetObjectIds: ['building-1'],
          serviceTargetNames: ['1#楼'],
          serviceTargetKinds: ['building'],
        },
        children: [],
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    clickTreeNode('building', '1#楼')
    enableAdvancedTreeEdit()
    fireEvent.click(screen.getByTitle('复制单体'))

    const nextScopeTree = onUpdate.mock.calls.at(-1)?.[0]?.scopeTree as ScopeNodeForTest[]
    const clonedBuilding = nextScopeTree.find((node) => node.name === '1#楼 副本')
    expect(clonedBuilding).toBeDefined()
    expect(clonedBuilding?.metadata).not.toHaveProperty('servedByScopeObjectIds')
    expect(clonedBuilding?.metadata).not.toHaveProperty('servedByScopeNames')
    expect(clonedBuilding?.children?.[0].metadata).toEqual(expect.objectContaining({ floorOrder: 5 }))
    expect(clonedBuilding?.children?.[0].metadata).not.toHaveProperty('serviceTargetObjectIds')
    expect(clonedBuilding?.children?.[0].metadata).not.toHaveProperty('servedByScopeObjectIds')
  })

  it('blocks WBS readiness for duplicate floor facts in restored scope trees', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        expanded: true,
        metadata: {},
        children: [{
          id: 'floor-1',
          type: 'floor',
          name: 'L1',
          parentId: 'building-1',
          expanded: true,
          metadata: { floorOrder: 1 },
          children: [],
        }, {
          id: 'floor-duplicate',
          type: 'floor',
          name: '一层',
          parentId: 'building-1',
          expanded: true,
          metadata: { floorOrder: 1 },
          children: [],
        }],
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorUsage()

    expect(screen.getByText('仍有 WBS 必要信息待补充，暂不能生成 WBS')).toBeInTheDocument()
    expect(screen.getAllByText('1#楼 · 存在重复楼层').length).toBeGreaterThan(0)
  })

  it('blocks WBS readiness when child physical areas exceed the parent area', () => {
    const onUpdate = vi.fn()
    const scopedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-1',
        type: 'building',
        name: '1#楼',
        parentId: null,
        expanded: true,
        metadata: {
          standardFloorCount: 10,
          areaM2: 1000,
        },
        children: [{
          id: 'zone-a',
          type: 'physical_zone',
          name: '一区',
          parentId: 'building-1',
          expanded: true,
          metadata: { areaM2: 800 },
          children: [],
        }, {
          id: 'zone-b',
          type: 'physical_zone',
          name: '二区',
          parentId: 'building-1',
          expanded: true,
          metadata: { areaM2: 500 },
          children: [],
        }],
      }],
    }

    render(<Step3EngineeringScopeScale draft={scopedDraft} onUpdate={onUpdate} />)

    goToFloorUsage()

    expect(screen.getByText('仍有 WBS 必要信息待补充，暂不能生成 WBS')).toBeInTheDocument()
    expect(screen.getAllByText('1#楼 · 子空间面积超过父级').length).toBeGreaterThan(0)
  })

  it('offers phase as a root-level object and never exposes deprecated object buttons', () => {
    const onUpdate = vi.fn()
    render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    expect(screen.queryByRole('button', { name: '分期' })).not.toBeInTheDocument()
    enableAdvancedTreeEdit()
    expect(screen.getByRole('button', { name: '分期' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '标段' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '单体' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '地下室' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '物理区域' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '区域' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /专业|子项目|自定义/ })).not.toBeInTheDocument()
  })

  it('syncs when a saved or resumed draft scope tree changes while the editor stays mounted', () => {
    const onUpdate = vi.fn()
    const { rerender } = render(<Step3EngineeringScopeScale draft={draft} onUpdate={onUpdate} />)

    const resumedDraft: WizardDraftPayload = {
      ...draft,
      scopeTree: [{
        id: 'building-resumed',
        type: 'building',
        name: '已保存单体',
        parentId: null,
        children: [],
        expanded: true,
        metadata: {},
      }],
    }

    rerender(<Step3EngineeringScopeScale draft={resumedDraft} onUpdate={onUpdate} />)

    expect(screen.getByTestId('scope-node-building-已保存单体')).toBeInTheDocument()
  })
})
