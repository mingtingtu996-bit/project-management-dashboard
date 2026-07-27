import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildPlanningBootstrapGuide,
  resolvePlanningBootstrapMode,
  PLANNING_BOOTSTRAP_PATHS,
} from '../services/planningBootstrap.js'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('planning bootstrap contract', () => {
  it('keeps only the explicit template-to-baseline bootstrap path and removes reverse/manual legacy paths', () => {
    expect(PLANNING_BOOTSTRAP_PATHS).toEqual([
      'template_to_baseline',
    ])

    expect(
      resolvePlanningBootstrapMode({
        status: '进行中',
        current_phase: 'construction',
        default_wbs_generated: false,
      })
    ).toBe('template_to_baseline')

    expect(
      resolvePlanningBootstrapMode({
        status: '已完成',
      })
    ).toBe('template_to_baseline')

    expect(
      resolvePlanningBootstrapMode({
        status: '未开始',
      })
    ).toBe('template_to_baseline')

    const guide = buildPlanningBootstrapGuide({
      project: {
        id: 'project-1',
        name: '示例项目',
        status: '进行中',
        current_phase: 'construction',
        default_wbs_generated: false,
      },
      taskCount: 6,
      milestoneCount: 2,
    })

    expect(guide.mode).toBe('template_to_baseline')
    expect(guide.title).toContain('计划编制')
    expect(guide.quickActions.map((item) => item.label)).toEqual([
      'WBS 模板 -> 项目基线',
    ])
    expect(guide.learnMore.title).toContain('四层时间线')
    expect(guide.learnMore.sections).toHaveLength(4)
    expect(guide.checklist.map((item) => item.title)).toEqual([
      '选择模板',
      '生成项目基线',
      '确认后启用',
    ])
  })

  it('registers only the explicit template baseline planning entrypoint', () => {
    const indexSource = readServerFile('src', 'index.ts')
    const routeSource = readServerFile('src', 'routes', 'wbs-templates.ts')
    const serviceSource = readServerFile('src', 'services', 'planningBootstrap.ts')

    expect(indexSource).toContain("app.use('/api/planning/wbs-templates', wbsTemplatesRouter)")
    expect(indexSource).not.toContain("app.use('/api/wbs-templates', wbsTemplatesRouter)")
    expect(routeSource).toContain('/bootstrap/context')
    expect(routeSource).toContain('/bootstrap/from-template')
    expect(routeSource).not.toContain('/bootstrap/from-completed-project')
    expect(routeSource).not.toContain('/bootstrap/from-ongoing-project')
    expect(routeSource).toContain('PlanningBootstrapService')
    expect(serviceSource).toContain('四层时间线')
    expect(serviceSource).toContain('WBS 模板 -> 项目基线')
    expect(serviceSource).not.toContain('已完成项目 -> WBS 模板')
    expect(serviceSource).not.toContain('在建项目 -> 初始化基线')
    expect(serviceSource).not.toContain('buildTemplateNodesFromTasks')
    expect(serviceSource).not.toContain('buildTemplateNodesFromMilestones')
    expect(serviceSource).not.toContain('buildProjectBootstrapNodes')
    expect(serviceSource).not.toContain('buildBaselineItemsFromPlanningBootstrapNodes')
    expect(serviceSource).not.toContain('buildTemplateSeedFromProject')
    expect(serviceSource).not.toContain('buildBaselineSeedFromProject')
    expect(serviceSource).not.toContain('buildProjectNodes')
    expect(serviceSource).not.toContain('buildTemplateSeed')
    expect(serviceSource).not.toContain('buildBaselineSeed')
  })
})
