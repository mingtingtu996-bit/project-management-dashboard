import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : join(process.cwd(), 'server'))
const guardPath = resolve(serverRoot, 'scripts', 'guard-runtime-consumer-lineage.mjs')

describe('runtime consumer lineage guard', () => {
  it('allows the controlled duration runtime consumer observation helper to write observations', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationRuntimeConsumerObservationService.ts'),
      `
        export async function record(queryExec: (sql: string) => Promise<unknown>) {
          await queryExec(\`insert into public.runtime_consumer_observations (asset_key) values ($1)\`)
        }
      `,
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)

    expect(result.violations).toEqual([])
  })

  it('blocks direct runtime consumer observation inserts outside the helper', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-bad-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationCandidateReviewService.ts'),
      `
        export async function bypass(queryExec: (sql: string) => Promise<unknown>) {
          await queryExec(\`
            insert into public.runtime_consumer_observations (asset_key)
            values ($1)
          \`)
        }
      `,
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({
        reason: 'runtime_consumer_observation_direct_sql_write_outside_helper',
      }),
    ])
  })

  it('blocks schema-less direct runtime consumer observation writes outside the helper', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-schema-less-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationCandidateReviewService.ts'),
      `
        export async function bypass(queryExec: (sql: string) => Promise<unknown>) {
          await queryExec(\`
            insert into runtime_consumer_observations (asset_key)
            values ($1)
          \`)
        }
      `,
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({
        reason: 'runtime_consumer_observation_direct_sql_write_outside_helper',
      }),
    ])
  })

  it('blocks Supabase runtime consumer observation mutations outside the helper', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-supabase-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationCandidateReviewService.ts'),
      `
        export async function bypass(client: { from: (table: string) => { insert: (row: unknown) => unknown } }) {
          await client.from('runtime_consumer_observations').insert({ asset_key: 'x' })
        }
      `,
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({
        reason: 'runtime_consumer_observation_supabase_mutation_outside_helper',
      }),
    ])
  })

  it('blocks candidate and review services from importing runtime writers directly', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-writer-import-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 't2RhythmTaskWindowAnnotationReviewPackageService.ts'),
      `
        import { publish } from './t2RhythmScheduleRuntimePublicationService.js'

        export function bypass() {
          return publish
        }
      `,
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({
        reason: 'candidate_review_direct_writer_import',
      }),
    ])
  })

  it('keeps the current server source free of direct observation writes outside the helper', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)

    const result = evaluateRuntimeConsumerLineageGuard(serverRoot)

    expect(result.violations).toEqual([])
  })
})
