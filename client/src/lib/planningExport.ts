import { neutralizeSpreadsheetFormulaText } from './spreadsheetSecurity'

export type PlanningExportFormat = 'xlsx' | 'csv'
export type PlanningExportCell = string | number | boolean | null | undefined

export function formatPlanningExportValue(value: PlanningExportCell) {
  if (value === true) return '是'
  if (value === false || value == null) return ''
  return neutralizeSpreadsheetFormulaText(String(value).trim())
}

export function sanitizePlanningExportFileName(value: string, fallback = '计划表') {
  return value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || fallback
}

export function toPlanningCsvText(rows: PlanningExportCell[][]) {
  return rows
    .map((row) => row.map((cell) => {
      const value = formatPlanningExportValue(cell)
      return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
    }).join(','))
    .join('\r\n')
}

export function downloadPlanningTextFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function writePlanningTableExport(params: {
  fileNameBase: string
  format: PlanningExportFormat
  rows: PlanningExportCell[][]
  sheetName: string
}) {
  const safeBaseName = sanitizePlanningExportFileName(params.fileNameBase)
  if (params.format === 'xlsx') {
    const XLSX = await import('@e965/xlsx')
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet(
      params.rows.map((row) => row.map((cell) => formatPlanningExportValue(cell))),
    )
    XLSX.utils.book_append_sheet(workbook, worksheet, params.sheetName.slice(0, 31) || '计划表')
    XLSX.writeFile(workbook, `${safeBaseName}.xlsx`)
    return
  }

  downloadPlanningTextFile(`${safeBaseName}.csv`, `\uFEFF${toPlanningCsvText(params.rows)}`, 'text/csv;charset=utf-8')
}
