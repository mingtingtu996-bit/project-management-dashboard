import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const canonicalCodes = [
  'predecessor_delay',
  'material_shortage',
  'labor_shortage',
  'equipment_unavailable',
  'design_change',
  'drawing_delay',
  'quality_rework',
  'weather_impact',
  'owner_decision',
  'government_inspection',
  'site_capacity_pressure',
  'workflow_sequence',
  'external_readiness',
  'other',
]

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : productionFiles(path)
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.test\.[cm]?[jt]sx?$/.test(entry.name)
      ? [path]
      : []
  })
}

describe('structured cause taxonomy client architecture', () => {
  it('keeps the full canonical taxonomy out of production client source files', () => {
    const clientSource = resolve(process.cwd().replace(/\\/g, '/').endsWith('/client') ? process.cwd() : 'client', 'src')
    const duplicateAuthorities = productionFiles(clientSource)
      .filter((path) => canonicalCodes.every((code) => readFileSync(path, 'utf8').includes(`'${code}'`)))
      .map((path) => path.replace(/\\/g, '/').replace(`${clientSource.replace(/\\/g, '/')}/`, ''))

    expect(duplicateAuthorities).toEqual([])
  })
})
