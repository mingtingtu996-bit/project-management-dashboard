import fs from "fs"
import path from "path"
import ts from "typescript"

const DEFAULT_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? path.resolve(process.cwd(), "server")
  : process.cwd()

const APPROVAL_MARKS = [
  "workspace-isolation-global-read-approved",
  "workspace-isolation-capability-read-approved",
  "workspace-isolation-capability-write-approved",
  "workspace-isolation-public-directory-approved",
  "workspace-isolation-system-job-approved",
  "workspace-isolation-system-boundary-approved",
]
const ROUTE_PATTERN = /\brouter\.(get|post|put|patch|delete)\s*\(/g
const TENANT_DATA_PATTERN = /\b(?:companies|company_[a-z_]+|project_[a-z_]+|projects|tasks|risks|milestones|notifications|wbs_templates|acceptance_[a-z_]+|pre_milestones|participant_units|engineering_objects|project_id|company_id)\b/i
const DATABASE_ACCESS_PATTERN = /\b(?:executeSQL|executeSQLOne|rawQuery|supabase)\b|(?<!\.)\bquery\s*\(/
const ISOLATION_SIGNAL_PATTERN = /\b(?:getCurrentCompanyMembership|getVisibleProjectIds(?:ForRequest)?|getProjectCompanyId|getProjectPermissionLevel|canAccessProject|requireProjectMember(?:WhenScoped)?|requireProjectEditor|requireProjectOwner|ensureProjectMember|ensureProjectOwner|ensureCanReadProject|ensureCanReadTasks|ensureProjectWithinCurrentCompany|requireCurrentCompanyAdmin|requireCompanyAdmin|requireCompanyMembership|requireProjectEditorAccess|assertWizardProjectEditor|getAccess|loadProjectScopedReviewRules|resolveNotificationUserFilter|listPersistedNotificationsForScope|filterVisibleNotifications|canHandleNotification|loadNotificationForPersonalAction|isInternalNotificationMutation|getCachedCompanySummaryVisibleProjectIds|loadProjectListForUser|loadVisibleWbsTemplates|company_members|is_active_company_member)\b/
const AUTHENTICATED_USER_PATTERN = /\breq\.user(?:\?\.|\.)id\b/
const USER_ROW_SCOPE_PATTERN = /\b(?:recipient_)?user_id\b/
const PERSONAL_SCOPE_TABLE_PATTERN = /\b(?:company_join_requests|project_join_requests|project_direct_invitations|notifications)\b/
const SERVICE_DATABASE_ACCESS_PATTERN = /\b(?:executeSQL|executeSQLOne|rawQuery|queryExec|supabase)\b|(?:\b|\.)query\s*\(/
const SERVICE_SCOPE_PARAMETER_PATTERN = /\b(?:companyId|companyIds|company_id|projectId|projectIds|project_id|visibleProjectIds|workspaceScope|tenantScope)\b/
const SERVICE_SCOPE_MEMBER_PATTERN = /\.\s*(?:companyId|companyIds|company_id|projectId|projectIds|project_id|visibleProjectIds)\b/
const SERVICE_SCAN_EXCLUDED_FILES = new Set([
  "dbService.ts",
])

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (["dist", "node_modules", "__tests__", "tmp"].includes(entry.name)) continue
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

function lineFor(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function hasApprovalMarkBefore(lines, lineIndex) {
  let inspected = 0
  for (let i = lineIndex - 1; i >= 0 && i >= lineIndex - 4; i--) {
    const trimmed = lines[i]?.trim() ?? ""
    if (!trimmed) continue
    inspected += 1
    if (APPROVAL_MARKS.some((mark) => trimmed.includes(mark))) return true
    if (!trimmed.startsWith("//")) return false
    if (inspected >= 4) return false
  }
  return false
}

function findCallEnd(source, openParenIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let i = openParenIndex; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char
      continue
    }
    if (char === "(") depth += 1
    if (char === ")") {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return source.length
}

function findBlockEnd(source, openBraceIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let i = openBraceIndex; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char
      continue
    }
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return source.length - 1
}

function collectLocalFunctionSources(source) {
  const functions = new Map()
  const declarationPattern = /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g
  for (const match of source.matchAll(declarationPattern)) {
    const openBraceIndex = source.indexOf("{", match.index + match[0].length)
    if (openBraceIndex < 0) continue
    const end = findBlockEnd(source, openBraceIndex)
    functions.set(match[1], source.slice(match.index, end + 1))
  }
  return functions
}

function expandReferencedLocalFunctions(callSource, localFunctions) {
  const expanded = []
  const queued = [...callSource.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((match) => match[1])
  const visited = new Set()
  while (queued.length > 0) {
    const name = queued.shift()
    if (!name || visited.has(name)) continue
    visited.add(name)
    const functionSource = localFunctions.get(name)
    if (!functionSource) continue
    expanded.push(functionSource)
    for (const nested of functionSource.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      if (!visited.has(nested[1])) queued.push(nested[1])
    }
  }
  return expanded.join("\n")
}

function scanRouteFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8")
  const lines = source.split(/\r?\n/)
  const localFunctions = collectLocalFunctionSources(source)
  const fileHasTenantDataAccess = TENANT_DATA_PATTERN.test(source) && DATABASE_ACCESS_PATTERN.test(source)
  if (!fileHasTenantDataAccess) return []

  const violations = []
  let approvedRouteCount = 0
  let isolatedRouteCount = 0
  for (const match of source.matchAll(ROUTE_PATTERN)) {
    const line = lineFor(source, match.index)
    if (hasApprovalMarkBefore(lines, line - 1)) {
      approvedRouteCount += 1
      continue
    }

    const openParenIndex = source.indexOf("(", match.index)
    const end = findCallEnd(source, openParenIndex)
    const callSource = source.slice(match.index, end + 1)
    const routeSource = `${callSource}\n${expandReferencedLocalFunctions(callSource, localFunctions)}`
    if (!TENANT_DATA_PATTERN.test(routeSource) || !DATABASE_ACCESS_PATTERN.test(routeSource)) continue
    if (
      ISOLATION_SIGNAL_PATTERN.test(routeSource)
      || (
        AUTHENTICATED_USER_PATTERN.test(routeSource)
        && USER_ROW_SCOPE_PATTERN.test(routeSource)
        && PERSONAL_SCOPE_TABLE_PATTERN.test(routeSource)
      )
    ) {
      isolatedRouteCount += 1
      continue
    }

    violations.push({
      filePath,
      line,
      reason: "tenant_data_route_without_company_or_project_isolation_signal",
    })
  }

  if (violations.length === 0 && approvedRouteCount === 0 && isolatedRouteCount === 0 && !ISOLATION_SIGNAL_PATTERN.test(source)) {
    const firstRoute = [...source.matchAll(ROUTE_PATTERN)][0]
    violations.push({
      filePath,
      line: firstRoute ? lineFor(source, firstRoute.index) : 1,
      reason: "tenant_data_file_without_isolation_signal",
    })
  }

  return violations
}

function serviceFunctionName(node, sourceFile) {
  if (node.name && typeof node.name.getText === "function") return node.name.getText(sourceFile)
  const parent = node.parent
  if (parent && ts.isVariableDeclaration(parent)) return parent.name.getText(sourceFile)
  return "anonymous"
}

function isFunctionLikeWithBody(node) {
  return (
    ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
  ) && Boolean(node.body)
}

function isNestedDatabaseCallChain(node) {
  const parent = node.parent
  return Boolean(
    parent
    && ts.isPropertyAccessExpression(parent)
    && parent.expression === node
    && parent.parent
    && ts.isCallExpression(parent.parent),
  )
}

function isDatabaseAccessCall(node, sourceFile) {
  if (!ts.isCallExpression(node) || isNestedDatabaseCallChain(node)) return false
  const expression = node.expression.getText(sourceFile)
  const callSource = node.getText(sourceFile)
  return (
    /^(?:executeSQL|executeSQLOne|rawQuery|queryExec|query)$/.test(expression)
    || /\.query$/.test(expression)
    || /\bsupabase\s*\.\s*from\s*\(/.test(callSource)
  )
}

function collectDirectDatabaseCalls(functionNode, sourceFile) {
  const calls = []

  function visit(node) {
    if (node !== functionNode && isFunctionLikeWithBody(node)) return
    if (isDatabaseAccessCall(node, sourceFile)) calls.push(node)
    ts.forEachChild(node, visit)
  }

  visit(functionNode.body)
  return calls
}

function nodeUsesScopeCarrier(node, sourceFile, scopeCarriers) {
  let bound = false

  function visit(current) {
    if (bound) return
    if (
      ts.isIdentifier(current)
      && (scopeCarriers.has(current.text) || SERVICE_SCOPE_PARAMETER_PATTERN.test(current.text))
    ) {
      bound = true
      return
    }
    if (ts.isPropertyAccessExpression(current) && SERVICE_SCOPE_MEMBER_PATTERN.test(current.getText(sourceFile))) {
      bound = true
      return
    }
    ts.forEachChild(current, visit)
  }

  visit(node)
  return bound
}

function collectScopeCarrierNames(functionNode, sourceFile) {
  const carriers = new Set()
  for (const parameter of functionNode.parameters) {
    if (ts.isIdentifier(parameter.name)) {
      if (SERVICE_SCOPE_PARAMETER_PATTERN.test(parameter.name.text)) {
        carriers.add(parameter.name.text)
      }
      continue
    }
    for (const identifier of parameter.name.getText(sourceFile).matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      if (SERVICE_SCOPE_PARAMETER_PATTERN.test(identifier[1])) {
        carriers.add(identifier[1])
      }
    }
  }

  let changed = true
  while (changed) {
    changed = false

    function visit(node) {
      if (node !== functionNode && isFunctionLikeWithBody(node)) return
      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && !carriers.has(node.name.text)
        && nodeUsesScopeCarrier(node.initializer, sourceFile, carriers)
      ) {
        carriers.add(node.name.text)
        changed = true
      }
      if (
        ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isIdentifier(node.left)
        && !carriers.has(node.left.text)
        && nodeUsesScopeCarrier(node.right, sourceFile, carriers)
      ) {
        carriers.add(node.left.text)
        changed = true
      }
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'push'
        && ts.isIdentifier(node.expression.expression)
        && !carriers.has(node.expression.expression.text)
        && node.arguments.some((argument) => nodeUsesScopeCarrier(argument, sourceFile, carriers))
      ) {
        carriers.add(node.expression.expression.text)
        changed = true
      }
      ts.forEachChild(node, visit)
    }

    visit(functionNode.body)
  }
  return carriers
}

function databaseCallUsesScope(call, sourceFile, scopeCarriers) {
  if (nodeUsesScopeCarrier(call, sourceFile, scopeCarriers)) return true
  const parent = call.parent
  return Boolean(
    parent
    && ts.isVariableDeclaration(parent)
    && ts.isIdentifier(parent.name)
    && scopeCarriers.has(parent.name.text),
  )
}

function isDatabaseControlCall(call, sourceFile) {
  const callSource = call.getText(sourceFile)
  return (
    /\.query\s*\(\s*['"`]\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE\s+SAVEPOINT)\b/i.test(callSource)
    || /\bnextval\s*\(/i.test(callSource)
  )
}

function analyzeBoundScopeInDatabaseCalls(functionNode, sourceFile, expandParameterTypes) {
  const calls = collectDirectDatabaseCalls(functionNode, sourceFile)
    .filter((call) => !isDatabaseControlCall(call, sourceFile))
  if (calls.length === 0) return { status: 'not_applicable', unboundCalls: [] }
  const scopeCarriers = collectScopeCarrierNames(functionNode, sourceFile)
  const tenantCalls = calls.filter((call) => TENANT_DATA_PATTERN.test(call.getText(sourceFile)))
  const callsToCheck = tenantCalls.length > 0 ? tenantCalls : calls
  const unboundCalls = callsToCheck.filter((call) => !databaseCallUsesScope(call, sourceFile, scopeCarriers))
  return {
    status: unboundCalls.length === 0 ? 'bound' : 'unbound',
    unboundCalls,
  }
}

function scanServiceFile(filePath) {
  if (SERVICE_SCAN_EXCLUDED_FILES.has(path.basename(filePath))) return []
  const source = fs.readFileSync(filePath, "utf8")
  if (!TENANT_DATA_PATTERN.test(source) || !SERVICE_DATABASE_ACCESS_PATTERN.test(source)) return []

  const lines = source.split(/\r?\n/)
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const violations = []
  const localTypeSources = new Map()
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      localTypeSources.set(statement.name.text, statement.getText(sourceFile))
    }
  }

  function expandParameterTypes(parameters) {
    const fragments = parameters.map((parameter) => parameter.getText(sourceFile))
    const queued = parameters.flatMap((parameter) => (
      parameter.type
        ? [...parameter.type.getText(sourceFile).matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((match) => match[1])
        : []
    ))
    const visited = new Set()
    while (queued.length > 0) {
      const name = queued.shift()
      if (!name || visited.has(name)) continue
      visited.add(name)
      const typeSource = localTypeSources.get(name)
      if (!typeSource) continue
      fragments.push(typeSource)
      for (const nested of typeSource.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
        if (!visited.has(nested[1])) queued.push(nested[1])
      }
    }
    return fragments.join(" ")
  }

  function visit(node, inheritedScope = false) {
    let childInheritedScope = inheritedScope
    if (isFunctionLikeWithBody(node)) {
      const functionSource = node.getText(sourceFile)
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
      const parameterSource = expandParameterTypes(node.parameters)
      const hasExplicitScope = (
        SERVICE_SCOPE_PARAMETER_PATTERN.test(parameterSource)
        || SERVICE_SCOPE_MEMBER_PATTERN.test(functionSource)
        || ISOLATION_SIGNAL_PATTERN.test(functionSource)
        || hasApprovalMarkBefore(lines, line - 1)
      )
      childInheritedScope = inheritedScope || hasExplicitScope
      if (TENANT_DATA_PATTERN.test(functionSource) && SERVICE_DATABASE_ACCESS_PATTERN.test(functionSource)) {
        const boundScopeAnalysis = analyzeBoundScopeInDatabaseCalls(node, sourceFile, expandParameterTypes)
        if (!childInheritedScope) {
          violations.push({
            filePath,
            line,
            functionName: serviceFunctionName(node, sourceFile),
            reason: "tenant_data_service_without_explicit_scope",
          })
        } else if (
          !hasApprovalMarkBefore(lines, line - 1)
          && boundScopeAnalysis.status === 'unbound'
        ) {
          const firstUnboundCall = boundScopeAnalysis.unboundCalls[0]
          violations.push({
            filePath,
            line,
            functionName: serviceFunctionName(node, sourceFile),
            reason: "tenant_data_service_without_bound_scope",
            unboundCall: firstUnboundCall
              ? firstUnboundCall.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 180)
              : undefined,
          })
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, childInheritedScope))
  }

  visit(sourceFile)
  return violations
}

export function evaluateWorkspaceIsolationGuard(root = DEFAULT_ROOT) {
  const serverRoot = fs.existsSync(path.join(root, "src")) ? root : path.join(root, "server")
  const routesDir = path.join(serverRoot, "src", "routes")
  const servicesDir = path.join(serverRoot, "src", "services")
  const routeFiles = walk(routesDir)
  const serviceFiles = walk(servicesDir)
  const files = [...routeFiles, ...serviceFiles]
  if (routeFiles.length === 0) throw new Error("[workspace-isolation-guard] No route files found under " + routesDir)
  const violations = [
    ...routeFiles.flatMap(scanRouteFile),
    ...serviceFiles.flatMap(scanServiceFile),
  ]
  return { files, violations }
}

export function formatWorkspaceIsolationGuardFailure(violations, cwd = process.cwd()) {
  const lines = ["[workspace-isolation-guard] Tenant data route isolation violations:"]
  for (const violation of violations) {
    const owner = violation.functionName ? ` (${violation.functionName})` : ""
    const detail = violation.unboundCall ? ` :: ${violation.unboundCall}` : ""
    lines.push("- " + path.relative(cwd, violation.filePath) + ":" + violation.line + " " + violation.reason + owner + detail)
  }
  lines.push("Use current company/project membership helpers, project permission middleware, or add a nearby explicit workspace-isolation approval comment for reviewed global catalogs, public directories, or capability-scoped reads.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateWorkspaceIsolationGuard(DEFAULT_ROOT)
  if (result.violations.length) {
    console.error(formatWorkspaceIsolationGuardFailure(result.violations))
    process.exit(1)
  }
  console.log("[workspace-isolation-guard] OK: scanned " + result.files.length + " route and service files.")
}
