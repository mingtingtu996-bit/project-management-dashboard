import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildDraftLockNotificationRecipients,
  canForceUnlockDraftLock,
  classifyDraftLockConflict,
  isDraftLockExpired,
  PLANNING_DRAFT_LOCK_REMINDER_MINUTES,
  PLANNING_DRAFT_LOCK_TIMEOUT_MINUTES,
  resolveDraftLockReleasedBy,
  shouldSendDraftLockReminder,
} from '../services/planningDraftLockService.js'
import { planningContracts, planningStateMachine, PlanningStateTransitionError } from '../services/planningStateMachine.js'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('planning domain contract', () => {
  it('keeps the 15.1 migrations additive and creates the planning base tables', () => {
    const migrations = {
      baselines: readServerFile('migrations', '059_create_task_baselines_tables.sql'),
      monthlyPlans: readServerFile('migrations', '060_create_monthly_plans_tables.sql'),
      taskAnchors: readServerFile('migrations', '061_alter_tasks_add_planning_anchors.sql'),
      milestoneDates: readServerFile('migrations', '062_alter_milestones_add_planning_dates.sql'),
      snapshots: readServerFile('migrations', '063_alter_task_progress_snapshots_for_planning.sql'),
      draftLocks: readServerFile('migrations', '064_create_planning_draft_locks.sql'),
    }

    expect(migrations.baselines).toContain('CREATE TABLE IF NOT EXISTS task_baselines')
    expect(migrations.baselines).toContain('CREATE TABLE IF NOT EXISTS task_baseline_items')
    expect(migrations.monthlyPlans).toContain('CREATE TABLE IF NOT EXISTS monthly_plans')
    expect(migrations.monthlyPlans).toContain('CREATE TABLE IF NOT EXISTS monthly_plan_items')
    expect(migrations.taskAnchors).toContain('ALTER TABLE tasks')
    expect(migrations.taskAnchors).toContain('ADD COLUMN IF NOT EXISTS baseline_item_id')
    expect(migrations.taskAnchors).toContain('ADD COLUMN IF NOT EXISTS monthly_plan_item_id')
    expect(migrations.milestoneDates).toContain('ALTER TABLE milestones')
    expect(migrations.milestoneDates).toContain('ADD COLUMN IF NOT EXISTS baseline_date')
    expect(migrations.milestoneDates).toContain('ADD COLUMN IF NOT EXISTS current_plan_date')
    expect(migrations.milestoneDates).toContain('ADD COLUMN IF NOT EXISTS actual_date')
    expect(migrations.snapshots).toContain('ALTER TABLE task_progress_snapshots')
    expect(migrations.snapshots).toContain('ADD COLUMN IF NOT EXISTS event_type')
    expect(migrations.snapshots).toContain('ADD COLUMN IF NOT EXISTS event_source')
    expect(migrations.snapshots).toContain('ADD COLUMN IF NOT EXISTS baseline_item_id')
    expect(migrations.snapshots).toContain('ADD COLUMN IF NOT EXISTS monthly_plan_item_id')
    expect(migrations.snapshots).toContain('ADD COLUMN IF NOT EXISTS baseline_version_id')
    expect(migrations.snapshots).toContain('ADD COLUMN IF NOT EXISTS monthly_plan_version_id')
    expect(migrations.snapshots).toContain('ADD COLUMN IF NOT EXISTS planning_source_type')
    expect(migrations.snapshots).not.toContain('CREATE TABLE IF NOT EXISTS task_progress_snapshots')
    expect(migrations.draftLocks).toContain('CREATE TABLE IF NOT EXISTS planning_draft_locks')

    expect(planningContracts.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/api/task-baselines' }),
        expect.objectContaining({ method: 'POST', path: '/api/task-baselines' }),
        expect.objectContaining({ method: 'POST', path: '/api/task-baselines/:id/confirm' }),
        expect.objectContaining({ method: 'POST', path: '/api/task-baselines/:id/queue-realignment' }),
        expect.objectContaining({ method: 'POST', path: '/api/task-baselines/:id/resolve-realignment' }),
        expect.objectContaining({ method: 'GET', path: '/api/task-baselines/:id/revision-pool' }),
        expect.objectContaining({ method: 'POST', path: '/api/task-baselines/:id/revision-pool' }),
        expect.objectContaining({ method: 'POST', path: '/api/task-baselines/:id/revisions' }),
        expect.objectContaining({ method: 'GET', path: '/api/task-baselines/:id/lock' }),
        expect.objectContaining({ method: 'POST', path: '/api/task-baselines/:id/force-unlock' }),
        expect.objectContaining({ method: 'GET', path: '/api/monthly-plans' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/confirm' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/revoke' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/void' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/queue-realignment' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/resolve-realignment' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/close' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/force-close' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/items/batch-scope' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/items/batch-shift-dates' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/items/batch-target-progress' }),
        expect.objectContaining({ method: 'GET', path: '/api/monthly-plans/:id/lock' }),
        expect.objectContaining({ method: 'POST', path: '/api/monthly-plans/:id/force-unlock' }),
        expect.objectContaining({ method: 'POST', path: '/api/planning-governance/:projectId/start-reorder' }),
        expect.objectContaining({ method: 'POST', path: '/api/planning-governance/:projectId/end-reorder' }),
      ])
    )
  })

  it('registers the new planning routes and timeout job in the runtime entrypoints', () => {
    const indexSource = readServerFile('src', 'index.ts')
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const baselineRouteSource = readServerFile('src', 'routes', 'task-baselines.ts')
    const monthlyRouteSource = readServerFile('src', 'routes', 'monthly-plans.ts')
    const lockServiceSource = readServerFile('src', 'services', 'planningDraftLockService.ts')

    expect(indexSource).toContain("import taskBaselinesRouter from './routes/task-baselines.js'")
    expect(indexSource).toContain("import monthlyPlansRouter from './routes/monthly-plans.js'")

    expect(indexSource).toContain("app.use('/api/task-baselines', taskBaselinesRouter)")
    expect(indexSource).toContain("app.use('/api/monthly-plans', monthlyPlansRouter)")

    expect(schedulerSource).toContain('planningDraftLockTimeoutJob.start()')
    expect(schedulerSource).toContain('planningDraftLockTimeoutJob.stop()')
    expect(baselineRouteSource).toContain('planningStateMachine.transition')
    expect(monthlyRouteSource).toContain('planningStateMachine.transition')
    expect(baselineRouteSource).toContain('cleanupBaselineDraft')
    expect(baselineRouteSource).toContain("'/:id/revision-pool'")
    expect(baselineRouteSource).toContain("'/:id/revisions'")
    expect(baselineRouteSource).toContain("'/:id/queue-realignment'")
    expect(baselineRouteSource).toContain("'/:id/resolve-realignment'")
    expect(monthlyRouteSource).toContain('cleanupMonthlyPlanDraft')
    expect(monthlyRouteSource).toContain("'/:id/force-close'")
    expect(monthlyRouteSource).toContain("'/:id/revoke'")
    expect(monthlyRouteSource).toContain("'/:id/void'")
    expect(monthlyRouteSource).toContain("'/:id/queue-realignment'")
    expect(monthlyRouteSource).toContain("'/:id/resolve-realignment'")
    expect(monthlyRouteSource).toContain("'/:id/items/batch-scope'")
    expect(monthlyRouteSource).toContain("'/:id/items/batch-shift-dates'")
    expect(monthlyRouteSource).toContain("'/:id/items/batch-target-progress'")
    expect(indexSource).toContain("app.use('/api/planning-governance', planningGovernanceRouter)")
    expect(lockServiceSource).toContain('recipients:')
    expect(lockServiceSource).toContain('releasedBy')
  })

  it('classifies planning draft locks with timeout, reminder and force-unlock rules', () => {
    expect(PLANNING_DRAFT_LOCK_TIMEOUT_MINUTES).toBe(30)
    expect(PLANNING_DRAFT_LOCK_REMINDER_MINUTES).toBe(5)

    const now = new Date('2026-04-13T10:00:00.000Z')

    expect(
      isDraftLockExpired(
        {
          lock_expires_at: '2026-04-13T09:29:59.000Z',
        } as any,
        now
      )
    ).toBe(true)

    expect(
      classifyDraftLockConflict(
        {
          is_locked: true,
          lock_expires_at: '2026-04-13T10:20:00.000Z',
        } as any,
        now
      )
    ).toBe('LOCK_HELD')

    expect(
      classifyDraftLockConflict(
        {
          is_locked: true,
          lock_expires_at: '2026-04-13T09:30:00.000Z',
        } as any,
        now
      )
    ).toBe('LOCK_EXPIRED')

    expect(
      shouldSendDraftLockReminder(
        {
          lock_expires_at: '2026-04-13T10:04:30.000Z',
          reminder_sent_at: null,
        } as any,
        now
      )
    ).toBe(true)

    expect(
      shouldSendDraftLockReminder(
        {
          lock_expires_at: '2026-04-13T10:04:30.000Z',
          reminder_sent_at: '2026-04-13T10:00:00.000Z',
        } as any,
        now
      )
    ).toBe(false)

    expect(canForceUnlockDraftLock('owner')).toBe(true)
    expect(canForceUnlockDraftLock('admin')).toBe(true)
    expect(canForceUnlockDraftLock('editor')).toBe(false)
    expect(canForceUnlockDraftLock(undefined)).toBe(false)
  })

  it('keeps lock notifications addressable and timeout releases unauthenticated', () => {
    expect(
      buildDraftLockNotificationRecipients({
        lockedBy: 'editor-1',
      })
    ).toEqual(['editor-1'])

    expect(
      buildDraftLockNotificationRecipients({
        lockedBy: 'editor-1',
        actorUserId: 'owner-1',
        includeActor: true,
      })
    ).toEqual(['editor-1', 'owner-1'])

    expect(resolveDraftLockReleasedBy('timeout', 'editor-1')).toBeNull()
    expect(resolveDraftLockReleasedBy('force_unlock', 'owner-1')).toBe('owner-1')
    expect(resolveDraftLockReleasedBy('manual_release', null)).toBeNull()
  })

  it('blocks confirmation and closing when blocking issues exist', () => {
    expect(() =>
      planningStateMachine.transition('draft', 'CONFIRM', {
        version: 2,
        expected_version: 2,
        blocking_issue_count: 1,
      })
    ).toThrow(PlanningStateTransitionError)

    try {
      planningStateMachine.transition('draft', 'CONFIRM', {
        version: 2,
        expected_version: 2,
        blocking_issue_count: 1,
      })
      throw new Error('expected state transition to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(PlanningStateTransitionError)
      expect((error as PlanningStateTransitionError).code).toBe('BLOCKING_ISSUES_EXIST')
    }

    expect(() =>
      planningStateMachine.transition('confirmed', 'CLOSE_MONTH', {
        blocking_issue_count: 1,
      })
    ).toThrow(PlanningStateTransitionError)
  })
})
