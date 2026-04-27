import fs from "fs"
import path from "path"

const DIR = path.resolve(process.cwd(), "src/routes")
const MARK = "route-level-aggregation-approved"

function walk(dir) {
  if (!fs.existsSync(dir)) return []
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

function hasMark(lines, index) {
  for (let i = index - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    return trimmed.includes(MARK)
  }
  return false
}

function scan(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/)
  const issues = []
  let reduceCount = 0
  let approvedCount = 0
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed.includes(".reduce(")) continue
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue
    reduceCount++
    if (hasMark(lines, i)) {
      approvedCount++
      continue
    }
    issues.push({ line: i + 1, code: trimmed })
  }
  return { issues, reduceCount, approvedCount }
}

const files = walk(DIR)
if (files.length === 0) throw new Error("[route-aggregation-guard] No route files found under " + DIR)
let total = 0
let approved = 0
const violations = []
for (const file of files) {
  const r = scan(file)
  total += r.reduceCount
  approved += r.approvedCount
  for (const issue of r.issues) violations.push({ filePath: file, ...issue })
}
if (violations.length) {
  console.error("[route-aggregation-guard] Unapproved .reduce() usage found in server/src/routes:")
  for (const v of violations) {
    console.error("- " + path.relative(process.cwd(), v.filePath) + ":" + v.line)
    console.error("  " + v.code)
  }
  console.error("Add // eslint-disable-next-line -- " + MARK + " directly above the line, or refactor to a loop.")
  process.exit(1)
}
console.log("[route-aggregation-guard] OK: scanned " + files.length + " route files, " + approved + "/" + total + " reduce sites approved.")
