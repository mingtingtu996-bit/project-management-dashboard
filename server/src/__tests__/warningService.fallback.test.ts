const mocks = vi.hoisted(() => ({
  syncConditionExpiredIssuesOnChain: vi.fn(),
  syncAcceptanceExpiredIssuesOnChain: vi.fn(),
  autoEscalateRisksToIssuesOnChain: vi.fn(),
  autoEscalateWarningsOnChain: vi.fn(),
  syncWarningNotifications: vi.fn(),
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => ({})),
  },
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/upgradeChainService.js', () => ({
  acknowledgeWarningNotification: vi.fn(),
  autoEscalateRisksToIssues: mocks.autoEscalateRisksToIssuesOnChain,
  autoEscalateWarnings: mocks.autoEscalateWarningsOnChain,
  confirmWarningAsRisk: vi.fn(),
  muteWarningNotification: vi.fn(),
  syncConditionExpiredIssues: mocks.syncConditionExpiredIssuesOnChain,
  syncAcceptanceExpiredIssues: mocks.syncAcceptanceExpiredIssuesOnChain,
  syncWarningNotifications: mocks.syncWarningNotifications,
}))

import { WarningService } from '../services/warningService.js'

describe('warningService upgrade-chain contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.syncWarningNotifications.mockResolvedValue([])
  })

  it('propagates condition-expired issue sync failures instead of swallowing schema errors', async () => {
    mocks.syncConditionExpiredIssuesOnChain.mockRejectedValue(
      new Error("Could not find the table 'public.issues' in the schema cache"),
    )

    const service = new WarningService()
    await expect(service.syncConditionExpiredIssues('project-1')).rejects.toThrow(
      "Could not find the table 'public.issues' in the schema cache",
    )
  })

  it('propagates risk escalation failures when the issues table is unavailable', async () => {
    mocks.autoEscalateRisksToIssuesOnChain.mockRejectedValue(
      new Error("Could not find the table 'public.issues' in the schema cache"),
    )

    const service = new WarningService()
    await expect(service.autoEscalateRisksToIssues('project-1')).rejects.toThrow(
      "Could not find the table 'public.issues' in the schema cache",
    )
  })

  it('propagates risk escalation failures when linked issue columns are missing on risks', async () => {
    mocks.autoEscalateRisksToIssuesOnChain.mockRejectedValue(
      new Error('column risks.linked_issue_id does not exist'),
    )

    const service = new WarningService()
    await expect(service.autoEscalateRisksToIssues('project-1')).rejects.toThrow(
      'column risks.linked_issue_id does not exist',
    )
  })

  it('propagates warning sync failures when notification lifecycle columns are missing', async () => {
    mocks.syncWarningNotifications.mockRejectedValue(
      new Error('column notifications.source_entity_type does not exist'),
    )

    const service = new WarningService()
    vi.spyOn(service, 'scanAll').mockResolvedValue([
      {
        id: 'warning-1',
        project_id: 'project-1',
        task_id: 'task-1',
        warning_type: 'condition_expired',
        warning_level: 'warning',
        title: '开工条件到期',
        description: '条件已过期',
        is_acknowledged: false,
        created_at: '2026-04-16T00:00:00.000Z',
      },
    ] as any)

    await expect(service.syncActiveWarnings('project-1')).rejects.toThrow(
      'column notifications.source_entity_type does not exist',
    )
  })

  it('propagates warning auto escalation failures when notification lifecycle columns are missing', async () => {
    mocks.autoEscalateWarningsOnChain.mockRejectedValue(
      new Error('column notifications.source_entity_type does not exist'),
    )

    const service = new WarningService()
    await expect(service.autoEscalateWarnings('project-1')).rejects.toThrow(
      'column notifications.source_entity_type does not exist',
    )
  })
})
