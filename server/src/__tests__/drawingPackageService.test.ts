import { describe, expect, it } from 'vitest'

import {
  buildDrawingBoardView,
  buildDrawingLedgerRows,
  buildDrawingPackageDetailView,
  buildDrawingPackageTemplateItems,
  DEFAULT_DRAWING_PACKAGE_TEMPLATES,
  deriveDrawingScheduleImpactFlag,
  resolveDrawingCurrentVersionPolicy,
  resolveDrawingReviewRuleEvaluation,
  resolveDrawingPackageCurrentVersionTarget,
  getDrawingReviewStatusLabel,
} from '../services/drawingPackageService.js'

describe('drawing package service', () => {
  it('builds board summary and package cards from package items and drawings', () => {
    const packageRow = {
      id: 'pkg-structure',
      project_id: 'project-1',
      package_code: 'structure-execution',
      package_name: '结构施工图包',
      discipline_type: '结构',
      document_purpose: '施工执行',
      status: 'preparing',
      requires_review: false,
      review_mode: 'none',
      review_basis: '常规施工执行包默认不送审',
      completeness_ratio: 50,
      missing_required_count: 1,
      current_version_drawing_id: 'drawing-1',
      has_change: false,
      schedule_impact_flag: true,
      is_ready_for_construction: true,
      is_ready_for_acceptance: false,
      updated_at: '2026-04-15T00:00:00.000Z',
    }

    const itemTemplates = buildDrawingPackageTemplateItems(DEFAULT_DRAWING_PACKAGE_TEMPLATES[1]!)

    const board = buildDrawingBoardView({
      packages: [packageRow],
      items: [
        { id: 'item-1', package_id: 'pkg-structure', item_code: itemTemplates[0]!.itemCode, item_name: itemTemplates[0]!.itemName, is_required: true, current_drawing_id: 'drawing-1', current_version: '1.2', status: 'available', sort_order: 1 },
        { id: 'item-2', package_id: 'pkg-structure', item_code: itemTemplates[1]!.itemCode, item_name: itemTemplates[1]!.itemName, is_required: true, current_drawing_id: null, current_version: null, status: 'missing', sort_order: 2 },
      ],
      drawings: [
        {
          id: 'drawing-1',
          project_id: 'project-1',
          package_id: 'pkg-structure',
          package_code: 'structure-execution',
          package_name: '结构施工图包',
          drawing_type: '结构',
          document_purpose: '施工执行',
          drawing_code: 'STR-001',
          drawing_name: '基础图',
          version_no: '1.2',
          drawing_status: '已出图',
          is_current_version: true,
          requires_review: false,
          review_mode: 'none',
          review_status: '已通过',
          has_change: false,
          schedule_impact_flag: true,
        },
      ],
      versions: [
        {
          id: 'ver-1',
          package_id: 'pkg-structure',
          drawing_id: 'drawing-1',
          version_no: '1.2',
          is_current_version: true,
          created_at: '2026-04-15T00:00:00.000Z',
          created_by: 'system',
          drawing_name: '基础图',
        },
      ],
    })

    expect(board.summary).toEqual({
      totalPackages: 1,
      missingPackages: 1,
      mandatoryReviewPackages: 0,
      reviewingPackages: 0,
      scheduleImpactCount: 1,
      readyForConstructionCount: 1,
      readyForAcceptanceCount: 0,
    })
    expect(board.packages[0]?.currentVersionLabel).toBe('当前有效版 v1.2')
    expect(board.packages[0]?.completenessRatio).toBe(50)

    const ledger = buildDrawingLedgerRows([
      {
        id: 'drawing-1',
        project_id: 'project-1',
        package_id: 'pkg-structure',
        package_code: 'structure-execution',
        package_name: '结构施工图包',
        drawing_type: '结构',
        document_purpose: '施工执行',
        drawing_code: 'STR-001',
        drawing_name: '基础图',
        version_no: '1.2',
        drawing_status: '已出图',
        is_current_version: true,
        requires_review: false,
        review_mode: 'none',
        review_status: '已通过',
        has_change: false,
        schedule_impact_flag: true,
      },
    ])

    expect(ledger[0]?.reviewModeLabel).toBe('不适用')
    expect(ledger[0]?.scheduleImpactFlag).toBe(true)

    const detail = buildDrawingPackageDetailView({
      packageRow,
      requiredItems: [
        { id: 'item-1', package_id: 'pkg-structure', item_code: 'structure-01', item_name: '基础图', discipline_type: '结构', is_required: true, current_drawing_id: 'drawing-1', current_version: '1.2', status: 'available', sort_order: 1 },
        { id: 'item-2', package_id: 'pkg-structure', item_code: 'structure-02', item_name: '梁板配筋图', discipline_type: '结构', is_required: true, current_drawing_id: null, current_version: null, status: 'missing', sort_order: 2 },
      ],
      drawings: ledger.map((row) => ({
        id: row.drawingId,
        project_id: 'project-1',
        package_id: row.packageId,
        package_code: row.packageCode,
        package_name: row.packageName,
        drawing_type: row.disciplineType,
        document_purpose: row.documentPurpose,
        drawing_code: row.drawingCode,
        drawing_name: row.drawingName,
        version_no: row.versionNo,
        drawing_status: row.drawingStatus,
        is_current_version: row.isCurrentVersion,
        requires_review: row.requiresReview,
        review_mode: row.reviewMode,
        review_status: row.reviewStatus,
        has_change: row.hasChange,
        schedule_impact_flag: row.scheduleImpactFlag,
      })),
      versions: [
        {
          id: 'ver-1',
          package_id: 'pkg-structure',
          drawing_id: 'drawing-1',
          parent_drawing_id: null,
          version_no: '1.2',
          revision_no: 'R1',
          issued_for: '施工执行',
          effective_date: '2026-04-15',
          is_current_version: true,
          superseded_at: null,
          created_at: '2026-04-15T00:00:00.000Z',
          created_by: 'system',
          drawing_name: '基础图',
        },
      ],
    })

    expect(detail.requiredItems).toHaveLength(2)
    expect(detail.requiredItems[0]).toMatchObject({
      disciplineType: '结构',
    })
    expect(detail.records[0]).toMatchObject({
      parentDrawingId: null,
      revisionNo: 'R1',
      issuedFor: '施工执行',
      effectiveDate: '2026-04-15',
      supersededAt: null,
    })
    expect(detail.records).toHaveLength(1)
    expect(detail.linkedTasks).toEqual([])
    expect(detail.linkedAcceptance).toEqual([])
  })

  it('adds linked task and acceptance counts to board cards', () => {
    const board = buildDrawingBoardView({
      packages: [
        {
          id: 'pkg-archive',
          project_id: 'project-1',
          package_code: 'archive-001',
          package_name: '竣工归档图纸包',
          discipline_type: '竣工归档',
          document_purpose: '竣工归档',
          status: 'completed',
          review_mode: 'manual_confirm',
          updated_at: '2026-04-22T00:00:00.000Z',
        },
      ],
      drawings: [
        {
          id: 'draw-archive',
          project_id: 'project-1',
          package_id: 'pkg-archive',
          package_code: 'archive-001',
          package_name: '竣工归档图纸包',
          discipline_type: '竣工归档',
          document_purpose: '竣工归档',
          drawing_code: 'ARC-001',
          drawing_name: '竣工总图',
          version_no: '1.0',
          is_current_version: true,
          review_mode: 'manual_confirm',
          review_status: '已通过',
        },
      ],
      tasks: [
        {
          id: 'task-archive',
          project_id: 'project-1',
          title: '整理归档资料',
          status: '进行中',
        },
      ],
      taskConditions: [
        {
          id: 'cond-archive',
          task_id: 'task-archive',
          project_id: 'project-1',
          condition_type: 'drawing',
          condition_name: '归档图纸齐备',
          drawing_package_id: 'pkg-archive',
          status: 'blocked',
          is_satisfied: false,
        },
      ],
      acceptancePlans: [
        {
          id: 'plan-archive',
          project_id: 'project-1',
          acceptance_name: '竣工归档验收',
          status: 'pending',
        },
      ],
      acceptanceRequirements: [
        {
          id: 'req-archive',
          project_id: 'project-1',
          plan_id: 'plan-archive',
          requirement_type: 'drawing_package',
          source_entity_type: 'drawing_package',
          source_entity_id: 'pkg-archive',
          drawing_package_id: 'pkg-archive',
          description: '需完成归档图纸上传',
          status: 'open',
        },
      ],
      acceptanceRecords: [
        {
          id: 'record-archive',
          project_id: 'project-1',
          plan_id: 'plan-archive',
          record_type: 'review',
          record_date: '2026-04-21T00:00:00.000Z',
        },
      ],
    })

    expect(board.packages[0]).toMatchObject({
      packageId: 'pkg-archive',
      linkedTaskCount: 1,
      linkedAcceptanceCount: 1,
      linkedCertificateCount: 0,
    })
  })

  it('derives schedule impact when review is overdue or returned', () => {
    expect(deriveDrawingScheduleImpactFlag({
      reviewStatus: '未提交',
      plannedSubmitDate: '2026-04-01T00:00:00.000Z',
      actualSubmitDate: null,
      hasChange: false,
    })).toBe(true)

    expect(deriveDrawingScheduleImpactFlag({
      reviewStatus: '审查中',
      plannedPassDate: '2026-04-01T00:00:00.000Z',
      actualPassDate: null,
      hasChange: false,
    })).toBe(true)

    expect(deriveDrawingScheduleImpactFlag({
      reviewStatus: '已通过',
      plannedPassDate: '2099-04-01T00:00:00.000Z',
      actualPassDate: '2099-03-31T00:00:00.000Z',
      hasChange: false,
    })).toBe(false)
  })

  it('maps stored review statuses back to page labels', () => {
    expect(getDrawingReviewStatusLabel('未提交', 'mandatory')).toBe('待送审')
    expect(getDrawingReviewStatusLabel('未提交', 'none')).toBe('不适用')
    expect(getDrawingReviewStatusLabel('审查中', 'mandatory')).toBe('审查中')
  })

  it('rejects version ids that belong to another package', () => {
    const result = resolveDrawingPackageCurrentVersionTarget({
      packageId: 'pkg-a',
      versionId: 'ver-b',
      drawingId: null,
      versions: [
        {
          id: 'ver-b',
          package_id: 'pkg-b',
          drawing_id: 'draw-b',
          version_no: '2.0',
          created_at: '2026-04-15T00:00:00.000Z',
        },
      ],
      drawings: [
        { id: 'draw-a', package_id: 'pkg-a' },
      ],
    })

    expect(result.error?.code).toBe('VERSION_NOT_IN_PACKAGE')
    expect(result.targetVersion).toBeNull()
    expect(result.needsSnapshot).toBe(false)
  })

  it('uses the template default review mode when no override exists', () => {
    const evaluation = resolveDrawingReviewRuleEvaluation({
      packageCode: 'completion-archive',
      packageName: '竣工归档包',
      disciplineType: '竣工归档',
      documentPurpose: '竣工归档',
      packageReviewMode: 'manual_confirm',
      packageReviewBasis: '模板默认',
    })

    expect(evaluation.requiresReview).toBe(true)
    expect(evaluation.reviewMode).toBe('manual_confirm')
  })

  it('lets a project review rule override the default review mode', () => {
    const evaluation = resolveDrawingReviewRuleEvaluation({
      projectId: 'project-1',
      packageCode: 'fire-review',
      packageName: '消防专项包',
      disciplineType: '消防',
      documentPurpose: '送审报批',
      packageReviewMode: 'mandatory',
      packageReviewBasis: '模板默认',
      reviewRules: [
        {
          id: 'rule-1',
          project_id: 'project-1',
          package_code: 'fire-review',
          default_review_mode: 'none',
          review_basis: '项目级人工修正',
          is_active: true,
        },
      ],
    })

    expect(evaluation.requiresReview).toBe(false)
    expect(evaluation.reviewMode).toBe('none')
    expect(evaluation.reviewBasis).toBe('项目级人工修正')
  })

  it('computes missing count and completeness from required items when package counters are absent', () => {
    const board = buildDrawingBoardView({
      packages: [
        {
          id: 'pkg-a',
          project_id: 'project-1',
          package_code: 'pkg-a',
          package_name: 'Package A',
          discipline_type: '建筑',
          document_purpose: '施工执行',
        },
      ],
      items: [
        {
          id: 'item-1',
          package_id: 'pkg-a',
          item_code: 'a-1',
          item_name: 'Item 1',
          is_required: true,
          current_drawing_id: 'drawing-1',
          current_version: '1.0',
          status: 'available',
          sort_order: 1,
        },
        {
          id: 'item-2',
          package_id: 'pkg-a',
          item_code: 'a-2',
          item_name: 'Item 2',
          is_required: true,
          current_drawing_id: null,
          current_version: null,
          status: 'missing',
          sort_order: 2,
        },
      ],
      drawings: [
        {
          id: 'drawing-1',
          project_id: 'project-1',
          package_id: 'pkg-a',
          package_code: 'pkg-a',
          package_name: 'Package A',
          discipline_type: '建筑',
          document_purpose: '施工执行',
          version_no: '1.0',
          is_current_version: true,
          review_mode: 'none',
          review_status: '不适用',
        },
      ],
      versions: [],
    })

    expect(board.packages[0]?.missingRequiredCount).toBe(1)
    expect(board.packages[0]?.completenessRatio).toBe(50)
  })

  it('rejects clearing the last current version', () => {
    const result = resolveDrawingCurrentVersionPolicy({
      explicitCurrentVersion: false,
      targetPackageCurrentCount: 1,
      targetWasCurrent: true,
    })

    expect(result.error?.code).toBe('MISSING_TARGET_DRAWING')
    expect(result.resolvedCurrentVersion).toBe(false)
  })

  it('keeps a package current when no current exists and no explicit flag is provided', () => {
    const result = resolveDrawingCurrentVersionPolicy({
      explicitCurrentVersion: null,
      targetPackageCurrentCount: 0,
      targetWasCurrent: false,
    })

    expect(result.error).toBeNull()
    expect(result.resolvedCurrentVersion).toBe(true)
  })

  it('allows switching current when another current remains in the package', () => {
    const result = resolveDrawingCurrentVersionPolicy({
      explicitCurrentVersion: false,
      targetPackageCurrentCount: 2,
      targetWasCurrent: true,
    })

    expect(result.error).toBeNull()
    expect(result.resolvedCurrentVersion).toBe(false)
  })

  it('promotes an explicitly current drawing', () => {
    const result = resolveDrawingCurrentVersionPolicy({
      explicitCurrentVersion: true,
      targetPackageCurrentCount: 2,
      targetWasCurrent: false,
    })

    expect(result.error).toBeNull()
    expect(result.resolvedCurrentVersion).toBe(true)
  })

  it('falls back to a package-local drawing when version rows are missing', () => {
    const result = resolveDrawingPackageCurrentVersionTarget({
      packageId: 'pkg-a',
      drawingId: 'draw-a',
      versions: [],
      drawings: [
        { id: 'draw-a', package_id: 'pkg-a', version_no: '1.0', is_current_version: true },
      ],
    })

    expect(result.error).toBeNull()
    expect(result.targetDrawingId).toBe('draw-a')
    expect(result.targetVersion).toBeNull()
    expect(result.needsSnapshot).toBe(true)
  })

  it('prefers the latest current drawing when duplicate current flags exist', () => {
    const board = buildDrawingBoardView({
      packages: [
        {
          id: 'pkg-a',
          project_id: 'project-1',
          package_code: 'pkg-a',
          package_name: 'Package A',
          discipline_type: '建筑',
          document_purpose: '施工执行',
          status: 'issued',
          requires_review: false,
          review_mode: 'none',
          completeness_ratio: 100,
          missing_required_count: 0,
          current_version_drawing_id: null,
          has_change: false,
          schedule_impact_flag: false,
          is_ready_for_construction: true,
          is_ready_for_acceptance: false,
        },
      ],
      drawings: [
        {
          id: 'draw-old',
          package_id: 'pkg-a',
          package_code: 'pkg-a',
          drawing_name: 'Older current',
          version_no: '1.0',
          is_current_version: true,
          created_at: '2026-04-15T00:00:00.000Z',
        },
        {
          id: 'draw-new',
          package_id: 'pkg-a',
          package_code: 'pkg-a',
          drawing_name: 'Newer current',
          version_no: '1.1',
          is_current_version: true,
          created_at: '2026-04-15T01:00:00.000Z',
        },
      ],
    })

    expect(board.packages[0]?.currentVersionDrawingId).toBe('draw-new')
    expect(board.packages[0]?.currentVersionNo).toBe('1.1')
  })

  it('links execution packages to task conditions and emits drawing issue and risk signals', () => {
    const detail = buildDrawingPackageDetailView({
      packageRow: {
        id: 'pkg-exec',
        project_id: 'project-1',
        package_code: 'exec-001',
        package_name: '施工执行图纸包',
        discipline_type: '建筑',
        document_purpose: '施工执行',
        status: 'reviewing',
        requires_review: true,
        review_mode: 'mandatory',
        review_basis: '模板默认',
        completeness_ratio: 75,
        missing_required_count: 1,
        current_version_drawing_id: 'draw-current',
        has_change: true,
        schedule_impact_flag: true,
        is_ready_for_construction: false,
        is_ready_for_acceptance: false,
      },
      requiredItems: [
        { id: 'item-1', package_id: 'pkg-exec', item_code: 'item-1', item_name: 'Item 1', is_required: true, current_drawing_id: 'draw-current', current_version: '1.1', status: 'available', sort_order: 1 },
        { id: 'item-2', package_id: 'pkg-exec', item_code: 'item-2', item_name: 'Item 2', is_required: true, current_drawing_id: null, current_version: null, status: 'missing', sort_order: 2 },
      ],
      drawings: [
        {
          id: 'draw-current',
          project_id: 'project-1',
          package_id: 'pkg-exec',
          package_code: 'exec-001',
          package_name: '施工执行图纸包',
          discipline_type: '建筑',
          document_purpose: '施工执行',
          drawing_code: 'DRAW-001',
          drawing_name: '施工执行图',
          version_no: '1.1',
          drawing_status: 'issued',
          is_current_version: true,
          requires_review: true,
          review_mode: 'mandatory',
          review_status: '待送审',
          planned_submit_date: '2026-04-01T00:00:00.000Z',
          planned_pass_date: '2026-04-02T00:00:00.000Z',
          has_change: true,
          schedule_impact_flag: true,
        },
        {
          id: 'draw-reject-1',
          project_id: 'project-1',
          package_id: 'pkg-exec',
          package_code: 'exec-001',
          package_name: '施工执行图纸包',
          discipline_type: '建筑',
          document_purpose: '施工执行',
          drawing_code: 'DRAW-002',
          drawing_name: '施工执行图-历史1',
          version_no: '1.0',
          drawing_status: 'reviewing',
          is_current_version: false,
          requires_review: true,
          review_mode: 'mandatory',
          review_status: '已驳回',
          has_change: true,
          schedule_impact_flag: false,
        },
        {
          id: 'draw-reject-2',
          project_id: 'project-1',
          package_id: 'pkg-exec',
          package_code: 'exec-001',
          package_name: '施工执行图纸包',
          discipline_type: '建筑',
          document_purpose: '施工执行',
          drawing_code: 'DRAW-003',
          drawing_name: '施工执行图-历史2',
          version_no: '0.9',
          drawing_status: 'reviewing',
          is_current_version: false,
          requires_review: true,
          review_mode: 'mandatory',
          review_status: '需修改',
          has_change: false,
          schedule_impact_flag: false,
        },
      ],
      versions: [],
      tasks: [
        { id: 'task-1', project_id: 'project-1', title: '施工执行图纸包对应任务', description: 'exec-001 图纸任务', status: 'in_progress' },
      ],
      taskConditions: [
        {
          id: 'cond-1',
          task_id: 'task-1',
          project_id: 'project-1',
          drawing_package_id: 'pkg-exec',
          drawing_package_code: 'exec-001',
          condition_type: '图纸',
          condition_name: '施工图纸到位',
          description: 'exec-001 图纸未齐',
          status: '未满足',
          is_satisfied: false,
        },
      ],
    })

    expect(detail.linkedTasks).toHaveLength(1)
    expect(detail.linkedTasks[0]?.conditions[0]?.name).toContain('施工图纸到位')
    expect(detail.issueSignals.map((signal) => signal.code)).toEqual(expect.arrayContaining([
      'missing-required',
      'incomplete-package',
      'review-overdue',
      'multi-round-reject',
    ]))
    expect(detail.riskSignals.map((signal) => signal.code)).toEqual(expect.arrayContaining([
      'schedule-impact',
      'package-change',
      'review-delay-risk',
    ]))
  })

  it('prefers explicit drawing package links for task conditions even under custom document purposes', () => {
    const detail = buildDrawingPackageDetailView({
      packageRow: {
        id: 'pkg-custom',
        project_id: 'project-1',
        package_code: 'custom-001',
        package_name: '专项联动图纸包',
        discipline_type: '建筑',
        document_purpose: '专项联动',
        status: 'issued',
      },
      requiredItems: [],
      drawings: [
        {
          id: 'draw-custom',
          project_id: 'project-1',
          package_id: 'pkg-custom',
          package_code: 'custom-001',
          package_name: '专项联动图纸包',
          discipline_type: '建筑',
          document_purpose: '专项联动',
          drawing_code: 'CUS-001',
          drawing_name: '专项联动图',
          version_no: '1.0',
          is_current_version: true,
        },
      ],
      versions: [],
      tasks: [
        { id: 'task-custom', project_id: 'project-1', title: '自定义用途任务', description: '不靠关键词命中', status: 'pending' },
      ],
      taskConditions: [
        {
          id: 'cond-custom',
          task_id: 'task-custom',
          project_id: 'project-1',
          condition_type: '图纸',
          condition_name: '条件已显式绑定图纸包',
          drawing_package_id: 'pkg-custom',
          drawing_package_code: 'custom-001',
          status: '未满足',
          is_satisfied: false,
        },
      ],
    })

    expect(detail.linkedTasks).toHaveLength(1)
    expect(detail.linkedTasks[0]?.id).toBe('task-custom')
    expect(detail.linkedTasks[0]?.conditions[0]?.id).toBe('cond-custom')
  })

  it('links archive packages to acceptance requirements', () => {
    const detail = buildDrawingPackageDetailView({
      packageRow: {
        id: 'pkg-archive',
        project_id: 'project-1',
        package_code: 'archive-001',
        package_name: '竣工归档图纸包',
        discipline_type: '竣工归档',
        document_purpose: '竣工归档',
        status: 'completed',
        requires_review: true,
        review_mode: 'manual_confirm',
        review_basis: '归档模板',
        completeness_ratio: 100,
        missing_required_count: 0,
        current_version_drawing_id: 'draw-archive',
        has_change: false,
        schedule_impact_flag: false,
        is_ready_for_construction: true,
        is_ready_for_acceptance: true,
      },
      requiredItems: [
        { id: 'item-1', package_id: 'pkg-archive', item_code: 'item-1', item_name: 'Item 1', is_required: true, current_drawing_id: 'draw-archive', current_version: '2.0', status: 'available', sort_order: 1 },
      ],
      drawings: [
        {
          id: 'draw-archive',
          project_id: 'project-1',
          package_id: 'pkg-archive',
          package_code: 'archive-001',
          package_name: '竣工归档图纸包',
          discipline_type: '竣工归档',
          document_purpose: '竣工归档',
          drawing_code: 'ARC-001',
          drawing_name: '归档图纸',
          version_no: '2.0',
          drawing_status: 'issued',
          is_current_version: true,
          requires_review: true,
          review_mode: 'manual_confirm',
          review_status: '已通过',
          has_change: false,
          schedule_impact_flag: false,
        },
      ],
      versions: [],
      acceptancePlans: [
        {
          id: 'plan-1',
          project_id: 'project-1',
          task_id: 'task-archive',
          plan_name: '竣工验收计划',
          acceptance_name: '竣工归档验收',
          acceptance_type: 'drawing',
          status: 'pending',
          planned_date: '2026-04-20T00:00:00.000Z',
        },
      ],
      acceptanceRequirements: [
        {
          id: 'req-1',
          project_id: 'project-1',
          plan_id: 'plan-1',
          requirement_type: 'drawing',
          source_entity_type: 'drawing',
          source_entity_id: 'draw-archive',
          description: '归档图纸要求',
          status: 'open',
        },
      ],
      acceptanceRecords: [
        {
          id: 'record-1',
          project_id: 'project-1',
          plan_id: 'plan-1',
          record_type: 'review',
          content: '首次归档记录',
          record_date: '2026-04-10T00:00:00.000Z',
        },
      ],
    })

    expect(detail.linkedAcceptance).toHaveLength(1)
    expect(detail.linkedAcceptance[0]?.latestRecordAt).toBe('2026-04-10T00:00:00.000Z')
    expect(detail.linkedAcceptance[0]?.requirements[0]?.sourceEntityType).toBe('drawing')
  })

  it('links acceptance requirements through explicit drawing package references for custom archive purposes', () => {
    const detail = buildDrawingPackageDetailView({
      packageRow: {
        id: 'pkg-archive-custom',
        project_id: 'project-1',
        package_code: 'archive-custom-001',
        package_name: '自定义归档包',
        discipline_type: '竣工归档',
        document_purpose: '专项归档',
        status: 'completed',
      },
      requiredItems: [],
      drawings: [
        {
          id: 'draw-archive-custom',
          project_id: 'project-1',
          package_id: 'pkg-archive-custom',
          package_code: 'archive-custom-001',
          package_name: '自定义归档包',
          discipline_type: '竣工归档',
          document_purpose: '专项归档',
          drawing_code: 'ARC-CUS-001',
          drawing_name: '归档专项图',
          version_no: '1.0',
          is_current_version: true,
        },
      ],
      versions: [],
      acceptancePlans: [
        {
          id: 'plan-custom-archive',
          project_id: 'project-1',
          acceptance_name: '专项归档验收',
          acceptance_type: 'drawing_package',
          status: 'pending',
        },
      ],
      acceptanceRequirements: [
        {
          id: 'req-custom-archive',
          project_id: 'project-1',
          plan_id: 'plan-custom-archive',
          requirement_type: 'drawing_package',
          source_entity_type: 'drawing_package',
          source_entity_id: 'pkg-archive-custom',
          description: '显式绑定图纸包',
          status: 'open',
        },
      ],
      acceptanceRecords: [],
    })

    expect(detail.linkedAcceptance).toHaveLength(1)
    expect(detail.linkedAcceptance[0]?.requirements[0]?.id).toBe('req-custom-archive')
  })

  it('marks drawing signals that were already escalated into issues and risks', () => {
    const detail = buildDrawingPackageDetailView({
      packageRow: {
        id: 'pkg-1',
        project_id: 'project-1',
        package_code: 'pkg-1',
        package_name: 'Linkage Package',
        discipline_type: '建筑',
        document_purpose: '施工执行',
        status: 'reviewing',
        requires_review: true,
        review_mode: 'mandatory',
        review_basis: 'template',
        completeness_ratio: 75,
        missing_required_count: 1,
        current_version_drawing_id: 'draw-1',
        has_change: true,
        schedule_impact_flag: true,
      },
      requiredItems: [
        { id: 'item-1', package_id: 'pkg-1', item_code: 'sheet-a', item_name: 'Sheet A', is_required: true, current_drawing_id: null, current_version: null, status: 'missing', sort_order: 1 },
      ],
      drawings: [
        {
          id: 'draw-1',
          project_id: 'project-1',
          package_id: 'pkg-1',
          package_code: 'pkg-1',
          package_name: 'Linkage Package',
          discipline_type: '建筑',
          document_purpose: '施工执行',
          drawing_code: 'DRW-1',
          drawing_name: 'Drawing A',
          version_no: '1.1',
          drawing_status: 'issued',
          is_current_version: true,
          review_mode: 'mandatory',
          review_status: '待送审',
          has_change: true,
          schedule_impact_flag: true,
        },
      ],
      versions: [],
      issues: [
        {
          id: 'issue-1',
          project_id: 'project-1',
          title: '图纸缺漏',
          description: 'linked issue',
          source_id: 'pkg-1',
          created_at: '2026-04-15T08:00:00.000Z',
        },
      ],
      risks: [
        {
          id: 'risk-1',
          project_id: 'project-1',
          title: '工期影响',
          description: 'linked risk',
          source_id: 'pkg-1',
          created_at: '2026-04-15T09:00:00.000Z',
        },
      ],
    })

    expect(detail.issueSignals.find((signal) => signal.code === 'missing-required')?.escalatedEntityId).toBe('issue-1')
    expect(detail.issueSignals.find((signal) => signal.code === 'missing-required')?.escalatedEntityType).toBe('issue')
    expect(detail.riskSignals.find((signal) => signal.code === 'schedule-impact')?.escalatedEntityId).toBe('risk-1')
    expect(detail.riskSignals.find((signal) => signal.code === 'schedule-impact')?.escalatedEntityType).toBe('risk')
  })
})
