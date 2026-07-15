import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(),
  updateNotificationById: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../services/notificationStore.js', () => ({
  updateNotificationById: mocks.updateNotificationById,
}))

const {
  getNotificationReconciliationCoverageMatrix,
  reconcileResolvedNotifications,
} = await import('../services/notificationReconciliationService.js')

describe('notificationReconciliationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves active source-backed notifications when their source entity is already closed', async () => {
    mocks.rawQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'notification-risk',
            source_entity_type: 'risk',
            source_entity_id: 'risk-1',
            project_id: 'project-1',
            metadata: { keep: true },
          },
          {
            id: 'notification-task',
            source_entity_type: 'task',
            source_entity_id: 'task-1',
            project_id: 'project-1',
            metadata: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'risk-1', status: 'closed' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'task-1', status: 'in_progress' }] })

    const result = await reconcileResolvedNotifications({ projectId: 'project-1' })

    expect(result).toEqual({ scanned: 2, resolved: 1, skipped: 1 })
    expect(mocks.updateNotificationById).toHaveBeenCalledTimes(1)
    expect(mocks.updateNotificationById).toHaveBeenCalledWith('notification-risk', expect.objectContaining({
      lifecycle_status: 'resolved',
      status: 'read',
      is_read: true,
      resolved_source: 'source_reconciliation',
      metadata: expect.objectContaining({
        keep: true,
        reconciliation_source_status: 'closed',
      }),
    }), expect.objectContaining({ id: 'notification-risk', project_id: 'project-1' }))
  })

  it('exports a conservative reconciliation coverage matrix for diagnostics', () => {
    const matrix = getNotificationReconciliationCoverageMatrix()

    expect(matrix.coveredSourceTypes).toEqual(expect.arrayContaining([
      'task',
      'risk',
      'issue',
      'project_material',
      'task_condition',
      'task_obstacle',
      'acceptance_plan',
    ]))
    expect(matrix.entries.find((entry) => entry.sourceEntityType === 'task_condition')).toMatchObject({
      table: 'task_conditions',
      autoResolve: true,
      mutatesSourceFacts: false,
    })
  })

  it('uses fixed source status queries instead of interpolating resolver table names', async () => {
    mocks.rawQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'notification-condition',
            source_entity_type: 'task_condition',
            source_entity_id: 'condition-1',
            project_id: 'project-1',
            metadata: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'condition-1', status: 'satisfied' }] })

    const result = await reconcileResolvedNotifications({ projectId: 'project-1', limit: 1 })

    expect(result).toMatchObject({ scanned: 1, resolved: 1, skipped: 0 })
    expect(mocks.rawQuery).toHaveBeenCalledTimes(2)
    expect(String(mocks.rawQuery.mock.calls[1]?.[0])).toContain('FROM public.task_conditions')
    expect(String(mocks.rawQuery.mock.calls[1]?.[0])).toContain('project_id::text = $2::text')
    expect(String(mocks.rawQuery.mock.calls[1]?.[0])).not.toContain('${')
    expect(mocks.rawQuery.mock.calls[1]?.[1]).toEqual(['condition-1', 'project-1'])
  })

  it('treats an actual material arrival as resolved without querying a retired status column', async () => {
    mocks.rawQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'notification-material',
            source_entity_type: 'project_material',
            source_entity_id: 'material-1',
            project_id: 'project-1',
            metadata: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'material-1', status: 'arrived' }] })

    const result = await reconcileResolvedNotifications({ projectId: 'project-1', limit: 1 })

    expect(result).toMatchObject({ scanned: 1, resolved: 1, skipped: 0 })
    const materialStatusSql = String(mocks.rawQuery.mock.calls[1]?.[0])
    expect(materialStatusSql).toContain('FROM public.project_materials')
    expect(materialStatusSql).toContain('actual_arrival_date')
    expect(materialStatusSql).not.toMatch(/SELECT\s+id,\s+status\s+FROM public\.project_materials/i)
    expect(mocks.updateNotificationById).toHaveBeenCalledWith(
      'notification-material',
      expect.objectContaining({
        lifecycle_status: 'resolved',
        reconciliation_source_status: 'arrived',
      }),
      expect.objectContaining({ id: 'notification-material' }),
    )
  })

  it('keeps source status SQL on fixed table branches for guard visibility', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../services/notificationReconciliationService.ts', import.meta.url)),
      'utf8',
    )

    expect(source).not.toContain('public.${resolver.table}')
    expect(source).toContain('FROM public.task_conditions')
    expect(source).toContain('FROM public.acceptance_plans')
    expect(source).toContain('FROM public.project_materials')
  })
})
