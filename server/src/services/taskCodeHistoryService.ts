import { supabase } from './dbService.js'

export async function recordTaskCodeHistory(
  taskId: string,
  projectId: string,
  oldTaskCode: string | null,
  newTaskCode: string,
  changeReason: string,
  changedBy?: string | null,
  metadata?: Record<string, unknown>,
) {
  const { error } = await supabase.from('task_code_history').insert({
    task_id: taskId,
    project_id: projectId,
    old_task_code: oldTaskCode,
    new_task_code: newTaskCode,
    change_reason: changeReason,
    changed_by: changedBy ?? null,
    changed_at: new Date().toISOString(),
    metadata: metadata ?? {},
  })
  if (error) {
    throw new Error(`Failed to record task code history: ${error.message}`)
  }
}
