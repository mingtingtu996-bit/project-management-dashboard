import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : join(process.cwd(), 'server'))
const guardPath = resolve(serverRoot, 'scripts', 'guard-architecture-boundaries.mjs')

describe('architecture boundary guard', () => {
  it('blocks service-to-route imports while allowing the composition root to register routes', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-arch-boundary-'))
    const srcRoot = join(fixtureRoot, 'src')
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'routes'), { recursive: true })

    writeFileSync(join(srcRoot, 'index.ts'), "import projectsRouter from './routes/projects.js'\nvoid projectsRouter\n")
    writeFileSync(join(srcRoot, 'routes', 'projects.ts'), 'export default {}\n')
    writeFileSync(join(srcRoot, 'services', 'badService.ts'), "import { helper } from '../routes/projects.js'\nvoid helper\n")

    const result = evaluateArchitectureBoundaryGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({
        importerRole: 'services',
        targetRole: 'routes',
        importPath: '../routes/projects.js',
      }),
    ])
  })

  it('blocks registered architecture units from importing disallowed downstream units', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-arch-matrix-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'registry'), { recursive: true })

    writeFileSync(
      join(srcRoot, 'services', 'learningPolicyService.ts'),
      "import { buildForecast } from './forecastBridgeService.js'\nvoid buildForecast\n",
    )
    writeFileSync(join(srcRoot, 'services', 'forecastBridgeService.ts'), 'export const buildForecast = {}\n')
    writeFileSync(join(srcRoot, 'registry', 'system-domain-registry.json'), `${JSON.stringify({
      entries: [
        {
          kind: 'service',
          id: 'learningPolicyService',
          architectureUnit: '学习治理环',
          runtimeScope: 'governance',
        },
        {
          kind: 'service',
          id: 'forecastBridgeService',
          architectureUnit: '预测桥',
          runtimeScope: 'business_core',
        },
      ],
      deprecations: [],
    }, null, 2)}\n`)

    const result = evaluateArchitectureBoundaryGuard(fixtureRoot)

    expect(result.architectureUnitViolations).toEqual([
      expect.objectContaining({
        reason: 'disallowed_architecture_unit_import',
        importerArchitectureUnit: '学习治理环',
        targetArchitectureUnit: '预测桥',
        importPath: './forecastBridgeService.js',
      }),
    ])
  })

  it('uses the registry architecture boundary matrix for disallowed imports', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-arch-registry-matrix-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'registry'), { recursive: true })

    writeFileSync(
      join(srcRoot, 'services', 'customGovernanceService.ts'),
      "import { consumeRuntime } from './customRuntimeService.js'\nvoid consumeRuntime\n",
    )
    writeFileSync(join(srcRoot, 'services', 'customRuntimeService.ts'), 'export const consumeRuntime = {}\n')
    writeFileSync(join(srcRoot, 'registry', 'system-domain-registry.json'), `${JSON.stringify({
      entries: [
        {
          kind: 'service',
          id: 'customGovernanceService',
          architectureUnit: 'Custom Governance',
          runtimeScope: 'governance',
        },
        {
          kind: 'service',
          id: 'customRuntimeService',
          architectureUnit: 'Custom Runtime',
          runtimeScope: 'business_core',
        },
      ],
      architectureBoundaryMatrix: {
        disallowedImports: [
          {
            importerArchitectureUnit: 'Custom Governance',
            targetArchitectureUnit: 'Custom Runtime',
            reason: 'custom_registry_matrix_policy',
          },
        ],
      },
      deprecations: [],
    }, null, 2)}\n`)

    const result = evaluateArchitectureBoundaryGuard(fixtureRoot)

    expect(result.architectureUnitViolations).toEqual([
      expect.objectContaining({
        importerArchitectureUnit: 'Custom Governance',
        targetArchitectureUnit: 'Custom Runtime',
        importPath: './customRuntimeService.js',
        policyReason: 'custom_registry_matrix_policy',
      }),
    ])
  })

  it('blocks disallowed architecture imports expressed as dynamic imports', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-arch-dynamic-import-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'registry'), { recursive: true })

    writeFileSync(
      join(srcRoot, 'services', 'platformService.ts'),
      "export async function run() { return import('./businessService.js') }\n",
    )
    writeFileSync(join(srcRoot, 'services', 'businessService.ts'), 'export const execute = {}\n')
    writeFileSync(join(srcRoot, 'registry', 'system-domain-registry.json'), `${JSON.stringify({
      entries: [
        {
          kind: 'service',
          id: 'platformService',
          architectureUnit: 'Platform Foundation',
          runtimeScope: 'platform_foundation',
        },
        {
          kind: 'service',
          id: 'businessService',
          architectureUnit: 'Business Core',
          runtimeScope: 'business_core',
        },
      ],
      architectureBoundaryMatrix: {
        disallowedImports: [
          {
            importerRuntimeScope: 'platform_foundation',
            targetRuntimeScope: 'business_core',
            reason: 'platform_foundation_must_not_dynamically_import_business_core',
          },
        ],
      },
      deprecations: [],
    }, null, 2)}\n`)

    const result = evaluateArchitectureBoundaryGuard(fixtureRoot)

    expect(result.architectureUnitViolations).toEqual([
      expect.objectContaining({
        importerRuntimeScope: 'platform_foundation',
        targetRuntimeScope: 'business_core',
        importPath: './businessService.js',
        policyReason: 'platform_foundation_must_not_dynamically_import_business_core',
      }),
    ])
  })

  it('uses runtime-scope matrix rules to block business-core imports from commercial foundation', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-arch-runtime-scope-matrix-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'registry'), { recursive: true })

    writeFileSync(
      join(srcRoot, 'services', 'projectExecutionSummaryService.ts'),
      "import { canExportReport } from './commercialFoundationService.js'\nvoid canExportReport\n",
    )
    writeFileSync(join(srcRoot, 'services', 'commercialFoundationService.ts'), 'export const canExportReport = {}\n')
    writeFileSync(join(srcRoot, 'registry', 'system-domain-registry.json'), `${JSON.stringify({
      entries: [
        {
          kind: 'service',
          id: 'projectExecutionSummaryService',
          architectureUnit: '主执行环：描述分析',
          runtimeScope: 'business_core',
        },
        {
          kind: 'service',
          id: 'commercialFoundationService',
          architectureUnit: '底座：组织权限',
          runtimeScope: 'commercial_foundation',
        },
      ],
      architectureBoundaryMatrix: {
        disallowedImports: [
          {
            importerRuntimeScope: 'business_core',
            importerKinds: ['service', 'job'],
            targetRuntimeScope: 'commercial_foundation',
            reason: 'business_core_services_and_jobs_must_not_depend_on_commercial_foundation',
          },
        ],
      },
      deprecation_registry: [],
    }, null, 2)}\n`)

    const result = evaluateArchitectureBoundaryGuard(fixtureRoot)

    expect(result.architectureUnitViolations).toEqual([
      expect.objectContaining({
        importerRuntimeScope: 'business_core',
        targetRuntimeScope: 'commercial_foundation',
        importPath: './commercialFoundationService.js',
        policyReason: 'business_core_services_and_jobs_must_not_depend_on_commercial_foundation',
      }),
    ])
  })

  it('declares both phase-one runtime-scope dependency boundaries in the current registry', () => {
    const registry = JSON.parse(readFileSync(
      join(serverRoot, 'src', 'registry', 'system-domain-registry.json'),
      'utf8',
    )) as {
      architectureBoundaryMatrix?: {
        disallowedImports?: Array<Record<string, unknown>>
      }
    }
    const rules = registry.architectureBoundaryMatrix?.disallowedImports ?? []

    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        importerRuntimeScope: 'business_core',
        targetRuntimeScope: 'commercial_foundation',
      }),
      expect.objectContaining({
        importerRuntimeScope: 'platform_foundation',
        targetRuntimeScope: 'business_core',
      }),
    ]))
  })

  it('allows registered prediction bridge units to read execution facts', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-arch-matrix-allowed-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'registry'), { recursive: true })

    writeFileSync(
      join(srcRoot, 'services', 'forecastBridgeService.ts'),
      "import { readActuals } from './taskFactService.js'\nvoid readActuals\n",
    )
    writeFileSync(join(srcRoot, 'services', 'taskFactService.ts'), 'export const readActuals = {}\n')
    writeFileSync(join(srcRoot, 'registry', 'system-domain-registry.json'), `${JSON.stringify({
      entries: [
        {
          kind: 'service',
          id: 'forecastBridgeService',
          architectureUnit: '预测桥',
          runtimeScope: 'business_core',
        },
        {
          kind: 'service',
          id: 'taskFactService',
          architectureUnit: '主执行环：执行事实',
          runtimeScope: 'business_core',
        },
      ],
      deprecations: [],
    }, null, 2)}\n`)

    const result = evaluateArchitectureBoundaryGuard(fixtureRoot)

    expect(result.architectureUnitViolations).toEqual([])
    expect(result.violations).toEqual([])
  })

  it('blocks prediction bridge services from importing plan or action closure write surfaces', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-arch-prediction-writer-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'registry'), { recursive: true })

    writeFileSync(
      join(srcRoot, 'services', 'forecastBridgeService.ts'),
      "import { writePlan } from './taskWriteChainService.js'\nvoid writePlan\n",
    )
    writeFileSync(join(srcRoot, 'services', 'taskWriteChainService.ts'), 'export const writePlan = {}\n')
    writeFileSync(join(srcRoot, 'registry', 'system-domain-registry.json'), `${JSON.stringify({
      entries: [
        {
          kind: 'service',
          id: 'forecastBridgeService',
          architectureUnit: '预测桥',
          runtimeScope: 'business_core',
        },
        {
          kind: 'service',
          id: 'taskWriteChainService',
          architectureUnit: '主执行环：计划编制',
          runtimeScope: 'business_core',
        },
      ],
      deprecations: [],
    }, null, 2)}\n`)

    const result = evaluateArchitectureBoundaryGuard(fixtureRoot)

    expect(result.architectureUnitViolations).toEqual([
      expect.objectContaining({
        importerArchitectureUnit: '预测桥',
        targetRegistryKey: 'service:taskWriteChainService',
        policyReason: 'prediction_bridge_must_not_import_plan_or_action_closure_write_surfaces',
      }),
    ])
  })

  it('blocks disallowed architecture imports when the target is referenced through the server source alias', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-arch-alias-writer-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'registry'), { recursive: true })

    writeFileSync(
      join(srcRoot, 'services', 'forecastBridgeService.ts'),
      "import { writePlan } from '@/services/taskWriteChainService.js'\nvoid writePlan\n",
    )
    writeFileSync(join(srcRoot, 'services', 'taskWriteChainService.ts'), 'export const writePlan = {}\n')
    writeFileSync(join(srcRoot, 'registry', 'system-domain-registry.json'), `${JSON.stringify({
      entries: [
        {
          kind: 'service',
          id: 'forecastBridgeService',
          architectureUnit: '预测桥',
          runtimeScope: 'business_core',
        },
        {
          kind: 'service',
          id: 'taskWriteChainService',
          architectureUnit: '主执行环：计划编制',
          runtimeScope: 'business_core',
        },
      ],
      deprecations: [],
    }, null, 2)}\n`)

    const result = evaluateArchitectureBoundaryGuard(fixtureRoot)

    expect(result.architectureUnitViolations).toEqual([
      expect.objectContaining({
        importerArchitectureUnit: '预测桥',
        targetRegistryKey: 'service:taskWriteChainService',
        importPath: '@/services/taskWriteChainService.js',
        policyReason: 'prediction_bridge_must_not_import_plan_or_action_closure_write_surfaces',
      }),
    ])
  })

  it('blocks cross-cut fulfillment services from importing direct execution write chains', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-arch-cross-cut-writer-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'registry'), { recursive: true })

    writeFileSync(
      join(srcRoot, 'services', 'materialFeedbackService.ts'),
      "import { commitTask } from './taskWriteChainService.js'\nvoid commitTask\n",
    )
    writeFileSync(join(srcRoot, 'services', 'taskWriteChainService.ts'), 'export const commitTask = {}\n')
    writeFileSync(join(srcRoot, 'registry', 'system-domain-registry.json'), `${JSON.stringify({
      entries: [
        {
          kind: 'service',
          id: 'materialFeedbackService',
          architectureUnit: '横切履约',
          runtimeScope: 'business_core',
        },
        {
          kind: 'service',
          id: 'taskWriteChainService',
          architectureUnit: '主执行环：计划编制',
          runtimeScope: 'business_core',
        },
      ],
      deprecations: [],
    }, null, 2)}\n`)

    const result = evaluateArchitectureBoundaryGuard(fixtureRoot)

    expect(result.architectureUnitViolations).toEqual([
      expect.objectContaining({
        importerArchitectureUnit: '横切履约',
        targetRegistryKey: 'service:taskWriteChainService',
        policyReason: 'cross_cut_fulfillment_must_write_through_conditions_obstacles_links_or_governed_adapters',
      }),
    ])
  })

  it('blocks acceptance fact services from bypassing acceptance-pass governance into task write chains', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-arch-acceptance-writer-'))
    const srcRoot = join(fixtureRoot, 'server', 'src')
    mkdirSync(join(srcRoot, 'services'), { recursive: true })
    mkdirSync(join(srcRoot, 'registry'), { recursive: true })

    writeFileSync(
      join(srcRoot, 'services', 'acceptanceSyncService.ts'),
      "import { writeTask } from './taskWriteChainService.js'\nvoid writeTask\n",
    )
    writeFileSync(join(srcRoot, 'services', 'taskWriteChainService.ts'), 'export const writeTask = {}\n')
    writeFileSync(join(srcRoot, 'registry', 'system-domain-registry.json'), `${JSON.stringify({
      entries: [
        {
          kind: 'service',
          id: 'acceptanceSyncService',
          architectureUnit: '验收事实子通道',
          runtimeScope: 'business_core',
        },
        {
          kind: 'service',
          id: 'taskWriteChainService',
          architectureUnit: '主执行环：计划编制',
          runtimeScope: 'business_core',
        },
      ],
      deprecations: [],
    }, null, 2)}\n`)

    const result = evaluateArchitectureBoundaryGuard(fixtureRoot)

    expect(result.architectureUnitViolations).toEqual([
      expect.objectContaining({
        importerArchitectureUnit: '验收事实子通道',
        targetRegistryKey: 'service:taskWriteChainService',
        policyReason: 'acceptance_fact_subchannel_must_not_bypass_acceptance_pass_governance_into_execution_fact_writers',
      }),
    ])
  })

  it('keeps the current server source free of reverse route imports', async () => {
    const { evaluateArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)

    const result = evaluateArchitectureBoundaryGuard(serverRoot)

    expect(result.violations).toEqual([])
    expect(result.architectureUnitViolations).toEqual([])
    expect(result.architectureUnitLegacyDebt).toEqual([])
    expect(result.architectureUnitLegacyDebt).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        importerRegistryKey: 'service:durationContextService',
        targetRegistryKey: 'service:projectClimateResolver',
      }),
      expect.objectContaining({
        importerRegistryKey: 'service:durationContextService',
        targetRegistryKey: 'service:weatherForecastImpactService',
      }),
      expect.objectContaining({
        importerRegistryKey: 'service:regionalClimateRuleCandidateService',
        targetRegistryKey: 'service:projectClimateProfileService',
      }),
      expect.objectContaining({
        importerRegistryKey: 'service:algorithmSeedResolver',
        targetRegistryKey: 'service:workCalendarForecastBuilder',
      }),
      expect.objectContaining({
        importerRegistryKey: 'service:baselineGovernanceService',
        targetRegistryKey: 'service:projectCriticalPathService',
      }),
      expect.objectContaining({
        importerRegistryKey: 'service:constructionOrganizationCandidateProjectionBackfillService',
        targetRegistryKey: 'service:constructionOrganizationScenarioSelector',
      }),
      expect.objectContaining({
        importerRegistryKey: 'service:constructionOrganizationScenarioGovernanceService',
        targetRegistryKey: 'service:constructionOrganizationScenarioSelector',
      }),
      expect.objectContaining({
        importerRegistryKey: 'service:constructionOrganizationCandidateAnchorBackfillService',
        targetRegistryKey: 'service:constructionOrganizationScenarioSelector',
      }),
      expect.objectContaining({
        importerRegistryKey: 'service:constructionOrganizationPrecisionReplayCandidateBackfillService',
        targetRegistryKey: 'service:constructionOrganizationScenarioSelector',
      }),
      expect.objectContaining({
        importerRegistryKey: 'service:constructionOrganizationPrecisionReplayMatrixService',
        targetRegistryKey: 'service:constructionOrganizationScenarioSelector',
      }),
      expect.objectContaining({
        importerRegistryKey: 'route:duration-accuracy',
        targetRegistryKey: 'service:durationAlgorithmAccuracyService',
      }),
    ]))
  })
})
