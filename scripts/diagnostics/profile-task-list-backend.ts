import { executeSQL, getTasks } from '../../server/src/services/dbService.js'
import { buildStandardDTO } from '../../server/src/services/taskStandardModelService.js'
import { sanitizeTaskForClient } from '../../server/src/services/taskDtoService.js'
import { attachTasksLagStatus } from '../../server/src/services/taskLagStatusService.js'

const projectId = process.env.PROJECT_ID ?? '7a9665bb-dd41-4b03-a3dd-6c2039f9b63f'

async function time<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  const startedAt = Date.now()
  const value = await fn()
  const count = Array.isArray(value) ? value.length : undefined
  console.log(JSON.stringify({ label, ms: Date.now() - startedAt, count }))
  return value
}

async function main() {
  const tasks = await time('tasks:getTasks', () => getTasks(projectId))
  const taskIds = [...new Set(tasks.map((task) => String(task.id ?? '').trim()).filter(Boolean))]

  await time('tasks:acceptanceProjectScan', () => executeSQL(
    `SELECT id, task_id, acceptance_name, plan_name, type_name, acceptance_type, status
       FROM acceptance_plans
      WHERE project_id = ?
      ORDER BY planned_date ASC, created_at ASC`,
    [projectId],
  ))

  await time('tasks:acceptanceTaskIdScan', async () => {
    const rows: unknown[] = []
    for (let index = 0; index < taskIds.length; index += 200) {
      const batch = taskIds.slice(index, index + 200)
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

  await time('tasks:acceptanceLinkProjectScan', () => executeSQL(
    `SELECT source_entity_id, target_entity_id
       FROM project_entity_links
      WHERE project_id = ?
        AND source_entity_type = 'acceptance_plan'
        AND target_entity_type = 'task'
        AND relation_type = 'covers_task'
        AND status = 'active'`,
    [projectId],
  ))

  await time('tasks:engineeringObjects', () => executeSQL(
    `SELECT *
       FROM engineering_objects
      WHERE project_id = ? AND status = 'active'
      ORDER BY parent_id ASC NULLS FIRST, sort_order ASC, object_name ASC`,
    [projectId],
  ))

  const laggedTasks = await time('tasks:lag', () => attachTasksLagStatus(tasks))
  await time('tasks:dtoAll', () => Promise.all(laggedTasks.map(async (task) => (
    sanitizeTaskForClient(await buildStandardDTO(task as unknown as Record<string, unknown>, { mode: 'list' }))
  ))))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
