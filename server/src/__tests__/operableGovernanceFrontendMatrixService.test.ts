import { describe, expect, it } from 'vitest'

import {
  buildOperableGovernanceFrontendMatrix,
  buildV14223OperableGovernanceFrontendMatrix,
} from '../services/operableGovernanceFrontendMatrixService.js'

describe('operableGovernanceFrontendMatrixService', () => {
  it('keeps the operable frontend matrix incomplete until every controlled operation surface has evidence', () => {
    const matrix = buildOperableGovernanceFrontendMatrix({
      evidence: [
        {
          surface: 'company_admin_operation_ui',
          status: 'verified',
          evidenceRefs: ['RuleAssetGovernanceWorkbenchAdmin'],
        },
        {
          surface: 'frontend_operation_api_contract',
          status: 'verified',
          evidenceRefs: ['ruleAssetGovernanceWorkbenchApi'],
        },
        {
          surface: 'operation_permission_boundary',
          status: 'not_applicable',
        },
      ],
    })

    expect(matrix.status).toBe('operable_governance_frontend_incomplete')
    expect(matrix.canDeclareOperableGovernanceFrontendComplete).toBe(false)
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'operation_permission_boundary',
        status: 'incomplete',
        missingReasons: expect.arrayContaining(['operation_permission_boundary_not_applicable_requires_reason']),
      }),
      expect.objectContaining({
        surface: 'forbidden_action_states',
        status: 'incomplete',
        missingReasons: ['forbidden_action_states_evidence_required'],
      }),
      expect.objectContaining({
        surface: 'domain_handoff_result_display',
        status: 'incomplete',
        missingReasons: ['domain_handoff_result_display_evidence_required'],
      }),
    ]))
    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'operable_frontend_does_not_grant_publish_rights',
      'operation_ui_only_calls_controlled_handoff_api',
    ]))
  })

  it('confirms the v1.4.22.3 controlled operation frontend without completing all domain writers', () => {
    const matrix = buildV14223OperableGovernanceFrontendMatrix()

    expect(matrix.status).toBe('operable_governance_frontend_confirmed')
    expect(matrix.canDeclareOperableGovernanceFrontendComplete).toBe(true)
    expect(matrix.requiredSurfaces).toEqual([
      'company_admin_operation_ui',
      'frontend_operation_api_contract',
      'operation_permission_boundary',
      'forbidden_action_states',
      'domain_handoff_result_display',
    ])
    expect(matrix.rows.every((row) => row.status === 'confirmed')).toBe(true)
    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'operation_result_must_display_blocked_or_delegated_boundary',
      'manual_no_unattended_anchors_remain_hard_blockers',
      'complete_operable_frontend_is_not_all_domain_writer_completion',
    ]))
  })

  it('does not allow required controlled operation surfaces to be bypassed as not applicable', () => {
    const matrix = buildOperableGovernanceFrontendMatrix({
      evidence: [
        {
          surface: 'company_admin_operation_ui',
          status: 'verified',
          evidenceRefs: ['RuleAssetGovernanceWorkbenchAdmin'],
        },
        {
          surface: 'frontend_operation_api_contract',
          status: 'verified',
          evidenceRefs: ['ruleAssetGovernanceWorkbenchApi'],
        },
        {
          surface: 'operation_permission_boundary',
          status: 'verified',
          evidenceRefs: ['algorithm-seeds route admin guard'],
        },
        {
          surface: 'forbidden_action_states',
          status: 'not_applicable',
          reason: 'all actions are enabled in this run',
          evidenceRefs: ['manual note'],
        },
        {
          surface: 'domain_handoff_result_display',
          status: 'verified',
          evidenceRefs: ['operation handoff result display'],
        },
      ],
    })

    expect(matrix.status).toBe('operable_governance_frontend_incomplete')
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'forbidden_action_states',
        status: 'incomplete',
        missingReasons: ['forbidden_action_states_verified_status_required'],
      }),
    ]))
  })
})
