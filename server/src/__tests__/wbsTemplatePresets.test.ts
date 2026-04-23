import { describe, expect, it } from 'vitest'

import {
  buildSuggestedWbsTemplate,
  getBuiltInWbsTemplatePresets,
  type WbsTemplateNode,
} from '../services/wbsTemplatePresets.js'

function flattenNames(nodes: WbsTemplateNode[]): string[] {
  const names: string[] = []

  const visit = (items: WbsTemplateNode[]) => {
    items.forEach((node) => {
      names.push(node.name)
      if (Array.isArray(node.children) && node.children.length > 0) {
        visit(node.children)
      }
    })
  }

  visit(nodes)
  return names
}

function sumLeafReferenceDays(nodes: WbsTemplateNode[]): number {
  return nodes.reduce((total, node) => {
    if (Array.isArray(node.children) && node.children.length > 0) {
      return total + sumLeafReferenceDays(node.children)
    }

    return total + node.reference_days
  }, 0)
}

describe('wbs template presets', () => {
  it('builds engineering-only residential suggestions for real estate prompts', () => {
    const preset = buildSuggestedWbsTemplate('18层住宅项目，框剪结构，计划24个月交付')
    const names = flattenNames(preset.nodes)

    expect(preset.suggestedType).toBe('住宅')
    expect(preset.suggestedName).toContain('住宅')
    expect(names).toContain('塔楼标准层结构循环')
    expect(names).toContain('机电单体调试与联调联试')
    expect(names).not.toContain('招商筹备')
    expect(names).not.toContain('土地获取')
  })

  it('builds commercial shell-and-core oriented suggestions without business-side work', () => {
    const preset = buildSuggestedWbsTemplate('办公写字楼及商业裙房，计划28个月')
    const names = flattenNames(preset.nodes)

    expect(preset.suggestedType).toBe('商业')
    expect(preset.suggestedName).toContain('商业办公综合体')
    expect(names).toContain('玻璃/铝板/石材幕墙安装')
    expect(names).toContain('联调联试与综合调试')
    expect(names).not.toContain('招商筹划')
    expect(names).not.toContain('开业筹备')
  })

  it('builds industrial suggestions around steel structure, enclosure, utilities and commissioning', () => {
    const preset = buildSuggestedWbsTemplate('物流仓库项目，钢结构，工期14个月')
    const names = flattenNames(preset.nodes)

    expect(preset.suggestedType).toBe('工业')
    expect(preset.suggestedName).toContain('钢结构厂房/仓储')
    expect(names).toContain('钢构件深化设计与加工')
    expect(names).toContain('压缩空气/工艺公用工程预留')
    expect(names).toContain('单机试运转与联动试车')
    expect(names).not.toContain('环评报告')
  })

  it('builds public building suggestions for school and hospital style projects', () => {
    const schoolPreset = buildSuggestedWbsTemplate('学校教学楼项目，计划26个月')
    const schoolNames = flattenNames(schoolPreset.nodes)
    const hospitalPreset = buildSuggestedWbsTemplate('医院门诊医技综合楼，计划30个月')
    const hospitalNames = flattenNames(hospitalPreset.nodes)

    expect(schoolPreset.suggestedType).toBe('公共建筑')
    expect(schoolPreset.suggestedName).toContain('学校')
    expect(schoolNames).toContain('教室、实验室及图书阅览空间配套')

    expect(hospitalPreset.suggestedType).toBe('公共建筑')
    expect(hospitalPreset.suggestedName).toContain('医院')
    expect(hospitalNames).toContain('净化、医气与洁净区域专项安装')
    expect(hospitalNames).not.toContain('运营筹备')
  })

  it('exports detailed built-in presets with reference days on all leaf nodes', () => {
    const presets = getBuiltInWbsTemplatePresets()

    expect(presets).toHaveLength(4)

    presets.forEach((preset) => {
      const names = flattenNames(preset.nodes)
      expect(names.length).toBeGreaterThan(20)

      const leaves = preset.nodes.flatMap(function collect(node): WbsTemplateNode[] {
        if (!node.children?.length) return [node]
        return node.children.flatMap(collect)
      })

      leaves.forEach((leaf) => {
        expect(leaf.reference_days).toBeGreaterThan(0)
        expect(leaf.id).toBeTruthy()
      })
    })
  })

  it('keeps built-in presets within practical baseline duration bands', () => {
    const presets = getBuiltInWbsTemplatePresets()
    const totals = Object.fromEntries(
      presets.map((preset) => [preset.templateType, sumLeafReferenceDays(preset.nodes)]),
    )

    expect(totals['住宅']).toBeGreaterThanOrEqual(560)
    expect(totals['住宅']).toBeLessThanOrEqual(640)

    expect(totals['商业']).toBeGreaterThanOrEqual(720)
    expect(totals['商业']).toBeLessThanOrEqual(820)

    expect(totals['工业']).toBeGreaterThanOrEqual(270)
    expect(totals['工业']).toBeLessThanOrEqual(330)

    expect(totals['公共建筑']).toBeGreaterThanOrEqual(650)
    expect(totals['公共建筑']).toBeLessThanOrEqual(730)
  })
})
