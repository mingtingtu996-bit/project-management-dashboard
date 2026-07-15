import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server')

describe('business runtime write RLS migration', () => {
  it('grants the backend runtime role only the missing task-condition and notification paths', () => {
    const sql = readFileSync(
      resolve(serverRoot, 'migrations/299_v14241_business_runtime_write_rls.sql'),
      'utf8',
    )

    for (const table of ['task_conditions', 'notifications']) {
      expect(sql).toContain(`public.${table}`)
      expect(sql).toContain(`${table}_backend_runtime_policy`)
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO workbuddy_runtime`)
    }
    expect(sql).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(sql).not.toContain('GRANT ALL')
    expect(sql).not.toContain('TO public')
  })
})
