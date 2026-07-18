import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildIssueConfirmClosePatch,
  buildIssueKeepProcessingPatch,
  buildRiskConfirmClosePatch,
  buildRiskKeepProcessingPatch,
} from '../domain/riskIssueWorkflowPolicy.js'
import { riskIssueClosureOutcomeSchema } from '../middleware/validation.js'

const outcome = {
  resultCode: 'resolved' as const,
  resultSummary: 'Corrective action completed and verified on site.',
  effectiveness: 'resolved' as const,
  evidenceRefs: ['inspection:inspection-1'],
  causeAttributionId: '00000000-0000-4000-8000-000000000001',
}

describe('risk and issue structured closure outcome', () => {
  it('requires a controlled result code, effectiveness, and human-readable summary', () => {
    expect(riskIssueClosureOutcomeSchema.safeParse(outcome).success).toBe(true)
    expect(riskIssueClosureOutcomeSchema.safeParse({ resultCode: 'resolved' }).success).toBe(false)
    expect(riskIssueClosureOutcomeSchema.safeParse({
      ...outcome,
      resultCode: 'free_text_code',
    }).success).toBe(false)
  })

  it('writes the structured outcome on manual risk and issue closure', () => {
    const riskPatch = buildRiskConfirmClosePatch(outcome, 'user-1')
    const issuePatch = buildIssueConfirmClosePatch(outcome, 'user-1')

    for (const patch of [riskPatch, issuePatch]) {
      expect(patch).toEqual(expect.objectContaining({
        status: 'closed',
        pending_manual_close: false,
        closed_reason: 'manual_confirmed_close',
        closure_result_code: 'resolved',
        closure_result_summary: outcome.resultSummary,
        closure_effectiveness: 'resolved',
        closure_evidence_refs: ['inspection:inspection-1'],
        closure_cause_attribution_id: outcome.causeAttributionId,
        closed_by: 'user-1',
      }))
    }
  })

  it('clears stale closure outcome fields when processing resumes', () => {
    for (const patch of [buildRiskKeepProcessingPatch(), buildIssueKeepProcessingPatch()]) {
      expect(patch).toEqual(expect.objectContaining({
        closed_reason: null,
        closed_at: null,
        closure_result_code: null,
        closure_result_summary: null,
        closure_effectiveness: null,
        closure_evidence_refs: [],
        closure_cause_attribution_id: null,
        closed_by: null,
        closure_recorded_at: null,
      }))
    }
  })

  it('enforces the outcome in generic writes and both manual-close routes', () => {
    const serverRoot = process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server')
    const dbService = readFileSync(resolve(serverRoot, 'src/services/dbService.ts'), 'utf8')
    const risksRoute = readFileSync(resolve(serverRoot, 'src/routes/risks.ts'), 'utf8')
    const issuesRoute = readFileSync(resolve(serverRoot, 'src/routes/issues.ts'), 'utf8')
    const retentionService = readFileSync(resolve(serverRoot, 'src/services/deletionRetentionGovernanceService.ts'), 'utf8')

    expect(dbService).toContain('CLOSURE_OUTCOME_REQUIRED')
    expect(dbService).toContain("'closure_result_code', 'closure_result_summary', 'closure_effectiveness'")
    expect(dbService).toContain("'closure_evidence_refs', 'closure_cause_attribution_id', 'closed_by'")
    expect(risksRoute).toContain('riskIssueClosureOutcomeSchema')
    expect(issuesRoute).toContain('riskIssueClosureOutcomeSchema')
    expect(risksRoute).toContain('resultCode: req.body.resultCode')
    expect(issuesRoute).toContain('resultCode: req.body.resultCode')
    expect(risksRoute).toContain('closeRiskByRetention')
    expect(issuesRoute).toContain('closeIssueByRetentionInMainChain')
    expect(retentionService).toContain('closeRiskByRetention')
    expect(retentionService).toContain('closeIssueByRetentionInMainChain')
  })
})
