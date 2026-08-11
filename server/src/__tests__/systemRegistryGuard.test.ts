import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : join(process.cwd(), 'server'))
const guardPath = resolve(serverRoot, 'scripts', 'guard-system-registry.mjs')

type DeclaredRegistryEntry = {
  kind: string
  id: string
  architectureUnit: string
  runtimeScope: string
  assignmentReason: string
}

function writeFixtureRegistry(root: string, content: unknown) {
  const registryDir = join(root, 'server', 'src', 'registry')
  mkdirSync(registryDir, { recursive: true })
  writeFileSync(join(registryDir, 'system-domain-registry.json'), `${JSON.stringify(content, null, 2)}\n`)
}

describe('system registry guard', () => {
  it('keeps every P0-P7 default-master-plan and duration member registered', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)
    const result = evaluateSystemRegistryGuard(serverRoot)
    const scopedIds = new Set([
      'defaultMasterPlanVisibilityLearningJob',
      'defaultMasterPlanAssetConsumptionService',
      'defaultMasterPlanExecutableAssemblyService',
      'defaultMasterPlanVisibilityFeedbackService',
      'defaultMasterPlanVisibilityLearningService',
      'defaultMasterPlanVisibilityService',
      'durationAssetBaselineRevisionBridgeService',
      'durationAssetConsumptionReceiptService',
      'durationAssetDownstreamConsumptionService',
      'durationAssetRuntimeContractService',
      'durationContextPolicyLearningCheckpointService',
      'durationContextPolicyRuntimePublicationBridgeService',
      'durationLearningRuntimeLifecycleService',
      'taskPlanDrilldownPolicyService',
      'taskPlanDrilldownRhythmService',
      'wizardPostCommitDerivationRecoveryService',
    ])
    const declared = new Set(result.registry.declaredEntries.map((entry: DeclaredRegistryEntry) => entry.id))

    expect([...scopedIds].filter((id) => !declared.has(id))).toEqual([])
    expect(result.unknownViolations.filter((entry: { id: string }) => scopedIds.has(entry.id))).toEqual([])
  })

  it('blocks route/service/job entries that exist in code but are not assigned in the domain registry', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-system-registry-unknown-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'routes'), { recursive: true })
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'jobs'), { recursive: true })

    writeFileSync(join(srcRoot, 'index.ts'), [
      "import knownRouter from './routes/known.js'",
      "import shadowRouter from './routes/shadow.js'",
      "const app = { use: (..._args: unknown[]) => undefined }",
      "app.use('/api/known', knownRouter)",
      "app.use('/api/shadow', shadowRouter)",
    ].join('\n'))
    writeFileSync(join(srcRoot, 'scheduler.ts'), "import { knownJob } from './jobs/knownJob.js'\nvoid knownJob\n")
    writeFileSync(join(srcRoot, 'routes', 'known.ts'), 'export default {}\n')
    writeFileSync(join(srcRoot, 'routes', 'shadow.ts'), 'export default {}\n')
    writeFileSync(join(srcRoot, 'services', 'knownService.ts'), 'export const knownService = {}\n')
    writeFileSync(join(srcRoot, 'services', 'shadowService.ts'), 'export const shadowService = {}\n')
    writeFileSync(join(srcRoot, 'jobs', 'knownJob.ts'), 'export const knownJob = {}\n')
    writeFileSync(join(srcRoot, 'jobs', 'shadowJob.ts'), 'export const shadowJob = {}\n')
    writeFixtureRegistry(fixtureRoot, {
      entries: [
        { kind: 'route', id: 'known', architectureUnit: '主执行环：建模', runtimeScope: 'business_core' },
        { kind: 'service', id: 'knownService', architectureUnit: '主执行环：建模', runtimeScope: 'business_core' },
        { kind: 'job', id: 'knownJob', architectureUnit: '学习治理环', runtimeScope: 'governance' },
      ],
      deprecations: [],
    })

    const result = evaluateSystemRegistryGuard(fixtureRoot)

    expect(result.unknownViolations).toEqual([
      expect.objectContaining({ kind: 'job', id: 'shadowJob' }),
      expect.objectContaining({ kind: 'route', id: 'shadow' }),
      expect.objectContaining({ kind: 'service', id: 'shadowService' }),
    ])
  })

  it('assigns one ownership record per route module even when the router is mounted more than once', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-system-registry-route-identity-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'routes'), { recursive: true })
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'jobs'), { recursive: true })

    writeFileSync(join(srcRoot, 'index.ts'), [
      "import adminRouter from './routes/admin.js'",
      "const app = { use: (..._args: unknown[]) => undefined }",
      "app.use('/api/admin/business-types', adminRouter)",
      "app.use('/api/admin/business-type-rules', adminRouter)",
    ].join('\n'))
    writeFileSync(join(srcRoot, 'routes', 'admin.ts'), 'export default {}\n')
    writeFixtureRegistry(fixtureRoot, {
      entries: [
        { kind: 'route', id: 'admin', architectureUnit: '\u5b66\u4e60\u6cbb\u7406\u73af', runtimeScope: 'governance' },
      ],
      deprecation_registry: [],
    })

    const result = evaluateSystemRegistryGuard(fixtureRoot)

    expect(result.registry.entries.filter((entry: { kind: string }) => entry.kind === 'route')).toHaveLength(1)
    expect(result.unknownViolations).toEqual([])
    expect(result.staleViolations).toEqual([])
  })

  it('rejects duplicate ownership declarations for the same stable registry key', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-system-registry-duplicate-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'routes'), { recursive: true })
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'jobs'), { recursive: true })
    writeFileSync(join(srcRoot, 'index.ts'), '')
    writeFileSync(join(srcRoot, 'jobs', 'learningJob.ts'), 'export const learningJob = {}\n')
    writeFixtureRegistry(fixtureRoot, {
      entries: [
        { kind: 'job', id: 'learningJob', architectureUnit: '\u5b66\u4e60\u6cbb\u7406\u73af', runtimeScope: 'governance' },
        { kind: 'job', id: 'learningJob', architectureUnit: '\u5b66\u4e60\u6cbb\u7406\u73af', runtimeScope: 'business_core', production_readiness_source: 'fixture' },
      ],
      deprecation_registry: [],
    })

    const result = evaluateSystemRegistryGuard(fixtureRoot)

    expect(result.registryValidationViolations).toContainEqual(expect.objectContaining({
      reason: 'duplicate_registry_key',
      key: 'job:learningJob',
    }))
  })

  it('includes metric keys and migration files in the generated inventory diff', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-system-registry-metric-migration-'))
    const serverFixtureRoot = join(fixtureRoot, 'server')
    const srcRoot = join(serverFixtureRoot, 'src')
    mkdirSync(join(srcRoot, 'routes'), { recursive: true })
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'jobs'), { recursive: true })
    mkdirSync(join(serverFixtureRoot, 'migrations'), { recursive: true })
    writeFileSync(join(srcRoot, 'index.ts'), '')
    writeFileSync(join(srcRoot, 'services', 'metricRegistryService.ts'), [
      "export const METRIC_REGISTRY = [",
      "  { metricKey: 'schedule_health' },",
      "]",
    ].join('\n'))
    writeFileSync(join(serverFixtureRoot, 'migrations', '001_initial_schema.sql'), 'SELECT 1;\n')
    writeFixtureRegistry(fixtureRoot, {
      entries: [
        { kind: 'service', id: 'metricRegistryService', architectureUnit: '\u5b66\u4e60\u6cbb\u7406\u73af', runtimeScope: 'governance' },
      ],
      deprecation_registry: [],
    })

    const result = evaluateSystemRegistryGuard(fixtureRoot)

    expect(result.unknownViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'metric', id: 'schedule_health' }),
      expect.objectContaining({ kind: 'migration', id: '001_initial_schema' }),
    ]))
  })

  it('exposes a reproducible registry diff command with every authoritative input source', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)
    const packageJson = JSON.parse(readFileSync(join(serverRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const result = evaluateSystemRegistryGuard(serverRoot)

    expect(packageJson.scripts?.['registry:system:diff']).toContain('--print-registry-diff')
    expect(result.registry.generatedFrom).toEqual(expect.arrayContaining([
      'server/src/index.ts',
      'server/src/services/metricRegistryService.ts',
      'server/migrations/*.sql',
    ]))
  })

  it('reconciles identical declarations without losing reviewed ownership assignments', async () => {
    const { buildReconciledSystemRegistry } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-system-registry-reconcile-'))
    const serverFixtureRoot = join(fixtureRoot, 'server')
    const srcRoot = join(serverFixtureRoot, 'src')
    mkdirSync(join(srcRoot, 'routes'), { recursive: true })
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'jobs'), { recursive: true })
    mkdirSync(join(serverFixtureRoot, 'migrations'), { recursive: true })
    writeFileSync(join(srcRoot, 'index.ts'), [
      "import adminRouter from './routes/admin.js'",
      "const app = { use: (..._args: unknown[]) => undefined }",
      "app.use('/api/admin/business-types', adminRouter)",
      "app.use('/api/admin/business-type-rules', adminRouter)",
    ].join('\n'))
    writeFileSync(join(srcRoot, 'routes', 'admin.ts'), 'export default {}\n')
    writeFileSync(join(srcRoot, 'services', 'metricRegistryService.ts'), [
      "export const METRIC_REGISTRY = [",
      "  { metricKey: 'schedule_health' },",
      "]",
    ].join('\n'))
    writeFileSync(join(serverFixtureRoot, 'migrations', '001_initial_schema.sql'), 'SELECT 1;\n')
    const reviewedAdminEntry = {
      kind: 'route',
      id: 'admin',
      architectureUnit: '\u5b66\u4e60\u6cbb\u7406\u73af',
      runtimeScope: 'governance',
      assignmentReason: 'reviewed_admin_governance_surface',
    }
    writeFixtureRegistry(fixtureRoot, {
      generatedFrom: ['stale-input'],
      entries: [reviewedAdminEntry, reviewedAdminEntry],
      deprecation_registry: [],
    })

    const reconciled = buildReconciledSystemRegistry(fixtureRoot)

    expect(reconciled.entries.filter((entry: { kind: string; id: string }) => (
      entry.kind === 'route' && entry.id === 'admin'
    ))).toEqual([reviewedAdminEntry])
    expect(reconciled.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'metric', id: 'schedule_health' }),
      expect.objectContaining({ kind: 'migration', id: '001_initial_schema' }),
    ]))
    expect(reconciled.generatedFrom).toEqual(expect.arrayContaining([
      'server/src/services/metricRegistryService.ts',
      'server/migrations/*.sql',
    ]))
  })

  it('blocks live consumers of deprecated route and import surfaces', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-system-registry-deprecated-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'routes'), { recursive: true })
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'jobs'), { recursive: true })

    writeFileSync(join(srcRoot, 'index.ts'), [
      "import scopeDimensionsRouter from './routes/scope-dimensions.js'",
      "const app = { use: (..._args: unknown[]) => undefined }",
      "app.use('/api/scope-dimensions', scopeDimensionsRouter)",
    ].join('\n'))
    writeFileSync(join(srcRoot, 'scheduler.ts'), '')
    writeFileSync(join(srcRoot, 'routes', 'scope-dimensions.ts'), 'export default {}\n')
    writeFileSync(join(srcRoot, 'services', 'legacyScopeConsumerService.ts'), "import '../routes/scope-dimensions.js'\n")
    writeFixtureRegistry(fixtureRoot, {
      entries: [
        { kind: 'route', id: 'scope-dimensions', architectureUnit: '主执行环：建模', runtimeScope: 'business_core' },
        { kind: 'service', id: 'legacyScopeConsumerService', architectureUnit: '主执行环：建模', runtimeScope: 'business_core' },
      ],
      deprecation_registry: [
        {
          deprecated_surface: 'legacy scope dimensions route',
          replacement_surface: 'range-tree / engineering objects',
          forbidden_import_or_route_pattern: 'scope-dimensions',
          deletion_migration_ref: 'v1.4.23.1 C-03',
          scan_test_ref: 'systemRegistryGuard',
        },
      ],
    })

    const result = evaluateSystemRegistryGuard(fixtureRoot)

    expect(result.deprecationViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ deprecatedSurface: 'legacy scope dimensions route', kind: 'route' }),
      expect.objectContaining({ deprecatedSurface: 'legacy scope dimensions route', kind: 'import' }),
    ]))
  })

  it('requires business-core registry entries to carry the v1.4.23.1-A production readiness source', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-system-registry-readiness-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'routes'), { recursive: true })
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'jobs'), { recursive: true })

    writeFileSync(join(srcRoot, 'index.ts'), [
      "import dashboardRouter from './routes/dashboard.js'",
      "const app = { use: (..._args: unknown[]) => undefined }",
      "app.use('/api/dashboard', dashboardRouter)",
    ].join('\n'))
    writeFileSync(join(srcRoot, 'scheduler.ts'), '')
    writeFileSync(join(srcRoot, 'routes', 'dashboard.ts'), 'export default {}\n')
    writeFixtureRegistry(fixtureRoot, {
      entries: [
        {
          kind: 'route',
          id: 'dashboard',
          architectureUnit: '主执行环：描述分析',
          runtimeScope: 'business_core',
        },
      ],
      deprecation_registry: [],
    })

    const result = evaluateSystemRegistryGuard(fixtureRoot)

    expect(result.registryValidationViolations).toEqual([
      expect.objectContaining({
        reason: 'missing_production_readiness_source',
        entry: expect.objectContaining({ kind: 'route', id: 'dashboard' }),
      }),
    ])
  })

  it('keeps current route/service/job entries assigned and deprecated surfaces disconnected', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)

    const result = evaluateSystemRegistryGuard(serverRoot)

    expect(result.unknownViolations).toEqual([])
    expect(result.deprecationViolations).toEqual([])
    expect(result.registry.deprecations.every((deprecation: {
      deprecated_surface?: string
      replacement_surface?: string
      forbidden_import_or_route_pattern?: string
      deletion_migration_ref?: string
      scan_test_ref?: string
    }) => (
      deprecation.deprecated_surface
      && deprecation.replacement_surface
      && deprecation.forbidden_import_or_route_pattern
      && deprecation.deletion_migration_ref
      && deprecation.scan_test_ref
    ))).toBe(true)
    expect(result.registry.declaredEntries
      .filter((entry: DeclaredRegistryEntry) => entry.runtimeScope === 'business_core')
      .every((entry: DeclaredRegistryEntry & { production_readiness_source?: unknown }) => entry.production_readiness_source)).toBe(true)
    expect(result.registry.entries.some((entry: { kind: string; id: string }) => entry.kind === 'route' && entry.id === 'duration-suggestions')).toBe(true)
    expect(result.registry.entries.some((entry: { kind: string; id: string }) => entry.kind === 'route' && entry.id === 'auth')).toBe(true)
    expect(result.registry.entries.some((entry: { kind: string; id: string }) => entry.kind === 'route' && entry.id === 'auth-register')).toBe(true)
    expect(result.registry.entries.some((entry: { kind: string; id: string }) => entry.kind === 'service' && entry.id === 'taskDurationForecastService')).toBe(true)
    expect(result.registry.entries.some((entry: { kind: string; id: string }) => entry.kind === 'service' && entry.id === 'durationContextSampleReadModelService')).toBe(true)
    expect(result.registry.entries.some((entry: { kind: string; id: string }) => entry.kind === 'service' && entry.id === 'runtimeAbortContext')).toBe(true)
    expect(result.registry.entries.some((entry: { kind: string; id: string }) => entry.kind === 'job' && entry.id === 'durationContextPolicyLearningJob')).toBe(true)
  })

  it('keeps construction organization fact assembly and selector out of the modeling bucket', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)

    const result = evaluateSystemRegistryGuard(serverRoot)
    const serviceEntries = new Map<string, DeclaredRegistryEntry>(
      result.registry.declaredEntries
        .filter((entry: DeclaredRegistryEntry) => entry.kind === 'service')
        .map((entry: DeclaredRegistryEntry) => [entry.id, entry]),
    )

    expect(serviceEntries.get('constructionOrganizationScenarioSelector')).toEqual(expect.objectContaining({
      architectureUnit: '预测桥',
      runtimeScope: 'business_core',
    }))
    expect(serviceEntries.get('constructionOrganizationScenarioSelector')?.assignmentReason).toContain('L4')
    expect(serviceEntries.get('constructionOrganizationScenarioSelector')?.assignmentReason).toContain('writesTaskDependencies=false')

    expect(serviceEntries.get('scopeOrganizationFactsService')).toEqual(expect.objectContaining({
      architectureUnit: '预测桥',
      runtimeScope: 'business_core',
    }))
    expect(serviceEntries.get('scopeOrganizationFactsService')?.assignmentReason).toContain('L3')
    expect(serviceEntries.get('scopeOrganizationFactsService')?.assignmentReason).toContain('L0')
  })

  it('keeps duration accuracy diagnostics with the prediction bridge read surface', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)

    const result = evaluateSystemRegistryGuard(serverRoot)
    const routeEntries = new Map<string, DeclaredRegistryEntry>(
      result.registry.declaredEntries
        .filter((entry: DeclaredRegistryEntry) => entry.kind === 'route')
        .map((entry: DeclaredRegistryEntry) => [entry.id, entry]),
    )

    expect(routeEntries.get('duration-accuracy')).toEqual(expect.objectContaining({
      architectureUnit: '预测桥',
      runtimeScope: 'business_core',
    }))
    expect(routeEntries.get('duration-accuracy')?.assignmentReason).toContain('five-engine duration accuracy read endpoint')
    expect(routeEntries.get('duration-accuracy')?.assignmentReason).toContain('does not mutate learning governance candidates')
  })

  it('registers every duration asset review workstream surface without environment readiness claims', async () => {
    const { evaluateSystemRegistryGuard } = await import(pathToFileURL(guardPath).href)
    const workspaceRoot = resolve(serverRoot, '..')
    const result = evaluateSystemRegistryGuard(serverRoot)
    const declaredEntries = new Map<string, DeclaredRegistryEntry & { production_readiness_source?: string }>(
      result.registry.declaredEntries.map((entry: DeclaredRegistryEntry & { production_readiness_source?: string }) => [
        `${entry.kind}:${entry.id}`,
        entry,
      ]),
    )
    const ownedBackendSurfaces = [
      {
        key: 'migration:325_duration_asset_review_queue',
        sourcePath: 'server/migrations/325_duration_asset_review_queue.sql',
      },
      {
        key: 'service:durationAssetReviewQueueService',
        sourcePath: 'server/src/services/durationAssetReviewQueueService.ts',
      },
      {
        key: 'service:durationAssetReviewDecisionService',
        sourcePath: 'server/src/services/durationAssetReviewDecisionService.ts',
      },
      {
        key: 'route:duration-assets',
        sourcePath: 'server/src/routes/duration-assets.ts',
      },
    ] as const
    const supportingSurfaces = [
      'client/src/services/durationAssetsApi.ts',
      'client/src/pages/DurationAssetsAdmin.tsx',
      'project-testing/tools/verify-duration-assets-admin-ui.mjs',
    ] as const

    for (const { key, sourcePath } of ownedBackendSurfaces) {
      const entry = declaredEntries.get(key)
      expect(existsSync(resolve(workspaceRoot, sourcePath)), `${sourcePath} must exist`).toBe(true)
      expect(entry, `${key} must be registered`).toEqual(expect.objectContaining({
        architectureUnit: '学习治理环',
        runtimeScope: 'governance',
        assignmentReason: expect.stringContaining(sourcePath),
      }))
      expect(entry, `${key} must not claim environment readiness`).not.toHaveProperty('production_readiness_source')
    }

    const routeOwner = declaredEntries.get('route:duration-assets')
    for (const sourcePath of supportingSurfaces) {
      expect(existsSync(resolve(workspaceRoot, sourcePath)), `${sourcePath} must exist`).toBe(true)
      expect(routeOwner?.assignmentReason).toContain(sourcePath)
    }
  })
})
