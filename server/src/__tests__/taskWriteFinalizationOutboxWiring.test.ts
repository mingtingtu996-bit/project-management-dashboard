import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServer(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

function listTypeScriptFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const filePath = resolve(root, entry)
    if (statSync(filePath).isDirectory()) return listTypeScriptFiles(filePath)
    return filePath.endsWith('.ts') ? [filePath] : []
  })
}

describe('task write finalization outbox wiring', () => {
  it('starts and stops the persistent job and registers its unique schedule and lease identity', () => {
    const scheduler = readServer('src', 'scheduler.ts')
    const schedules = readServer('src', 'services', 'persistentJobScheduleService.ts')
    const leaseContract = readServer('src', '__tests__', 'schedulerDistributedLeaseContract.test.ts')
    const independentSchedules = readServer('src', '__tests__', 'independentPersistentJobSchedule.contract.test.ts')

    expect(scheduler).toContain("import { taskWriteFinalizationOutboxDrainJob } from './jobs/taskWriteFinalizationOutboxDrainJob.js'")
    expect(scheduler).toContain('taskWriteFinalizationOutboxDrainJob.start()')
    expect(scheduler).toContain('taskWriteFinalizationOutboxDrainJob.stop()')
    expect(schedules).toContain("'taskWriteFinalizationOutboxDrainJob'")
    expect(leaseContract).toContain("'taskWriteFinalizationOutboxDrainJob'")
    expect(leaseContract).toContain('expect(expectedLeaseJobNames).toHaveLength(10)')
    expect(independentSchedules).toContain("['taskWriteFinalizationOutboxDrainJob.ts'")
  })

  it('exposes status but intentionally excludes cross-tenant company-admin manual execution', () => {
    const jobsRoute = readServer('src', 'routes', 'jobs.ts')
    const registry = JSON.parse(readServer('src', 'registry', 'system-domain-registry.json')) as {
      entries?: Array<{ kind?: string; id?: string }>
    }

    expect(jobsRoute).toContain("import { taskWriteFinalizationOutboxDrainJob } from '../jobs/taskWriteFinalizationOutboxDrainJob.js'")
    expect(jobsRoute).toContain('const taskWriteFinalizationOutboxDrainStatus = taskWriteFinalizationOutboxDrainJob.getStatus()')
    expect(jobsRoute).toContain("name: 'taskWriteFinalizationOutboxDrainJob'")
    expect(jobsRoute).not.toContain("case 'taskWriteFinalizationOutboxDrainJob':")
    expect(registry.entries).toContainEqual(expect.objectContaining({
      kind: 'job',
      id: 'taskWriteFinalizationOutboxDrainJob',
    }))
  })

  it('routes legacy and main-chain execution-fact updates through the durable outbox after commit', () => {
    const dbService = readServer('src', 'services', 'dbService.ts')
    const taskWriteChain = readServer('src', 'services', 'taskWriteChainService.ts')
    const bootstrap = readServer('src', 'index.ts')

    expect(dbService).toContain('requestTaskWriteFinalizationOutboxDrain?:')
    expect(dbService).toContain("'requestTaskWriteFinalizationOutboxDrain'")
    expect(dbService).toContain('businessSideEffectAdapters.requestTaskWriteFinalizationOutboxDrain!(id)')
    expect(dbService).not.toContain('finalizeTaskWrite?:')
    expect(dbService).not.toContain("'finalizeTaskWrite'")
    expect(bootstrap).toContain('taskWriteFinalizationOutboxDrainJob')
    expect(bootstrap).toContain('requestTaskWriteFinalizationOutboxDrain: () => taskWriteFinalizationOutboxDrainJob.executeNow()')
    expect(bootstrap).not.toContain("import { finalizeTaskWriteFromLegacyMutation } from './services/taskWriteChainService.js'")
    expect(bootstrap).not.toContain('finalizeTaskWrite: finalizeTaskWriteFromLegacyMutation')
    expect(bootstrap).not.toContain("from './services/taskWriteFinalizationOutboxService.js'")

    const updateSection = taskWriteChain.slice(
      taskWriteChain.indexOf('export async function updateTaskInMainChain'),
      taskWriteChain.indexOf('export async function deleteTaskInMainChain'),
    )
    const reopenSection = taskWriteChain.slice(
      taskWriteChain.indexOf('export async function reopenTaskInMainChain'),
    )
    expect(updateSection).toContain('taskWriteFinalizationOutboxDrainJob.executeNow()')
    expect(updateSection).not.toContain('drainTaskWriteFinalizationOutbox({')
    expect(updateSection).not.toContain('await finalizeTaskWrite(task, previousTask')
    expect(reopenSection).toContain('taskWriteFinalizationOutboxDrainJob.executeNow()')
    expect(reopenSection).not.toContain('drainTaskWriteFinalizationOutbox({')
    expect(reopenSection).not.toContain('await finalizeTaskWrite(task, previousTask')
  })

  it('keeps the independent leased job as the only production importer of the processor', () => {
    const sourceRoot = resolve(serverRoot, 'src')
    const outboxService = readServer('src', 'services', 'taskWriteFinalizationOutboxService.ts')
    const drainJob = readServer('src', 'jobs', 'taskWriteFinalizationOutboxDrainJob.ts')
    const registry = JSON.parse(readServer('src', 'registry', 'system-domain-registry.json')) as {
      entries?: Array<{ kind?: string; id?: string; runtimeScope?: string }>
    }
    const importers = listTypeScriptFiles(sourceRoot)
      .filter((filePath) => !filePath.includes(`${resolve(sourceRoot, '__tests__')}`))
      .filter((filePath) => readFileSync(filePath, 'utf8').includes('taskWriteFinalizationOutboxService.js'))
      .map((filePath) => filePath.slice(sourceRoot.length + 1).replaceAll('\\', '/'))

    expect(importers).toEqual(['jobs/taskWriteFinalizationOutboxDrainJob.ts'])
    expect(outboxService).not.toContain('taskWriteChainService.js')
    expect(outboxService).not.toContain('defaultFinalizeTaskWrite')
    expect(drainJob).toContain("import { finalizeTaskWriteFromLegacyMutation } from '../services/taskWriteChainService.js'")
    expect(drainJob).toContain('finalize: finalizeTaskWriteFromLegacyMutation')
    expect(registry.entries).toContainEqual(expect.objectContaining({
      kind: 'job',
      id: 'taskWriteFinalizationOutboxDrainJob',
      runtimeScope: 'business_core',
    }))
  })

  it('awaits passive reorder enqueue so asynchronous failure remains retryable', () => {
    const taskWriteChain = readServer('src', 'services', 'taskWriteChainService.ts')

    expect(taskWriteChain).toContain('async function queuePassiveReorderDetection')
    expect(taskWriteChain).toContain('await systemAnomalyService.enqueuePassiveReorderDetection(projectId)')
    expect(taskWriteChain.match(/await queuePassiveReorderDetection\(/g)).toHaveLength(3)
  })
})
