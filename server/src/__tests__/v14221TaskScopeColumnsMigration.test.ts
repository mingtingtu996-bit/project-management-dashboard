import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('\\server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationPath = resolve(serverRoot, 'migrations/181_v14221_task_scope_columns_schema_repair.sql')

describe('v1.4.22.1 task scope columns schema repair migration', () => {
  it('adds the final range-tree task fields read by the task list surface', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    for (const field of [
      'basement_object_id',
      'physical_zone_object_id',
      'functional_area_object_id',
    ]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${field} UUID REFERENCES public.engineering_objects(id) ON DELETE SET NULL`)
      expect(sql).toContain(`idx_tasks_${field}`)
      expect(sql).toContain(`ON public.tasks(${field})`)
    }

    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
