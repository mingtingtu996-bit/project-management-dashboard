import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

describe('106 backfill runtime data integrity migration', () => {
  it('normalizes legacy risk status and restores missing issue chain ids', () => {
    const migration = readFileSync(
      resolve(serverRoot, 'migrations', '106_backfill_runtime_data_integrity.sql'),
      'utf8',
    )

    expect(migration).toContain("UPDATE public.risks")
    expect(migration).toContain("status = 'mitigating'")
    expect(migration).toContain("WHERE status = 'monitoring'")

    expect(migration).toContain("UPDATE public.issues")
    expect(migration).toContain("source_type = 'obstacle_escalated'")
    expect(migration).toContain('chain_id = gen_random_uuid()')
    expect(migration).toContain('chain_id IS NULL')
  })
})
