import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = join(__dirname, '..', '..')

describe('delay legacy trigger cleanup contract', () => {
  it('ships a migration that disables the obsolete task delay history trigger', () => {
    const migration = readFileSync(
      join(serverRoot, 'migrations', '104_disable_legacy_task_delay_trigger.sql'),
      'utf8',
    )

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.record_task_delay_history()')
    expect(migration).toContain('DROP TRIGGER IF EXISTS trigger_record_task_delay ON public.tasks;')
    expect(migration).toContain('RETURN NEW;')
  })
})
