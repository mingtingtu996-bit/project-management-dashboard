import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  FORMAL_BUSINESS_TYPE_CODES,
  auditBusinessTypeRegistry,
  isT2RhythmCompatibilityBusinessTypeCode,
  normalizeBusinessTypeCode,
} from '../services/businessTypeRegistryService.js'
import { PRODUCT_BUSINESS_TYPE_CODES } from '../services/projectScenarioTaxonomyService.js'

const testDir = dirname(fileURLToPath(import.meta.url))
const BUSINESS_TYPE_LITERAL_PATTERN = /businessType(?:Code)?\s*:\s*'([a-z_]+)'/g

function readSource(relativePath: string) {
  return readFileSync(resolve(testDir, relativePath), 'utf8')
}

function collectMatches(relativePath: string, pattern: RegExp) {
  return Array.from(readSource(relativePath).matchAll(pattern), (match) => match[1])
}

describe('business type registry guard', () => {
  it('keeps the registry audit fully covered', () => {
    const audit = auditBusinessTypeRegistry()

    expect(audit.status).toBe('ready')
    expect(audit.missingRecommendationCodes).toEqual([])
    expect(audit.unregisteredRecommendationCodes).toEqual([])
    expect(audit.unmappedLegacyWbsTemplateTypes).toEqual([])
  })

  it('keeps project scenario taxonomy on the shared formal business-type list', () => {
    expect(PRODUCT_BUSINESS_TYPE_CODES).toEqual(FORMAL_BUSINESS_TYPE_CODES)
  })

  it('fails when governed recommendation and benchmark consumers add unregistered business types', () => {
    const governedFiles = [
      '../services/wbsTemplateGoldenBenchmarkReplayService.ts',
      '../seeds/wbsTemplateProjectRecommendations.ts',
      '../seeds/acceptanceTimelineTemplateSeed.ts',
      '../seeds/drawingPackageTemplateSeed.ts',
    ]
    const unknownLiterals = Array.from(new Set(
      governedFiles.flatMap((relativePath) => collectMatches(relativePath, BUSINESS_TYPE_LITERAL_PATTERN)),
    ))
      .filter((literal) => !normalizeBusinessTypeCode(literal))

    expect(unknownLiterals).toEqual([])
  })

  it('fails when T2 rhythm scenarios add business-type literals outside the registry or compatibility codes', () => {
    const literals = Array.from(new Set(
      collectMatches('../services/t2DivisionRhythmTemplateRegistryService.ts', BUSINESS_TYPE_LITERAL_PATTERN),
    ))
    const unknownLiterals = literals.filter(
      (literal) => !normalizeBusinessTypeCode(literal) && !isT2RhythmCompatibilityBusinessTypeCode(literal),
    )

    expect(unknownLiterals).toEqual([])
  })
})
