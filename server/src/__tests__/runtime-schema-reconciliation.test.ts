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
    expect(migration).toContain('ALTER TABLE IF EXISTS public.delay_requests')
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
    const taskSummarySource = readServerFile('src', 'routes', 'task-summaries.ts')
    const projectExecutionSummarySource = readServerFile('src', 'services', 'projectExecutionSummaryService.ts')

    expect(auditLoggerSource).toContain('INSERT INTO public.operation_logs')
    expect(progressDeviationSource).toContain("fetchRowsIn<TaskProgressSnapshot>(")
    expect(progressDeviationSource).toContain("'task_progress_snapshots'")
    expect(progressDeviationSource).not.toContain("fetchRows<TaskProgressSnapshot>('task_progress_snapshots', [['project_id', projectId]])")
    expect(taskSummarySource).toContain(".in('task_id', projectTaskIds)")
    expect(projectExecutionSummarySource).toContain('loadPlanningGovernanceStates(')
  })
})
