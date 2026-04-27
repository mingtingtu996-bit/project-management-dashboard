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
    throw new Error('缺少 DB_PASSWORD，无法执行补数脚本')
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

function toIsoDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function monthPeriodToSnapshotDate(period) {
  if (!period) return null
  const normalized = String(period).trim()
  if (!/^\d{4}-\d{2}$/.test(normalized)) return null
  return `${normalized}-01`
}

function calculateLeafTaskWeight(task) {
  const startDate = task.planned_start_date || task.start_date
  const endDate = task.planned_end_date || task.end_date

  if (!startDate || !endDate) return 1

  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1

  return Math.max(1, Math.ceil((end - start) / 86400000))
}

function calculateWeightedProgress(tasks) {
  if (tasks.length === 0) return null

  let totalWeightedProgress = 0
  let totalWeight = 0

  for (const task of tasks) {
    const weight = calculateLeafTaskWeight(task)
    const progress = Number(task.progress ?? 0)
    totalWeightedProgress += progress * weight
    totalWeight += weight
  }

  if (totalWeight === 0) return null
  return Math.round(totalWeightedProgress / totalWeight)
}

async function loadHealthHistoryRows(client) {
  const { rows } = await client.query(
    `
      SELECT project_id, period, health_score, health_status
      FROM project_health_history
      ORDER BY project_id ASC, period ASC
    `,
  )
  return rows
}

async function loadTaskSnapshotRows(client) {
  const { rows } = await client.query(
    `
      SELECT DISTINCT ON (s.task_id, s.snapshot_date)
        t.project_id,
        s.snapshot_date,
        s.progress,
        t.planned_start_date,
        t.planned_end_date,
        t.start_date,
        t.end_date
      FROM task_progress_snapshots s
      INNER JOIN tasks t ON t.id = s.task_id
      WHERE t.project_id IS NOT NULL
        AND s.snapshot_date IS NOT NULL
      ORDER BY s.task_id ASC, s.snapshot_date ASC, s.created_at DESC
    `,
  )
  return rows
}

function buildSnapshotMap() {
  return new Map()
}

function mergeSnapshotRow(map, key, patch) {
  const current = map.get(key) || {
    project_id: patch.project_id,
    snapshot_date: patch.snapshot_date,
    health_score: null,
    health_status: null,
    overall_progress: null,
    task_progress: null,
    delay_days: null,
    delay_count: null,
    active_risk_count: null,
    pending_condition_count: null,
    active_obstacle_count: null,
    active_delay_requests: null,
    monthly_close_status: null,
    attention_required: null,
    highest_warning_level: null,
    shifted_milestone_count: null,
    critical_path_affected_tasks: null,
  }

  const next = { ...current, ...patch }
  map.set(key, next)
  return next
}

function toProjectDateKey(projectId, snapshotDate) {
  return `${projectId}::${snapshotDate}`
}

function upsertSnapshotSql() {
  return `
    INSERT INTO public.project_daily_snapshot (
      project_id,
      snapshot_date,
      health_score,
      health_status,
      overall_progress,
      task_progress,
      delay_days,
      delay_count,
      active_risk_count,
      pending_condition_count,
      active_obstacle_count,
      active_delay_requests,
      monthly_close_status,
      attention_required,
      highest_warning_level,
      shifted_milestone_count,
      critical_path_affected_tasks,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
    )
    ON CONFLICT (project_id, snapshot_date) DO UPDATE SET
      health_score = EXCLUDED.health_score,
      health_status = EXCLUDED.health_status,
      overall_progress = EXCLUDED.overall_progress,
      task_progress = EXCLUDED.task_progress,
      delay_days = EXCLUDED.delay_days,
      delay_count = EXCLUDED.delay_count,
      active_risk_count = EXCLUDED.active_risk_count,
      pending_condition_count = EXCLUDED.pending_condition_count,
      active_obstacle_count = EXCLUDED.active_obstacle_count,
      active_delay_requests = EXCLUDED.active_delay_requests,
      monthly_close_status = EXCLUDED.monthly_close_status,
      attention_required = EXCLUDED.attention_required,
      highest_warning_level = EXCLUDED.highest_warning_level,
      shifted_milestone_count = EXCLUDED.shifted_milestone_count,
      critical_path_affected_tasks = EXCLUDED.critical_path_affected_tasks,
      updated_at = NOW()
  `
}

async function upsertRows(client, rows) {
  let recorded = 0
  let failed = 0

  for (const row of rows) {
    try {
      await client.query(upsertSnapshotSql(), [
        row.project_id,
        row.snapshot_date,
        row.health_score,
        row.health_status,
        row.overall_progress,
        row.task_progress,
        row.delay_days,
        row.delay_count,
        row.active_risk_count,
        row.pending_condition_count,
        row.active_obstacle_count,
        row.active_delay_requests,
        row.monthly_close_status,
        row.attention_required,
        row.highest_warning_level,
        row.shifted_milestone_count,
        row.critical_path_affected_tasks,
      ])
      recorded += 1
    } catch (error) {
      failed += 1
      console.error('写入 project_daily_snapshot 失败:', {
        projectId: row.project_id,
        snapshotDate: row.snapshot_date,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { recorded, failed }
}

async function run() {
  const client = getClient()
  await client.connect()

  try {
    console.log('开始补数 project_daily_snapshot...')

    const [healthHistoryRows, taskSnapshotRows] = await Promise.all([
      loadHealthHistoryRows(client),
      loadTaskSnapshotRows(client),
    ])

    const rowsByKey = buildSnapshotMap()

    for (const row of healthHistoryRows) {
      const snapshotDate = monthPeriodToSnapshotDate(row.period)
      if (!snapshotDate) continue

      const projectId = String(row.project_id ?? '').trim()
      if (!projectId) continue

      mergeSnapshotRow(rowsByKey, toProjectDateKey(projectId, snapshotDate), {
        project_id: projectId,
        snapshot_date: snapshotDate,
        health_score: row.health_score ?? null,
        health_status: row.health_status ?? null,
      })
    }

    const taskGroups = new Map()
    for (const row of taskSnapshotRows) {
      const projectId = String(row.project_id ?? '').trim()
      const snapshotDate = toIsoDate(row.snapshot_date)
      if (!projectId || !snapshotDate) continue

      const key = toProjectDateKey(projectId, snapshotDate)
      const group = taskGroups.get(key) || []
      group.push(row)
      taskGroups.set(key, group)
    }

    for (const [key, group] of taskGroups.entries()) {
      const [projectId, snapshotDate] = key.split('::')
      const overallProgress = calculateWeightedProgress(group)
      mergeSnapshotRow(rowsByKey, key, {
        project_id: projectId,
        snapshot_date: snapshotDate,
        overall_progress: overallProgress,
        task_progress: overallProgress,
        delay_days: null,
        delay_count: null,
        active_risk_count: null,
        pending_condition_count: null,
        active_obstacle_count: null,
        active_delay_requests: null,
        monthly_close_status: null,
        attention_required: null,
        highest_warning_level: null,
        shifted_milestone_count: null,
        critical_path_affected_tasks: null,
      })
    }

    const rows = Array.from(rowsByKey.values())
    const { recorded, failed } = await upsertRows(client, rows)

    console.log(`补数完成: recorded=${recorded}, failed=${failed}, total=${rows.length}`)

    if (failed > 0) {
      process.exitCode = 1
    }
  } finally {
    await client.end()
  }
}

run().catch((error) => {
  console.error('补数脚本执行失败:', error instanceof Error ? error.message : error)
  process.exit(1)
})
