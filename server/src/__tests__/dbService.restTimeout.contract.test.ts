import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readDbServiceSource() {
  const candidates = [
    join(process.cwd(), 'src/services/dbService.ts'),
    join(process.cwd(), 'server/src/services/dbService.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8').replace(/\r\n/g, '\n')
    } catch {
      // Try the next repository layout.
    }
  }

  throw new Error(`Unable to locate dbService.ts in: ${candidates.join(', ')}`)
}

function readDatabaseSource() {
  const candidates = [
    join(process.cwd(), 'src/database.ts'),
    join(process.cwd(), 'server/src/database.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next repository layout.
    }
  }

  throw new Error(`Unable to locate database.ts in: ${candidates.join(', ')}`)
}

describe('dbService Supabase REST timeout contract', () => {
  it('bounds fallback REST reads so task-list requests cannot hang indefinitely', () => {
    const source = readDbServiceSource()

    expect(source.includes("readPositiveIntEnv('SUPABASE_REST_QUERY_TIMEOUT_MS', 4000)")).toBe(true)
    expect(source.includes("readPositiveIntEnv('DB_DIRECT_QUERY_TIMEOUT_MS', 4000)")).toBe(true)
    expect(source.includes("readPositiveIntEnv('SUPABASE_REST_CIRCUIT_BREAKER_MS', 15000)")).toBe(true)
    expect(source.includes("readPositiveIntEnv('DB_DIRECT_QUERY_CIRCUIT_BREAKER_MS', 10000)")).toBe(true)
    expect(source.includes('type AbortablePromiseLike<T> = PromiseLike<T>')).toBe(true)
    expect(source.includes('async function withSupabaseRestTimeout<T>(query: AbortablePromiseLike<T>, label: string): Promise<T>')).toBe(true)
    expect(source.includes('async function withDirectQueryTimeout<T>(query: PromiseLike<T>, label: string): Promise<T>')).toBe(true)
    expect(source.includes('function observeTimedQuery<T>(')).toBe(true)
    expect(source.includes('isTimedOut: () => boolean')).toBe(true)
    expect(source.includes('controller.abort()')).toBe(true)
    expect(source.includes('query.abortSignal(controller.signal)')).toBe(true)
    expect(source.includes("observeTimedQuery(request, label, () => timedOut)")).toBe(true)
    expect(source.includes("observeTimedQuery(query, label, () => timedOut)")).toBe(true)
    expect(source.includes('dbService late database rejection after timeout')).toBe(true)
    expect(source.includes('dbService late database resolution after timeout')).toBe(true)
    expect(source.includes('return new Promise<T>(() => {})')).toBe(true)
    expect(source.includes('markSupabaseRestCircuitOpen()')).toBe(true)
    expect(source.includes('markDbDirectQueryCircuitOpen()')).toBe(true)
    expect(source.includes('Promise.race([observedQuery, timeout])')).toBe(true)
    expect(source.includes('async function loadTasksFromDirectDatabaseIgnoringCircuit')).toBe(false)
    expect(source.includes('dbService.getTasks last-resort direct read failed while direct DB circuit is open')).toBe(false)
    expect(source.includes("withDirectQueryTimeout(rawQuery(sql, [projectId]), 'dbService.getTasks direct query')")).toBe(true)
    expect(source.includes('dbService.getTasks skipped direct query because direct DB circuit is open')).toBe(true)
    expect(source.includes('withSupabaseRestTimeout(query, `dbService.getTasks REST page ${Math.floor(offset / pageSize) + 1}`)')).toBe(true)
    expect(source.includes("withSupabaseRestTimeout(supabase\n      .from('engineering_categories')")).toBe(true)
    expect(source.includes('withSupabaseRestTimeout(query, `dbService.executeSQL SELECT ${table}`)')).toBe(true)
    expect(source.includes('withSupabaseRestTimeout(insertQuery, `dbService.executeSQL INSERT ${table}`)')).toBe(true)
    expect(source.includes('withSupabaseRestTimeout(query.select(returningColumns), `dbService.executeSQL UPDATE ${table}`)')).toBe(true)
    expect(source.includes('withSupabaseRestTimeout(query, `dbService.executeSQL DELETE ${table}`)')).toBe(true)
  })

  it('configures pg-level direct query timeouts so timed-out reads release at the driver layer', () => {
    const source = readDatabaseSource()

    expect(source.includes("readPositiveIntEnv('DB_QUERY_TIMEOUT_MS', 4000)")).toBe(true)
    expect(source.includes("readPositiveIntEnv('DB_STATEMENT_TIMEOUT_MS', DB_QUERY_TIMEOUT_MS)")).toBe(true)
    expect(source.includes('query_timeout: DB_QUERY_TIMEOUT_MS')).toBe(true)
    expect(source.includes('statement_timeout: DB_STATEMENT_TIMEOUT_MS')).toBe(true)
  })
})
