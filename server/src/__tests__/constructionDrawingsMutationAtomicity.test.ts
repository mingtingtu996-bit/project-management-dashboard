import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const harness = vi.hoisted(() => {
  const projectId = '11111111-1111-4111-8111-111111111111'
  const packageId = '22222222-2222-4222-8222-222222222222'
  const drawingId = '33333333-3333-4333-8333-333333333333'
  const licenseId = '44444444-4444-4444-8444-444444444444'

  const baseDrawing = {
    id: drawingId,
    project_id: projectId,
    package_id: packageId,
    package_code: 'PKG-001',
    package_name: 'Structure package',
    drawing_code: 'D-001',
    drawing_name: 'Structure drawing',
    drawing_type: 'structure',
    discipline_type: 'structure',
    document_purpose: 'construction',
    version: '1.0',
    version_no: '1.0',
    revision_no: 'R1',
    related_license_id: licenseId,
    responsible_user_id: 'designer-1',
    review_status: '未提交',
    status: '编制中',
    is_current_version: true,
    lock_version: 1,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
  }

  const state = {
    transactionActive: false,
    failure: null as 'certificate' | 'condition' | null,
    retentionBlocked: false,
    committedEvents: [] as string[],
    attemptedEvents: [] as Array<{ label: string; inTransaction: boolean }>,
    drawingUpdated: false,
    drawingDeleted: false,
    insertedDrawing: null as Record<string, unknown> | null,
    insertedVersion: null as Record<string, unknown> | null,
  }

  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()

  function observe(label: string) {
    state.attemptedEvents.push({ label, inTransaction: state.transactionActive })
  }

  function mutate(label: string) {
    observe(label)
    state.committedEvents.push(label)
  }

  function currentDrawing() {
    if (state.drawingDeleted) return null
    if (!state.drawingUpdated) return { ...baseDrawing }
    return {
      ...baseDrawing,
      drawing_name: 'Structure drawing updated',
      version: '2.0',
      version_no: '2.0',
      revision_no: 'R2',
      review_status: '已通过',
      actual_pass_date: '2026-07-21',
      lock_version: 2,
      updated_at: '2026-07-21T00:00:00.000Z',
    }
  }

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized.includes('from construction_drawings where id = ? and project_id = ? limit 1')) {
      if (normalized.includes('for update')) observe('drawing:locked-read')
      const candidate = String(params[0] ?? '') === drawingId
        ? currentDrawing()
        : state.insertedDrawing
      return candidate && candidate.project_id === String(params[1] ?? '') ? { ...candidate } : null
    }

    if (normalized.includes('from construction_drawings where id = ? limit 1')) {
      if (normalized.includes('for update')) observe('drawing:locked-read')
      if (String(params[0] ?? '') === drawingId) return currentDrawing()
      return state.insertedDrawing && state.insertedDrawing.id === String(params[0] ?? '')
        ? { ...state.insertedDrawing }
        : null
    }

    if (normalized.includes('from drawing_packages where id = ?')) {
      if (normalized.includes('for update')) observe('drawing-package:locked-read')
      return String(params[0] ?? '') === packageId
        ? { id: packageId, project_id: projectId, current_version_drawing_id: drawingId }
        : null
    }

    if (normalized.includes('from pre_milestones where id = ?')) {
      if (normalized.includes('for update')) observe('license:locked-read')
      return String(params[0] ?? '') === licenseId ? { id: licenseId, project_id: projectId } : null
    }

    if (normalized.includes('select count(*) as count from construction_drawings where package_id = ?')) {
      observe('package-current-count:read')
      return { count: 1 }
    }

    if (normalized.includes('from drawing_versions where drawing_id = ? and version_no = ? limit 1')) {
      return state.insertedVersion
        && state.insertedVersion.drawing_id === String(params[0] ?? '')
        && state.insertedVersion.version_no === String(params[1] ?? '')
        ? { ...state.insertedVersion }
        : null
    }

    if (normalized.includes('from drawing_versions where drawing_id = ? and package_id = ? order by created_at desc limit 1')) {
      return String(params[0] ?? '') === drawingId
        ? {
            id: '55555555-5555-4555-8555-555555555555',
            project_id: projectId,
            package_id: packageId,
            drawing_id: drawingId,
            version_no: '1.0',
            is_current_version: true,
            created_at: '2026-07-20T00:00:00.000Z',
          }
        : null
    }

    if (normalized.includes('from drawing_versions where id = ? limit 1')) {
      return state.insertedVersion && state.insertedVersion.id === String(params[0] ?? '')
        ? { ...state.insertedVersion }
        : null
    }

    if (
      normalized.includes('from construction_drawings')
      && normalized.includes('package_id = ?')
      && normalized.includes('is_current_version = ?')
      && normalized.includes('limit 1')
    ) {
      observe('package-current-drawing:read')
      if (state.insertedDrawing?.is_current_version) return { ...state.insertedDrawing }
      return currentDrawing()
    }

    return null
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized.startsWith('insert into construction_drawings')) {
      mutate('construction-drawings:insert')
      state.insertedDrawing = {
        id: String(params[0] ?? ''),
        project_id: String(params[1] ?? ''),
        drawing_type: params[2],
        drawing_name: params[3],
        version: params[4],
        status: params[6],
        review_status: params[11],
        related_license_id: params[15],
        responsible_user_id: params[21],
        package_id: params[27],
        package_code: params[28],
        package_name: params[29],
        discipline_type: params[30],
        document_purpose: params[31],
        drawing_code: params[32],
        version_no: params[34],
        revision_no: params[35],
        is_current_version: params[38] === 1,
        lock_version: 1,
        created_at: params[25],
        updated_at: params[26],
      }
      return []
    }

    if (normalized.startsWith('update construction_drawings set updated_at = ?')) {
      mutate('construction-drawings:cas-update')
      state.drawingUpdated = true
      return []
    }

    if (normalized.startsWith('delete from construction_drawings')) {
      mutate('construction-drawings:delete')
      state.drawingDeleted = true
      return []
    }

    if (normalized.startsWith('insert into drawing_versions')) {
      mutate('drawing-versions:insert')
      state.insertedVersion = {
        id: String(params[0] ?? ''),
        project_id: String(params[1] ?? ''),
        package_id: String(params[2] ?? ''),
        drawing_id: String(params[3] ?? ''),
        version_no: String(params[5] ?? ''),
        revision_no: params[6],
        is_current_version: params[10] === 1,
        created_at: params[14],
        updated_at: params[15],
      }
      return []
    }

    if (normalized.startsWith('update drawing_versions')) {
      mutate('drawing-versions:update')
      return []
    }

    if (normalized.startsWith('update drawing_packages')) {
      mutate('drawing-packages:pointer-update')
      return []
    }

    if (normalized.startsWith('update drawing_package_items')) {
      mutate('drawing-package-items:update')
      return []
    }

    if (normalized.startsWith('update construction_drawings')) {
      mutate('construction-drawings:current-version-update')
      return []
    }

    return []
  })

  const withDatabaseTransaction = vi.fn(async (work: () => Promise<unknown>) => {
    const snapshot = {
      committedEvents: [...state.committedEvents],
      drawingUpdated: state.drawingUpdated,
      drawingDeleted: state.drawingDeleted,
      insertedDrawing: state.insertedDrawing ? { ...state.insertedDrawing } : null,
      insertedVersion: state.insertedVersion ? { ...state.insertedVersion } : null,
    }

    state.transactionActive = true
    try {
      return await work()
    } catch (error) {
      state.committedEvents.splice(0, state.committedEvents.length, ...snapshot.committedEvents)
      state.drawingUpdated = snapshot.drawingUpdated
      state.drawingDeleted = snapshot.drawingDeleted
      state.insertedDrawing = snapshot.insertedDrawing
      state.insertedVersion = snapshot.insertedVersion
      throw error
    } finally {
      state.transactionActive = false
    }
  })

  const clearDrawingBoardCache = vi.fn(() => observe('cache:clear'))
  const getAuthorizedRequestProjectId = vi.fn((req: any, expectedProjectId?: string | null) => {
    observe('authority:revalidate')
    const authorized = req.authorizedProjectIds ?? []
    if (expectedProjectId) return authorized.includes(expectedProjectId) ? expectedProjectId : null
    return authorized.at(-1) ?? null
  })

  const persistNotification = vi.fn(async () => {
    mutate('notification:persist')
    return { id: 'notification-1' }
  })

  const syncPackageCurrentDrawingCertificateLink = vi.fn(async () => {
    mutate('certificate-link:package-sync')
    if (state.failure === 'certificate') throw new Error('injected certificate-link failure')
  })

  const syncDrawingCertificateLink = vi.fn(async () => {
    mutate('certificate-link:drawing-sync')
    if (state.failure === 'certificate') throw new Error('injected certificate-link failure')
  })

  const cleanupDrawingCertificateLink = vi.fn(async () => {
    mutate('certificate-link:cleanup')
    if (state.failure === 'certificate') throw new Error('injected certificate-link failure')
  })

  const autoSatisfyDrawingPackageConditions = vi.fn(async () => {
    mutate('task-conditions:auto-satisfy')
    if (state.failure === 'condition') throw new Error('injected task-condition failure')
    return 1
  })

  const listActiveEntityLinksForEntity = vi.fn(async () => {
    observe('active-links:revalidate')
    return []
  })

  const enforceRetentionOrBlock = vi.fn(async () => {
    mutate('retention:event')
    return state.retentionBlocked
      ? { blocked: true, reason: 'retention_confirmation_required', result: { requiresUserConfirmation: true } }
      : { blocked: false, reason: null, result: null }
  })

  function reset() {
    state.transactionActive = false
    state.failure = null
    state.retentionBlocked = false
    state.committedEvents.splice(0)
    state.attemptedEvents.splice(0)
    state.drawingUpdated = false
    state.drawingDeleted = false
    state.insertedDrawing = null
    state.insertedVersion = null
  }

  return {
    projectId,
    packageId,
    drawingId,
    licenseId,
    state,
    reset,
    executeSQL,
    executeSQLOne,
    withDatabaseTransaction,
    clearDrawingBoardCache,
    getAuthorizedRequestProjectId,
    persistNotification,
    syncPackageCurrentDrawingCertificateLink,
    syncDrawingCertificateLink,
    cleanupDrawingCertificateLink,
    autoSatisfyDrawingPackageConditions,
    listActiveEntityLinksForEntity,
    enforceRetentionOrBlock,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'test-user-id', globalRole: 'company_admin' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn((resolveProjectId: (req: any) => string | undefined | Promise<string | undefined>) => (
    async (req: any, res: any, next: () => void) => {
      const projectId = await resolveProjectId(req)
      if (!projectId) {
        res.status(404).json({ success: false })
        return
      }
      req.authorizedProjectIds = [projectId]
      next()
    }
  )),
  getAuthorizedRequestProjectId: harness.getAuthorizedRequestProjectId,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: harness.executeSQL,
  executeSQLOne: harness.executeSQLOne,
  getMembers: vi.fn(async () => ([
    { id: 'member-1', user_id: 'owner-1', permission_level: 'owner' },
  ])),
}))

vi.mock('../database.js', () => ({
  withDatabaseTransaction: harness.withDatabaseTransaction,
}))

vi.mock('../routes/drawing-packages.js', () => ({
  clearDrawingBoardCache: harness.clearDrawingBoardCache,
  registerDrawingPackageRoutes: vi.fn(),
}))

vi.mock('../routes/drawing-review-rules.js', () => ({
  registerDrawingReviewRuleRoutes: vi.fn(),
}))

vi.mock('../services/drawingCertificateLinkService.js', () => ({
  cleanupDrawingCertificateLink: harness.cleanupDrawingCertificateLink,
  syncDrawingCertificateLink: harness.syncDrawingCertificateLink,
  syncPackageCurrentDrawingCertificateLink: harness.syncPackageCurrentDrawingCertificateLink,
}))

vi.mock('../services/taskConditionLinkageService.js', () => ({
  autoSatisfyDrawingPackageConditions: harness.autoSatisfyDrawingPackageConditions,
}))

vi.mock('../services/projectLinkingService.js', () => ({
  listActiveEntityLinksForEntity: harness.listActiveEntityLinksForEntity,
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: harness.persistNotification,
}))

vi.mock('../services/deletionRetentionGovernanceService.js', () => ({
  enforceRetentionOrBlock: harness.enforceRetentionOrBlock,
  buildRetentionBlockedApiError: vi.fn(() => ({ code: 'RETENTION_CONFIRMATION_REQUIRED' })),
  buildRetentionBlockedHttpStatus: vi.fn(() => 409),
}))

const { default: constructionDrawingsRouter } = await import('../routes/construction-drawings.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/construction-drawings', constructionDrawingsRouter)
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({
      success: false,
      error: { code: 'INJECTED_FAILURE', message: error instanceof Error ? error.message : String(error) },
    })
  })
  return app
}

function expectAttemptsInsideTransaction(labels: string[]) {
  for (const label of labels) {
    expect(harness.state.attemptedEvents).toContainEqual({ label, inTransaction: true })
  }
}

function expectAttemptOrder(labels: string[]) {
  const observedLabels = harness.state.attemptedEvents.map(({ label }) => label)
  const positions = labels.map((label) => observedLabels.indexOf(label))
  expect(positions.every((position) => position >= 0)).toBe(true)
  expect(positions).toEqual([...positions].sort((left, right) => left - right))
}

describe('construction drawing request mutation atomicity', () => {
  beforeEach(() => {
    harness.reset()
    vi.clearAllMocks()
  })

  it('rolls back POST drawing, version, package, notification, and certificate writes when certificate sync fails', async () => {
    harness.state.failure = 'certificate'

    const response = await supertest(buildApp())
      .post('/api/construction-drawings')
      .send({
        project_id: harness.projectId,
        package_id: harness.packageId,
        package_code: 'PKG-001',
        package_name: 'Structure package',
        related_license_id: harness.licenseId,
        drawing_type: 'structure',
        drawing_name: 'New structure drawing',
        drawing_code: 'D-001',
        version: '2.0',
        version_no: '2.0',
        revision_no: 'R2',
        responsible_user_id: 'designer-1',
        review_mode: 'none',
        is_current_version: true,
      })

    expect(response.status).toBe(500)
    expect(response.body.success).toBe(false)
    expect(harness.withDatabaseTransaction).toHaveBeenCalledTimes(1)
    expect(harness.state.insertedDrawing).toBeNull()
    expect(harness.state.insertedVersion).toBeNull()
    expect(harness.state.committedEvents).toEqual([])
    expect(harness.clearDrawingBoardCache).not.toHaveBeenCalled()
    expectAttemptsInsideTransaction([
      'drawing-package:locked-read',
      'license:locked-read',
      'package-current-count:read',
      'construction-drawings:insert',
      'drawing-versions:insert',
      'drawing-packages:pointer-update',
      'drawing-package-items:update',
      'notification:persist',
      'certificate-link:package-sync',
    ])
    expectAttemptOrder([
      'drawing-package:locked-read',
      'package-current-count:read',
      'package-current-drawing:read',
    ])
  })

  it('clears the drawing board cache only after a successful POST transaction commits', async () => {
    const response = await supertest(buildApp())
      .post('/api/construction-drawings')
      .send({
        project_id: harness.projectId,
        package_id: harness.packageId,
        package_code: 'PKG-001',
        package_name: 'Structure package',
        related_license_id: harness.licenseId,
        drawing_type: 'structure',
        drawing_name: 'Committed structure drawing',
        drawing_code: 'D-002',
        version: '2.0',
        version_no: '2.0',
        revision_no: 'R2',
        responsible_user_id: 'designer-1',
        review_mode: 'none',
        is_current_version: true,
      })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(harness.clearDrawingBoardCache).toHaveBeenCalledTimes(1)
    expect(harness.state.attemptedEvents).toContainEqual({ label: 'cache:clear', inTransaction: false })
    expectAttemptsInsideTransaction([
      'notification:persist',
      'certificate-link:package-sync',
    ])
  })

  it('rolls back PUT CAS, version, package, notification, certificate, and condition writes when condition sync fails', async () => {
    harness.state.failure = 'condition'

    const response = await supertest(buildApp())
      .put(`/api/construction-drawings/${harness.drawingId}`)
      .send({
        drawing_name: 'Structure drawing updated',
        version: '2.0',
        version_no: '2.0',
        revision_no: 'R2',
        review_status: '已通过',
        actual_pass_date: '2026-07-21',
        is_current_version: true,
        lock_version: 1,
      })

    expect(response.status).toBe(500)
    expect(response.body.success).toBe(false)
    expect(harness.withDatabaseTransaction).toHaveBeenCalledTimes(1)
    expect(harness.state.drawingUpdated).toBe(false)
    expect(harness.state.insertedVersion).toBeNull()
    expect(harness.state.committedEvents).toEqual([])
    expect(harness.clearDrawingBoardCache).not.toHaveBeenCalled()
    expect(harness.getAuthorizedRequestProjectId).toHaveBeenCalledWith(expect.anything(), harness.projectId)
    expectAttemptsInsideTransaction([
      'drawing:locked-read',
      'authority:revalidate',
      'drawing-package:locked-read',
      'package-current-count:read',
      'construction-drawings:cas-update',
      'drawing-versions:insert',
      'drawing-packages:pointer-update',
      'package-current-drawing:read',
      'notification:persist',
      'certificate-link:package-sync',
      'task-conditions:auto-satisfy',
    ])
    expectAttemptOrder([
      'drawing:locked-read',
      'drawing-package:locked-read',
      'package-current-count:read',
      'package-current-drawing:read',
    ])
  })

  it('returns a stale PUT conflict without mutating data or clearing cache', async () => {
    const response = await supertest(buildApp())
      .put(`/api/construction-drawings/${harness.drawingId}`)
      .send({
        drawing_name: 'Stale drawing update',
        lock_version: 99,
      })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'VERSION_MISMATCH' },
    })
    expect(harness.state.committedEvents).toEqual([])
    expect(harness.clearDrawingBoardCache).not.toHaveBeenCalled()
    expectAttemptsInsideTransaction([
      'drawing:locked-read',
      'authority:revalidate',
      'drawing-package:locked-read',
    ])
  })

  it('rolls back DELETE and retention-governed certificate cleanup when downstream cleanup fails', async () => {
    harness.state.failure = 'certificate'

    const response = await supertest(buildApp())
      .delete(`/api/construction-drawings/${harness.drawingId}`)

    expect(response.status).toBe(500)
    expect(response.body.success).toBe(false)
    expect(harness.withDatabaseTransaction).toHaveBeenCalledTimes(1)
    expect(harness.state.drawingDeleted).toBe(false)
    expect(harness.state.committedEvents).toEqual([])
    expect(harness.clearDrawingBoardCache).not.toHaveBeenCalled()
    expect(harness.getAuthorizedRequestProjectId).toHaveBeenCalledWith(expect.anything(), harness.projectId)
    expectAttemptsInsideTransaction([
      'drawing:locked-read',
      'authority:revalidate',
      'active-links:revalidate',
      'retention:event',
      'construction-drawings:delete',
      'certificate-link:package-sync',
    ])
  })

  it('returns a retention-blocked DELETE without deleting data or clearing cache', async () => {
    harness.state.retentionBlocked = true

    const response = await supertest(buildApp())
      .delete(`/api/construction-drawings/${harness.drawingId}`)

    expect(response.status).toBe(409)
    expect(response.body.success).toBe(false)
    expect(harness.state.drawingDeleted).toBe(false)
    expect(harness.state.committedEvents).toEqual(['retention:event'])
    expect(harness.clearDrawingBoardCache).not.toHaveBeenCalled()
    expectAttemptsInsideTransaction([
      'drawing:locked-read',
      'authority:revalidate',
      'drawing-package:locked-read',
      'active-links:revalidate',
      'retention:event',
    ])
  })
})
