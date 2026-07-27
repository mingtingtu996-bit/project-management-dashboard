export type PlatformFoundationRuntimeScope = 'platform_foundation'

export type PlatformFoundationCapability = {
  capabilityKey: string
  owningUnit: '底座·平台运行观测'
  runtimeScope: PlatformFoundationRuntimeScope
  scriptName: string
  readinessGate: string
  sourcePlan: string
}

const PLATFORM_FOUNDATION_CAPABILITIES: PlatformFoundationCapability[] = [
  {
    capabilityKey: 'migrate.check',
    owningUnit: '底座·平台运行观测',
    runtimeScope: 'platform_foundation',
    scriptName: 'migrate:check',
    readinessGate: 'pending_checksum_duplicate_ledger_baseline_gate',
    sourcePlan: 'v1.4.23.2-C',
  },
  {
    capabilityKey: 'migrate.drift',
    owningUnit: '底座·平台运行观测',
    runtimeScope: 'platform_foundation',
    scriptName: 'migrate:drift',
    readinessGate: 'schema_drift_zero_gate',
    sourcePlan: 'v1.4.23.2-C',
  },
  {
    capabilityKey: 'migrate.production_governance',
    owningUnit: '底座·平台运行观测',
    runtimeScope: 'platform_foundation',
    scriptName: 'migrate:production-governance',
    readinessGate: 'v14231_mg01_to_mg07_production_migration_governance_gate',
    sourcePlan: 'v1.4.23.1-A',
  },
  {
    capabilityKey: 'legacy_object.drop_guard',
    owningUnit: '底座·平台运行观测',
    runtimeScope: 'platform_foundation',
    scriptName: 'guard:legacy-object-drop',
    readinessGate: 'obsolete_object_dependency_export_rollback_post_drop_readback_gate',
    sourcePlan: 'v1.4.23.1-A',
  },
  {
    capabilityKey: 'claims.production_ready_guard',
    owningUnit: '底座·平台运行观测',
    runtimeScope: 'platform_foundation',
    scriptName: 'guard:production-ready-claims',
    readinessGate: 'v14231_c13_status_ledger_claim_guard',
    sourcePlan: 'v1.4.23.1-A',
  },
  {
    capabilityKey: 'readiness.v14231_c13_consumption_gate',
    owningUnit: '底座·平台运行观测',
    runtimeScope: 'platform_foundation',
    scriptName: 'api:v14231-readiness',
    readinessGate: 'v14231_c13_machine_readable_readiness_ledger',
    sourcePlan: 'v1.4.23.1-A',
  },
  {
    capabilityKey: 'readiness.v14231_actionable_surface_gate',
    owningUnit: '底座·平台运行观测',
    runtimeScope: 'platform_foundation',
    scriptName: 'api:v14231-readiness/actionable-surfaces',
    readinessGate: 'v14231_c07_c09_c12_actionable_surface_no_runtime_publication_gate',
    sourcePlan: 'v1.4.23.1-A',
  },
]

export function listPlatformFoundationCapabilities() {
  return PLATFORM_FOUNDATION_CAPABILITIES.map((capability) => ({ ...capability }))
}
