import { describe, expect, it } from 'vitest'

import { evaluateScopeTemplateCoverage } from '../services/scopeTemplateCoverageService.js'
import type { ScopeAssignmentRule } from '../services/scopeAssignmentRulesService.js'

const rules: ScopeAssignmentRule[] = [
  {
    businessType: 'general_civil',
    itemPackPattern: 'OUT-',
    effect: 'assign_to_scope_object',
    targetObjectType: 'physical_zone',
    matchMetadata: { physicalSpaceKind: 'outdoor_site' },
    priority: 1,
  },
  {
    businessType: 'general_civil',
    itemPackPattern: 'ELE-05-01-01',
    effect: 'assign_to_scope_object',
    targetObjectType: 'physical_zone',
    matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'switching_station' },
    priority: 1,
  },
  {
    businessType: 'general_civil',
    itemPackPattern: 'UHR-03-01-02|UHR-04-01-09',
    effect: 'assign_to_scope_object',
    targetObjectType: 'floor',
    matchMetadata: { floorUsage: 'refuge' },
    priority: 1,
  },
  {
    businessType: 'hospital',
    itemPackPattern: 'CLN-01',
    effect: 'assign_to_functional_area',
    functionalAreaCategory: '手术区',
    priority: 1,
  },
]

describe('evaluateScopeTemplateCoverage', () => {
  it('classifies supported spaces, unsupported independent zones, and missing required scopes', () => {
    const result = evaluateScopeTemplateCoverage({
      scopeAssignmentRules: rules,
      generationScope: {
        scope_objects: [
          { id: 'building-1', type: 'building', name: '1#楼', metadata: { functionalUsage: '住宅楼' } },
          { id: 'basement-1', type: 'basement', name: '地下室', metadata: { basementLevelCount: 2 } },
          { id: 'outdoor-1', type: 'physical_zone', name: '室外总平', metadata: { physicalSpaceKind: 'outdoor_site' } },
          { id: 'switch-1', type: 'physical_zone', name: '开闭所', metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'switching_station' } },
          { id: 'yard-1', type: 'physical_zone', name: '临设加工区', metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'temporary_yard' } },
          { id: 'or-1', type: 'functional_area', name: '中心手术部', metadata: { functionalCategory: '手术区' } },
          { id: 'floor-1', type: 'floor', name: 'L13 避难层', metadata: { floorUsage: 'refuge' } },
        ],
      },
      governanceWarnings: [
        {
          code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
          details: {
            missingObjectLabel: '消防泵房',
            targetObjectType: 'physical_zone',
            itemPackPattern: 'FIR-05-01-02',
          },
        },
      ],
    })

    expect(result.summary).toEqual({
      autoSchedulableCount: 6,
      manualTaskRequiredCount: 1,
      missingRequiredScopeCount: 1,
    })
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scopeName: '1#楼',
        status: 'auto_schedulable',
        title: '1#楼 会自动生成并挂接任务',
        detail: expect.stringContaining('标准楼栋/地下空间网络'),
        action: expect.stringContaining('任务列表'),
      }),
      expect.objectContaining({ scopeName: '地下室', status: 'auto_schedulable' }),
      expect.objectContaining({
        scopeName: '室外总平',
        status: 'auto_schedulable',
        title: '室外总平 会自动生成并挂接任务',
        detail: expect.stringContaining('已命中 OUT- 的模板挂接规则'),
        matchedRulePatterns: ['OUT-'],
      }),
      expect.objectContaining({ scopeName: '开闭所', status: 'auto_schedulable', matchedRulePatterns: ['ELE-05-01-01'] }),
      expect.objectContaining({ scopeName: '中心手术部', status: 'auto_schedulable', matchedRulePatterns: ['CLN-01'] }),
      expect.objectContaining({
        scopeName: '临设加工区',
        status: 'manual_task_required',
        title: '临设加工区 已进入范围树，但暂无自动专项任务',
        detail: expect.stringContaining('当前模板规则还没有覆盖'),
        action: expect.stringContaining('生成后补充该空间的专项任务'),
      }),
      expect.objectContaining({ scopeName: 'L13 避难层', status: 'auto_schedulable', matchedRulePatterns: ['UHR-03-01-02|UHR-04-01-09'] }),
      expect.objectContaining({
        scopeName: '消防泵房',
        status: 'missing_required_scope',
        title: '消防泵房缺少对应空间，暂不能生成',
        detail: expect.stringContaining('项目空间中没有可挂接的消防泵房对象'),
        action: expect.stringContaining('回到范围体量补齐该空间'),
      }),
    ]))
  })

  it('does not ask users to supplement template tasks for horizontal scheduling partitions', () => {
    const result = evaluateScopeTemplateCoverage({
      scopeAssignmentRules: rules,
      generationScope: {
        scope_objects: [
          { id: 'building-1', type: 'building', name: '1#楼', metadata: { functionalUsage: '住宅楼' } },
          { id: 'floor-1', type: 'floor', name: 'L1', parentId: 'building-1', metadata: { floorOrder: 1 } },
          {
            id: 'zone-a',
            type: 'physical_zone',
            name: 'A区',
            parentId: 'floor-1',
            metadata: {
              physicalSpaceKind: 'horizontal_work_zone',
              physicalCategory: 'construction_work_zone',
              childrenComplete: true,
            },
          },
          {
            id: 'zone-b',
            type: 'physical_zone',
            name: 'B区',
            parentId: 'floor-1',
            metadata: {
              physicalSpaceKind: 'horizontal_work_zone',
              physicalCategory: 'construction_work_zone',
              childrenComplete: true,
            },
          },
        ],
      },
    })

    expect(result.items.map((item) => item.scopeName)).toEqual(['1#楼'])
    expect(result.summary).toEqual({
      autoSchedulableCount: 1,
      manualTaskRequiredCount: 0,
      missingRequiredScopeCount: 0,
    })
  })

  it('treats partially supported independent engineering zones as manual review until a concrete attachment rule exists', () => {
    const result = evaluateScopeTemplateCoverage({
      scopeAssignmentRules: rules,
      generationScope: {
        scope_objects: [
          {
            id: 'utility-station-1',
            type: 'physical_zone',
            name: '公用工程站',
            metadata: {
              physicalSpaceKind: 'independent_engineering_zone',
              physicalCategory: 'utility_station',
              templateSupport: 'partial',
            },
          },
        ],
      },
    })

    expect(result.summary).toEqual({
      autoSchedulableCount: 0,
      manualTaskRequiredCount: 1,
      missingRequiredScopeCount: 0,
    })
    expect(result.items).toEqual([
      expect.objectContaining({
        scopeName: '公用工程站',
        status: 'manual_task_required',
        matchedRulePatterns: [],
      }),
    ])
  })

  it('treats shared podium scope as standard schedulable and hides internal tower zones from the supplement list', () => {
    const result = evaluateScopeTemplateCoverage({
      scopeAssignmentRules: rules,
      generationScope: {
        scope_objects: [
          { id: 'building-1', type: 'building', name: '1#塔楼', metadata: { functionalUsage: '住宅楼' } },
          {
            id: 'tower-zone',
            type: 'physical_zone',
            name: '塔楼区',
            parentId: 'building-1',
            metadata: { structuralRole: 'tower', childrenComplete: true },
          },
          { id: 'tower-l5', type: 'floor', name: 'L5', parentId: 'tower-zone', metadata: { floorOrder: 5 } },
          {
            id: 'shared-podium',
            type: 'physical_zone',
            name: '共享裙房',
            metadata: {
              physicalSpaceKind: 'shared_podium',
              physicalCategory: 'shared_podium',
              structuralRole: 'podium',
              sharedScopeCandidate: true,
              childrenComplete: true,
            },
          },
          { id: 'podium-l1', type: 'floor', name: 'L1', parentId: 'shared-podium', metadata: { floorOrder: 1 } },
        ],
      },
    })

    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ scopeName: '1#塔楼', status: 'auto_schedulable' }),
      expect.objectContaining({ scopeName: '共享裙房', status: 'auto_schedulable' }),
    ]))
    expect(result.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ scopeName: '塔楼区' }),
    ]))
    expect(result.summary).toEqual({
      autoSchedulableCount: 2,
      manualTaskRequiredCount: 0,
      missingRequiredScopeCount: 0,
    })
  })
})
