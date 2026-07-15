import { getTasks, executeSQL } from '../../server/src/services/dbService.js'
import { buildStandardDTO } from '../../server/src/services/taskStandardModelService.js'
import { sanitizeTaskForClient } from '../../server/src/services/taskDtoService.js'
import { attachTasksLagStatus } from '../../server/src/services/taskLagStatusService.js'

const projectId = process.env.PROJECT_ID ?? '7a9665bb-dd41-4b03-a3dd-6c2039f9b63f'
const batchSize = Number(process.env.BATCH_SIZE ?? 200)

async function time<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  const start = Date.now()
  const value = await fn()
  const count = Array.isArray(value) ? value.length : undefined
  console.log(JSON.stringify({ label, ms: Date.now() - start, count }))
  return value
}

async function main() {
  const tasks = await time('getTasks', () => getTasks(projectId))
  const sortedTasks = await time('sort', () => [...tasks].sort((left, right) => {
    const leftSort = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : Number.MAX_SAFE_INTEGER
    const rightSort = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : Number.MAX_SAFE_INTEGER
    return leftSort - rightSort
  }))

  await time('participantUnits', async () => {
    const ids = [...new Set(sortedTasks.map((task) => task.participant_unit_id).filter((value): value is string => Boolean(value)))]
    if (ids.length === 0) return []
    return executeSQL(
      `SELECT id, unit_name FROM participant_units WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids,
    )
  })

  await time('acceptanceDirectBatches', async () => {
    const ids = [...new Set(sortedTasks.map((task) => String(task.id)).filter(Boolean))]
    const rows: unknown[] = []
    for (let index = 0; index < ids.length; index += batchSize) {
      const batch = ids.slice(index, index + batchSize)
      rows.push(...await executeSQL(
        `SELECT id, task_id, acceptance_name, plan_name, type_name, acceptance_type, status
           FROM acceptance_plans
          WHERE project_id = ? AND task_id IN (${batch.map(() => '?').join(', ')})
          ORDER BY planned_date ASC, created_at ASC`,
        [projectId, ...batch],
      ))
    }
    return rows
  })

  const laggedTasks = await time('lag', () => attachTasksLagStatus(sortedTasks))

  await time('dto20', () => Promise.all(laggedTasks.slice(0, 20).map(async (task) => (
    sanitizeTaskForClient(await buildStandardDTO(task as unknown as Record<string, unknown>, { mode: 'list' }))
  ))))

  await time('dtoAll', () => Promise.all(laggedTasks.map(async (task) => (
    sanitizeTaskForClient(await buildStandardDTO(task as unknown as Record<string, unknown>, { mode: 'list' }))
  ))))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
