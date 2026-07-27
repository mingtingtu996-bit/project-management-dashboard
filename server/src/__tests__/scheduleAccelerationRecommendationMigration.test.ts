import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationName = '331_schedule_acceleration_recommendations.sql'
const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readOptional(...segments: string[]) {
  const path = resolve(serverRoot, ...segments)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function normalizedSql(...segments: string[]) {
  return readOptional(...segments).replace(/\s+/g, ' ').trim().toLowerCase()
}

describe('schedule acceleration recommendation migration', () => {
  it('stores immutable recommendation and operation snapshots with content hashes', () => {
    const sql = normalizedSql('migrations', migrationName)

    expect(sql).toContain('create table if not exists public.schedule_acceleration_recommendations')
    expect(sql).toContain("recommendation jsonb not null check (jsonb_typeof(recommendation) = 'object')")
    expect(sql).toContain("operations jsonb not null check (jsonb_typeof(operations) = 'array')")
    expect(sql).toContain("recommendation_hash text not null check (recommendation_hash ~ '^[a-f0-9]{64}$')")
    expect(sql).toContain("operations_hash text not null check (operations_hash ~ '^[a-f0-9]{64}$')")
    expect(sql).toContain('unique (project_id, id, recommendation_hash, operations_hash)')
    expect(sql).toContain('create trigger schedule_acceleration_recommendations_immutable_trigger')
    expect(sql).toContain('before update on public.schedule_acceleration_recommendations')
    expect(sql).not.toContain('before update or delete on public.schedule_acceleration_recommendations')
    expect(sql).toContain("raise exception 'schedule acceleration recommendations are immutable'")
  })

  it('binds task commits to the exact recommendation in the same project', () => {
    const sql = normalizedSql('migrations', migrationName)

    expect(sql).toContain('add column if not exists recommendation_id uuid')
    expect(sql).toContain('add column if not exists recommendation_hash text')
    expect(sql).toContain('add column if not exists operations_hash text')
    expect(sql).toContain('constraint task_commit_requests_schedule_acceleration_binding_complete')
    expect(sql).toContain('recommendation_id is null')
    expect(sql).toContain('recommendation_hash is null')
    expect(sql).toContain('operations_hash is null')
    expect(sql).toContain('foreign key ( project_id, recommendation_id, recommendation_hash, operations_hash )')
    expect(sql).toContain('references public.schedule_acceleration_recommendations (project_id, id, recommendation_hash, operations_hash)')
    expect(sql).toContain('on update restrict on delete cascade')
  })

  it('keeps recommendation rows private and append-only for the runtime role', () => {
    const sql = normalizedSql('migrations', migrationName)

    expect(sql).toContain('alter table public.schedule_acceleration_recommendations enable row level security')
    expect(sql).toContain('alter table public.schedule_acceleration_recommendations force row level security')
    expect(sql).toContain('revoke all on table public.schedule_acceleration_recommendations from public, anon, authenticated')
    expect(sql).toContain('grant select, insert on table public.schedule_acceleration_recommendations to workbuddy_runtime')
    expect(sql).not.toContain('grant select, insert, update')
    expect(sql).not.toContain('grant select, insert, delete')
    expect(sql).toContain('for select to workbuddy_runtime')
    expect(sql).toContain('for insert to workbuddy_runtime')
  })

  it('rolls back the binding before removing the immutable recommendation store', () => {
    const sql = normalizedSql('migrations', 'rollback', migrationName)
    const dropBinding = sql.indexOf('drop constraint if exists task_commit_requests_schedule_acceleration_recommendation_fk')
    const dropColumns = sql.indexOf('drop column if exists recommendation_id')
    const dropTable = sql.indexOf('drop table if exists public.schedule_acceleration_recommendations')

    expect(dropBinding).toBeGreaterThanOrEqual(0)
    expect(dropColumns).toBeGreaterThan(dropBinding)
    expect(sql).toContain('drop column if exists recommendation_hash')
    expect(sql).toContain('drop column if exists operations_hash')
    expect(sql).toContain('drop trigger if exists schedule_acceleration_recommendations_immutable_trigger on public.schedule_acceleration_recommendations')
    expect(sql).toContain('drop function if exists workbuddy_private.reject_schedule_acceleration_recommendation_mutation()')
    expect(dropTable).toBeGreaterThan(dropColumns)
    expect(sql).not.toContain('drop table if exists public.task_commit_requests')
  })
})
