import { describe, expect, it } from 'vitest'

import {
  applyDefaultMasterPlanVisibilityPolicy,
  type DefaultMasterPlanVisibilityPolicyRecord,
  type DefaultMasterPlanVisibilityRow,
} from '../services/defaultMasterPlanVisibilityService.js'
import { DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED } from '../seeds/defaultMasterPlanVisibilityPolicySeed.js'
import { getAlgorithmSeedEntry } from '../services/algorithmSeedRegistry.js'

function row(input: {
  id: string
  code: string
  title: string
  phase: string
  mode?: 'schedule_row' | 'linked_projection' | 'gate_marker'
  kind?: string
  predecessors?: string[]
  source?: string
  category?: string
  executionNature?: string
  durationContributionMode?: string
  templateGroup?: string
  start?: string
  end?: string
}): DefaultMasterPlanVisibilityRow {
  const mode = input.mode ?? 'schedule_row'
  return {
    clientRowId: input.id,
    parentClientRowId: null,
    sortOrder: 0,
    rowProjectionMode: mode,
    executionPhase: input.phase,
    planItemKind: input.kind ?? 'work_task',
    predecessorClientRowIds: input.predecessors ?? [],
    predecessorDependencies: (input.predecessors ?? []).map((clientRowId) => ({
      clientRowId,
      dependencyType: 'FS',
      lagDays: 0,
      source: 'dependency_intent_template',
    })),
    values: {
      title: input.title,
      standard_work_code: input.code,
      planned_start_date: input.start ?? '2026-07-01',
      planned_end_date: input.end ?? '2026-07-10',
      row_projection_mode: mode,
      execution_phase: input.phase,
      plan_item_kind: input.kind ?? 'work_task',
      category_type: input.category ?? 'item_work',
      wbs_node_type: input.category ?? 'item_work',
      execution_nature: input.executionNature ?? 'field_execution',
      duration_contribution_mode: input.durationContributionMode ?? 'duration_bearing',
      template_group: input.templateGroup ?? 'building_main',
      schedule_participation: mode === 'schedule_row' ? 'primary_schedule' : 'linked_projection',
      standard_task_metadata: {
        stableCode: input.code,
        source: input.source ?? 'asset_backed_default_master_plan',
        rowProjectionMode: mode,
        executionPhase: input.phase,
        planItemKind: input.kind ?? 'work_task',
        executionNature: input.executionNature ?? 'field_execution',
        durationContributionMode: input.durationContributionMode ?? 'duration_bearing',
        templateGroup: input.templateGroup ?? 'building_main',
      },
    },
  }
}

describe('defaultMasterPlanVisibilityService', () => {
  it('registers visibility policy as a governed algorithm seed asset', () => {
    const entry = getAlgorithmSeedEntry('master_plan_visibility_policy' as never)

    expect(entry).toEqual(expect.objectContaining({
      seedType: 'master_plan_visibility_policy',
      records: expect.arrayContaining([
        expect.objectContaining({ stableCode: 'master-plan-hide-residential-startup-detail' }),
      ]),
    }))
  })

  it('keeps temporary vertical-transport tasks in the internal network and bridges visible dependencies', () => {
    const rows = [
      row({
        id: 'start',
        code: 'RMP-01-01',
        title: '施工准备与场地移交测量放线',
        phase: 'startup_site_setup',
        start: '2026-07-01',
        end: '2026-07-10',
      }),
      row({
        id: 'tower-foundation',
        code: 'RMP-01-05',
        title: '塔吊基础施工',
        phase: 'startup_site_setup',
        predecessors: ['start'],
        start: '2026-07-11',
        end: '2026-07-20',
      }),
      row({
        id: 'tower-install',
        code: 'RMP-01-06',
        title: '塔吊安装与投入使用',
        phase: 'startup_site_setup',
        predecessors: ['tower-foundation'],
        start: '2026-07-21',
        end: '2026-07-28',
      }),
      row({
        id: 'foundation',
        code: 'RMP-02-03',
        title: '钻孔灌注桩施工',
        phase: 'foundation_pit_pile',
        predecessors: ['tower-install'],
        start: '2026-08-01',
        end: '2026-09-20',
      }),
    ]

    const summary = applyDefaultMasterPlanVisibilityPolicy({
      rows,
      businessType: 'general_civil',
      policyRecords: DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED,
    })

    expect(rows.find((item) => item.clientRowId === 'tower-foundation')?.rowProjectionMode).toBe('linked_projection')
    expect(rows.find((item) => item.clientRowId === 'tower-install')?.rowProjectionMode).toBe('linked_projection')
    expect(rows.find((item) => item.clientRowId === 'foundation')?.predecessorDependencies).toEqual([
      expect.objectContaining({
        clientRowId: 'start',
        dependencyType: 'SS',
        intentCode: 'master_plan_visibility_hidden_constraint_bridge',
      }),
    ])
    expect(summary.visibleScheduleRowCount).toBe(2)
    expect(summary.hiddenInternalConstraintRowCount).toBe(2)
    expect(summary.danglingVisibleDependencyCount).toBe(0)
  })

  it('never hides protected contractual milestones even when a learned override requests it', () => {
    const protectedMilestone = row({
      id: 'handover',
      code: 'RMP-13-03',
      title: '竣工验收与交付移交',
      phase: 'acceptance_handover',
      kind: 'milestone',
    })
    const hideOverride: DefaultMasterPlanVisibilityPolicyRecord = {
      stableCode: 'learned-hide-handover',
      businessTypes: ['general_civil'],
      targetStableCodePatterns: ['RMP-13-03'],
      visibilityClass: 'detail_plan_only',
      visibleOnMasterPlan: false,
      priority: 10_000,
      source: 'pm_feedback_governed_override',
      isActive: true,
    }

    applyDefaultMasterPlanVisibilityPolicy({
      rows: [protectedMilestone],
      businessType: 'general_civil',
      policyRecords: [hideOverride, ...DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED],
    })

    expect(protectedMilestone.rowProjectionMode).toBe('schedule_row')
    expect(protectedMilestone.values.standard_task_metadata).toEqual(expect.objectContaining({
      masterPlanVisibilityDecision: expect.objectContaining({
        visibilityClass: 'commitment_milestone',
        visibleOnMasterPlan: true,
        protectedFromAutoHide: true,
      }),
    }))
  })

  it('keeps catalog rows hidden while marking field-control item packs as assembly candidates', () => {
    const profile = row({
      id: 'profile',
      code: 'BTMP-HSP-01',
      title: '医技楼主体结构与医疗功能区移交',
      phase: 'superstructure_rhythm',
      source: 'managed_frontier_default_master_plan',
    })
    const detail = row({
      id: 'detail',
      code: 'FND-04-01-04',
      title: '地下连续墙槽段成槽施工',
      phase: 'foundation_pit_pile',
      mode: 'linked_projection',
      source: 'managed_frontier_catalog_detail',
      category: 'item_work',
      templateGroup: 'cleanroom',
    })

    const summary = applyDefaultMasterPlanVisibilityPolicy({
      rows: [profile, detail],
      businessType: 'hospital',
      policyRecords: DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED,
    })

    expect(profile.rowProjectionMode).toBe('schedule_row')
    expect(detail.rowProjectionMode).toBe('linked_projection')
    expect(detail.values.standard_task_metadata).toEqual(expect.objectContaining({
      masterControlPromotionEligibility: expect.objectContaining({
        eligible: true,
        source: 'non_residential_master_control_projection_policy',
      }),
    }))
    expect(summary.visibleScheduleRowCount).toBe(1)
    expect(summary.policyCoverageRate).toBe(1)
  })

  it('never marks resource, management, or document details as master-control candidates', () => {
    const rows = [
      row({
        id: 'tower-crane',
        code: 'SITE-TOWER-CRANE',
        title: '塔吊安装与投入使用',
        phase: 'startup_site_setup',
        mode: 'linked_projection',
        source: 'managed_frontier_catalog_detail',
        category: 'item_work',
        templateGroup: 'site_management',
      }),
      row({
        id: 'danger-management',
        code: 'DANGER-01-01-10',
        title: '钢结构大跨度安装专项管理',
        phase: 'superstructure_rhythm',
        mode: 'linked_projection',
        source: 'managed_frontier_catalog_detail',
        category: 'item_work',
        templateGroup: 'danger_control',
      }),
      row({
        id: 'occupied-window-coordination',
        code: 'RNV-03-01-01',
        title: '住户商户协调和夜间施工窗口管理',
        phase: 'management_support',
        mode: 'linked_projection',
        source: 'managed_frontier_catalog_detail',
        category: 'item_work',
        templateGroup: 'renovation',
      }),
      row({
        id: 'document',
        code: 'DOC-01',
        title: '施工资料整理与报审',
        phase: 'startup_site_setup',
        mode: 'linked_projection',
        kind: 'document_task',
        source: 'managed_frontier_catalog_detail',
        category: 'item_work',
        templateGroup: 'document_commercial_support',
      }),
    ]

    applyDefaultMasterPlanVisibilityPolicy({
      rows,
      businessType: 'sports_culture',
      policyRecords: DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED,
    })

    for (const candidate of rows) {
      expect(candidate.values.standard_task_metadata).toEqual(expect.objectContaining({
        masterControlPromotionEligibility: expect.objectContaining({ eligible: false }),
      }))
    }
  })

  it('marks contractual handover milestones as project-level assembly candidates', () => {
    const milestone = row({
      id: 'completion-filing',
      code: 'MS-01-01-11',
      title: '竣工验收备案完成',
      phase: 'acceptance_handover',
      mode: 'gate_marker',
      kind: 'milestone',
      executionNature: 'handover_milestone',
      durationContributionMode: 'record_only',
      templateGroup: 'project_milestone',
    })

    applyDefaultMasterPlanVisibilityPolicy({
      rows: [milestone],
      businessType: 'hospital',
      policyRecords: DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED,
    })

    expect(milestone.rowProjectionMode).toBe('linked_projection')
    expect(milestone.linkedProjectionSource).toEqual(expect.objectContaining({
      originalRowProjectionMode: 'gate_marker',
    }))
    expect(milestone.values.standard_task_metadata).toEqual(expect.objectContaining({
      masterControlPromotionEligibility: expect.objectContaining({
        eligible: true,
        scopeMode: 'project_control',
      }),
    }))
  })

  it('treats governed building subdivisions as coarse master-control candidates', () => {
    const subdivision = row({
      id: 'building-floor',
      code: '03-01',
      title: '建筑地面',
      phase: 'interior_fitout_terminal',
      mode: 'linked_projection',
      category: 'sub_division',
      templateGroup: 'building_main',
    })

    applyDefaultMasterPlanVisibilityPolicy({
      rows: [subdivision],
      businessType: 'hospital',
      policyRecords: DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED,
    })

    expect(subdivision.values.standard_task_metadata).toEqual(expect.objectContaining({
      masterControlPromotionEligibility: expect.objectContaining({ eligible: true }),
    }))
  })
})
