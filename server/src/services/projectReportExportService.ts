import * as XLSX from '@e965/xlsx'

import { query as rawQuery } from '../database.js'
import { getProjectExecutionSummary, type ProjectExecutionSummary } from './projectExecutionSummaryService.js'
import { getProgressDeviationAnalysisOrThrow } from './progressDeviationService.js'
import type {
  ProgressDeviationAnalysisResponse,
  ProgressDeviationCauseChainItem,
  ProgressDeviationMainline,
  ProgressDeviationRow,
} from '../types/planning.js'
import { renderPdfBuffer } from './pdfRenderPool.js'

export type ReportExportFormat = 'pdf' | 'xlsx'
export type ReportExportView = 'progress' | 'progress_deviation' | 'risk'

export type ProjectReportExportResult = {
  buffer: Buffer
  contentType: string
  fileName: string
}

type BaselineExportRow = {
  id: string
  version?: number | string | null
  title?: string | null
  status?: string | null
  confirmed_at?: string | null
  updated_at?: string | null
  created_at?: string | null
}

type ExportDataset = {
  projectId: string
  generatedAt: string
  summary: ProjectExecutionSummary
  period?: string | null
  view?: ReportExportView
  baseline?: BaselineExportRow | null
  deviation?: ProgressDeviationAnalysisResponse | null
}

const CONTENT_TYPES: Record<ReportExportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

const VIEW_LABELS: Record<ReportExportView, string> = {
  progress: '进度总览',
  progress_deviation: '偏差分析',
  risk: '风险与问题',
}

const OWNER_MONTHLY_LABEL = '业主月报'

export function normalizeReportExportFormat(value: unknown): ReportExportFormat {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'pdf' || normalized === 'xlsx') return normalized
  throw new Error(`unsupported report export format: ${normalized || '<empty>'}`)
}

function normalizeReportExportView(value: unknown): ReportExportView {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'progress' || normalized === 'progress_deviation' || normalized === 'risk') return normalized
  return 'progress'
}

function normalizePeriod(value: unknown, generatedAt = new Date()): string {
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}$/.test(text)) return text
  return generatedAt.toISOString().slice(0, 7)
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 160)
}

function formatDate(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text
}

function formatMetric(value: unknown, suffix = '') {
  if (value === null || value === undefined || value === '') return ''
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    const rounded = Math.round(numeric * 10) / 10
    return `${rounded}${suffix}`
  }
  return `${value}${suffix}`
}

function text(value: unknown, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function aoaSheet(rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = rows[0]?.map((_, colIndex) => {
    const max = rows.reduce((width, row) => Math.max(width, String(row[colIndex] ?? '').length), 8)
    return { wch: Math.min(Math.max(max + 2, 10), 42) }
  })
  return sheet
}

async function loadLatestBaseline(projectId: string): Promise<BaselineExportRow | null> {
  const { rows } = await rawQuery(
    `
      SELECT id, version, title, status, confirmed_at, updated_at, created_at
      FROM public.task_baselines
      WHERE project_id::text = $1
        AND status IN ('confirmed', 'active', 'archived')
      ORDER BY
        CASE WHEN status = 'confirmed' THEN 0 WHEN status = 'active' THEN 1 ELSE 2 END,
        COALESCE(confirmed_at, updated_at, created_at) DESC,
        version DESC
      LIMIT 1
    `,
    [projectId],
  )
  return (rows[0] as BaselineExportRow | undefined) ?? null
}

async function loadDeviationIfAvailable(projectId: string, baseline?: BaselineExportRow | null) {
  if (!baseline?.id) return null
  try {
    return await getProgressDeviationAnalysisOrThrow({
      project_id: projectId,
      baseline_version_id: baseline.id,
      deferDataGapNotification: true,
    })
  } catch {
    return null
  }
}

async function loadDataset(params: {
  projectId: string
  view?: ReportExportView
  period?: string | null
  includeDeviation: boolean
}): Promise<ExportDataset> {
  const generatedAt = new Date().toISOString()
  const summary = await getProjectExecutionSummary(params.projectId)
  const baseline = params.includeDeviation ? await loadLatestBaseline(params.projectId) : null
  const deviation = params.includeDeviation ? await loadDeviationIfAvailable(params.projectId, baseline) : null
  return {
    projectId: params.projectId,
    generatedAt,
    summary,
    period: params.period ?? null,
    view: params.view,
    baseline,
    deviation,
  }
}

function buildOverviewRows(dataset: ExportDataset, title: string) {
  const summary = dataset.summary
  return [
    ['报告', title],
    ['项目', summary.name],
    ['生成时间', dataset.generatedAt],
    ['报告期间', dataset.period ?? '当前'],
    ['项目状态', summary.statusLabel],
    ['计划周期', `${formatDate(summary.plannedStartDate)} ~ ${formatDate(summary.plannedEndDate)}`],
    ['总体进度', formatMetric(summary.overallProgress, '%')],
    ['健康分', formatMetric(summary.businessHealthScore ?? summary.healthStatus)],
    ['延期任务', summary.delayedTaskCount],
    ['延期天数', summary.delayDays],
    ['活跃风险', summary.activeRiskCount],
    ['未闭环问题', summary.activeIssueCount],
    ['待满足条件', summary.pendingConditionCount],
    ['活跃阻碍', summary.activeObstacleCount],
    ['关键路径受影响任务', summary.criticalPathAffectedTasks],
    ['月计划兑现率', formatMetric(summary.monthlyPlanFulfillmentRate, '%')],
    ['当前基线', dataset.baseline?.title ?? (dataset.baseline?.version ? `v${dataset.baseline.version}` : '暂无')],
  ]
}

function buildMilestoneRows(summary: ProjectExecutionSummary) {
  const items = summary.milestoneOverview?.items ?? []
  const rows = items.slice(0, 50).map((item) => [
    item.name,
    item.statusLabel,
    item.progress,
    formatDate(item.targetDate),
    formatDate(item.current_planned_date),
    formatDate(item.actual_date),
  ])
  return [
    ['里程碑', '状态', '进度', '目标日期', '当前计划', '实际日期'],
    ...(rows.length ? rows : [['暂无里程碑数据', '', '', '', '', '']]),
  ]
}

function getDeviationRows(deviation?: ProgressDeviationAnalysisResponse | null) {
  return (deviation?.mainlines ?? []).flatMap((mainline) =>
    mainline.rows.map((row) => ({ ...row, mainline_label: mainline.label })),
  )
}

function buildDeviationRows(deviation?: ProgressDeviationAnalysisResponse | null) {
  const rows = getDeviationRows(deviation).slice(0, 100).map((row) => [
    row.mainline_label,
    row.title,
    row.status,
    row.deviation_days,
    row.deviation_rate,
    formatDate(row.actual_date),
    row.reason ?? '',
  ])
  return [
    ['主线', '条目', '状态', '偏差生产日', '偏差率', '实际日期', '原因'],
    ...(rows.length ? rows : [['暂无偏差数据', '', '', '', '', '', '']]),
  ]
}

function buildResponsibilityRows(deviation?: ProgressDeviationAnalysisResponse | null) {
  const rows = (deviation?.responsibility_contribution ?? []).slice(0, 50).map((item) => [
    item.owner,
    item.responsibility_role ?? '',
    item.basis ?? '',
    item.count,
    item.percentage,
    item.impact_days ?? '',
    item.critical_path_weight ?? '',
    item.priority_score ?? '',
    (item.evidence_sources ?? []).join('; '),
  ])
  return [
    ['责任主体', '责任角色', '归责依据', '条目数', '占比', '影响天数', '浮时权重', '优先级分', '证据来源'],
    ...(rows.length ? rows : [['暂无可归责偏差', '', '', '', '', '', '', '', '']]),
  ]
}

function buildCauseChainRows(deviation?: ProgressDeviationAnalysisResponse | null) {
  const chains: Array<ProgressDeviationCauseChainItem & { rowTitle: string; mainlineLabel: string }> = []
  for (const row of getDeviationRows(deviation)) {
    for (const chain of row.attribution?.cause_chain ?? []) {
      chains.push({ ...chain, rowTitle: row.title, mainlineLabel: row.mainline_label })
    }
  }
  const rows = chains.slice(0, 80).map((chain) => [
    chain.mainlineLabel,
    chain.rowTitle,
    chain.cause_type,
    chain.reason,
    chain.impacted_owner,
    chain.accountable_owner,
    chain.responsibility_basis,
    chain.impact_days ?? '',
    chain.confidence ?? '',
    chain.evidence_source,
  ])
  return [
    ['主线', '偏差条目', '原因类型', '原因', '受影响主体', '责任主体', '责任依据', '影响天数', '置信度', '证据来源'],
    ...(rows.length ? rows : [['暂无原因链', '', '', '', '', '', '', '', '', '']]),
  ]
}

function buildRiskRows(summary: ProjectExecutionSummary) {
  return [
    ['指标', '数值'],
    ['活跃风险', summary.activeRiskCount],
    ['未闭环问题', summary.activeIssueCount],
    ['待满足条件', summary.pendingConditionCount],
    ['活跃阻碍', summary.activeObstacleCount],
    ['高风险关键节点', summary.keyNodeSummary?.highRiskCount ?? ''],
    ['阻塞关键节点', summary.keyNodeSummary?.blockedCount ?? ''],
  ]
}

function appendSheet(workbook: XLSX.WorkBook, name: string, rows: unknown[][]) {
  XLSX.utils.book_append_sheet(workbook, aoaSheet(rows), name.slice(0, 31))
}

function buildWorkbook(dataset: ExportDataset, title: string, mode: 'view' | 'owner_monthly') {
  const workbook = XLSX.utils.book_new()
  appendSheet(workbook, mode === 'owner_monthly' ? '业主月报概览' : '报表概览', buildOverviewRows(dataset, title))
  appendSheet(workbook, '偏差与归责', buildResponsibilityRows(dataset.deviation))
  appendSheet(workbook, '偏差明细', buildDeviationRows(dataset.deviation))
  appendSheet(workbook, '原因链证据', buildCauseChainRows(dataset.deviation))
  appendSheet(workbook, '关键节点', buildMilestoneRows(dataset.summary))
  appendSheet(workbook, '风险问题', buildRiskRows(dataset.summary))
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

function kpiCards(dataset: ExportDataset) {
  const summary = dataset.summary
  return [
    ['总体进度', formatMetric(summary.overallProgress, '%')],
    ['健康分', formatMetric(summary.businessHealthScore ?? summary.healthStatus)],
    ['延期任务', formatMetric(summary.delayedTaskCount)],
    ['活跃风险', formatMetric(summary.activeRiskCount)],
    ['待满足条件', formatMetric(summary.pendingConditionCount)],
    ['活跃阻碍', formatMetric(summary.activeObstacleCount)],
  ]
}

function renderTable(headers: string[], rows: unknown[][]) {
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.length > 0
          ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${headers.length}">暂无数据</td></tr>`}
      </tbody>
    </table>
  `
}

function buildDeviationPdfRows(deviation?: ProgressDeviationAnalysisResponse | null) {
  return getDeviationRows(deviation).slice(0, 12).map((row) => [
    row.mainline_label,
    row.title,
    row.status,
    row.deviation_days,
    row.reason ?? '',
  ])
}

function buildResponsibilityPdfRows(deviation?: ProgressDeviationAnalysisResponse | null) {
  return (deviation?.responsibility_contribution ?? []).slice(0, 12).map((row) => [
    row.owner,
    row.responsibility_role ?? '',
    row.basis ?? '',
    row.impact_days ?? '',
    row.priority_score ?? '',
  ])
}

function buildReportHtml(dataset: ExportDataset, title: string) {
  const summary = dataset.summary
  const topCauses = dataset.deviation?.top_deviation_causes ?? []
  return `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #0f172a;
            background: #f8fafc;
            font-family: "Microsoft YaHei", "Noto Sans SC", "SimHei", Arial, sans-serif;
            font-size: 12px;
          }
          .page {
            width: 100%;
            min-height: 100vh;
            padding: 28px;
            background: #ffffff;
          }
          .eyebrow { color: #2563eb; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
          h1 { margin: 6px 0 8px; font-size: 24px; line-height: 1.25; }
          h2 { margin: 22px 0 10px; font-size: 15px; }
          .muted { color: #64748b; line-height: 1.7; }
          .meta { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; color: #475569; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 18px; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
          .card-label { color: #64748b; font-size: 11px; }
          .card-value { margin-top: 5px; font-size: 18px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
          th, td { border: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; vertical-align: top; word-break: break-word; }
          th { background: #eff6ff; color: #1e3a8a; font-weight: 700; }
          .summary-band { margin-top: 18px; border-left: 4px solid #2563eb; padding: 10px 12px; background: #eff6ff; line-height: 1.7; }
          .footer { margin-top: 24px; color: #94a3b8; font-size: 10px; }
        </style>
      </head>
      <body>
        <main class="page">
          <div class="eyebrow">WORKBUDDY REPORT</div>
          <h1>${escapeHtml(title)}</h1>
          <div class="muted">项目：${escapeHtml(summary.name)} ｜ 状态：${escapeHtml(summary.statusLabel)} ｜ 生成时间：${escapeHtml(dataset.generatedAt)}</div>
          <div class="meta">
            <span>计划周期：${escapeHtml(formatDate(summary.plannedStartDate))} ~ ${escapeHtml(formatDate(summary.plannedEndDate))}</span>
            <span>报告期间：${escapeHtml(dataset.period ?? '当前')}</span>
            <span>基线：${escapeHtml(dataset.baseline?.title ?? (dataset.baseline?.version ? `v${dataset.baseline.version}` : '暂无'))}</span>
          </div>
          <section class="grid">
            ${kpiCards(dataset).map(([label, value]) => `
              <div class="card">
                <div class="card-label">${escapeHtml(label)}</div>
                <div class="card-value">${escapeHtml(value)}</div>
              </div>
            `).join('')}
          </section>
          <div class="summary-band">
            当前总体进度 ${escapeHtml(formatMetric(summary.overallProgress, '%'))}，延期任务 ${escapeHtml(summary.delayedTaskCount)} 个，
            活跃风险 ${escapeHtml(summary.activeRiskCount)} 个，待满足条件 ${escapeHtml(summary.pendingConditionCount)} 个。
          </div>
          <h2>偏差归因与责任建议</h2>
          ${renderTable(['责任主体', '角色', '归责依据', '影响天数', '优先级'], buildResponsibilityPdfRows(dataset.deviation))}
          <h2>主要偏差原因</h2>
          ${renderTable(['原因', '条目数', '影响天数', '置信度'], topCauses.slice(0, 8).map((row) => [row.reason, row.count, row.impact_days ?? '', row.confidence ?? '']))}
          <h2>偏差明细</h2>
          ${renderTable(['主线', '条目', '状态', '偏差生产日', '原因'], buildDeviationPdfRows(dataset.deviation))}
          <h2>风险与交付阻塞</h2>
          ${renderTable(['指标', '数值'], buildRiskRows(summary).slice(1))}
          <div class="footer">本报告由 WorkBuddy 后端根据项目摘要、快照、偏差分析和责任贡献链生成。</div>
        </main>
      </body>
    </html>
  `
}

async function buildExport(dataset: ExportDataset, title: string, format: ReportExportFormat, mode: 'view' | 'owner_monthly') {
  const timestamp = dataset.generatedAt.replace(/[:.]/g, '-')
  const name = sanitizeFileName(`${dataset.summary.name}-${title}-${dataset.period ?? timestamp}`)
  const fileName = `${name}.${format}`
  const buffer = format === 'xlsx'
    ? buildWorkbook(dataset, title, mode)
    : await renderPdfBuffer(buildReportHtml(dataset, title))
  return {
    buffer,
    contentType: CONTENT_TYPES[format],
    fileName,
  }
}

export async function buildProjectReportExport(params: {
  projectId: string
  format: ReportExportFormat | string
  view?: ReportExportView | string | null
}): Promise<ProjectReportExportResult> {
  const format = normalizeReportExportFormat(params.format)
  const view = normalizeReportExportView(params.view)
  const dataset = await loadDataset({
    projectId: params.projectId,
    view,
    includeDeviation: view === 'progress_deviation',
  })
  return buildExport(dataset, VIEW_LABELS[view], format, 'view')
}

export async function buildOwnerMonthlyReportExport(params: {
  projectId: string
  format: ReportExportFormat | string
  period?: string | null
}): Promise<ProjectReportExportResult> {
  const format = normalizeReportExportFormat(params.format)
  const generatedAt = new Date()
  const period = normalizePeriod(params.period, generatedAt)
  const dataset = await loadDataset({
    projectId: params.projectId,
    period,
    includeDeviation: true,
  })
  return buildExport(dataset, OWNER_MONTHLY_LABEL, format, 'owner_monthly')
}
