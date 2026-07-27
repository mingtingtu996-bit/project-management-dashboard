import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server')

describe('retention transaction contract', () => {
  it('writes retention decisions through the active request transaction', () => {
    const source = readFileSync(
      resolve(serverRoot, 'src/services/deletionRetentionGovernanceService.ts'),
      'utf8',
    )
    const executeRetention = source.slice(
      source.indexOf('export async function executeRetention'),
      source.indexOf('export async function confirmRetentionDecision'),
    )

    expect(executeRetention).toContain('INSERT INTO public.deletion_retention_events')
    expect(executeRetention).toContain('await query(')
    expect(executeRetention).not.toContain(".from('deletion_retention_events').insert")
  })
})
