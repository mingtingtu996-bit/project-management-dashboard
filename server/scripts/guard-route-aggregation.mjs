import fs from "fs"
import path from "path"

const DIR = path.resolve(process.cwd(), "src/routes")
const DEFAULT_MARK = "route-level-aggregation-approved"
const AGGREGATION_TARGET_PATTERN = /\b(?:total|count|counts|summary|summaries|stats|statistics|metric|metrics|kpi|score|rate|ratio|percent|percentage|average|avg|delayed|overdue|urgent|approaching|normal|completed|progressed|queued|warning|warnings|finding|findings|notification|notifications|milestone|critical|health|risk|issue|baseline|work|structure|active|inactive|unread|read|open|closed|resolved|pending|created|deleted|changed)\w*\b/i
const APPROVED_LINE_PREFIX_PATTERN = /^(?:const|let|var)?\s*[\w$]+\s*=|^[\w$]+\s*:/
const METRIC_COUNTER_DECLARATION_PATTERN = /^(?:let|var)\s+([\w$]+)\s*=\s*0\b/
const STATEMENT_BOUNDARY_PREFIX_PATTERN = /^(?:const|let|var|return|if|for|while|switch|case|function|export|import|class|try|catch|finally)\b/
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g

function leadingWhitespaceWidth(value) {
  const match = value.match(/^\s*/)
  return match ? match[0].length : 0
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const stat = fs.statSync(dir)
  if (stat.isFile()) {
    if (!dir.endsWith(".ts")) return []
    if (dir.endsWith(".test.ts") || dir.endsWith(".spec.ts")) return []
    return [dir]
  }
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (["dist", "node_modules", "__tests__"].includes(entry.name)) continue
      files.push(...walk(full))
      continue
    }
    if (!entry.isFile()) continue
    if (!full.endsWith(".ts")) continue
    if (full.endsWith(".test.ts") || full.endsWith(".spec.ts")) continue
    files.push(full)
  }
  return files
}

function hasMark(lines, index, approvalMarks, approvalContextPattern = null) {
  for (let i = index - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    const hasApprovalMark = approvalMarks.some((mark) => trimmed.includes(mark))
    if (!hasApprovalMark) return false
    if (!approvalContextPattern) return true
    return approvalContextPattern.test(trimmed)
  }
  return false
}

function stripInlineComment(line) {
  const index = line.indexOf("//")
  return index >= 0 ? line.slice(0, index) : line
}

function isCommentOnly(trimmed) {
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")
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

function classifyRouteAggregation(statement, metricCounters = new Set()) {
  const code = stripInlineComment(statement).replace(BLOCK_COMMENT_PATTERN, " ").replace(/\s+/g, " ").trim()
  if (/\.reduce\s*\(/.test(code)) {
    return { kind: "reduce", message: "unapproved .reduce() route aggregation" }
  }
  if (/\.filter\s*\([^;\n]*\)\s*\.length\b/.test(code) && isLikelyMetricAssignment(code)) {
    return { kind: "filter.length", message: "unapproved .filter().length route aggregation" }
  }
  if (/\bnew\s+Set\s*\([\s\S]*?\)\s*\.size\b|\b[\w$]+\s*\.size\b/.test(code) && /[+*/-]|\bString\s*\(|:\s*[\w$]+\s*\.size\b|=\s*[\w$]+\s*\.size\b/.test(code) && isLikelyMetricAssignment(code)) {
    return { kind: "set.size", message: "unapproved Set.size route aggregation" }
  }
  for (const counterName of metricCounters) {
    const escaped = counterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const counterMutationPattern = new RegExp(
      "(?:\\b" + escaped + "\\s*(?:\\+\\+|\\+=\\s*1\\b|=\\s*" + escaped + "\\s*\\+\\s*1\\b)|\\+\\+\\s*" + escaped + "\\b)",
    )
    if (counterMutationPattern.test(code)) {
      return { kind: "counter-loop", message: "unapproved counter-based route aggregation" }
    }
  }
  return null
}

function scan(file, options = {}) {
  const approvalMarks = options.approvalMarks ?? [DEFAULT_MARK]
  const approvalContextPattern = options.approvalContextPattern ?? null
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
    const aggregation = classifyRouteAggregation(collectAggregationStatement(lines, i), metricCounters)
    if (!aggregation) continue
    aggregationCount++
    if (hasMark(lines, i, approvalMarks, approvalContextPattern)) {
      approvedCount++
      continue
    }
    issues.push({ line: i + 1, code: trimmed, kind: aggregation.kind, message: aggregation.message })
  }
  return { issues, aggregationCount, approvedCount }
}

export function evaluateRouteAggregationGuard(routeDir = DIR, options = {}) {
  const files = walk(routeDir)
  if (files.length === 0) throw new Error("[route-aggregation-guard] No route files found under " + routeDir)
  let total = 0
  let approved = 0
  const violations = []
  for (const file of files) {
    const r = scan(file, options)
    total += r.aggregationCount
    approved += r.approvedCount
    for (const issue of r.issues) violations.push({ filePath: file, ...issue })
  }
  return { files, total, approved, violations }
}

export function formatRouteAggregationGuardFailure(violations, cwd = process.cwd(), options = {}) {
  const approvalMarks = options.approvalMarks ?? [DEFAULT_MARK]
  const surfaceLabel = options.surfaceLabel ?? "route-level"
  const lines = ["[route-aggregation-guard] Unapproved " + surfaceLabel + " aggregation found:"]
  for (const v of violations) {
    lines.push("- " + path.relative(cwd, v.filePath) + ":" + v.line + " (" + v.kind + ")")
    lines.push("  " + v.code)
  }
  const contextHint = options.approvalContextPattern
    ? "; ssot: projectExecutionSummaryService|projectDailySnapshot|metricRegistry|service-owned-summary"
    : ""
  lines.push("Add // eslint-disable-next-line -- " + approvalMarks[0] + contextHint + " directly above the line, or move the metric to a backend summary/SSOT service.")
  return lines.join("\n")
}

function resolveCliTarget() {
  const target = process.argv[2]
  if (!target) return DIR
  return path.resolve(process.cwd(), target)
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateRouteAggregationGuard(resolveCliTarget())
  if (result.violations.length) {
    console.error(formatRouteAggregationGuardFailure(result.violations))
    process.exit(1)
  }
  console.log("[route-aggregation-guard] OK: scanned " + result.files.length + " route files, " + result.approved + "/" + result.total + " aggregation sites approved.")
}

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}
