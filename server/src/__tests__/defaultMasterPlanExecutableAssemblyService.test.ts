import { describe, expect, it } from 'vitest'
import {
  analyzeExecutableDefaultMasterPlanNetwork,
  analyzeExecutableDefaultMasterPlanSchedulePropagation,
  assembleExecutableDefaultMasterPlanRows,
  evaluateExecutableDefaultMasterPlanRowVolumeReadiness,
  finalizeExecutableDefaultMasterPlanScheduleNetwork,
  isExecutableDurationAssetSemanticallyCompatible,
  refreshExecutableDefaultMasterPlanAssemblySummary,
  type ExecutableDefaultMasterPlanAssemblyRow,
} from '../services/defaultMasterPlanExecutableAssemblyService.js'

function scheduleRow({
  code,
  title,
  phase,
}: {
  code: string
  title: string
  phase: string
}): ExecutableDefaultMasterPlanAssemblyRow {
  return {
    clientRowId: `diagnostic:${code}`,
    parentClientRowId: null,
    sortOrder: 0,
    values: {
      standard_work_code: code,
      title,
      execution_phase: phase,
      execution_lane: phase,
      standard_task_metadata: {},
    },
    predecessorClientRowIds: [],
    predecessorDependencies: [],
    rowProjectionMode: 'schedule_row',
    executionPhase: phase,
    executionLane: phase,
    planItemKind: 'work_task',
    scheduleParticipation: 'primary_schedule',
  }
}

describe('default master-plan executable assembly duration assets', () => {
  it('preserves standard-seed-only lineage for one-off procurement control windows', () => {
    const row = withWindow(scheduleRow({
      code: 'BTMP-SCH-P01',
      title: 'School specialist design and procurement release',
      phase: 'startup_site_setup',
    }), '2026-01-01', '2026-03-01')
    row.values = {
      ...row.values,
      smart_reference_days: 60,
      duration_contribution_mode: 'duration_bearing',
      duration_asset_mapping: {
        profileActivityDurationAssetAuthority: true,
        standardWorkDurationSeedStableCode: 'specialist_design_procurement_release',
        t2RhythmApplicability: 'not_applicable_one_off_activity',
      },
      duration_asset_calculation: {
        source: 'standard_work_duration_seed',
        selectedDurationDays: 60,
        standardWorkDurationSeedStableCode: 'specialist_design_procurement_release',
        t2RhythmApplicability: 'not_applicable_one_off_activity',
      },
      duration_suggestion: {
        recommendedDurationDays: 60,
        planReferenceDays: 60,
      },
    }

    assembleExecutableDefaultMasterPlanRows({
      rows: [row] as any,
      businessType: 'school',
      masterPlanProfile: { rowCountRange: [1, 1] },
    })

    const suggestion = row.values.duration_suggestion as Record<string, unknown>
    const factorAvailability = suggestion.factorAvailability as Record<string, unknown>
    expect(row.values.duration_calibration_source).toBe('standard_work_duration_seed')
    expect(factorAvailability.t2_division_rhythm_template_seed).toBe(false)
    expect((row.values.standard_task_metadata as Record<string, any>).durationEvidence.calibrationSource)
      .toBe('standard_work_duration_seed')
  })

  it('keeps WBS summary rows outside the executable CPM while retaining hierarchy propagation checks', () => {
    const summary = {
      ...scheduleRow({ code: 'ROOT', title: '项目总控计划', phase: 'startup_site_setup' }),
      values: {
        ...scheduleRow({ code: 'ROOT', title: '项目总控计划', phase: 'startup_site_setup' }).values,
        is_wbs_summary: true,
        is_executable: false,
        duration_contribution_mode: 'record_only',
      },
    }
    const first = {
      ...scheduleRow({ code: 'A', title: '施工准备', phase: 'startup_site_setup' }),
      parentClientRowId: summary.clientRowId,
    }
    const second = {
      ...scheduleRow({ code: 'B', title: '基础施工', phase: 'foundation_pit_pile' }),
      parentClientRowId: summary.clientRowId,
      predecessorClientRowIds: [first.clientRowId],
      predecessorDependencies: [{ clientRowId: first.clientRowId, dependencyType: 'FS', lagDays: 0 }],
    }

    const primary = analyzeExecutableDefaultMasterPlanNetwork([summary, first, second])
    expect(primary.componentCount).toBe(1)
    expect(primary.rootIds).toEqual([first.clientRowId])
    expect(primary.sinkIds).toEqual([second.clientRowId])

    const propagation = analyzeExecutableDefaultMasterPlanSchedulePropagation([summary, first, second])
    expect(propagation.acyclic).toBe(true)
    expect(propagation.rootIds).toEqual([summary.clientRowId])
    expect(propagation.sinkIds).toEqual([second.clientRowId])
  })

  it('keeps foundation support assets on modular site foundation and lift-path rows', () => {
    const row = scheduleRow({
      code: 'BTMP-MOD-03',
      title: '模块基础与吊装道路准备',
      phase: 'foundation_pit_pile',
    })

    expect(isExecutableDurationAssetSemanticallyCompatible(row, {
      standardWorkDurationSeedStableCode: 'foundation_pit_retaining_support',
    })).toBe(true)
  })

  it('keeps cleanroom medical-system assets on medical gas and equipment rows', () => {
    const row = scheduleRow({
      code: 'BTMP-HSP-04',
      title: '医疗气体系统管网与站房安装',
      phase: 'mep_roughin',
    })

    expect(isExecutableDurationAssetSemanticallyCompatible(row, {
      standardWorkDurationSeedStableCode: 'hvac_cleanroom_system',
    })).toBe(true)
  })

  it('keeps large-span roof assets on station-building roof enclosure rows', () => {
    const row = scheduleRow({
      code: 'BTMP-TRH-02',
      title: '幕墙屋面封闭与站房防水收口',
      phase: 'envelope_roof_facade',
    })

    expect(isExecutableDurationAssetSemanticallyCompatible(row, {
      standardWorkDurationSeedStableCode: 'large_span_roof_structure',
    })).toBe(true)
  })

  it('keeps large-span roof assets on venue enclosure rows', () => {
    const row = scheduleRow({
      code: 'BTMP-SPC-02',
      title: '屋面围护封闭与场馆外围护收口',
      phase: 'envelope_roof_facade',
    })

    expect(isExecutableDurationAssetSemanticallyCompatible(row, {
      standardWorkDurationSeedStableCode: 'large_span_roof_structure',
    })).toBe(true)
  })

  it('repairs a nested commissioning chain that otherwise traces only to project start', () => {
    const projectStart = withWindow(
      scheduleRow({ code: 'START', title: '施工准备与现场临设完成', phase: 'startup_site_setup' }),
      '2026-01-01',
      '2026-01-20',
    )
    const mepHandoff = withDependency(withWindow(
      scheduleRow({ code: 'MEP', title: '模块拼缝机电接驳与系统贯通', phase: 'mep_roughin' }),
      '2026-06-01',
      '2026-08-31',
    ), projectStart)
    const commissioningGate = withWindow(
      scheduleRow({ code: 'GATE', title: '系统接口条件确认', phase: 'commissioning' }),
      '2026-09-01',
      '2026-09-05',
    )
    commissioningGate.predecessorClientRowIds = [projectStart.clientRowId]
    commissioningGate.predecessorDependencies = [{
      clientRowId: projectStart.clientRowId,
      dependencyType: 'SS',
      lagDays: 243,
      intentCode: 'executable_default_master_plan_component_release',
    }]
    const lateCommissioning = withDependency(withWindow(
      scheduleRow({ code: 'LATE', title: '整栋联动调试与功能复测', phase: 'commissioning' }),
      '2026-09-06',
      '2026-09-10',
    ), commissioningGate)
    lateCommissioning.predecessorDependencies[0].intentCode = 'executable_default_master_plan_sibling_release_rhythm'

    assembleExecutableDefaultMasterPlanRows({
      rows: [projectStart, mepHandoff, commissioningGate, lateCommissioning] as any,
      businessType: 'modular_building',
      masterPlanProfile: { rowCountRange: [4, 4] },
    })

    expect(commissioningGate.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: mepHandoff.clientRowId,
        intentCode: 'executable_default_master_plan_physical_handoff',
      }),
    ]))
  })

  it('converges parallel completion streams at the contractual terminal without inventing cross-stream handoffs', () => {
    const projectStart = withWindow(
      scheduleRow({ code: 'START', title: '项目启动', phase: 'startup_site_setup' }),
      '2026-01-01',
      '2026-01-01',
    )
    const towerOneFinish = withDependency(withWindow(
      scheduleRow({ code: 'T1-FINISH', title: '1#楼完工', phase: 'interior_fitout_terminal' }),
      '2026-01-02',
      '2026-01-05',
    ), projectStart)
    const towerTwoWork = withDependency(withWindow(
      scheduleRow({ code: 'T2-WORK', title: '2#楼施工', phase: 'superstructure_rhythm' }),
      '2026-01-06',
      '2026-01-15',
    ), projectStart)
    const terminal = withDependency(withWindow(
      {
        ...scheduleRow({ code: 'END', title: '竣工验收与交付移交', phase: 'acceptance_handover' }),
        planItemKind: 'milestone',
      },
      '2026-01-20',
      '2026-01-20',
    ), towerTwoWork)

    finalizeExecutableDefaultMasterPlanScheduleNetwork([
      projectStart,
      towerOneFinish,
      towerTwoWork,
      terminal,
    ] as any)

    expect(towerTwoWork.predecessorDependencies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ clientRowId: towerOneFinish.clientRowId }),
    ]))
    expect(terminal.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: towerOneFinish.clientRowId,
        dependencyType: 'FS',
        intentCode: 'executable_default_master_plan_terminal_convergence',
      }),
    ]))
  })

  it('keeps the earliest startup control row as project root when a specialty root shares its date', () => {
    const projectStart = withWindow(
      scheduleRow({ code: 'START', title: '施工准备与现场临设完成', phase: 'startup_site_setup' }),
      '2026-01-01',
      '2026-01-20',
    )
    projectStart.values = {
      ...projectStart.values,
      master_plan_visibility_class: 'primary_control',
    }
    const prematureCommissioning = withWindow(
      scheduleRow({ code: 'SPECIALTY', title: '工业消防、防爆与环保处理系统联调', phase: 'commissioning' }),
      '2026-01-01',
      '2026-01-05',
    )
    prematureCommissioning.values = {
      ...prematureCommissioning.values,
      master_plan_visibility_class: 'detail_plan_only',
    }
    const terminal = withDependency(withWindow(
      {
        ...scheduleRow({ code: 'END', title: '竣工验收与交付移交', phase: 'acceptance_handover' }),
        planItemKind: 'milestone',
      },
      '2026-12-01',
      '2026-12-01',
    ), projectStart)

    finalizeExecutableDefaultMasterPlanScheduleNetwork([
      projectStart,
      prematureCommissioning,
      terminal,
    ] as any)

    expect(projectStart.predecessorDependencies).toEqual([])
    expect(prematureCommissioning.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: projectStart.clientRowId,
        dependencyType: 'SS',
        intentCode: 'executable_default_master_plan_component_release',
      }),
    ]))
  })

  it('blocks wizard readiness when a synthetic dependency points from commissioning into startup', () => {
    const commissioning = withWindow(
      scheduleRow({ code: 'COMMISSION', title: '工业消防、防爆与环保处理系统联调', phase: 'commissioning' }),
      '2026-01-01',
      '2026-01-05',
    )
    const startup = withWindow(
      scheduleRow({ code: 'START', title: '施工准备与现场临设完成', phase: 'startup_site_setup' }),
      '2026-01-01',
      '2026-01-20',
    )
    startup.predecessorClientRowIds = [commissioning.clientRowId]
    startup.predecessorDependencies = [{
      clientRowId: commissioning.clientRowId,
      dependencyType: 'SS',
      lagDays: 0,
      intentCode: 'executable_default_master_plan_primary_control_spine',
    }]
    const terminal = withDependency(withWindow(
      {
        ...scheduleRow({ code: 'END', title: '竣工验收与交付移交', phase: 'acceptance_handover' }),
        planItemKind: 'milestone',
      },
      '2026-12-01',
      '2026-12-01',
    ), startup)
    for (const row of [commissioning, startup, terminal]) {
      row.values = {
        ...row.values,
        duration_contribution_mode: 'record_only',
        is_executable: true,
      }
    }

    const result = assembleExecutableDefaultMasterPlanRows({
      rows: [commissioning, startup, terminal] as any,
      businessType: 'industrial',
      masterPlanProfile: { rowCountRange: [3, 10] },
    })

    expect(result.readinessReasonCodes).toContain('master_plan_synthetic_dependency_phase_inversion')
    expect(result.readyForWizardCommit).toBe(false)
  })

  it('blocks a hospital plan when authored assets cannot satisfy the operational floor', () => {
    const rows = Array.from({ length: 18 }, (_, index) => scheduleRow({
      code: `HSP-${String(index + 1).padStart(2, '0')}`,
      title: `医院主控任务${index + 1}`,
      phase: index === 0
        ? 'startup_site_setup'
        : index === 17
          ? 'acceptance_handover'
          : 'superstructure_rhythm',
    }))

    const result = assembleExecutableDefaultMasterPlanRows({
      rows,
      businessType: 'hospital',
      masterPlanProfile: { rowCountRange: [116, 172] },
    })

    expect(result.status).toBe('executable_default_master_plan_blocked')
    expect(result.readyForWizardCommit).toBe(false)
    expect(result.recommendedMinimumScheduleRowCount).toBe(116)
    expect(result.minimumScheduleRowCount).toBe(60)
    expect(result.operationalRowFloor).toBe(60)
    expect(result.assetInventoryExhausted).toBe(true)
    expect(result.readinessReasonCodes).toContain('master_plan_asset_inventory_below_required_minimum')
  })

  it('accepts a one-row exhausted-asset shortfall without inventing a filler schedule task', () => {
    const result = evaluateExecutableDefaultMasterPlanRowVolumeReadiness({
      availableScheduleRowCount: 59,
      scheduleRowCount: 59,
      minimumScheduleRowCount: 60,
      maximumScheduleRowCount: 170,
      operationalRowFloor: 60,
    })

    expect(result.assetInventoryExhausted).toBe(true)
    expect(result.assetInventoryShortfallRowCount).toBe(1)
    expect(result.assetInventoryShortfallAccepted).toBe(true)
    expect(result.reasonCodes).toEqual([])
  })

  it('still blocks an exhausted-asset schedule that is two rows below the operational floor', () => {
    const result = evaluateExecutableDefaultMasterPlanRowVolumeReadiness({
      availableScheduleRowCount: 58,
      scheduleRowCount: 58,
      minimumScheduleRowCount: 60,
      maximumScheduleRowCount: 170,
      operationalRowFloor: 60,
    })

    expect(result.assetInventoryShortfallAccepted).toBe(false)
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'master_plan_asset_inventory_below_required_minimum',
      'master_plan_schedule_below_operational_floor',
    ]))
  })

  it('accepts a complete single-building venue above its operational floor when the recommended row target is unattainable', () => {
    const rows: Array<ReturnType<typeof withWindow>> = []
    for (let index = 0; index < 71; index += 1) {
      const day = String(index + 1).padStart(3, '0')
      const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
      const row = withWindow(scheduleRow({
        code: `SPC-${day}`,
        title: index === 70 ? '场馆竣工验收与运营移交' : `场馆主控任务${index + 1}`,
        phase: index === 0
          ? 'startup_site_setup'
          : index === 70
            ? 'acceptance_handover'
            : 'superstructure_rhythm',
      }), date, date)
      rows.push(index === 0 ? row : withDependency(row, rows[index - 1]!))
    }

    const result = assembleExecutableDefaultMasterPlanRows({
      rows: rows as any,
      businessType: 'sports_culture',
      masterPlanProfile: { rowCountRange: [80, 140] },
    })
    refreshExecutableDefaultMasterPlanAssemblySummary(rows as any, result)

    expect(result.recommendedMinimumScheduleRowCount).toBe(80)
    expect(result.minimumScheduleRowCount).toBe(60)
    expect(result.operationalRowFloor).toBe(60)
    expect(result.scheduleRowCount).toBe(71)
    expect(result.assetInventoryExhausted).toBe(false)
    expect(result.readinessReasonCodes).not.toContain('master_plan_schedule_below_configured_minimum')
    expect(result.readyForWizardCommit).toBe(true)
  })

  it('promotes a managed-frontier row from governed descendant process duration seeds', () => {
    const phaseAuthority = withWindow(scheduleRow({
      code: 'BTMP-SPC-START',
      title: '场馆项目施工准备',
      phase: 'startup_site_setup',
    }), '2026-01-01', '2026-01-20')
    phaseAuthority.values = {
      ...phaseAuthority.values,
      duration_contribution_mode: 'duration_bearing',
      duration_asset_mapping: {
        standardWorkDurationSeedStableCode: 'site_setup_temp_works',
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        t2RhythmTemplateId: 't2-sports-culture-long-span-structure-rhythm-v1',
        t2RhythmTemplateResolverSource: 'ts_seed_fallback',
      },
    }
    const detailedRow: ExecutableDefaultMasterPlanAssemblyRow = {
      ...scheduleRow({
        code: 'SPC-01-01-01',
        title: '大跨屋盖钢结构安装',
        phase: 'superstructure_rhythm',
      }),
      clientRowId: 'diagnostic:SPC-01-01-01',
      rowProjectionMode: 'linked_projection',
      scheduleParticipation: 'read_only_projection',
      linkedProjectionSource: {
        source: 'default_master_plan_visibility_policy',
        originalRowProjectionMode: 'schedule_row',
      },
      durationSuggestion: {
        recommendedDurationDays: 28,
        conservativeDurationDays: 36,
        forecastSource: 'standard_work_duration_seed:sync_fast_template+managed_frontier_descendant_rollup',
        businessReasonCode: 'MANAGED_FRONTIER_DESCENDANT_ROLLUP',
        businessReasonParams: {
          descendantRollup: {
            source: 'contextual_descendant_rollup',
            durationSeedStableCodes: ['steel_erection', 'steel_welding_inspection'],
            durationSeedResolverSource: 'active_seed',
            durationSeedResolverVersionIds: ['runtime-steel-process-seed-v-test'],
            durationSeedResolutions: [
              {
                stableCode: 'steel_erection',
                resolverSource: 'active_seed',
                resolverVersionId: 'runtime-steel-process-seed-v-test',
              },
              {
                stableCode: 'steel_welding_inspection',
                resolverSource: 'active_seed',
                resolverVersionId: 'runtime-steel-process-seed-v-test',
              },
            ],
            childProcessStableCodes: ['SPC-01-01-01-P01', 'SPC-01-01-01-P02'],
          },
        },
        factorAvailability: {
          standard_work_duration_seed: true,
          managed_frontier_descendant_rollup: true,
        },
      },
      values: {
        ...scheduleRow({
          code: 'SPC-01-01-01',
          title: '大跨屋盖钢结构安装',
          phase: 'superstructure_rhythm',
        }).values,
        planned_start_date: '2026-01-05',
        planned_end_date: '2026-02-01',
        duration_contribution_mode: 'duration_bearing',
        template_group: 'steel_structure',
        category_type: 'item_work',
        wbs_node_type: 'item_work',
        execution_nature: 'physical_work',
        organization_lane: 'renovation_zone_lane_2',
        building_sequence_number: 2,
        standard_task_metadata: {
          stableCode: 'SPC-01-01-01',
          durationContributionMode: 'duration_bearing',
          executionNature: 'physical_work',
          masterPlanVisibilityDecision: {
            policyVersion: 'v1.4.23.1-master-plan-visibility-v1',
            visibleOnMasterPlan: false,
          },
          masterControlPromotionEligibility: {
            eligible: true,
            score: 90,
            scopeMode: 'project_control',
          },
          masterPlanProjectionPolicy: {
            originalRowProjectionMode: 'schedule_row',
          },
        },
      },
    }

    const result = assembleExecutableDefaultMasterPlanRows({
      rows: [phaseAuthority, detailedRow] as any,
      businessType: 'renovation',
      masterPlanProfile: { rowCountRange: [2, 2] },
    })

    expect(result.promotedLinkedProjectionRowCount).toBe(1)
    expect(result.promotionCandidateMissingDurationAuthorityRowCount).toBe(0)
    expect(detailedRow.values.duration_authority).toBe('system_standard_seed')
    expect(detailedRow.values.duration_asset_mapping).toEqual(expect.objectContaining({
      standardWorkDurationAuthorityMode: 'descendant_process_seed_rollup',
      standardWorkDurationSeedStableCode: 'process_rollup:SPC-01-01-01',
      standardWorkDurationSeedSourceStableCodes: ['steel_erection', 'steel_welding_inspection'],
      standardWorkDurationSeedResolverSource: 'active_seed',
      standardWorkDurationSeedResolverVersionId: 'runtime-steel-process-seed-v-test',
      standardWorkDurationSeedResolverVersionIds: ['runtime-steel-process-seed-v-test'],
      standardWorkDurationSeedResolutions: expect.arrayContaining([
        expect.objectContaining({
          stableCode: 'steel_erection',
          resolverSource: 'active_seed',
          resolverVersionId: 'runtime-steel-process-seed-v-test',
        }),
      ]),
      t2RhythmTemplateId: 't2-sports-culture-long-span-structure-rhythm-v1',
    }))
    expect(detailedRow.values.master_plan_visibility_class).toBe('primary_control')
    expect((detailedRow.values.standard_task_metadata as any).masterPlanVisibilityDecision).toEqual(
      expect.objectContaining({
        visibilityClass: 'primary_control',
        visibleOnMasterPlan: true,
      }),
    )
    expect(detailedRow.values.title).toBe('大跨屋盖钢结构安装（改造分区2）')
  })

  it('marks an inferred earlier-phase predecessor as a semantic fallback instead of standard rule evidence', () => {
    const foundation = governedDurationRow({
      code: 'FALLBACK-FOUNDATION',
      title: '基础结构施工',
      phase: 'foundation_pit_pile',
      start: '2026-01-11',
      end: '2026-02-10',
      parentClientRowId: 'diagnostic:logical-parent',
      sortOrder: 10,
    })
    const structure = governedDurationRow({
      code: 'FALLBACK-STRUCTURE',
      title: '主体结构施工',
      phase: 'superstructure_rhythm',
      start: '2026-02-11',
      end: '2026-04-10',
      parentClientRowId: 'diagnostic:logical-parent',
      sortOrder: 20,
    })

    const result = assembleExecutableDefaultMasterPlanRows({
      rows: [foundation, structure] as any,
      businessType: 'industrial',
      masterPlanProfile: { rowCountRange: [2, 2] },
    })

    expect(structure.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: foundation.clientRowId,
        source: 'execution_phase_order_fallback',
        sequencingBasis: 'execution_phase_order_fallback',
        dependencyRuleEvidence: expect.objectContaining({
          evidenceLevel: 'semantic_fallback_l0',
          createsProductionTaskDependency: true,
        }),
      }),
    ]))
    expect(result.semanticFallbackDependencyCount).toBeGreaterThan(0)
    expect(result.sequencingGapCount).toBeGreaterThan(0)
    expect(result.nonBlockingGovernanceWarningCodes).toContain('master_plan_dependency_rule_gap_present')
    expect(result.readyForWizardCommit).toBe(true)
  })

  it('labels code-order sibling staggering as heuristic and exposes a bounded governance gap sample', () => {
    const zoneOne = governedDurationRow({
      code: 'ZONE-01',
      title: '一分区主体结构施工',
      phase: 'superstructure_rhythm',
      start: '2026-01-11',
      end: '2026-03-10',
      parentClientRowId: 'diagnostic:logical-parent',
      sortOrder: 10,
    })
    const zoneTwo = governedDurationRow({
      code: 'ZONE-02',
      title: '二分区主体结构施工',
      phase: 'superstructure_rhythm',
      start: '2026-01-11',
      end: '2026-03-10',
      parentClientRowId: 'diagnostic:logical-parent',
      sortOrder: 20,
    })

    const result = assembleExecutableDefaultMasterPlanRows({
      rows: [zoneOne, zoneTwo] as any,
      businessType: 'industrial',
      masterPlanProfile: { rowCountRange: [2, 2] },
    })

    expect(zoneTwo.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: zoneOne.clientRowId,
        source: 'heuristic_stagger',
        sequencingBasis: 'heuristic_stagger',
        dependencyRuleEvidence: expect.objectContaining({
          evidenceLevel: 'heuristic_fallback_l0',
        }),
      }),
    ]))
    expect(result.heuristicStaggerDependencyCount).toBeGreaterThan(0)
    expect(result.sequencingGapSamples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        predecessorStableCode: 'ZONE-01',
        successorStableCode: 'ZONE-02',
        sequencingBasis: 'heuristic_stagger',
      }),
    ]))
  })

  it('prevents a promoted subdivision from inheriting an implausible process-rollup duration', () => {
    const phaseAuthority = withWindow(scheduleRow({
      code: 'BTMP-SPC-01',
      title: 'Large-span steel roof structure control',
      phase: 'superstructure_rhythm',
    }), '2026-01-01', '2026-04-30')
    phaseAuthority.values = {
      ...phaseAuthority.values,
      smart_reference_days: 120,
      duration_contribution_mode: 'duration_bearing',
      duration_asset_mapping: {
        profileActivityDurationAssetAuthority: true,
        standardWorkDurationSeedStableCode: 'steel_erection',
        t2RhythmTemplateId: 't2-sports-culture-long-span-structure-rhythm-v1',
      },
      duration_asset_calculation: {
        selectedDurationDays: 120,
      },
    }
    const detailBase = withWindow(scheduleRow({
      code: 'STL-03-01',
      title: 'Steel roof subdivision package',
      phase: 'superstructure_rhythm',
    }), '2026-01-10', '2026-01-11')
    const detailedRow: ExecutableDefaultMasterPlanAssemblyRow = {
      ...detailBase,
      clientRowId: 'diagnostic:STL-03-01:detail',
      rowProjectionMode: 'linked_projection',
      scheduleParticipation: 'read_only_projection',
      linkedProjectionSource: {
        originalRowProjectionMode: 'schedule_row',
      },
      durationSuggestion: {
        recommendedDurationDays: 2,
        planReferenceDays: 2,
        businessReasonCode: 'MANAGED_FRONTIER_DESCENDANT_ROLLUP',
        businessReasonParams: {
          descendantRollup: {
            durationSeedStableCodes: ['steel_erection'],
            childProcessStableCodes: ['STL-03-01-P01'],
          },
        },
        factorAvailability: {
          standard_work_duration_seed: true,
        },
      },
      values: {
        ...detailBase.values,
        category_type: 'item_work',
        wbs_node_type: 'item_work',
        plan_item_kind: 'work_task',
        execution_nature: 'physical_work',
        duration_contribution_mode: 'duration_bearing',
        template_group: 'steel_structure',
        duration_suggestion: {
          recommendedDurationDays: 2,
          planReferenceDays: 2,
          businessReasonCode: 'MANAGED_FRONTIER_DESCENDANT_ROLLUP',
          businessReasonParams: {
            descendantRollup: {
              durationSeedStableCodes: ['steel_erection'],
              childProcessStableCodes: ['STL-03-01-P01'],
            },
          },
          factorAvailability: {
            standard_work_duration_seed: true,
          },
        },
        standard_task_metadata: {
          stableCode: 'STL-03-01',
          durationContributionMode: 'duration_bearing',
          executionNature: 'physical_work',
          masterPlanVisibilityDecision: {
            policyVersion: 'v1.4.23.1-master-plan-visibility-v1',
            visibleOnMasterPlan: false,
          },
          masterControlPromotionEligibility: {
            eligible: true,
            score: 100,
            scopeMode: 'project_control',
          },
          masterPlanProjectionPolicy: {
            originalRowProjectionMode: 'schedule_row',
          },
        },
      },
    }

    assembleExecutableDefaultMasterPlanRows({
      rows: [phaseAuthority, detailedRow] as any,
      businessType: 'sports_culture',
      masterPlanProfile: { rowCountRange: [2, 2] },
    })

    expect(detailedRow.values.smart_reference_days).toBeGreaterThanOrEqual(18)
    expect(detailedRow.values.duration_asset_calculation).toEqual(expect.objectContaining({
      masterControlReferenceFloorDays: 18,
    }))
  })

  it('keeps the promoted subdivision floor when generation already attached a process-rollup authority', () => {
    const phaseAuthority = withWindow(scheduleRow({
      code: 'BTMP-SPC-01',
      title: 'Large-span steel roof structure control',
      phase: 'superstructure_rhythm',
    }), '2026-01-01', '2026-04-30')
    phaseAuthority.values = {
      ...phaseAuthority.values,
      smart_reference_days: 120,
      duration_contribution_mode: 'duration_bearing',
      duration_asset_mapping: {
        profileActivityDurationAssetAuthority: true,
        standardWorkDurationSeedStableCode: 'steel_erection',
        t2RhythmTemplateId: 't2-sports-culture-long-span-structure-rhythm-v1',
      },
      duration_asset_calculation: {
        selectedDurationDays: 120,
        standardWorkDurationSeedStableCode: 'steel_erection',
        t2RhythmTemplateId: 't2-sports-culture-long-span-structure-rhythm-v1',
      },
    }
    const detailBase = withWindow(scheduleRow({
      code: '02-01',
      title: 'Concrete structure subdivision',
      phase: 'superstructure_rhythm',
    }), '2026-01-10', '2026-01-14')
    const detailedRow: ExecutableDefaultMasterPlanAssemblyRow = {
      ...detailBase,
      clientRowId: 'diagnostic:02-01:direct-rollup',
      rowProjectionMode: 'linked_projection',
      scheduleParticipation: 'read_only_projection',
      linkedProjectionSource: {
        originalRowProjectionMode: 'schedule_row',
      },
      durationSuggestion: {
        recommendedDurationDays: 5,
        planReferenceDays: 5,
      },
      values: {
        ...detailBase.values,
        smart_reference_days: 5,
        category_type: 'sub_division',
        wbs_node_type: 'sub_division',
        plan_item_kind: 'work_task',
        execution_nature: 'physical_work',
        duration_contribution_mode: 'duration_bearing',
        template_group: 'building_main',
        duration_asset_mapping: {
          standardWorkDurationAuthorityMode: 'descendant_process_seed_rollup',
          standardWorkDurationSeedStableCode: 'process_rollup:02-01',
          standardWorkDurationSeedSourceStableCodes: ['concrete_structure_process'],
          t2RhythmTemplateId: 't2-sports-culture-long-span-structure-rhythm-v1',
        },
        duration_asset_calculation: {
          standardWorkDurationAuthorityMode: 'descendant_process_seed_rollup',
          standardWorkDurationSeedStableCode: 'process_rollup:02-01',
          selectedDurationDays: 5,
          t2RhythmTemplateId: 't2-sports-culture-long-span-structure-rhythm-v1',
        },
        duration_suggestion: {
          recommendedDurationDays: 5,
          planReferenceDays: 5,
        },
        standard_task_metadata: {
          stableCode: '02-01',
          durationContributionMode: 'duration_bearing',
          executionNature: 'physical_work',
          durationAssetMapping: {
            standardWorkDurationAuthorityMode: 'descendant_process_seed_rollup',
            standardWorkDurationSeedStableCode: 'process_rollup:02-01',
            standardWorkDurationSeedSourceStableCodes: ['concrete_structure_process'],
            t2RhythmTemplateId: 't2-sports-culture-long-span-structure-rhythm-v1',
          },
          durationAssetCalculation: {
            standardWorkDurationAuthorityMode: 'descendant_process_seed_rollup',
            standardWorkDurationSeedStableCode: 'process_rollup:02-01',
            selectedDurationDays: 5,
            t2RhythmTemplateId: 't2-sports-culture-long-span-structure-rhythm-v1',
          },
          masterPlanVisibilityDecision: {
            policyVersion: 'v1.4.23.1-master-plan-visibility-v1',
            visibilityClass: 'detail_plan_only',
            visibleOnMasterPlan: false,
          },
          masterControlPromotionEligibility: {
            eligible: true,
            score: 100,
            scopeMode: 'project_control',
          },
          masterPlanProjectionPolicy: {
            originalRowProjectionMode: 'schedule_row',
          },
        },
      },
    }

    assembleExecutableDefaultMasterPlanRows({
      rows: [phaseAuthority, detailedRow] as any,
      businessType: 'sports_culture',
      masterPlanProfile: { rowCountRange: [2, 2] },
    })

    expect(detailedRow.values.smart_reference_days).toBeGreaterThanOrEqual(18)
    expect(detailedRow.values.duration_asset_calculation).toEqual(expect.objectContaining({
      masterControlReferenceFloorDays: 18,
    }))
  })

  it('promotes an eligible contractual gate marker without requiring duration authority', () => {
    const contractualMilestone: ExecutableDefaultMasterPlanAssemblyRow = {
      ...withWindow(scheduleRow({
        code: 'MS-01-01-12',
        title: '主体结构封顶里程碑',
        phase: 'superstructure_rhythm',
      }), '2026-08-30', '2026-08-30'),
      rowProjectionMode: 'linked_projection',
      planItemKind: 'milestone',
      scheduleParticipation: 'evidence_only',
      linkedProjectionSource: {
        source: 'default_master_plan_visibility_policy',
        originalRowProjectionMode: 'gate_marker',
      },
      values: {
        ...withWindow(scheduleRow({
          code: 'MS-01-01-12',
          title: '主体结构封顶里程碑',
          phase: 'superstructure_rhythm',
        }), '2026-08-30', '2026-08-30').values,
        category_type: 'item_work',
        wbs_node_type: 'item_work',
        plan_item_kind: 'milestone',
        duration_contribution_mode: 'record_only',
        execution_nature: 'control_gate',
        template_group: 'project_milestone',
        standard_task_metadata: {
          planItemKind: 'milestone',
          durationContributionMode: 'record_only',
          masterPlanVisibilityDecision: {
            policyVersion: 'v1.4.23.1-master-plan-visibility-v1',
            visibleOnMasterPlan: false,
          },
          masterControlPromotionEligibility: {
            eligible: true,
            score: 90,
            scopeMode: 'project_control',
          },
        },
      },
    }

    const result = assembleExecutableDefaultMasterPlanRows({
      rows: [contractualMilestone] as any,
      businessType: 'hotel',
      masterPlanProfile: { rowCountRange: [1, 1] },
    })

    expect(result.promotedLinkedProjectionRowCount).toBe(1)
    expect(result.promotionCandidateMissingDurationAuthorityRowCount).toBe(0)
    expect(contractualMilestone.rowProjectionMode).toBe('schedule_row')
    expect(contractualMilestone.values.is_milestone).toBe(true)
    expect(contractualMilestone.values.duration_contribution_mode).toBe('record_only')
  })
})

function withWindow<T extends ReturnType<typeof scheduleRow>>(row: T, start: string, end: string) {
  return {
    ...row,
    values: {
      ...row.values,
      planned_start_date: start,
      planned_end_date: end,
    },
  }
}

function withDependency<T extends ReturnType<typeof withWindow>>(
  row: T,
  predecessor: ReturnType<typeof withWindow>,
) {
  return {
    ...row,
    predecessorClientRowIds: [predecessor.clientRowId],
    predecessorDependencies: [{
      clientRowId: predecessor.clientRowId,
      dependencyType: 'FS',
      lagDays: 0,
      intentCode: 'test_business_dependency',
    }],
  }
}

function governedDurationRow(params: {
  code: string
  title: string
  phase: string
  start: string
  end: string
  parentClientRowId: string | null
  sortOrder: number
  projectionMode?: 'schedule_row' | 'linked_projection'
}) {
  const base = withWindow(scheduleRow({
    code: params.code,
    title: params.title,
    phase: params.phase,
  }), params.start, params.end)
  const projectionMode = params.projectionMode ?? 'linked_projection'
  return {
    ...base,
    parentClientRowId: params.parentClientRowId,
    sortOrder: params.sortOrder,
    rowProjectionMode: projectionMode,
    scheduleParticipation: projectionMode === 'schedule_row' ? 'primary_schedule' : 'read_only_projection',
    linkedProjectionSource: projectionMode === 'schedule_row'
      ? null
      : { originalRowProjectionMode: 'schedule_row' },
    durationSuggestion: {
      recommendedDurationDays: 20,
      conservativeDurationDays: 25,
      businessReasonCode: 'MANAGED_FRONTIER_DESCENDANT_ROLLUP',
      businessReasonParams: {
        descendantRollup: {
          durationSeedStableCodes: [`seed:${params.code}`],
          childProcessStableCodes: [`${params.code}:process`],
        },
      },
      factorAvailability: {
        standard_work_duration_seed: true,
        managed_frontier_descendant_rollup: true,
      },
    },
    values: {
      ...base.values,
      execution_lane: 'shared_main_lane',
      category_type: 'item_work',
      wbs_node_type: 'item_work',
      plan_item_kind: 'work_task',
      execution_nature: 'physical_work',
      duration_contribution_mode: 'duration_bearing',
      template_group: 'building_main',
      duration_asset_mapping: {
        standardWorkDurationSeedStableCode: `test_duration_seed:${params.code}`,
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
      },
      duration_asset_calculation: {
        standardWorkDurationSeedStableCode: `test_duration_seed:${params.code}`,
        selectedDurationDays: 20,
      },
      standard_task_metadata: {
        stableCode: params.code,
        durationContributionMode: 'duration_bearing',
        executionNature: 'physical_work',
        masterPlanVisibilityDecision: {
          policyVersion: 'v1.4.23.1-master-plan-visibility-v1',
          visibleOnMasterPlan: projectionMode === 'schedule_row',
        },
        masterControlPromotionEligibility: {
          eligible: true,
          score: 100,
          scopeMode: 'project_control',
        },
        masterPlanProjectionPolicy: {
          originalRowProjectionMode: 'schedule_row',
        },
      },
    },
  } satisfies ExecutableDefaultMasterPlanAssemblyRow
}
