import fs from "fs"
import path from "path"
import ts from "typescript"

const DEFAULT_WORKSPACE_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? process.cwd()
  : path.resolve(process.cwd(), "..")

const ARCHITECTURE_UNITS = new Set([
  "主执行环：建模",
  "主执行环：计划编制",
  "主执行环：执行事实",
  "主执行环：描述分析",
  "主执行环：行动闭环",
  "学习治理环",
  "预测桥",
  "横切履约",
  "验收事实子通道",
  "底座：组织权限",
  "底座：平台运行观测",
])

const RUNTIME_SCOPES = new Set([
  "business_core",
  "governance",
  "platform_foundation",
  "commercial_foundation",
])
const ARCHITECTURE_UNIT_LIST = Array.from(ARCHITECTURE_UNITS)
const UNIT_MODELING = ARCHITECTURE_UNIT_LIST[0]
const UNIT_PLANNING = ARCHITECTURE_UNIT_LIST[1]
const UNIT_EXECUTION_FACT = ARCHITECTURE_UNIT_LIST[2]
const UNIT_ANALYSIS = ARCHITECTURE_UNIT_LIST[3]
const UNIT_ACTION_LOOP = ARCHITECTURE_UNIT_LIST[4]
const UNIT_LEARNING_GOVERNANCE = ARCHITECTURE_UNIT_LIST[5]
const UNIT_FORECAST = ARCHITECTURE_UNIT_LIST[6]
const UNIT_CROSS_CUTTING = ARCHITECTURE_UNIT_LIST[7]
const UNIT_ACCEPTANCE = ARCHITECTURE_UNIT_LIST[8]
const UNIT_ORGANIZATION_PERMISSION = ARCHITECTURE_UNIT_LIST[9]
const UNIT_PLATFORM_OPERATION = ARCHITECTURE_UNIT_LIST[10]

const SQL_TABLE_PATTERN = /\b(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE(?:\s+IF\s+EXISTS)?(?:\s+ONLY)?)\s+((?:"[^"]+"|[A-Za-z_][\w]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w]*))?)/gi
const SQL_VIEW_PATTERN = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:(MATERIALIZED)\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"|[A-Za-z_][\w]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w]*))?)/gi
const SQL_FUNCTION_PATTERN = /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:"[^"]+"|[A-Za-z_][\w]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w]*))?)/gi
const SQL_TRIGGER_PATTERN = /\bCREATE\s+TRIGGER\s+("[^"]+"|[A-Za-z_][\w]*)[\s\S]*?\bON\s+((?:"[^"]+"|[A-Za-z_][\w]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w]*))?)/gi
const SQL_POLICY_PATTERN = /\bCREATE\s+POLICY\s+("[^"]+"|[A-Za-z_][\w]*)\s+ON\s+((?:"[^"]+"|[A-Za-z_][\w]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w]*))?)/gi
const SQL_RLS_PATTERN = /\bALTER\s+TABLE(?:\s+IF\s+EXISTS)?(?:\s+ONLY)?\s+((?:"[^"]+"|[A-Za-z_][\w]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w]*))?)\s+(ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY/gi

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function resolveWorkspaceRoot(root) {
  const absoluteRoot = path.resolve(root)
  if (fs.existsSync(path.join(absoluteRoot, "server", "src"))) return absoluteRoot
  if (fs.existsSync(path.join(absoluteRoot, "src"))) return path.resolve(absoluteRoot, "..")
  return absoluteRoot
}

function lineFor(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function unquoteIdentifier(identifier) {
  return identifier.replace(/^"|"$/g, "")
}

function normalizeTableIdentifier(rawIdentifier) {
  const parts = rawIdentifier.split(".").map((part) => unquoteIdentifier(part.trim()))
  return parts[parts.length - 1]
}

function maskSqlComments(source) {
  return source
    .replace(/--[^\r\n]*/g, (match) => " ".repeat(match.length))
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\r\n]/g, " "))
}

function resolveClientImport(workspaceRoot, importPath) {
  if (!importPath.startsWith("@/")) return null
  const relative = importPath.slice(2)
  const base = path.join(workspaceRoot, "client", "src", relative)
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[1]
}

function addClientPage(pages, workspaceRoot, appPath, sourceFile, id, importPath, node) {
  if (!id || !importPath.startsWith("@/pages/")) return
  const key = `${id}\u0000${importPath}`
  if (pages.has(key)) return
  pages.set(key, {
    kind: "page",
    id,
    importPath,
    sourceFile: appPath,
    resolvedPath: resolveClientImport(workspaceRoot, importPath),
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
  })
}

function isLazyInitializer(node) {
  if (!ts.isCallExpression(node)) return false
  if (ts.isIdentifier(node.expression)) return node.expression.text === "lazy"
  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "lazy"
}

function collectLazyPageImports(initializer) {
  const imports = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments
      if (argument && ts.isStringLiteralLike(argument)) {
        imports.push({ importPath: argument.text, node })
      }
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(initializer, visit)
  return imports
}

function collectDirectPageImportBindings(statement) {
  if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) return []
  const importPath = statement.moduleSpecifier.text
  if (!importPath.startsWith("@/pages/")) return []
  const importClause = statement.importClause
  if (!importClause || importClause.isTypeOnly) return []

  const bindings = []
  if (importClause.name) bindings.push(importClause.name.text)
  if (!importClause.namedBindings) return bindings
  if (ts.isNamespaceImport(importClause.namedBindings)) {
    bindings.push(importClause.namedBindings.name.text)
    return bindings
  }
  for (const element of importClause.namedBindings.elements) {
    if (!element.isTypeOnly) bindings.push(element.name.text)
  }
  return bindings
}

function collectClientPages(workspaceRoot) {
  const appPath = path.join(workspaceRoot, "client", "src", "App.tsx")
  if (!fs.existsSync(appPath)) return []
  const source = fs.readFileSync(appPath, "utf8")
  const sourceFile = ts.createSourceFile(appPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const pages = new Map()
  for (const statement of sourceFile.statements) {
    for (const id of collectDirectPageImportBindings(statement)) {
      addClientPage(pages, workspaceRoot, appPath, sourceFile, id, statement.moduleSpecifier.text, statement)
    }
  }

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && isLazyInitializer(node.initializer)
    ) {
      for (const pageImport of collectLazyPageImports(node.initializer)) {
        addClientPage(
          pages,
          workspaceRoot,
          appPath,
          sourceFile,
          node.name.text,
          pageImport.importPath,
          pageImport.node,
        )
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  return [...pages.values()].sort((left, right) => (
    left.id.localeCompare(right.id) || left.importPath.localeCompare(right.importPath)
  ))
}

function addMigrationSurface(surfaces, surface) {
  const key = [
    surface.kind,
    String(surface.id ?? "").toLowerCase(),
    String(surface.targetId ?? "").toLowerCase(),
  ].join(":")
  if (!surfaces.has(key)) surfaces.set(key, surface)
}

function collectMigrationSurfaces(workspaceRoot) {
  const migrationsDir = path.join(workspaceRoot, "server", "migrations")
  if (!fs.existsSync(migrationsDir)) return []
  const surfaces = new Map()
  for (const filename of fs.readdirSync(migrationsDir).sort()) {
    if (!filename.endsWith(".sql")) continue
    const sourceFile = path.join(migrationsDir, filename)
    const source = maskSqlComments(fs.readFileSync(sourceFile, "utf8"))
    for (const match of source.matchAll(SQL_TABLE_PATTERN)) {
      const id = normalizeTableIdentifier(match[1])
      if (!id || id === "public") continue
      addMigrationSurface(surfaces, {
        kind: "table",
        id,
        sourceFile,
        line: lineFor(source, match.index),
      })
    }
    for (const match of source.matchAll(SQL_VIEW_PATTERN)) {
      const id = normalizeTableIdentifier(match[2])
      if (!id || id === "public") continue
      addMigrationSurface(surfaces, {
        kind: match[1] ? "materialized_view" : "view",
        id,
        sourceFile,
        line: lineFor(source, match.index),
      })
    }
    for (const match of source.matchAll(SQL_FUNCTION_PATTERN)) {
      const id = normalizeTableIdentifier(match[1])
      if (!id || id === "public") continue
      addMigrationSurface(surfaces, {
        kind: "function",
        id,
        sourceFile,
        line: lineFor(source, match.index),
      })
    }
    for (const match of source.matchAll(SQL_TRIGGER_PATTERN)) {
      const id = unquoteIdentifier(match[1])
      const targetId = normalizeTableIdentifier(match[2])
      if (!id || !targetId || targetId === "public") continue
      addMigrationSurface(surfaces, {
        kind: "trigger",
        id,
        targetId,
        sourceFile,
        line: lineFor(source, match.index),
      })
    }
    for (const match of source.matchAll(SQL_POLICY_PATTERN)) {
      const id = unquoteIdentifier(match[1])
      const targetId = normalizeTableIdentifier(match[2])
      if (!id || !targetId || targetId === "public") continue
      addMigrationSurface(surfaces, {
        kind: "policy",
        id,
        targetId,
        sourceFile,
        line: lineFor(source, match.index),
      })
    }
    for (const match of source.matchAll(SQL_RLS_PATTERN)) {
      const targetId = normalizeTableIdentifier(match[1])
      const mode = String(match[2] ?? "").toLowerCase()
      if (!targetId || targetId === "public") continue
      addMigrationSurface(surfaces, {
        kind: "rls",
        id: `${targetId}_${mode}_row_level_security`,
        targetId,
        sourceFile,
        line: lineFor(source, match.index),
      })
    }
  }
  return [...surfaces.values()].sort((a, b) => {
    const kindCompare = a.kind.localeCompare(b.kind)
    return kindCompare || a.id.localeCompare(b.id)
  })
}

function assignment(architectureUnit, runtimeScope, reason) {
  return { architectureUnit, runtimeScope, assignmentReason: reason }
}

function inferPageAssignment(page) {
  if (page.id === "DurationAssetsAdmin" && page.importPath === "@/pages/DurationAssetsAdmin") {
    return assignment(UNIT_LEARNING_GOVERNANCE, "governance", "admin governance page surface")
  }
  const text = `${page.id} ${page.importPath}`.toLowerCase()
  if (/billingsettings|billing settings/.test(text)) {
    return assignment("底座：组织权限", "commercial_foundation", "commercial admission and billing page surface")
  }
  if (/durationaccuracy|ruleasset|business type|custombusinesstype/.test(text)) {
    return assignment("学习治理环", "governance", "admin governance page surface")
  }
  if (/companycockpit|dashboard|reports|tasksummary|responsibility|monitoring/.test(text)) {
    return assignment("主执行环：描述分析", "business_core", "BI and summary page surface")
  }
  if (/gantt|planning|baseline|monthlyplan|wbstemplates/.test(text)) {
    return assignment("主执行环：计划编制", "business_core", "planning and task schedule page surface")
  }
  if (/risk|notification/.test(text)) {
    return assignment("主执行环：行动闭环", "business_core", "action loop page surface")
  }
  if (/milestone|task|projectlayout/.test(text)) {
    return assignment("主执行环：执行事实", "business_core", "execution fact page surface")
  }
  if (/acceptance/.test(text)) {
    return assignment("验收事实子通道", "business_core", "acceptance fact page surface")
  }
  if (/drawing|material|premilestone/.test(text)) {
    return assignment("横切履约", "business_core", "cross-cutting delivery page surface")
  }
  if (/join|workspace|companyprojecttemplate|company project template/.test(text)) {
    return assignment("底座：组织权限", "platform_foundation", "organization and workspace page surface")
  }
  if (/demo|onboarding/.test(text)) {
    return assignment("主执行环：建模", "business_core", "modeling entry page surface")
  }
  return null
}

function inferTableAssignment(table) {
  const id = table.id.toLowerCase()
  if (/^(execution_fact_events|current_execution_facts)$/.test(id)) {
    return assignment(UNIT_EXECUTION_FACT, "business_core", "execution fact authority surface")
  }
  if (/^(algorithm|duration_context|duration_experience|duration_benchmarks|progress_asset|progress_knowledge|regional_climate|construction_dependency_replay|t2_|policy_template|acceptance_template_policy_auto_publish|certificate_template_policy_auto_publish)/.test(id)) {
    return assignment("学习治理环", "governance", "governed learning or policy table surface")
  }
  if (/^(construction_organization_plan_network_runtime|duration_algorithm_accuracy|duration_forecast|duration_plan_network|duration_suggestion|task_duration_forecasts|project_climate|project_weather|weather|runtime_consumer)/.test(id)) {
    return assignment("预测桥", "business_core", "forecast and runtime-consumer table surface")
  }
  if (/^(certificate|construction_drawing|drawing|material|project_materials|pre_milestone)/.test(id)) {
    return assignment("横切履约", "business_core", "cross-cutting delivery table surface")
  }
  if (/^acceptance/.test(id)) {
    return assignment("验收事实子通道", "business_core", "acceptance fact table surface")
  }
  if (/^(users|companies|company_|project_members|project_invitations|project_join_requests|project_direct_invitations|permission_roles)/.test(id)) {
    return assignment("底座：组织权限", "platform_foundation", "organization permission table surface")
  }
  if (/^(job_|operation_logs|schema_migrations|system_settings|trigger_execution_logs|dialog_frequency|status_|data_import|data_lineage|governance_approval|official_holiday|site_shutdown)/.test(id)) {
    return assignment("底座：平台运行观测", "platform_foundation", "platform operation table surface")
  }
  if (/^(project_daily_snapshot|project_data_quality|project_health|project_key_node_snapshots|project_productivity|data_quality|data_confidence|metric_|risk_statistics|responsibility|structured_cause|delay_requests|warning_coverage_snapshots)/.test(id)) {
    return assignment("主执行环：描述分析", "business_core", "summary and analytic table surface")
  }
  if (/^(risks|issues|warning|warnings|notification|notifications|reminder|alerts|deletion_retention|change_|weekly_digests|recommendation_actions)/.test(id)) {
    return assignment("主执行环：行动闭环", "business_core", "action loop table surface")
  }
  if (/^(tasks|task_|project_task_code_rules|milestones|participant_units|project_schedule_states|standard_processes|phases)/.test(id)) {
    return assignment("主执行环：执行事实", "business_core", "execution fact table surface")
  }
  if (/^(wbs|planning|monthly_|task_baseline|task_code|revision_pool|construction_dependency_rule)/.test(id)) {
    return assignment("主执行环：计划编制", "business_core", "planning table surface")
  }
  if (/^(projects|engineering_|scope_|project_scope|demo_projects|project_entity_links|project_location_observations|company_project_templates)/.test(id)) {
    return assignment("主执行环：建模", "business_core", "modeling table surface")
  }
  return null
}

function inferMigrationSurfaceAssignmentSafe(surface) {
  const targetId = surface.targetId ?? surface.id
  const targetAssignment = inferTableAssignment({ id: targetId })
  if (targetAssignment) {
    return assignment(
      targetAssignment.architectureUnit,
      targetAssignment.runtimeScope,
      `${surface.kind} surface owned through ${targetId}`,
    )
  }

  const id = surface.id.toLowerCase()
  if (/duration|algorithm|calibration|replay|seed|policy_template|t2_|learnable|candidate/.test(id)) {
    return assignment(UNIT_LEARNING_GOVERNANCE, "governance", "governed learning or policy SQL surface")
  }
  if (/forecast|climate|weather|runtime_consumer/.test(id)) {
    return assignment(UNIT_FORECAST, "business_core", "forecast and runtime-consumer SQL surface")
  }
  if (/dashboard|health|summary|snapshot|statistics|metric|score|report|structured_cause|cause_attribution/.test(id)) {
    return assignment(UNIT_ANALYSIS, "business_core", "summary and analytic SQL surface")
  }
  if (/task|condition|obstacle|progress|completion|timeline|dependency|milestone|delay/.test(id)) {
    return assignment(UNIT_EXECUTION_FACT, "business_core", "execution fact SQL surface")
  }
  if (/risk|issue|warning|notification|reminder|delete|deletion|confirm|reject|approve/.test(id)) {
    return assignment(UNIT_ACTION_LOOP, "business_core", "action loop SQL surface")
  }
  if (/acceptance/.test(id)) {
    return assignment(UNIT_ACCEPTANCE, "business_core", "acceptance fact SQL surface")
  }
  if (/drawing|material|certificate|pre_milestone/.test(id)) {
    return assignment(UNIT_CROSS_CUTTING, "business_core", "cross-cutting delivery SQL surface")
  }
  if (/member|owner|permission|auth|user|company|workspace/.test(id)) {
    return assignment(UNIT_ORGANIZATION_PERMISSION, "platform_foundation", "organization permission SQL surface")
  }
  if (/job|log|system|settings|schema|migration|version|checksum|lineage|import|nextval|updated_at/.test(id)) {
    return assignment(UNIT_PLATFORM_OPERATION, "platform_foundation", "platform operation SQL surface")
  }
  if (/wbs|planning|baseline|monthly|plan/.test(id)) {
    return assignment(UNIT_PLANNING, "business_core", "planning SQL surface")
  }
  if (/project|engineering|scope|entity/.test(id)) {
    return assignment(UNIT_MODELING, "business_core", "modeling SQL surface")
  }
  return null
}

function inferMigrationSurfaceAssignment(surface) {
  return inferMigrationSurfaceAssignmentSafe(surface)
}

/*
function inferMigrationSurfaceAssignmentLegacy(surface) {
  const targetId = surface.targetId ?? surface.id
  const targetAssignment = inferTableAssignment({ id: targetId })
  if (targetAssignment) {
    return assignment(
      targetAssignment.architectureUnit,
      targetAssignment.runtimeScope,
      `${surface.kind} surface owned through ${targetId}`,
    )
  }

  const id = surface.id.toLowerCase()
  if (/duration|algorithm|calibration|replay|seed|policy_template|t2_|learnable|candidate/.test(id)) {
    return assignment("瀛︿範娌荤悊鐜?, "governance", "governed learning or policy SQL surface")
  }
  if (/dashboard|health|summary|snapshot|statistics|metric|score|report/.test(id)) {
    return assignment("涓绘墽琛岀幆锛氭弿杩板垎鏋?, "business_core", "summary and analytic SQL surface")
  }
  if (/task|condition|obstacle|progress|completion|timeline|dependency|milestone|delay/.test(id)) {
    return assignment("涓绘墽琛岀幆锛氭墽琛屼簨瀹?, "business_core", "execution fact SQL surface")
  }
  if (/risk|issue|warning|notification|reminder|delete|deletion|confirm|reject|approve/.test(id)) {
    return assignment("涓绘墽琛岀幆锛氳鍔ㄩ棴鐜?, "business_core", "action loop SQL surface")
  }
  if (/acceptance/.test(id)) {
    return assignment("楠屾敹浜嬪疄瀛愰€氶亾", "business_core", "acceptance fact SQL surface")
  }
  if (/drawing|material|certificate|pre_milestone/.test(id)) {
    return assignment("妯垏灞ョ害", "business_core", "cross-cutting delivery SQL surface")
  }
  if (/member|owner|permission|auth|user|company|workspace/.test(id)) {
    return assignment("搴曞骇锛氱粍缁囨潈闄?, "platform_foundation", "organization permission SQL surface")
  }
  if (/job|log|system|settings|schema|migration|version|checksum|lineage|import/.test(id)) {
    return assignment("搴曞骇锛氬钩鍙拌繍琛岃娴?, "platform_foundation", "platform operation SQL surface")
  }
  if (/wbs|planning|baseline|monthly|plan/.test(id)) {
    return assignment("涓绘墽琛岀幆锛氳鍒掔紪鍒?, "business_core", "planning SQL surface")
  }
  if (/project|engineering|scope|entity/.test(id)) {
    return assignment("涓绘墽琛岀幆锛氬缓妯?, "business_core", "modeling SQL surface")
  }
  return null
}

*/

function validateAssignment(surface, inferred) {
  if (!inferred) {
    return {
      reason: "unassigned_surface",
      kind: surface.kind,
      id: surface.id,
      sourceFile: surface.sourceFile,
      line: surface.line,
    }
  }
  if (!ARCHITECTURE_UNITS.has(inferred.architectureUnit) || !RUNTIME_SCOPES.has(inferred.runtimeScope)) {
    return {
      reason: "invalid_surface_assignment",
      kind: surface.kind,
      id: surface.id,
      sourceFile: surface.sourceFile,
      line: surface.line,
      assignment: inferred,
    }
  }
  return null
}

export function evaluateSystemSurfaceOwnershipGuard(root = DEFAULT_WORKSPACE_ROOT) {
  const workspaceRoot = resolveWorkspaceRoot(root)
  const pages = collectClientPages(workspaceRoot)
  const migrationSurfaces = collectMigrationSurfaces(workspaceRoot)
  const surfaces = [...pages, ...migrationSurfaces]
  const assignments = surfaces.map((surface) => ({
    ...surface,
    assignment: surface.kind === "page"
      ? inferPageAssignment(surface)
      : inferMigrationSurfaceAssignment(surface),
  }))
  const violations = []
  for (const surface of assignments) {
    const assignmentViolation = validateAssignment(surface, surface.assignment)
    if (assignmentViolation) violations.push(assignmentViolation)
    if (surface.kind === "page" && surface.resolvedPath && !fs.existsSync(surface.resolvedPath)) {
      violations.push({
        reason: "missing_page_import_target",
        kind: surface.kind,
        id: surface.id,
        importPath: surface.importPath,
        resolvedPath: surface.resolvedPath,
        sourceFile: surface.sourceFile,
        line: surface.line,
      })
    }
  }
  return {
    workspaceRoot,
    pageCount: pages.length,
    tableCount: migrationSurfaces.filter((surface) => surface.kind === "table").length,
    migrationSurfaceCount: migrationSurfaces.length,
    assignments,
    violations,
  }
}

export function formatSystemSurfaceOwnershipGuardFailure(result, cwd = process.cwd()) {
  const lines = ["[system-surface-ownership-guard] Surface ownership violations found:"]
  for (const violation of result.violations) {
    lines.push(`- ${violation.reason}: ${violation.kind} ${violation.id} at ${path.relative(cwd, violation.sourceFile ?? "")}${violation.line ? `:${violation.line}` : ""}`)
  }
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateSystemSurfaceOwnershipGuard(DEFAULT_WORKSPACE_ROOT)
  if (result.violations.length) {
    console.error(formatSystemSurfaceOwnershipGuardFailure(result))
    process.exit(1)
  }
  console.log(`[system-surface-ownership-guard] OK: ${result.pageCount} page surfaces and ${result.migrationSurfaceCount} migration SQL surfaces assigned.`)
}
