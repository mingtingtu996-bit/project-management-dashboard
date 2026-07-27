import fs from "fs"
import path from "path"

const DEFAULT_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? process.cwd()
  : path.resolve(process.cwd(), "..")

const METRIC_KEY_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : ""
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
}

function lineFor(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function extractStringKeysFromObjectLiteral(source, objectName) {
  const keys = []
  const start = source.indexOf(objectName)
  if (start < 0) return keys
  const braceStart = source.indexOf("{", start)
  if (braceStart < 0) return keys

  let depth = 0
  let end = -1
  for (let i = braceStart; i < source.length; i++) {
    const char = source[i]
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return keys

  const body = source.slice(braceStart + 1, end)
  const keyPattern = /(?:^|[\s,{])(['"]?)([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\1\s*:/g
  for (const match of body.matchAll(keyPattern)) {
    keys.push({
      metricKey: match[2],
      index: braceStart + 1 + match.index,
    })
  }
  return keys
}

function extractCaseMetricKeys(source) {
  const keys = []
  const pattern = /case\s+['"]([a-z][a-z0-9]*(?:_[a-z0-9]+)+)['"]\s*:/g
  for (const match of source.matchAll(pattern)) {
    keys.push({ metricKey: match[1], index: match.index })
  }
  return keys
}

function extractReportOptionKeys(source) {
  const keys = []
  const start = source.indexOf("DEFAULT_REPORT_METRIC_OPTIONS")
  if (start < 0) return keys
  const arrayStart = source.indexOf("[", start)
  if (arrayStart < 0) return keys

  let depth = 0
  let end = -1
  for (let i = arrayStart; i < source.length; i++) {
    const char = source[i]
    if (char === "[") depth += 1
    if (char === "]") {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return keys

  const body = source.slice(arrayStart + 1, end)
  const pattern = /\bvalue\s*:\s*['"]([a-z][a-z0-9]*(?:_[a-z0-9]+)+)['"]/g
  for (const match of body.matchAll(pattern)) {
    keys.push({ metricKey: match[1], index: arrayStart + 1 + match.index })
  }
  return keys
}

function extractRegistryKeys(root) {
  const filePath = path.join(root, "server", "src", "services", "metricRegistryService.ts")
  const source = stripComments(readIfExists(filePath))
  const keys = new Set()
  const aliases = new Set()

  const metricPattern = /\bmetricKey\s*:\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(metricPattern)) {
    if (METRIC_KEY_PATTERN.test(match[1])) keys.add(match[1])
  }

  const aliasPattern = /\bdeprecatedAliases\s*:\s*\[([\s\S]*?)\]/g
  for (const match of source.matchAll(aliasPattern)) {
    const body = match[1]
    for (const alias of body.matchAll(/['"]([^'"]+)['"]/g)) {
      aliases.add(alias[1])
    }
  }

  return { filePath, keys, aliases }
}

function pushDiscovered(items, filePath, source, entries, surface) {
  for (const entry of entries) {
    items.push({
      filePath,
      line: lineFor(source, entry.index),
      metricKey: entry.metricKey,
      surface,
    })
  }
}

function checkRequiredDynamicMetricValidation(root) {
  const requiredSurfaces = [
    {
      filePath: path.join(root, "server", "src", "routes", "metrics.ts"),
      surface: "metrics.route_dynamic_metric_validation",
      requiredSnippets: ["isRegisteredMetric", "getMetricRegistryEntry"],
    },
    {
      filePath: path.join(root, "server", "src", "services", "metricRuntimePublicationService.ts"),
      surface: "metric_runtime_publication.dynamic_metric_validation",
      requiredSnippets: ["isRegisteredMetric"],
    },
    {
      filePath: path.join(root, "server", "src", "services", "companyTrendAnalyticsService.ts"),
      surface: "company_trend.dynamic_metric_registry_default",
      requiredSnippets: ["getMetricRegistryEntry"],
    },
  ]

  const violations = []
  for (const surface of requiredSurfaces) {
    if (!fs.existsSync(surface.filePath)) continue
    const source = stripComments(readIfExists(surface.filePath))
    for (const snippet of surface.requiredSnippets) {
      if (!source.includes(snippet)) {
        violations.push({
          filePath: surface.filePath,
          line: 1,
          metricKey: snippet,
          surface: surface.surface,
        })
      }
    }
  }
  return violations
}

export function evaluateMetricSsotGuard(root = DEFAULT_ROOT) {
  const registry = extractRegistryKeys(root)
  if (registry.keys.size === 0) {
    throw new Error("[metric-ssot-guard] No metric registry keys found under " + registry.filePath)
  }

  const discovered = []
  const projectDailySnapshotPath = path.join(root, "server", "src", "services", "projectDailySnapshotService.ts")
  const projectDailySnapshotSource = stripComments(readIfExists(projectDailySnapshotPath))
  pushDiscovered(
    discovered,
    projectDailySnapshotPath,
    projectDailySnapshotSource,
    extractStringKeysFromObjectLiteral(projectDailySnapshotSource, "metric_values"),
    "project_daily_snapshot.metric_values",
  )
  pushDiscovered(
    discovered,
    projectDailySnapshotPath,
    projectDailySnapshotSource,
    extractCaseMetricKeys(projectDailySnapshotSource),
    "project_daily_snapshot.metric_value_resolver",
  )

  const projectTrendPath = path.join(root, "server", "src", "services", "projectTrendAnalyticsService.ts")
  const projectTrendSource = stripComments(readIfExists(projectTrendPath))
  pushDiscovered(
    discovered,
    projectTrendPath,
    projectTrendSource,
    extractCaseMetricKeys(projectTrendSource),
    "project_trend.metric_resolver",
  )

  const reportsPath = path.join(root, "client", "src", "pages", "Reports.tsx")
  const reportsSource = stripComments(readIfExists(reportsPath))
  pushDiscovered(
    discovered,
    reportsPath,
    reportsSource,
    extractReportOptionKeys(reportsSource),
    "reports.default_metric_options",
  )

  const seen = new Set()
  const violations = [...checkRequiredDynamicMetricValidation(root)]
  for (const item of discovered) {
    const uniqueKey = `${item.filePath}:${item.line}:${item.metricKey}:${item.surface}`
    if (seen.has(uniqueKey)) continue
    seen.add(uniqueKey)
    if (registry.keys.has(item.metricKey) || registry.aliases.has(item.metricKey)) continue
    violations.push(item)
  }

  return {
    registryKeyCount: registry.keys.size,
    registryAliasCount: registry.aliases.size,
    discovered,
    violations,
  }
}

export function formatMetricSsotGuardFailure(violations, cwd = process.cwd()) {
  const lines = ["[metric-ssot-guard] Unregistered metric keys found in metric production/consumer surfaces:"]
  for (const violation of violations) {
    lines.push("- " + path.relative(cwd, violation.filePath) + ":" + violation.line + " (" + violation.surface + ")")
    lines.push("  " + violation.metricKey)
  }
  lines.push("Register the metric in server/src/services/metricRegistryService.ts, or remove it from public metric production/consumer surfaces.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateMetricSsotGuard(DEFAULT_ROOT)
  if (result.violations.length) {
    console.error(formatMetricSsotGuardFailure(result.violations))
    process.exit(1)
  }
  console.log("[metric-ssot-guard] OK: checked " + result.discovered.length + " metric key references against " + result.registryKeyCount + " registered metrics.")
}
