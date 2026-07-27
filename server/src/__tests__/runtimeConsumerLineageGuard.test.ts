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
        import { publish } from './durationLearningRuntimePublicationService.js'

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

  it('allows only the Task 4 decision service to import the required runtime publication writer module', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-task-4-allowlist-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationAssetReviewDecisionService.ts'),
      `
        import {
          persistDurationLearningRuntimePublication,
          recordDurationLearningRuntimeImpact,
          promoteDurationLearningRuntimeCanary,
        } from './durationLearningRuntimePublicationService.js'

        export function decide() {
          return [
            persistDurationLearningRuntimePublication,
            recordDurationLearningRuntimeImpact,
            promoteDurationLearningRuntimeCanary,
          ]
        }
      `,
    )
    writeFileSync(
      join(servicesDir, 'durationAssetReviewQueueService.ts'),
      "import type { DurationLearningRuntimeScope } from './durationLearningRuntimePublicationService.js'\nexport type Scope = DurationLearningRuntimeScope\n",
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)

    expect(result.violations).toEqual([])
  })

  it('continues to block a different candidate or review service from importing that runtime writer module', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-task-4-other-review-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'differentDurationReviewService.ts'),
      "import { persist } from './durationLearningRuntimePublicationService.js'\nexport const bypass = persist\n",
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({ reason: 'candidate_review_direct_writer_import' }),
    ])
  })

  it('blocks an unauthorized runtime writer module imported by the Task 4 decision service', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-task-4-wrong-writer-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationAssetReviewDecisionService.ts'),
      "import { publish } from './otherRuntimePublicationService.js'\nexport const bypass = publish\n",
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({ reason: 'candidate_review_direct_writer_import' }),
    ])
  })

  it('uses syntax-aware import classification for comments, dollar bindings, and type-only imports', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-ast-imports-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationCandidateTypeOnlyService.ts'),
      `
        import type { WriterShape } from './otherRuntimePublicationService.js'
        import { type RuntimeScope, type RuntimeAssetKey as LocalAssetKey } from './durationLearningRuntimePublicationService.js'

        export type CandidateInput = WriterShape & { scope: RuntimeScope; key: LocalAssetKey }
      `,
    )
    writeFileSync(
      join(servicesDir, 'durationCandidateCommentedWriterService.ts'),
      `
        import { /* a value import cannot hide in a comment */ publish as $writer } from './otherRuntimePublicationService.js'

        export const bypass = $writer
      `,
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)
    const violationsByFile = new Map(result.violations.map((violation) => [violation.filePath, violation]))

    expect(violationsByFile.has(join(servicesDir, 'durationCandidateTypeOnlyService.ts'))).toBe(false)
    expect(violationsByFile.get(join(servicesDir, 'durationCandidateCommentedWriterService.ts'))).toEqual(
      expect.objectContaining({ reason: 'candidate_review_direct_writer_import' }),
    )
  })

  it('allows type-only re-exports while blocking runtime re-exports', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-type-re-export-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationCandidateTypeReExportService.ts'),
      `
        export type { WriterShape } from './otherRuntimePublicationService.js'
        export { type RuntimeScope, type RuntimeAssetKey as LocalAssetKey } from './durationLearningRuntimePublicationService.js'
      `,
    )
    writeFileSync(
      join(servicesDir, 'durationCandidateRuntimeReExportService.ts'),
      "export { publish } from './otherRuntimePublicationService.js'\n",
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)
    const violationsByFile = new Map(result.violations.map((violation) => [violation.filePath, violation]))

    expect(violationsByFile.has(join(servicesDir, 'durationCandidateTypeReExportService.ts'))).toBe(false)
    expect(violationsByFile.get(join(servicesDir, 'durationCandidateRuntimeReExportService.ts'))).toEqual(
      expect.objectContaining({ reason: 'candidate_review_direct_writer_import' }),
    )
  })

  it('allows only normalized approved named value imports in the Task 4 decision service', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-approved-names-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationAssetReviewDecisionService.ts'),
      `
        import {
          durationLearningRuntimePublicationScopesMatch,
          executeDurationLearningRuntimePublicationQuery,
          persistDurationLearningRuntimePublication,
          promoteDurationLearningRuntimeCanary,
          recordDurationLearningRuntimeImpact,
          type DurationLearningRuntimePublicationQueryExec,
        } from './nested/../durationLearningRuntimePublicationService.js'

        export const approved = [
          durationLearningRuntimePublicationScopesMatch,
          executeDurationLearningRuntimePublicationQuery,
          persistDurationLearningRuntimePublication,
          promoteDurationLearningRuntimeCanary,
          recordDurationLearningRuntimeImpact,
        ] as const
        export type QueryExec = DurationLearningRuntimePublicationQueryExec
      `,
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)

    expect(result.violations).toEqual([])
  })

  it('blocks unauthorized value import forms and names even in the Task 4 decision service', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-unapproved-forms-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationAssetReviewDecisionService.ts'),
      `
        import defaultWriter from './durationLearningRuntimePublicationService.js'
        import * as namespaceWriter from './durationLearningRuntimePublicationService.js'
        import { unexpectedWriter } from './durationLearningRuntimePublicationService.js'

        export const bypass = [defaultWriter, namespaceWriter, unexpectedWriter]
      `,
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)

    expect(result.violations).toHaveLength(3)
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'candidate_review_direct_writer_import' }),
    ]))
  })

  it('blocks side-effect imports, re-exports, runtime require calls, and unproven dynamic module loads', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-dynamic-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationCandidateSideEffectService.ts'),
      "import './otherRuntimePublicationService.js'\nexport const sideEffect = true\n",
    )
    writeFileSync(
      join(servicesDir, 'durationCandidateReExportService.ts'),
      "export { publish } from './otherRuntimePublicationService.js'\nexport * from './durationLearningRuntimePublicationService.js'\n",
    )
    writeFileSync(
      join(servicesDir, 'durationAssetReviewDecisionService.ts'),
      "export const literal = () => import(`./durationLearningRuntimePublicationService.js`)\n",
    )
    writeFileSync(
      join(servicesDir, 'durationCandidateRequireWriterService.ts'),
      "const writer = require('./otherRuntimePublicationService.js')\nexport const bypass = writer\n",
    )
    writeFileSync(
      join(servicesDir, 'durationCandidateComputedDynamicService.ts'),
      "const writerPath = './otherRuntimePublicationService.js'\nexport const computed = () => import(writerPath)\n",
    )
    writeFileSync(
      join(servicesDir, 'durationCandidateComputedRequireService.ts'),
      "const writerPath = './otherRuntimePublicationService.js'\nexport const computed = () => require(writerPath)\n",
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)
    const reasons = result.violations.map((violation) => violation.reason)

    expect(reasons.filter((reason) => reason === 'candidate_review_direct_writer_import')).toHaveLength(5)
    expect(reasons.filter((reason) => reason === 'candidate_review_unproven_dynamic_import')).toHaveLength(2)
  })

  it('fails closed when a candidate or review service introduces an indirect CommonJS loader', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-consumer-lineage-commonjs-loader-'))
    const servicesDir = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesDir, { recursive: true })

    writeFileSync(
      join(servicesDir, 'durationCandidateCommonJsLoaderService.ts'),
      `
        import { createRequire } from 'node:module'

        const load = createRequire(import.meta.url)
        const requireAlias = require
        export const viaCreateRequire = () => load('./otherRuntimePublicationService.js')
        export const viaRequireAlias = () => requireAlias('./otherRuntimePublicationService.js')
        export const viaModuleRequire = () => module.require('./otherRuntimePublicationService.js')
        export const viaDynamicNodeModule = async () => {
          const { createRequire: resolveLoader } = await import('node:module')
          return resolveLoader(import.meta.url)('./otherRuntimePublicationService.js')
        }
      `,
    )

    const result = evaluateRuntimeConsumerLineageGuard(fixtureRoot)
    const reasons = result.violations.map((violation) => violation.reason)

    expect(reasons.filter((reason) => reason === 'candidate_review_unproven_commonjs_loader')).toHaveLength(3)
    expect(reasons.filter((reason) => reason === 'candidate_review_direct_writer_import')).toHaveLength(4)
  })

  it('keeps the current server source free of direct observation writes outside the helper', async () => {
    const { evaluateRuntimeConsumerLineageGuard } = await import(pathToFileURL(guardPath).href)

    const result = evaluateRuntimeConsumerLineageGuard(serverRoot)

    expect(result.violations).toEqual([])
  })
})
