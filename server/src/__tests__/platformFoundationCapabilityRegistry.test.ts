import { describe, expect, it } from 'vitest'

import { listPlatformFoundationCapabilities } from '../services/platformFoundationCapabilityRegistryService.js'

describe('platform foundation capability registry', () => {
  it('registers migration safety gates under platform_foundation runtime scope', () => {
    const capabilities = listPlatformFoundationCapabilities()

    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        capabilityKey: 'migrate.check',
        runtimeScope: 'platform_foundation',
        owningUnit: '底座·平台运行观测',
        scriptName: 'migrate:check',
        readinessGate: 'pending_checksum_duplicate_ledger_baseline_gate',
      }),
      expect.objectContaining({
        capabilityKey: 'migrate.drift',
        runtimeScope: 'platform_foundation',
        owningUnit: '底座·平台运行观测',
        scriptName: 'migrate:drift',
        readinessGate: 'schema_drift_zero_gate',
      }),
      expect.objectContaining({
        capabilityKey: 'migrate.production_governance',
        runtimeScope: 'platform_foundation',
        owningUnit: '底座·平台运行观测',
        scriptName: 'migrate:production-governance',
        readinessGate: 'v14231_mg01_to_mg07_production_migration_governance_gate',
      }),
      expect.objectContaining({
        capabilityKey: 'legacy_object.drop_guard',
        runtimeScope: 'platform_foundation',
        owningUnit: '底座·平台运行观测',
        scriptName: 'guard:legacy-object-drop',
        readinessGate: 'obsolete_object_dependency_export_rollback_post_drop_readback_gate',
      }),
      expect.objectContaining({
        capabilityKey: 'claims.production_ready_guard',
        runtimeScope: 'platform_foundation',
        owningUnit: '底座·平台运行观测',
        scriptName: 'guard:production-ready-claims',
        readinessGate: 'v14231_c13_status_ledger_claim_guard',
      }),
      expect.objectContaining({
        capabilityKey: 'readiness.v14231_c13_consumption_gate',
        runtimeScope: 'platform_foundation',
        owningUnit: '底座·平台运行观测',
        scriptName: 'api:v14231-readiness',
        readinessGate: 'v14231_c13_machine_readable_readiness_ledger',
      }),
      expect.objectContaining({
        capabilityKey: 'readiness.v14231_actionable_surface_gate',
        runtimeScope: 'platform_foundation',
        owningUnit: '底座·平台运行观测',
        scriptName: 'api:v14231-readiness/actionable-surfaces',
        readinessGate: 'v14231_c07_c09_c12_actionable_surface_no_runtime_publication_gate',
      }),
    ]))
  })
})
