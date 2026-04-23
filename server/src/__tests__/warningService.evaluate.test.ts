import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

const mocks = vi.hoisted(() => ({
  updateMock: vi.fn(async () => ({ error: null })),
  insertMock: vi.fn(async () => ({ error: null })),
  ensureObstacleEscalatedIssue: vi.fn(async () => null),
  markObstacleEscalatedIssuePendingManualClose: vi.fn(async () => []),
  writeLog: vi.fn(async () => undefined),
  hasChangeLog: vi.fn(async () => false),
  fromMock: vi.fn((table: string) => {
    if (table === 'task_obstacles') {
      return {
        update: vi.fn(() => ({
          eq: mocks.updateMock,
        })),
      }
    }

    return {
      insert: mocks.insertMock,
    }
  }),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.fromMock,
  },
}))

vi.mock('../services/upgradeChainService.js', () => ({
  acknowledgeWarningNotification: vi.fn(),
  autoEscalateRisksToIssues: vi.fn(),
  autoEscalateWarnings: vi.fn(),
  confirmWarningAsRisk: vi.fn(),
  ensureObstacleEscalatedIssue: mocks.ensureObstacleEscalatedIssue,
  markObstacleEscalatedIssuePendingManualClose: mocks.markObstacleEscalatedIssuePendingManualClose,
  muteWarningNotification: vi.fn(),
  syncConditionExpiredIssues: vi.fn(),
  syncAcceptanceExpiredIssues: vi.fn(),
  syncWarningNotifications: vi.fn(async (warnings: any) => warnings),
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: mocks.writeLog,
  hasChangeLog: mocks.hasChangeLog,
}))

import { WarningService } from '../services/warningService.js'

describe('warningService evaluate hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasChangeLog.mockResolvedValue(false)
  })

  it('escalates overdue obstacles through the event hook', async () => {
    const service = new WarningService()

    const result = await service.evaluate({
      type: 'obstacle',
      obstacle: {
        id: 'obstacle-1',
        task_id: 'task-1',
        severity: 'warning',
        severity_manually_overridden: false,
        status: '处理中',
        expected_resolution_date: '2026-04-10T08:00:00.000Z',
      } as any,
    })

    expect(result).toEqual({
      severity: 'critical',
      escalated: true,
    })
    expect(mocks.fromMock).toHaveBeenCalledWith('task_obstacles')
    expect(mocks.updateMock).toHaveBeenCalledWith('id', 'obstacle-1')
    expect(mocks.ensureObstacleEscalatedIssue).toHaveBeenCalledWith(expect.objectContaining({
      id: 'obstacle-1',
      task_id: 'task-1',
    }))
  })

  it('skips auto-escalation persistence when severity was manually overridden', async () => {
    const service = new WarningService()

    const result = await service.evaluate({
      type: 'obstacle',
      obstacle: {
        id: 'obstacle-override',
        task_id: 'task-override',
        severity: 'warning',
        severity_manually_overridden: true,
        status: '处理中',
        expected_resolution_date: '2026-04-10T08:00:00.000Z',
      } as any,
    })

    expect(result).toEqual({
      severity: 'critical',
      escalated: false,
    })
    expect(mocks.updateMock).not.toHaveBeenCalled()
    expect(mocks.writeLog).not.toHaveBeenCalled()
    expect(mocks.ensureObstacleEscalatedIssue).not.toHaveBeenCalled()
  })

  it('uses explicit severity escalation markers to avoid duplicate auto-escalation logs', async () => {
    const service = new WarningService()

    const result = await service.evaluate({
      type: 'obstacle',
      obstacle: {
        id: 'obstacle-2',
        task_id: 'task-2',
        severity: '严重' as any,
        severity_escalated_at: '2026-04-12T08:00:00.000Z',
        status: '处理中',
        expected_resolution_date: '2026-04-10T08:00:00.000Z',
      } as any,
    })

    expect(result).toEqual({
      severity: 'critical',
      escalated: false,
    })
    expect(mocks.updateMock).not.toHaveBeenCalled()
    expect(mocks.writeLog).not.toHaveBeenCalled()
    expect(mocks.ensureObstacleEscalatedIssue).not.toHaveBeenCalled()
    expect(mocks.hasChangeLog).not.toHaveBeenCalled()
  })

  it('treats delay submission as the pending-request branch', async () => {
    const service = new WarningService()

    const result = await service.evaluate({
      type: 'delay_request_submitted',
      delayRequest: {
        id: 'delay-1',
        task_id: 'task-1',
        status: 'pending',
        project_id: 'project-1',
      },
    })

    expect(result).toEqual({
      severity: 'info',
      note: expect.any(String),
      escalated: false,
    })
  })

  it('treats approved delay assessment as an explicit follow-up branch', async () => {
    const service = new WarningService()

    const result = await service.evaluate({
      type: 'delay_approved',
      delayRequest: {
        id: 'delay-2',
        task_id: 'task-2',
        status: 'approved',
        project_id: 'project-1',
      },
    })

    expect(result).toEqual({
      severity: 'warning',
      note: '延期审批通过，已进入后续评估链',
      escalated: false,
    })
  })
})
