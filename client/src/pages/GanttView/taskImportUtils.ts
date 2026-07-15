import type { PlanningTreeClipboardRow } from '@/components/planning/PlanningTreeView'

type ImportColumnKey =
  | 'title'
  | 'wbsCode'
  | 'depth'
  | 'start'
  | 'end'
  | 'progress'
  | 'assignee'
  | 'unit'
  | 'scope'
  | 'milestone'

const HEADER_ALIASES: Record<ImportColumnKey, string[]> = {
  title: ['title', 'name', 'taskname', 'task', '任务名称', '任务', '工作内容', '工序名称', '名称'],
  wbsCode: ['wbscode', 'wbs编码', 'wbs编号', '编码', '编号', 'code'],
  depth: ['depth', 'level', '层级', '级别', 'wbs层级'],
  start: ['start', 'startdate', 'plannedstart', 'plannedstartdate', '开始', '开始日期', '计划开始', '计划开始日期'],
  end: ['end', 'enddate', 'plannedend', 'plannedenddate', '结束', '结束日期', '计划结束', '计划完成', '计划完成日期'],
  progress: ['progress', 'targetprogress', '进度', '目标进度', '完成率'],
  assignee: ['assignee', 'owner', '负责人', '责任人', '执行人'],
  unit: ['unit', 'responsibleunit', '责任单位', '责任主体', '施工单位', '参建单位'],
  scope: ['scope', 'object', '工程对象', '施工范围', '楼栋', '楼层', '区段'],
  milestone: ['milestone', 'is milestone', '里程碑', '是否里程碑'],
}

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_:\-\/（）()【】\[\]]+/g, '')
}

function findColumn(headers: unknown[], key: ImportColumnKey) {
  const normalizedAliases = new Set(HEADER_ALIASES[key].map(normalizeHeader))
  return headers.findIndex((header) => normalizedAliases.has(normalizeHeader(header)))
}

function readCell(row: unknown[], columnIndex: number) {
  if (columnIndex < 0) return ''
  return String(row[columnIndex] ?? '').trim()
}

function parseProgress(value: string): number | null {
  if (!value) return null
  const numeric = Number(value.replace('%', '').trim())
  if (!Number.isFinite(numeric)) return null
  if (numeric > 0 && numeric <= 1 && !value.includes('%')) return Math.round(numeric * 100)
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function parseDepth(value: string, wbsCode: string) {
  const explicit = Number(value)
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.min(10, Math.round(explicit)))
  const segments = wbsCode.split(/[.\-]/).map((segment) => segment.trim()).filter(Boolean)
  return Math.max(1, Math.min(10, segments.length || 1))
}

function formatDateParts(year: number, month: number, day: number) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return ''
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function normalizeImportedDate(value: string) {
  const text = value.trim()
  if (!text) return ''

  const isoMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(text)
  if (isoMatch) {
    return formatDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
  }

  const shortMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text)
  if (shortMatch) {
    const rawYear = Number(shortMatch[3])
    const year = rawYear < 100 ? 2000 + rawYear : rawYear
    return formatDateParts(year, Number(shortMatch[1]), Number(shortMatch[2])) || text
  }

  return text
}

function parseMilestone(value: string, title: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return /里程碑|milestone/i.test(title)
  return ['1', 'true', 'yes', 'y', '是', '里程碑'].includes(normalized)
}

function findHeaderRow(rows: unknown[][]) {
  const maxScan = Math.min(rows.length, 10)
  for (let index = 0; index < maxScan; index += 1) {
    if (findColumn(rows[index] ?? [], 'title') >= 0) return index
  }
  return 0
}

export async function parseTaskImportFile(file: File): Promise<PlanningTreeClipboardRow[]> {
  const XLSX = await import('@e965/xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : null
  if (!sheet) return []

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd',
    defval: '',
    blankrows: false,
  }) as unknown[][]
  if (rows.length === 0) return []

  const headerRowIndex = findHeaderRow(rows)
  const headers = rows[headerRowIndex] ?? []
  const titleColumn = findColumn(headers, 'title')
  const columnByKey: Record<ImportColumnKey, number> = {
    title: titleColumn >= 0 ? titleColumn : 0,
    wbsCode: findColumn(headers, 'wbsCode'),
    depth: findColumn(headers, 'depth'),
    start: findColumn(headers, 'start'),
    end: findColumn(headers, 'end'),
    progress: findColumn(headers, 'progress'),
    assignee: findColumn(headers, 'assignee'),
    unit: findColumn(headers, 'unit'),
    scope: findColumn(headers, 'scope'),
    milestone: findColumn(headers, 'milestone'),
  }

  return rows
    .slice(headerRowIndex + 1)
    .map((row): PlanningTreeClipboardRow | null => {
      const title = readCell(row, columnByKey.title)
      if (!title) return null
      const wbsCode = readCell(row, columnByKey.wbsCode)
      const progress = parseProgress(readCell(row, columnByKey.progress))
      return {
        title,
        plannedStartDate: normalizeImportedDate(readCell(row, columnByKey.start)) || null,
        plannedEndDate: normalizeImportedDate(readCell(row, columnByKey.end)) || null,
        targetProgress: progress,
        assigneeLabel: readCell(row, columnByKey.assignee) || null,
        unitLabel: readCell(row, columnByKey.unit) || null,
        scopeLabel: readCell(row, columnByKey.scope) || null,
        depth: parseDepth(readCell(row, columnByKey.depth), wbsCode),
        isMilestone: parseMilestone(readCell(row, columnByKey.milestone), title),
      }
    })
    .filter((row): row is PlanningTreeClipboardRow => Boolean(row))
}
