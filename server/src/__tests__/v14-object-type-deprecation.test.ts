import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENGINEERING_OBJECT_TYPES } from '../types/db.js'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')
function readServer(...segments: string[]) { return readFileSync(resolve(serverRoot, ...segments), 'utf8') }

describe('v1.4 range-tree final object model', () => {
  const serviceSrc = readServer('src', 'services', 'engineeringObjectService.ts')
  const dbTypes = readServer('src', 'types', 'db.ts')

  it('does not carry deprecated object-type compatibility code', () => {
    expect(serviceSrc).not.toContain('DEPRECATED_OBJECT_TYPE_VALUES')
    expect(serviceSrc).not.toContain('isDeprecatedObjectType')
    expect(serviceSrc).not.toContain('getDeprecatedMigrationTarget')
    expect(serviceSrc).not.toContain('buildDeprecatedLegacyMetadata')
    expect(serviceSrc).not.toContain('classifyDeprecatedCustomObject')
    expect(serviceSrc).not.toContain('classifyDeprecatedSubprojectObject')
    expect(serviceSrc).not.toContain('legacy_object_type')
    expect(serviceSrc).not.toContain('migrateOldScopeDataToEngineeringObjects')
    expect(serviceSrc).not.toContain('migrateOldProjectScopeBindingsToEngineeringObjects')
    expect(serviceSrc).not.toContain('bridgeLegacyFieldsToObjectIds')
  })

  it('uses the shared seven-type range-tree constant instead of a local SUPPORTED_TYPES list', () => {
    expect([...ENGINEERING_OBJECT_TYPES]).toEqual([
      'phase',
      'section',
      'building',
      'basement',
      'floor',
      'physical_zone',
      'functional_area',
    ])
    expect(serviceSrc).toContain('ENGINEERING_OBJECT_TYPES')
    expect(serviceSrc).toContain('SUPPORTED_TYPE_VALUES = ENGINEERING_OBJECT_TYPES')
    expect(serviceSrc).not.toContain("'zone'")
    expect(serviceSrc).not.toContain("'professional'")
    expect(serviceSrc).not.toContain("'subproject'")
  })

  it('uses seven-type prefixes without zone/professional fallbacks', () => {
    expect(dbTypes).toContain('ENGINEERING_OBJECT_TYPE_PREFIXES')
    expect(dbTypes).toContain("physical_zone: 'PZ'")
    expect(dbTypes).toContain("functional_area: 'FA'")
    expect(dbTypes).toContain("basement: 'BS'")
    expect(serviceSrc).toContain('ENGINEERING_OBJECT_TYPE_PREFIXES')
    expect(serviceSrc).not.toMatch(/^\s*zone:\s*'/m)
    expect(serviceSrc).not.toContain("PRO-")
  })

  it('uses final task scope fields without zone/professional object ids', () => {
    expect(serviceSrc).toContain('basement_object_id')
    expect(serviceSrc).toContain('physical_zone_object_id')
    expect(serviceSrc).toContain('functional_area_object_id')
    expect(serviceSrc).not.toMatch(/\bzone_object_id\b/)
    expect(serviceSrc).not.toMatch(/\bprofessional_object_id\b/)
  })

  it('has final database migration with the seven object_type CHECK values', () => {
    const migration = readServer('migrations', '163_v14221_engineering_object_type_final_delete.sql')
    const reconciliation = readServer('migrations', '295_v14231_engineering_object_type_final_reconciliation.sql')
    expect(migration).toContain("CHECK (object_type IN ('phase','section','building','basement','floor','physical_zone','functional_area'))")
    expect(reconciliation).toContain("CHECK (object_type IN ('phase','section','building','basement','floor','physical_zone','functional_area'))")
    expect(migration).not.toContain("WHERE object_type = 'professional'")
    expect(migration).not.toContain("WHERE object_type = 'custom'")
    expect(migration).not.toContain("WHERE object_type = 'subproject'")
    expect(migration).not.toContain('legacy_object_type')
  })

  it('normalizes only unreferenced legacy object rows before the final constraint migration', () => {
    const preflightMigration = readServer('migrations', '162a_v14221_legacy_engineering_object_preflight.sql')

    expect(preflightMigration).toContain("SET object_type = 'physical_zone'")
    expect(preflightMigration).toContain("WHERE object_type = 'zone'")
    expect(preflightMigration).toContain("DELETE FROM public.engineering_objects")
    expect(preflightMigration).toContain("WHERE object_type = 'professional'")
    expect(preflightMigration).toContain('legacy engineering-object references must be cleared')
    expect(preflightMigration).toContain('zone to physical_zone object-code collision')
  })
})
