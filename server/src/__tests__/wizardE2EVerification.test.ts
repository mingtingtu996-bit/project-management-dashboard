import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')

function readWorkspaceFile(path: string) {
  return readFileSync(resolve(root, path), 'utf8')
}

describe('v1.4.22.1 implementation closure contracts', () => {
  it('uses Chinese runtime project status after wizard commit', () => {
    const routeSource = readWorkspaceFile('server/src/routes/projectWizard.ts')
    expect(routeSource).toContain("const PROJECT_DRAFT_STATUS = 'wizard_drafting'")
    expect(routeSource).toContain("const PROJECT_ACTIVE_STATUS = '进行中'")
    expect(routeSource).not.toContain("const PROJECT_ACTIVE_STATUS = 'active'")
  })

  it('removes the deprecated quick-scenario helper and keeps WbsTemplateGenerateDialog as a thin shell', () => {
    const dialogSource = readWorkspaceFile('client/src/components/planning/WbsTemplateGenerateDialog.tsx')
    expect(dialogSource).not.toContain('templateGenerationUx')
    expect(dialogSource).not.toContain('QUICK_SCENARIO_OPTIONS')
    expect(dialogSource).toContain('<TemplateInlineExpand')
    expect(dialogSource.split(/\r?\n/).length).toBeLessThanOrEqual(140)
  })

  it('keeps engineering object feature metadata in planning scope but out of the task-list range editor', () => {
    const scopeDialogSource = readWorkspaceFile('client/src/pages/GanttView/EngineeringObjectsDialog.tsx')
    const planningScopeSource = readWorkspaceFile('client/src/hooks/usePlanningScope.ts')

    expect(scopeDialogSource).not.toContain('engineeringObjectFeatureMetadata')
    expect(planningScopeSource).toContain('engineeringObjectFeatureMetadata')
  })

  it('keeps the task-list scope dialog aligned to the seven-class final range tree', () => {
    const scopeDialogSource = readWorkspaceFile('client/src/pages/GanttView/EngineeringObjectsDialog.tsx')
    const sharedScopeSource = readWorkspaceFile('client/src/lib/engineeringObjectScope.ts')
    const engineeringObjectsRoute = readWorkspaceFile('server/src/routes/engineering-objects.ts')
    const dbTypesSource = readWorkspaceFile('server/src/types/db.ts')

    expect(scopeDialogSource).toContain('工程对象树')
    expect(scopeDialogSource).toContain("from '@/lib/engineeringObjectScope'")
    expect(scopeDialogSource).toContain('ENGINEERING_OBJECT_ROOT_TYPES.map')
    expect(sharedScopeSource).toContain('export const ENGINEERING_OBJECT_ROOT_TYPES')
    expect(sharedScopeSource).toContain('export const ENGINEERING_OBJECT_PHYSICAL_LEDGER_TYPES')
    expect(sharedScopeSource).toContain('export const ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES')
    expect(scopeDialogSource).toContain('FUNCTIONAL_USAGES')
    expect(scopeDialogSource).toContain('floorOrder')
    expect(scopeDialogSource).toContain('functionalCategory')
    expect(scopeDialogSource).toContain('data-testid={`scope-root-add-${type}`}')
    expect(scopeDialogSource).toContain('data-testid="scope-root"')
    expect(scopeDialogSource).not.toContain('初始化默认专业对象')
    expect(scopeDialogSource).not.toContain('专业等工程对象')
    expect(scopeDialogSource).not.toContain('bootstrapEngineeringObjects')
    expect(scopeDialogSource).not.toContain('工程类型')
    expect(scopeDialogSource).not.toContain('结构体系')
    expect(scopeDialogSource).not.toContain('构件类型')
    expect(scopeDialogSource).not.toContain("'professional'")
    expect(scopeDialogSource).not.toContain("'subproject'")
    expect(scopeDialogSource).not.toContain("'custom'")

    expect(engineeringObjectsRoute).toContain('ENGINEERING_OBJECT_TYPES')
    expect(engineeringObjectsRoute).toContain('ENGINEERING_OBJECT_TYPES.join')
    for (const objectType of ['phase', 'section', 'building', 'basement', 'floor', 'physical_zone', 'functional_area']) {
      expect(dbTypesSource).toContain(`'${objectType}'`)
    }
    expect(engineeringObjectsRoute).toContain('objectType must be one of')
    expect(engineeringObjectsRoute).not.toContain("'zone'")
    expect(engineeringObjectsRoute).not.toContain("'professional'")
    expect(engineeringObjectsRoute).not.toContain("'subproject'")
    expect(engineeringObjectsRoute).not.toContain("'custom'")
  })

  it('exposes wizard, import, draft, rollback, and milestone preset routes through mounted routers', () => {
    const indexSource = readWorkspaceFile('server/src/index.ts')
    const wizardSource = readWorkspaceFile('server/src/routes/projectWizard.ts')
    const presetSource = readWorkspaceFile('server/src/routes/milestonePresets.ts')

    expect(indexSource).toContain('app.use(projectWizardRouter)')
    expect(indexSource).toContain('app.use(milestonePresetsRouter)')
    expect(wizardSource).toContain("router.post('/api/projects/wizard'")
    expect(wizardSource).toContain("router.patch('/api/projects/:id/wizard/draft'")
    expect(wizardSource).toContain("router.delete('/api/projects/:id/wizard/draft'")
    expect(wizardSource).toContain("router.post('/api/projects/:id/wizard/rollback'")
    expect(wizardSource).toContain("router.post('/api/projects/import/excel'")
    expect(presetSource).toContain("router.get('/api/milestone-presets'")
  })

  it('keeps v1.4.22.1 seed entrypoints and generic project PATCH discoverable', () => {
    const projectTypeSeed = readWorkspaceFile('server/src/seeds/projectTypeRecommendations.ts')
    const featureMapSeed = readWorkspaceFile('server/src/seeds/projectFeatureToItemPackMap.ts')
    const recommendationService = readWorkspaceFile('server/src/services/projectFactsToTemplateService.ts')
    const projectsRoute = readWorkspaceFile('server/src/routes/projects.ts')
    const validation = readWorkspaceFile('server/src/middleware/validation.ts')

    expect(projectTypeSeed).toContain("export * from '../services/projectTypeRecommendations.js'")
    expect(featureMapSeed).toContain("export * from '../services/projectFeatureToItemPackMap.js'")
    expect(recommendationService).toContain("from './projectTypeRecommendations.js'")
    expect(recommendationService).toContain("from './projectFeatureToItemPackMap.js'")
    expect(projectsRoute).toContain("router.patch('/:id'")
    expect(projectsRoute).toContain('projectPatchSchema')
    expect(validation).toContain('metadata: z.record(z.unknown()).optional().nullable()')
  })

  it('adds scope ledger diagnostics for mutually exclusive physical space coverage', () => {
    const wizardSource = readWorkspaceFile('server/src/routes/projectWizard.ts')
    const apiSource = readWorkspaceFile('client/src/components/project/wizard/projectWizardApi.ts')
    const confirmationSource = readWorkspaceFile('client/src/components/project/wizard/Step6ProjectProfileConfirmation.tsx')

    expect(wizardSource).toContain('buildScopeCoverageDiagnostics')
    expect(wizardSource).toContain("code: 'SCOPE_AREA_UNDER_COVERED'")
    expect(wizardSource).toContain("code: 'SCOPE_AREA_OVER_COVERED'")
    expect(wizardSource).toContain("code: 'SCOPE_SIBLING_DUPLICATE'")
    expect(wizardSource).toContain("code: 'SCOPE_DECOMPOSITION_AXIS_MIXED'")
    expect(wizardSource).toContain('isCountedScopeNode')
    expect(wizardSource).toContain("partitionMode === 'spatial_partition'")
    expect(wizardSource).toContain('floorUsageCodes')
    expect(apiSource).toContain('scopeCoverageDiagnostics')
    expect(confirmationSource).toContain('范围闭合检查')
    expect(confirmationSource).toContain('coverageRatio')
  })

  it('enforces one decomposition axis for spatial scope parents and supports tower/podium zoning', () => {
    const wizardSource = readWorkspaceFile('server/src/routes/projectWizard.ts')
    const engineeringObjectService = readWorkspaceFile('server/src/services/engineeringObjectService.ts')
    const sharedScopeSource = readWorkspaceFile('client/src/lib/engineeringObjectScope.ts')
    const scopeDialogSource = readWorkspaceFile('client/src/pages/GanttView/EngineeringObjectsDialog.tsx')
    const wizardStep3Source = readWorkspaceFile('client/src/components/project/wizard/Step3EngineeringScopeScale.tsx')

    expect(engineeringObjectService).toContain('ENGINEERING_OBJECT_VALID_CHILDREN')
    expect(engineeringObjectService).toContain('validateDecompositionAxis')
    expect(engineeringObjectService).toContain('childrenComplete')
    expect(wizardSource).toContain("code: 'SCOPE_DECOMPOSITION_AXIS_MIXED'")
    expect(wizardSource).toContain("partitionMode === 'spatial_partition'")
    expect(wizardSource).toContain("severity: 'info'")
    expect(sharedScopeSource).toContain('export const ENGINEERING_OBJECT_VALID_CHILDREN')
    expect(sharedScopeSource).toContain("building: ['floor', 'physical_zone', 'functional_area']")
    expect(scopeDialogSource).toContain('resolveAllowedChildTypes')
    expect(scopeDialogSource).toContain('ENGINEERING_OBJECT_VALID_CHILDREN')
    expect(wizardStep3Source).toContain('ENGINEERING_OBJECT_VALID_CHILDREN')
    expect(wizardStep3Source).toContain('resolveAllowedChildTypes')
  })

  it('keeps every supported independent engineering-zone option backed by a template scope route', () => {
    const wizardStep3Source = readWorkspaceFile('client/src/components/project/wizard/Step3EngineeringScopeScale.tsx')
    const scopeAssignmentSource = readWorkspaceFile('server/src/services/scopeAssignmentRulesService.ts')
    const recommendationSource = readWorkspaceFile('server/src/services/projectFactsToTemplateService.ts')

    const supportedCategories = [...wizardStep3Source.matchAll(/value: '([^']+)', label: '[^']+', templateSupport: 'supported'/g)]
      .map((match) => match[1])
    const uniqueSupportedCategories = [...new Set(supportedCategories)]
    const routedCategories = new Set([...scopeAssignmentSource.matchAll(/physicalCategory: '([^']+)'/g)]
      .map((match) => match[1]))
    const recommendedCategories = new Set([...recommendationSource.matchAll(/^  ([a-z0-9_]+): \{\r?$/gm)]
      .map((match) => match[1]))

    expect(uniqueSupportedCategories).toEqual(expect.arrayContaining([
      'switching_station',
      'liquid_oxygen_station',
      'railway_operation_zone',
      'traffic_connection_zone',
    ]))
    expect(uniqueSupportedCategories.filter((category) => !routedCategories.has(category))).toEqual([])
    expect(uniqueSupportedCategories.filter((category) => !recommendedCategories.has(category))).toEqual([])
  })
})
