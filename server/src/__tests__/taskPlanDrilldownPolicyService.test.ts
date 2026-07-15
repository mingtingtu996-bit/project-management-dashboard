import { describe, expect, it } from 'vitest'

import {
  TASK_PLAN_DRILLDOWN_ROW_LIMIT,
  buildTaskPlanDrilldownScope,
  governTaskPlanDrilldownOperation,
  resolveTaskPlanDrilldownLevel,
  resolveTaskPlanDrilldownRecommendation,
} from '../services/taskPlanDrilldownPolicyService.js'

const PROJECT_ID = '00000000-0000-4000-8000-000000000001'
const PARENT_ID = '00000000-0000-4000-8000-000000000101'

function masterTask(overrides: Record<string, unknown> = {}) {
  return {
    id: PARENT_ID,
    project_id: PROJECT_ID,
    title: '主体结构施工',
    planned_start_date: '2026-06-01',
    planned_end_date: '2026-12-31',
    building_object_id: '00000000-0000-4000-8000-000000000201',
    phase_object_id: '00000000-0000-4000-8000-000000000202',
    standard_work_code: 'RMP-04-01-02',
    standard_work_name: '主体结构施工',
    wbs_node_type: 'process',
    standard_task_metadata: {
      executableDefaultMasterPlan: { status: 'executable_default_master_plan' },
      drilldownGenerationLineage: { level: 'master_control' },
    },
    ...overrides,
  }
}

const catalogs = [{
  id: 'china-building-main',
  name: '房建主体模板',
  source: 'builtin_seed' as const,
  nodeCount: 4,
  templateGroup: 'building_main' as const,
  nodes: [{
    id: 'STR-01',
    stableCode: 'STR-01',
    name: '主体结构工程',
    categoryType: 'sub_division' as const,
    defaultDurationDays: null,
    sourceStandard: 'GB 50300',
    sourceVersion: null,
    sourceClauseRef: null,
    reviewNeeded: false,
    webVerified: true,
    evidenceLevel: 'L1',
    verificationStatus: 'verified',
    applicableScope: null,
    children: [{
      id: 'STR-01-01',
      stableCode: 'STR-01-01',
      name: '钢筋混凝土主体结构',
      categoryType: 'item_work' as const,
      standardWorkCode: 'cast_in_place_structure',
      standardWorkName: '主体结构施工',
      defaultDurationDays: 90,
      sourceStandard: 'GB 50204',
      sourceVersion: null,
      sourceClauseRef: null,
      reviewNeeded: false,
      webVerified: true,
      evidenceLevel: 'L1',
      verificationStatus: 'verified',
      applicableScope: null,
      children: [{
        id: 'STR-01-01-P01',
        stableCode: 'STR-01-01-P01',
        name: '墙柱钢筋绑扎',
        categoryType: 'process' as const,
        defaultDurationDays: 4,
        sourceStandard: 'GB 50204',
        sourceVersion: null,
        sourceClauseRef: null,
        reviewNeeded: false,
        webVerified: true,
        evidenceLevel: 'L1',
        verificationStatus: 'verified',
        applicableScope: null,
        children: [],
      }],
    }],
  }],
}]

describe('task plan drilldown policy service', () => {
  it('uses independent generation lineage instead of display WBS type', () => {
    expect(resolveTaskPlanDrilldownLevel(masterTask())).toBe('master_control')
    expect(resolveTaskPlanDrilldownLevel(masterTask({
      standard_task_metadata: {
        drilldownGenerationLineage: { level: 'process_detail' },
      },
    }))).toBe('process_detail')
    expect(resolveTaskPlanDrilldownLevel(masterTask({
      wbs_node_type: 'activity_step',
      standard_task_metadata: {},
    }))).toBe('activity_step')
  })

  it('builds a locked scope only from authoritative parent object ids', () => {
    expect(buildTaskPlanDrilldownScope(masterTask({
      floor_object_id: '00000000-0000-4000-8000-000000000203',
      physical_zone_object_id: null,
    }))).toEqual({
      phase_object_id: '00000000-0000-4000-8000-000000000202',
      building_object_id: '00000000-0000-4000-8000-000000000201',
      floor_object_id: '00000000-0000-4000-8000-000000000203',
    })
  })

  it('resolves a nested item-work node whose next frontier contains process rows', () => {
    expect(resolveTaskPlanDrilldownRecommendation(masterTask(), catalogs)).toEqual(expect.objectContaining({
      templateId: 'china-building-main',
      selectedNodeIds: ['STR-01-01'],
      resolutionSource: 'standard_work_match',
    }))
  })

  it('prefers the bound T2 rhythm asset over a generic WBS process pack', () => {
    expect(resolveTaskPlanDrilldownRecommendation(masterTask({
      title: '1#楼主体结构标准层循环',
      standard_task_metadata: {
        drilldownGenerationLineage: { level: 'master_control' },
        durationAssetMapping: {
          t2RhythmTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        },
        residentialMasterPlan: { standardFloorCount: 24 },
      },
    }), catalogs)).toEqual(expect.objectContaining({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      selectedNodeIds: ['t2-residential-standard-floor-structure-rhythm-v1:floor-cycles'],
      resolutionSource: 'rhythm_asset_match',
      confidence: 'high',
    }))
  })

  it('expands a standard-floor concrete structure cycle through formwork, reinforcement, and concrete item works', () => {
    const concreteStructureCatalogs = [{
      id: 'china-gb55032-2022',
      name: '中国房屋建筑工程分部分项标准库',
      templateGroup: 'building_main',
      nodes: [{
        id: '02',
        name: '主体结构',
        categoryType: 'division',
        children: [{
          id: '02-01',
          name: '混凝土结构',
          categoryType: 'sub_division',
          children: [
            { id: '02-01-01', name: '模板', categoryType: 'item_work', children: [{ id: '02-01-01-P01', name: '模板安装', categoryType: 'process', children: [] }] },
            { id: '02-01-02', name: '钢筋', categoryType: 'item_work', children: [{ id: '02-01-02-P01', name: '钢筋加工', categoryType: 'process', children: [] }] },
            { id: '02-01-03', name: '混凝土', categoryType: 'item_work', children: [{ id: '02-01-03-P01', name: '混凝土浇筑', categoryType: 'process', children: [] }] },
          ],
        }],
      }],
    }]

    expect(resolveTaskPlanDrilldownRecommendation(masterTask({
      title: '1#楼主体结构标准层循环',
      standard_work_code: 'cast_in_place_formwork',
      standard_work_name: '主体结构标准层循环',
    }), concreteStructureCatalogs)).toEqual(expect.objectContaining({
      templateId: 'china-gb55032-2022',
      selectedNodeIds: ['02-01-01', '02-01-02', '02-01-03'],
      selectedNodeNames: ['模板', '钢筋', '混凝土'],
      resolutionSource: 'semantic_match',
      confidence: 'high',
    }))
  })

  it('overrides client scope and depth with the governed first expansion', () => {
    expect(TASK_PLAN_DRILLDOWN_ROW_LIMIT).toBe(80)
    expect(governTaskPlanDrilldownOperation(masterTask(), {
      type: 'template_generate',
      attachUnderRowId: 'forged-parent',
      scope: { building_object_id: 'forged-building' },
      generationDepth: 'activity_step',
      includeActivitySteps: true,
    })).toEqual(expect.objectContaining({
      attachUnderRowId: PARENT_ID,
      scope: {
        phase_object_id: '00000000-0000-4000-8000-000000000202',
        building_object_id: '00000000-0000-4000-8000-000000000201',
      },
      generationDepth: 'process',
      includeActivitySteps: false,
      drilldownMode: 'selected_children',
      drilldownGenerationLevel: 'process_detail',
      sourceParentTaskId: PARENT_ID,
    }))
  })

  it('advances a process detail only to activity steps and rejects deeper expansion', () => {
    expect(governTaskPlanDrilldownOperation(masterTask({
      standard_task_metadata: { drilldownGenerationLineage: { level: 'process_detail' } },
    }), {})).toEqual(expect.objectContaining({
      generationDepth: 'activity_step',
      includeActivitySteps: true,
      drilldownGenerationLevel: 'activity_step',
    }))

    expect(() => governTaskPlanDrilldownOperation(masterTask({
      standard_task_metadata: { drilldownGenerationLineage: { level: 'activity_step' } },
    }), {})).toThrowError(expect.objectContaining({
      code: 'TASK_PLAN_DRILLDOWN_MAX_DEPTH',
      statusCode: 409,
    }))
  })
})
