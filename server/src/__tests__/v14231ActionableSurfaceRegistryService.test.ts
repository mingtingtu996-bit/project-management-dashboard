import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildV14231ActionableSurfaceLedger,
  getV14231ActionableSurface,
  listV14231ActionableSurfaces,
} from '../services/v14231ActionableSurfaceRegistryService.js'

const workspaceRoot = resolve(process.cwd().endsWith('server') ? resolve(process.cwd(), '..') : process.cwd())

describe('v1.4.23.1 actionable surface registry', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  it('lists C-07/C-09/C-12 action surfaces without granting production-ready actions', () => {
    const ledger = buildV14231ActionableSurfaceLedger()
    const surfaces = listV14231ActionableSurfaces()

    expect(ledger.sourcePlan).toBe('v1.4.23.1-A')
    expect(ledger.defaultUnregisteredSurfaceStatus).toBe('display-only')
    expect(surfaces.map((surface) => surface.key)).toEqual([
      'notification_attention_todo',
      'warning_issue_closure',
      'retention_delete_operator_action',
      'responsibility_recovery_confirmation',
      'workspace_progress_entry_action',
      'workspace_governance_prediction_todo_action',
      'rule_asset_governance_review_action',
      'rule_asset_stable_publication_action',
      'rule_asset_template_replacement_action',
      'rule_asset_runtime_evidence_action',
      'rule_asset_runtime_rollback_action',
      'construction_organization_runtime_publication_action',
      'duration_accuracy_auto_publish_action',
      'duration_accuracy_force_stable_action',
      'duration_accuracy_rollback_close_action',
    ])

    for (const surface of surfaces) {
      expect(surface.owningUnit).toBe('主执行环：行动闭环')
      expect(surface.sourceIdentityRequired).toBe(true)
      expect(surface.targetIdentityRequired).toBe(true)
      expect(surface.permissionGate.length).toBeGreaterThan(0)
      expect(surface.auditTrail.length).toBeGreaterThan(0)
      expect(surface.failureRecovery.length).toBeGreaterThan(0)
      expect(surface.stableTargetRoute.length).toBeGreaterThan(0)
      expect(surface.boundaryPolicy).toEqual(expect.objectContaining({
        writesRuntimePublication: false,
        declaresProductionReady: false,
      }))
      expect(surface.boundaryPolicy.canUseAsStableAction).toBe(surface.status === 'stable_action')
      expect(surface.boundaryPolicy.requiresLiveEvidenceForUpgrade).toBe(surface.status !== 'stable_action')
      expect(surface.sourceCloseoutItems).toEqual(expect.arrayContaining([
        expect.stringMatching(/^C-/),
      ]))
    }
  })

  it('keeps evidence pointers real and local to the codebase', () => {
    const surfaces = listV14231ActionableSurfaces()

    for (const surface of surfaces) {
      expect(surface.codeEvidence.length, `${surface.key} missing code evidence`).toBeGreaterThan(0)
      expect(surface.testEvidence.length, `${surface.key} missing test evidence`).toBeGreaterThan(0)
      for (const evidencePath of [...surface.codeEvidence, ...surface.testEvidence]) {
        expect(
          existsSync(resolve(workspaceRoot, evidencePath)),
          `${surface.key} evidence path missing: ${evidencePath}`,
        ).toBe(true)
      }
    }
  })

  it('fails unregistered action surfaces closed for stable-action consumption', () => {
    expect(getV14231ActionableSurface('future_auto_close_action')).toBeNull()
    expect(buildV14231ActionableSurfaceLedger().defaultUnregisteredSurfaceStatus).toBe('display-only')
  })

  it('separates display-only responsibility recovery suggestions from actionable closure', () => {
    const surface = getV14231ActionableSurface('responsibility_recovery_confirmation')

    expect(surface).toEqual(expect.objectContaining({
      status: 'display-only',
      stableTargetRoute: '/projects/:projectId/responsibility',
    }))
    expect(surface?.failureRecovery).toContain('suggestion')
    expect(surface?.boundaryPolicy.canUseAsStableAction).toBe(false)
  })

  it('keeps construction organization runtime publication actions behind C-13 needs-gating', () => {
    const surface = getV14231ActionableSurface('construction_organization_runtime_publication_action')

    expect(surface).toEqual(expect.objectContaining({
      status: 'needs-gating',
      stableTargetRoute: '/admin/rule-assets/governance-workbench',
    }))
    expect(surface?.sourceCloseoutItems).toEqual(expect.arrayContaining(['C-13', 'C-18', 'C-19']))
    expect(surface?.permissionGate).toContain('manual approval')
    expect(surface?.boundaryPolicy.canUseAsStableAction).toBe(false)
    expect(surface?.boundaryPolicy.requiresLiveEvidenceForUpgrade).toBe(true)
  })

  it('separates page readiness from ordinary stable actions and dangerous writes', () => {
    const stableKeys = [
      'workspace_progress_entry_action',
      'rule_asset_governance_review_action',
      'rule_asset_runtime_evidence_action',
    ]
    const gatedKeys = [
      'workspace_governance_prediction_todo_action',
      'rule_asset_stable_publication_action',
      'rule_asset_template_replacement_action',
      'rule_asset_runtime_rollback_action',
      'duration_accuracy_auto_publish_action',
      'duration_accuracy_force_stable_action',
      'duration_accuracy_rollback_close_action',
    ]

    for (const key of stableKeys) {
      expect(getV14231ActionableSurface(key)).toEqual(expect.objectContaining({
        status: 'stable_action',
        boundaryPolicy: expect.objectContaining({
          canUseAsStableAction: true,
          requiresLiveEvidenceForUpgrade: false,
        }),
      }))
    }

    for (const key of gatedKeys) {
      expect(getV14231ActionableSurface(key)).toEqual(expect.objectContaining({
        status: 'needs-gating',
        boundaryPolicy: expect.objectContaining({
          canUseAsStableAction: false,
          requiresLiveEvidenceForUpgrade: true,
        }),
      }))
    }
  })
})
