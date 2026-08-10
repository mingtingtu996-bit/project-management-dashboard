import pg from 'pg'

const { Client } = pg

const DIAGNOSTIC_SOURCE = 'wizard_baseline_revision_live_probe'
const MAX_DIAGNOSTIC_AGE_MS = 14 * 24 * 60 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
const MAX_CREATION_OFFSET_MS = 30 * 60 * 1000
const PROJECT_DELETE_CLEANUP_TABLES = [
  'task_conditions',
  'task_obstacles',
  'task_timeline_events',
  'notifications',
  'risks',
  'issues',
  'tasks',
]

function requireText(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function parseConnectionIdentity(value) {
  let parsed
  try {
    parsed = new URL(requireText(value, 'diagnostic cleanup database URL'))
  } catch {
    throw new Error('diagnostic cleanup database URL must be a valid URL')
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('diagnostic cleanup database URL must use the postgres protocol')
  }
  if (parsed.hash) {
    throw new Error('diagnostic cleanup database URL must not contain a fragment')
  }
  const queryKeys = [...parsed.searchParams.keys()]
  const unsupportedQueryKey = queryKeys.find((key) => key !== 'sslmode')
  if (unsupportedQueryKey) {
    throw new Error(`diagnostic cleanup database URL query option is not allowed: ${unsupportedQueryKey}`)
  }
  const sslModes = parsed.searchParams.getAll('sslmode')
  if (sslModes.length > 1 || (sslModes.length === 1 && !['require', 'verify-full'].includes(sslModes[0].toLowerCase()))) {
    throw new Error('diagnostic cleanup database URL must use sslmode=require or sslmode=verify-full')
  }

  const hostname = parsed.hostname.toLowerCase()
  const username = decodeURIComponent(parsed.username).trim().toLowerCase()
  const directMatch = hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/)
  if (directMatch && username) {
    return { projectRef: directMatch[1], connectionString: normalizeConnectionString(parsed) }
  }

  if (hostname.endsWith('.pooler.supabase.com') || hostname.endsWith('.pooler.supabase.co')) {
    const separator = username.lastIndexOf('.')
    const projectRef = separator >= 0 ? username.slice(separator + 1).trim() : ''
    const roleName = separator >= 0 ? username.slice(0, separator).trim() : ''
    if (projectRef && roleName && /^[a-z0-9-]+$/.test(projectRef)) {
      return { projectRef, connectionString: normalizeConnectionString(parsed) }
    }
  }

  throw new Error('diagnostic cleanup database URL must use a Supabase direct or pooler project identity')
}

function normalizeConnectionString(parsed) {
  const normalized = new URL(parsed.toString())
  normalized.searchParams.delete('sslmode')
  return normalized.toString()
}

function validateCleanupConnection(input) {
  const expectedProjectRef = requireText(input.expectedProjectRef, 'expected project ref').toLowerCase()
  if (!/^[a-z0-9]{20}$/.test(expectedProjectRef)) {
    throw new Error('expected project ref must be a 20-character Supabase project ref')
  }

  const connectionIdentity = parseConnectionIdentity(input.connectionString)
  if (connectionIdentity.projectRef !== expectedProjectRef) {
    throw new Error('diagnostic cleanup database project ref does not match the expected project ref')
  }

  const tlsCaCertificate = String(input.tlsCaCertificate ?? '').trim()
  return {
    connectionString: connectionIdentity.connectionString,
    expectedProjectRef,
    tlsCaCertificate: tlsCaCertificate || null,
  }
}

function strictTlsOptions(tlsCaCertificate) {
  return tlsCaCertificate
    ? { rejectUnauthorized: true, ca: tlsCaCertificate }
    : { rejectUnauthorized: true }
}

function parseMetadata(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function validateInput(input) {
  const cleanupConnection = validateCleanupConnection(input)
  const { expectedProjectRef } = cleanupConnection

  const projectId = requireText(input.projectId, 'project id')
  const companyId = requireText(input.companyId, 'company id')
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(projectId) || !uuidPattern.test(companyId)) {
    throw new Error('diagnostic cleanup project and company ids must be UUIDs')
  }

  const targetEnvironment = requireText(input.targetEnvironment, 'target environment')
  if (!['staging', 'production'].includes(targetEnvironment)) {
    throw new Error('diagnostic cleanup target environment must be staging or production')
  }

  const diagnosticRunId = requireText(input.diagnosticRunId, 'diagnostic run id')
  const runMatch = diagnosticRunId.match(/^(staging|production)-baseline-(\d{13})$/)
  if (!runMatch || runMatch[1] !== targetEnvironment) {
    throw new Error('diagnostic cleanup run id does not match the target environment')
  }

  const projectName = requireText(input.projectName, 'diagnostic project name')
  if (projectName !== `Disposable Residential Baseline ${diagnosticRunId}`) {
    throw new Error('diagnostic cleanup project name does not match the run id')
  }

  const releaseSha = requireText(input.releaseSha, 'diagnostic cleanup release SHA').toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new Error('diagnostic cleanup release SHA must be a 40-character Git SHA')
  }
  const diagnosticReleaseSha = String(input.diagnosticReleaseSha ?? releaseSha).trim().toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(diagnosticReleaseSha)) {
    throw new Error('diagnostic project release SHA must be a 40-character Git SHA')
  }

  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now())
  const nowMs = now.getTime()
  const runTimestampMs = Number(runMatch[2])
  if (!Number.isFinite(nowMs)) throw new Error('diagnostic cleanup now must be a valid timestamp')
  if (runTimestampMs > nowMs + MAX_FUTURE_SKEW_MS || nowMs - runTimestampMs > MAX_DIAGNOSTIC_AGE_MS) {
    throw new Error('diagnostic cleanup run is outside the allowed cleanup window')
  }

  return {
    ...cleanupConnection,
    projectId,
    companyId,
    targetEnvironment,
    diagnosticRunId,
    projectName,
    releaseSha,
    diagnosticReleaseSha,
    actorUsername: String(input.actorUsername ?? '').trim() || null,
    runTimestampMs,
  }
}

function assertPersistedDiagnosticIdentity(project, input) {
  const metadata = parseMetadata(project?.metadata)
  const persistedReleaseSha = String(metadata.diagnosticReleaseSha ?? '').trim().toLowerCase()
  const createdAtMs = new Date(String(project?.created_at ?? '')).getTime()
  const createdNearRun = Number.isFinite(createdAtMs)
    && createdAtMs >= input.runTimestampMs - MAX_FUTURE_SKEW_MS
    && createdAtMs <= input.runTimestampMs + MAX_CREATION_OFFSET_MS
  const matches = String(project?.id ?? '').trim() === input.projectId
    && String(project?.company_id ?? '').trim() === input.companyId
    && String(project?.name ?? '').trim() === input.projectName
    && String(metadata.diagnosticRunId ?? '').trim() === input.diagnosticRunId
    && String(metadata.diagnosticSource ?? '').trim() === DIAGNOSTIC_SOURCE
    && String(metadata.diagnosticProjectName ?? '').trim() === input.projectName
    && (!persistedReleaseSha || persistedReleaseSha === input.diagnosticReleaseSha)
    && createdNearRun
  if (!matches) {
    throw new Error('persisted diagnostic project identity does not match the cleanup request')
  }
}

export async function verifyWizardDiagnosticCleanupConnection(input, dependencies = {}) {
  const validated = validateCleanupConnection(input)
  const createClient = dependencies.createClient
    ?? ((config) => new Client(config))
  const client = createClient({
    connectionString: validated.connectionString,
    ssl: strictTlsOptions(validated.tlsCaCertificate),
    application_name: 'workbuddy_wizard_diagnostic_cleanup_preflight',
  })

  try {
    await client.connect()
    await client.query('SELECT 1 AS cleanup_connection_ready')
    return {
      status: 'pass',
      databaseProjectRefVerified: true,
    }
  } finally {
    await client.end()
  }
}

export async function cleanupWizardDiagnosticProject(input, dependencies = {}) {
  const validated = validateInput(input)
  const createClient = dependencies.createClient
    ?? ((config) => new Client(config))
  const client = createClient({
    connectionString: validated.connectionString,
    ssl: strictTlsOptions(validated.tlsCaCertificate),
    application_name: 'workbuddy_wizard_diagnostic_cleanup',
  })
  let transactionStarted = false
  let transactionCommitted = false

  try {
    await client.connect()
    await client.query('BEGIN')
    transactionStarted = true
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
      'workbuddy:wizard-diagnostic-cleanup',
      validated.projectId,
    ])
    const projectResult = await client.query(
      `SELECT id, company_id, name, metadata, created_at
         FROM public.projects
        WHERE id = $1
        FOR UPDATE`,
      [validated.projectId],
    )
    const project = projectResult.rows[0] ?? null
    if (!project) {
      await client.query('COMMIT')
      transactionCommitted = true
      return {
        status: 'pass',
        strategy: 'migration_connection_guarded_diagnostic_cleanup',
        databaseProjectRefVerified: true,
        projectPhysicallyDeleted: true,
        projectUnreadable: true,
        entityAlreadyAbsent: true,
      }
    }

    assertPersistedDiagnosticIdentity(project, validated)
    for (const table of PROJECT_DELETE_CLEANUP_TABLES) {
      await client.query(`DELETE FROM public.${table} WHERE project_id = $1`, [validated.projectId])
    }
    const deleted = await client.query(
      'DELETE FROM public.projects WHERE id = $1 AND company_id = $2 RETURNING id',
      [validated.projectId, validated.companyId],
    )
    if (deleted.rowCount !== 1 || String(deleted.rows[0]?.id ?? '') !== validated.projectId) {
      throw new Error('diagnostic cleanup project delete did not affect the exact guarded project')
    }

    await client.query(
      `INSERT INTO public.operation_logs
        (user_id, username, project_id, action, resource_type, resource_id,
         method, path, status_code, detail, created_at)
       VALUES ($1, $2, $3, 'project:diagnostic_cleanup', 'project', $3,
               'DELETE', $4, 200, $5::jsonb, NOW())`,
      [
        null,
        validated.actorUsername,
        validated.projectId,
        `/diagnostics/wizard-baseline-revision/${validated.diagnosticRunId}/cleanup`,
        JSON.stringify({
          companyId: validated.companyId,
          diagnosticRunId: validated.diagnosticRunId,
          diagnosticSource: DIAGNOSTIC_SOURCE,
          targetEnvironment: validated.targetEnvironment,
          releaseSha: validated.releaseSha,
          diagnosticReleaseSha: validated.diagnosticReleaseSha,
          cleanupPolicy: 'guarded_migration_connection_same_transaction',
        }),
      ],
    )
    await client.query('COMMIT')
    transactionCommitted = true

    const readback = await client.query('SELECT id FROM public.projects WHERE id = $1', [validated.projectId])
    if (readback.rowCount !== 0 || readback.rows.length !== 0) {
      throw new Error('diagnostic cleanup project remained readable after commit')
    }

    return {
      status: 'pass',
      strategy: 'migration_connection_guarded_diagnostic_cleanup',
      databaseProjectRefVerified: true,
      projectPhysicallyDeleted: true,
      projectUnreadable: true,
      entityAlreadyAbsent: false,
    }
  } catch (error) {
    if (transactionStarted && !transactionCommitted) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Preserve the original cleanup failure.
      }
    }
    throw error
  } finally {
    await client.end()
  }
}
