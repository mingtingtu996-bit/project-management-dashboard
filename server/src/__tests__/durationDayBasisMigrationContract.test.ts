import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server')

describe('duration day basis migration contract', () => {
  it('labels legacy values and adds explicit dual-basis fields without rewriting old facts', () => {
    const sql = readFileSync(
      resolve(serverRoot, 'migrations/314_duration_day_basis_contract.sql'),
      'utf8',
    ).toLowerCase()

    expect(sql).toContain('alter table public.duration_experience_samples')
    expect(sql).toContain("duration_day_basis text not null default 'calendar_day'")
    expect(sql).toContain('actual_duration_calendar_days')
    expect(sql).toContain('actual_duration_production_days')
    expect(sql).toContain('planned_duration_calendar_days')
    expect(sql).toContain('planned_duration_production_days')
    expect(sql).toContain('alter table public.duration_benchmarks')
    expect(sql).toContain('duration_benchmarks_duration_day_basis_check')
    expect(sql).not.toMatch(/update\s+public\.duration_experience_samples\s+set\s+actual_duration\s*=/)
  })

  it('provides a schema rollback that leaves learned values untouched', () => {
    const sql = readFileSync(
      resolve(serverRoot, 'migrations/rollback/314_duration_day_basis_contract.sql'),
      'utf8',
    ).toLowerCase()

    expect(sql).toContain('drop column if exists duration_day_basis')
    expect(sql).toContain('drop column if exists actual_duration_production_days')
    expect(sql).toContain('drop column if exists planned_duration_production_days')
    expect(sql).not.toContain('delete from')
  })
})
