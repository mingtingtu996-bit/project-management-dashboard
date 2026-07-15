import fs from "fs"
import path from "path"

import {
  evaluateRouteAggregationGuard,
  formatRouteAggregationGuardFailure,
} from "./guard-route-aggregation.mjs"

const SUMMARY_SERVICE_AGGREGATION_MARK = "summary-service-aggregation-approved"
const SUMMARY_SERVICE_SSOT_CONTEXT_PATTERN = /\bssot:\s*(?:projectExecutionSummaryService|projectDailySnapshot|metricRegistry|service-owned-summary)\b/
const DEFAULT_ROOT = process.cwd()
const DEFAULT_SUMMARY_SERVICE_FILES = [
  "server/src/services/companySummaryService.ts",
  "server/src/services/projectExecutionSummaryService.ts",
  "server/src/services/taskSummaryService.ts",
  "server/src/services/projectTrendAnalyticsService.ts",
  "server/src/services/riskStatisticsService.ts",
  "server/src/services/responsibilityInsightService.ts",
]
const SUMMARY_SERVICE_FILE_PATTERN = /(?:Summary|Statistics|Analytics|Insight)Service\.ts$/
const SUMMARY_ORCHESTRATION_FILE_PATTERN = /(?:Workspace|Workbench|Orchestration|Orchestrator|Readiness)Service\.ts$/

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function walkSummaryServiceFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const stat = fs.statSync(dir)
  if (stat.isFile()) {
    const basename = path.basename(dir)
    return SUMMARY_SERVICE_FILE_PATTERN.test(basename) || SUMMARY_ORCHESTRATION_FILE_PATTERN.test(basename) ? [dir] : []
  }
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (["dist", "node_modules", "__tests__"].includes(entry.name)) continue
      files.push(...walkSummaryServiceFiles(full))
      continue
    }
    if (!entry.isFile()) continue
    if (SUMMARY_SERVICE_FILE_PATTERN.test(entry.name) || SUMMARY_ORCHESTRATION_FILE_PATTERN.test(entry.name)) files.push(full)
  }
  return files
}

function discoverSummaryServiceFiles(root) {
  const candidates = [
    path.resolve(root, "server", "src", "services"),
    path.resolve(root, "src", "services"),
  ]
  const servicesRoot = candidates.find((candidate) => fs.existsSync(candidate))
  return servicesRoot ? walkSummaryServiceFiles(servicesRoot) : []
}

function resolveFiles(root, files = DEFAULT_SUMMARY_SERVICE_FILES) {
  const defaultMode = files === DEFAULT_SUMMARY_SERVICE_FILES
  const entries = defaultMode
    ? [...files, ...discoverSummaryServiceFiles(root)]
    : files
  const seen = new Set()
  return entries.map((file) => {
    if (path.isAbsolute(file)) return file
    const repoRootPath = path.resolve(root, file)
    if (file.startsWith("server/") && !fs.existsSync(repoRootPath)) {
      return path.resolve(root, file.slice("server/".length))
    }
    return repoRootPath
  }).filter((file) => {
    if (defaultMode && !fs.existsSync(file)) return false
    const normalized = path.resolve(file)
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

export function evaluateSummaryServiceAggregationGuard(root = DEFAULT_ROOT, files = DEFAULT_SUMMARY_SERVICE_FILES) {
  const resolvedFiles = resolveFiles(root, files)
  const aggregate = {
    files: [],
    total: 0,
    approved: 0,
    violations: [],
  }

  if (resolvedFiles.length === 0) {
    throw new Error("[summary-service-aggregation-guard] No summary service files found")
  }

  for (const file of resolvedFiles) {
    const result = evaluateRouteAggregationGuard(file, {
      approvalMarks: [SUMMARY_SERVICE_AGGREGATION_MARK],
      approvalContextPattern: SUMMARY_SERVICE_SSOT_CONTEXT_PATTERN,
    })
    aggregate.files.push(...result.files)
    aggregate.total += result.total
    aggregate.approved += result.approved
    aggregate.violations.push(...result.violations)
  }

  return aggregate
}

export function formatSummaryServiceAggregationGuardFailure(violations, cwd = process.cwd()) {
  return formatRouteAggregationGuardFailure(violations, cwd, {
    approvalMarks: [SUMMARY_SERVICE_AGGREGATION_MARK],
    approvalContextPattern: SUMMARY_SERVICE_SSOT_CONTEXT_PATTERN,
    surfaceLabel: "summary-service",
  })
}

function resolveCliFiles() {
  return process.argv.slice(2)
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const cliFiles = resolveCliFiles()
  const result = evaluateSummaryServiceAggregationGuard(
    DEFAULT_ROOT,
    cliFiles.length > 0 ? cliFiles : DEFAULT_SUMMARY_SERVICE_FILES,
  )
  if (result.violations.length) {
    console.error(formatSummaryServiceAggregationGuardFailure(result.violations))
    process.exit(1)
  }
  console.log("[summary-service-aggregation-guard] OK: scanned " + result.files.length + " summary service files, " + result.approved + "/" + result.total + " aggregation sites approved.")
}
