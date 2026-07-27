import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.LOG_LEVEL ||= 'error'
process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.SUPABASE_ANON_KEY ||= 'local-task-plan-drilldown-simulation-key'
process.env.SUPABASE_SERVICE_KEY ||= process.env.SUPABASE_ANON_KEY

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_MASTER_PLAN = path.join(
  REPO_ROOT,
  'project-testing',
  'reports',
  'executable-default-master-plan-20260711',
  'general_civil-complete-plan.json',
)
const DEFAULT_OUTPUT_ROOT = path.join(
  REPO_ROOT,
  'project-testing',
  'reports',
  'task-plan-drilldown-20260711',
)
const TSX_BOOTSTRAP_ENV = 'WORKBUDDY_TASK_PLAN_DRILLDOWN_SIMULATION_TSX_BOOTSTRAPPED'
const LOCAL_TSX_CLI_MODULE = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const PROJECT_ID = '00000000-0000-4000-8000-000000000001'
const MASTER_PARENT_ID = '00000000-0000-4000-8000-000000000101'
const CYCLE_PARENT_ID = '00000000-0000-4000-8000-000000000201'
const REPRESENTATIVE_WBS_CODE = 'RMP-04-01-02'

function isDirectEntrypoint() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
}

function isTsxRuntime() {
  return process.execArgv.some((arg) => /(?:^|[\\/])tsx[\\/]/i.test(String(arg)))
}

function runViaTsxAndExit() {
  const result = spawnSync(process.execPath, [
    LOCAL_TSX_CLI_MODULE,
    fileURLToPath(import.meta.url),
    ...process.argv.slice(2),
  ], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, [TSX_BOOTSTRAP_ENV]: '1' },
    shell: false,
  })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

function parseArgs(argv) {
  const args = { masterPlan: DEFAULT_MASTER_PLAN, outputRoot: DEFAULT_OUTPUT_ROOT }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--master-plan') {
      args.masterPlan = path.resolve(argv[index + 1])
      index += 1
    } else if (argv[index] === '--output-root') {
      args.outputRoot = path.resolve(argv[index + 1])
      index += 1
    }
  }
  return args
}

function text(value) {
  return String(value ?? '').trim()
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function escapeCell(value) {
  return text(value).replaceAll('|', '\\|').replaceAll('\n', '<br>') || '-'
}

function inclusiveDays(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
}

function planRow(row) {
  const values = record(row.values)
  return {
    clientRowId: row.clientRowId,
    title: text(values.title),
    standardWorkCode: text(values.standard_work_code),
    nodeType: text(values.wbs_node_type),
    projectionMode: text(values.row_projection_mode),
    plannedStartDate: text(values.planned_start_date),
    plannedEndDate: text(values.planned_end_date),
    durationDays: Number(values.smart_reference_days) || inclusiveDays(
      text(values.planned_start_date),
      text(values.planned_end_date),
    ),
    predecessorCount: row.predecessorDependencies?.length ?? 0,
    predecessors: (row.predecessorDependencies ?? []).map((dependency) => ({
      clientRowId: dependency.clientRowId,
      dependencyType: dependency.dependencyType,
      lagDays: dependency.lagDays,
      intentCode: dependency.intentCode ?? null,
    })),
    lineage: record(record(values.standard_task_metadata).drilldownGenerationLineage),
    rhythm: record(record(values.standard_task_metadata).taskPlanRhythmDrilldown),
  }
}

function buildMarkdown(report) {
  const lines = [
    '# 任务计划下钻只读模拟',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 本地只读门禁：${report.status.toUpperCase()}`,
    `- 向导完整总控计划：${report.masterPlan.scheduleRowCount} 行。`,
    `- 代表性父任务：${report.parent.wbsCode} ${report.parent.title}，${report.parent.plannedStartDate} 至 ${report.parent.plannedEndDate}，${report.parent.durationDays} 天。`,
    `- 首次下钻：${report.processDrilldown.rowCount} 行标准层施工循环；单次硬限 ${report.rowPolicy.drilldownHardLimit} 行。`,
    `- 二次下钻样例：首个循环展开 ${report.activityStepDrilldown.rowCount} 行作业步骤。`,
    `- 一次下钻后的项目任务树：${report.projectTreeAfterOneExpansion.persistedRowCount} 行；这不是完整 300-800 行执行计划，而是按选中任务逐步形成。`,
    '- 数据边界：本报告未连接真实 DB，未创建任务，未写依赖，未发布 runtime。',
    '',
    '## 首次下钻计划表',
    '',
    '| 序号 | 任务名称 | 开始 | 完成 | 工期（天） | 前置 | 层级 |',
    '|---:|---|---|---|---:|---|---|',
  ]
  for (const [index, row] of report.processDrilldown.rows.entries()) {
    const predecessorEdge = row.predecessors[0]
    const predecessor = predecessorEdge
      ? `${report.processDrilldown.rows[index - 1]?.title ?? predecessorEdge.clientRowId} ${predecessorEdge.dependencyType}`
      : '-'
    lines.push(`| ${index + 1} | ${escapeCell(row.title)} | ${row.plannedStartDate} | ${row.plannedEndDate} | ${row.durationDays} | ${escapeCell(predecessor)} | 工序明细 |`)
  }
  lines.push('', '## 单循环二次下钻样例', '')
  lines.push('| 序号 | 作业步骤 | 开始 | 完成 | 工期（天） | 前置关系 |')
  lines.push('|---:|---|---|---|---:|---|')
  for (const [index, row] of report.activityStepDrilldown.rows.entries()) {
    const predecessor = row.predecessors[0]
    lines.push(`| ${index + 1} | ${escapeCell(row.title)} | ${row.plannedStartDate} | ${row.plannedEndDate} | ${row.durationDays} | ${predecessor ? `${predecessor.dependencyType}${predecessor.lagDays ? `+${predecessor.lagDays}d` : ''}` : '-'} |`)
  }
  lines.push('', '## 自动核查', '')
  for (const [key, value] of Object.entries(report.audit)) {
    lines.push(`- ${key}: ${value === true ? 'PASS' : value === false ? 'FAIL' : value}`)
  }
  lines.push('', '## 不能伪装完成的边界', '')
  lines.push('- 本报告证明代码可在本地只读环境生成受控候选计划，不证明 production/live 权限、事务、租户隔离或线上性能。')
  lines.push('- 施工循环当前使用有序循环编号；实际项目若已物化楼层对象，仍应在提交前绑定真实楼层标识。')
  lines.push('- T2 资产保持 candidate_seeded，预览后的用户明确提交属于普通计划确认，不等同于 runtime publication。')
  return `${lines.join('\n')}\n`
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const masterPlan = JSON.parse(await fs.readFile(args.masterPlan, 'utf8'))
  const parentRow = masterPlan.rows.find((row) => row.wbsCode === REPRESENTATIVE_WBS_CODE)
  if (!parentRow) throw new Error(`Representative master-plan row ${REPRESENTATIVE_WBS_CODE} was not found.`)

  const [generationModule, policyModule] = await Promise.all([
    import(pathToFileURL(path.join(REPO_ROOT, 'server', 'src', 'services', 'wbsTemplateGenerationService.ts')).href),
    import(pathToFileURL(path.join(REPO_ROOT, 'server', 'src', 'services', 'taskPlanDrilldownPolicyService.ts')).href),
  ])
  const catalog = await generationModule.listWbsTemplateCatalog({ includeNodes: true })
  const catalogs = catalog.templates.map((template) => (
    template.id === catalog.builtIn.templateId && !(template.nodes?.length)
      ? { ...template, nodes: catalog.builtIn.nodes }
      : template
  ))
  const parentTask = {
    id: MASTER_PARENT_ID,
    project_id: PROJECT_ID,
    title: parentRow.title,
    planned_start_date: parentRow.plannedStartDate,
    planned_end_date: parentRow.plannedEndDate,
    building_object_id: parentRow.buildingObjectId,
    execution_phase: parentRow.executionPhase,
    execution_lane: parentRow.executionLane,
    standard_work_code: parentRow.wbsCode,
    standard_work_name: parentRow.title,
    sort_order: parentRow.sortOrder,
    standard_task_metadata: {
      drilldownGenerationLineage: { level: 'master_control' },
      durationAssetMapping: { t2RhythmTemplateId: parentRow.t2RhythmTemplateId },
      residentialMasterPlan: { standardFloorCount: masterPlan.project.standardFloorCount },
      executableDefaultMasterPlan: { status: 'executable_default_master_plan' },
    },
  }
  const processRecommendation = policyModule.resolveTaskPlanDrilldownRecommendation(parentTask, catalogs)
  const processOperation = policyModule.governTaskPlanDrilldownOperation(parentTask, {
    type: 'template_generate',
    generationBatchId: 'simulation-task-plan-process-drilldown',
    templateId: processRecommendation.templateId,
    selectedNodeIds: processRecommendation.selectedNodeIds,
  })
  const processGenerated = await generationModule.generateWbsTemplateRows({
    projectId: PROJECT_ID,
    surface: 'task_list',
    diagnosticDurationSuggestionMode: 'fast_template',
    operation: processOperation,
  })
  const firstProcessRow = processGenerated.rows[0]
  const firstProcessValues = record(firstProcessRow.values)
  const cycleParentTask = {
    id: CYCLE_PARENT_ID,
    project_id: PROJECT_ID,
    ...firstProcessValues,
    standard_task_metadata: firstProcessValues.standard_task_metadata,
  }
  const activityRecommendation = policyModule.resolveTaskPlanDrilldownRecommendation(cycleParentTask, catalogs)
  const activityOperation = policyModule.governTaskPlanDrilldownOperation(cycleParentTask, {
    type: 'template_generate',
    generationBatchId: 'simulation-task-plan-activity-drilldown',
    templateId: activityRecommendation.templateId,
    selectedNodeIds: activityRecommendation.selectedNodeIds,
  })
  const activityGenerated = await generationModule.generateWbsTemplateRows({
    projectId: PROJECT_ID,
    surface: 'task_list',
    diagnosticDurationSuggestionMode: 'fast_template',
    operation: activityOperation,
  })

  const processRows = processGenerated.rows.map(planRow)
  const activityRows = activityGenerated.rows.map(planRow)
  const forbiddenProcessPattern = /进场检验|水泥|大体积测温|后浇带|抗渗试压|塔吊|施工电梯|交底记录/
  const processWindowFits = processRows[0]?.plannedStartDate === parentRow.plannedStartDate
    && processRows.at(-1)?.plannedEndDate === parentRow.plannedEndDate
  const processDependenciesClosed = processRows.every((row, index) => (
    index === 0 ? row.predecessorCount === 0 : row.predecessorCount === 1
  ))
  const activityDependenciesClosed = activityRows.every((row, index) => (
    index === 0 ? row.predecessorCount === 0 : row.predecessorCount === 1
  ))
  const audit = {
    processRecommendationUsesBoundT2Asset: processRecommendation.resolutionSource === 'rhythm_asset_match',
    processRowCountWithinHardLimit: processRows.length <= policyModule.TASK_PLAN_DRILLDOWN_ROW_LIMIT,
    processRowsAreScheduleRowsOnly: processRows.every((row) => row.projectionMode === 'schedule_row'),
    processRowsFitParentWindow: processWindowFits,
    processDependencyChainClosed: processDependenciesClosed,
    processCycleDurationRange: `${Math.min(...processRows.map((row) => row.durationDays))}-${Math.max(...processRows.map((row) => row.durationDays))} days`,
    forbiddenGenericProcessLeakCount: processRows.filter((row) => forbiddenProcessPattern.test(row.title)).length,
    activityRowCountWithinHardLimit: activityRows.length <= policyModule.TASK_PLAN_DRILLDOWN_ROW_LIMIT,
    activityRowsAreScheduleRowsOnly: activityRows.every((row) => row.projectionMode === 'schedule_row'),
    activityDependencyChainClosed: activityDependenciesClosed,
    noProductionMutation: true,
  }
  const booleanAuditPassed = Object.values(audit).every((value) => value !== false)
    && audit.forbiddenGenericProcessLeakCount === 0
  const report = {
    generatedAt: new Date().toISOString(),
    status: booleanAuditPassed ? 'pass' : 'fail',
    environmentTarget: 'local_static',
    gateTier: 'candidate_read_only_evidence',
    sourceMasterPlan: path.relative(REPO_ROOT, args.masterPlan).replaceAll('\\', '/'),
    mutationBoundary: 'report_files_only_no_db_no_task_write_no_dependency_write_no_runtime_publication',
    masterPlan: {
      projectName: masterPlan.project.projectName,
      scheduleRowCount: masterPlan.summary.scheduleRowCount,
      projectStartDate: masterPlan.summary.projectStartDate,
      projectEndDate: masterPlan.summary.projectEndDate,
    },
    parent: {
      wbsCode: parentRow.wbsCode,
      title: parentRow.title,
      plannedStartDate: parentRow.plannedStartDate,
      plannedEndDate: parentRow.plannedEndDate,
      durationDays: parentRow.calendarDurationDays,
      buildingObjectId: parentRow.buildingObjectId,
      t2RhythmTemplateId: parentRow.t2RhythmTemplateId,
      standardFloorCount: masterPlan.project.standardFloorCount,
    },
    rowPolicy: {
      genericSingleBatchBudget: 500,
      drilldownHardLimit: policyModule.TASK_PLAN_DRILLDOWN_ROW_LIMIT,
      normalExecutionPlanRange: [300, 800],
      projectTotalBlockedAt500: false,
      projectWarningThreshold: 800,
    },
    processDrilldown: {
      recommendation: processRecommendation,
      rowCount: processRows.length,
      scheduleTrustGate: processGenerated.scheduleTrustGate,
      targetFeasibility: processGenerated.targetFeasibility,
      rows: processRows,
    },
    activityStepDrilldown: {
      parentTitle: text(firstProcessValues.title),
      recommendation: activityRecommendation,
      rowCount: activityRows.length,
      scheduleTrustGate: activityGenerated.scheduleTrustGate,
      targetFeasibility: activityGenerated.targetFeasibility,
      rows: activityRows,
    },
    projectTreeAfterOneExpansion: {
      persistedRowCount: masterPlan.summary.scheduleRowCount + processRows.length,
      withinNormalExecutionPlanRange: false,
      interpretation: 'one governed expansion only; complete execution plan accumulates through additional selected-row expansions',
    },
    audit,
    productionEvidence: {
      realDatabaseUsed: false,
      credentialsUsed: false,
      taskWriteAttempted: false,
      dependencyWriteAttempted: false,
      runtimePublicationAttempted: false,
      productionOrLiveOutcomeProven: false,
    },
  }

  await fs.mkdir(args.outputRoot, { recursive: true })
  const jsonPath = path.join(args.outputRoot, 'result.json')
  const markdownPath = path.join(args.outputRoot, 'plan.md')
  await Promise.all([
    fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    fs.writeFile(markdownPath, buildMarkdown(report), 'utf8'),
  ])
  console.log(JSON.stringify({
    status: report.status,
    masterPlanRows: report.masterPlan.scheduleRowCount,
    processRows: report.processDrilldown.rowCount,
    activityRows: report.activityStepDrilldown.rowCount,
    projectRowsAfterOneExpansion: report.projectTreeAfterOneExpansion.persistedRowCount,
    outputs: {
      json: path.relative(REPO_ROOT, jsonPath).replaceAll('\\', '/'),
      markdown: path.relative(REPO_ROOT, markdownPath).replaceAll('\\', '/'),
    },
    mutationBoundary: report.mutationBoundary,
  }, null, 2))
  if (report.status !== 'pass') process.exitCode = 1
}

if (isDirectEntrypoint()) {
  if (!isTsxRuntime() && process.env[TSX_BOOTSTRAP_ENV] !== '1') runViaTsxAndExit()
  await main()
}
