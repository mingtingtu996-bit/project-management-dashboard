import { refreshOfficialWorkCalendarFromNotice, resolveOfficialHolidayNoticeSourceUrl } from '../services/officialHolidayCalendarService.js'

function readArg(name: string) {
  const prefix = `--${name}=`
  const inline = process.argv.find((item) => item.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

async function main() {
  const year = Number(readArg('year') ?? new Date().getFullYear() + 1)
  if (!Number.isInteger(year)) {
    throw new Error(`Invalid --year value: ${readArg('year')}`)
  }

  const sourceUrl = readArg('source-url') ?? resolveOfficialHolidayNoticeSourceUrl(year)
  if (!sourceUrl) {
    throw new Error(`Missing official holiday notice source URL for ${year}`)
  }

  const result = await refreshOfficialWorkCalendarFromNotice({
    year,
    sourceUrl,
    userId: null,
  })

  console.log(JSON.stringify({
    ok: true,
    seedType: result.seedType,
    seedVersionId: result.seedVersionId,
    seedVersion: result.seedVersion,
    recordCount: result.recordCount,
    totalRecordCount: result.totalRecordCount,
    records: result.records.map((record) => ({
      holidayCode: record.holidayCode,
      startDate: record.startDate,
      endDate: record.endDate,
      adjustedWorkDates: record.adjustedWorkDates,
      productivity: record.productivity,
      calendarKind: record.calendarKind,
      isCompensatoryWorkday: record.isCompensatoryWorkday,
      adjustmentOrigin: record.adjustmentOrigin,
      sourceStandard: record.sourceStandard,
      webVerified: record.webVerified,
    })),
    impactPropagation: result.impactPropagation,
  }, null, 2))
}

main().catch((error) => {
  const err = error as any
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    code: typeof error === 'object' && error && 'code' in error ? (error as { code?: unknown }).code ?? null : null,
    details: err?.details ?? null,
    hint: err?.hint ?? null,
    constraint: err?.constraint ?? null,
  }, null, 2))
  process.exit(1)
})
