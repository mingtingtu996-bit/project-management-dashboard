import { executeSQL } from './dbService.js'
import { isProjectActiveStatus } from '../utils/projectStatus.js'

export async function listActiveProjectIds(): Promise<string[]> {
  const rows = await executeSQL<{ id: string; status?: string | null }>('SELECT id, status FROM projects')
  return rows
    .filter((row) => isProjectActiveStatus(row.status))
    .map((row) => row.id)
}
