import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') })

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error(JSON.stringify({
    ok: false,
    error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in server/.env',
  }, null, 2))
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

function elapsed(started) {
  return Date.now() - started
}

function pickCount(result) {
  return Number.isFinite(result?.count) ? result.count : null
}

async function countRows(table, filter = null) {
  const started = Date.now()
  let query = supabase.from(table).select('id', { count: 'exact', head: true })
  if (filter) query = filter(query)
  const { count, error } = await query
  return {
    ok: !error,
    elapsedMs: elapsed(started),
    count: error ? null : count,
    error: error?.message ?? null,
    code: error?.code ?? null,
  }
}

async function readRows(table, select, options = {}) {
  const started = Date.now()
  let query = supabase.from(table).select(select)
  if (options.filter) query = options.filter(query)
  if (options.order) query = query.order(options.order.column, { ascending: options.order.ascending ?? true })
  if (options.limit) query = query.limit(options.limit)
  const { data, error } = await query
  return {
    ok: !error,
    elapsedMs: elapsed(started),
    rows: Array.isArray(data) ? data : [],
    error: error?.message ?? null,
    code: error?.code ?? null,
  }
}

async function main() {
  const checkedAt = new Date().toISOString()
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]

  const seedTypes = [
    'work_calendar',
    'seasonal_productivity',
    'process_seasonal_sensitivity',
    'regional_climate_rules',
  ]

  const tableCounts = {}
  for (const table of [
    'projects',
    'tasks',
    'algorithm_seed_versions',
    'algorithm_seed_records',
    'project_climate_profiles',
    'project_weather_forecasts',
    'duration_experience_samples',
    'task_duration_forecasts',
  ]) {
    tableCounts[table] = await countRows(table)
  }

  const schemaProbes = {
    algorithm_seed_versions: await readRows('algorithm_seed_versions', 'id, seed_type, seed_version, status, created_at', { limit: 1 }),
    algorithm_seed_records: await readRows('algorithm_seed_records', 'id, seed_type, stable_code, rule_payload', { limit: 1 }),
    project_climate_profiles: await readRows('project_climate_profiles', 'id, project_id, city, thermal_zone, confidence', { limit: 1 }),
    project_weather_forecasts: await readRows('project_weather_forecasts', 'id, project_id, forecast_date, provider', { limit: 1 }),
  }

  const seedCounts = {}
  for (const seedType of seedTypes) {
    seedCounts[seedType] = await countRows('algorithm_seed_records', (query) => query.eq('seed_type', seedType))
  }

  const activeSeedVersions = await readRows(
    'algorithm_seed_versions',
    'id, seed_type, seed_version, status, is_current, created_at',
    {
      filter: (query) => query.in('seed_type', seedTypes),
      order: { column: 'created_at', ascending: false },
      limit: 20,
    },
  )

  const projects = await readRows('projects', 'id, name, location, status, created_at', {
    order: { column: 'created_at', ascending: false },
    limit: 5,
  })
  const selectedProject = projects.rows[0] ?? null

  const climateProfiles = selectedProject
    ? await readRows(
      'project_climate_profiles',
      'id, project_id, province, city, climate_region, thermal_zone, climate_tags, location_consensus_status, confidence, updated_at',
      {
        filter: (query) => query.eq('project_id', selectedProject.id),
        limit: 3,
      },
    )
    : { ok: false, rows: [], error: 'No project available', elapsedMs: 0 }

  const weatherForecasts = selectedProject
    ? await readRows(
      'project_weather_forecasts',
      'id, project_id, forecast_date, provider, source_url, min_temp_c, max_temp_c, precipitation_mm, wind_level, warning_tags, fetched_at',
      {
        filter: (query) => query.eq('project_id', selectedProject.id),
        order: { column: 'forecast_date', ascending: true },
        limit: 5,
      },
    )
    : { ok: false, rows: [], error: 'No project available', elapsedMs: 0 }

  const tasks = selectedProject
    ? await readRows(
      'tasks',
      'id, project_id, title, planned_start_date, planned_end_date, progress, status, standard_work_code, standard_work_name, building_object_id, participant_unit_id',
      {
        filter: (query) => query.eq('project_id', selectedProject.id).not('planned_start_date', 'is', null),
        order: { column: 'planned_start_date', ascending: true },
        limit: 10,
      },
    )
    : { ok: false, rows: [], error: 'No project available', elapsedMs: 0 }
  const selectedTask = tasks.rows.find((task) => task.planned_start_date && task.planned_end_date) ?? tasks.rows[0] ?? null

  let durationContext = null
  let durationContextError = null
  if (selectedTask) {
    try {
      const service = await import('../../server/src/services/durationContextService.ts')
      const started = Date.now()
      const context = await service.buildDurationContext({ taskId: selectedTask.id })
      durationContext = {
        ok: true,
        elapsedMs: elapsed(started),
        contextVersion: context.contextVersion,
        multiplier: context.multiplier,
        extraDays: context.extraDays,
        confidenceDelta: context.confidenceDelta,
        adjustedBy: context.adjustedBy,
        factorCount: context.factors.length,
        factors: context.factors.map((factor) => ({
          key: factor.key,
          actionPolicy: factor.actionPolicy,
          multiplier: factor.multiplier,
          extraDays: factor.extraDays,
          confidenceDelta: factor.confidenceDelta,
          source: factor.source,
          dataDependencies: factor.dataDependencies ?? [],
          metadata: {
            seasonalProductivityRegion: factor.metadata?.seasonalProductivityRegion ?? null,
            climateRegionSource: factor.metadata?.climateRegionSource ?? null,
            monthlyClimateSignal: factor.metadata?.monthlyClimateSignal ?? null,
            impactType: factor.metadata?.impactType ?? null,
            actionBoundary: factor.metadata?.actionBoundary ?? null,
          },
        })),
      }
    } catch (error) {
      durationContextError = error instanceof Error ? error.message : String(error)
    }
  }

  const result = {
    ok: Boolean(tableCounts.projects?.ok && tableCounts.tasks?.ok),
    checkedAt,
    projectRef,
    supabaseUrl,
    mode: 'read_only_live_e2e',
    tableCounts,
    schemaProbes: Object.fromEntries(Object.entries(schemaProbes).map(([key, value]) => [
      key,
      {
        ok: value.ok,
        elapsedMs: value.elapsedMs,
        sampleCount: value.rows.length,
        error: value.error ?? null,
        code: value.code ?? null,
      },
    ])),
    seedCounts,
    activeSeedVersions,
    selectedProject: selectedProject
      ? {
        id: selectedProject.id,
        name: selectedProject.name,
        hasLocation: Boolean(selectedProject.location),
        status: selectedProject.status ?? null,
      }
      : null,
    selectedTask: selectedTask
      ? {
        id: selectedTask.id,
        title: selectedTask.title,
        plannedStartDate: selectedTask.planned_start_date,
        plannedEndDate: selectedTask.planned_end_date,
        status: selectedTask.status,
        progress: selectedTask.progress,
        standardWorkCode: selectedTask.standard_work_code ?? null,
      }
      : null,
    climateProfiles: {
      ok: climateProfiles.ok,
      count: climateProfiles.rows.length,
      rows: climateProfiles.rows,
      error: climateProfiles.error ?? null,
    },
    weatherForecasts: {
      ok: weatherForecasts.ok,
      count: weatherForecasts.rows.length,
      rows: weatherForecasts.rows,
      error: weatherForecasts.error ?? null,
    },
    durationContext: durationContext ?? { ok: false, error: durationContextError ?? 'No task available' },
    verdict: {
      databaseConnected: tableCounts.projects?.ok === true,
      hasProjects: (pickCount(tableCounts.projects) ?? 0) > 0,
      hasTasks: (pickCount(tableCounts.tasks) ?? 0) > 0,
      hasAlgorithmSeedRecords: (pickCount(tableCounts.algorithm_seed_records) ?? 0) > 0,
      hasClimateProfileTable: schemaProbes.project_climate_profiles.ok === true,
      hasWeatherForecastTable: schemaProbes.project_weather_forecasts.ok === true,
      hasSeasonalProductivityDbSeed: (pickCount(seedCounts.seasonal_productivity) ?? 0) > 0,
      hasProcessSeasonalSensitivityDbSeed: (pickCount(seedCounts.process_seasonal_sensitivity) ?? 0) > 0,
      hasRegionalClimateRulesDbSeed: (pickCount(seedCounts.regional_climate_rules) ?? 0) > 0,
      durationContextRanAgainstLiveTask: durationContext?.ok === true,
      durationContextUsedFactors: (durationContext?.factorCount ?? 0) > 0,
    },
  }

  await fs.mkdir(path.resolve(process.cwd(), 'artifacts/reports'), { recursive: true })
  const reportPath = path.resolve(
    process.cwd(),
    'artifacts/reports',
    `v1.4.7.4-7.5-live-algorithm-e2e-${checkedAt.replace(/[:.]/g, '-')}.json`,
  )
  await fs.writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    ...result,
    reportPath,
  }, null, 2))
  process.exit(0)
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exit(1)
})
