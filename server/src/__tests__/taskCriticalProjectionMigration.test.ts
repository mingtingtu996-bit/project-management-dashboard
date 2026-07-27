import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationPath = resolve(serverRoot, 'migrations/182_task_critical_projection_columns_schema_repair.sql')

describe('task critical projection columns schema repair migration', () => {
  it('adds the task critical-path projection columns used by forecasts and acceleration runtime', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS baseline_is_critical BOOLEAN NOT NULL DEFAULT FALSE')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS total_float_days INTEGER')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS free_float_days INTEGER')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS successor_count INTEGER NOT NULL DEFAULT 0')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS milestone_distance_days INTEGER')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS downstream_milestone_distance_days INTEGER')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS criticality_weight NUMERIC(6,3) NOT NULL DEFAULT 1')
    expect(sql).toContain('idx_tasks_project_baseline_critical')
    expect(sql).toContain('idx_tasks_project_criticality_float')
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
