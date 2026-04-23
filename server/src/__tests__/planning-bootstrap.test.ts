import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildBaselineItemsFromTemplateNodes,
  buildPlanningBootstrapGuide,
  buildTemplateNodesFromTasks,
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
  it('keeps the three WBS generation paths and the onboarding copy aligned', () => {
    expect(PLANNING_BOOTSTRAP_PATHS).toEqual([
      'template_to_baseline',
      'completed_project_to_template',
      'ongoing_project_to_baseline',
    ])

    expect(
      resolvePlanningBootstrapMode({
        status: '进行中',
        current_phase: 'construction',
        default_wbs_generated: false,
      })
    ).toBe('ongoing_project_to_baseline')

    expect(
      resolvePlanningBootstrapMode({
        status: '已完成',
      })
    ).toBe('completed_project_to_template')

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

    expect(guide.mode).toBe('ongoing_project_to_baseline')
    expect(guide.title).toContain('计划编制')
    expect(guide.quickActions.map((item) => item.label)).toEqual([
      'WBS 模板 -> 项目基线',
      '已完成项目 -> WBS 模板',
      '在建项目 -> 初始化基线',
    ])
    expect(guide.learnMore.title).toContain('四层时间线')
    expect(guide.learnMore.sections).toHaveLength(4)
    expect(guide.checklist.map((item) => item.title)).toEqual([
      '先看现状',
      '自动补基线',
      '确认映射',
    ])

    const templateNodes = buildTemplateNodesFromTasks([
      {
        id: 'task-1',
        title: '主体施工',
        sort_order: 1,
        is_milestone: false,
      },
      {
        id: 'task-2',
        title: '安装工程',
        parent_id: 'task-1',
        sort_order: 2,
        is_milestone: false,
      },
    ])

    expect(templateNodes).toHaveLength(1)
    expect(templateNodes[0]?.children).toHaveLength(1)
    expect(templateNodes[0]?.children?.[0]?.title).toBe('安装工程')

    const baselineItems = buildBaselineItemsFromTemplateNodes(templateNodes, {
      projectId: 'project-1',
      baselineVersionId: 'baseline-1',
    })

    expect(baselineItems).toHaveLength(2)
    expect(baselineItems[0]).toMatchObject({
      project_id: 'project-1',
      baseline_version_id: 'baseline-1',
      title: '主体施工',
      parent_item_id: null,
    })
    expect(baselineItems[1]).toMatchObject({
      project_id: 'project-1',
      baseline_version_id: 'baseline-1',
      title: '安装工程',
    })
  })

  it('keeps template preset ids out of UUID baseline foreign keys', () => {
    const baselineItems = buildBaselineItemsFromTemplateNodes(
      [
        {
          title: '场地准备',
          source_id: 'P1',
          children: [
            {
              title: '放线复核',
              source_id: 'P1-1',
              reference_days: 3,
            },
          ],
        },
        {
          title: '主体封顶',
          source_id: '11111111-1111-4111-8111-111111111111',
          is_milestone: true,
          reference_days: 1,
        },
      ],
      {
        projectId: 'project-1',
        baselineVersionId: 'baseline-1',
        anchorDate: '2026-04-16',
      }
    )

    expect(baselineItems[0]).toMatchObject({
      title: '场地准备',
      source_task_id: null,
      source_milestone_id: null,
      mapping_status: 'pending',
    })
    expect(baselineItems[1]).toMatchObject({
      title: '放线复核',
      source_task_id: null,
      source_milestone_id: null,
      mapping_status: 'pending',
    })
    expect(baselineItems[2]).toMatchObject({
      title: '主体封顶',
      source_task_id: null,
      source_milestone_id: '11111111-1111-4111-8111-111111111111',
      mapping_status: 'mapped',
    })
  })

  it('registers the planning WBS route and dual planning entrypoints', () => {
    const indexSource = readServerFile('src', 'index.ts')
    const routeSource = readServerFile('src', 'routes', 'wbs-templates.ts')
    const serviceSource = readServerFile('src', 'services', 'planningBootstrap.ts')

    expect(indexSource).toContain("app.use('/api/planning/wbs-templates', wbsTemplatesRouter)")
    expect(indexSource).toContain("app.use('/api/wbs-templates', wbsTemplatesRouter)")
    expect(routeSource).toContain('/bootstrap/context')
    expect(routeSource).toContain('/bootstrap/from-template')
    expect(routeSource).toContain('/bootstrap/from-completed-project')
    expect(routeSource).toContain('/bootstrap/from-ongoing-project')
    expect(routeSource).toContain('PlanningBootstrapService')
    expect(serviceSource).toContain('四层时间线')
    expect(serviceSource).toContain('WBS 模板 -> 项目基线')
    expect(serviceSource).toContain('已完成项目 -> WBS 模板')
    expect(serviceSource).toContain('在建项目 -> 初始化基线')
  })
})
