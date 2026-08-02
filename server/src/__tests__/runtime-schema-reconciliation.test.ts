import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('runtime schema reconciliation', () => {
  it('adds a single additive migration for missed runtime schema gaps', () => {
    const migration = readServerFile('migrations', '081_reconcile_runtime_schema_gaps.sql')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.task_baselines')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.monthly_plans')
    expect(migration).toContain('ALTER TABLE public.task_progress_snapshots')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.alerts')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.planning_governance_states')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.operation_logs')
  })

  it('keeps operation_logs DDL in migrations instead of audit request handling', () => {
    const migration = readServerFile('migrations', '107_move_operation_logs_schema_to_migration.sql')
    const auditLoggerSource = readServerFile('src', 'middleware', 'auditLogger.ts')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.operation_logs')
    expect(migration).toContain('ALTER TABLE IF EXISTS public.operation_logs')
    expect(migration).toContain('idx_operation_logs_project_id')
    expect(auditLoggerSource).toContain('INSERT INTO public.operation_logs')
    expect(auditLoggerSource).not.toContain('CREATE TABLE IF NOT EXISTS public.operation_logs')
    expect(auditLoggerSource).not.toContain('ALTER TABLE IF EXISTS public.operation_logs')
    expect(auditLoggerSource).not.toContain('CREATE INDEX IF NOT EXISTS idx_operation_logs')
    expect(auditLoggerSource).not.toContain('ensureTableOnce')
  })

  it('keeps audit logger and progress deviation runtime code aligned with the reconciled schema', () => {
    const auditLoggerSource = readServerFile('src', 'middleware', 'auditLogger.ts')
    const progressDeviationSource = readServerFile('src', 'services', 'progressDeviationService.ts')
    const taskSummaryRouteSource = readServerFile('src', 'routes', 'task-summaries.ts')
    const taskSummaryDailyProgressSource = readServerFile(
      'src',
      'services',
      'taskSummaryDailyProgressService.ts',
    )
    const projectExecutionSummarySource = readServerFile('src', 'services', 'projectExecutionSummaryService.ts')

    expect(auditLoggerSource).toContain('INSERT INTO public.operation_logs')
    expect(progressDeviationSource).toContain("fetchRowsIn<TaskProgressSnapshot>(")
    expect(progressDeviationSource).toContain("'task_progress_snapshots'")
    expect(progressDeviationSource).not.toContain("fetchRows<TaskProgressSnapshot>('task_progress_snapshots', [['project_id', projectId]])")
    expect(taskSummaryRouteSource).toContain('getDailyTaskProgressReadModel({')
    expect(taskSummaryDailyProgressSource).toContain(".in('task_id', projectTaskIds)")
    expect(projectExecutionSummarySource).toContain('loadPlanningGovernanceStates(')
  })

  it('keeps v1.4.23.1 runtime-consumed columns in forward and clean migrations', () => {
    const forwardMigration = readServerFile('migrations', '250_v14231_runtime_schema_gap_closeout.sql')
    const cleanMigration = readServerFile('migrations', 'CLEAN_MIGRATION_V4.sql')
    const requiredSnippets = [
      'ALTER TABLE public.tasks',
      'ADD COLUMN IF NOT EXISTS execution_lane TEXT',
      'CREATE INDEX IF NOT EXISTS idx_tasks_execution_lane',
      'ALTER TABLE public.acceptance_plans',
      'ADD COLUMN IF NOT EXISTS plan_name TEXT',
      'SET plan_name = acceptance_name',
      'ALTER TABLE public.monthly_plans',
      'ADD COLUMN IF NOT EXISTS pending_closeout_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE public.task_conditions',
      'ADD COLUMN IF NOT EXISTS condition_name TEXT',
      'SET condition_name = name',
    ]

    for (const source of [forwardMigration, cleanMigration]) {
      for (const snippet of requiredSnippets) {
        expect(source).toContain(snippet)
      }
      expect(source).toContain("NOTIFY pgrst, 'reload schema'")
    }

    expect(cleanMigration).toContain('Source: 250_v14231_runtime_schema_gap_closeout.sql')
  })
})
