import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const routeSource = readFileSync(join(__dirname, '../routes/taskReconcile.ts'), 'utf8')

const state = vi.hoisted(() => ({
  backupSnapshot: null as Record<string, unknown> | null,
  executeSQL: vi.fn(async () => [] as unknown[]),
  rawQuery: vi.fn(async (sql: string, _params: unknown[] = []) => {
    if (sql.includes('FROM public.tasks') && sql.includes('FOR UPDATE')) {
      return {
        rows: [
          { id: 'task-rename', title: 'Old title', deleted_at: null, version: 1 },
          { id: 'task-delete', title: 'Delete me', deleted_at: null, version: 2 },
        ],
        rowCount: 2,
      }
    }
    if (sql.includes('FROM public.task_dependencies') && sql.includes('FOR UPDATE')) {
      return {
        rows: [{ id: 'dependency-1', status: 'active', metadata: { source: 'manual' } }],
        rowCount: 1,
      }
    }
    if (sql.includes('FROM public.task_reconcile_backups')) {
      return {
        rows: state.backupSnapshot
          ? [{
              id: 'backup-1',
              task_snapshot: state.backupSnapshot,
              created_at: '2026-07-17T08:00:00.000Z',
              rolled_back_at: null,
            }]
          : [],
        rowCount: state.backupSnapshot ? 1 : 0,
      }
    }
    return { rows: [], rowCount: 1 }
  }),
  withDatabaseTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
  updateTaskInMainChain: vi.fn(async (taskId: string, patch: Record<string, unknown>) => ({
    task: { id: taskId, project_id: 'project-1', ...patch },
    participantUnit: null,
  })),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectMember: vi.fn((_getProjectId: (req: any) => string) => (_req: any, _res: any, next: () => void) => next()),
  requireProjectEditor: vi.fn((_getProjectId: (req: any) => string) => (_req: any, _res: any, next: () => void) => next()),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
}))

vi.mock('../database.js', () => ({
  query: state.rawQuery,
  withDatabaseTransaction: state.withDatabaseTransaction,
}))

vi.mock('../services/taskWriteChainService.js', () => ({
  updateTaskInMainChain: state.updateTaskInMainChain,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: state.logger,
}))

vi.mock('../services/wbsReconciliationService.js', () => ({
  buildReconcilePreview: vi.fn(() => ({ entries: [] })),
}))

const { default: taskReconcileRouter } = await import('../routes/taskReconcile.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(taskReconcileRouter)
  return app
}

describe('task reconcile write integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.backupSnapshot = null
  })

  it('requires editor permission for apply and rollback while keeping preview readable by members', () => {
    expect(routeSource).toMatch(/reconcile\/preview', authenticate, requireProjectMember\(\(req\) => req\.params\.id\),/)
    expect(routeSource).toMatch(/reconcile\/apply', authenticate, requireProjectEditor\(\(req\) => req\.params\.id\),/)
    expect(routeSource).toMatch(/reconcile\/:batchId\/rollback', authenticate, requireProjectEditor\(\(req\) => req\.params\.id\),/)
  })

  it('applies task changes and dependency deactivation in one request transaction', async () => {
    const response = await supertest(buildApp())
      .post('/api/projects/project-1/reconcile/apply')
      .send({
        reconcileBatchId: 'batch-1',
        acceptedEntries: [
          { taskId: 'task-rename', phase: 'rename_suggest', action: 'replace', newTitle: 'New title' },
          { taskId: 'task-delete', phase: 'orphan', action: 'delete' },
        ],
      })

    expect(response.status).toBe(200)
    expect(state.withDatabaseTransaction).toHaveBeenCalledTimes(1)
    expect(state.updateTaskInMainChain).toHaveBeenCalledWith(
      'task-rename',
      expect.objectContaining({ title: 'New title', updated_by: 'user-1' }),
    )
    expect(state.updateTaskInMainChain).toHaveBeenCalledWith(
      'task-delete',
      expect.objectContaining({ deleted_at: expect.any(String), updated_by: 'user-1' }),
    )

    const dependencyMutation = state.rawQuery.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE public.task_dependencies')
      && String(sql).includes("status = 'inactive'"),
    )
    expect(dependencyMutation).toBeTruthy()

    const backupInsert = state.rawQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO public.task_reconcile_backups'),
    )
    expect(backupInsert).toBeTruthy()
    const backupPayload = JSON.parse(String(backupInsert?.[1]?.[3]))
    expect(backupPayload).toMatchObject({
      schemaVersion: 2,
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: 'task-rename', title: 'Old title' }),
        expect.objectContaining({ id: 'task-delete', title: 'Delete me' }),
      ]),
      dependencies: [expect.objectContaining({ id: 'dependency-1', status: 'active' })],
    })
  })

  it('restores backed-up task fields and dependency states during rollback', async () => {
    state.backupSnapshot = {
      schemaVersion: 2,
      tasks: [
        { id: 'task-rename', title: 'Old title', deleted_at: null },
        { id: 'task-delete', title: 'Delete me', deleted_at: null },
      ],
      dependencies: [
        { id: 'dependency-1', status: 'active', metadata: { source: 'manual' } },
      ],
    }

    const response = await supertest(buildApp())
      .post('/api/projects/project-1/reconcile/batch-1/rollback')
      .send({})

    expect(response.status).toBe(200)
    expect(state.withDatabaseTransaction).toHaveBeenCalledTimes(1)
    expect(state.updateTaskInMainChain).toHaveBeenCalledWith(
      'task-rename',
      expect.objectContaining({ title: 'Old title', deleted_at: null, updated_by: 'user-1' }),
    )
    expect(state.updateTaskInMainChain).toHaveBeenCalledWith(
      'task-delete',
      expect.objectContaining({ title: 'Delete me', deleted_at: null, updated_by: 'user-1' }),
    )

    const dependencyRestore = state.rawQuery.mock.calls.find(([sql]) =>
      String(sql).includes('jsonb_to_recordset')
      && String(sql).includes('UPDATE public.task_dependencies'),
    )
    expect(dependencyRestore).toBeTruthy()
    expect(response.body.data).toMatchObject({ restoredTasks: 2, restoredDependencies: 1 })

    const rollbackAudit = state.rawQuery.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE public.task_reconcile_backups')
      && String(sql).includes('rolled_back_at'),
    )
    expect(rollbackAudit).toBeTruthy()
  })
})
