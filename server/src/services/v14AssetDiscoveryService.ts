import { readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

export type V14AutoDiscoveredAssetType =
  | 'algorithm_policy_asset'
  | 'rule_seed_asset'
  | 'data_admission_asset'
  | 'metric_admission_asset'
  | 'governance_support_asset'
  | 'background_governance_job'

export type V14AssetScopePolicy =
  | 'system'
  | 'company_or_project_scoped'
  | 'project_scoped'
  | 'not_runtime_data'

export interface V14DiscoveredAssetSource {
  assetKey: string
  assetType: V14AutoDiscoveredAssetType
  sourcePath: string
  runtimeEffect: string
  scopePolicy: V14AssetScopePolicy
  consumers: string[]
}

const DEFAULT_SCAN_ROOTS = [
  'server/src',
]

const DISCOVERY_FILENAME_PATTERN = /(algorithm|admission|analytics|baseline|catalog|certificate|climate|cockpit|dashboard|deletion|dependency|drawing|duration|forecast|governance|health|issue|learning|lineage|material|metric|milestone|monthly|notification|planning|policy|predict|productivity|progress|quality|registry|reminder|replay|report|responsibility|retention|risk|rule|schedule|seed|snapshot|statistics|status|summary|template|trend|warning|wbs|weather)/i

const EXCLUDED_PATH_PATTERN = /(__tests__|\.test\.|\.example\.|\/types\/|\/scripts\/|\/tmp\/|\/dist\/|seed-test-project\.ts)/i

function slash(value: string) {
  return value.replaceAll('\\', '/')
}

function workspaceRoot() {
  const cwd = process.cwd()
  return cwd.endsWith('/server') || cwd.endsWith('\\server')
    ? resolve(cwd, '..')
    : cwd
}

function walkTsFiles(root: string, output: string[] = []) {
  for (const name of readdirSync(root)) {
    const filePath = resolve(root, name)
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      walkTsFiles(filePath, output)
    } else if (filePath.endsWith('.ts')) {
      output.push(filePath)
    }
  }
  return output
}

export function v14AssetKeyFromSourcePath(sourcePath: string) {
  const file = sourcePath.split('/').pop() ?? sourcePath
  const baseKey = file.replace(/\.ts$/, '')
  if (sourcePath.includes('/utils/')) {
    return `utils.${baseKey}`
  }
  return baseKey
}

export function classifyV14AssetSource(sourcePath: string): V14AutoDiscoveredAssetType {
  const path = sourcePath.toLowerCase()
  if (path.includes('/jobs/')) return 'background_governance_job'
  if (path.endsWith('/scheduler.ts')) return 'background_governance_job'
  if (path.includes('/utils/progresscalculation.ts')) return 'metric_admission_asset'
  if (path.includes('dataquality') || path.includes('data-quality') || path.includes('data_quality') || path.includes('datalineage') || path.includes('lineage')) return 'data_admission_asset'
  if (
    path.includes('metric') ||
    path.includes('summary') ||
    path.includes('snapshot') ||
    path.includes('trend') ||
    path.includes('analytics') ||
    path.includes('statistics') ||
    path.includes('report') ||
    path.includes('dashboard') ||
    path.includes('cockpit')
  ) return 'metric_admission_asset'
  if (path.includes('/seeds/') || path.includes('seed') || path.includes('rule') || path.includes('registry')) return 'rule_seed_asset'
  if (path.includes('policy') || path.includes('learning') || path.includes('calibration') || path.includes('replay') || path.includes('forecast')) return 'algorithm_policy_asset'
  return 'governance_support_asset'
}

export function runtimeEffectForV14Asset(type: V14AutoDiscoveredAssetType, sourcePath: string) {
  if (type === 'data_admission_asset') return 'data_quality_admission_or_confidence_boundary'
  if (type === 'metric_admission_asset') return 'metric_registry_or_metric_snapshot_boundary'
  if (type === 'rule_seed_asset') return 'rule_seed_or_catalog_only_runtime_candidate'
  if (type === 'algorithm_policy_asset') return 'algorithm_policy_replay_learning_or_calibration_boundary'
  if (type === 'background_governance_job') return 'scheduled_governance_execution_boundary'
  if (sourcePath.includes('retention')) return 'history_retention_boundary'
  return 'governance_support_boundary'
}

export function scopePolicyForV14Asset(type: V14AutoDiscoveredAssetType, sourcePath: string): V14AssetScopePolicy {
  const path = sourcePath.toLowerCase()
  if (path.includes('company') || path.includes('project') || path.includes('override') || path.includes('calibration')) return 'company_or_project_scoped'
  if (path.includes('task') || path.includes('milestone') || path.includes('warning') || path.includes('acceptance')) return 'project_scoped'
  if (type === 'background_governance_job') return 'company_or_project_scoped'
  if (type === 'metric_admission_asset' || type === 'data_admission_asset') return 'company_or_project_scoped'
  return 'system'
}

export function consumersForV14Asset(type: V14AutoDiscoveredAssetType) {
  if (type === 'data_admission_asset') return ['dataQualityService', 'Dashboard', 'Reports', 'projectExecutionSummaryService']
  if (type === 'metric_admission_asset') return ['Dashboard', 'Reports', 'CompanyCockpit', 'projectDailySnapshotService']
  if (type === 'rule_seed_asset') return ['algorithmSeedRegistry', 'rule asset ledger', 'runtime consumers']
  if (type === 'background_governance_job') return ['scheduler', 'jobs route', 'governance reports']
  if (type === 'algorithm_policy_asset') return ['algorithm governance diagnostics', 'replay reports', 'candidate lifecycle']
  return ['backend governance diagnostics']
}

export function discoverV14AssetSourcePaths(scanRoots = DEFAULT_SCAN_ROOTS) {
  const root = workspaceRoot()
  const files: string[] = []
  for (const scanRoot of scanRoots) {
    const absoluteRoot = resolve(root, scanRoot)
    try {
      walkTsFiles(absoluteRoot, files)
    } catch {
      // Missing scan roots are ignored so local partial checkouts can still run diagnostics.
    }
  }
  return files
    .map((filePath) => slash(relative(root, filePath)))
    .filter((sourcePath) => DISCOVERY_FILENAME_PATTERN.test(sourcePath))
    .filter((sourcePath) => !EXCLUDED_PATH_PATTERN.test(sourcePath))
    .sort((a, b) => a.localeCompare(b))
}

export function discoverV14AssetSources(scanRoots = DEFAULT_SCAN_ROOTS): V14DiscoveredAssetSource[] {
  const seen = new Set<string>()
  return discoverV14AssetSourcePaths(scanRoots)
    .map((sourcePath) => {
      const assetType = classifyV14AssetSource(sourcePath)
      return {
        assetKey: v14AssetKeyFromSourcePath(sourcePath),
        assetType,
        sourcePath,
        runtimeEffect: runtimeEffectForV14Asset(assetType, sourcePath),
        scopePolicy: scopePolicyForV14Asset(assetType, sourcePath),
        consumers: consumersForV14Asset(assetType),
      }
    })
    .filter((asset) => {
      const dedupeKey = `${asset.assetKey}:${asset.sourcePath}`
      if (seen.has(dedupeKey)) return false
      seen.add(dedupeKey)
      return true
    })
}
