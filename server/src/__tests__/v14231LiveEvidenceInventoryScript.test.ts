import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildV14231LiveEvidenceInventory,
  optionsFromArgs,
  shouldFailV14231LiveEvidenceInventory,
  writeV14231LiveEvidenceInventoryIfRequested,
} from '../scripts/summarize-v14231-live-evidence.js'

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

describe('v1.4.23.1 live evidence inventory script', () => {
  it('accepts release-matrix --input-root as an alias for --evidence-dir', () => {
    expect(optionsFromArgs([
      'node',
      'summarize-v14231-live-evidence.ts',
      '--input-root=project-testing/reports/release-current',
      '--output-file=project-testing/reports/release-current/inventory.json',
    ])).toEqual({
      evidenceDir: 'project-testing/reports/release-current',
      outputFile: 'project-testing/reports/release-current/inventory.json',
      generatedAt: undefined,
    })
  })

  it('keeps the overall closeout blocked when any required live evidence is blocked or missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'v14231-live-inventory-'))
    writeJson(join(dir, 'c18-l01-l03-rls-proacl-current.json'), {
      status: 'pass',
      missingArchivedJson: false,
    })
    writeJson(join(dir, 'c18-l07-critical-path-concurrency-blocked.json'), {
      status: 'blocked',
      missingArchivedJson: false,
      missingInputs: ['--base-url=<server>', '--auth-token=<jwt>'],
    })

    const inventory = buildV14231LiveEvidenceInventory({
      evidenceDir: dir,
      generatedAt: '2026-06-29T00:30:00.000Z',
    })

    expect(inventory.status).toBe('blocked')
    expect(inventory.canClaimLiveCloseoutComplete).toBe(false)
    expect(inventory.items.find((item) => item.itemId === 'C-18.L01-L03')).toEqual(expect.objectContaining({
      normalizedStatus: 'pass',
      missingEvidenceFile: false,
    }))
    expect(inventory.items.find((item) => item.itemId === 'C-18.L07')).toEqual(expect.objectContaining({
      normalizedStatus: 'blocked',
      rawStatus: 'blocked',
      missingEvidenceFile: false,
    }))
    expect(inventory.items.find((item) => item.itemId === 'C-18.L08')).toEqual(expect.objectContaining({
      normalizedStatus: 'missing',
      missingEvidenceFile: true,
    }))
    expect(shouldFailV14231LiveEvidenceInventory(inventory)).toBe(true)
  })

  it('recognizes current release-matrix C18 live diagnostic artifact filenames', () => {
    const dir = mkdtempSync(join(tmpdir(), 'v14231-live-inventory-'))
    writeJson(join(dir, 'c18-l07-critical-path-concurrency-live.json'), {
      status: 'pass',
      missingArchivedJson: false,
    })
    writeJson(join(dir, 'c18-l08-acceptance-status-concurrency-live.json'), {
      status: 'pass',
      missingArchivedJson: false,
    })
    writeJson(join(dir, 'c18-l15-spreadsheet-migration-replay.json'), {
      status: 'pass',
      missingArchivedJson: false,
    })

    const inventory = buildV14231LiveEvidenceInventory({
      evidenceDir: dir,
      generatedAt: '2026-06-29T00:30:30.000Z',
    })

    expect(inventory.items.find((item) => item.itemId === 'C-18.L07')).toEqual(expect.objectContaining({
      evidenceFile: join(dir, 'c18-l07-critical-path-concurrency-live.json'),
      normalizedStatus: 'pass',
      missingEvidenceFile: false,
    }))
    expect(inventory.items.find((item) => item.itemId === 'C-18.L08')).toEqual(expect.objectContaining({
      evidenceFile: join(dir, 'c18-l08-acceptance-status-concurrency-live.json'),
      normalizedStatus: 'pass',
      missingEvidenceFile: false,
    }))
    expect(inventory.items.find((item) => item.itemId === 'C-18.L15')).toEqual(expect.objectContaining({
      evidenceFile: join(dir, 'c18-l15-spreadsheet-migration-replay.json'),
      normalizedStatus: 'pass',
      missingEvidenceFile: false,
    }))
  })

  it('recognizes current release closeout package summaries and artifact filenames', () => {
    const dir = mkdtempSync(join(tmpdir(), 'v14231-live-inventory-'))
    writeJson(join(dir, 'closeout-decision.current.json'), {
      status: 'pass',
      mayCloseAll: true,
      openGateCount: 0,
      gates: [
        {
          id: 'c18-l07-l15-live-diagnostics',
          validationStatus: 'pass',
          mayClose: true,
          closeoutTargets: [
            'C-18.L07',
            'C-18.L08',
            'C-18.L09',
            'C-18.L10',
            'C-18.L11',
            'C-18.L12',
            'C-18.L14',
            'C-18.L15',
          ],
        },
        {
          id: 'c19-runtime-publication-release-rollback',
          validationStatus: 'pass',
          mayClose: true,
        },
        {
          id: 'old-object-physical-drop-closeout',
          validationStatus: 'pass',
          mayClose: true,
          closeoutMode: 'no_safe_candidate',
          alternateCloseout: {
            mode: 'no_safe_candidate',
            artifact: 'old-object-no-safe-candidate-closeout.json',
            physicalDropExecuted: false,
          },
        },
      ],
    })
    writeJson(join(dir, 'c18-live-evidence-summary.json'), {
      status: 'pass',
      gateId: 'c18-l07-l15-live-diagnostics',
      canClaimC18L07L15Closeout: true,
      items: [
        'C-18.L07',
        'C-18.L08',
        'C-18.L09',
        'C-18.L10',
        'C-18.L11',
        'C-18.L12',
        'C-18.L14',
        'C-18.L15',
      ].map((itemId) => ({ itemId, status: 'pass' })),
    })
    writeJson(join(dir, 'c19-t2-rhythm-live-replay.json'), {
      status: 'pass',
    })
    writeJson(join(dir, 'c19-construction-organization-e1-e3-e5.json'), {
      status: 'pass',
    })
    writeJson(join(dir, 'old-object-no-safe-candidate-closeout.json'), {
      status: 'pass',
      closeoutMode: 'no_safe_candidate',
      physicalDropExecuted: false,
    })

    const inventory = buildV14231LiveEvidenceInventory({
      evidenceDir: dir,
      generatedAt: '2026-06-30T12:20:00.000Z',
    })

    expect(inventory.items.find((item) => item.itemId === 'C-18.L07')).toEqual(expect.objectContaining({
      evidenceFile: join(dir, 'c18-live-evidence-summary.json'),
      normalizedStatus: 'pass',
      missingEvidenceFile: false,
    }))
    expect(inventory.items.find((item) => item.itemId === 'C-19.T2-LIVE-REPLAY')).toEqual(expect.objectContaining({
      evidenceFile: join(dir, 'c19-t2-rhythm-live-replay.json'),
      normalizedStatus: 'pass',
      missingEvidenceFile: false,
    }))
    expect(inventory.items.find((item) => item.itemId === 'C-19.CONSTRUCTION-ORG')).toEqual(expect.objectContaining({
      evidenceFile: join(dir, 'c19-construction-organization-e1-e3-e5.json'),
      normalizedStatus: 'pass',
      missingEvidenceFile: false,
    }))
    expect(inventory.items.find((item) => item.itemId === 'OLD-OBJECT-DROP')).toEqual(expect.objectContaining({
      evidenceFile: join(dir, 'old-object-no-safe-candidate-closeout.json'),
      normalizedStatus: 'pass',
      missingEvidenceFile: false,
    }))
    expect(inventory.status).toBe('blocked')
    expect(inventory.items.find((item) => item.itemId === 'C-18.L01-L03')).toEqual(expect.objectContaining({
      normalizedStatus: 'missing',
      missingEvidenceFile: true,
    }))
  })

  it('writes an archived machine-readable inventory without converting blocked evidence into pass', () => {
    const dir = mkdtempSync(join(tmpdir(), 'v14231-live-inventory-'))
    const outputFile = join(dir, 'inventory.json')
    writeJson(join(dir, 'c19-t2-rhythm-live-replay-current.json'), {
      status: 'fail',
      blockingReasons: ['no_t2_replay_samples'],
    })

    const inventory = buildV14231LiveEvidenceInventory({
      evidenceDir: dir,
      outputFile,
      generatedAt: '2026-06-29T00:31:00.000Z',
    })
    writeV14231LiveEvidenceInventoryIfRequested(inventory)

    const archived = JSON.parse(readFileSync(outputFile, 'utf8'))
    expect(archived.status).toBe('blocked')
    expect(archived.countsByNormalizedStatus.fail).toBe(1)
    expect(archived.items.find((item: { itemId: string }) => item.itemId === 'C-19.T2-LIVE-REPLAY')).toEqual(expect.objectContaining({
      normalizedStatus: 'fail',
      blockingReasons: ['no_t2_replay_samples'],
    }))
  })

  it('extracts machine-readable JSON from npm stdout wrappers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'v14231-live-inventory-'))
    const wrappedOutput = [
      '',
      '> project-management-api@1.0.0 guard:legacy-object-drop',
      '> tsx -r dotenv/config src/scripts/check-legacy-object-drop-guard.ts',
      '',
      JSON.stringify({
        status: 'blocked',
        reasons: ['row_count_zero_not_sufficient'],
        candidates: [],
      }, null, 2),
      '',
    ].join('\n')
    writeFileSync(
      join(dir, 'guard-legacy-object-drop.json'),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(wrappedOutput, 'utf16le')]),
    )

    const inventory = buildV14231LiveEvidenceInventory({
      evidenceDir: dir,
      generatedAt: '2026-06-29T00:32:00.000Z',
    })

    expect(inventory.items.find((item) => item.itemId === 'OLD-OBJECT-DROP')).toEqual(expect.objectContaining({
      normalizedStatus: 'blocked',
      rawStatus: 'blocked',
      blockingReasons: ['row_count_zero_not_sufficient'],
    }))
  })

  it('treats require-live evidence with missing route or DB files as blocked even without top-level status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'v14231-live-inventory-'))
    writeJson(join(dir, 'c18-l10-wbs-generation-require-live-blocked.json'), {
      reportCode: 'c18_l10_wbs_generation_synthetic_pressure',
      routeEvidenceFile: null,
      routeEvidenceAssessment: null,
      requireLiveEvidence: true,
      scenarios: [
        { status: 'pass' },
      ],
    })
    writeJson(join(dir, 'c18-l12-critical-path-require-live-blocked.json'), {
      reportCode: 'c18_l12_critical_path_synthetic_pressure',
      dbEvidenceFile: null,
      dbEvidenceAssessment: null,
      requireLiveEvidence: true,
      scenarios: [
        {
          status: 'pass',
          runtimeEvidenceGap: {
            missingDbWriteTiming: true,
            missingFinalProjectionReadback: true,
          },
        },
      ],
    })

    const inventory = buildV14231LiveEvidenceInventory({
      evidenceDir: dir,
      generatedAt: '2026-06-29T00:33:00.000Z',
    })

    expect(inventory.items.find((item) => item.itemId === 'C-18.L10')).toEqual(expect.objectContaining({
      normalizedStatus: 'blocked',
      rawStatus: null,
      blockingReasons: [
        'live_evidence_required',
        'missing_route_evidence_file',
        'missing_route_evidence_assessment',
      ],
    }))
    expect(inventory.items.find((item) => item.itemId === 'C-18.L12')).toEqual(expect.objectContaining({
      normalizedStatus: 'blocked',
      rawStatus: null,
      blockingReasons: [
        'live_evidence_required',
        'missing_db_evidence_file',
        'missing_db_evidence_assessment',
        'runtime_evidence_gap:missingDbWriteTiming',
        'runtime_evidence_gap:missingFinalProjectionReadback',
      ],
    }))
  })

  it('uses passing route or DB live assessment instead of stale synthetic gap details', () => {
    const dir = mkdtempSync(join(tmpdir(), 'v14231-live-inventory-'))
    writeJson(join(dir, 'c18-l10-wbs-generation-pressure.json'), {
      reportCode: 'c18_l10_wbs_generation_synthetic_pressure',
      requireLiveEvidence: true,
      routeEvidenceFile: join(dir, 'c18-l10-route-evidence.json'),
      routeEvidenceAssessment: {
        status: 'pass',
        runtimeEvidenceGap: {
          missingRouteInvocationEvidence: false,
        },
      },
      scenarios: [
        {
          status: 'pass',
        },
      ],
    })
    writeJson(join(dir, 'c18-l12-critical-path-network-pressure.json'), {
      reportCode: 'c18_l12_critical_path_synthetic_pressure',
      requireLiveEvidence: true,
      dbEvidenceFile: join(dir, 'c18-l12-db-evidence.json'),
      dbEvidenceAssessment: {
        status: 'pass',
        runtimeEvidenceGap: {
          missingPersistedNetworkData: false,
          missingDbWriteTiming: false,
        },
      },
      scenarios: [
        {
          status: 'pass',
          runtimeEvidenceGap: {
            missingPersistedNetworkData: true,
            missingDbWriteTiming: true,
          },
        },
      ],
    })
    writeJson(join(dir, 'c18-l14-company-summary-pressure.json'), {
      reportCode: 'c18_l14_company_summary_synthetic_pressure',
      requireLiveEvidence: true,
      routeEvidenceFile: join(dir, 'c18-l14-route-evidence.json'),
      routeEvidenceAssessment: {
        status: 'pass',
        runtimeEvidenceGap: {
          missingRealDbQueryLog: false,
          missingRouteCacheHitEvidence: false,
        },
      },
      scenarios: [
        {
          status: 'pass',
          runtimeEvidenceGap: {
            missingRealDbQueryLog: true,
            missingRouteCacheHitEvidence: true,
          },
        },
      ],
    })

    const inventory = buildV14231LiveEvidenceInventory({
      evidenceDir: dir,
      generatedAt: '2026-06-29T00:34:00.000Z',
    })

    expect(inventory.items.find((item) => item.itemId === 'C-18.L10')).toEqual(expect.objectContaining({
      normalizedStatus: 'pass',
      rawStatus: 'pass',
      blockingReasons: [],
    }))
    expect(inventory.items.find((item) => item.itemId === 'C-18.L12')).toEqual(expect.objectContaining({
      normalizedStatus: 'pass',
      rawStatus: 'pass',
      blockingReasons: [],
    }))
    expect(inventory.items.find((item) => item.itemId === 'C-18.L14')).toEqual(expect.objectContaining({
      normalizedStatus: 'pass',
      rawStatus: 'pass',
      blockingReasons: [],
    }))
  })
})
