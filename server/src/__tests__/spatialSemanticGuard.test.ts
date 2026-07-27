import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  auditSpatialSemanticDictionary,
  normalizeSpatialSemanticCode,
} from '../services/spatialSemanticDictionaryService.js'

const PHASE_WINDOW_LITERAL_PATTERN = /phaseWindow\s*[:=]\s*'([a-z_]+)'/g
const testDir = dirname(fileURLToPath(import.meta.url))

function readSource(relativePath: string) {
  return readFileSync(resolve(testDir, relativePath), 'utf8')
}

function collectMatches(relativePath: string, pattern: RegExp) {
  return Array.from(readSource(relativePath).matchAll(pattern), (match) => match[1])
}

describe('spatial semantic guard', () => {
  it('keeps dictionary audit fully covered', () => {
    const audit = auditSpatialSemanticDictionary()

    expect(audit.unknownEngineeringObjectTypes).toEqual([])
    expect(audit.uncoveredEngineeringObjectTypes).toEqual([])
    expect(audit.uncoveredScopeAssignmentMetadataValues).toEqual([])
    expect(audit.status).toBe('ready')
  })

  it('fails when construction-scope inference adds unregistered system or workface literals', () => {
    const source = readSource('../services/constructionScopeInferenceService.ts')
    const literals = Array.from(source.matchAll(/'((?:system|workface):[a-z0-9_]+)'/g), (match) => match[1])
      .filter((literal) => !literal.startsWith('workface:${'))
    const unknownLiterals = Array.from(new Set(literals))
      .filter((literal) => !normalizeSpatialSemanticCode(literal))

    expect(unknownLiterals).toEqual([])
  })

  it('fails when construction and seed phase-window literals escape the dictionary', () => {
    const phaseWindows = Array.from(new Set([
      ...collectMatches('../services/constructionScopeInferenceService.ts', /return '([a-z_]+)'/g)
        .filter((literal) => [
          'opening',
          'handover',
          'trial_operation',
          'factory',
          'renovation',
          'foundation',
          'mep',
          'outdoor',
          'decoration',
          'superstructure',
        ].includes(literal)),
      ...collectMatches('../seeds/v1474BuildingPatternSeed.ts', PHASE_WINDOW_LITERAL_PATTERN),
      ...collectMatches('../services/t2DivisionRhythmTemplateRegistryService.ts', PHASE_WINDOW_LITERAL_PATTERN),
    ].sort()))

    const unknownPhaseWindows = phaseWindows.filter(
      (literal) => !normalizeSpatialSemanticCode(`phaseWindow:${literal}`),
    )

    expect(unknownPhaseWindows).toEqual([])
  })
})
