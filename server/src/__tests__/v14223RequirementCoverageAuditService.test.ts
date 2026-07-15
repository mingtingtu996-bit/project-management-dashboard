import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  V14223_ACCEPTANCE_CRITERIA,
  V14223_REQUIREMENT_COVERAGE_SECTIONS,
  buildV14223AcceptanceCriteriaAudit,
  buildV14223CurrentAcceptanceCriteriaAudit,
  buildV14223CurrentHardDecisionTableAudit,
  buildV14223CurrentMachineExecutionGuardrailAudit,
  buildV14223CurrentRequirementCoverageAudit,
  buildV14223DefaultAcceptanceCriterionEvidenceRecords,
  buildV14223DefaultHardDecisionTableEvidenceRecords,
  buildV14223DefaultMachineExecutionGuardrailEvidenceRecords,
  buildV14223DefaultRequirementCoverageEvidenceRecords,
  buildV14223HardDecisionTableAudit,
  buildV14223MachineExecutionGuardrailAudit,
  buildV14223RequirementCoverageAudit,
} from '../services/v14223RequirementCoverageAuditService.js'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

function extractPlanSectionHeadings() {
  const planDoc = readFileSync(
    resolve(workspaceRoot, 'docs', 'plans', 'v1.4.22.3规则资产公司隔离与自学习体系执行方案.md'),
    'utf8',
  )
  return planDoc
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, ''))
    .filter((line) => /^#{2,3}\s/.test(line))
    .map((line) => line.replace(/^#{2,3}\s+/, '').trim())
}

function extractAcceptanceCriteria() {
  const planDoc = readFileSync(
    resolve(workspaceRoot, 'docs', 'plans', 'v1.4.22.3规则资产公司隔离与自学习体系执行方案.md'),
    'utf8',
  )
  const lines = planDoc.split(/\r?\n/).map((line) => line.replace(/^\uFEFF/, ''))
  const criteria: string[] = []
  let inAcceptance = false
  for (const line of lines) {
    if (/^## 14\.\s/.test(line)) {
      inAcceptance = true
      continue
    }
    if (inAcceptance && /^---\s*$/.test(line)) break
    if (inAcceptance && /^- /.test(line)) criteria.push(line.replace(/^- /, '').trim())
  }
  return criteria
}

function extractMachineExecutionGuardrails() {
  const planDoc = readFileSync(
    resolve(workspaceRoot, 'docs', 'plans', 'v1.4.22.3规则资产公司隔离与自学习体系执行方案.md'),
    'utf8',
  )
  const lines = planDoc.split(/\r?\n/).map((line) => line.replace(/^\uFEFF/, ''))
  const guardrails: string[] = []
  let section: '0.1' | '0.7' | '15' | null = null
  for (const line of lines) {
    if (/^## 0\.1\s/.test(line)) {
      section = '0.1'
      continue
    }
    if (/^## 0\.7\s/.test(line)) {
      section = '0.7'
      continue
    }
    if (/^## 15\.\s/.test(line)) {
      section = '15'
      continue
    }
    if (/^##\s/.test(line)) {
      section = null
      continue
    }
    if ((section === '0.1' || section === '0.7') && /^\d+\.\s/.test(line)) {
      guardrails.push(line.replace(/^\d+\.\s+/, '').trim())
    }
    if (section === '15' && /^- /.test(line)) {
      guardrails.push(line.replace(/^- /, '').trim())
    }
  }
  return guardrails
}

function extractHardDecisionTableRows() {
  const planDoc = readFileSync(
    resolve(workspaceRoot, 'docs', 'plans', 'v1.4.22.3规则资产公司隔离与自学习体系执行方案.md'),
    'utf8',
  )
  const lines = planDoc.split(/\r?\n/).map((line) => line.replace(/^\uFEFF/, ''))
  const rows: Array<{
    discoveryCondition: string
    allowedAction: string
    forbiddenAction: string
  }> = []
  let inHardDecisionTable = false
  for (const line of lines) {
    if (/^## 0\.2\s/.test(line)) {
      inHardDecisionTable = true
      continue
    }
    if (inHardDecisionTable && /^##\s/.test(line)) break
    if (!inHardDecisionTable || !/^\| .+ \| .+ \| .+ \|$/.test(line)) continue
    if (line.includes('发现情况') || line.includes('---')) continue
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())
    rows.push({
      discoveryCondition: cells[0] ?? '',
      allowedAction: cells[1] ?? '',
      forbiddenAction: cells[2] ?? '',
    })
  }
  return rows
}

function evidenceRefPath(ref: string) {
  return ref
    .split(' forbids ')[0]
    .split(' :: ')[0]
    .trim()
}

function assetInstanceCompletionEvidenceFor(criterionId: string) {
  return {
    assetType: 'v14223_acceptance_criterion',
    scope: `section_14.${criterionId}`,
    writerEvidenceRefs: [
      'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: writer evidence for asset-instance completion contract',
    ],
    consumerEvidenceRefs: [
      'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: consumer evidence for asset-instance completion contract',
    ],
    monitoringEvidenceRefs: [
      'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: monitoring evidence for asset-instance completion contract',
    ],
    releaseRecordEvidenceRefs: [
      'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: release record evidence for asset-instance completion contract',
    ],
    rollbackEvidenceRefs: [
      'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: rollback evidence for asset-instance completion contract',
    ],
    oldObjectHandlingEvidenceRefs: [
      'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: old-object handling evidence for asset-instance completion contract',
    ],
  }
}

describe('v14223RequirementCoverageAuditService', () => {
  it('keeps the requirement coverage catalog aligned to every v1.4.22.3 document section', () => {
    const documentHeadings = extractPlanSectionHeadings()
    const catalogHeadings = V14223_REQUIREMENT_COVERAGE_SECTIONS.map((section) => section.sourceHeading)

    expect(catalogHeadings).toEqual(documentHeadings)
    expect(new Set(V14223_REQUIREMENT_COVERAGE_SECTIONS.map((section) => section.sectionId)).size)
      .toBe(V14223_REQUIREMENT_COVERAGE_SECTIONS.length)
    expect(V14223_REQUIREMENT_COVERAGE_SECTIONS.every((section) => section.requiredEvidenceKinds.length > 0))
      .toBe(true)
    expect(V14223_REQUIREMENT_COVERAGE_SECTIONS.every((section) => section.overExecutionGuardrails.length > 0))
      .toBe(true)
  })

  it('keeps the acceptance criteria catalog aligned to every v1.4.22.3 section 14 bullet', () => {
    const documentCriteria = extractAcceptanceCriteria()
    const catalogCriteria = V14223_ACCEPTANCE_CRITERIA.map((criterion) => criterion.sourceExcerpt)

    expect(documentCriteria.length).toBeGreaterThan(30)
    expect(catalogCriteria).toEqual(documentCriteria)
    expect(new Set(V14223_ACCEPTANCE_CRITERIA.map((criterion) => criterion.criterionId)).size)
      .toBe(V14223_ACCEPTANCE_CRITERIA.length)
    expect(V14223_ACCEPTANCE_CRITERIA.every((criterion) => criterion.requiredEvidenceKinds.length > 0))
      .toBe(true)
    expect(V14223_ACCEPTANCE_CRITERIA.every((criterion) => criterion.overExecutionGuardrails.length > 0))
      .toBe(true)
  })

  it('builds item-level coverage for every machine execution guardrail and not-do rule', () => {
    const documentGuardrails = extractMachineExecutionGuardrails()
    const defaultEvidence = buildV14223DefaultMachineExecutionGuardrailEvidenceRecords(documentGuardrails)
    const audit = buildV14223MachineExecutionGuardrailAudit({
      currentSnapshotGatePassed: true,
      documentMachineExecutionGuardrails: documentGuardrails,
      evidenceRecords: defaultEvidence,
    })

    expect(documentGuardrails.length).toBeGreaterThan(65)
    expect(defaultEvidence).toHaveLength(documentGuardrails.length)
    expect(new Set(defaultEvidence.map((record) => record.guardrailId)).size)
      .toBe(defaultEvidence.length)
    expect(audit.status).toBe('machine_execution_guardrail_coverage_ready')
    expect(audit.allowedClaim).toBe('all_machine_execution_guardrails_have_current_evidence_mapping')
    expect(audit.prohibitedClaims).toEqual([
      'v14223_chapter_complete',
      'machine_guardrails_runtime_closed',
      'all_assets_auto_publish_ready',
    ])
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'machine_guardrail_item_coverage_is_required_before_chapter_completion_candidate',
      'machine_guardrail_coverage_does_not_grant_publish_rights',
      'not_do_items_are_guardrails_not_optional_notes',
    ]))
  })

  it('builds row-level coverage for every machine hard-decision table row', () => {
    const documentRows = extractHardDecisionTableRows()
    const defaultEvidence = buildV14223DefaultHardDecisionTableEvidenceRecords(documentRows)
    const audit = buildV14223HardDecisionTableAudit({
      currentSnapshotGatePassed: true,
      documentHardDecisionRows: documentRows,
      evidenceRecords: defaultEvidence,
    })

    expect(documentRows.length).toBeGreaterThan(35)
    expect(documentRows.every((row) =>
      row.discoveryCondition.length > 0
      && row.allowedAction.length > 0
      && row.forbiddenAction.length > 0,
    )).toBe(true)
    expect(defaultEvidence).toHaveLength(documentRows.length)
    expect(new Set(defaultEvidence.map((record) => record.rowId)).size)
      .toBe(defaultEvidence.length)
    expect(audit.status).toBe('hard_decision_table_coverage_ready')
    expect(audit.allowedClaim).toBe('all_hard_decision_table_rows_have_current_evidence_mapping')
    expect(audit.prohibitedClaims).toEqual([
      'v14223_chapter_complete',
      'hard_decision_rows_runtime_closed',
      'all_assets_auto_publish_ready',
    ])
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'hard_decision_table_row_coverage_is_required_before_chapter_completion_candidate',
      'hard_decision_table_rows_define_action_limits_not_publish_rights',
      'forbidden_action_column_is_guardrail_not_comment',
    ]))
  })

  it('requires current grounded evidence and forbidden-action evidence for every hard-decision row', () => {
    const documentRows = extractHardDecisionTableRows()
    const defaultEvidence = buildV14223DefaultHardDecisionTableEvidenceRecords(documentRows)
    const incompleteEvidence = defaultEvidence.slice(1)
    incompleteEvidence[0] = {
      ...incompleteEvidence[0],
      evidenceRefs: ['manual note :: hard decision table row covered'],
      forbiddenActionEvidenceRefs: [],
      remainingGaps: ['hard_decision_forbidden_action_current_evidence_missing'],
    }

    const audit = buildV14223HardDecisionTableAudit({
      currentSnapshotGatePassed: false,
      documentHardDecisionRows: documentRows,
      evidenceRecords: incompleteEvidence,
    })

    expect(audit.status).toBe('hard_decision_table_coverage_review_required')
    expect(audit.allowedClaim).toBe('not_ready_for_hard_decision_table_claim')
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'current_snapshot_gate_rerun_required',
      `hard_decision_row:${defaultEvidence[0].rowId}:hard_decision_row_evidence_record_required`,
      `${incompleteEvidence[0].rowId}:hard_decision_evidence_refs_must_reference_existing_workspace_files`,
      `${incompleteEvidence[0].rowId}:hard_decision_forbidden_action_evidence_refs_required`,
      `${incompleteEvidence[0].rowId}:remaining_gap:hard_decision_forbidden_action_current_evidence_missing`,
    ]))
  })

  it('builds current hard-decision table audit from the current document rows', () => {
    const documentRows = extractHardDecisionTableRows()
    const audit = buildV14223CurrentHardDecisionTableAudit({
      currentSnapshotGatePassed: true,
      documentHardDecisionRows: documentRows,
    })

    expect(audit.status).toBe('hard_decision_table_coverage_ready')
    expect(audit.rowResults.every((result) => result.status === 'verified')).toBe(true)
  })

  it('requires current grounded evidence for every machine execution guardrail item', () => {
    const documentGuardrails = extractMachineExecutionGuardrails()
    const defaultEvidence = buildV14223DefaultMachineExecutionGuardrailEvidenceRecords(documentGuardrails)
    const incompleteEvidence = defaultEvidence.slice(1)
    incompleteEvidence[0] = {
      ...incompleteEvidence[0],
      evidenceRefs: ['manual note :: summary says this guardrail is covered'],
      forbiddenPathEvidenceRefs: [],
      remainingGaps: ['manual_anchor_guardrail_current_evidence_missing'],
    }

    const audit = buildV14223MachineExecutionGuardrailAudit({
      currentSnapshotGatePassed: false,
      documentMachineExecutionGuardrails: documentGuardrails,
      evidenceRecords: incompleteEvidence,
    })

    expect(audit.status).toBe('machine_execution_guardrail_coverage_review_required')
    expect(audit.allowedClaim).toBe('not_ready_for_machine_guardrail_claim')
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'current_snapshot_gate_rerun_required',
      `machine_guardrail:${defaultEvidence[0].guardrailId}:machine_guardrail_evidence_record_required`,
      `${incompleteEvidence[0].guardrailId}:guardrail_evidence_refs_must_reference_existing_workspace_files`,
      `${incompleteEvidence[0].guardrailId}:guardrail_forbidden_path_evidence_refs_required`,
      `${incompleteEvidence[0].guardrailId}:remaining_gap:manual_anchor_guardrail_current_evidence_missing`,
    ]))
  })

  it('builds current machine guardrail audit from the current document items', () => {
    const documentGuardrails = extractMachineExecutionGuardrails()
    const audit = buildV14223CurrentMachineExecutionGuardrailAudit({
      currentSnapshotGatePassed: true,
      documentMachineExecutionGuardrails: documentGuardrails,
    })

    expect(audit.status).toBe('machine_execution_guardrail_coverage_ready')
    expect(audit.guardrailResults.every((result) => result.status === 'verified')).toBe(true)
  })

  it('builds a default current evidence matrix for every document section', () => {
    const defaultEvidence = buildV14223DefaultRequirementCoverageEvidenceRecords()

    expect(defaultEvidence).toHaveLength(V14223_REQUIREMENT_COVERAGE_SECTIONS.length)
    expect(new Set(defaultEvidence.map((record) => record.sectionId)).size)
      .toBe(defaultEvidence.length)

    for (const section of V14223_REQUIREMENT_COVERAGE_SECTIONS) {
      const record = defaultEvidence.find((candidate) => candidate.sectionId === section.sectionId)

      expect(record?.status).toBe('verified')
      for (const kind of section.requiredEvidenceKinds) {
        expect(record?.evidenceKinds).toContain(kind)
      }
      expect(record?.evidenceRefs.length).toBeGreaterThan(0)
      expect(record?.evidenceRefs.every((ref) => ref.trim().length > 0)).toBe(true)
      expect(record?.forbiddenPathEvidenceRefs.length).toBeGreaterThan(0)
      expect(record?.forbiddenPathEvidenceRefs.every((ref) => ref.trim().length > 0)).toBe(true)
      expect(record?.remainingGaps).toEqual([])
    }
  })

  it('keeps default evidence references grounded in current workspace files', () => {
    const defaultEvidence = buildV14223DefaultRequirementCoverageEvidenceRecords()
    const refs = defaultEvidence.flatMap((record) => [
      ...record.evidenceRefs,
      ...record.forbiddenPathEvidenceRefs,
    ])

    expect(refs.length).toBeGreaterThan(V14223_REQUIREMENT_COVERAGE_SECTIONS.length)
    for (const ref of refs) {
      expect(ref).not.toMatch(/manual note|todo|tbd|historical_evidence_needs_refresh/i)
      expect(existsSync(resolve(workspaceRoot, evidenceRefPath(ref))), ref).toBe(true)
    }
  })

  it('builds grounded default evidence for every acceptance criterion', () => {
    const defaultEvidence = buildV14223DefaultAcceptanceCriterionEvidenceRecords()

    expect(defaultEvidence).toHaveLength(V14223_ACCEPTANCE_CRITERIA.length)
    expect(new Set(defaultEvidence.map((record) => record.criterionId)).size)
      .toBe(defaultEvidence.length)

    for (const criterion of V14223_ACCEPTANCE_CRITERIA) {
      const record = defaultEvidence.find((candidate) => candidate.criterionId === criterion.criterionId)
      expect(record?.status).toBe('verified')
      expect(record?.completionEvidenceLevel).toBe('coverage_mapping_only')
      for (const kind of criterion.requiredEvidenceKinds) {
        expect(record?.evidenceKinds).toContain(kind)
      }
      expect(record?.evidenceRefs.length).toBeGreaterThan(0)
      expect(record?.forbiddenPathEvidenceRefs.length).toBeGreaterThan(0)
      expect(record?.remainingGaps).toEqual([])
    }

    for (const ref of defaultEvidence.flatMap((record) => [
      ...record.evidenceRefs,
      ...record.forbiddenPathEvidenceRefs,
    ])) {
      expect(ref).not.toMatch(/manual note|todo|tbd|historical_evidence_needs_refresh/i)
      expect(existsSync(resolve(workspaceRoot, evidenceRefPath(ref))), ref).toBe(true)
    }
  })

  it('requires current evidence for every acceptance criterion before the section 14 claim', () => {
    const incompleteEvidence = buildV14223DefaultAcceptanceCriterionEvidenceRecords()
      .filter((record) => record.criterionId !== 'acceptance_legacy_scope_fields_blocked')
    incompleteEvidence[0] = {
      ...incompleteEvidence[0],
      forbiddenPathEvidenceRefs: [],
      remainingGaps: ['company_isolation_runtime_consumer_evidence_missing'],
    }

    const audit = buildV14223AcceptanceCriteriaAudit({
      currentSnapshotGatePassed: false,
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
      evidenceRecords: incompleteEvidence,
    })

    expect(audit.status).toBe('acceptance_criteria_coverage_review_required')
    expect(audit.allowedClaim).toBe('not_ready_for_acceptance_criteria_claim')
    expect(audit.prohibitedClaims).toEqual([
      'v14223_chapter_complete',
      'section_14_acceptance_complete',
      'all_acceptance_items_runtime_closed',
    ])
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'current_snapshot_gate_rerun_required',
      'acceptance_company_isolation_no_cross_read:criterion_forbidden_path_evidence_refs_required',
      'acceptance_company_isolation_no_cross_read:remaining_gap:company_isolation_runtime_consumer_evidence_missing',
      'acceptance_legacy_scope_fields_blocked:acceptance_criterion_evidence_record_required',
    ]))
  })

  it('requires current-snapshot evidence and forbidden-path evidence for every section', () => {
    const incompleteEvidence = buildV14223DefaultRequirementCoverageEvidenceRecords()
      .filter((record) => record.sectionId !== '12')
    incompleteEvidence[0] = {
      ...incompleteEvidence[0],
      forbiddenPathEvidenceRefs: [],
      remainingGaps: ['range_tree_boundary_current_scan_missing'],
    }

    const audit = buildV14223RequirementCoverageAudit({
      currentSnapshotGatePassed: false,
      documentHeadings: extractPlanSectionHeadings(),
      evidenceRecords: incompleteEvidence,
    })

    expect(audit.status).toBe('document_requirement_coverage_review_required')
    expect(audit.allowedClaim).toBe('not_ready_for_document_requirement_coverage_claim')
    expect(audit.prohibitedClaims).toEqual([
      'v14223_chapter_complete',
      'all_assets_auto_publish_ready',
      'future_assets_covered_without_rerun',
    ])
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'current_snapshot_gate_rerun_required',
      '0:section_forbidden_path_evidence_refs_required',
      '0:remaining_gap:range_tree_boundary_current_scan_missing',
      '12:section_evidence_record_required',
    ]))
  })

  it('declares only document requirement coverage ready when every section is mapped', () => {
    const audit = buildV14223CurrentRequirementCoverageAudit({
      currentSnapshotGatePassed: true,
      documentHeadings: extractPlanSectionHeadings(),
    })

    expect(audit.status).toBe('document_requirement_coverage_ready')
    expect(audit.allowedClaim).toBe('all_document_sections_have_current_evidence_mapping')
    expect(audit.missingReasons).toEqual([])
    expect(audit.sectionResults.every((section) => section.status === 'verified')).toBe(true)
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'document_section_coverage_is_required_before_chapter_completion_candidate',
      'section_coverage_does_not_grant_publish_rights',
      'coverage_means_requirement_mapping_not_runtime_completion',
      'every_section_requires_forbidden_path_evidence',
    ]))
  })

  it('declares only acceptance criteria coverage ready when every section 14 item is mapped', () => {
    const audit = buildV14223CurrentAcceptanceCriteriaAudit({
      currentSnapshotGatePassed: true,
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
    })

    expect(audit.status).toBe('acceptance_criteria_coverage_ready')
    expect(audit.allowedClaim).toBe('all_acceptance_criteria_have_current_evidence_mapping')
    expect(audit.completionEvidenceLevel).toBe('coverage_mapping_only')
    expect(audit.canUseForChapterCompletionCandidate).toBe(false)
    expect(audit.missingReasons).toEqual([])
    expect(audit.criterionResults.every((criterion) => criterion.status === 'verified')).toBe(true)
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'section_14_acceptance_criteria_are_required_before_chapter_completion_candidate',
      'acceptance_criteria_coverage_does_not_grant_publish_rights',
      'acceptance_criteria_coverage_mapping_is_not_completion_evidence',
      'each_acceptance_item_requires_forbidden_path_evidence',
    ]))
  })

  it('accepts partial asset-instance evidence without converting all section 14 criteria to completion evidence', () => {
    const audit = buildV14223CurrentAcceptanceCriteriaAudit({
      currentSnapshotGatePassed: true,
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
      assetInstanceCompletionEvidence: [{
        criterionId: 'acceptance_runtime_rollback_requires_writer_and_consumer_verification',
        evidence: assetInstanceCompletionEvidenceFor('acceptance_runtime_rollback_requires_writer_and_consumer_verification'),
        evidenceRefs: [
          'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: partial asset-instance evidence contract',
        ],
      }, {
        criterionId: 'acceptance_candidate_no_direct_runtime_effect',
        evidence: assetInstanceCompletionEvidenceFor('acceptance_candidate_no_direct_runtime_effect'),
        evidenceRefs: [
          'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: candidate no direct runtime effect asset-instance evidence contract',
        ],
      }, {
        criterionId: 'acceptance_auto_publish_requires_full_release_chain',
        evidence: assetInstanceCompletionEvidenceFor('acceptance_auto_publish_requires_full_release_chain'),
        evidenceRefs: [
          'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: auto publish full release chain asset-instance evidence contract',
        ],
      }, {
        criterionId: 'acceptance_canary_requires_consumer_monitoring_rollback',
        evidence: assetInstanceCompletionEvidenceFor('acceptance_canary_requires_consumer_monitoring_rollback'),
        evidenceRefs: [
          'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: canary consumer monitoring rollback asset-instance evidence contract',
        ],
      }, {
        criterionId: 'acceptance_governance_metrics_registered',
        evidence: assetInstanceCompletionEvidenceFor('acceptance_governance_metrics_registered'),
        evidenceRefs: [
          'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: metric asset-instance evidence contract',
        ],
      }, {
        criterionId: 'acceptance_future_asset_rerun_matrix_ready_is_snapshot_only',
        evidence: assetInstanceCompletionEvidenceFor('acceptance_future_asset_rerun_matrix_ready_is_snapshot_only'),
        evidenceRefs: [
          'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: future asset rerun matrix snapshot-only asset-instance evidence contract',
        ],
      }, {
        criterionId: 'acceptance_readonly_inventory_routes_are_evidence_layer_only',
        evidence: assetInstanceCompletionEvidenceFor('acceptance_readonly_inventory_routes_are_evidence_layer_only'),
        evidenceRefs: [
          'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: readonly inventory route evidence-layer asset-instance evidence contract',
        ],
      }, {
        criterionId: 'acceptance_legacy_scope_fields_blocked',
        evidence: assetInstanceCompletionEvidenceFor('acceptance_legacy_scope_fields_blocked'),
        evidenceRefs: [
          'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: legacy scope field blocking asset-instance evidence contract',
        ],
      }],
    })

    expect(audit.status).toBe('acceptance_criteria_coverage_ready')
    expect(audit.completionEvidenceLevel).toBe('coverage_mapping_only')
    expect(audit.canUseForChapterCompletionCandidate).toBe(false)
    expect(audit.missingReasons).toEqual([])
    expect(audit.criterionResults).toEqual(expect.arrayContaining([
      expect.objectContaining({
        criterionId: 'acceptance_runtime_rollback_requires_writer_and_consumer_verification',
        status: 'verified',
        missingReasons: [],
      }),
      expect.objectContaining({
        criterionId: 'acceptance_governance_metrics_registered',
        status: 'verified',
        missingReasons: [],
      }),
      expect.objectContaining({
        criterionId: 'acceptance_candidate_no_direct_runtime_effect',
        status: 'verified',
        missingReasons: [],
      }),
      expect.objectContaining({
        criterionId: 'acceptance_auto_publish_requires_full_release_chain',
        status: 'verified',
        missingReasons: [],
      }),
      expect.objectContaining({
        criterionId: 'acceptance_canary_requires_consumer_monitoring_rollback',
        status: 'verified',
        missingReasons: [],
      }),
      expect.objectContaining({
        criterionId: 'acceptance_future_asset_rerun_matrix_ready_is_snapshot_only',
        status: 'verified',
        missingReasons: [],
      }),
      expect.objectContaining({
        criterionId: 'acceptance_readonly_inventory_routes_are_evidence_layer_only',
        status: 'verified',
        missingReasons: [],
      }),
      expect.objectContaining({
        criterionId: 'acceptance_legacy_scope_fields_blocked',
        status: 'verified',
        missingReasons: [],
      }),
    ]))
  })

  it('only treats section 14 evidence as chapter-candidate input when every acceptance item has asset-instance completion evidence', () => {
    const assetInstanceEvidence = buildV14223DefaultAcceptanceCriterionEvidenceRecords()
      .map((record) => ({
        ...record,
        completionEvidenceLevel: 'asset_instance_completion_evidence' as const,
        assetInstanceCompletionEvidence: assetInstanceCompletionEvidenceFor(record.criterionId),
        evidenceRefs: [
          ...record.evidenceRefs,
          'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: asset-instance completion proof contract',
        ],
      }))

    const audit = buildV14223AcceptanceCriteriaAudit({
      currentSnapshotGatePassed: true,
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
      evidenceRecords: assetInstanceEvidence,
    })

    expect(audit.status).toBe('acceptance_criteria_coverage_ready')
    expect(audit.completionEvidenceLevel).toBe('asset_instance_completion_evidence')
    expect(audit.canUseForChapterCompletionCandidate).toBe(true)
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'acceptance_criteria_chapter_candidate_requires_asset_instance_completion_evidence',
    ]))
  })

  it('rejects asset-instance completion level when the structured writer consumer monitoring rollback evidence is missing', () => {
    const evidenceWithoutStructuredCompletion = buildV14223DefaultAcceptanceCriterionEvidenceRecords()
      .map((record) => ({
        ...record,
        completionEvidenceLevel: 'asset_instance_completion_evidence' as const,
      }))

    const audit = buildV14223AcceptanceCriteriaAudit({
      currentSnapshotGatePassed: true,
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
      evidenceRecords: evidenceWithoutStructuredCompletion,
    })

    expect(audit.status).toBe('acceptance_criteria_coverage_review_required')
    expect(audit.completionEvidenceLevel).toBe('coverage_mapping_only')
    expect(audit.canUseForChapterCompletionCandidate).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'acceptance_company_isolation_no_cross_read:asset_instance_completion_evidence_required',
    ]))
  })

  it('rejects asset-instance completion evidence refs that are manual notes or missing workspace files', () => {
    const invalidEvidence = buildV14223DefaultAcceptanceCriterionEvidenceRecords()
      .map((record) => ({
        ...record,
        completionEvidenceLevel: 'asset_instance_completion_evidence' as const,
        assetInstanceCompletionEvidence: {
          ...assetInstanceCompletionEvidenceFor(record.criterionId),
          writerEvidenceRefs: ['manual note :: writer proof invented by summary'],
          consumerEvidenceRefs: ['server/src/__tests__/does-not-exist-v14223-proof.test.ts :: consumer proof'],
        },
      }))

    const audit = buildV14223AcceptanceCriteriaAudit({
      currentSnapshotGatePassed: true,
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
      evidenceRecords: invalidEvidence,
    })

    expect(audit.status).toBe('acceptance_criteria_coverage_review_required')
    expect(audit.completionEvidenceLevel).toBe('coverage_mapping_only')
    expect(audit.canUseForChapterCompletionCandidate).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'acceptance_company_isolation_no_cross_read:asset_instance_writer_evidence_refs_must_reference_existing_workspace_files',
      'acceptance_company_isolation_no_cross_read:asset_instance_consumer_evidence_refs_must_reference_existing_workspace_files',
    ]))
  })

  it('rejects asset-instance completion evidence refs that point only to files without a specific assertion anchor', () => {
    const invalidEvidence = buildV14223DefaultAcceptanceCriterionEvidenceRecords()
      .map((record) => ({
        ...record,
        completionEvidenceLevel: 'asset_instance_completion_evidence' as const,
        assetInstanceCompletionEvidence: {
          ...assetInstanceCompletionEvidenceFor(record.criterionId),
          writerEvidenceRefs: ['server/src/__tests__/v14223RequirementCoverageAuditService.test.ts'],
          consumerEvidenceRefs: [
            'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: test file',
          ],
        },
      }))

    const audit = buildV14223AcceptanceCriteriaAudit({
      currentSnapshotGatePassed: true,
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
      evidenceRecords: invalidEvidence,
    })

    expect(audit.status).toBe('acceptance_criteria_coverage_review_required')
    expect(audit.completionEvidenceLevel).toBe('coverage_mapping_only')
    expect(audit.canUseForChapterCompletionCandidate).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'acceptance_company_isolation_no_cross_read:asset_instance_writer_evidence_refs_must_reference_specific_assertions',
      'acceptance_company_isolation_no_cross_read:asset_instance_consumer_evidence_refs_must_reference_specific_assertions',
    ]))
  })
})
