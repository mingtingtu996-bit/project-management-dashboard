import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  V14231_EVIDENCE_ARTIFACT_IDS,
  buildV14231EvidenceArtifactIndex,
  validateV14231EvidenceArtifactIndex,
} from '../services/v14231EvidenceArtifactIndexService.js'

function findWorkspaceRoot() {
  const candidates = [process.cwd(), resolve(process.cwd(), '..')]
  const root = candidates.find((candidate) => existsSync(resolve(candidate, 'docs', 'plans')))
  if (!root) {
    throw new Error('Unable to locate workspace docs/plans directory')
  }
  return root
}

function readLedgerPlan(): string {
  const docsDir = resolve(findWorkspaceRoot(), 'docs', 'plans')
  const filename = readdirSync(docsDir)
    .find((item) => item.startsWith('v1.4.23.1-A体系') && item.endsWith('.md'))
  if (!filename) {
    throw new Error('Missing v1.4.23.1-A ledger plan')
  }

  return readFileSync(resolve(docsDir, filename), 'utf8')
}

function extractSection(planDoc: string, heading: string): string {
  const lines = planDoc.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.includes(heading))
  if (startIndex === -1) {
    throw new Error(`Missing ledger section: ${heading}`)
  }

  const nextHeadingIndex = lines.findIndex((line, index) => (
    index > startIndex && /^#{2,3}\s/.test(line)
  ))
  return lines.slice(startIndex, nextHeadingIndex === -1 ? undefined : nextHeadingIndex).join('\n')
}

function parseMarkdownTable(section: string): Array<Record<string, string>> {
  const rows = section
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|'))
    .filter((line) => !/^\|\s*-+/.test(line))
    .map((line) => line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()))

  if (rows.length < 2) {
    throw new Error('Missing markdown table rows in section')
  }

  const [headers, ...bodyRows] = rows
  return bodyRows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
}

function markdownCloseoutCellCovers(cell: string, closeoutItem: string): boolean {
  if (cell.includes(closeoutItem)) return true

  const liveRangeMatch = cell.match(/C-18\.L(\d{2})-L(\d{2})/)
  const liveItemMatch = closeoutItem.match(/^C-18\.L(\d{2})$/)
  if (liveRangeMatch && liveItemMatch) {
    const start = Number(liveRangeMatch[1])
    const end = Number(liveRangeMatch[2])
    const value = Number(liveItemMatch[1])
    return value >= start && value <= end
  }

  const c19RangeMatch = cell.match(/C-19\.(\d{2})-C-19\.(\d{2})/)
  const c19ItemMatch = closeoutItem.match(/^C-19\.(\d{2})([a-z])?$/)
  if (c19RangeMatch && c19ItemMatch) {
    const start = Number(c19RangeMatch[1])
    const end = Number(c19RangeMatch[2])
    const value = Number(c19ItemMatch[1])
    return value >= start && value <= end
  }

  return false
}

describe('v1.4.23.1-A evidence artifact index service', () => {
  it('indexes A10-E01 through A10-E18 plus A10-E11a as machine-readable evidence without granting runtime readiness', () => {
    const index = buildV14231EvidenceArtifactIndex()

    expect(index.sourcePlan).toBe('v1.4.23.1-A')
    expect(index.entries.map((entry) => entry.id)).toEqual([...V14231_EVIDENCE_ARTIFACT_IDS])
    for (const entry of index.entries) {
      expect(entry.boundary).toEqual(expect.objectContaining({
        grantsProductionReady: false,
        writesRuntimePublication: false,
        requiresLiveOrAdminEvidenceForUpgrade: true,
      }))
      expect(entry.sourcePlan).toBe('v1.4.23.1-A')
      expect(entry.closeoutItems.length).toBeGreaterThan(0)
      expect(entry.remainingBlockers.length).toBeGreaterThan(0)
      expect(entry.codeEvidence.length + entry.testEvidence.length + entry.scriptEvidence.length).toBeGreaterThan(0)
    }
  })

  it('keeps the A10 markdown table and machine-readable evidence index in bidirectional sync', () => {
    const ledgerPlan = readLedgerPlan()
    const a10Rows = parseMarkdownTable(extractSection(ledgerPlan, 'A10. 证据索引'))
    const markdownIds = a10Rows.map((row) => row['证据 ID'])
    const index = buildV14231EvidenceArtifactIndex()
    const indexedIds = index.entries.map((entry) => entry.id)

    expect(markdownIds).toEqual(indexedIds)
    expect(markdownIds).toContain('A10-E11a')
    expect(markdownIds).toHaveLength(19)

    for (const entry of index.entries) {
      const row = a10Rows.find((candidate) => candidate['证据 ID'] === entry.id)
      expect(row, entry.id).toBeDefined()
      expect(row?.['live'], entry.id).toBe(String(entry.liveEvidenceRequired))
      for (const closeoutItem of entry.closeoutItems) {
        expect(markdownCloseoutCellCovers(row?.['覆盖 C 编号'] ?? '', closeoutItem), `${entry.id}:${closeoutItem}`).toBe(true)
      }
      expect(row?.['证据 / 命令 / 文件'], entry.id).not.toHaveLength(0)
      expect(row?.['可用于升级'], entry.id).not.toHaveLength(0)
      expect(row?.['剩余阻断'], entry.id).not.toHaveLength(0)
      expect(entry.boundary.grantsProductionReady, entry.id).toBe(false)
      expect(entry.boundary.writesRuntimePublication, entry.id).toBe(false)
    }
  })

  it('keeps all indexed evidence paths and package scripts resolvable', () => {
    expect(validateV14231EvidenceArtifactIndex()).toEqual([])
  })

  it('keeps non-live indexed server test evidence inside the v1.4.23.1 closeout gate', () => {
    const packageJson = JSON.parse(readFileSync(resolve(findWorkspaceRoot(), 'server', 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const closeoutCommand = packageJson.scripts?.['verify:v14231-non-live-closeout'] ?? ''
    const index = buildV14231EvidenceArtifactIndex()
    const missing = index.entries
      .filter((entry) => entry.packageScripts.includes('verify:v14231-non-live-closeout'))
      .flatMap((entry) => entry.testEvidence
        .filter((evidencePath) => evidencePath.startsWith('server/src/__tests__/'))
        .map((evidencePath) => ({
          entryId: entry.id,
          gatePath: evidencePath.replace(/^server\//, ''),
        }))
        .filter(({ gatePath }) => !closeoutCommand.includes(gatePath)))

    expect(missing).toEqual([])
  })

  it('keeps indexed client contract evidence inside the v1.4.23.1 client gate', () => {
    const packageJson = JSON.parse(readFileSync(resolve(findWorkspaceRoot(), 'client', 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const clientGateCommand = packageJson.scripts?.['verify:v14231-client-contracts'] ?? ''
    const clientGateRunner = readFileSync(
      resolve(findWorkspaceRoot(), 'client', 'scripts', 'run-v14231-client-contract-gate.mjs'),
      'utf8',
    )
    const clientGateSource = `${clientGateCommand}\n${clientGateRunner}`
    const index = buildV14231EvidenceArtifactIndex()
    const missing = index.entries
      .filter((entry) => entry.packageScripts.includes('verify:v14231-client-contracts'))
      .flatMap((entry) => entry.testEvidence
        .filter((evidencePath) => evidencePath.startsWith('client/src/'))
        .map((evidencePath) => ({
          entryId: entry.id,
          gatePath: evidencePath.replace(/^client\//, ''),
        }))
        .filter(({ gatePath }) => !clientGateSource.includes(gatePath)))

    expect(missing).toEqual([])
  })

  it('keeps indexed C-18.L evidence contract tests inside the dedicated live evidence gate', () => {
    const packageJson = JSON.parse(readFileSync(resolve(findWorkspaceRoot(), 'server', 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const c18LiveEvidenceTestPaths = [
      'server/src/__tests__/rlsProaclLiveDiagnostic.test.ts',
      'server/src/__tests__/executeSqlAnonPocLiveDiagnostic.test.ts',
      'server/src/__tests__/durationCanaryApprovalLiveDiagnostic.test.ts',
      'server/src/__tests__/criticalPathConcurrencyLiveDiagnostic.test.ts',
      'server/src/__tests__/acceptanceStatusConcurrencyLiveDiagnostic.test.ts',
      'server/src/__tests__/wizardCommitLiveDiagnostic.test.ts',
      'server/src/__tests__/wbsGenerationPressureHarness.test.ts',
      'server/src/__tests__/warningNotificationSyncLiveDiagnostic.test.ts',
      'server/src/__tests__/criticalPathSyntheticPressureHarness.test.ts',
      'server/src/__tests__/companyHealthTrendLiveDiagnostic.test.ts',
      'server/src/__tests__/companySummaryPressureHarness.test.ts',
      'server/src/__tests__/spreadsheetMigrationLiveDiagnostic.test.ts',
    ]
    const c18GateCommand = packageJson.scripts?.['verify:c18-live-evidence-contracts'] ?? ''
    const c18GateRunner = readFileSync(
      resolve(findWorkspaceRoot(), 'server', 'scripts', 'run-c18-live-evidence-contract-gate.mjs'),
      'utf8',
    )
    const c18GateSource = `${c18GateCommand}\n${c18GateRunner}`
    const index = buildV14231EvidenceArtifactIndex()
    const c18Entry = index.entries.find((entry) => entry.packageScripts.includes('verify:c18-live-evidence-contracts'))
    expect(c18Entry?.testEvidence).toEqual(expect.arrayContaining(c18LiveEvidenceTestPaths))

    const missing = c18LiveEvidenceTestPaths
      .map((evidencePath) => ({
        entryId: c18Entry?.id ?? 'missing',
        gatePath: evidencePath.replace(/^server\//, ''),
      }))
      .filter(({ gatePath }) => !c18GateSource.includes(gatePath))

    expect(missing).toEqual([])
  })

  it('keeps A10-E14 anchored to C-19.04 duration learning policy tests', () => {
    const index = buildV14231EvidenceArtifactIndex()
    const entry = index.entries.find((candidate) => candidate.id === 'A10-E14')

    expect(entry).toBeDefined()
    expect(entry?.testEvidence).toEqual(expect.arrayContaining([
      'server/src/__tests__/durationContextPolicyStateBucketService.test.ts',
      'server/src/__tests__/progressVelocityLearningService.test.ts',
      'server/src/__tests__/durationContextPolicyParameterLearningService.test.ts',
      'server/src/__tests__/projectProductivityCalibrationService.test.ts',
    ]))
  })

  it('keeps A10-E17 anchored to local day-unit and special-seed row-resolution contracts', () => {
    const index = buildV14231EvidenceArtifactIndex()
    const entry = index.entries.find((candidate) => candidate.id === 'A10-E17')

    expect(entry).toBeDefined()
    expect(entry?.testEvidence).toEqual(expect.arrayContaining([
      'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
      'server/src/__tests__/wbsTemplateCandidateEventService.test.ts',
    ]))
    expect(entry?.remainingBlockers.join('\n')).not.toContain('upper-scope outcome units')
  })
})
