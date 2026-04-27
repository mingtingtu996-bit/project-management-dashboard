import dotenv from 'dotenv'
import pg from 'pg'

const { Client } = pg

dotenv.config()

function getDatabaseHost() {
  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('缺少 SUPABASE_URL，无法推导数据库主机地址')
  }

  const hostname = new URL(supabaseUrl).hostname
  return hostname.startsWith('db.') ? hostname : `db.${hostname}`
}

function getClient() {
  if (!process.env.DB_PASSWORD) {
    throw new Error('缺少 DB_PASSWORD，无法执行对账脚本')
  }

  return new Client({
    host: getDatabaseHost(),
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })
}

function usage() {
  console.log(`Usage:
  node scripts/reconcile-health-history-window.mjs [--periods YYYY-MM,YYYY-MM]

Options:
  --periods   Comma-separated month periods to reconcile. Defaults to the current
              and previous month.
  -h, --help  Show this message.
`)
}

function parsePeriodKey(value) {
  const period = String(value || '').trim()
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`无效的月份标识: ${value}`)
  }
  return period
}

function getOptionValue(argv, flag) {
  const inline = argv.find((arg) => arg.startsWith(`${flag}=`))
  if (inline) {
    return inline.slice(flag.length + 1)
  }

  const index = argv.indexOf(flag)
  if (index === -1) {
    return null
  }

  const next = argv[index + 1]
  if (!next || next.startsWith('-')) {
    return null
  }

  return next
}

function getDefaultPeriods() {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`
  return [lastMonth, thisMonth]
}

function periodToSnapshotDate(period) {
  return `${period}-01`
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function average(values) {
  const numbers = values.filter((value) => typeof value === 'number')
  if (numbers.length === 0) {
    return null
  }

  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length)
}

function normalizeStatus(value) {
  if (value === null || value === undefined) {
    return null
  }

  const text = String(value).trim()
  return text.length > 0 ? text : null
}

function buildPeriodSummary(rows) {
  const statusCounts = new Map()
  const scores = []

  for (const row of rows) {
    const status = normalizeStatus(row.healthStatus) ?? 'NULL'
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1)

    const score = toNumber(row.healthScore)
    if (typeof score === 'number') {
      scores.push(score)
    }
  }

  return {
    rowCount: rows.length,
    averageHealthScore: average(scores),
    statusCounts,
  }
}

function serializeStatusCounts(statusCounts) {
  return [...statusCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}:${count}`)
    .join(', ')
}

async function loadRows(client, periods, snapshotDates) {
  const { rows: healthHistoryRows } = await client.query(
    `
      SELECT
        project_id AS "projectId",
        period,
        health_score AS "healthScore",
        health_status AS "healthStatus"
      FROM project_health_history
      WHERE period = ANY($1::text[])
      ORDER BY period ASC, project_id ASC
    `,
    [periods],
  )

  const { rows: dailySnapshotRows } = await client.query(
    `
      SELECT
        project_id AS "projectId",
        to_char(snapshot_date, 'YYYY-MM') AS period,
        snapshot_date AS "snapshotDate",
        health_score AS "healthScore",
        health_status AS "healthStatus"
      FROM project_daily_snapshot
      WHERE snapshot_date = ANY($1::date[])
      ORDER BY snapshot_date ASC, project_id ASC
    `,
    [snapshotDates],
  )

  return { healthHistoryRows, dailySnapshotRows }
}

function buildKey(period, projectId) {
  return `${period}::${projectId}`
}

function summarizeByPeriod(rows) {
  const grouped = new Map()

  for (const row of rows) {
    const current = grouped.get(row.period) ?? []
    current.push(row)
    grouped.set(row.period, current)
  }

  return grouped
}

function collectRowMap(rows) {
  const map = new Map()
  const duplicates = []

  for (const row of rows) {
    const key = buildKey(row.period, String(row.projectId))
    if (map.has(key)) {
      duplicates.push(row)
    }
    map.set(key, row)
  }

  return { map, duplicates }
}

function comparePeriodRows(period, oldRows, newRows) {
  const oldSummary = buildPeriodSummary(oldRows)
  const newSummary = buildPeriodSummary(newRows)

  const { map: oldMap, duplicates: oldDuplicates } = collectRowMap(oldRows)
  const { map: newMap, duplicates: newDuplicates } = collectRowMap(newRows)
  const keys = new Set([...oldMap.keys(), ...newMap.keys()])

  const rowDiffs = []
  let scoreMismatchCount = 0
  let statusMismatchCount = 0
  let missingInNewCount = 0
  let missingInOldCount = 0

  for (const key of keys) {
    const oldRow = oldMap.get(key) ?? null
    const newRow = newMap.get(key) ?? null

    if (!oldRow && newRow) {
      missingInOldCount += 1
      rowDiffs.push({
        period,
        projectId: newRow.projectId,
        issue: 'missing_in_old',
        oldScore: null,
        newScore: newRow.healthScore ?? null,
        oldStatus: null,
        newStatus: newRow.healthStatus ?? null,
      })
      continue
    }

    if (oldRow && !newRow) {
      missingInNewCount += 1
      rowDiffs.push({
        period,
        projectId: oldRow.projectId,
        issue: 'missing_in_new',
        oldScore: oldRow.healthScore ?? null,
        newScore: null,
        oldStatus: oldRow.healthStatus ?? null,
        newStatus: null,
      })
      continue
    }

    if (!oldRow || !newRow) {
      continue
    }

    const oldScore = toNumber(oldRow.healthScore)
    const newScore = toNumber(newRow.healthScore)
    const oldStatus = normalizeStatus(oldRow.healthStatus)
    const newStatus = normalizeStatus(newRow.healthStatus)

    if (oldScore !== newScore) {
      scoreMismatchCount += 1
    }

    if (oldStatus !== newStatus) {
      statusMismatchCount += 1
    }

    if (oldScore !== newScore || oldStatus !== newStatus) {
      rowDiffs.push({
        period,
        projectId: oldRow.projectId,
        issue: 'mismatch',
        oldScore,
        newScore,
        oldStatus,
        newStatus,
      })
    }
  }

  return {
    period,
    oldSummary,
    newSummary,
    oldRows,
    newRows,
    rowDiffs,
    scoreMismatchCount,
    statusMismatchCount,
    missingInNewCount,
    missingInOldCount,
    oldDuplicates: oldDuplicates.length,
    newDuplicates: newDuplicates.length,
  }
}

async function run() {
  const argv = process.argv.slice(2)

  if (argv.includes('-h') || argv.includes('--help')) {
    usage()
    return
  }

  const periodsInput = getOptionValue(argv, '--periods')
  const periods = (periodsInput ? periodsInput.split(',') : getDefaultPeriods())
    .map((period) => parsePeriodKey(period))
    .filter((period, index, array) => array.indexOf(period) === index)
    .sort((left, right) => left.localeCompare(right))

  const snapshotDates = periods.map(periodToSnapshotDate)

  const client = getClient()
  await client.connect()

  try {
    const { healthHistoryRows, dailySnapshotRows } = await loadRows(client, periods, snapshotDates)
    const oldByPeriod = summarizeByPeriod(healthHistoryRows)
    const newByPeriod = summarizeByPeriod(dailySnapshotRows)

    const results = periods.map((period) =>
      comparePeriodRows(
        period,
        oldByPeriod.get(period) ?? [],
        newByPeriod.get(period) ?? [],
      ))

    console.log('health-history reconciliation summary')
    console.table(results.map((result) => ({
      period: result.period,
      oldRows: result.oldSummary.rowCount,
      newRows: result.newSummary.rowCount,
      oldAvg: result.oldSummary.averageHealthScore ?? 'null',
      newAvg: result.newSummary.averageHealthScore ?? 'null',
      scoreMismatch: result.scoreMismatchCount,
      statusMismatch: result.statusMismatchCount,
      missingInNew: result.missingInNewCount,
      missingInOld: result.missingInOldCount,
      oldDuplicates: result.oldDuplicates,
      newDuplicates: result.newDuplicates,
    })))

    const diffRows = results.flatMap((result) => result.rowDiffs)

    for (const result of results) {
      console.log(`\nPeriod ${result.period}`)
      console.log(`  old status counts: ${serializeStatusCounts(result.oldSummary.statusCounts) || 'none'}`)
      console.log(`  new status counts: ${serializeStatusCounts(result.newSummary.statusCounts) || 'none'}`)
    }

    if (diffRows.length > 0) {
      console.error(`\n发现 ${diffRows.length} 条明细差异，展示前 10 条：`)
      console.table(diffRows.slice(0, 10))
      process.exitCode = 1
      return
    }

    const nonMatchingPeriods = results.filter((result) => (
      result.oldSummary.rowCount === 0 ||
      result.newSummary.rowCount === 0 ||
      result.oldSummary.rowCount !== result.newSummary.rowCount ||
      result.oldSummary.averageHealthScore !== result.newSummary.averageHealthScore ||
      serializeStatusCounts(result.oldSummary.statusCounts) !== serializeStatusCounts(result.newSummary.statusCounts)
    ))

    if (nonMatchingPeriods.length > 0) {
      console.error(`\n发现 ${nonMatchingPeriods.length} 个周期存在聚合差异。`)
      process.exitCode = 1
      return
    }

    console.log('\n对账通过：monthly history 与 project_daily_snapshot 月度基线一致。')
  } finally {
    await client.end()
  }
}

run().catch((error) => {
  console.error('health-history reconciliation failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
