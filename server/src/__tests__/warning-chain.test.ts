import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const scanPreMilestoneWarnings = vi.fn()
  const notificationRows: Array<Record<string, any>> = []
  const executeSQL = vi.fn(async () => [])
  const executeSQLOne = vi.fn(async () => ({ id: 'notification-1' }))

  return {
    scanPreMilestoneWarnings,
    notificationRows,
    executeSQL,
    executeSQLOne,
  }
})

vi.mock('../services/preMilestoneWarningService.js', () => ({
  scanPreMilestoneWarnings: mocks.scanPreMilestoneWarnings,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
    })),
  },
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: vi.fn(async (options: Record<string, any> = {}) => {
    let rows = mocks.notificationRows.slice()
    if (options.projectId) rows = rows.filter((row) => row.project_id === options.projectId)
    if (options.type) rows = rows.filter((row) => row.type === options.type)
    if (options.sourceEntityType) rows = rows.filter((row) => row.source_entity_type === options.sourceEntityType)
    if (options.sourceEntityId) rows = rows.filter((row) => row.source_entity_id === options.sourceEntityId)
    if (options.limit) rows = rows.slice(0, Number(options.limit))
    return rows
  }),
  findNotification: vi.fn(async () => null),
  insertNotification: vi.fn(async (notification: Record<string, any>) => {
    const row = { ...notification }
    mocks.notificationRows.push(row)
    return row
  }),
  updateNotificationById: vi.fn(async () => undefined),
  updateNotificationsByIds: vi.fn(async () => undefined),
  deleteNotificationById: vi.fn(async () => undefined),
}))

import { WarningService } from '../services/warningService.js'
import { persistNotification } from '../services/warningChainService.js'

afterEach(() => {
  vi.restoreAllMocks()
  mocks.scanPreMilestoneWarnings.mockReset()
  mocks.notificationRows.splice(0, mocks.notificationRows.length)
  mocks.executeSQL.mockReset()
  mocks.executeSQLOne.mockReset()
})

describe('warning chain merge', () => {
  it('keeps scanAll on the public WarningService export used by scheduler and jobs', () => {
    const service = new WarningService()

    expect(typeof WarningService).toBe('function')
    expect(service).toHaveProperty('scanAll')
    expect(typeof service.scanAll).toBe('function')
  })

  it('pulls pre-milestone warnings into the shared scanAll and notification flow', async () => {
    const service = new WarningService()
    const preMilestoneWarning = {
      id: 'permit-1',
      project_id: 'project-1',
      task_id: 'pre-1',
      warning_type: 'permit_expiry',
      warning_level: 'critical',
      title: '证照即将过期',
      description: '证照快到期了',
      is_acknowledged: false,
      created_at: '2026-04-13T08:00:00.000Z',
    }

    vi.spyOn(service, 'scanConditionWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanObstacleWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanAcceptanceWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanDelayExceededWarnings').mockResolvedValue([] as any)
    mocks.scanPreMilestoneWarnings.mockResolvedValue([preMilestoneWarning] as any)
    vi.spyOn(service, 'scanCriticalPathStagnationWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanCriticalPathDelayWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanProgressTrendWarnings').mockResolvedValue([] as any)

    const warnings = await service.scanAll('project-1')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      warning_type: 'permit_expiry',
      task_id: 'pre-1',
    })

    const notifications = await service.generateNotifications('project-1')
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      project_id: 'project-1',
      type: 'permit_expiry',
      category: 'permit_expiry',
      task_id: 'pre-1',
      source_entity_type: 'warning',
      source_entity_id: 'pre-1',
    })
    expect(mocks.scanPreMilestoneWarnings).toHaveBeenCalledWith('project-1', {})
  })

  it('uses the unified impact signal scan as authoritative while running legacy scanners only for uncovered gaps', async () => {
    const service = new WarningService()
    const signalWarning = {
      id: 'impact-signal-warning-1',
      project_id: 'project-1',
      task_id: 'task-1',
      warning_type: 'critical_path_delay',
      warning_level: 'critical',
      title: '确定延期预警',
      description: '来自 impactSignalSummary',
      is_acknowledged: false,
      created_at: '2026-05-26T00:00:00.000Z',
    }

    const signalScan = vi.spyOn(service, 'scanExecutionImpactSignalWarnings').mockResolvedValue([signalWarning] as any)
    const conditionScan = vi.spyOn(service, 'scanConditionWarnings').mockResolvedValue([] as any)
    const obstacleScan = vi.spyOn(service, 'scanObstacleWarnings').mockResolvedValue([] as any)
    const acceptanceScan = vi.spyOn(service, 'scanAcceptanceWarnings').mockResolvedValue([] as any)
    const delayScan = vi.spyOn(service, 'scanDelayExceededWarnings').mockResolvedValue([] as any)
    const criticalDelayScan = vi.spyOn(service, 'scanCriticalPathDelayWarnings').mockResolvedValue([] as any)
    mocks.scanPreMilestoneWarnings.mockResolvedValue([] as any)
    vi.spyOn(service, 'scanCriticalPathStagnationWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanProgressTrendWarnings').mockResolvedValue([] as any)

    const warnings = await service.scanAll('project-1')

    expect(warnings).toEqual([signalWarning])
    expect(signalScan).toHaveBeenCalledWith('project-1')
    expect(conditionScan).toHaveBeenCalledWith('project-1', false)
    expect(obstacleScan).toHaveBeenCalledWith('project-1', false)
    expect(acceptanceScan).toHaveBeenCalledWith('project-1', false)
    expect(delayScan).toHaveBeenCalledWith('project-1', false)
    expect(criticalDelayScan).toHaveBeenCalledWith('project-1', false, {})
  })

  it('keeps impact signal warnings authoritative while filling uncovered legacy warning gaps', async () => {
    const service = new WarningService()
    const signalWarning = {
      id: 'impact-signal-warning-1',
      project_id: 'project-1',
      task_id: 'task-1',
      warning_type: 'condition_due',
      warning_level: 'critical',
      title: 'condition from impact signal',
      description: 'impact signal summary covered task-1',
      is_acknowledged: false,
      created_at: '2026-05-26T00:00:00.000Z',
      metadata: {
        source: 'readiness_summary',
        impactSignalSummary: {
          sourceEntityType: 'project_material',
          sourceEntityId: 'material-1',
        },
      },
      source_entity_type: 'project_material',
      source_entity_id: 'material-1',
    }
    const legacyDuplicate = {
      id: 'legacy-duplicate',
      project_id: 'project-1',
      task_id: 'task-1',
      warning_type: 'condition_due',
      warning_level: 'warning',
      title: 'legacy duplicate',
      description: 'same task/type should be suppressed by impact signal',
      is_acknowledged: false,
      created_at: '2026-05-26T00:01:00.000Z',
    }
    const legacyGap = {
      id: 'legacy-gap',
      project_id: 'project-1',
      task_id: 'task-2',
      warning_type: 'condition_due',
      warning_level: 'warning',
      title: 'legacy uncovered task',
      description: 'task-2 has no impact signal summary yet',
      is_acknowledged: false,
      created_at: '2026-05-26T00:02:00.000Z',
    }

    vi.spyOn(service, 'scanExecutionImpactSignalWarnings').mockResolvedValue([signalWarning] as any)
    vi.spyOn(service, 'scanConditionWarnings').mockResolvedValue([legacyDuplicate, legacyGap] as any)
    vi.spyOn(service, 'scanObstacleWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanAcceptanceWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanDelayExceededWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanCriticalPathDelayWarnings').mockResolvedValue([] as any)
    mocks.scanPreMilestoneWarnings.mockResolvedValue([] as any)
    vi.spyOn(service, 'scanCriticalPathStagnationWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanProgressTrendWarnings').mockResolvedValue([] as any)

    const warnings = await service.scanAll('project-1')

    expect(warnings.map((warning) => warning.id)).toEqual(['impact-signal-warning-1', 'legacy-gap'])
  })

  it('writes explicit notification chain columns when persisting warnings', async () => {
    const row = await persistNotification({
      id: 'notification-1',
      project_id: 'project-1',
      type: 'permit_expiry',
      category: 'permit_expiry',
      task_id: 'pre-1',
      severity: 'warning',
      title: '证照即将过期',
      content: '证照快到期了',
      is_read: false,
      is_broadcast: false,
      resolved_source: 'permit_progressed',
      created_at: '2026-04-13T08:00:00.000Z',
    })

    expect(row?.id).toBe('notification-1')
    expect(mocks.notificationRows).toHaveLength(1)
    expect(mocks.notificationRows[0]).toMatchObject({
      id: 'notification-1',
      project_id: 'project-1',
      category: 'permit_expiry',
      task_id: 'pre-1',
      source_entity_type: 'permit_expiry',
      source_entity_id: 'pre-1',
      resolved_source: 'permit_progressed',
    })
  })

  it('keeps pre-milestone scanning on the shared warning chain and removes the standalone scheduler job', () => {
    const warningServiceSource = readFileSync(new URL('../services/warningService.ts', import.meta.url), 'utf8')
    const schedulerSource = readFileSync(new URL('../scheduler.ts', import.meta.url), 'utf8')

    expect(warningServiceSource).toContain('scanPreMilestoneWarningsFromService(projectId, options)')
    expect(warningServiceSource).toContain('this.scanPreMilestoneWarnings(projectId, options)')
    expect(warningServiceSource).toContain('preMilestoneWarnings')
    expect(schedulerSource).toContain('conditionAlertJob.start()')
    expect(schedulerSource).not.toContain('preMilestoneWarningJob.start()')
    expect(schedulerSource).not.toContain('class PreMilestoneWarningJob')
  })

  it('fails closed for a global scan without explicit scheduler capability', async () => {
    await expect(new WarningService().scanAll()).rejects.toThrow(
      'warning scan requires projectId or systemJob capability',
    )
  })
})
