import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  calculateWbsParentPlanRollup,
  validateWbsPlanRollupRows,
} from '../services/wbsPlanRollupService.js'

const serverRoot = resolve(__dirname, '..', '..')
const srcRoot = resolve(serverRoot, 'src')

const ALLOWED_ROLLUP_IMPLEMENTATION_FILES = new Set([
  'services/wbsPlanRollupService.ts',
  '__tests__/contracts/durationConsistency.contract.test.ts',
  '__tests__/wbsPlanRollupContract.test.ts',
  '__tests__/wbsTemplateGenerationService.test.ts',
])

const DUPLICATED_ROLLUP_IMPLEMENTATION_PATTERNS = [
  /childReferenceDurationTotal\s*=\s*[^;\n]+\.reduce/,
  /referenceDurationPolicy\s*=\s*[^;\n]*activity_step_sum/,
  /rollupSource:\s*'child_plan_window'/,
  /plannedStartDate\s*=\s*[^;\n]+\.reduce\(\(earliest/,
  /plannedEndDate\s*=\s*[^;\n]+\.reduce\(\(latest/,
  /distributePlanDurationAcrossActivitySteps\s*=/,
]

function toPosixPath(path: string) {
  return path.replace(/\\/g, '/')
}

function collectSourceFiles(dir: string, result: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue
      collectSourceFiles(fullPath, result)
      continue
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) result.push(fullPath)
  }
  return result
}

describe('wbs plan rollup contract', () => {
  it('keeps parent-child rollup implementations behind the shared service boundary while allowing callers', () => {
    const violations: Array<{ file: string; pattern: string }> = []
    for (const file of collectSourceFiles(srcRoot)) {
      const relative = toPosixPath(file.slice(srcRoot.length + 1))
      if (ALLOWED_ROLLUP_IMPLEMENTATION_FILES.has(relative)) continue
      const source = readFileSync(file, 'utf8')
      for (const pattern of DUPLICATED_ROLLUP_IMPLEMENTATION_PATTERNS) {
        if (pattern.test(source)) {
          violations.push({ file: relative, pattern: String(pattern) })
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('hard-excludes non-duration-bearing activity steps from process reference duration rollup', () => {
    const rollup = calculateWbsParentPlanRollup('process', [
      {
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-01',
        referenceDuration: 99,
        durationContributionMode: 'embedded_check',
        wbsNodeType: 'activity_step',
      },
      {
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-05',
        referenceDuration: 5,
        durationContributionMode: 'duration_bearing',
        wbsNodeType: 'activity_step',
      },
    ])

    expect(rollup).toEqual(expect.objectContaining({
      plannedDurationDays: 5,
      referenceDurationDays: 5,
      childReferenceDurationTotal: 5,
      referenceDurationPolicy: 'activity_step_sum',
      diagnostics: expect.objectContaining({
        nonDurationBearingChildCount: 1,
        excludedReferenceDurationChildCount: 1,
        excludedWindowChildCount: 1,
        windowContributorCount: 1,
        referenceDurationContributorCount: 1,
      }),
    }))
  })

  it('uses the default window-contribution strategy for non-duration-bearing child types', () => {
    const rollup = calculateWbsParentPlanRollup('item_work', [
      {
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-03',
        referenceDuration: 3,
        durationContributionMode: 'duration_bearing',
        wbsNodeType: 'process',
      },
      {
        plannedStartDate: '2026-05-20',
        plannedEndDate: '2026-05-20',
        referenceDuration: 99,
        durationContributionMode: 'record_only',
        wbsNodeType: 'activity_step',
      },
      {
        plannedStartDate: '2026-06-05',
        plannedEndDate: '2026-06-05',
        referenceDuration: 99,
        durationContributionMode: 'quality_gate',
        wbsNodeType: 'activity_step',
      },
      {
        plannedStartDate: '2026-06-06',
        plannedEndDate: '2026-06-07',
        referenceDuration: 99,
        durationContributionMode: 'external_wait',
        wbsNodeType: 'activity_step',
      },
      {
        plannedStartDate: '2026-06-08',
        plannedEndDate: '2026-06-08',
        referenceDuration: 99,
        durationContributionMode: 'handover_marker',
        wbsNodeType: 'activity_step',
      },
      {
        plannedStartDate: '2026-06-09',
        plannedEndDate: '2026-06-09',
        referenceDuration: 99,
        durationContributionMode: 'embedded_check',
        wbsNodeType: 'activity_step',
      },
    ])

    expect(rollup).toEqual(expect.objectContaining({
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-08',
      plannedDurationDays: 8,
      referenceDurationDays: 3,
      childReferenceDurationTotal: 3,
      referenceDurationPolicy: 'date_window',
      diagnostics: expect.objectContaining({
        inputChildCount: 6,
        datedChildCount: 6,
        nonDurationBearingChildCount: 5,
        excludedReferenceDurationChildCount: 5,
        excludedWindowChildCount: 2,
        windowContributorCount: 4,
        referenceDurationContributorCount: 1,
        durationBasis: 'calendar_day',
        calendarApplied: false,
      }),
    }))
  })

  it('uses construction production-day basis when a work calendar is provided', () => {
    const rollup = calculateWbsParentPlanRollup('item_work', [
      {
        plannedStartDate: '2026-05-01',
        plannedEndDate: '2026-05-05',
        referenceDuration: 5,
        durationContributionMode: 'duration_bearing',
        wbsNodeType: 'process',
      },
    ], {
      workCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [{
          holidayCode: 'project_shutdown_2026',
          holidayName: 'Project shutdown',
          startDate: '2026-05-02',
          endDate: '2026-05-03',
          counts_as_construction_shutdown: true,
        }],
      },
    })

    expect(rollup).toEqual(expect.objectContaining({
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-05-05',
      plannedDurationDays: 3,
      referenceDurationDays: 3,
      diagnostics: expect.objectContaining({
        durationBasis: 'production_day',
        calendarApplied: true,
      }),
    }))
  })

  it('reports edit-state validation issues for invalid WBS rollup input', () => {
    const rows = [
      {
        id: 'root',
        parentId: null,
        type: 'division',
        start: '2026-06-01',
        end: '2026-06-10',
        referenceDuration: 10,
        mode: 'duration_bearing',
      },
      {
        id: 'root',
        parentId: null,
        type: 'division',
        start: '2026-06-01',
        end: '2026-06-10',
        referenceDuration: 10,
        mode: 'duration_bearing',
      },
      {
        id: 'child',
        parentId: 'child',
        type: 'process',
        start: '2026-06-05',
        end: '2026-06-03',
        referenceDuration: 2,
        mode: 'invalid-mode',
      },
      {
        id: 'grandchild',
        parentId: 'child',
        type: 'item_work',
        start: '',
        end: '2026-06-06',
        referenceDuration: 'x',
        mode: 'duration_bearing',
      },
      {
        id: 'orphan',
        parentId: 'missing',
        type: 'process',
        start: '2026-06-01',
        end: '2026-06-02',
        referenceDuration: 2,
        mode: 'duration_bearing',
      },
      {
        id: 'cycle-a',
        parentId: 'cycle-b',
        type: 'process',
        start: '2026-06-01',
        end: '2026-06-02',
        referenceDuration: 2,
        mode: 'duration_bearing',
      },
      {
        id: 'cycle-b',
        parentId: 'cycle-a',
        type: 'activity_step',
        start: '2026-06-01',
        end: '2026-06-02',
        referenceDuration: 2,
        mode: 'duration_bearing',
      },
    ]

    const issues = validateWbsPlanRollupRows(rows, {
      getId: (row) => row.id,
      getParentId: (row) => row.parentId,
      getNodeType: (row) => row.type,
      getPlannedStartDate: (row) => row.start,
      getPlannedEndDate: (row) => row.end,
      getReferenceDuration: (row) => row.referenceDuration,
      getDurationContributionMode: (row) => row.mode,
    })

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'DUPLICATE_ROW_ID',
      'SELF_PARENT',
      'INVALID_PLANNED_DATE',
      'INVALID_DURATION_CONTRIBUTION_MODE',
      'INVALID_WBS_HIERARCHY',
      'MISSING_PLANNED_DATE',
      'INVALID_REFERENCE_DURATION',
      'MISSING_PARENT_ROW',
      'CYCLE_PARENT_CHAIN',
    ]))
    expect(issues.filter((issue) => issue.level === 'error').length).toBeGreaterThan(0)
  })

  it('blocks new WBS rollup rows when durationContributionMode is missing', () => {
    const issues = validateWbsPlanRollupRows([
      {
        id: 'process-1',
        parentId: null,
        type: 'process',
        start: '2026-06-01',
        end: '2026-06-05',
        referenceDuration: 5,
      },
    ], {
      getId: (row) => row.id,
      getParentId: (row) => row.parentId,
      getNodeType: (row) => row.type,
      getPlannedStartDate: (row) => row.start,
      getPlannedEndDate: (row) => row.end,
      getReferenceDuration: (row) => row.referenceDuration,
      getDurationContributionMode: (row) => (row as { mode?: unknown }).mode,
    })

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MISSING_DURATION_CONTRIBUTION_MODE',
        level: 'error',
        rowId: 'process-1',
        field: 'durationContributionMode',
      }),
    ]))
  })

  it('keeps durationContributionMode migration schema-only so runtime write chain remains the single inference source', () => {
    const migration = readFileSync(
      resolve(serverRoot, 'migrations', '172_wbs_duration_contribution_mode_backfill.sql'),
      'utf8',
    )

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS duration_contribution_mode')
    expect(migration).toContain('duration_contribution_mode')
    expect(migration).toContain("'duration_bearing'")
    expect(migration).toContain('tasks_duration_contribution_mode_check')
    expect(migration).toContain('duration_contribution_mode IS NULL')
    expect(migration).toContain('taskWriteChainService')
    expect(migration).not.toContain('UPDATE tasks')
    expect(migration).not.toContain('standard_task_metadata->>')
    expect(migration).not.toContain('ALTER COLUMN duration_contribution_mode SET NOT NULL')
    expect(migration).not.toContain('WHEN COALESCE(is_wbs_summary')
  })

  it('keeps task transaction writes persisting durationContributionMode as a first-class task field', () => {
    const taskCodeTransaction = readFileSync(
      resolve(srcRoot, 'services', 'taskCodeTransactionService.ts'),
      'utf8',
    )

    expect(taskCodeTransaction).toContain("'duration_contribution_mode'")
  })

  it('keeps task write chain as the runtime defaulting source for durationContributionMode', () => {
    const taskWriteChain = readFileSync(
      resolve(srcRoot, 'services', 'taskWriteChainService.ts'),
      'utf8',
    )

    expect(taskWriteChain).toContain('function ensureDurationContributionModeForWrite')
    expect(taskWriteChain).toContain('inferDurationContributionMode({')
    expect(taskWriteChain).toContain('ensureDurationContributionModeForWrite(inputRecord)')
    expect(taskWriteChain).toContain('ensureDurationContributionModeForWrite(mergedForValidation)')
    expect(taskWriteChain).toContain("'duration_contribution_mode' in updatesRecord")
    expect(taskWriteChain).toContain("'standard_task_metadata' in updatesRecord")
    expect(taskWriteChain).toContain("'title' in updatesRecord")
    expect(taskWriteChain).toContain("'wbs_node_type' in updatesRecord")
    expect(taskWriteChain).toContain("'is_wbs_summary' in updatesRecord")
  })
})
