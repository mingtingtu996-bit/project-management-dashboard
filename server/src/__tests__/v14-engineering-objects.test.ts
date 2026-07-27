import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')
const repoRoot = resolve(serverRoot, '..')

function readServer(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

function readRepo(...segments: string[]) {
  return readFileSync(resolve(repoRoot, ...segments), 'utf8')
}

describe('v1.4 engineering object final range-tree model', () => {
  const finalTypes = "'phase', 'section', 'building', 'basement', 'floor', 'physical_zone', 'functional_area'"

  it('locks the final database model to seven object types and removes old object fields', () => {
    const migration = readServer('migrations', '163_v14221_engineering_object_type_final_delete.sql')

    expect(migration).toContain("CHECK (object_type IN ('phase','section','building','basement','floor','physical_zone','functional_area'))")
    expect(migration).toContain('DROP COLUMN IF EXISTS zone_object_id')
    expect(migration).toContain('DROP COLUMN IF EXISTS professional_object_id')
    expect(migration).toContain('DROP COLUMN IF EXISTS professional_object_id')
    expect(migration).not.toContain('legacy_object_type')
    expect(migration).not.toContain("WHERE object_type = 'professional'")
    expect(migration).not.toContain("WHERE object_type = 'subproject'")
    expect(migration).not.toContain("WHERE object_type = 'custom'")
  })

  it('keeps deleted scope compatibility fields out of current baseline and removes immutable historical tables forward', () => {
    const migrationNames = [
      '120_create_engineering_objects.sql',
      '121_add_wbs_engineering_categories.sql',
      '139a_v1421_material_lifecycle_fields.sql',
      'CLEAN_MIGRATION.sql',
      'CLEAN_MIGRATION_V2.sql',
      'CLEAN_MIGRATION_V3.sql',
      'CLEAN_MIGRATION_V4.sql',
      'FULL_MIGRATION_ALL_IN_ONE.sql',
      'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql',
    ]
    const offenders: string[] = []

    for (const migrationName of migrationNames) {
      const migration = readServer('migrations', migrationName)
      if (/CREATE TABLE IF NOT EXISTS\s+scope_dimensions\b/i.test(migration)) {
        offenders.push(`${migrationName}: creates scope_dimensions`)
      }
      if (/CREATE TABLE IF NOT EXISTS\s+project_scope_dimensions\b/i.test(migration)) {
        offenders.push(`${migrationName}: creates project_scope_dimensions`)
      }
      if (/ADD COLUMN IF NOT EXISTS\s+zone_object_id\b/i.test(migration)) {
        offenders.push(`${migrationName}: adds zone_object_id`)
      }
      if (/ADD COLUMN IF NOT EXISTS\s+professional_object_id\b/i.test(migration) || /\bprofessional_object_id\s+UUID\b/i.test(migration)) {
        offenders.push(`${migrationName}: adds professional_object_id`)
      }
      if (/object_type IN \('phase','section','building','floor','zone'\)/.test(migration)) {
        offenders.push(`${migrationName}: keeps five-type object check`)
      }
    }

    expect(offenders).toEqual([])

    const legacyScopeDrop = readServer('migrations', '224_v14232_drop_legacy_scope_dimension_tables.sql')
    expect(legacyScopeDrop).toMatch(/DROP TABLE IF EXISTS public\.project_scope_dimensions CASCADE;/)
    expect(legacyScopeDrop).toMatch(/DROP TABLE IF EXISTS public\.scope_dimensions CASCADE;/)
  })

  it('supports only the final seven object types in the engineering object service', () => {
    const dbTypes = readServer('src', 'types', 'db.ts')
    const service = readServer('src', 'services', 'engineeringObjectService.ts')

    expect(dbTypes).toContain(finalTypes)
    expect(dbTypes).toContain('export const ENGINEERING_OBJECT_TYPES')
    expect(dbTypes).toContain('export type EngineeringObjectType = typeof ENGINEERING_OBJECT_TYPES[number]')
    expect(dbTypes).toContain('export const ENGINEERING_OBJECT_TYPE_PREFIXES')
    expect(dbTypes).toContain('export const ENGINEERING_OBJECT_VALID_CHILDREN')
    expect(dbTypes).toContain('export const TASK_SCOPE_OBJECT_ID_KEYS')
    expect(dbTypes).toContain('export const TASK_SCOPE_OBJECT_ID_KEY_BY_OBJECT_TYPE')
    expect(service).toContain('ENGINEERING_OBJECT_TYPES')
    expect(service).toContain('ENGINEERING_OBJECT_TYPE_PREFIXES')
    expect(service).toContain('ENGINEERING_OBJECT_VALID_CHILDREN')
    expect(service).not.toContain('const TYPE_PREFIX')
    expect(service).not.toContain('const VALID_CHILDREN')
    expect(service).not.toMatch(/^\s*zone:\s*'/m)
    expect(service).not.toMatch(/^\s*professional:\s*'/m)
    expect(service).not.toMatch(/^\s*subproject:\s*'/m)
    expect(service).not.toMatch(/^\s*custom:\s*'/m)
  })

  it('does not duplicate engineering object type lists across route, service, materialization, and frontend API', () => {
    const service = readServer('src', 'services', 'engineeringObjectService.ts')
    const route = readServer('src', 'routes', 'engineering-objects.ts')
    const materialization = readServer('src', 'services', 'wizardScopeMaterializationService.ts')
    const clientSupabase = readRepo('client', 'src', 'lib', 'supabase.ts')
    const clientTypes = readRepo('client', 'src', 'types', 'index.ts')
    const clientApi = readRepo('client', 'src', 'services', 'engineeringObjectsApi.ts')

    expect(service).not.toContain('const SUPPORTED_TYPES: EngineeringObjectType[] = [')
    expect(route).not.toContain('const VALID_ENGINEERING_OBJECT_TYPES = [')
    expect(materialization).not.toContain('const SUPPORTED_SCOPE_TYPES = new Set<EngineeringObjectType>([')
    expect(clientSupabase).toContain('export const ENGINEERING_OBJECT_TYPES')
    expect(clientSupabase).toContain('export type EngineeringObjectType = typeof ENGINEERING_OBJECT_TYPES[number]')
    expect(clientTypes).toContain('ENGINEERING_OBJECT_TYPES')
    expect(clientApi).toContain('ENGINEERING_OBJECT_TYPES')
    expect(clientApi).not.toContain('const ALLOWED_ENGINEERING_OBJECT_TYPES = new Set<string>([')
  })

  it('keeps the frontend engineering object mirror byte-for-byte aligned with the server SSOT', () => {
    const dbTypes = readServer('src', 'types', 'db.ts')
    const clientSupabase = readRepo('client', 'src', 'lib', 'supabase.ts')
    const serverTypeList = dbTypes.match(/export const ENGINEERING_OBJECT_TYPES = \[([\s\S]*?)\] as const/)?.[1]
    const clientTypeList = clientSupabase.match(/export const ENGINEERING_OBJECT_TYPES = \[([\s\S]*?)\] as const/)?.[1]

    expect(clientTypeList).toBe(serverTypeList)
  })

  it('uses physical space plus functional area hierarchy rules', () => {
    const dbTypes = readServer('src', 'types', 'db.ts')
    const service = readServer('src', 'services', 'engineeringObjectService.ts')

    expect(dbTypes).toContain("phase: ['section', 'building', 'basement', 'physical_zone']")
    expect(dbTypes).toContain("section: ['building', 'basement', 'physical_zone']")
    expect(dbTypes).toContain("building: ['floor', 'physical_zone', 'functional_area']")
    expect(dbTypes).toContain("basement: ['floor', 'physical_zone', 'functional_area']")
    expect(dbTypes).toContain("floor: ['functional_area']")
    expect(dbTypes).toContain("physical_zone: ['floor', 'functional_area']")
    expect(dbTypes).toContain('functional_area: []')
    expect(service).toContain('ENGINEERING_OBJECT_VALID_CHILDREN')
    expect(service).toContain('validateDecompositionAxis')
    expect(service).not.toContain("building: ['floor', 'zone']")
    expect(service).not.toContain('zone: []')
  })

  it('does not mark undecomposed buildings as childrenComplete by default', () => {
    const service = readServer('src', 'services', 'engineeringObjectService.ts')

    expect(service).toContain("if (['basement', 'physical_zone'].includes(childType) && next.childrenComplete === undefined)")
    expect(service).not.toContain("['building', 'basement', 'floor', 'physical_zone'].includes(childType) && next.childrenComplete === undefined")
  })

  it('models special floors as floor metadata instead of new object types', () => {
    const dbTypes = readServer('src', 'types', 'db.ts')
    const clientTypes = readRepo('client', 'src', 'lib', 'supabase.ts')

    expect(dbTypes).toContain('export type EngineeringObjectFloorUsage')
    expect(dbTypes).toContain("floorUsage?: EngineeringObjectFloorUsage")
    expect(clientTypes).toContain('export type EngineeringObjectFloorUsage')
    expect(clientTypes).toContain("floorUsage?: EngineeringObjectFloorUsage")
    for (const usage of [
      'standard',
      'ground_pilotis',
      'refuge',
      'mechanical',
      'transfer',
      'roof',
      'mezzanine',
      'podium_roof',
      'canopy',
    ]) {
      expect(dbTypes).toContain(`'${usage}'`)
    }
    expect(dbTypes).not.toContain("'refuge_floor'")
    expect(dbTypes).not.toContain("'mechanical_floor'")
    expect(dbTypes).not.toContain("'transfer_floor'")
  })

  it('does not carry legacy compatibility bridges or deprecated migration helpers', () => {
    const service = readServer('src', 'services', 'engineeringObjectService.ts')

    expect(service).not.toContain('DEPRECATED_OBJECT_TYPE_VALUES')
    expect(service).not.toContain('legacy_object_type')
    expect(service).not.toContain('bridgeLegacyFieldsToObjectIds')
    expect(service).not.toContain('migrateOldScopeDataToEngineeringObjects')
    expect(service).not.toContain('migrateOldProjectScopeBindingsToEngineeringObjects')
    expect(service).not.toContain('DIMENSION_TO_OBJECT_TYPE_MAP')
    expect(service).not.toContain('legacyMigrated')
  })

  it('keeps deletion protection and scope consistency on the final fields', () => {
    const service = readServer('src', 'services', 'engineeringObjectService.ts')
    const writeChain = readServer('src', 'services', 'taskWriteChainService.ts')

    expect(service).toContain('isObjectReferenced')
    expect(service).toContain('Cannot delete: object is referenced')
    expect(service).toContain('validateTaskScopeConsistency')
    expect(writeChain).toContain('validateTaskScopeConsistency')
    expect(writeChain).toContain('SCOPE_CONSISTENCY_ERROR')
    expect(writeChain).toContain('SCOPE_OBJECT_REQUIRED')
    expect(writeChain).toContain('hasAnyScopeObjectId')
    expect(writeChain).toContain('physical_zone_object_id')
    expect(writeChain).toContain('functional_area_object_id')
    expect(writeChain).not.toMatch(/(?<!physical_)\bzone_object_id\b/)
    expect(writeChain).not.toMatch(/\bprofessional_object_id\b/)
  })
})

describe('v1.4 engineering object routes and consumers', () => {
  it('registers engineering-objects and removes the old scope-dimensions route', () => {
    expect(readServer('src', 'index.ts')).toContain('/api/engineering-objects')
    expect(readServer('src', 'index.ts')).not.toContain('/api/scope-dimensions')
    expect(existsSync(resolve(serverRoot, 'src', 'routes', 'scope-dimensions.ts'))).toBe(false)
  })

  it('accepts only the final seven object types at the route boundary', () => {
    const route = readServer('src', 'routes', 'engineering-objects.ts')

    expect(route).toContain('ENGINEERING_OBJECT_TYPES')
    expect(route).toContain('isValidEngineeringObjectType')
    expect(route).not.toContain("'zone'")
    expect(route).not.toContain("'professional'")
    expect(route).not.toContain("'subproject'")
    expect(route).not.toContain("'custom'")
    expect(route).toContain('objectType must be one of')
  })

  it('uses engineering_objects as the only range-tree source for trend analytics', () => {
    const service = readServer('src', 'services', 'projectTrendAnalyticsService.ts')

    expect(service).toContain('engineering_objects')
    expect(service).toContain("'physical_zone'")
    expect(service).toContain("'functional_area'")
    expect(service).not.toContain('project_scope_dimensions')
    expect(service).not.toContain("'professional'")
    expect(service).not.toContain("'region'")
    expect(service).not.toContain("'zone'")
  })

  it('reuses shared client-side scope constants between wizard and task-list editors', () => {
    const shared = readRepo('client', 'src', 'lib', 'engineeringObjectScope.ts')
    const wizard = readRepo('client', 'src', 'components', 'project', 'wizard', 'Step3EngineeringScopeScale.tsx')
    const scopeDialog = readRepo('client', 'src', 'pages', 'GanttView', 'EngineeringObjectsDialog.tsx')
    const planningScopeHook = readRepo('client', 'src', 'hooks', 'usePlanningScope.ts')

    expect(shared).toContain('export const ENGINEERING_OBJECT_ROOT_TYPES')
    expect(shared).toContain('export const ENGINEERING_OBJECT_PHYSICAL_LEDGER_TYPES')
    expect(shared).toContain('export const ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES')
    expect(shared).toContain('export const ENGINEERING_OBJECT_PERSISTED_DECOMPOSITION_PARENT_TYPES')
    expect(shared).toContain('export const ENGINEERING_OBJECT_SCOPE_OPTION_FIELDS')
    expect(shared).toContain('export function getEngineeringObjectDefaultCoverageRole')
    expect(shared).toContain('export function getEngineeringObjectDefaultAreaAccountingMode')
    expect(wizard).toContain("from '@/lib/engineeringObjectScope'")
    expect(scopeDialog).toContain("from '@/lib/engineeringObjectScope'")
    expect(planningScopeHook).toContain("from '@/lib/engineeringObjectScope'")
    expect(planningScopeHook).toContain('ENGINEERING_OBJECT_SCOPE_OPTION_FIELDS')
    expect(scopeDialog).toContain('ENGINEERING_OBJECT_PERSISTED_DECOMPOSITION_PARENT_TYPES')
    expect(scopeDialog).toContain('getEngineeringObjectDefaultCoverageRole')
    expect(scopeDialog).toContain('getEngineeringObjectDefaultAreaAccountingMode')
    expect(wizard).toContain('getEngineeringObjectDefaultCoverageRole')
    expect(wizard).toContain('getEngineeringObjectDefaultAreaAccountingMode')
    expect(wizard).not.toContain('const ROOT_CHILD_TYPES')
    expect(scopeDialog).not.toContain('const ROOT_CHILD_TYPES')
  })

  it('registers metric groupBy values without old engineering object dimensions', () => {
    const registry = readServer('src', 'services', 'metricRegistryService.ts')

    expect(registry).toContain("| 'physical_zone'")
    expect(registry).toContain("| 'functional_area'")
    expect(registry).toContain("| 'basement'")
    expect(registry).not.toContain("| 'professional'")
    expect(registry).not.toContain("| 'region'")
    expect(registry).not.toContain("| 'zone'")
  })
})

describe('v1.4 task scope and category contracts', () => {
  it('passes only final range-tree ids into the data-quality live-check draft', () => {
    const taskFormUtils = readRepo('client', 'src', 'pages', 'GanttView', 'taskFormUtils.ts')
    const service = readServer('src', 'services', 'dataQualityService.ts')

    for (const field of [
      'engineering_object_id',
      'phase_object_id',
      'section_object_id',
      'building_object_id',
      'basement_object_id',
      'floor_object_id',
      'physical_zone_object_id',
      'functional_area_object_id',
    ]) {
      expect(taskFormUtils).toContain(`${field}: formData.${field}`)
      expect(service).toContain(`${field}: draft?.${field}`)
    }
    expect(taskFormUtils).not.toContain('zone_object_id: formData.zone_object_id')
    expect(taskFormUtils).not.toContain('professional_object_id: formData.professional_object_id')
    expect(service).not.toContain('zone_object_id: draft?.zone_object_id')
    expect(service).not.toContain('professional_object_id: draft?.professional_object_id')
  })

  it('keeps engineering categories separate from range-tree professional objects', () => {
    const route = readServer('src', 'routes', 'engineering-categories.ts')

    expect(route).toContain('validateParentCategoryForProject')
    expect(route).toContain('parentId must reference a category in the current project or the system standard library')
    expect(route).not.toContain('validateProfessionalObjectForProject')
    expect(route).not.toContain('professionalObjectId')
    expect(route).not.toContain('professional_object_id')
  })

  it('keeps task code generation scoped to final object/category fragments', () => {
    const service = readServer('src', 'services', 'taskCodeGenerationService.ts')

    expect(service).toContain('generateTaskCode')
    expect(service).toContain('shouldRegenerateTaskCode')
    expect(service).toContain('buildSequenceKey')
    expect(service).toContain('physical_zone_object_id')
    expect(service).toContain('functional_area_object_id')
    expect(service).not.toMatch(/(?<!physical_)\bzone_object_id\b/)
    expect(service).not.toMatch(/\bprofessional_object_id\b/)
  })
})

describe('v1.4 plan documents final range-tree wording', () => {
  const docsRoot = resolve(repoRoot, 'docs', 'plans')
  const docNames = [
    'v1.4工程对象主数据体系执行方案.md',
    'v1.4.1项目范围维度体系执行方案.md',
    'v1.4.2WBS拆解标准体系执行方案.md',
    'v1.4.3施工任务标准数据模型执行方案.md',
    'v1.4.4建筑工程任务编码规则执行方案.md',
    'v1.4.7.4项目基线算法与月度计划算法升级执行方案.md',
    'v1.4.7.5算法seed标准规则项目事实自动校准规则口径.md',
    'v1.4.18模板库与经验工期体系执行方案.md',
    'v1.4.21材料管控与任务联动体系执行方案.md',
    'v1.4.22.1项目快速建模与起跑线接入执行方案.md',
  ]

  const allV14DocNames = readdirSync(docsRoot)
    .filter((name) => name.startsWith('v1.4') && name.endsWith('.md'))

  const forbiddenPositiveCompatibilityPhrases = [
    'GET /api/scope-dimensions',
    'POST /api/scope-dimensions',
    'PUT /api/scope-dimensions',
    'DELETE /api/scope-dimensions',
    'professional_object_id 是权威字段',
    '写入优先 professional_object_id',
    '读取优先 professional_object_id',
    '回填 professional_object_id',
    '只读兼容',
    '保留旧接口',
    'metadata.legacy_object_type',
    '并保留 metadata.legacyType',
    '记录 metadata.legacyRefs',
    "SET object_type = 'zone'",
    "object_type = 'professional'",
    "object_type = 'custom'",
    "object_type = 'subproject'",
    'zone_object_id 任一即可',
    'professional_object_id 任一即可',
    '默认 professional',
    '只初始化默认 professional',
    'professional 对象选择器',
    'scope-dimensions 兼容路由已补',
    'scope-dimensions 兼容适配测试',
    '映射为 professional',
    '映射为 zone',
    '映射为 custom',
  ]

  const forbiddenPositiveCompatibilityPatterns: Array<[string, RegExp]> = [
    ['legacy scope route', /\/api\/projects\/:id\/scope-dimensions/],
    ['old five-type object check', /object_type IN \('phase','section','building','floor','zone'\)/],
    ['old compact five-type range-tree wording', /phase\/section\/building\/floor\/zone/],
    ['old spaced five-type range-tree wording', /phase \/ section \/ building \/ floor \/ zone/],
    ['old building-floor-zone hierarchy wording', /building\s*->\s*floor\s*->\s*zone/],
    ['old slash building-floor-zone wording', /building\/floor\/zone/],
    ['old slash floor-zone wording', /floor\/zone/],
    ['old task scope field list', /building_object_id \/ floor_object_id \/ zone_object_id/],
    ['old hasAnyScopeObjectId fields', /hasAnyScopeObjectId[^\n]*?(?<!physical_)zone_object_id[^\n]*professional_object_id/],
    ['old scope input facts', /输入事实包括[^\n]*?(?<!physical_)zone_object_id[^\n]*professional_object_id/],
    ['old task object update fields', /更新任务上的[^\n]*?(?<!physical_)zone_object_id/],
    ['old existing task scope fields', /任务已有[^\n]*?(?<!physical_)zone_object_id[^\n]*professional_object_id/],
    ['old scope fields as supported', /支持[^\n]*?(?<!physical_)zone_object_id[^\n]*professional_object_id/],
    ['old scope fields as included', /包含[^\n]*?(?<!physical_)zone_object_id[^\n]*professional_object_id/],
  ]

  const forbiddenScopeCompatibilityPatterns: Array<[string, RegExp]> = [
    ['old scope tables kept short-term', /scope_dimensions[^\n]*project_scope_dimensions[^\n]*(短期保留|鍏煎)/],
    ['old scope table lifecycle as compatibility', /scope_dimensions\.is_active[^\n]*(兼容启停|鍏煎)/],
    ['old scope tables as active source', /工程对象兼容[^\n]*scope_dimensions[^\n]*project_scope_dimensions/],
    ['old scope tables in active master-data governance', /engineering_objects[^\n]*scope_dimensions[^\n]*engineering_categories/],
    ['old scope tables adapted by engineering objects', /旧 scope_dimensions[^\n]*project_scope_dimensions[^\n]*继续由 engineering_objects 适配/],
  ]

  it('does not keep positive compatibility instructions in v1.4 series plans', () => {
    const offenders: string[] = []

    for (const docName of docNames) {
      const content = readFileSync(resolve(docsRoot, docName), 'utf8')
      const searchContent = content.includes('Specialty, system, domain package, and method semantics remain business facts only.')
        ? content.slice(content.indexOf('Specialty, system, domain package, and method semantics remain business facts only.'))
        : content
      for (const phrase of forbiddenPositiveCompatibilityPhrases) {
        if (searchContent.includes(phrase)) {
          offenders.push(`${docName}: ${phrase}`)
        }
      }
      for (const [label, pattern] of forbiddenPositiveCompatibilityPatterns) {
        if (pattern.test(searchContent)) {
          offenders.push(`${docName}: ${label}`)
        }
      }
    }

    for (const docName of allV14DocNames) {
      const content = readFileSync(resolve(docsRoot, docName), 'utf8')
      const searchContent = content.includes('Specialty, system, domain package, and method semantics remain business facts only.')
        ? content.slice(content.indexOf('Specialty, system, domain package, and method semantics remain business facts only.'))
        : content
      for (const [label, pattern] of forbiddenScopeCompatibilityPatterns) {
        if (pattern.test(searchContent)) {
          offenders.push(`${docName}: ${label}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('puts the no-compatibility seven-object boundary at the critical v1.4 plan entry points', () => {
    const criticalDocs = [
      'v1.4工程对象主数据体系执行方案.md',
      'v1.4.1项目范围维度体系执行方案.md',
      'v1.4.21材料管控与任务联动体系执行方案.md',
      'v1.4.22.1项目快速建模与起跑线接入执行方案.md',
    ]

    for (const docName of criticalDocs) {
      const content = readFileSync(resolve(docsRoot, docName), 'utf8')
      expect(content.slice(0, 2500)).toContain('2026-06-01 final range-tree boundary (authoritative)')
      expect(content.slice(0, 2500)).toContain('phase / section / building / basement / floor / physical_zone / functional_area')
      expect(content.slice(0, 2500)).toContain('No production history or existing users need migration')
      expect(content.slice(0, 2500)).toContain('/api/scope-dimensions and scope_dimensions / project_scope_dimensions adapters')
    }
  })

  it('puts the authoritative range-tree boundary at every v1.4-series plan entry point', () => {
    const v14Docs = readdirSync(docsRoot)
      .filter((name) => name.startsWith('v1.4') && name.endsWith('.md'))

    expect(v14Docs.length).toBeGreaterThan(0)

    for (const docName of v14Docs) {
      const content = readFileSync(resolve(docsRoot, docName), 'utf8')
      const normalizedIntro = content.slice(0, 2500).toLowerCase()
      expect(content.slice(0, 2500)).toContain('2026-06-01 final range-tree boundary (authoritative)')
      expect(content.slice(0, 2500)).toContain('phase / section / building / basement / floor / physical_zone / functional_area')
      expect(
        normalizedIntro.includes('no production history or existing user data')
          || normalizedIntro.includes('no production history or existing users need migration'),
      ).toBe(true)
    }
  })
})
