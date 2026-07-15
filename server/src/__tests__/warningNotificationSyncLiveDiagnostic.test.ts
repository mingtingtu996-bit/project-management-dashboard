import { describe, expect, it, vi } from 'vitest'

import {
  buildWarningNotificationSyncLiveDiagnosticReport,
  parseWarningNotificationSyncLiveDiagnosticOptionsFromArgs,
  shouldFailWarningNotificationSyncLiveDiagnosticReport,
} from '../scripts/diagnose-warning-notification-sync-live.js'

function emitPassingRecipientTelemetry(options?: any) {
  options?.onRecipientLookup?.({ lookupKind: 'owner_project', cacheKey: 'project-live', cacheHit: false })
  options?.onRecipientLookup?.({ lookupKind: 'direct_task', cacheKey: 'task-live', cacheHit: false })
  options?.onRecipientLookup?.({ lookupKind: 'participant_unit', cacheKey: 'unit-live', cacheHit: false })
  options?.onRecipientLookup?.({ lookupKind: 'owner_project', cacheKey: 'project-live', cacheHit: true })
  options?.onRecipientLookup?.({ lookupKind: 'direct_task', cacheKey: 'task-live', cacheHit: true })
  options?.onRecipientLookup?.({ lookupKind: 'participant_unit', cacheKey: 'unit-live', cacheHit: true })
}

describe('warning notification sync live diagnostic', () => {
  const diagnosticRunId = 'c18-l11-2026-06-20T21-23-05-000Z'

  it('blocks by default so the diagnostic cannot write live notifications accidentally', async () => {
    const syncWarnings = vi.fn()

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:20:00.000+08:00'),
      diagnosticRunId,
      syncWarnings,
    })

    expect(report.reportCode).toBe('c18_l11_warning_notification_sync_live_diagnostic')
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.status).toBe('blocked')
    expect(report.allowWrite).toBe(false)
    expect(report.missingArchivedJson).toBe(true)
    expect(report.scenario.warningCount).toBe(240)
    expect(report.scenario.externalDbQueryLogRequired).toBe(true)
    expect(syncWarnings).not.toHaveBeenCalled()
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('keeps archived DB query log assessment even when the write probe is blocked', async () => {
    const syncWarnings = vi.fn()

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:20:30.000+08:00'),
      diagnosticRunId,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      dbQueryLogFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-sample.json',
      dbQueryLog: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-sample.json',
        diagnosticRunId,
        projectId: 'project-live',
        taskId: 'task-live',
        participantUnitId: 'unit-live',
        entries: [
          { table: 'projects', method: 'select', purpose: 'owner_recipient_lookup' },
          { table: 'tasks', method: 'select', purpose: 'direct_task_recipient_lookup' },
          { table: 'participant_unit_members', method: 'select', purpose: 'participant_unit_recipient_lookup' },
          { table: 'notifications', method: 'insert', purpose: 'notification_write' },
        ],
      },
      syncWarnings,
    })

    expect(report.status).toBe('blocked')
    expect(report.scenario.status).toBe('blocked')
    expect(report.scenario.queryLogEvidenceCaptured).toBe(true)
    expect(report.scenario.externalDbQueryLogRequired).toBe(false)
    expect(report.scenario.dbQueryLogAssessment).toEqual(expect.objectContaining({
      evidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-sample.json',
      environment: 'staging',
      evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-sample.json',
      diagnosticRunId,
      missingEvidenceMetadata: false,
      status: 'pass',
      totalRecipientLookupQueries: 3,
    }))
    expect(syncWarnings).not.toHaveBeenCalled()
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails an explicit live write probe when archived DB query log evidence is missing', async () => {
    const syncWarnings = vi.fn(async (warnings: any[], _projectId: string) =>
      warnings.map((warning: any) => ({ ...warning, synced: true })),
    )

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:21:00.000+08:00'),
      diagnosticRunId,
      allowWrite: true,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-warning-sync.json',
      syncWarnings,
    })

    expect(report.status).toBe('fail')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l11-warning-sync.json')
    expect(report.projectId).toBe('project-live')
    expect(report.scenario.warningCount).toBe(240)
    expect(report.scenario.ownerRoutedWarnings).toBe(120)
    expect(report.scenario.participantUnitRoutedWarnings).toBe(120)
    expect(report.scenario.recipientLookupBudget).toEqual({
      expectedOwnerProjectLookups: 1,
      expectedDirectTaskLookups: 1,
      expectedParticipantUnitLookups: 1,
      expectedTotalRecipientLookupFamilies: 3,
      warningToLookupRatio: 80,
    })
    expect(report.scenario.externalDbQueryLogRequiredReason).toContain('compare real DB query logs')
    expect(report.scenario.syncedWarningCount).toBe(240)
    expect(report.scenario.externalDbQueryLogRequired).toBe(true)
    expect(report.scenario.queryLogEvidenceCaptured).toBe(false)
    expect(report.scenario.status).toBe('fail')
    expect(report.scenario.reason).toContain('Missing archived DB query log evidence')
    expect(syncWarnings).toHaveBeenCalledTimes(1)
    expect(syncWarnings.mock.calls[0][0]).toHaveLength(240)
    expect(syncWarnings.mock.calls[0][1]).toBe('project-live')
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('accepts an archived DB query log and fails the diagnostic when recipient lookups exceed budget', async () => {
    const syncWarnings = vi.fn(async (warnings: any[], _projectId: string) =>
      warnings.map((warning: any) => ({ ...warning, synced: true })),
    )
    const queryLog = [
      { table: 'projects', operation: 'select', purpose: 'owner_recipient_lookup' },
      { table: 'tasks', operation: 'select', purpose: 'direct_task_recipient_lookup' },
      { table: 'tasks', operation: 'select', purpose: 'direct_task_recipient_lookup' },
      { table: 'participant_unit_members', operation: 'select', purpose: 'participant_unit_recipient_lookup' },
      { table: 'notifications', method: 'insert', purpose: 'notification_write' },
    ]

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:22:00.000+08:00'),
      diagnosticRunId,
      allowWrite: true,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      dbQueryLogFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log.json',
      dbQueryLog: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log.json',
        diagnosticRunId,
        projectId: 'project-live',
        taskId: 'task-live',
        participantUnitId: 'unit-live',
        entries: queryLog,
      },
      syncWarnings,
    })

    expect(report.status).toBe('fail')
    expect(report.scenario.status).toBe('fail')
    expect(report.scenario.queryLogEvidenceCaptured).toBe(true)
    expect(report.scenario.externalDbQueryLogRequired).toBe(false)
    expect(report.scenario.dbQueryLogAssessment).toEqual(expect.objectContaining({
      evidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log.json',
      status: 'fail',
      totalRecipientLookupQueries: 4,
      ownerProjectLookupCount: 1,
      directTaskLookupCount: 2,
      participantUnitLookupCount: 1,
    }))
    expect(report.scenario.reason).toContain('DB query log recipient lookup budget failed')
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when the archived DB query log belongs to a different diagnostic scope', async () => {
    const syncWarnings = vi.fn(async (warnings: any[], _projectId: string) =>
      warnings.map((warning: any) => ({ ...warning, synced: true })),
    )

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:22:30.000+08:00'),
      diagnosticRunId,
      allowWrite: true,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-warning-sync.json',
      dbQueryLogFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-wrong-scope.json',
      dbQueryLog: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-wrong-scope.json',
        diagnosticRunId,
        projectId: 'other-project',
        taskId: 'task-live',
        participantUnitId: 'unit-live',
        entries: [
          { table: 'projects', method: 'select', purpose: 'owner_recipient_lookup' },
          { table: 'tasks', method: 'select', purpose: 'direct_task_recipient_lookup' },
          { table: 'participant_unit_members', method: 'select', purpose: 'participant_unit_recipient_lookup' },
          { table: 'notifications', method: 'insert', purpose: 'notification_write' },
        ],
      },
      syncWarnings,
    })

    expect(report.status).toBe('fail')
    expect(report.scenario.dbQueryLogAssessment).toEqual(expect.objectContaining({
      evidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-wrong-scope.json',
      status: 'fail',
      projectIdMatches: false,
      taskIdMatches: true,
      participantUnitIdMatches: true,
      offendingCategories: ['diagnostic_scope'],
    }))
    expect(report.scenario.reason).toContain('DB query log recipient lookup budget failed')
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('passes with an archived DB query log when recipient lookups stay within budget', async () => {
    const syncWarnings = vi.fn(async (warnings: any[], _projectId: string) =>
      warnings.map((warning: any) => ({ ...warning, synced: true })),
    )

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:23:00.000+08:00'),
      diagnosticRunId,
      allowWrite: true,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-warning-sync-pass.json',
      dbQueryLogFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
      dbQueryLog: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
        diagnosticRunId,
        projectId: 'project-live',
        taskId: 'task-live',
        participantUnitId: 'unit-live',
        entries: [
          { table: 'projects', method: 'select', purpose: 'owner_recipient_lookup' },
          { table: 'tasks', method: 'select', purpose: 'direct_task_recipient_lookup' },
          { table: 'participant_unit_members', method: 'select', purpose: 'participant_unit_recipient_lookup' },
          { table: 'notifications', method: 'insert', purpose: 'notification_write' },
        ],
      },
      syncWarnings,
    })

    expect(report.status).toBe('fail')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l11-warning-sync-pass.json')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.scenario.status).toBe('fail')
    expect(report.scenario.missingArchivedJson).toBe(false)
    expect(report.scenario.queryLogEvidenceCaptured).toBe(true)
    expect(report.scenario.externalDbQueryLogRequired).toBe(false)
    expect(report.scenario.internalRecipientTelemetryCaptured).toBe(false)
    expect(report.scenario.internalRecipientTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      ownerProjectLookupMissCount: 0,
      directTaskLookupMissCount: 0,
      participantUnitLookupMissCount: 0,
      offendingCategories: ['missing_internal_recipient_telemetry'],
    }))
    expect(report.scenario.dbQueryLogAssessment).toEqual(expect.objectContaining({
      status: 'pass',
      environment: 'staging',
      evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
      diagnosticRunId,
      missingEvidenceMetadata: false,
      totalRecipientLookupQueries: 3,
      ownerProjectLookupCount: 1,
      directTaskLookupCount: 1,
      participantUnitLookupCount: 1,
    }))
    expect(report.scenario.reason).toContain('Internal recipient lookup telemetry failed')
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('passes only when archived DB query log and internal recipient telemetry both stay within budget', async () => {
    const syncWarnings = vi.fn(async (warnings: any[], _projectId: string, options?: any) => {
      emitPassingRecipientTelemetry(options)
      return warnings.map((warning: any) => ({ ...warning, synced: true }))
    })

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:23:05.000+08:00'),
      diagnosticRunId,
      allowWrite: true,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-warning-sync-pass.json',
      dbQueryLogFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
      dbQueryLog: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
        diagnosticRunId,
        projectId: 'project-live',
        taskId: 'task-live',
        participantUnitId: 'unit-live',
        entries: [
          { table: 'projects', method: 'select', purpose: 'owner_recipient_lookup' },
          { table: 'tasks', method: 'select', purpose: 'direct_task_recipient_lookup' },
          { table: 'participant_unit_members', method: 'select', purpose: 'participant_unit_recipient_lookup' },
          { table: 'notifications', method: 'insert', purpose: 'notification_write' },
        ],
      },
      syncWarnings,
    })

    expect(report.status).toBe('pass')
    expect(report.scenario.status).toBe('pass')
    expect(report.scenario.internalRecipientTelemetryCaptured).toBe(true)
    expect(report.scenario.internalRecipientTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'pass',
      ownerProjectLookupMissCount: 1,
      directTaskLookupMissCount: 1,
      participantUnitLookupMissCount: 1,
      ownerProjectLookupHitCount: 1,
      directTaskLookupHitCount: 1,
      participantUnitLookupHitCount: 1,
      offendingCategories: [],
    }))
    expect(report.scenario.dbQueryLogAssessment).toEqual(expect.objectContaining({
      status: 'pass',
      totalRecipientLookupQueries: 3,
    }))
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(false)
  })

  it('fails when archived DB query log evidence is not tied to the current diagnostic run', async () => {
    const syncWarnings = vi.fn(async (warnings: any[], _projectId: string, options?: any) => {
      emitPassingRecipientTelemetry(options)
      return warnings.map((warning: any) => ({ ...warning, synced: true }))
    })

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:23:06.000+08:00'),
      diagnosticRunId: 'c18-l11-2026-06-20T21-23-06-000Z',
      allowWrite: true,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-warning-sync-pass.json',
      dbQueryLogFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
      dbQueryLog: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
        diagnosticRunId,
        projectId: 'project-live',
        taskId: 'task-live',
        participantUnitId: 'unit-live',
        entries: [
          { table: 'projects', method: 'select', purpose: 'owner_recipient_lookup' },
          { table: 'tasks', method: 'select', purpose: 'direct_task_recipient_lookup' },
          { table: 'participant_unit_members', method: 'select', purpose: 'participant_unit_recipient_lookup' },
          { table: 'notifications', method: 'insert', purpose: 'notification_write' },
        ],
      },
      syncWarnings,
    })

    expect(report.status).toBe('fail')
    expect(report.scenario.dbQueryLogAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      diagnosticRunIdPresent: true,
      diagnosticRunIdMatches: false,
      offendingCategories: expect.arrayContaining(['diagnostic_run_id']),
    }))
    expect(report.scenario.reason).toContain('DB query log recipient lookup budget failed')
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when the archived DB query log lacks notification write evidence', async () => {
    const syncWarnings = vi.fn(async (warnings: any[], _projectId: string, options?: any) => {
      emitPassingRecipientTelemetry(options)
      return warnings.map((warning: any) => ({ ...warning, synced: true }))
    })

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:23:07.000+08:00'),
      diagnosticRunId,
      allowWrite: true,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-warning-sync-missing-write.json',
      dbQueryLogFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-missing-write.json',
      dbQueryLog: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-missing-write.json',
        diagnosticRunId,
        projectId: 'project-live',
        taskId: 'task-live',
        participantUnitId: 'unit-live',
        entries: [
          { table: 'projects', method: 'select', purpose: 'owner_recipient_lookup' },
          { table: 'tasks', method: 'select', purpose: 'direct_task_recipient_lookup' },
          { table: 'participant_unit_members', method: 'select', purpose: 'participant_unit_recipient_lookup' },
        ],
      },
      syncWarnings,
    })

    expect(report.status).toBe('fail')
    expect(report.scenario.dbQueryLogAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      totalRecipientLookupQueries: 3,
      notificationWriteCount: 0,
      minNotificationWrites: 1,
      offendingCategories: ['notification_write_evidence'],
    }))
    expect(report.scenario.reason).toContain('DB query log recipient lookup budget failed')
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when internal recipient telemetry lacks stable cache keys for repeated lookups', async () => {
    const syncWarnings = vi.fn(async (warnings: any[], _projectId: string, options?: any) => {
      options?.onRecipientLookup?.({ lookupKind: 'owner_project', cacheKey: '', cacheHit: false })
      options?.onRecipientLookup?.({ lookupKind: 'direct_task', cacheKey: 'task-live', cacheHit: false })
      options?.onRecipientLookup?.({ lookupKind: 'participant_unit', cacheKey: 'unit-live', cacheHit: false })
      options?.onRecipientLookup?.({ lookupKind: 'owner_project', cacheKey: 'project-live-other', cacheHit: true })
      options?.onRecipientLookup?.({ lookupKind: 'direct_task', cacheKey: 'task-live-other', cacheHit: true })
      options?.onRecipientLookup?.({ lookupKind: 'participant_unit', cacheKey: 'unit-live', cacheHit: true })
      return warnings.map((warning: any) => ({ ...warning, synced: true }))
    })

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:23:10.000+08:00'),
      diagnosticRunId,
      allowWrite: true,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-warning-sync-cache-key-fail.json',
      dbQueryLogFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
      dbQueryLog: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
        diagnosticRunId,
        projectId: 'project-live',
        taskId: 'task-live',
        participantUnitId: 'unit-live',
        entries: [
          { table: 'projects', method: 'select', purpose: 'owner_recipient_lookup' },
          { table: 'tasks', method: 'select', purpose: 'direct_task_recipient_lookup' },
          { table: 'participant_unit_members', method: 'select', purpose: 'participant_unit_recipient_lookup' },
          { table: 'notifications', method: 'insert', purpose: 'notification_write' },
        ],
      },
      syncWarnings,
    })

    expect(report.status).toBe('fail')
    expect(report.scenario.internalRecipientTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      cacheKeyEvidenceValid: false,
      missingCacheKeyEvidenceKinds: ['owner_project', 'direct_task'],
      offendingCategories: ['recipient_cache_key'],
    }))
    expect(report.scenario.reason).toContain('Internal recipient lookup telemetry failed')
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when the archived DB query log lacks environment or evidence reference metadata', async () => {
    const syncWarnings = vi.fn(async (warnings: any[], _projectId: string) =>
      warnings.map((warning: any) => ({ ...warning, synced: true })),
    )

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:23:30.000+08:00'),
      diagnosticRunId,
      allowWrite: true,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-warning-sync-pass.json',
      dbQueryLogFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-sample.json',
      dbQueryLog: {
        diagnosticRunId,
        projectId: 'project-live',
        taskId: 'task-live',
        participantUnitId: 'unit-live',
        entries: [
          { table: 'projects', method: 'select', purpose: 'owner_recipient_lookup' },
          { table: 'tasks', method: 'select', purpose: 'direct_task_recipient_lookup' },
          { table: 'participant_unit_members', method: 'select', purpose: 'participant_unit_recipient_lookup' },
          { table: 'notifications', method: 'insert', purpose: 'notification_write' },
        ],
      },
      syncWarnings,
    })

    expect(report.status).toBe('fail')
    expect(report.scenario.status).toBe('fail')
    expect(report.scenario.dbQueryLogAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      environment: null,
      evidenceRef: null,
      missingEvidenceMetadata: true,
      totalRecipientLookupQueries: 3,
      offendingCategories: ['evidence_metadata'],
    }))
    expect(report.scenario.reason).toContain('DB query log recipient lookup budget failed')
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails a passing live probe when the main diagnostic JSON is not archived', async () => {
    const syncWarnings = vi.fn(async (warnings: any[], _projectId: string, options?: any) => {
      emitPassingRecipientTelemetry(options)
      return warnings.map((warning: any) => ({ ...warning, synced: true }))
    })

    const report = await buildWarningNotificationSyncLiveDiagnosticReport({
      now: new Date('2026-06-21T05:24:00.000+08:00'),
      diagnosticRunId,
      allowWrite: true,
      projectId: 'project-live',
      taskId: 'task-live',
      participantUnitId: 'unit-live',
      dbQueryLogFile: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
      dbQueryLog: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l11-query-log-pass.json',
        diagnosticRunId,
        projectId: 'project-live',
        taskId: 'task-live',
        participantUnitId: 'unit-live',
        entries: [
          { table: 'projects', method: 'select', purpose: 'owner_recipient_lookup' },
          { table: 'tasks', method: 'select', purpose: 'direct_task_recipient_lookup' },
          { table: 'participant_unit_members', method: 'select', purpose: 'participant_unit_recipient_lookup' },
          { table: 'notifications', method: 'insert', purpose: 'notification_write' },
        ],
      },
      syncWarnings,
    })

    expect(report.status).toBe('fail')
    expect(report.outputFile).toBeNull()
    expect(report.missingArchivedJson).toBe(true)
    expect(report.scenario.status).toBe('fail')
    expect(report.scenario.missingArchivedJson).toBe(true)
    expect(report.scenario.reason).toContain('Missing archived diagnostic JSON')
    expect(shouldFailWarningNotificationSyncLiveDiagnosticReport(report)).toBe(true)
  })

  it('parses explicit live options from CLI flags', () => {
    expect(parseWarningNotificationSyncLiveDiagnosticOptionsFromArgs([
      '--allow-write',
      '--project-id=project-1',
      '--task-id=task-1',
      '--participant-unit-id=unit-1',
      '--output-file=artifacts/test-runs/c18-l11.json',
      '--db-query-log-file=artifacts/test-runs/c18-l11-query-log.json',
      '--diagnostic-run-id=c18-l11-manual-1',
    ])).toEqual({
      allowWrite: true,
      projectId: 'project-1',
      taskId: 'task-1',
      participantUnitId: 'unit-1',
      outputFile: 'artifacts/test-runs/c18-l11.json',
      dbQueryLogFile: 'artifacts/test-runs/c18-l11-query-log.json',
      diagnosticRunId: 'c18-l11-manual-1',
    })
  })
})
