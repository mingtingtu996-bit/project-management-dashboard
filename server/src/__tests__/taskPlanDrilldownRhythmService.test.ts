import { describe, expect, it } from 'vitest'

import {
  buildTaskPlanDrilldownParentContext,
  buildTaskPlanRhythmDrilldownRows,
} from '../services/taskPlanDrilldownRhythmService.js'

const PROJECT_ID = '00000000-0000-4000-8000-000000000001'
const PARENT_ID = '00000000-0000-4000-8000-000000000101'
const T2_TEMPLATE_ID = 't2-residential-standard-floor-structure-rhythm-v1'

function standardFloorParent() {
  return {
    id: PARENT_ID,
    project_id: PROJECT_ID,
    title: '1#楼主体结构标准层循环',
    planned_start_date: '2027-08-19',
    planned_end_date: '2028-03-17',
    building_object_id: 'building-1',
    execution_phase: 'superstructure_rhythm',
    execution_lane: 'tower_1',
    sort_order: 20,
    standard_task_metadata: {
      drilldownGenerationLineage: { level: 'master_control' },
      durationAssetMapping: { t2RhythmTemplateId: T2_TEMPLATE_ID },
      residentialMasterPlan: { standardFloorCount: 24 },
    },
  }
}

describe('task plan drilldown rhythm service', () => {
  it('materializes one ordered process row per standard-floor cycle inside the parent window', async () => {
    const parentContext = buildTaskPlanDrilldownParentContext(standardFloorParent())
    const generated = await buildTaskPlanRhythmDrilldownRows({
      parentContext,
      nextLevel: 'process_detail',
      generationBatchId: 'batch-floor-cycles',
      attachUnderRowId: PARENT_ID,
      projectId: PROJECT_ID,
      scope: { building_object_id: 'building-1' },
      resolveTemplate: async () => null,
      constructionCalendar: { basis: 'calendar_day', windows: [] },
    })

    expect(generated?.templateId).toBe(T2_TEMPLATE_ID)
    expect(generated?.rows).toHaveLength(24)
    expect(generated?.rows[0]).toEqual(expect.objectContaining({
      parentClientRowId: null,
      parentRowId: PARENT_ID,
      predecessorDependencies: [],
      values: expect.objectContaining({
        title: '1#楼标准层第01施工循环',
        planned_start_date: '2027-08-19',
        smart_reference_days: 9,
        wbs_node_type: 'process',
        row_projection_mode: 'schedule_row',
      }),
    }))
    expect(generated?.rows[1]?.predecessorDependencies).toEqual([
      expect.objectContaining({
        clientRowId: generated?.rows[0]?.clientRowId,
        dependencyType: 'FS',
        lagDays: 0,
      }),
    ])
    expect(generated?.rows.at(-1)?.values).toEqual(expect.objectContaining({
      title: '1#楼标准层第24施工循环',
      planned_end_date: '2028-03-17',
      smart_reference_days: 8,
    }))
    expect(generated?.rows.every((row) => (
      (row.values.standard_task_metadata as any)?.drilldownGenerationLineage?.level === 'process_detail'
    ))).toBe(true)
    expect(generated?.assetSummary).toEqual(expect.objectContaining({
      role: 'system_bootstrap',
      effectiveSource: 'system_bootstrap',
    }))
    expect(generated?.assetConsumptionReceipts).toEqual([
      expect.objectContaining({
        assetType: 't2_division_rhythm_template',
        stableCode: T2_TEMPLATE_ID,
        role: 'system_bootstrap',
        effectiveSource: 'system_bootstrap',
        status: 'effective_applied',
        changedFields: expect.arrayContaining(['task_selection', 'duration', 'dates', 'dependency']),
      }),
    ])
  })

  it('materializes the T2 child windows as ordered activity steps on a second explicit expansion', async () => {
    const cycleParent = {
      ...standardFloorParent(),
      id: '00000000-0000-4000-8000-000000000201',
      title: '1#楼标准层第01施工循环',
      planned_start_date: '2027-08-19',
      planned_end_date: '2027-08-27',
      standard_task_metadata: {
        drilldownGenerationLineage: { level: 'process_detail' },
        taskPlanRhythmDrilldown: {
          t2RhythmTemplateId: T2_TEMPLATE_ID,
          cycleIndex: 1,
          cycleCount: 24,
        },
      },
    }
    const generated = await buildTaskPlanRhythmDrilldownRows({
      parentContext: buildTaskPlanDrilldownParentContext(cycleParent),
      nextLevel: 'activity_step',
      generationBatchId: 'batch-floor-window',
      attachUnderRowId: cycleParent.id,
      projectId: PROJECT_ID,
      scope: { building_object_id: 'building-1' },
      resolveTemplate: async () => null,
      constructionCalendar: { basis: 'calendar_day', windows: [] },
    })

    expect(generated?.rows).toHaveLength(8)
    expect(generated?.rows.map((row) => row.values.title)).toEqual([
      '楼层测量放线与控制线复核',
      '竖向钢筋绑扎及预留预埋',
      '墙柱模板安装与加固',
      '梁板模板及支撑体系',
      '梁板钢筋绑扎及机电预埋',
      '隐蔽验收完成及混凝土浇筑',
      '混凝土养护及早拆条件确认',
      '本层质量检查与上层工作面移交',
    ])
    expect(generated?.rows[1]?.predecessorDependencies).toEqual([
      expect.objectContaining({ dependencyType: 'SS', lagDays: 1 }),
    ])
    expect(generated?.rows[4]?.values).toEqual(expect.objectContaining({
      planned_start_date: '2027-08-23',
      planned_end_date: '2027-08-23',
    }))
    expect(generated?.rows[6]?.values).toEqual(expect.objectContaining({
      planned_start_date: '2027-08-25',
      planned_end_date: '2027-08-26',
      smart_reference_days: 2,
    }))
    expect(generated?.rows.at(-1)?.values).toEqual(expect.objectContaining({
      planned_end_date: '2027-08-27',
      wbs_node_type: 'activity_step',
      row_projection_mode: 'schedule_row',
    }))
    expect(generated?.rows.slice(1).every((row) => (
      row.predecessorDependencies.every((dependency) => (
        dependency.dependencyRuleEvidence?.source === 'construction_task_dependency_constraint_rule_system'
        && dependency.dependencyRuleEvidence?.relationLayerKey === 'same_parent_internal_flow'
        && dependency.dependencyRuleEvidence?.layerStack.includes('same_parent_internal_flow')
      ))
    ))).toBe(true)
  })

  it('uses the active governed T2 version when it changes the executable floor rhythm', async () => {
    const generated = await buildTaskPlanRhythmDrilldownRows({
      parentContext: buildTaskPlanDrilldownParentContext(standardFloorParent()),
      nextLevel: 'process_detail',
      generationBatchId: 'batch-active-t2',
      attachUnderRowId: PARENT_ID,
      projectId: PROJECT_ID,
      scope: { building_object_id: 'building-1' },
      resolveTemplate: async () => ({
        templateId: T2_TEMPLATE_ID,
        sourceVersion: 'runtime-t2-v2',
        rhythm: {
          parentWindowDays: { p20: 5, p50: 7, p80: 8 },
        },
        __stableCode: T2_TEMPLATE_ID,
        __resolverSource: 'project_override',
        __resolverVersionId: 'runtime-version-2',
      } as any),
      constructionCalendar: { basis: 'calendar_day', windows: [] },
    })

    expect(generated?.rows).toHaveLength(24)
    expect(generated?.rows[0]?.values.smart_reference_days).toBe(8)
    expect(generated?.rows.at(-1)?.values.planned_end_date).toBe('2028-02-26')
    expect(generated?.parentWindowFit).toEqual(expect.objectContaining({
      decision: 'p80_with_boundary_buffer',
      bufferProductionDays: 20,
      selectedCycleProductionDays: 8,
    }))
    expect(generated?.assetSummary).toEqual(expect.objectContaining({
      sourceVersion: 'runtime-t2-v2',
      role: 'stable_runtime',
      effectiveSource: 'project_stable',
      versionId: 'runtime-version-2',
    }))
    expect(generated?.assetConsumptionReceipts[0]).toEqual(expect.objectContaining({
      status: 'effective_applied',
      effectiveSource: 'project_stable',
      changedFields: expect.arrayContaining(['duration', 'dates', 'buffer']),
    }))
  })

  it('returns an explicit conflict when the parent window cannot satisfy the T2 P20 minimum', async () => {
    const parent = standardFloorParent()
    parent.planned_end_date = '2027-10-31'
    const generated = await buildTaskPlanRhythmDrilldownRows({
      parentContext: buildTaskPlanDrilldownParentContext(parent),
      nextLevel: 'process_detail',
      generationBatchId: 'batch-short-parent',
      attachUnderRowId: PARENT_ID,
      projectId: PROJECT_ID,
      scope: { building_object_id: 'building-1' },
      resolveTemplate: async () => null,
      constructionCalendar: { basis: 'calendar_day', windows: [] },
    })

    expect(generated?.rows).toEqual([])
    expect(generated?.parentWindowFit).toEqual(expect.objectContaining({
      decision: 'blocked_by_minimum_rhythm_conflict',
      availableProductionDays: 74,
      minimumRequiredProductionDays: 120,
    }))
    expect(generated?.assetConsumptionReceipts).toEqual([
      expect.objectContaining({
        status: 'blocked_by_conflict',
        changedFields: [],
        reasonCodes: expect.arrayContaining(['parent_window_shorter_than_t2_p20_minimum']),
      }),
    ])
  })

  it('places cycle boundaries on construction production days', async () => {
    const parent = standardFloorParent()
    parent.planned_start_date = '2027-01-01'
    parent.planned_end_date = '2027-01-20'
    parent.standard_task_metadata.residentialMasterPlan.standardFloorCount = 2
    const generated = await buildTaskPlanRhythmDrilldownRows({
      parentContext: buildTaskPlanDrilldownParentContext(parent),
      nextLevel: 'process_detail',
      generationBatchId: 'batch-calendar-t2',
      attachUnderRowId: PARENT_ID,
      projectId: PROJECT_ID,
      scope: { building_object_id: 'building-1' },
      resolveTemplate: async () => null,
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [{
          calendarKind: 'winter_shutdown',
          startDate: '2027-01-05',
          endDate: '2027-01-06',
        }],
      },
    })

    expect(generated?.parentWindowFit).toEqual(expect.objectContaining({
      calendarBasis: 'official_construction_calendar_seed',
      availableProductionDays: 18,
    }))
    expect(generated?.rows.map((row) => [
      row.values.planned_start_date,
      row.values.planned_end_date,
    ])).toEqual([
      ['2027-01-01', '2027-01-11'],
      ['2027-01-12', '2027-01-20'],
    ])
  })
})
