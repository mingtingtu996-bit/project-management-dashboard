import { executeSQL } from './dbService.js'
import { isProjectActiveStatus } from '../utils/projectStatus.js'

// workspace-isolation-system-job-approved: shared scheduled jobs may enumerate active ids; request scopes are pushed into SQL.
export async function listActiveProjectIds(projectIds?: string[] | null): Promise<string[]> {
  const normalizedProjectIds = Array.isArray(projectIds)
    ? [...new Set(projectIds.map((projectId) => String(projectId ?? '').trim()).filter(Boolean))]
    : null
  const allowedProjectIds = normalizedProjectIds ? new Set(normalizedProjectIds) : null

  if (allowedProjectIds && allowedProjectIds.size === 0) {
    return []
  }

  // workspace-isolation-system-job-approved: an omitted scope is reserved for scheduled cross-project jobs;
  // request-facing callers supply visible project ids, which are pushed into SQL below.
  const rows = normalizedProjectIds === null
    ? await executeSQL<{ id: string; status?: string | null }>('SELECT id, status FROM projects')
    : await executeSQL<{ id: string; status?: string | null }>(
        'SELECT id, status FROM projects WHERE id = ANY(?::uuid[])',
        [normalizedProjectIds],
      )
  return rows
    .filter((row) => isProjectActiveStatus(row.status))
    .filter((row) => !allowedProjectIds || allowedProjectIds.has(String(row.id)))
    .map((row) => row.id)
}
