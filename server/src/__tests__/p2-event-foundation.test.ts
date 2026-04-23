import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

function readServerFile(...segments: string[]) {
  const serverRoot = process.cwd().endsWith(`${sep}server`)
    ? process.cwd()
    : resolve(process.cwd(), 'server')
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('P2 event foundation contracts', () => {
  it('keeps task progress snapshots idempotent per task/day/event while preserving distinct same-day event trails', () => {
    const dbServiceSource = readServerFile('src', 'services', 'dbService.ts')
    const migrationSource = readServerFile('migrations', '094a_finalize_task_snapshot_upsert_contract.sql')

    expect(dbServiceSource).toContain(".upsert(snapshot, {")
    expect(dbServiceSource).toContain("onConflict: 'task_id,snapshot_date,event_type,event_source'")
    expect(migrationSource).toContain('ALTER COLUMN event_type SET NOT NULL')
    expect(migrationSource).toContain('ALTER COLUMN event_source SET NOT NULL')
    expect(migrationSource).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_task_progress_snapshots_daily_event')
  })

  it('wires event-driven project health updates to conditions, obstacles and governance notifications', () => {
    const taskConditionsSource = readServerFile('src', 'routes', 'task-conditions.ts')
    const taskObstaclesSource = readServerFile('src', 'routes', 'task-obstacles.ts')
    const planningGovernanceSource = readServerFile('src', 'services', 'planningGovernanceService.ts')

    expect(taskConditionsSource).toContain('enqueueProjectHealthUpdate')
    expect(taskConditionsSource).toContain('task_condition_created')
    expect(taskConditionsSource).toContain('task_condition_updated')
    expect(taskConditionsSource).toContain('task_condition_deleted')
    expect(taskConditionsSource).toContain('task_condition_completed')

    expect(taskObstaclesSource).toContain('enqueueProjectHealthUpdate')
    expect(taskObstaclesSource).toContain('task_obstacle_created')
    expect(taskObstaclesSource).toContain('task_obstacle_updated')
    expect(taskObstaclesSource).toContain('task_obstacle_deleted')
    expect(taskObstaclesSource).toContain('task_obstacle_resolved')

    expect(planningGovernanceSource).toContain('enqueueProjectHealthUpdate')
    expect(planningGovernanceSource).toContain('planning_governance_notification')
  })

  it('keeps jobs API aligned with current schedulers and removes legacy auto alert placeholders', () => {
    const jobsSource = readServerFile('src', 'routes', 'jobs.ts')

    expect(jobsSource).toContain('operationalNotificationJob')
    expect(jobsSource).toContain('notificationLifecycleJob')
    expect(jobsSource).toContain('conditionAlertJob')
    expect(jobsSource).toContain('planningGovernanceJob')
    expect(jobsSource).not.toContain('autoAlertService.daily')
    expect(jobsSource).not.toContain('autoAlertService.hourly')
    expect(jobsSource).not.toContain('501')
  })
})
