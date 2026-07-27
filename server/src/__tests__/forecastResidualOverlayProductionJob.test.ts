import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const workspaceRoot = resolve(__dirname, '..', '..', '..')

function readServerFile(...parts: string[]) {
  return readFileSync(resolve(workspaceRoot, 'server', ...parts), 'utf8')
}

const mocks = vi.hoisted(() => ({
  listActiveProjectIds: vi.fn(async (projectIds?: string[] | null) => projectIds ?? ['project-1']),
  executeSQL: vi.fn(),
  evaluateAndPersistAlgorithmAssetForecastResidualOverlay: vi.fn(async () => ({
    evaluation: {
      summary: {
        acceptedSampleCount: 5,
        runtimeImpact: 'publish_gate_evidence',
      },
      overlayWrite: {
        canWriteRuntimeOverlay: true,
      },
    },
    persistence: {
      persisted: true,
      overlayId: 'overlay-1',
    },
  })),
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: mocks.listActiveProjectIds,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
}))

vi.mock('../services/algorithmAssetForecastResidualOverlayService.js', () => ({
  evaluateAndPersistAlgorithmAssetForecastResidualOverlay: mocks.evaluateAndPersistAlgorithmAssetForecastResidualOverlay,
}))

const { runForecastResidualOverlayProductionSweep } = await import('../jobs/forecastResidualOverlayProductionJob.js')

type MockCompletedTask = {
  id: string
  project_id?: string
  actual_end_date: string
  updated_at?: string
}

type MockTaskForecast = {
  task_id: string
  forecast_finish_date: string
  generated_at?: string
}

function mockResidualSampleReads(params: {
  companyByProject?: Record<string, string | null>
  tasksByProject: Record<string, MockCompletedTask[]>
  forecastsByTask: Record<string, MockTaskForecast[]>
}) {
  mocks.executeSQL.mockImplementation(async (sql: string, sqlParams: unknown[]) => {
    if (/\bJOIN\b|\bCOALESCE\s*\(/i.test(sql)) {
      throw new Error(`complex SQL is not allowed in residual overlay sample collection: ${sql}`)
    }
    if (sql.includes('FROM projects')) {
      const projectId = String(sqlParams[0] ?? '')
      return [{ id: projectId, company_id: params.companyByProject?.[projectId] ?? null }]
    }
    if (sql.includes('FROM tasks')) {
      const projectId = String(sqlParams[0] ?? '')
      return params.tasksByProject[projectId] ?? []
    }
    if (sql.includes('FROM task_duration_forecasts')) {
      const taskIds = sqlParams.slice(0, -1).map((value) => String(value ?? ''))
      return taskIds.flatMap((taskId) => params.forecastsByTask[taskId] ?? [])
    }
    return []
  })
}

describe('forecastResidualOverlayProductionJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('collects residual overlay samples from simple table reads', async () => {
    mockResidualSampleReads({
      companyByProject: { 'project-1': 'company-a' },
      tasksByProject: {
        'project-1': [
          { id: 'task-1', project_id: 'project-1', actual_end_date: '2026-05-11', updated_at: '2026-05-11T08:00:00.000Z' },
          { id: 'task-2', project_id: 'project-1', actual_end_date: '2026-05-10', updated_at: '2026-05-10T08:00:00.000Z' },
          { id: 'task-3', project_id: 'project-1', actual_end_date: '2026-05-08', updated_at: '2026-05-08T08:00:00.000Z' },
          { id: 'task-4', project_id: 'project-1', actual_end_date: '2026-05-08', updated_at: '2026-05-08T08:00:00.000Z' },
          { id: 'task-5', project_id: 'project-1', actual_end_date: '2026-05-07', updated_at: '2026-05-07T08:00:00.000Z' },
        ],
      },
      forecastsByTask: {
        'task-1': [{ task_id: 'task-1', forecast_finish_date: '2026-05-10', generated_at: '2026-05-01T08:00:00.000Z' }],
        'task-2': [{ task_id: 'task-2', forecast_finish_date: '2026-05-09', generated_at: '2026-05-02T08:00:00.000Z' }],
        'task-3': [{ task_id: 'task-3', forecast_finish_date: '2026-05-08', generated_at: '2026-05-03T08:00:00.000Z' }],
        'task-4': [{ task_id: 'task-4', forecast_finish_date: '2026-05-07', generated_at: '2026-05-04T08:00:00.000Z' }],
        'task-5': [{ task_id: 'task-5', forecast_finish_date: '2026-05-06', generated_at: '2026-05-05T08:00:00.000Z' }],
      },
    })

    const result = await runForecastResidualOverlayProductionSweep({
      projectIds: ['project-1'],
      minAcceptedSamples: 5,
    })

    expect(result).toEqual(expect.objectContaining({
      scannedProjects: 1,
      sampledProjects: 1,
      sampleCount: 5,
      persistedOverlayCount: 1,
      runtimePublishableOverlayCount: 1,
      skippedForInsufficientSamples: 0,
      failedProjects: 0,
    }))
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM projects'),
      ['project-1'],
    )
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM task_duration_forecasts'),
      expect.arrayContaining(['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 800]),
    )
    expect(mocks.evaluateAndPersistAlgorithmAssetForecastResidualOverlay).toHaveBeenCalledWith(expect.objectContaining({
      samples: expect.arrayContaining([
        expect.objectContaining({
          sampleId: 'task-1:2026-05-01T08:00:00.000Z',
          companyId: 'company-a',
          projectId: 'project-1',
          originalForecastFinishDate: '2026-05-10',
          overlayForecastFinishDate: '2026-05-11',
          actualFinishDate: '2026-05-11',
        }),
      ]),
    }))
  })

  it('produces residual overlay samples from completed production forecast outcomes', async () => {
    mockResidualSampleReads({
      companyByProject: { 'project-1': 'company-a' },
      tasksByProject: {
        'project-1': [
          { id: 'task-1', project_id: 'project-1', actual_end_date: '2026-05-11', updated_at: '2026-05-11T08:00:00.000Z' },
          { id: 'task-2', project_id: 'project-1', actual_end_date: '2026-05-10', updated_at: '2026-05-10T08:00:00.000Z' },
          { id: 'task-3', project_id: 'project-1', actual_end_date: '2026-05-09', updated_at: '2026-05-09T08:00:00.000Z' },
          { id: 'task-4', project_id: 'project-1', actual_end_date: '2026-05-08', updated_at: '2026-05-08T08:00:00.000Z' },
          { id: 'task-5', project_id: 'project-1', actual_end_date: '2026-05-07', updated_at: '2026-05-07T08:00:00.000Z' },
        ],
      },
      forecastsByTask: {
        'task-1': [{ task_id: 'task-1', forecast_finish_date: '2026-05-10', generated_at: 'forecast-2026-05-01' }],
        'task-2': [{ task_id: 'task-2', forecast_finish_date: '2026-05-09', generated_at: 'forecast-2026-05-02' }],
        'task-3': [{ task_id: 'task-3', forecast_finish_date: '2026-05-08', generated_at: 'forecast-2026-05-03' }],
        'task-4': [{ task_id: 'task-4', forecast_finish_date: '2026-05-07', generated_at: 'forecast-2026-05-04' }],
        'task-5': [{ task_id: 'task-5', forecast_finish_date: '2026-05-06', generated_at: 'forecast-2026-05-05' }],
      },
    })

    const result = await runForecastResidualOverlayProductionSweep({
      projectIds: ['project-1'],
      minAcceptedSamples: 5,
    })

    expect(result).toEqual(expect.objectContaining({
      scannedProjects: 1,
      sampledProjects: 1,
      sampleCount: 5,
      persistedOverlayCount: 1,
      runtimePublishableOverlayCount: 1,
      skippedForInsufficientSamples: 0,
      failedProjects: 0,
    }))
    expect(mocks.executeSQL).toHaveBeenCalledWith(expect.stringContaining('FROM projects'), ['project-1'])
    expect(mocks.executeSQL).toHaveBeenCalledWith(expect.stringContaining('FROM tasks'), ['project-1', 800])
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM task_duration_forecasts'),
      expect.arrayContaining(['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 800]),
    )
    const sql = mocks.executeSQL.mock.calls.map(([statement]) => String(statement)).join('\n')
    expect(sql).toContain('forecast_finish_date')
    expect(sql).not.toContain('tf.original_forecast_finish_date')
    expect(sql).not.toContain('tf.forecast_finish_at')
    expect(mocks.evaluateAndPersistAlgorithmAssetForecastResidualOverlay).toHaveBeenCalledWith(expect.objectContaining({
      overlayKey: expect.stringContaining('forecast-residual-overlay-runtime:project-1:'),
      assetKey: 'task_remaining_forecast',
      companyId: 'company-a',
      projectId: 'project-1',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_canary',
      minAcceptedSamples: 5,
      samples: expect.arrayContaining([
        expect.objectContaining({
          sampleId: 'task-1:forecast-2026-05-01',
          originalForecastFinishDate: '2026-05-10',
          overlayForecastFinishDate: '2026-05-11',
          actualFinishDate: '2026-05-11',
        }),
      ]),
    }))
  })

  it('does not write a residual overlay when the production sample gate is not met', async () => {
    mockResidualSampleReads({
      companyByProject: { 'project-1': 'company-a' },
      tasksByProject: {
        'project-1': [
          { id: 'thin-1', project_id: 'project-1', actual_end_date: '2026-05-11', updated_at: '2026-05-11T08:00:00.000Z' },
        ],
      },
      forecastsByTask: {
        'thin-1': [{ task_id: 'thin-1', forecast_finish_date: '2026-05-10', generated_at: 'thin-forecast' }],
      },
    })

    const result = await runForecastResidualOverlayProductionSweep({
      projectIds: ['project-1'],
      minAcceptedSamples: 5,
    })

    expect(result).toEqual(expect.objectContaining({
      scannedProjects: 1,
      sampledProjects: 0,
      sampleCount: 1,
      persistedOverlayCount: 0,
      skippedForInsufficientSamples: 1,
      failedProjects: 0,
    }))
    expect(mocks.evaluateAndPersistAlgorithmAssetForecastResidualOverlay).not.toHaveBeenCalled()
  })

  it('also produces coarse company residual overlays before project-local overlays when company samples are mature', async () => {
    mocks.listActiveProjectIds.mockResolvedValue(['project-1', 'project-2'])
    const tasksByProject: Record<string, MockCompletedTask[]> = {}
    const forecastsByTask: Record<string, MockTaskForecast[]> = {}
    for (const projectId of ['project-1', 'project-2']) {
      tasksByProject[projectId] = Array.from({ length: 5 }, (_, index) => {
        const day = 11 + index
        const taskId = `${projectId}-task-${index + 1}`
        forecastsByTask[taskId] = [{
          task_id: taskId,
          forecast_finish_date: `2026-05-${String(day - 1).padStart(2, '0')}`,
          generated_at: `${projectId}:forecast-${index + 1}`,
        }]
        return {
          id: taskId,
          project_id: projectId,
          actual_end_date: `2026-05-${String(day).padStart(2, '0')}`,
          updated_at: `2026-05-${String(day).padStart(2, '0')}T08:00:00.000Z`,
        }
      })
    }
    mockResidualSampleReads({
      companyByProject: { 'project-1': 'company-a', 'project-2': 'company-a' },
      tasksByProject,
      forecastsByTask,
    })

    const result = await runForecastResidualOverlayProductionSweep({
      projectIds: ['project-1', 'project-2'],
      minAcceptedSamples: 5,
      runDate: '2026-06-17',
    })

    expect(result).toEqual(expect.objectContaining({
      scannedProjects: 2,
      sampledProjects: 2,
      sampleCount: 10,
      persistedOverlayCount: 3,
      runtimePublishableOverlayCount: 3,
    }))
    expect(mocks.evaluateAndPersistAlgorithmAssetForecastResidualOverlay).toHaveBeenNthCalledWith(1, expect.objectContaining({
      overlayKey: 'forecast-residual-overlay-runtime:company:company-a:2026-06-17',
      assetKey: 'task_remaining_forecast',
      companyId: 'company-a',
      projectId: null,
      automationMaturity: 'auto_publish',
      minAcceptedSamples: 10,
      samples: expect.arrayContaining([
        expect.objectContaining({ projectId: 'project-1' }),
        expect.objectContaining({ projectId: 'project-2' }),
      ]),
    }))
    expect(mocks.evaluateAndPersistAlgorithmAssetForecastResidualOverlay).toHaveBeenNthCalledWith(2, expect.objectContaining({
      overlayKey: 'forecast-residual-overlay-runtime:project-1:2026-06-17',
      projectId: 'project-1',
      minAcceptedSamples: 5,
    }))
    expect(mocks.evaluateAndPersistAlgorithmAssetForecastResidualOverlay).toHaveBeenNthCalledWith(3, expect.objectContaining({
      overlayKey: 'forecast-residual-overlay-runtime:project-2:2026-06-17',
      projectId: 'project-2',
      minAcceptedSamples: 5,
    }))
  })

  it('builds candidate overlay dates from ordinary forecast-vs-actual residuals without requiring a prior overlay', async () => {
    mockResidualSampleReads({
      companyByProject: { 'project-1': 'company-a' },
      tasksByProject: {
        'project-1': [
          { id: 'task-1', project_id: 'project-1', actual_end_date: '2026-05-12', updated_at: '2026-05-12T08:00:00.000Z' },
          { id: 'task-2', project_id: 'project-1', actual_end_date: '2026-05-13', updated_at: '2026-05-13T08:00:00.000Z' },
          { id: 'task-3', project_id: 'project-1', actual_end_date: '2026-05-14', updated_at: '2026-05-14T08:00:00.000Z' },
          { id: 'task-4', project_id: 'project-1', actual_end_date: '2026-05-15', updated_at: '2026-05-15T08:00:00.000Z' },
          { id: 'task-5', project_id: 'project-1', actual_end_date: '2026-05-16', updated_at: '2026-05-16T08:00:00.000Z' },
        ],
      },
      forecastsByTask: {
        'task-1': [{ task_id: 'task-1', forecast_finish_date: '2026-05-10', generated_at: 'forecast-1' }],
        'task-2': [{ task_id: 'task-2', forecast_finish_date: '2026-05-11', generated_at: 'forecast-2' }],
        'task-3': [{ task_id: 'task-3', forecast_finish_date: '2026-05-12', generated_at: 'forecast-3' }],
        'task-4': [{ task_id: 'task-4', forecast_finish_date: '2026-05-13', generated_at: 'forecast-4' }],
        'task-5': [{ task_id: 'task-5', forecast_finish_date: '2026-05-14', generated_at: 'forecast-5' }],
      },
    })

    await runForecastResidualOverlayProductionSweep({
      projectIds: ['project-1'],
      minAcceptedSamples: 5,
    })

    const sql = mocks.executeSQL.mock.calls.map(([statement]) => String(statement)).join('\n')
    expect(sql).toContain('actual_end_date IS NOT NULL')
    expect(sql).toContain('forecast_finish_date IS NOT NULL')
    expect(sql).not.toMatch(/\bJOIN\b/i)
    expect(sql).not.toMatch(/\bCOALESCE\s*\(/i)
    expect(sql).not.toContain("tf.factor_summary->'forecastSources'->'residualOverlay'")
    expect(sql).not.toContain("tf.factor_summary->'residualOverlay'")
    expect(sql).not.toContain("tf.factor_summary->'forecastPaths'->'recommended'")
    expect(mocks.evaluateAndPersistAlgorithmAssetForecastResidualOverlay).toHaveBeenCalledWith(expect.objectContaining({
      samples: expect.arrayContaining([
        expect.objectContaining({
          sampleId: 'task-1:forecast-1',
          originalForecastFinishDate: '2026-05-10',
          overlayForecastFinishDate: '2026-05-12',
          actualFinishDate: '2026-05-12',
        }),
      ]),
    }))
  })

  it('does not collect residual overlay samples through JOIN or COALESCE executeSQL literals', () => {
    const jobSource = readServerFile('src', 'jobs', 'forecastResidualOverlayProductionJob.ts')

    expect(jobSource).not.toMatch(/executeSQL<[^>]+>\(`[\s\S]*\bJOIN\b[\s\S]*`\s*,/i)
    expect(jobSource).not.toMatch(/executeSQL<[^>]+>\(`[\s\S]*\bCOALESCE\s*\(/i)
  })

  it('is wired into scheduler and admin jobs route as a production producer', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')

    expect(schedulerSource).toContain("import { forecastResidualOverlayProductionJob } from './jobs/forecastResidualOverlayProductionJob.js'")
    expect(schedulerSource).toContain('forecastResidualOverlayProductionJob.start()')
    expect(schedulerSource).toContain('forecastResidualOverlayProductionJob.stop()')
    expect(schedulerSource).toContain('Forecast residual overlay production job started (daily 06:05)')

    expect(jobsRouteSource).toContain("import { forecastResidualOverlayProductionJob } from '../jobs/forecastResidualOverlayProductionJob.js'")
    expect(jobsRouteSource).toContain("name: 'forecastResidualOverlayProductionJob'")
    expect(jobsRouteSource).toContain("schedule: '5 6 * * *'")
    expect(jobsRouteSource).toContain("case 'forecastResidualOverlayProductionJob'")
    expect(jobsRouteSource).toContain('result: await forecastResidualOverlayProductionJob.executeNow(projectScope)')
  })
})
