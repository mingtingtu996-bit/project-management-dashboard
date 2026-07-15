import fs from "fs"
import path from "path"

const DEFAULT_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? path.resolve(process.cwd(), "server")
  : process.cwd()

const REQUIRED_LIFECYCLE_DOMAINS = [
  "task.lifecycle",
  "baseline.lifecycle",
  "monthly_plan.lifecycle",
  "condition.lifecycle",
  "obstacle.lifecycle",
  "acceptance.lifecycle",
  "material.lifecycle",
  "certificate.lifecycle",
  "drawing.lifecycle",
  "risk.lifecycle",
  "issue.lifecycle",
  "warning.lifecycle",
  "notification.lifecycle",
  "invitation.lifecycle",
  "data_quality.finding_status",
]

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function readStatusDictionarySource(root = DEFAULT_ROOT) {
  const serverRoot = fs.existsSync(path.join(root, "src")) ? root : path.join(root, "server")
  const filePath = path.join(serverRoot, "src", "services", "statusDictionaryService.ts")
  if (!fs.existsSync(filePath)) {
    throw new Error("[status-machine-registry-guard] Missing statusDictionaryService.ts under " + serverRoot)
  }
  return { filePath, source: fs.readFileSync(filePath, "utf8") }
}

function extractDomainKeys(source) {
  return new Set(
    [...source.matchAll(/domain_key:\s*['"]([^'"]+)['"]/g)]
      .map((match) => match[1]),
  )
}

function extractBootstrapArrayBody(source, declarationName) {
  const declarationMatch = new RegExp(`const\\s+${declarationName}\\b[\\s\\S]*?=\\s*\\[`).exec(source)
  if (!declarationMatch) return ""

  const bodyStart = declarationMatch.index + declarationMatch[0].length
  const remainingSource = source.slice(bodyStart)
  const closingMatch = /^[ \t]*\][ \t]*;?[ \t]*$/m.exec(remainingSource)
  if (!closingMatch) return ""

  return remainingSource.slice(0, closingMatch.index)
}

function extractTransitionDomainKeys(source) {
  const transitionSource = extractBootstrapArrayBody(source, "BOOTSTRAP_TRANSITIONS")
  return new Set(
    [...transitionSource.matchAll(/domain_key:\s*['"]([^'"]+)['"]/g)]
      .map((match) => match[1]),
  )
}

export function evaluateStatusMachineRegistryGuard(root = DEFAULT_ROOT) {
  const { source } = readStatusDictionarySource(root)
  const registeredDomains = extractDomainKeys(source)
  const transitionDomains = extractTransitionDomainKeys(source)
  const violations = []

  for (const domainKey of REQUIRED_LIFECYCLE_DOMAINS) {
    if (!registeredDomains.has(domainKey)) {
      violations.push({ domainKey, reason: "missing_status_domain" })
      continue
    }
    if (!transitionDomains.has(domainKey)) {
      violations.push({ domainKey, reason: "missing_transition_edges" })
    }
  }

  return {
    requiredDomains: [...REQUIRED_LIFECYCLE_DOMAINS],
    registeredDomains: [...registeredDomains].sort(),
    transitionDomains: [...transitionDomains].sort(),
    violations,
  }
}

export function formatStatusMachineRegistryGuardFailure(violations) {
  const lines = ["[status-machine-registry-guard] Missing lifecycle transition registry coverage:"]
  for (const violation of violations) {
    lines.push("- " + violation.domainKey + " (" + violation.reason + ")")
  }
  lines.push("Add the domain to BUILTIN_LABELS/BOOTSTRAP_DOMAINS and at least one BOOTSTRAP_TRANSITIONS edge, or explicitly remove it from REQUIRED_LIFECYCLE_DOMAINS with a closeout reason.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateStatusMachineRegistryGuard(DEFAULT_ROOT)
  if (result.violations.length) {
    console.error(formatStatusMachineRegistryGuardFailure(result.violations))
    process.exit(1)
  }
  console.log("[status-machine-registry-guard] OK: " + result.requiredDomains.length + " lifecycle domains have transition registry coverage.")
}
