import { describe, expect, it } from 'vitest'

import {
  buildBaselineLedgerInsertQuery,
  insertBaselineLedgerEntries,
} from '../scripts/adopt-migration-baseline.js'

describe('adopt migration baseline ledger writes', () => {
  it('uses an insert-only schema_migrations ledger write', () => {
    const query = buildBaselineLedgerInsertQuery()
    const normalizedSql = query.text.replace(/\s+/g, ' ').trim().toLowerCase()

    expect(normalizedSql).toContain('insert into public.schema_migrations')
    expect(normalizedSql).toContain('values ($1, $2, $3)')
    expect(normalizedSql).not.toContain('on conflict')
    expect(normalizedSql).not.toContain('do update')
    expect(normalizedSql).not.toContain('excluded.')
    expect(query.values('001_init.sql', '001', 'checksum-001')).toEqual([
      '001_init.sql',
      '001',
      'checksum-001',
    ])
  })

  it('rolls back instead of updating when a ledger insert fails', async () => {
    const issuedQueries: string[] = []
    const client = {
      query: async (text: string) => {
        issuedQueries.push(text)
        if (text.includes('INSERT INTO public.schema_migrations')) {
          throw new Error('duplicate key value violates unique constraint')
        }
      },
    }

    await expect(
      insertBaselineLedgerEntries(client, [
        {
          filename: '001_init.sql',
          version: '001',
          checksum: 'checksum-001',
        },
      ]),
    ).rejects.toThrow('duplicate key')

    expect(issuedQueries.map((query) => query.trim())).toEqual([
      'BEGIN',
      buildBaselineLedgerInsertQuery().text.trim(),
      'ROLLBACK',
    ])
    expect(issuedQueries.join('\n').toLowerCase()).not.toContain('do update')
  })
})
