import fs from "fs"
import path from "path"

const DEFAULT_ROOT = process.cwd()
const FRONTEND_BI_AGGREGATION_MARK = "frontend-bi-aggregation-approved"
const DEFAULT_FRONTEND_BI_FILES = [
  "client/src/pages/Dashboard.tsx",
  "client/src/pages/Reports.tsx",
  "client/src/pages/TaskSummary.tsx",
  "client/src/pages/CompanyCockpit.tsx",
  "client/src/pages/CompanyCockpit/components",
  "client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx",
  "client/src/pages/WorkspacePage.tsx",
  "client/src/pages/workspace",
  "client/src/components/monitoring/MonitoringDashboard.tsx",
  "client/src/pages/Materials.tsx",
  "client/src/pages/Drawings/DrawingsPage.tsx",
  "client/src/pages/AcceptanceTimeline.tsx",
  "client/src/pages/DurationAccuracyAdmin.tsx",
  "client/src/pages/Notifications.tsx",
  "client/src/pages/Milestones.tsx",
  "client/src/pages/PreMilestones.tsx",
  "client/src/pages/planning",
]
const BI_ROUTE_IMPORT_KEYWORD_PATTERN =
  /(?:dashboard|report|summary|cockpit|risk|insight|analytics|metric|monitoring|material|drawing|acceptance|duration|governance|workbench)/i

const AGGREGATION_TARGET_PATTERN =
  /\b(?:total|count|counts|summary|summaries|stats|statistics|metric|metrics|kpi|score|rate|ratio|percent|percentage|average|avg|delayed|overdue|urgent|approaching|normal|completed|progressed|queued|warning|warnings|finding|findings|notification|notifications|milestone|critical|health|risk|issue|baseline|work|structure|active|inactive|unread|read|open|closed|resolved|pending|created|deleted|changed|task|tasks|event|events|condition|conditions|obstacle|obstacles|project|projects)\w*\b/i
const APPROVED_LINE_PREFIX_PATTERN = /^(?:const|let|var)?\s*[\w$]+\s*=|^[\w$]+\s*:/
const METRIC_COUNTER_DECLARATION_PATTERN = /^(?:let|var)\s+([\w$]+)\s*=\s*0\b/
const STATEMENT_BOUNDARY_PREFIX_PATTERN = /^(?:const|let|var|return|if|for|while|switch|case|function|export|import|class|try|catch|finally)\b/
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g

function leadingWhitespaceWidth(value) {
  const match = value.match(/^\s*/)
  return match ? match[0].length : 0
}

function walk(target) {
  if (!fs.existsSync(target)) return []
  const stat = fs.statSync(target)
  if (stat.isFile()) {
    if (!/\.(?:ts|tsx)$/.test(target)) return []
    if (target.endsWith(".test.ts") || target.endsWith(".test.tsx") || target.endsWith(".spec.ts") || target.endsWith(".spec.tsx")) return []
    return [target]
  }

  const files = []
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name)
    if (entry.isDirectory()) {
      if (["dist", "node_modules", "__tests__"].includes(entry.name)) continue
      files.push(...walk(full))
      continue
    }
    if (!entry.isFile()) continue
    if (!/\.(?:ts|tsx)$/.test(full)) continue
    if (full.endsWith(".test.ts") || full.endsWith(".test.tsx") || full.endsWith(".spec.ts") || full.endsWith(".spec.tsx")) continue
    files.push(full)
  }
  return files
}

function stripInlineComment(line) {
  const index = line.indexOf("//")
  return index >= 0 ? line.slice(0, index) : line
}

function isCommentOnly(trimmed) {
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")
}

function hasMark(lines, index, approvalMarks) {
  for (let i = index - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    return approvalMarks.some((mark) => trimmed.includes(mark))
  }
  return false
}

function isLikelyMetricAssignment(trimmed) {
  if (!APPROVED_LINE_PREFIX_PATTERN.test(trimmed)) return false
  const target = trimmed.split(/[:=]/, 1)[0] ?? ""
  return AGGREGATION_TARGET_PATTERN.test(target)
}

function collectAggregationStatement(lines, startIndex, maxLookahead = 8) {
  const fragments = []
  const rawCurrent = stripInlineComment(lines[startIndex] ?? "")
  const current = rawCurrent.trim()
  if (!current) return ""

  if (!isLikelyMetricAssignment(current)) {
    return fragments.concat(current).join(" ").replace(BLOCK_COMMENT_PATTERN, " ")
  }

  const startIndent = leadingWhitespaceWidth(rawCurrent)
  fragments.push(current)
  for (let i = startIndex + 1; i < lines.length && i < startIndex + maxLookahead; i++) {
    const rawNext = stripInlineComment(lines[i] ?? "")
    const trimmed = rawNext.trim()
    if (!trimmed) {
      if (fragments.length > 0) break
      continue
    }
    const nextIndent = leadingWhitespaceWidth(rawNext)
    const isContinuation = nextIndent > startIndent || /^[.)\],]/.test(trimmed)
    if (!isContinuation) {
      if (STATEMENT_BOUNDARY_PREFIX_PATTERN.test(trimmed)) break
      break
    }
    fragments.push(trimmed)
  }

  return fragments.join(" ").replace(BLOCK_COMMENT_PATTERN, " ")
}

function classifyFrontendBiAggregation(statement, metricCounters = new Set()) {
  const code = stripInlineComment(statement).replace(BLOCK_COMMENT_PATTERN, " ").replace(/\s+/g, " ").trim()
  if (/\.reduce\s*\(/.test(code) && isLikelyMetricAssignment(code)) {
    return { kind: "reduce", message: "unapproved frontend BI .reduce() aggregation" }
  }
  if (/\.filter\s*\([^;\n]*\)\s*\.length\b/.test(code) && isLikelyMetricAssignment(code)) {
    return { kind: "filter.length", message: "unapproved frontend BI .filter().length aggregation" }
  }
  if (/\bnew\s+Set\s*\([\s\S]*?\)\s*\.size\b|\b[\w$]+\s*\.size\b/.test(code) && isLikelyMetricAssignment(code)) {
    return { kind: "set.size", message: "unapproved frontend BI Set.size aggregation" }
  }
  for (const counterName of metricCounters) {
    const escaped = counterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const counterMutationPattern = new RegExp(
      "(?:\\b" + escaped + "\\s*(?:\\+\\+|\\+=\\s*1\\b|=\\s*" + escaped + "\\s*\\+\\s*1\\b)|\\+\\+\\s*" + escaped + "\\b)",
    )
    if (counterMutationPattern.test(code)) {
      return { kind: "counter-loop", message: "unapproved frontend BI counter aggregation" }
    }
  }
  return null
}

function scan(file, options = {}) {
  const approvalMarks = options.approvalMarks ?? [FRONTEND_BI_AGGREGATION_MARK]
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/)
  const issues = []
  const metricCounters = new Set()
  let aggregationCount = 0
  let approvedCount = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (isCommentOnly(trimmed)) continue
    const counterDeclaration = stripInlineComment(trimmed).match(METRIC_COUNTER_DECLARATION_PATTERN)
    if (counterDeclaration && AGGREGATION_TARGET_PATTERN.test(counterDeclaration[1])) {
      metricCounters.add(counterDeclaration[1])
    }
    const aggregation = classifyFrontendBiAggregation(collectAggregationStatement(lines, i), metricCounters)
    if (!aggregation) continue
    aggregationCount++
    if (hasMark(lines, i, approvalMarks)) {
      approvedCount++
      continue
    }
    issues.push({ line: i + 1, code: trimmed, kind: aggregation.kind, message: aggregation.message })
  }

  return { issues, aggregationCount, approvedCount }
}

function findAppSourcePath(root) {
  const candidates = [
    path.resolve(root, "client", "src", "App.tsx"),
    path.resolve(root, "src", "App.tsx"),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function resolveImportTarget(root, appPath, importSpecifier) {
  let base
  if (importSpecifier.startsWith("@/")) {
    base = path.resolve(root, "client", "src", importSpecifier.slice(2))
    if (!fs.existsSync(path.resolve(root, "client")) && fs.existsSync(path.resolve(root, "src"))) {
      base = path.resolve(root, "src", importSpecifier.slice(2))
    }
  } else if (importSpecifier.startsWith("./") || importSpecifier.startsWith("../")) {
    base = path.resolve(path.dirname(appPath), importSpecifier)
  } else {
    return []
  }

  return [
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
    base,
  ]
}

function discoverFrontendBiRouteEntries(root) {
  const appPath = findAppSourcePath(root)
  if (!appPath) return []

  const source = fs.readFileSync(appPath, "utf8")
  const entries = []
  const lazyImportPattern = /lazy\s*\(\s*\(\s*\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)\s*\)/g
  for (const match of source.matchAll(lazyImportPattern)) {
    const importSpecifier = match[1]
    if (!BI_ROUTE_IMPORT_KEYWORD_PATTERN.test(importSpecifier)) continue
    const target = resolveImportTarget(root, appPath, importSpecifier).find((candidate) => fs.existsSync(candidate))
    if (target) entries.push(target)
  }
  return entries
}

function resolveFiles(root, entries = DEFAULT_FRONTEND_BI_FILES) {
  const defaultEntries = entries === DEFAULT_FRONTEND_BI_FILES
    ? [...entries, ...discoverFrontendBiRouteEntries(root)]
    : entries
  const seen = new Set()
  return defaultEntries.flatMap((entry) => {
    let target = path.isAbsolute(entry) ? entry : path.resolve(root, entry)
    if (!fs.existsSync(target) && entry.startsWith("client/")) {
      target = path.resolve(root, entry.slice("client/".length))
    }
    return walk(target)
  }).filter((file) => {
    const normalized = path.resolve(file)
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

export function evaluateFrontendBiAggregationGuard(root = DEFAULT_ROOT, files = DEFAULT_FRONTEND_BI_FILES) {
  const resolvedFiles = resolveFiles(root, files)
  if (resolvedFiles.length === 0) {
    throw new Error("[frontend-bi-aggregation-guard] No frontend BI files found")
  }

  const aggregate = {
    files: [],
    total: 0,
    approved: 0,
    violations: [],
  }

  for (const file of resolvedFiles) {
    const result = scan(file)
    aggregate.files.push(file)
    aggregate.total += result.aggregationCount
    aggregate.approved += result.approvedCount
    aggregate.violations.push(...result.issues.map((issue) => ({ filePath: file, ...issue })))
  }

  return aggregate
}

export function formatFrontendBiAggregationGuardFailure(violations, cwd = process.cwd()) {
  const lines = ["[frontend-bi-aggregation-guard] Unapproved frontend BI aggregation found:"]
  for (const violation of violations) {
    lines.push("- " + path.relative(cwd, violation.filePath) + ":" + violation.line + " (" + violation.kind + ")")
    lines.push("  " + violation.code)
  }
  lines.push("Add // eslint-disable-next-line -- " + FRONTEND_BI_AGGREGATION_MARK + " directly above display-only legacy aggregation, or move the metric to backend summary/snapshot/metricRegistry SSOT.")
  return lines.join("\n")
}

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function resolveCliFiles() {
  return process.argv.slice(2)
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const cliFiles = resolveCliFiles()
  const result = evaluateFrontendBiAggregationGuard(DEFAULT_ROOT, cliFiles.length > 0 ? cliFiles : DEFAULT_FRONTEND_BI_FILES)
  if (result.violations.length) {
    console.error(formatFrontendBiAggregationGuardFailure(result.violations))
    process.exit(1)
  }
  console.log("[frontend-bi-aggregation-guard] OK: scanned " + result.files.length + " frontend BI files, " + result.approved + "/" + result.total + " aggregation sites approved.")
}
